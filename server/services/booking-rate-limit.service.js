import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { setResponseHeader } from 'h3'
import { db } from '../database/index.js'
import { clientIP } from '../utils/client-ip.js'

let nextCleanup = 0
function setting(name, fallback) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < 1 || value > 86400) throw new Error(`${name} harus bilangan bulat 1 sampai 86400`)
  return value
}
export function bookingLimitKey(scope, identity) {
  return scope + ':' + createHash('sha256').update(String(identity)).digest('hex')
}
export function bookingPhoneIdentity(phone) {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('8') ? '62' + digits : digits
}
export async function consumeBookingLimits(rules) {
  if (Date.now() >= nextCleanup) {
    await db.execute(sql`DELETE FROM public_booking_limits WHERE expires_at <= now()`)
    nextCleanup = Date.now() + 300000
  }
  await db.transaction(async tx => {
    // Deterministic ordering also prevents deadlocks across concurrent requests.
    for (const rule of [...rules].sort((a, b) => a.key.localeCompare(b.key))) {
      const result = await tx.execute(sql`
        INSERT INTO public_booking_limits (bucket_key, hit_count, expires_at)
        VALUES (${rule.key}, 1, now() + ${rule.seconds} * interval '1 second')
        ON CONFLICT (bucket_key) DO UPDATE SET
          hit_count = CASE WHEN public_booking_limits.expires_at <= now() THEN 1 ELSE public_booking_limits.hit_count + 1 END,
          expires_at = CASE WHEN public_booking_limits.expires_at <= now() THEN now() + ${rule.seconds} * interval '1 second' ELSE public_booking_limits.expires_at END
        RETURNING hit_count, greatest(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry_after
      `)
      const row = result.rows[0]
      if (row.hit_count > rule.maximum) {
        const error = new Error(`Terlalu banyak permintaan booking. Coba lagi dalam ${row.retry_after} detik.`)
        error.statusCode = 429; error.retryAfter = row.retry_after
        throw error
      }
    }
  })
}
async function enforce(event, rules) {
  try { await consumeBookingLimits(rules) }
  catch (error) { if (error.retryAfter) setResponseHeader(event, 'Retry-After', String(error.retryAfter)); throw error }
}
export async function limitBookingRequest(event) {
  await enforce(event, [
    { key: bookingLimitKey('ip', clientIP(event)), maximum: setting('BOOKING_RATE_LIMIT_IP_MAX', 5), seconds: setting('BOOKING_RATE_LIMIT_IP_WINDOW_SECONDS', 900) },
    { key: bookingLimitKey('global', 'public-booking'), maximum: setting('BOOKING_RATE_LIMIT_GLOBAL_MAX', 120), seconds: setting('BOOKING_RATE_LIMIT_GLOBAL_WINDOW_SECONDS', 60) }
  ])
}
export async function limitBookingPhone(event, phone) {
  await enforce(event, [{ key: bookingLimitKey('phone', bookingPhoneIdentity(phone)), maximum: setting('BOOKING_RATE_LIMIT_PHONE_MAX', 3), seconds: setting('BOOKING_RATE_LIMIT_PHONE_WINDOW_SECONDS', 3600) }])
}
