import { eq, and, inArray, exists, sql, desc } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { ensure } from '../utils/errors.js'
import { shareDetail } from '../services/revenue-sharing.service.js'
import { treatmentTiming } from './treatment.repository.js'
export function orderScope(user) {
  if (user.role === 'LOCATION_ADMIN') return inArray(s.orders.locationId, user.locationIds)
  if (user.role === 'THERAPIST') return exists(db.select({ id: s.orderAssignments.id }).from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, s.orders.id), eq(s.orderAssignments.therapistId, user.therapistId))))
  return undefined
}
export async function findOrder(id, user, tx = db, lock = false) {
  let query = tx.select().from(s.orders).where(and(eq(s.orders.id, id), orderScope(user)))
  if (lock) query = query.for('update')
  const [order] = await query
  ensure(order, 404, 'Order tidak ditemukan'); return order
}
export async function listOrders(user, filters = {}, tx = db) {
  const conditions = [orderScope(user)]
  if (filters.id) conditions.push(eq(s.orders.id, filters.id))
  if (filters.date) conditions.push(eq(s.orders.bookingDate, filters.date))
  if (filters.from) conditions.push(sql`${s.orders.bookingDate} >= ${filters.from}`)
  if (filters.to) conditions.push(sql`${s.orders.bookingDate} <= ${filters.to}`)
  if (filters.locationId) conditions.push(eq(s.orders.locationId, Number(filters.locationId)))
  if (filters.status) conditions.push(eq(s.orders.orderStatus, filters.status))
  if (filters.paymentStatus) conditions.push(eq(s.orders.paymentStatus, filters.paymentStatus))
  if (filters.source) conditions.push(eq(s.orders.source, filters.source))
  if (filters.customerId) conditions.push(eq(s.orders.customerId, Number(filters.customerId)))
  if (filters.search) conditions.push(sql`(${s.customers.name} ilike ${'%' + filters.search + '%'} or ${s.orders.orderNumber} ilike ${'%' + filters.search + '%'} or ${s.customers.phone} ilike ${'%' + filters.search + '%'})`)
  if (filters.therapistId) conditions.push(exists(tx.select({ id: s.orderAssignments.id }).from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, s.orders.id), eq(s.orderAssignments.therapistId, Number(filters.therapistId)), eq(s.orderAssignments.isActive, true)))))
  if (filters.serviceId) conditions.push(exists(tx.select({ id: s.orderItems.id }).from(s.orderItems).where(and(eq(s.orderItems.orderId, s.orders.id), eq(s.orderItems.serviceId, Number(filters.serviceId))))))
  const rows = await tx.select({ order: s.orders, customerName: s.customers.name, customerPhone: s.customers.phone, locationName: s.locations.name }).from(s.orders).innerJoin(s.customers, eq(s.customers.id, s.orders.customerId)).leftJoin(s.locations, eq(s.locations.id, s.orders.locationId)).where(and(...conditions)).orderBy(desc(s.orders.bookingDate), s.orders.bookingTime)
  if (!rows.length) return []
  const ids = rows.map(r => r.order.id)
  const items = await tx.select().from(s.orderItems).where(inArray(s.orderItems.orderId, ids))
  const assignments = await tx.select({ assignment: s.orderAssignments, therapistName: s.users.name }).from(s.orderAssignments).innerJoin(s.therapists, eq(s.therapists.id, s.orderAssignments.therapistId)).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(and(inArray(s.orderAssignments.orderId, ids), user.role === 'THERAPIST' ? eq(s.orderAssignments.therapistId, user.therapistId) : eq(s.orderAssignments.isActive, true))).orderBy(desc(s.orderAssignments.id))
  return rows.map(({ order, ...info }) => ({ ...order, ...info, items: items.filter(i => i.orderId === order.id), assignment: assignments.find(a => a.assignment.orderId === order.id) ? { ...assignments.find(a => a.assignment.orderId === order.id).assignment, therapistName: assignments.find(a => a.assignment.orderId === order.id).therapistName } : null }))
}
export async function orderDetail(id, user) {
  await findOrder(id, user)
  const [order] = (await listOrders(user, { id }))
  const logs = await db.select({ log: s.orderStatusLogs, actorName: s.users.name }).from(s.orderStatusLogs).leftJoin(s.users, eq(s.users.id, s.orderStatusLogs.changedBy)).where(eq(s.orderStatusLogs.orderId, id)).orderBy(s.orderStatusLogs.id)
  const assignments = await db.select({ assignment: s.orderAssignments, therapistName: s.users.name }).from(s.orderAssignments).innerJoin(s.therapists, eq(s.therapists.id, s.orderAssignments.therapistId)).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(and(eq(s.orderAssignments.orderId, id), user.role === 'THERAPIST' ? eq(s.orderAssignments.therapistId, user.therapistId) : undefined)).orderBy(desc(s.orderAssignments.id))
  const payments = await db.select().from(s.payments).where(eq(s.payments.orderId, id)).orderBy(desc(s.payments.id))
  const [jobOffer] = order.assignment ? await db.select({ assignmentId: s.therapistJobLinks.assignmentId, offerExpiresAt: s.therapistJobLinks.offerExpiresAt, accessExpiresAt: s.therapistJobLinks.accessExpiresAt }).from(s.therapistJobLinks).where(eq(s.therapistJobLinks.assignmentId, order.assignment.id)) : []
  return { ...order, revenueShare: ['OWNER', 'SUPER_ADMIN'].includes(user.role) ? await shareDetail(order) : undefined, treatment: await treatmentTiming(db, id, order.items), jobOffer: jobOffer || null, logs: logs.map(r => ({ ...r.log, actorName: r.actorName })), remainingAmount: Math.max(0,Number(order.total)-payments.filter(p=>p.status==='SUCCESS').reduce((n,p)=>n+Number(p.amount),0)).toFixed(2), assignments: assignments.map(r => ({ ...r.assignment, therapistName: r.therapistName })), payments: user.role === 'LOCATION_ADMIN' ? [] : payments }
}
