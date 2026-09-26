import { spawn } from 'node:child_process'
import pg from 'pg'
import { databaseURL } from '../server/database/config.js'

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} gagal (${code})`)))
  })
}
async function prepare() {
  if ((process.env.SESSION_SECRET || '').length < 32) throw new Error('SESSION_SECRET minimal 32 karakter diperlukan')
  const origin = new URL(process.env.APP_URL || '')
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.APP_URL) throw new Error('APP_URL harus origin HTTP/HTTPS tanpa path atau trailing slash')
  if (!['true','false'].includes(process.env.SEED_DEMO || 'false')) throw new Error('SEED_DEMO harus true atau false')
  if (process.env.SEED_DEMO === 'true' && (process.env.SEED_PASSWORD || '').length < 10) throw new Error('SEED_PASSWORD minimal 10 karakter diperlukan untuk demo')
  process.env.DATABASE_URL = databaseURL()
  await run('scripts/migrate.js')
  const connection = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await connection.connect()
  try {
    await connection.query('SELECT pg_advisory_lock(187402, 1)')
    const { rows } = await connection.query('SELECT id FROM users LIMIT 1')
    if (!rows.length) {
      if (process.env.SEED_DEMO === 'true') await run('scripts/seed.js')
      else await run('scripts/bootstrap-owner.js')
    } else console.log('Database sudah diinisialisasi; data dan password tidak ditimpa.')
  } finally { await connection.end() }
}
prepare().catch(error => { console.error('[deployment]', error.message); process.exitCode = 1 })
