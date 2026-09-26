import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import pg from 'pg'
import { databaseURL } from '../server/database/config.js'

// Own disposable database only; no demo fixtures touch the workspace database.
const name = `spa_deploy_verify_${Date.now()}`
const root = new pg.Client({ connectionString: databaseURL() })
const url = new URL(databaseURL()); url.pathname = '/' + name
const port = Number(process.env.DEPLOYMENT_TEST_PORT || 3107)
const base = `http://127.0.0.1:${port}`
const env = { ...process.env, DATABASE_URL: url.toString(), SESSION_SECRET: randomBytes(32).toString('hex'), APP_URL: base, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production', COOKIE_SECURE: 'false', SEED_DEMO: 'true', SEED_PASSWORD: randomBytes(16).toString('hex'), TRUST_PROXY_HOPS: '1', BOOKING_RATE_LIMIT_IP_MAX: '2', BOOKING_RATE_LIMIT_IP_WINDOW_SECONDS: '60', BOOKING_RATE_LIMIT_PHONE_MAX: '2', BOOKING_RATE_LIMIT_PHONE_WINDOW_SECONDS: '60', BOOKING_RATE_LIMIT_GLOBAL_MAX: '20', BOOKING_RATE_LIMIT_GLOBAL_WINDOW_SECONDS: '60' }
let server, database, created = false, checks = 0
const verify = condition => { assert(condition); checks++ }
function command(script, variables = env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: variables, stdio: ['ignore','pipe','pipe'] })
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data)
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)))
  })
}
async function start(hops = '1') {
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...env, TRUST_PROXY_HOPS: hops }, stdio: ['ignore','pipe','pipe'] })
  let output = ''; server.stdout.on('data', data => output += data); server.stderr.on('data', data => output += data)
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try { if ((await fetch(base + '/api/health')).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Production server tidak siap: ' + output)
}
async function stop() {
  if (!server || server.exitCode !== null) return
  const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited
}
function key(scope, identity) { return scope + ':' + createHash('sha256').update(identity).digest('hex') }
function request(ip, body = {}, prefix = '') {
  return fetch(base + '/api/public/booking', { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-forwarded-for': prefix + ip }, body: JSON.stringify(body) })
}
const booking = phone => ({ name: 'Customer rate limit test', phone, locationId: 1, bookingDate: new Date(Date.now()+86400000*2).toISOString().slice(0,10), bookingTime: '13:00', address: 'Alamat test deployment', services: [{ serviceId: 1, qty: 1 }], notes: '' })

try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  await command('scripts/prepare-deployment.js')
  database = new pg.Client({ connectionString: url.toString() }); await database.connect()
  const before = (await database.query('SELECT count(*)::int AS n FROM users')).rows[0].n
  verify(before > 0)
  await command('scripts/prepare-deployment.js')
  verify((await database.query('SELECT count(*)::int AS n FROM users')).rows[0].n === before)
  await start()
  verify((await fetch(base + '/api/health')).status === 200)
  const docs = await fetch(base + '/dokumentasi.html'); verify(docs.status === 200); verify(docs.headers.get('content-type').includes('text/html'))
  const html = await docs.text(); verify(html.includes('Panduan demo')); verify(!/<script/i.test(html)); verify(!html.includes(env.SEED_PASSWORD))
  verify((await fetch(base + '/')).status === 200)
  verify((await fetch(base + '/book')).status === 200)
  const baseline = (await database.query('SELECT count(*)::int AS n FROM orders')).rows[0].n
  verify((await request('192.0.2.10')).status === 422)
  verify((await request('192.0.2.10')).status === 422)
  const limited = await request('192.0.2.10'); verify(limited.status === 429); verify(Number(limited.headers.get('retry-after')) > 0)
  verify((await request('192.0.2.10', {}, '198.51.100.77, ')).status === 429)
  verify((await database.query('SELECT count(*)::int AS n FROM orders')).rows[0].n === baseline)
  verify((await request('192.0.2.20', booking('+628119990001'))).status === 200)
  verify((await request('192.0.2.21', booking('08119990001'))).status === 200)
  verify((await request('192.0.2.22', booking('+628119990001'))).status === 429)
  const batch = await Promise.all(Array.from({ length: 8 }, (_, i) => request(`192.0.2.${30+i}`, booking('+628119990002'))))
  verify(batch.filter(response => response.status === 200).length === 2)
  verify(batch.filter(response => response.status === 429).length === 6)
  verify((await database.query('SELECT count(*)::int AS n FROM orders')).rows[0].n === baseline + 4)
  await stop(); await start()
  verify((await request('192.0.2.10')).status === 429)
  await database.query('UPDATE public_booking_limits SET expires_at=now()-interval \'1 second\' WHERE bucket_key=$1', [key('ip','192.0.2.10')])
  verify((await request('192.0.2.10')).status === 422)
  await database.query('UPDATE public_booking_limits SET hit_count=20,expires_at=now()+interval \'60 seconds\' WHERE bucket_key=$1', [key('global','public-booking')])
  verify((await request('192.0.2.200')).status === 429)
  await database.query('DELETE FROM public_booking_limits WHERE bucket_key=$1', [key('global','public-booking')])
  await stop(); await start('0')
  verify((await request('198.51.100.1')).status === 422); verify((await request('198.51.100.2')).status === 422); verify((await request('198.51.100.3')).status === 429)
  // Bootstrap a production owner in the same disposable database after clearing only fixture data.
  await stop()
  const tables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row => '"' + row.tablename.replaceAll('"','""') + '"')
  await database.query('TRUNCATE ' + tables.join(',') + ' RESTART IDENTITY CASCADE')
  await command('scripts/prepare-deployment.js', { ...env, SEED_DEMO: 'false', BOOTSTRAP_OWNER_EMAIL: 'owner@deploy-test.local', BOOTSTRAP_OWNER_PASSWORD: env.SEED_PASSWORD })
  verify((await database.query('SELECT count(*)::int AS n FROM users')).rows[0].n === 1)
  verify((await database.query('SELECT count(*)::int AS n FROM customers')).rows[0].n === 0)
} finally {
  await stop(); if (database) await database.end()
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
}
console.log(`Deployment and booking rate limit: ${checks} checks passed. Disposable database cleaned up.`)
