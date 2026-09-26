import { eq, and, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { customerScope } from '../repositories/master.repository.js'
import { findOrder } from '../repositories/order.repository.js'
import { OWNER_ROLES, OFFICE_ROLES, ADMIN_ROLES, permit, assertLocation } from '../utils/auth.js'
import { ensure, fail } from '../utils/errors.js'
import { ACTIONS, TERMINAL } from '#shared/constants/index.js'
import { slot, withinSchedule } from '#shared/utils/booking.js'
import { issueJobLink } from '../utils/job-link.js'
import { billingPolicy } from './billing-settings.service.js'
import { syncRevenueShare } from './revenue-sharing.service.js'
import { treatmentTiming } from '../repositories/treatment.repository.js'
export async function audit(tx, user, action, entity, entityId, data = {}) { await tx.insert(s.auditLogs).values({ userId: user?.id, action, entity, entityId, data }) }
export async function notify(tx, userIds, type, title, message, orderId) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length) await tx.insert(s.notifications).values(ids.map(userId => ({ userId, type, title, message, data: { orderId } })))
}
async function officeRecipients(tx, locationId) {
  const rows = await tx.select({ userId: s.userRoles.userId, role: s.roles.code, locationId: s.userRoles.locationId }).from(s.userRoles).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
  return rows.filter(r => OFFICE_ROLES.includes(r.role) || (r.role === 'LOCATION_ADMIN' && r.locationId === locationId)).map(r => r.userId)
}
export async function changeStatus(tx, order, toStatus, user, notes = '') {
  await tx.update(s.orders).set({ orderStatus: toStatus, updatedAt: new Date(), updatedBy: user.id }).where(eq(s.orders.id, order.id))
  await tx.insert(s.orderStatusLogs).values({ orderId: order.id, fromStatus: order.orderStatus, toStatus, changedBy: user.id, notes, createdAt: new Date() })
  await audit(tx, user, toStatus, 'orders', order.id, { from: order.orderStatus, notes })
}
export async function priceItems(tx, body) {
  const items = []
  for (const requested of body.services) {
    const [service] = await tx.select().from(s.services).where(and(eq(s.services.id, requested.serviceId), eq(s.services.isActive, true)))
    ensure(service, 400, 'Layanan tidak ditemukan atau tidak aktif')
    const prices = await tx.select().from(s.servicePrices).where(and(eq(s.servicePrices.serviceId, service.id), eq(s.servicePrices.isActive, true)))
    const price = prices.find(p => p.locationId === body.locationId) || prices.find(p => p.locationId === null)
    ensure(price && price.currency === 'IDR', 400, 'Harga IDR belum tersedia untuk layanan/lokasi ini')
    items.push({ serviceId: service.id, serviceNameSnapshot: service.name, durationMinutes: service.durationMinutes, price: price.price, qty: requested.qty, subtotal: (Number(price.price) * requested.qty).toFixed(2) })
  }
  return items
}
async function orderValues(tx, body, user) {
  if (user.role === 'LOCATION_ADMIN') { body = { ...body, locationId: body.locationId || user.locationId || user.locationIds[0] }; assertLocation(user, body.locationId) }
  const [customer] = await tx.select().from(s.customers).where(and(eq(s.customers.id, body.customerId), user.role === 'LOCATION_ADMIN' ? customerScope(user) : undefined)); ensure(customer, 400, 'Customer tidak ditemukan')
  let location = null
  if (body.locationId) { [location] = await tx.select().from(s.locations).where(and(eq(s.locations.id, body.locationId), eq(s.locations.isActive, true))); ensure(location, 400, 'Lokasi tidak aktif atau tidak ditemukan') }
  if (body.customerAddressId) { const [address] = await tx.select().from(s.customerAddresses).where(and(eq(s.customerAddresses.id, body.customerAddressId), eq(s.customerAddresses.customerId, body.customerId))); ensure(address, 400, 'Alamat bukan milik customer') }
  const items = await priceItems(tx, body)
  const subtotal = items.reduce((sum, i) => sum + Math.round(Number(i.subtotal) * 100), 0)
  const billing = await billingPolicy(tx)
  const transportFee = billing.transportEnabled ? body.transportFee : 0
  const tax = billing.taxEnabled ? body.tax : 0
  const total = subtotal - Math.round(body.discount * 100) + Math.round(transportFee * 100) + Math.round(tax * 100)
  ensure(total >= 0 && body.discount * 100 <= subtotal, 400, 'Diskon tidak boleh melebihi subtotal')
  const timezone = location?.timezone || 'Asia/Makassar'
  const duration = items.reduce((n,i) => n + i.durationMinutes * i.qty, 0)
  ensure(duration > 0 && duration <= 1440, 400, 'Durasi order maksimal 24 jam')
  const timing = slot(body.bookingDate, body.bookingTime, duration, timezone)
  return { items, values: { customerId: body.customerId, customerAddressId: body.customerAddressId || null, locationId: body.locationId, bookingDate: body.bookingDate, bookingTime: body.bookingTime, bookingStartsAt: timing.start, bookingEndsAt: timing.end, timezone, addressSnapshot: body.address, latitude: body.latitude ?? null, longitude: body.longitude ?? null, subtotal: (subtotal / 100).toFixed(2), discount: body.discount.toFixed(2), transportFee: transportFee.toFixed(2), tax: tax.toFixed(2), total: (total / 100).toFixed(2), source: body.source, notes: body.notes, updatedBy: user.id, updatedAt: new Date() } }
}
export async function createOrder(body, user, connection = db) {
  permit(user, ADMIN_ROLES)
  return connection.transaction(async tx => {
    const { items, values } = await orderValues(tx, body, user)
    // Sequence allocation is atomic; gaps after rolled-back transactions are intentional.
    const result = await tx.execute(sql`select nextval('order_number_seq') as number`)
    const orderNumber = `ORD-${body.bookingDate.replaceAll('-', '')}-${String(result.rows[0].number).padStart(4, '0')}`
    const [order] = await tx.insert(s.orders).values({ ...values, orderNumber, createdBy: user.id }).returning()
    await tx.insert(s.orderItems).values(items.map(item => ({ ...item, orderId: order.id })))
    await tx.insert(s.orderStatusLogs).values({ orderId: order.id, toStatus: 'NEW', changedBy: user.id, notes: 'Order dibuat' })
    await audit(tx, user, 'ORDER_CREATED', 'orders', order.id)
    await notify(tx, await officeRecipients(tx, order.locationId), 'NEW_ORDER', 'Order baru', `${orderNumber} membutuhkan konfirmasi.`, order.id)
    return order
  })
}
export async function editOrder(id, body, user) {
  permit(user, ADMIN_ROLES)
  return db.transaction(async tx => {
    const order = await findOrder(id, user, tx, true)
    ensure(['NEW', 'CONFIRMED'].includes(order.orderStatus), 409, 'Order hanya dapat diedit sebelum dispatch')
    const [share] = await tx.select().from(s.orderRevenueShares).where(eq(s.orderRevenueShares.orderId, id))
    ensure(!share, 409, 'Order tidak dapat diedit setelah pembayaran atau pembagian pendapatan tercatat')
    const { items, values } = await orderValues(tx, body, user)
    await tx.update(s.orders).set(values).where(eq(s.orders.id, id))
    await tx.delete(s.orderItems).where(eq(s.orderItems.orderId, id))
    await tx.insert(s.orderItems).values(items.map(i => ({ ...i, orderId: id })))
    await audit(tx, user, 'ORDER_UPDATED', 'orders', id)
    return { id }
  })
}
export async function assignLocation(id, locationId, user) {
  permit(user, ADMIN_ROLES)
  return db.transaction(async tx => {
    const order = await findOrder(id, user, tx, true)
    ensure(['CONFIRMED', 'ASSIGNED_LOCATION', 'NO_THERAPIST_AVAILABLE', 'THERAPIST_REJECTED'].includes(order.orderStatus), 409, 'Konfirmasi order sebelum menetapkan lokasi')
    assertLocation(user, locationId)
    const [location] = await tx.select().from(s.locations).where(and(eq(s.locations.id, locationId), eq(s.locations.isActive, true)))
    ensure(location, 400, 'Lokasi tidak tersedia')
    const duration = (order.bookingEndsAt - order.bookingStartsAt) / 60000
    const timing = slot(order.bookingDate, order.bookingTime.slice(0,5), duration, location.timezone)
    await tx.update(s.orders).set({ locationId, timezone: location.timezone, bookingStartsAt: timing.start, bookingEndsAt: timing.end }).where(eq(s.orders.id, id))
    await syncRevenueShare(tx, { ...order, locationId }, 'RECIPIENT_UPDATED', null, user)
    await changeStatus(tx, order, 'ASSIGNED_LOCATION', user, `Diberikan ke ${location.name}`)
    await notify(tx, await officeRecipients(tx, locationId), 'ORDER_ASSIGNED', 'Order untuk lokasi Anda', `${order.orderNumber} diberikan ke ${location.name}.`, id)
    return { id }
  })
}
export async function availability(tx, therapistId, order, excludeOrderId = null) {
  const [therapist] = await tx.select({ therapist: s.therapists, userActive: s.users.isActive }).from(s.therapists).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(eq(s.therapists.id, therapistId))
  if (!therapist?.therapist.isActive || !therapist.userActive) return { available: false, reason: 'Therapist tidak aktif' }
  const [membership] = await tx.select().from(s.therapistLocations).where(and(eq(s.therapistLocations.therapistId, therapistId), eq(s.therapistLocations.locationId, order.locationId)))
  if (!membership) return { available: false, reason: 'Bukan therapist lokasi ini' }
  const [schedule] = await tx.select().from(s.therapistSchedules).where(and(eq(s.therapistSchedules.therapistId, therapistId), eq(s.therapistSchedules.scheduleDate, order.bookingDate), eq(s.therapistSchedules.locationId, order.locationId)))
  if (!schedule || !withinSchedule(order, schedule, order.timezone)) return { available: false, reason: schedule?.status === 'OFF' ? 'Libur' : schedule?.status === 'LEAVE' ? 'Cuti' : 'Di luar jadwal kerja' }
  const conflicts = await tx.select({ id: s.orders.id }).from(s.orderAssignments).innerJoin(s.orders, eq(s.orders.id, s.orderAssignments.orderId)).where(and(eq(s.orderAssignments.therapistId, therapistId), eq(s.orderAssignments.isActive, true), notInArray(s.orders.orderStatus, [...TERMINAL, 'COMPLETED', 'PAID']), sql`not (${s.orderAssignments.responseStatus} = 'PENDING' and exists (select 1 from ${s.therapistJobLinks} where ${s.therapistJobLinks.assignmentId} = ${s.orderAssignments.id} and ${s.therapistJobLinks.offerExpiresAt} <= now()))`, sql`${s.orders.bookingStartsAt} < ${order.bookingEndsAt}`, sql`${s.orders.bookingEndsAt} > ${order.bookingStartsAt}`, excludeOrderId ? sql`${s.orders.id} != ${excludeOrderId}` : undefined))
  return { available: !conflicts.length, reason: conflicts.length ? 'Bentrok dengan booking lain' : 'Tersedia' }
}
export async function assignTherapist(id, therapistId, user, baseUrl) {
  permit(user, [...OWNER_ROLES, 'LOCATION_ADMIN'])
  return db.transaction(async tx => {
    const order = await findOrder(id, user, tx, true); assertLocation(user, order.locationId)
    ensure(['ASSIGNED_LOCATION', 'ASSIGNED_THERAPIST', 'THERAPIST_REJECTED', 'NO_THERAPIST_AVAILABLE', 'ACCEPTED'].includes(order.orderStatus), 409, 'Order tidak dapat diberi therapist pada status ini')
    // Serialize all assignments to this therapist across concurrent requests.
    const [therapist] = await tx.select().from(s.therapists).where(eq(s.therapists.id, therapistId)).for('update')
    ensure(therapist, 404, 'Therapist tidak ditemukan')
    const result = await availability(tx, therapistId, order, id); ensure(result.available, 409, result.reason)
    const previous = await tx.select().from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.isActive, true)))
    await tx.update(s.orderAssignments).set({ isActive: false, responseStatus: 'REASSIGNED', updatedAt: new Date() }).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.isActive, true)))
    const [assignment] = await tx.insert(s.orderAssignments).values({ orderId: id, therapistId, assignedBy: user.id }).returning()
    const jobLink = baseUrl ? await issueJobLink(tx, order, assignment, user, baseUrl) : null
    await changeStatus(tx, order, 'ASSIGNED_THERAPIST', user, previous.length ? 'Therapist ditetapkan ulang' : 'Therapist ditetapkan')
    await notify(tx, [therapist.userId], 'THERAPIST_ASSIGNED', 'Job baru untuk Anda', `${order.orderNumber} • ${order.bookingDate} ${order.bookingTime.slice(0,5)}`, id)
    if (previous.length) {
      const old = await tx.select({ userId: s.therapists.userId }).from(s.therapists).where(inArray(s.therapists.id, previous.map(a => a.therapistId)))
      await notify(tx, old.map(t => t.userId), 'THERAPIST_REASSIGNED', 'Penugasan dialihkan', `${order.orderNumber} dialihkan oleh admin.`, id)
    }
    await syncRevenueShare(tx, order, 'RECIPIENT_UPDATED', null, user)
    return { id, jobLink }
  })
}
// Expiry is reconciled on office requests/polling and public POSTs. Public GETs remain read-only.
export async function expireJobOffers() {
  const due = await db.select({ orderId: s.orderAssignments.orderId, assignmentId: s.orderAssignments.id }).from(s.therapistJobLinks).innerJoin(s.orderAssignments, eq(s.orderAssignments.id, s.therapistJobLinks.assignmentId)).where(and(eq(s.orderAssignments.isActive, true), eq(s.orderAssignments.responseStatus, 'PENDING'), sql`${s.therapistJobLinks.offerExpiresAt} <= now()`))
  for (const candidate of due) await db.transaction(async tx => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, candidate.orderId)).for('update')
    const [current] = await tx.select({ assignment: s.orderAssignments, link: s.therapistJobLinks }).from(s.orderAssignments).innerJoin(s.therapistJobLinks, eq(s.therapistJobLinks.assignmentId, s.orderAssignments.id)).where(eq(s.orderAssignments.id, candidate.assignmentId))
    if (!order || order.orderStatus !== 'ASSIGNED_THERAPIST' || !current?.assignment.isActive || current.assignment.responseStatus !== 'PENDING' || current.link.offerExpiresAt > new Date()) return
    await tx.update(s.orderAssignments).set({ isActive: false, responseStatus: 'EXPIRED', updatedAt: new Date() }).where(eq(s.orderAssignments.id, candidate.assignmentId))
    await syncRevenueShare(tx, order, 'RECIPIENT_UPDATED', null, null)
    await changeStatus(tx, order, 'NO_THERAPIST_AVAILABLE', { id: null }, 'Penawaran WhatsApp kedaluwarsa; tawarkan kepada therapist berikutnya')
    await notify(tx, await officeRecipients(tx, order.locationId), 'JOB_OFFER_EXPIRED', 'Penawaran job kedaluwarsa', order.orderNumber, order.id)
  })
}
export async function transitionOrder(id, action, user, notes = '', connection = db, expectedAssignmentId = null) {
  const therapistActions = ['accept', 'reject', 'on-the-way', 'arrived', 'start', 'complete']
  permit(user, therapistActions.includes(action) ? ['THERAPIST'] : ADMIN_ROLES)
  if (action === 'confirm') permit(user, ADMIN_ROLES)
  return connection.transaction(async tx => {
    const order = await findOrder(id, user, tx, true)
    if (action === 'cancel') {
      ensure(![...TERMINAL, 'COMPLETED', 'PAID'].includes(order.orderStatus), 409, 'Order tidak dapat dibatalkan')
      const [paid] = await tx.select().from(s.payments).where(and(eq(s.payments.orderId, id), eq(s.payments.status, 'SUCCESS')))
      ensure(!paid, 409, 'Kembalikan pembayaran terlebih dahulu sebelum membatalkan order')
      await changeStatus(tx, order, 'CANCELLED_BY_ADMIN', user, notes)
      await syncRevenueShare(tx, { ...order, orderStatus: 'CANCELLED_BY_ADMIN' }, 'CANCELLED', `cancel:${id}`, user)
      const current = await tx.select({ userId: s.therapists.userId }).from(s.orderAssignments).innerJoin(s.therapists, eq(s.therapists.id, s.orderAssignments.therapistId)).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.isActive, true)))
      await tx.update(s.orderAssignments).set({ isActive: false, responseStatus: 'CANCELLED', updatedAt: new Date() }).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.isActive, true)))
      await notify(tx, [...await officeRecipients(tx, order.locationId), ...current.map(t => t.userId)], 'ORDER_CANCELLED', 'Order dibatalkan', `${order.orderNumber}: ${notes}`, id)
      return { id }
    }
    if (therapistActions.includes(action)) {
      const [assignment] = await tx.select().from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.therapistId, user.therapistId), eq(s.orderAssignments.isActive, true)))
      ensure(assignment, 403, 'Job ini tidak ditugaskan kepada Anda')
      if (expectedAssignmentId) ensure(assignment.id === expectedAssignmentId, 409, 'Penawaran sudah dialihkan')
      if (action === 'accept') {
        const [link] = await tx.select().from(s.therapistJobLinks).where(eq(s.therapistJobLinks.assignmentId, assignment.id))
        ensure(!link || link.offerExpiresAt > new Date(), 409, 'Penawaran sudah kedaluwarsa')
        await tx.select().from(s.therapists).where(eq(s.therapists.id, assignment.therapistId)).for('update')
        const result = await availability(tx, assignment.therapistId, order, id)
        ensure(result.available, 409, result.reason)
      }
      if (action === 'reject') {
        ensure(order.orderStatus === 'ASSIGNED_THERAPIST', 409, 'Job hanya dapat ditolak sebelum diterima')
        await tx.update(s.orderAssignments).set({ isActive: false, responseStatus: 'REJECTED', respondedAt: new Date(), rejectedAt: new Date(), rejectionReason: notes, updatedAt: new Date() }).where(eq(s.orderAssignments.id, assignment.id))
        await syncRevenueShare(tx, order, 'RECIPIENT_UPDATED', null, user)
        await changeStatus(tx, order, 'THERAPIST_REJECTED', user, notes)
        await notify(tx, await officeRecipients(tx, order.locationId), 'THERAPIST_REJECTED', 'Therapist menolak job', `${order.orderNumber}: ${notes}`, id)
        return { id }
      }
      if (action === 'accept') await tx.update(s.orderAssignments).set({ responseStatus: 'ACCEPTED', respondedAt: new Date(), acceptedAt: new Date(), updatedAt: new Date() }).where(eq(s.orderAssignments.id, assignment.id))
    }
    const pair = ACTIONS[action]; ensure(pair && order.orderStatus === pair[0], 409, 'Perubahan status tidak sesuai urutan workflow')
    if (action === 'complete') {
      const timing = await treatmentTiming(tx, order.id)
      ensure(timing.startedAt, 409, 'Waktu mulai treatment belum tercatat. Hubungi admin.')
      ensure(timing.canComplete, 409, `Durasi treatment belum selesai. Sisa ${Math.ceil(timing.remainingSeconds / 60)} menit.`)
    }
    await changeStatus(tx, order, pair[1], user, notes)
    if (action === 'complete') await syncRevenueShare(tx, { ...order, orderStatus: 'COMPLETED' }, 'ORDER_COMPLETED', `complete:${id}`, user)
    if (action === 'complete' && (Number(order.total) === 0 || order.paymentStatus === 'PAID')) {
      await tx.update(s.orders).set({ paymentStatus: 'PAID' }).where(eq(s.orders.id, id))
      await changeStatus(tx, { ...order, orderStatus: 'COMPLETED' }, 'PAID', user, 'Tagihan order sudah lunas')
    }
    if (action === 'accept' || action === 'complete') await notify(tx, await officeRecipients(tx, order.locationId), action === 'accept' ? 'THERAPIST_ACCEPTED' : 'ORDER_COMPLETED', action === 'accept' ? 'Job diterima' : 'Treatment selesai', order.orderNumber, id)
    return { id }
  })
}
export async function recordPayment(body, user) {
  permit(user, OWNER_ROLES)
  return db.transaction(async tx => {
    const order = await findOrder(body.orderId, user, tx, true)
    ensure(![...TERMINAL, 'PAID'].includes(order.orderStatus), 409, 'Pembayaran tidak dapat dicatat untuk order yang dibatalkan, ditutup, atau sudah lunas')
    const previous = await tx.select().from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, 'SUCCESS')))
    const paid = previous.reduce((sum,p) => sum + Math.round(Number(p.amount) * 100), 0)
    const total = Math.round(Number(order.total) * 100); const amount = Math.round(body.amount * 100)
    ensure(paid + amount <= total, 409, 'Pembayaran melebihi sisa tagihan')
    const [payment] = await tx.insert(s.payments).values({ ...body, amount: body.amount.toFixed(2), paidAt: new Date(), createdBy: user.id }).returning()
    const paymentStatus = paid + amount === total ? 'PAID' : 'PARTIAL'
    await tx.update(s.orders).set({ paymentStatus, updatedBy: user.id, updatedAt: new Date() }).where(eq(s.orders.id, order.id))
    await syncRevenueShare(tx, order, 'PAYMENT_RECEIVED', `payment:${payment.id}`, user)
    if (paymentStatus === 'PAID' && order.orderStatus === 'COMPLETED') await changeStatus(tx, order, 'PAID', user, 'Tagihan dilunasi')
    await audit(tx, user, 'PAYMENT_RECEIVED', 'payments', payment.id, { orderId: order.id, amount: payment.amount })
    await notify(tx, await officeRecipients(tx, order.locationId), 'PAYMENT_RECEIVED', 'Pembayaran diterima', `${order.orderNumber} • ${payment.amount}`, order.id)
    return payment
  })
}
export async function refundPayment(id, user) {
  permit(user, OWNER_ROLES)
  return db.transaction(async tx => {
    const [lookup] = await tx.select().from(s.payments).where(eq(s.payments.id, id)); ensure(lookup, 404, 'Pembayaran tidak ditemukan')
    const order = await findOrder(lookup.orderId, user, tx, true)
    const [payment] = await tx.select().from(s.payments).where(eq(s.payments.id, id)).for('update')
    ensure(payment.status === 'SUCCESS', 409, 'Pembayaran sudah dikembalikan')
    await tx.update(s.payments).set({ status: 'REFUNDED', updatedAt: new Date() }).where(eq(s.payments.id, id))
    const remaining = await tx.select().from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, 'SUCCESS')))
    await tx.update(s.orders).set({ paymentStatus: remaining.length ? 'PARTIAL' : 'REFUNDED', updatedBy: user.id, updatedAt: new Date() }).where(eq(s.orders.id, order.id))
    if (['PAID', 'CLOSED'].includes(order.orderStatus)) await changeStatus(tx, order, 'COMPLETED', user, 'Pembayaran dikembalikan; tagihan dibuka kembali')
    await syncRevenueShare(tx, { ...order, orderStatus: ['PAID', 'CLOSED'].includes(order.orderStatus) ? 'COMPLETED' : order.orderStatus }, 'PAYMENT_REFUNDED', `refund:${id}`, user)
    await audit(tx, user, 'PAYMENT_REFUNDED', 'payments', id, { amount: payment.amount, orderId: order.id })
    return { id }
  })
}

export async function createOrderCustomer(body, user) {
  permit(user, ADMIN_ROLES)
  return db.transaction(async tx=>{
    const [customer]=await tx.insert(s.customers).values({...body,createdBy:user.id,updatedBy:user.id}).returning()
    await audit(tx,user,'CREATED','customers',customer.id)
    return {id:customer.id,name:customer.name,phone:customer.phone}
  })
}
