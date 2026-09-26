import { eq } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { OWNER_ROLES, ADMIN_ROLES, permit } from '../utils/auth.js'
export async function billingPolicy(connection = db) {
  const [settings] = await connection.select().from(s.billingSettings).where(eq(s.billingSettings.id, 1))
  if (!settings) throw new Error('Jalankan migrasi pengaturan transport dan pajak')
  return { transportEnabled: settings.transportEnabled, taxEnabled: settings.taxEnabled }
}
export async function getBillingSettings(user) { permit(user, ADMIN_ROLES); return billingPolicy() }
export async function saveBillingSettings(body, user) {
  permit(user, OWNER_ROLES)
  return db.transaction(async tx => {
    const [before] = await tx.select().from(s.billingSettings).where(eq(s.billingSettings.id, 1)).for('update')
    await tx.update(s.billingSettings).set({ ...body, updatedBy: user.id, updatedAt: new Date() }).where(eq(s.billingSettings.id, 1))
    await tx.insert(s.auditLogs).values({ userId: user.id, action: 'BILLING_SETTINGS_UPDATED', entity: 'billing_settings', entityId: 1, data: { before: { transportEnabled: before.transportEnabled, taxEnabled: before.taxEnabled }, after: body } })
    return body
  })
}
