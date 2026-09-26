import { defineEventHandler, createError, setResponseHeader } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '../database/index.js'
export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  try { await db.execute(sql`SELECT 1`); return { status: 'ok' } }
  catch { throw createError({ statusCode: 503, statusMessage: 'Layanan belum siap' }) }
})
