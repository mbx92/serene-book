import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { backfillRevenueShares } from '../server/services/revenue-sharing.service.js'
import { db, pool } from '../server/database/index.js'
const lock = await pool.connect()
try {
  await lock.query('SELECT pg_advisory_lock(187402, 0)')
  await migrate(db, { migrationsFolder: './server/database/migrations' })
  console.log(`Migrations complete. ${await backfillRevenueShares()} opening revenue balances created.`)
} finally {
  await lock.query('SELECT pg_advisory_unlock(187402, 0)'); lock.release(); await pool.end()
}
