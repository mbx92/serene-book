import { eq, and, inArray, exists, desc, sql } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { orderScope, listOrders } from './order.repository.js'
import { permit, ADMIN_ROLES, OWNER_ROLES } from '../utils/auth.js'
import { ensure } from '../utils/errors.js'
export function customerScope(user) {
  if (user.role === 'LOCATION_ADMIN') return sql`((${s.customers.createdBy} = ${user.id} and not exists (select 1 from ${s.orders} where ${s.orders.customerId} = ${s.customers.id})) or exists (select 1 from ${s.orders} where ${s.orders.customerId} = ${s.customers.id} and ${inArray(s.orders.locationId,user.locationIds)}))`
}
export function therapistScope(user) {
  if (user.role === 'LOCATION_ADMIN') return exists(db.select({ id: s.therapistLocations.id }).from(s.therapistLocations).where(and(eq(s.therapistLocations.therapistId, s.therapists.id), inArray(s.therapistLocations.locationId, user.locationIds))))
  if (user.role === 'THERAPIST') return eq(s.therapists.id, user.therapistId)
}
export async function listMaster(resource, user, query = {}) {
  if (resource !== 'therapists' && resource !== 'schedules' && resource !== 'services') permit(user, ADMIN_ROLES)
  if (resource === 'users') {
    permit(user, OWNER_ROLES)
    return db.select({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, isActive: s.users.isActive, role: s.roles.code, locationId: s.userRoles.locationId, createdAt: s.users.createdAt }).from(s.users).innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).orderBy(s.users.name)
  }
  if (resource === 'customers') return db.select().from(s.customers).where(customerScope(user)).orderBy(desc(s.customers.id))
  if (resource === 'locations') return db.select().from(s.locations).where(user.role === 'LOCATION_ADMIN' ? inArray(s.locations.id, user.locationIds) : undefined).orderBy(s.locations.name)
  if (resource === 'services') {
    const services = await db.select().from(s.services).orderBy(s.services.name)
    const prices = await db.select().from(s.servicePrices).where(user.role === 'LOCATION_ADMIN' ? sql`${s.servicePrices.locationId} is null or ${inArray(s.servicePrices.locationId, user.locationIds)}` : undefined)
    return services.map(service => ({ ...service, prices: prices.filter(p => p.serviceId === service.id), price: prices.find(p => p.serviceId === service.id && p.locationId === null)?.price || '0' }))
  }
  if (resource === 'therapists') {
    const rows = await db.select({ therapist: s.therapists, name: s.users.name, email: s.users.email, phone: s.users.phone, userActive: s.users.isActive }).from(s.therapists).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(therapistScope(user)).orderBy(s.users.name)
    const memberships = await db.select({ membership: s.therapistLocations, name: s.locations.name }).from(s.therapistLocations).innerJoin(s.locations, eq(s.locations.id, s.therapistLocations.locationId)).where(user.role === 'LOCATION_ADMIN' ? inArray(s.therapistLocations.locationId, user.locationIds) : undefined)
    const allMemberships = user.role === 'LOCATION_ADMIN' && rows.length ? await db.select().from(s.therapistLocations).where(inArray(s.therapistLocations.therapistId, rows.map(r=>r.therapist.id))) : []
    return rows.map(r => ({ canManage: user.role !== 'LOCATION_ADMIN' || allMemberships.filter(m=>m.therapistId===r.therapist.id).every(m=>user.locationIds.includes(m.locationId)), ...r.therapist, isActive: r.therapist.isActive && r.userActive, name: r.name, email: r.email, phone: r.phone, locations: memberships.filter(m => m.membership.therapistId === r.therapist.id).map(m => ({ ...m.membership, name: m.name })), locationIds: memberships.filter(m => m.membership.therapistId === r.therapist.id).map(m => m.membership.locationId) }))
  }
  if (resource === 'schedules') return db.select({ schedule: s.therapistSchedules, therapistName: s.users.name, locationName: s.locations.name }).from(s.therapistSchedules).innerJoin(s.therapists, eq(s.therapists.id, s.therapistSchedules.therapistId)).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).innerJoin(s.locations, eq(s.locations.id, s.therapistSchedules.locationId)).where(and(user.role === 'LOCATION_ADMIN' ? inArray(s.therapistSchedules.locationId, user.locationIds) : undefined, user.role === 'THERAPIST' ? eq(s.therapistSchedules.therapistId, user.therapistId) : undefined, query.date ? eq(s.therapistSchedules.scheduleDate, query.date) : undefined)).orderBy(s.therapistSchedules.scheduleDate, s.therapistSchedules.startTime).then(rows => rows.map(r => ({ ...r.schedule, therapistName: r.therapistName, locationName: r.locationName })))
  ensure(false, 404, 'Data tidak ditemukan')
}
export async function masterDetail(resource, id, user) {
  const rows = await listMaster(resource, user); const row = rows.find(r => r.id === id)
  ensure(row, 404, 'Data tidak ditemukan')
  if (resource === 'customers') {
    const addresses = await db.select().from(s.customerAddresses).where(eq(s.customerAddresses.customerId, id))
    const orders = await listOrders(user, { customerId: id })
    const paid = await db.select({ amount: s.payments.amount }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).where(and(eq(s.orders.customerId, id), eq(s.payments.status, 'SUCCESS'), orderScope(user)))
    return { ...row, addresses, orders, totalOrders: orders.length, totalSpending: paid.reduce((n,p) => n + Number(p.amount), 0) }
  }
  return row
}
