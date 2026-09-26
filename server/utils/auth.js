import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { eq, and, gt } from 'drizzle-orm'
import { getCookie, setCookie, deleteCookie, getHeader } from 'h3'
import { db } from '../database/index.js'
import { users, roles, userRoles, sessions, therapists } from '../database/schema/index.js'
import { fail, ensure } from './errors.js'
export const OWNER_ROLES = ['SUPER_ADMIN', 'OWNER']
export const OFFICE_ROLES = [...OWNER_ROLES, 'CUSTOMER_SERVICE']
export const ADMIN_ROLES = [...OFFICE_ROLES, 'LOCATION_ADMIN']
const tokenHash = token => createHash('sha256').update(token).digest('hex')
function sign(token) { const secret = process.env.SESSION_SECRET || process.env.NUXT_SESSION_SECRET; ensure(secret && secret.length >= 32, 500, 'SESSION_SECRET minimal 32 karakter diperlukan'); return createHmac('sha256', secret).update(token).digest('hex') }
export async function userIdentity(userId) {
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive }).from(users).where(eq(users.id, userId))
  if (!user?.isActive) return null
  const memberships = await db.select({ role: roles.code, locationId: userRoles.locationId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, user.id))
  const priority = [...OWNER_ROLES, 'CUSTOMER_SERVICE', 'LOCATION_ADMIN', 'THERAPIST']
  const membership = memberships.sort((a,b) => priority.indexOf(a.role) - priority.indexOf(b.role))[0]
  if (!membership) return null
  const [therapist] = await db.select({ id: therapists.id, isActive: therapists.isActive }).from(therapists).where(eq(therapists.userId, user.id))
  if (membership.role === 'THERAPIST' && !therapist?.isActive) return null
  return { ...user, role: membership.role, locationId: membership.locationId, locationIds: memberships.filter(m => m.role === 'LOCATION_ADMIN').map(m => m.locationId), therapistId: therapist?.id || null }
}
export async function createSession(event, userId) {
  const token = randomBytes(32).toString('hex'); const value = token + '.' + sign(token)
  await db.insert(sessions).values({ userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 86400000) })
  setCookie(event, 'spa_session', value, { httpOnly: true, secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false', sameSite: 'lax', path: '/', maxAge: 7 * 86400 })
}
export async function authenticate(event) {
  const cookie = getCookie(event, 'spa_session') || ''; const [token, signature] = cookie.split('.')
  if (!token || !signature || !/^[a-f0-9]{64}$/.test(signature)) fail(401, 'Silakan masuk terlebih dahulu')
  const expected = sign(token)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail(401, 'Sesi tidak valid')
  const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())))
  const user = session && await userIdentity(session.userId)
  if (!user) fail(401, 'Sesi berakhir. Silakan masuk kembali')
  event.context.auth = user; return user
}
export async function logout(event) {
  const token = (getCookie(event, 'spa_session') || '').split('.')[0]
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)))
  deleteCookie(event, 'spa_session', { path: '/' })
}
export function permit(user, allowed) { ensure(allowed.includes(user.role), 403, 'Anda tidak memiliki akses untuk tindakan ini') }
export function assertLocation(user, locationId) { if (user.role === 'LOCATION_ADMIN') ensure(user.locationIds.includes(locationId), 403, 'Lokasi di luar hak akses Anda') }
export function checkOrigin(event) {
  const origin = getHeader(event, 'origin'); const host = getHeader(event, 'host')
  if (origin) { let parsed; try { parsed = new URL(origin) } catch { fail(403, 'Origin tidak valid') }; ensure(parsed.host === host || parsed.origin === process.env.APP_URL, 403, 'Permintaan lintas origin ditolak') }
}
const attempts = new Map()
export function rateLimit(key, maximum = 10) {
  const now = Date.now(); if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k)
  const record = attempts.get(key)
  if (!record || record.until < now) { attempts.set(key, { count: 1, until: now + 15 * 60000 }); return }
  ensure(record.count++ < maximum, 429, 'Terlalu banyak percobaan. Coba kembali dalam 15 menit')
}
