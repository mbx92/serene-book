import assert from 'node:assert/strict'
import { elapseTreatment } from './test-support/treatment.js'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
const base = process.env.TEST_APP_URL || 'http://localhost:3000'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Tests only run on localhost')
assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Tests require a local database')
let checks = 0, customerId
const orders = [], cookies = []
async function request(path, { method = 'GET', body, cookie, expected = 200, origin } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { origin } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const value = await response.json()
  assert.equal(response.status, expected, `${method} ${path.replace(/[a-f0-9]{64}/g, '[token]')}: ${JSON.stringify(value)}`)
  checks++; return { value, response }
}
async function login(email) { const { value, response } = await request('/api/auth/login', { method: 'POST', body: { email, password: process.env.SEED_PASSWORD } }); const cookie = response.headers.get('set-cookie').split(';')[0]; cookies.push(cookie); return { cookie, user: value.user } }
const tokenOf = link => new URL(link.url).pathname.split('/').at(-1)
const endpoint = token => `/api/public/jobs/${token}`
const act = (token, action, options = {}) => request(endpoint(token) + '/action', { method: 'POST', body: { action, ...(action === 'reject' ? { notes: 'Tidak ada transportasi' } : {}) }, ...options })
try {
  const owner = await login('owner@serene.local'), admin = await login('admin@serene.local'), cs = await login('cs@serene.local')
  const { value: therapists } = await request('/api/therapists', { cookie: owner.cookie })
  const ayu = therapists.find(t => t.email === 'ayu@serene.local'), made = therapists.find(t => t.email === 'made@serene.local')
  const suffix = Date.now()
  const { value: customer } = await request('/api/customers', { cookie: cs.cookie, method: 'POST', body: { name: `WhatsApp Test ${suffix}`, phone: `+628${String(suffix).slice(-11)}` } }); customerId = customer.id
  const date = DateTime.now().setZone('Asia/Makassar').plus({ days: 11 }).toISODate()
  async function order(time, qty = 1) {
    const { value } = await request('/api/orders', { cookie: cs.cookie, method: 'POST', body: { customerId, locationId: 1, bookingDate: date, bookingTime: time, address: 'Private villa address, room 314', latitude: -8.6705, longitude: 115.2126, services: [{ serviceId: 1, qty }], notes: 'Private customer preference' } }); orders.push(value.id)
    await request(`/api/orders/${value.id}/confirm`, { cookie: cs.cookie, method: 'POST', body: {} })
    await request(`/api/orders/${value.id}/assign-location`, { cookie: cs.cookie, method: 'POST', body: { locationId: 1 } })
    return value
  }
  async function assign(row, therapist = ayu) { const { value } = await request(`/api/orders/${row.id}/assign-therapist`, { cookie: admin.cookie, method: 'POST', body: { therapistId: therapist.id } }); return value.jobLink }
  const row = await order('09:00', 2), link = await assign(row), token = tokenOf(link)
  assert.match(token, /^[a-f0-9]{64}$/)
  const wa = new URL(link.whatsappUrl); assert.equal(wa.hostname, 'wa.me'); assert(wa.searchParams.get('text').includes(link.url)); assert(!link.message.includes(row.addressSnapshot)); checks++
  const [stored] = await db.select().from(s.therapistJobLinks).where(eq(s.therapistJobLinks.assignmentId, link.assignmentId))
  assert.equal(stored.tokenHash, createHash('sha256').update(token).digest('hex')); assert.notEqual(stored.tokenHash, token); checks++
  const { value: preview, response: previewResponse } = await request(endpoint(token))
  assert.equal(preview.state, 'OFFER'); assert.equal(preview.therapistName, ayu.name)
  for (const key of ['customerName', 'customerPhone', 'address', 'latitude', 'longitude', 'notes', 'payments', 'total', 'tokenHash', 'assignmentId']) assert(!Object.hasOwn(preview, key), key + ' must not leak in the preview')
  assert.match(previewResponse.headers.get('cache-control'), /no-store/); assert.equal(previewResponse.headers.get('referrer-policy'), 'strict-origin'); checks++
  await request(endpoint(token)); await request(endpoint(token))
  const pageResponse = await fetch(base + `/job/${token}`); assert.equal(pageResponse.status, 200); assert.match(pageResponse.headers.get('x-robots-tag'), /noindex/); assert.equal(pageResponse.headers.get('referrer-policy'), 'strict-origin')
  const pageHtml = await pageResponse.text(); assert(!pageHtml.includes(row.addressSnapshot)); assert(!pageHtml.includes(customer.phone)); checks++
  const [untouched] = await db.select().from(s.orders).where(eq(s.orders.id, row.id)); assert.equal(untouched.orderStatus, 'ASSIGNED_THERAPIST'); checks++
  await request(endpoint('0'.repeat(64)), { expected: 404 })
  await request(endpoint('invalid'), { expected: 404 })
  await request(`/api/orders/${row.id}/job-link`, { method: 'POST', cookie: cs.cookie, body: {}, expected: 403 })
  await act(token, 'start', { expected: 409 })
  await act(token, 'accept', { origin: 'https://untrusted.example', expected: 403 })
  await request(endpoint(token) + '/action', { method: 'POST', body: { action: 'accept', therapistId: made.id }, expected: 422 })
  await act(token, 'close', { expected: 422 })
  const results = await Promise.all([act(token, 'accept'), act(token, 'accept')]); assert(results.every(r => r.value.orderStatus === 'ACCEPTED'))
  const logs = await db.select().from(s.orderStatusLogs).where(eq(s.orderStatusLogs.orderId, row.id)); assert.equal(logs.filter(l => l.toStatus === 'ACCEPTED').length, 1); checks++
  const { value: accepted } = await request(endpoint(token)); assert.equal(accepted.address, row.addressSnapshot); assert.equal(accepted.customerPhone, customer.phone); assert.equal(Number(accepted.latitude), -8.6705); assert(!Object.hasOwn(accepted, 'total')); checks++
  // Accepted jobs remain usable after the offer deadline, until the separate access deadline.
  await db.update(s.therapistJobLinks).set({ offerExpiresAt: new Date(Date.now() - 60000) }).where(eq(s.therapistJobLinks.assignmentId, link.assignmentId))
  for (const action of ['on-the-way', 'arrived', 'start']) await act(token, action)
  const { value: running } = await request(endpoint(token))
  assert.equal(running.treatment.durationMinutes, 120); assert(running.treatment.remainingSeconds > 7100); assert.equal(running.treatment.canComplete, false); checks++
  const startedAt = running.treatment.startedAt
  await act(token, 'start')
  assert.equal((await request(endpoint(token))).value.treatment.startedAt, startedAt); checks++
  await act(token, 'complete', { expected: 409 })
  await request(endpoint(token) + '/action', { method: 'POST', body: { action: 'complete', treatmentStartedAt: '2000-01-01T00:00:00Z' }, expected: 422 })
  const stillRunning = (await request(endpoint(token))).value
  assert.equal(stillRunning.orderStatus, 'IN_PROGRESS'); assert.equal(stillRunning.treatment.startedAt, startedAt); checks++
  await elapseTreatment(row.id)
  assert.equal((await request(endpoint(token))).value.treatment.canComplete, true)
  await act(token, 'complete')
  await act(token, 'complete')
  const { value: completed } = await request(`/api/orders/${row.id}`, { cookie: admin.cookie }); assert.equal(completed.orderStatus, 'COMPLETED'); assert.equal(completed.logs.filter(l => l.toStatus === 'COMPLETED').length, 1); assert(completed.logs.filter(l => ['ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(l.toStatus)).every(l => l.changedBy === ayu.userId)); checks++
  assert(!JSON.stringify(completed).includes(stored.tokenHash)); checks++

  const rejectedRow = await order('10:30'), rejectedLink = await assign(rejectedRow), rejectedToken = tokenOf(rejectedLink)
  await request(endpoint(rejectedToken) + '/action', { method: 'POST', body: { action: 'reject', notes: '' }, expected: 422 })
  await act(rejectedToken, 'reject'); await act(rejectedToken, 'accept', { expected: 409 })
  assert.equal((await request(endpoint(rejectedToken))).value.state, 'REJECTED')
  await assign(rejectedRow, made)

  const changedRow = await order('12:00'), changedLink = await assign(changedRow), changedToken = tokenOf(changedLink)
  await request(`/api/orders/${changedRow.id}/job-link`, { method: 'POST', cookie: admin.cookie, body: { minutes: 1 }, expected: 422 })
  const { value: replacement } = await request(`/api/orders/${changedRow.id}/job-link`, { method: 'POST', cookie: admin.cookie, body: { minutes: 15 } })
  await request(endpoint(changedToken), { expected: 404 }); await act(changedToken, 'accept', { expected: 404 })
  assert.equal((await request(endpoint(tokenOf(replacement)))).value.state, 'OFFER')
  await assign(changedRow, made)
  assert.equal((await request(endpoint(tokenOf(replacement)))).value.state, 'UNAVAILABLE')
  await act(tokenOf(replacement), 'accept', { expected: 409 })

  const cancelledRow = await order('13:30'), cancelled = await assign(cancelledRow)
  await request(`/api/orders/${cancelledRow.id}/cancel`, { cookie: admin.cookie, method: 'POST', body: { notes: 'Customer cancellation' } })
  assert.equal((await request(endpoint(tokenOf(cancelled)))).value.state, 'UNAVAILABLE')
  await act(tokenOf(cancelled), 'accept', { expected: 409 })

  const expiredRow = await order('15:00'), expiredLink = await assign(expiredRow)
  await db.update(s.therapistJobLinks).set({ offerExpiresAt: new Date(Date.now() - 60000) }).where(eq(s.therapistJobLinks.assignmentId, expiredLink.assignmentId))
  assert.equal((await request(endpoint(tokenOf(expiredLink)))).value.state, 'EXPIRED')
  const [beforeReconcile] = await db.select().from(s.orders).where(eq(s.orders.id, expiredRow.id)); assert.equal(beforeReconcile.orderStatus, 'ASSIGNED_THERAPIST'); checks++
  await act(tokenOf(expiredLink), 'accept', { expected: 409 })
  const { value: expired } = await request(`/api/orders/${expiredRow.id}`, { cookie: admin.cookie }); assert.equal(expired.orderStatus, 'NO_THERAPIST_AVAILABLE'); assert.equal(expired.assignments[0].responseStatus, 'EXPIRED'); assert(!expired.assignments[0].isActive); checks++
  await assign(expiredRow, ayu)
  // Expired operational access must also hide customer details and reject changes.
  await db.update(s.therapistJobLinks).set({ accessExpiresAt: new Date(Date.now() - 60000) }).where(eq(s.therapistJobLinks.assignmentId, link.assignmentId))
  assert.deepEqual((await request(endpoint(token))).value, { state: 'UNAVAILABLE' })
  await act(token, 'complete', { expected: 409 })
  console.log(`PASS: ${checks} WhatsApp job checks; read-only previews, privacy, scoped tokens, expiry, regeneration, rejection, reassignment, cancellation, atomic acceptance and complete workflow without login.`)
} finally {
  for (const cookie of cookies) await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie } }).catch(() => {})
  await db.transaction(async tx => {
    if (orders.length) {
      await tx.delete(s.notifications).where(sql`(${s.notifications.data}->>'orderId')::integer in (${sql.join(orders.map(id => sql`${id}`), sql`, `)})`)
      for (const table of [s.orderStatusLogs, s.orderAssignments, s.orderItems]) await tx.delete(table).where(inArray(table.orderId, orders))
      await tx.delete(s.orders).where(inArray(s.orders.id, orders))
      await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'orders' and ${inArray(s.auditLogs.entityId, orders)}`)
    }
    if (customerId) { await tx.delete(s.customers).where(eq(s.customers.id, customerId)); await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'customers' and ${s.auditLogs.entityId} = ${customerId}`) }
  })
  await pool.end()
}
