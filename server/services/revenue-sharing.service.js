import { eq, and, sql } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { OWNER_ROLES, permit } from '../utils/auth.js'
import { cents, moneyString, splitRevenue, collectedServiceCents } from '#shared/utils/revenue-sharing.js'
export async function revenuePolicy(connection = db) {
  const [policy] = await connection.select().from(s.revenueSharingSettings).where(eq(s.revenueSharingSettings.id, 1))
  if (!policy) throw new Error('Jalankan migrasi pengaturan pembagian pendapatan')
  return policy
}
export async function getRevenueSettings(user) { permit(user, OWNER_ROLES); return revenuePolicy() }
export async function saveRevenueSettings(body, user) {
  permit(user, OWNER_ROLES)
  return db.transaction(async tx => {
    const [before] = await tx.select().from(s.revenueSharingSettings).where(eq(s.revenueSharingSettings.id, 1)).for('update')
    const [after] = await tx.update(s.revenueSharingSettings).set({ ...body, ownerPercent: body.ownerPercent.toFixed(2), adminPercent: body.adminPercent.toFixed(2), therapistPercent: body.therapistPercent.toFixed(2), updatedBy: user.id, updatedAt: new Date() }).where(eq(s.revenueSharingSettings.id, 1)).returning()
    await tx.insert(s.auditLogs).values({ userId: user.id, action: 'REVENUE_SHARING_UPDATED', entity: 'settings', entityId: 1, data: { before, after } })
    return after
  })
}
// Call only while holding the order row lock. Formula is frozen at its first financial event.
export async function syncRevenueShare(tx, order, kind, eventKey, user) {
  if (eventKey) {
    const [existing] = await tx.select().from(s.revenueShareEvents).where(eq(s.revenueShareEvents.eventKey, eventKey))
    if (existing) return
  }
  let [share] = await tx.select().from(s.orderRevenueShares).where(eq(s.orderRevenueShares.orderId, order.id))
  if (!share && !eventKey) return
  const [assignment] = await tx.select().from(s.orderAssignments).where(and(eq(s.orderAssignments.orderId, order.id), eq(s.orderAssignments.isActive, true)))
  if (!share) {
    const policy = await revenuePolicy(tx)
    ;[share] = await tx.insert(s.orderRevenueShares).values({ orderId: order.id, ownerPercent: policy.ownerPercent, adminPercent: policy.adminPercent, therapistPercent: policy.therapistPercent, trigger: policy.trigger, serviceBase: moneyString(cents(order.subtotal) - cents(order.discount)) }).returning()
  }
  const successful = await tx.select().from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, 'SUCCESS')))
  const collected = collectedServiceCents(order, successful.reduce((n, p) => n + cents(p.amount), 0))
  const completed = ['COMPLETED', 'PAID', 'CLOSED'].includes(order.orderStatus)
  const eligible = !order.orderStatus.startsWith('CANCELLED') && (share.trigger === 'PAYMENT_RECEIVED' || completed)
  const base = eligible ? collected : 0
  const amounts = splitRevenue(base, share)
  const values = { ...amounts, collectedBase: moneyString(collected), allocatedBase: moneyString(base), locationId: order.locationId, therapistId: assignment?.therapistId || null, updatedAt: new Date() }
  await tx.update(s.orderRevenueShares).set(values).where(eq(s.orderRevenueShares.id, share.id))
  if (eventKey) await tx.insert(s.revenueShareEvents).values({ shareId: share.id, eventKey, kind, baseDelta: moneyString(base - cents(share.allocatedBase)), ownerDelta: moneyString(cents(amounts.ownerAmount) - cents(share.ownerAmount)), adminDelta: moneyString(cents(amounts.adminAmount) - cents(share.adminAmount)), therapistDelta: moneyString(cents(amounts.therapistAmount) - cents(share.therapistAmount)), createdBy: user?.id })
}
export async function shareDetail(order, connection = db) {
  const [share] = await connection.select().from(s.orderRevenueShares).where(eq(s.orderRevenueShares.orderId, order.id))
  const policy = share || await revenuePolicy(connection)
  const serviceBase = cents(order.subtotal) - cents(order.discount)
  const events = share ? await connection.select().from(s.revenueShareEvents).where(eq(s.revenueShareEvents.shareId, share.id)).orderBy(s.revenueShareEvents.id) : []
  return { ...policy, serviceBase: moneyString(serviceBase), allocatedBase: share?.allocatedBase || '0.00', collectedBase: share?.collectedBase || '0.00', ownerAmount: share?.ownerAmount || '0.00', adminAmount: share?.adminAmount || '0.00', therapistAmount: share?.therapistAmount || '0.00', projected: splitRevenue(serviceBase, policy), frozen: !!share, events }
}
export async function backfillRevenueShares() {
  const candidates = await db.select({ id: s.orders.id }).from(s.orders).where(sql`not exists (select 1 from ${s.orderRevenueShares} where ${s.orderRevenueShares.orderId} = ${s.orders.id}) and (exists (select 1 from ${s.payments} where ${s.payments.orderId} = ${s.orders.id}) or ${s.orders.orderStatus} in ('COMPLETED', 'PAID', 'CLOSED'))`)
  for (const row of candidates) await db.transaction(async tx => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, row.id)).for('update')
    await syncRevenueShare(tx, order, 'OPENING_BALANCE', `opening:${order.id}`, null)
  })
  return candidates.length
}
