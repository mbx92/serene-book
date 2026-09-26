import { eq, and } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { hashJobToken, issueJobLink } from '../utils/job-link.js'
import { ensure } from '../utils/errors.js'
import { permit, assertLocation, OWNER_ROLES, userIdentity } from '../utils/auth.js'
import { findOrder } from '../repositories/order.repository.js'
import { transitionOrder, audit } from './order.service.js'
import { ACTIONS } from '#shared/constants/index.js'
import { treatmentTiming } from '../repositories/treatment.repository.js'

async function lookup(token, connection = db) {
  ensure(/^[a-f0-9]{64}$/.test(token || ''), 404, 'Tautan job tidak ditemukan')
  const [row] = await connection.select({ link: s.therapistJobLinks, assignment: s.orderAssignments }).from(s.therapistJobLinks).innerJoin(s.orderAssignments, eq(s.orderAssignments.id, s.therapistJobLinks.assignmentId)).where(eq(s.therapistJobLinks.tokenHash, hashJobToken(token)))
  ensure(row, 404, 'Tautan job tidak ditemukan atau sudah diganti')
  return row
}
function stateOf(link, assignment, order) {
  if (link.accessExpiresAt <= new Date()) return 'UNAVAILABLE'
  if (assignment.responseStatus === 'REJECTED') return 'REJECTED'
  if (assignment.responseStatus === 'EXPIRED' || (assignment.responseStatus === 'PENDING' && link.offerExpiresAt <= new Date())) return 'EXPIRED'
  if (!assignment.isActive || order.orderStatus.startsWith('CANCELLED')) return 'UNAVAILABLE'
  return assignment.responseStatus === 'PENDING' ? 'OFFER' : 'JOB'
}
export async function publicJob(token, connection = db) {
  const { link, assignment } = await lookup(token, connection)
  const [order] = await connection.select().from(s.orders).where(eq(s.orders.id, assignment.orderId))
  let state = stateOf(link, assignment, order)
  const [therapist] = await connection.select({ name: s.users.name, isActive: s.therapists.isActive, userActive: s.users.isActive }).from(s.therapists).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(eq(s.therapists.id, assignment.therapistId))
  if (!therapist?.isActive || !therapist.userActive) state = 'UNAVAILABLE'
  if (['UNAVAILABLE', 'EXPIRED', 'REJECTED'].includes(state)) return { state }
  const [location] = await connection.select({ name: s.locations.name, phone: s.locations.phone }).from(s.locations).where(eq(s.locations.id, order.locationId))
  const items = await connection.select({ name: s.orderItems.serviceNameSnapshot, durationMinutes: s.orderItems.durationMinutes, qty: s.orderItems.qty }).from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
  const result = { state, therapistName: therapist.name, orderNumber: order.orderNumber, orderStatus: order.orderStatus, bookingDate: order.bookingDate, bookingTime: order.bookingTime.slice(0, 5), timezone: order.timezone, area: location?.name, officePhone: location?.phone, items, durationMinutes: items.reduce((n, i) => n + i.durationMinutes * i.qty, 0), offerExpiresAt: link.offerExpiresAt, accessExpiresAt: link.accessExpiresAt }
  if (state === 'JOB') {
    const [customer] = await connection.select({ name: s.customers.name, phone: s.customers.phone }).from(s.customers).where(eq(s.customers.id, order.customerId))
    Object.assign(result, { customerName: customer.name, customerPhone: customer.phone, address: order.addressSnapshot, latitude: order.latitude, longitude: order.longitude, notes: order.notes, treatment: await treatmentTiming(connection, order.id, items) })
  }
  return result
}
export async function renewJobLink(id, user, baseUrl, minutes) {
  permit(user, [...OWNER_ROLES, 'LOCATION_ADMIN'])
  return db.transaction(async tx => {
    const order = await findOrder(id, user, tx, true); assertLocation(user, order.locationId)
    ensure(['ASSIGNED_THERAPIST', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].includes(order.orderStatus), 409, 'Job tidak dapat dibuatkan tautan pada status ini')
    const [assignment] = await tx.select().from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, id), eq(s.orderAssignments.isActive, true)))
    ensure(assignment, 409, 'Therapist belum ditetapkan')
    const link = await issueJobLink(tx, order, assignment, user, baseUrl, minutes)
    await audit(tx, user, 'JOB_LINK_RENEWED', 'orders', id, { assignmentId: assignment.id })
    return link
  })
}
export async function respondToJob(token, input) {
  const initial = await lookup(token)
  return db.transaction(async tx => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, initial.assignment.orderId)).for('update')
    // Re-read after the order lock: regeneration/reassignment must invalidate old links atomically.
    const { link, assignment } = await lookup(token, tx)
    const state = stateOf(link, assignment, order)
    ensure(['OFFER', 'JOB'].includes(state), 409, state === 'EXPIRED' ? 'Penawaran sudah kedaluwarsa' : 'Tautan job sudah tidak berlaku')
    const [therapist] = await tx.select().from(s.therapists).where(eq(s.therapists.id, assignment.therapistId)).for('update')
    const user = await userIdentity(therapist.userId)
    ensure(user?.role === 'THERAPIST', 403, 'Therapist tidak aktif')
    const target = ACTIONS[input.action]?.[1]
    // A retried POST must not add a second timeline entry or repeat a transition.
    if (target && order.orderStatus === target && assignment.responseStatus === 'ACCEPTED') return await publicJob(token, tx)
    await transitionOrder(order.id, input.action, user, input.action === 'reject' ? input.notes : 'Konfirmasi melalui tautan WhatsApp', tx, assignment.id)
    return await publicJob(token, tx)
  })
}
