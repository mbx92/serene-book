import { isIP } from 'node:net'
import { getHeader, getRequestIP } from 'h3'

export function normalizeIP(value = '') {
  const ip = value.trim().toLowerCase()
  if (!isIP(ip)) return null
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7)
  try { return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip }
  catch { return null }
}

export function resolveClientIP(peer, forwarded = '', hops = 0) {
  const fallback = normalizeIP(peer || '') || 'unknown'
  if (!Number.isInteger(hops) || hops < 1) return fallback
  const chain = forwarded.split(',').map(ip => ip.trim())
  // Count trusted proxies from the right; never trust a client-supplied prefix.
  return chain.length >= hops ? normalizeIP(chain[chain.length - hops]) || fallback : fallback
}

export function clientIP(event) {
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0)
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) throw new Error('TRUST_PROXY_HOPS harus bilangan bulat 0 sampai 10')
  return resolveClientIP(getRequestIP(event), getHeader(event, 'x-forwarded-for') || '', hops)
}
