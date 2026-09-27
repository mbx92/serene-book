import { defineEventHandler, getRouterParam, getQuery, readBody, getRequestURL, setResponseHeader, createError, sendRedirect } from 'h3'
import { clientIP } from '../utils/client-ip.js'
import { limitBookingRequest, limitBookingPhone } from '../services/booking-rate-limit.service.js'
import argon2 from 'argon2'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import * as schemas from '#shared/schemas/index.js'
import { STATUSES, SOURCES } from '#shared/constants/index.js'
import { authenticate, createSession, logout, userIdentity, checkOrigin, rateLimit, permit, OWNER_ROLES } from '../utils/auth.js'
import { fail, ensure } from '../utils/errors.js'
import { listMaster, masterDetail } from '../repositories/master.repository.js'
import { listOrders, orderDetail, findOrder } from '../repositories/order.repository.js'
import { saveMaster, deleteCustomer, saveAddress } from '../services/master.service.js'
import { createOrder, createOrderCustomer, editOrder, assignLocation, assignTherapist, transitionOrder, recordPayment, refundPayment, availability, expireJobOffers } from '../services/order.service.js'
import { publicJob, respondToJob, renewJobLink } from '../services/job.service.js'
import { paymentList, dashboard, report } from '../services/report.service.js'
import { billingPolicy, getBillingSettings, saveBillingSettings } from '../services/billing-settings.service.js'
import { getRevenueSettings, saveRevenueSettings } from '../services/revenue-sharing.service.js'
import { orderOptions } from '../services/order-options.service.js'
import { brandingSettings, publicBranding, getBrandingSettings, saveBrandingSettings, brandingManifest, brandingIcon } from '../services/branding.service.js'
import { locationAdminApiAllowed } from '#shared/utils/access.js'
const resourceSchemas = { customers: schemas.customerSchema, locations: schemas.locationSchema, services: schemas.serviceSchema, therapists: schemas.therapistSchema, schedules: schemas.scheduleSchema, users: schemas.userSchema }
const filters = z.object({ date: schemas.date.optional(), from: schemas.date.optional(), to: schemas.date.optional(), locationId: schemas.identifier.optional(), therapistId: schemas.identifier.optional(), serviceId: schemas.identifier.optional(), customerId: schemas.identifier.optional(), status: z.enum(STATUSES).optional(), paymentStatus: z.enum(['UNPAID','PARTIAL','PAID','REFUNDED']).optional(), source: z.enum(SOURCES).optional(), search: z.string().max(100).optional() }).strict().refine(v => !v.from || !v.to || v.from <= v.to, 'Rentang tanggal tidak valid')
async function body(event, schema) { return schema.parse(await readBody(event)) }
export default defineEventHandler(async event => {
  try {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    const method = event.method; const path = (getRouterParam(event, 'path') || '').split('/').filter(Boolean)
    const [resource, rawId, action] = path
    if (method !== 'GET') checkOrigin(event)
    if (resource === 'public' && method === 'GET' && rawId === 'branding' && path.length === 2) return publicBranding(await brandingSettings())
    if (resource === 'public' && method === 'GET' && rawId === 'branding-manifest' && path.length === 2) {
      setResponseHeader(event, 'Content-Type', 'application/manifest+json')
      return brandingManifest(await brandingSettings())
    }
    if (resource === 'public' && method === 'GET' && rawId === 'branding-icon' && path.length === 3) {
      ensure(['logo', 'favicon', 'apple', '192', '512', 'maskable'].includes(action), 404, 'Ikon tidak ditemukan')
      const icon = await brandingIcon(await brandingSettings(), action)
      if (!icon) return sendRedirect(event, { logo: '/logo.svg', favicon: '/favicon.svg', apple: '/icons/apple-touch-icon.png', '192': '/icons/icon-192.png', '512': '/icons/icon-512.png', maskable: '/icons/icon-maskable-512.png' }[action])
      setResponseHeader(event, 'Content-Type', 'image/png')
      setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
      return icon
    }
    if (resource === 'auth' && rawId === 'login' && method === 'POST') {
      rateLimit(`login-ip:${clientIP(event)}`, 100)
      const input = await body(event, schemas.loginSchema)
      rateLimit(`login-account:${clientIP(event)}:${input.email}`, 10)
      const [account] = await db.select().from(s.users).where(eq(s.users.email, input.email))
      const valid = account ? await argon2.verify(account.passwordHash, input.password) : await argon2.hash(input.password).then(() => false)
      ensure(account?.isActive && valid, 401, 'Email atau password tidak sesuai')
      const user = await userIdentity(account.id); ensure(user, 403, 'Akun belum memiliki role aktif')
      await createSession(event, account.id); return { user }
    }
    if (resource === 'auth' && rawId === 'logout' && method === 'POST') { await logout(event); return { success: true } }
    if (resource === 'public' && rawId === 'catalog' && method === 'GET') {
      const services = await db.select({ id: s.services.id, name: s.services.name, description: s.services.description, durationMinutes: s.services.durationMinutes }).from(s.services).where(eq(s.services.isActive, true))
      const prices = await db.select().from(s.servicePrices).where(eq(s.servicePrices.isActive, true))
      const locations = await db.select({ id: s.locations.id, name: s.locations.name }).from(s.locations).where(eq(s.locations.isActive, true))
      return { billing: await billingPolicy(), services: services.map(v => ({ ...v, prices: prices.filter(p => p.serviceId === v.id).map(p => ({ locationId: p.locationId, price: p.price })) })), locations }
    }
    if (resource === 'public' && rawId === 'booking' && method === 'POST') {
      await limitBookingRequest(event)
      const schema = schemas.publicBookingSchema
      const input = await body(event, schema)
      await limitBookingPhone(event, input.phone)
      ensure(input.bookingDate >= DateTime.now().setZone('Asia/Makassar').toISODate(), 400, 'Tanggal booking sudah lewat')
      return await db.transaction(async tx => {
        const [customer] = await tx.insert(s.customers).values({ name: input.name, phone: input.phone }).onConflictDoUpdate({ target: s.customers.phone, set: { phone: input.phone } }).returning()
        const order = await createOrder({ ...input, customerId: customer.id, discount: 0, tax: 0, transportFee: 0, source: 'WEB' }, { id: null, role: 'CUSTOMER_SERVICE' }, tx)
        return { orderNumber: order.orderNumber }
      })
    }
    if (resource === 'public' && rawId === 'jobs' && action) {
      setResponseHeader(event, 'Referrer-Policy', 'strict-origin')
      setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow, nosnippet')
      if (method === 'GET' && path.length === 3) {
        rateLimit(`job-read:${clientIP(event)}`, 3000)
        return await publicJob(action)
      }
      if (method === 'POST' && path.length === 4 && path[3] === 'action') {
        rateLimit(`job-action:${clientIP(event)}`, 60)
        const input = await body(event, schemas.jobActionSchema)
        await expireJobOffers()
        return await respondToJob(action, input)
      }
      fail(404, 'Endpoint tidak ditemukan')
    }
    const user = await authenticate(event)
    if (user.role === 'LOCATION_ADMIN') ensure(locationAdminApiAllowed(method,path),403,'Admin lokasi hanya dapat mengelola order dan therapist')
    if (['orders', 'dashboard', 'reports', 'schedules'].includes(resource)) await expireJobOffers()
    if (resource === 'auth' && rawId === 'me' && method === 'GET') return { user }
    if (resource === 'dashboard' && method === 'GET') { const query = filters.parse(getQuery(event)); return await dashboard(user, query.date || DateTime.now().setZone('Asia/Makassar').toISODate()) }
    if (resource === 'reports' && method === 'GET') return await report(user, filters.parse(getQuery(event)))
    if (resource === 'notifications') {
      if (method === 'GET') return await db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)).orderBy(desc(s.notifications.id)).limit(100)
      if (method === 'PATCH') { if (rawId) { const id = schemas.identifier.parse(rawId); await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.id, id), eq(s.notifications.userId, user.id))) } else await db.update(s.notifications).set({ readAt: new Date() }).where(eq(s.notifications.userId, user.id)); return { success: true } }
    }
    if (resource === 'audit' && method === 'GET') { permit(user, OWNER_ROLES); return await db.select({ log: s.auditLogs, actorName: s.users.name }).from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.userId)).orderBy(desc(s.auditLogs.id)).limit(200).then(rows => rows.map(r => ({ ...r.log, actorName: r.actorName }))) }
    if (resource === 'settings' && rawId === 'billing' && path.length === 2) {
      if (method === 'GET') return await getBillingSettings(user)
      if (method === 'PATCH') return await saveBillingSettings(await body(event, schemas.billingSettingsSchema), user)
    }
    if (resource === 'settings' && rawId === 'branding' && path.length === 2) {
      permit(user, OWNER_ROLES)
      if (method === 'GET') return await getBrandingSettings(user)
      if (method === 'PATCH') return await saveBrandingSettings(await body(event, schemas.brandingSchema), user)
    }
    if (resource === 'settings' && rawId === 'revenue-sharing' && path.length === 2) {
      if (method === 'GET') return await getRevenueSettings(user)
      if (method === 'PATCH') return await saveRevenueSettings(await body(event, schemas.revenueSharingSchema), user)
    }
    if (resource === 'payments') {
      if (method === 'GET') return await paymentList(user)
      if (!rawId && method === 'POST') return await recordPayment(await body(event, schemas.paymentSchema), user)
      if (rawId && action === 'refund' && method === 'POST') return await refundPayment(schemas.identifier.parse(rawId), user)
    }
    if (resource === 'therapists' && rawId === 'options' && method === 'GET') { permit(user, [...OWNER_ROLES,'LOCATION_ADMIN']); return {locations:await listMaster('locations',user)} }
    if (resource === 'therapists' && rawId === 'schedules' && method === 'GET') return await listMaster('schedules',user,filters.parse(getQuery(event)))
    if (resource === 'therapists' && rawId && action === 'schedules') {
      const therapistId=schemas.identifier.parse(rawId)
      await masterDetail('therapists',therapistId,user)
      if (method === 'GET') return (await listMaster('schedules',user)).filter(sc=>sc.therapistId===therapistId)
      if (method === 'POST'||method==='PATCH') {
        const input=await body(event,schemas.scheduleSchema)
        ensure(input.therapistId===therapistId,400,'Therapist pada jadwal tidak sesuai')
        const scheduleId=path[3]?schemas.identifier.parse(path[3]):null
        if(scheduleId){const old=await masterDetail('schedules',scheduleId,user);ensure(old.therapistId===therapistId,404,'Jadwal tidak ditemukan')}
        ensure(method==='POST'?!scheduleId:!!scheduleId,404,'Endpoint tidak ditemukan')
        return await saveMaster('schedules',input,user,scheduleId)
      }
    }
    if (resource === 'orders' && rawId === 'options' && method === 'GET') return await orderOptions(user)
    if (resource === 'orders' && rawId === 'customer' && method === 'POST') return await createOrderCustomer(await body(event,schemas.customerSchema),user)
    if (resource === 'orders') {
      const id = rawId ? schemas.identifier.parse(rawId) : null
      if (!id && method === 'GET') return await listOrders(user, filters.parse(getQuery(event)))
      if (!id && method === 'POST') return await createOrder(await body(event, schemas.orderSchema), user)
      if (id && !action && method === 'GET') return await orderDetail(id, user)
      if (id && !action && method === 'PATCH') return await editOrder(id, await body(event, schemas.orderSchema), user)
      if (id && action === 'availability' && method === 'GET') {
        permit(user, [...OWNER_ROLES, 'LOCATION_ADMIN'])
        const order = await findOrder(id, user)
        const therapists = await listMaster('therapists', user)
        return await Promise.all(therapists.map(async therapist => ({ ...therapist, ...await availability(db, therapist.id, order, id) })))
      }
      if (id && action && method === 'POST') {
        if (action === 'assign-location') return await assignLocation(id, (await body(event, schemas.locationAssignmentSchema)).locationId, user)
        if (action === 'assign-therapist') return await assignTherapist(id, (await body(event, schemas.assignmentSchema)).therapistId, user, process.env.APP_URL || getRequestURL(event).origin)
        if (action === 'job-link') return await renewJobLink(id, user, process.env.APP_URL || getRequestURL(event).origin, (await body(event, schemas.jobLinkSchema)).minutes)
        if (['confirm','accept','reject','on-the-way','arrived','start','complete','cancel','close'].includes(action)) return await transitionOrder(id, action, user, ['cancel','reject'].includes(action) ? (await body(event, schemas.reasonSchema)).notes : '')
      }
    }
    if (resourceSchemas[resource]) {
      const id = rawId ? schemas.identifier.parse(rawId) : null
      if (resource === 'customers' && id && action === 'addresses') {
        if (method === 'POST') return await saveAddress(id, await body(event, schemas.addressSchema), user)
        if (method === 'PATCH' && path[3]) return await saveAddress(id, await body(event, schemas.addressSchema), user, schemas.identifier.parse(path[3]))
      }
      if (!action) {
        if (method === 'GET') return id ? await masterDetail(resource, id, user) : await listMaster(resource, user, filters.parse(getQuery(event)))
        if (!id && method === 'POST') return await saveMaster(resource, await body(event, resourceSchemas[resource]), user)
        if (id && method === 'PATCH') {
          const schema = resource === 'users' ? schemas.userSchema.safeExtend({ password: z.string().min(10).max(128).optional() }) : resourceSchemas[resource]
          return await saveMaster(resource, await body(event, schema), user, id)
        }
        if (resource === 'customers' && id && method === 'DELETE') return await deleteCustomer(id, user)
      }
    }
    fail(404, 'Endpoint tidak ditemukan')
  } catch (error) {
    if (error instanceof z.ZodError) throw createError({ statusCode: 422, statusMessage: 'Data tidak valid', data: { message: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') } })
    const code = error.code || error.cause?.code
    if (code === '23505') throw createError({ statusCode: 409, statusMessage: 'Data sudah terdaftar', data: { message: 'Email, nomor telepon, kode, atau jadwal sudah terdaftar.' } })
    if (code === '23503') throw createError({ statusCode: 409, statusMessage: 'Data masih digunakan atau referensi tidak valid' })
    if (error.statusCode) throw createError({ statusCode: error.statusCode, statusMessage: error.statusMessage || error.message, data: { message: error.message } })
    console.error('[spa-api]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Terjadi kesalahan server. Periksa konfigurasi database.' })
  }
})
