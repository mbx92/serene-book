import argon2 from 'argon2'
import { db, pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_OWNER_PASSWORD
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 10) throw new Error('BOOTSTRAP_OWNER_EMAIL valid dan BOOTSTRAP_OWNER_PASSWORD minimal 10 karakter diperlukan')
try {
  await db.transaction(async tx => {
    const [existing] = await tx.select({ id: s.users.id }).from(s.users).limit(1)
    if (existing) { console.log('Bootstrap dilewati: user sudah tersedia.'); return }
    const roles = await tx.insert(s.roles).values(['SUPER_ADMIN','OWNER','CUSTOMER_SERVICE','LOCATION_ADMIN','THERAPIST'].map(code => ({ code, name: code.replaceAll('_',' ') }))).onConflictDoNothing().returning()
    const ownerRole = roles.find(role => role.code === 'OWNER') || (await tx.select().from(s.roles)).find(role => role.code === 'OWNER')
    const [user] = await tx.insert(s.users).values({ name: process.env.BOOTSTRAP_OWNER_NAME || 'Owner', email, passwordHash: await argon2.hash(password) }).returning()
    await tx.insert(s.userRoles).values({ userId: user.id, roleId: ownerRole.id })
    console.log('Akun owner awal dibuat. Tidak ada data demo yang dimasukkan.')
  })
} finally { await pool.end() }
