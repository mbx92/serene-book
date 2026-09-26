import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import * as s from '../database/schema/index.js'
import { whatsappUrl } from '#shared/utils/whatsapp.js'
export const hashJobToken = token => createHash('sha256').update(token).digest('hex')
export async function issueJobLink(tx, order, assignment, user, baseUrl, minutes = 30) {
  const token = randomBytes(32).toString('hex')
  const offerExpiresAt = new Date(Date.now() + minutes * 60000)
  const accessExpiresAt = new Date(Math.max(Date.now(), new Date(order.bookingEndsAt).getTime()) + 86400000)
  await tx.insert(s.therapistJobLinks).values({ assignmentId: assignment.id, tokenHash: hashJobToken(token), offerExpiresAt, accessExpiresAt, createdBy: user.id }).onConflictDoUpdate({ target: s.therapistJobLinks.assignmentId, set: { tokenHash: hashJobToken(token), offerExpiresAt, accessExpiresAt, createdBy: user.id, updatedAt: new Date() } })
  const [therapist] = await tx.select({ name: s.users.name, phone: s.users.phone }).from(s.therapists).innerJoin(s.users, eq(s.users.id, s.therapists.userId)).where(eq(s.therapists.id, assignment.therapistId))
  const [location] = await tx.select({ name: s.locations.name }).from(s.locations).where(eq(s.locations.id, order.locationId))
  const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
  const url = new URL(`/job/${token}`, baseUrl).href
  const pending = assignment.responseStatus === 'PENDING'
  const message = [`Halo ${therapist.name}, ${pending ? 'ada penawaran job' : 'berikut tautan job Anda'} ${order.orderNumber}.`, `Treatment: ${items.map(i => `${i.serviceNameSnapshot} × ${i.qty}`).join(', ')}.`, `Jadwal: ${order.bookingDate}, ${order.bookingTime.slice(0, 5)} (${order.timezone}).`, `Durasi: ${items.reduce((n, i) => n + i.durationMinutes * i.qty, 0)} menit.`, `Area: ${location?.name || 'Hubungi admin'}.`, pending ? `Silakan ambil atau tolak melalui tautan sebelum ${offerExpiresAt.toLocaleTimeString('id-ID', { timeZone: order.timezone, hour: '2-digit', minute: '2-digit' })}.` : 'Gunakan tautan untuk navigasi dan memperbarui status job.', url].join('\n')
  return { assignmentId: assignment.id, url, message, whatsappUrl: whatsappUrl(therapist.phone, message), offerExpiresAt, accessExpiresAt }
}
