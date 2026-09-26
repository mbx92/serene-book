import assert from 'node:assert/strict'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../server/database/index.js'
import * as s from '../../server/database/schema/index.js'
// Test/seed fixtures simulate elapsed treatment time; this is never used by runtime routes.
export async function elapseTreatment(orderId, remainingMs = 0) {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Fixture time changes require a local database')
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId))
  const duration = items.reduce((n, item) => n + item.durationMinutes * item.qty, 0)
  const [start] = await db.select().from(s.orderStatusLogs).where(and(eq(s.orderStatusLogs.orderId, orderId), eq(s.orderStatusLogs.toStatus, 'IN_PROGRESS'))).orderBy(desc(s.orderStatusLogs.id)).limit(1)
  assert(start, 'Fixture must have started treatment')
  await db.update(s.orderStatusLogs).set({ createdAt: new Date(Date.now() - duration * 60000 + remainingMs) }).where(eq(s.orderStatusLogs.id, start.id))
}
