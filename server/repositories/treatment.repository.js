import { eq, and, desc } from 'drizzle-orm'
import * as s from '../database/schema/index.js'
import { treatmentWindow } from '#shared/utils/treatment.js'
export async function treatmentTiming(connection, orderId, items) {
  const [start] = await connection.select({ createdAt: s.orderStatusLogs.createdAt }).from(s.orderStatusLogs).where(and(eq(s.orderStatusLogs.orderId, orderId), eq(s.orderStatusLogs.toStatus, 'IN_PROGRESS'))).orderBy(desc(s.orderStatusLogs.id)).limit(1)
  const treatments = items || await connection.select({ durationMinutes: s.orderItems.durationMinutes, qty: s.orderItems.qty }).from(s.orderItems).where(eq(s.orderItems.orderId, orderId))
  const duration = treatments.reduce((n, item) => n + item.durationMinutes * item.qty, 0)
  const serverNow = new Date().toISOString()
  return { ...treatmentWindow(start?.createdAt, duration, serverNow), serverNow }
}
