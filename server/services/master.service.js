import argon2 from 'argon2'
import { eq, and, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { masterDetail } from '../repositories/master.repository.js'
import { OWNER_ROLES, OFFICE_ROLES, permit, assertLocation } from '../utils/auth.js'
import { ensure } from '../utils/errors.js'
import { audit } from './order.service.js'
import { TERMINAL } from '#shared/constants/index.js'
import { withinSchedule } from '#shared/utils/booking.js'
export async function saveMaster(resource, body, user, id = null) {
  const allowed = resource === 'customers' ? OFFICE_ROLES : ['schedules','therapists'].includes(resource) ? [...OWNER_ROLES, 'LOCATION_ADMIN'] : OWNER_ROLES
  permit(user, allowed)
  if (id) await masterDetail(resource, id, user)
  return db.transaction(async tx => {
    if (resource === 'services') {
      const { price, locationId, ...values } = body
      if (locationId) { const [location] = await tx.select().from(s.locations).where(eq(s.locations.id, locationId)); ensure(location, 400, 'Lokasi tidak ditemukan') }
      const [row] = id ? await tx.update(s.services).set({ ...values, updatedAt: new Date() }).where(eq(s.services.id, id)).returning() : await tx.insert(s.services).values(values).returning()
      await tx.update(s.servicePrices).set({ isActive: false, updatedAt: new Date() }).where(and(eq(s.servicePrices.serviceId, row.id), locationId ? eq(s.servicePrices.locationId, locationId) : sql`${s.servicePrices.locationId} is null`))
      await tx.insert(s.servicePrices).values({ serviceId: row.id, locationId, price: price.toFixed(2) })
      await audit(tx, user, id ? 'UPDATED' : 'CREATED', resource, row.id); return row
    }
    if (resource === 'users' || resource === 'therapists') {
      if (resource==='therapists'&&user.role==='LOCATION_ADMIN') {
        for(const locationId of body.locationIds)assertLocation(user,locationId)
        if(id){
          const [profile]=await tx.select().from(s.therapists).where(eq(s.therapists.id,id)).for('update')
          ensure(profile,404,'Therapist tidak ditemukan')
          const memberships=await tx.select().from(s.therapistLocations).where(eq(s.therapistLocations.therapistId,id))
          ensure(memberships.length&&memberships.every(m=>user.locationIds.includes(m.locationId)),403,'Therapist lintas lokasi hanya dapat diubah oleh owner')
          const roles=await tx.select({code:s.roles.code}).from(s.userRoles).innerJoin(s.roles,eq(s.roles.id,s.userRoles.roleId)).where(eq(s.userRoles.userId,profile.userId))
          ensure(roles.length&&roles.every(r=>r.code==='THERAPIST'),403,'Akun dengan akses lain hanya dapat diubah oleh owner')
        }
      }
      let userId = resource === 'users' ? id : null
      if (id && resource === 'therapists') { const [t] = await tx.select().from(s.therapists).where(eq(s.therapists.id, id)); userId = t.userId }
      const { name, email, phone, password, isActive } = body
      if (userId) {
        const [profile] = await tx.select().from(s.therapists).where(eq(s.therapists.userId, userId)).for('update')
        if (profile) {
          const activeJobs = await tx.select({ order: s.orders }).from(s.orderAssignments).innerJoin(s.orders, eq(s.orders.id, s.orderAssignments.orderId)).where(and(eq(s.orderAssignments.therapistId, profile.id), eq(s.orderAssignments.isActive, true), notInArray(s.orders.orderStatus, [...TERMINAL, 'COMPLETED', 'PAID'])))
          ensure(!activeJobs.length || (isActive && (resource === 'therapists' ? activeJobs.every(j => body.locationIds.includes(j.order.locationId)) : body.role === 'THERAPIST')), 409, 'Alihkan job aktif sebelum menonaktifkan therapist atau mengubah role/lokasi kerja')
        }
      }
      const values = { name, email, phone, isActive, updatedAt: new Date(), ...(password ? { passwordHash: await argon2.hash(password) } : {}) }
      ensure(userId || password, 400, 'Password wajib untuk akun baru')
      if (resource === 'users' && userId === user.id) ensure(isActive && OWNER_ROLES.includes(body.role), 400, 'Anda tidak dapat menonaktifkan atau menurunkan role akun sendiri')
      const [account] = userId ? await tx.update(s.users).set(values).where(eq(s.users.id, userId)).returning() : await tx.insert(s.users).values(values).returning()
      if (resource === 'users' && body.role === 'THERAPIST') { const [profile] = await tx.select().from(s.therapists).where(eq(s.therapists.userId, account.id)); ensure(profile, 400, 'Buat akun therapist melalui menu Therapists') }
      const roleCode = resource === 'therapists' ? 'THERAPIST' : body.role
      const [role] = await tx.select().from(s.roles).where(eq(s.roles.code, roleCode)); ensure(role, 400, 'Role belum tersedia')
      if (body.locationId) { const [location] = await tx.select().from(s.locations).where(eq(s.locations.id, body.locationId)); ensure(location, 400, 'Lokasi tidak ditemukan') }
      await tx.delete(s.userRoles).where(eq(s.userRoles.userId, account.id))
      await tx.insert(s.userRoles).values({ userId: account.id, roleId: role.id, locationId: body.locationId || null })
      if (resource === 'users') { await audit(tx, user, id ? 'UPDATED' : 'CREATED', resource, account.id); return { id: account.id } }
      const memberships = await tx.select().from(s.locations).where(inArray(s.locations.id, body.locationIds)); ensure(memberships.length === new Set(body.locationIds).size, 400, 'Lokasi therapist tidak valid')
      const therapistValues = { userId: account.id, employeeCode: body.employeeCode, gender: body.gender, notes: body.notes, isActive, updatedAt: new Date() }
      const [therapist] = id ? await tx.update(s.therapists).set(therapistValues).where(eq(s.therapists.id, id)).returning() : await tx.insert(s.therapists).values(therapistValues).returning()
      await tx.delete(s.therapistLocations).where(eq(s.therapistLocations.therapistId, therapist.id))
      await tx.insert(s.therapistLocations).values([...new Set(body.locationIds)].map((locationId,i) => ({ therapistId: therapist.id, locationId, isPrimary: i === 0 })))
      await audit(tx, user, id ? 'UPDATED' : 'CREATED', resource, therapist.id); return { id: therapist.id }
    }
    if (resource === 'schedules') {
      assertLocation(user, body.locationId)
      const [therapist] = await tx.select().from(s.therapists).where(eq(s.therapists.id, body.therapistId)).for('update'); ensure(therapist, 404, 'Therapist tidak ditemukan')
      const [membership] = await tx.select().from(s.therapistLocations).where(and(eq(s.therapistLocations.therapistId, body.therapistId), eq(s.therapistLocations.locationId, body.locationId))); ensure(membership, 400, 'Therapist bukan bagian dari lokasi ini')
      const jobs = await tx.select({ order: s.orders }).from(s.orderAssignments).innerJoin(s.orders, eq(s.orders.id, s.orderAssignments.orderId)).where(and(eq(s.orderAssignments.therapistId, body.therapistId), eq(s.orderAssignments.isActive, true), eq(s.orders.bookingDate, body.scheduleDate), notInArray(s.orders.orderStatus, [...TERMINAL, 'COMPLETED', 'PAID'])))
      ensure(jobs.every(({order}) => order.locationId === body.locationId && withinSchedule(order, body, order.timezone)), 409, 'Jadwal baru bentrok dengan job aktif. Alihkan job terlebih dahulu')
      if (id) { const [old] = await tx.select().from(s.therapistSchedules).where(eq(s.therapistSchedules.id, id)); ensure(old.therapistId === body.therapistId && old.scheduleDate === body.scheduleDate, 400, 'Therapist dan tanggal jadwal tidak dapat diubah') }
      const [row] = id ? await tx.update(s.therapistSchedules).set({ ...body, updatedAt: new Date() }).where(eq(s.therapistSchedules.id, id)).returning() : await tx.insert(s.therapistSchedules).values(body).returning()
      await audit(tx, user, id ? 'UPDATED' : 'CREATED', resource, row.id); return row
    }
    const table = resource === 'customers' ? s.customers : s.locations
    const values = { ...body, ...(resource === 'customers' ? { updatedBy: user.id, ...(!id ? { createdBy: user.id } : {}) } : {}), updatedAt: new Date() }
    const [row] = id ? await tx.update(table).set(values).where(eq(table.id, id)).returning() : await tx.insert(table).values(values).returning()
    await audit(tx, user, id ? 'UPDATED' : 'CREATED', resource, row.id); return row
  })
}
export async function deleteCustomer(id, user) {
  permit(user, OFFICE_ROLES)
  await masterDetail('customers', id, user)
  return db.transaction(async tx => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.customerId, id)); ensure(!order, 409, 'Customer dengan histori order tidak dapat dihapus')
    await tx.delete(s.customerAddresses).where(eq(s.customerAddresses.customerId, id))
    await tx.delete(s.customers).where(eq(s.customers.id, id)); await audit(tx, user, 'DELETED', 'customers', id); return { id }
  })
}
export async function saveAddress(customerId, body, user, id = null) {
  permit(user, OFFICE_ROLES); await masterDetail('customers', customerId, user)
  return db.transaction(async tx => {
    await tx.select().from(s.customers).where(eq(s.customers.id, customerId)).for('update')
    if (id) { const [address] = await tx.select().from(s.customerAddresses).where(and(eq(s.customerAddresses.id, id), eq(s.customerAddresses.customerId, customerId))); ensure(address, 404, 'Alamat tidak ditemukan') }
    if (body.isDefault) await tx.update(s.customerAddresses).set({ isDefault: false }).where(eq(s.customerAddresses.customerId, customerId))
    const [row] = id ? await tx.update(s.customerAddresses).set({ ...body, latitude: body.latitude ?? null, longitude: body.longitude ?? null, updatedAt: new Date() }).where(eq(s.customerAddresses.id, id)).returning() : await tx.insert(s.customerAddresses).values({ ...body, customerId }).returning()
    await audit(tx, user, id ? 'UPDATED' : 'CREATED', 'customer_addresses', row.id); return row
  })
}
