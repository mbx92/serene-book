import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const port = 3108
const origin = `http://localhost:${port}`
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
server.stdout.on('data', chunk => { logs += chunk })
server.stderr.on('data', chunk => { logs += chunk })
let browser
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++; console.log(`PASS ${message}`) }
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Production server exited before startup')
    try { ready = (await fetch(`${origin}/manifest.webmanifest`)).ok } catch {}
    if (ready) break
    await delay(500)
  }
  check(ready, 'production server starts')
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`)
  const manifest = await manifestResponse.json()
  check(manifest.id === '/' && manifest.scope === '/' && manifest.display === 'standalone', 'manifest provides stable app identity and standalone mode')
  check(manifest.icons.some(icon => icon.purpose === 'maskable'), 'manifest includes a maskable icon')
  for (const icon of manifest.icons) {
    const response = await fetch(`${origin}${icon.src}`)
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    check(response.ok && `${metadata.width}x${metadata.height}` === icon.sizes, `icon dimensions match ${icon.src}`)
  }
  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url))
  check(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'ICO contains three sizes for browser compatibility')
  const swResponse = await fetch(`${origin}/sw.js`)
  check(/javascript/.test(swResponse.headers.get('content-type')), 'service worker has JavaScript MIME type')
  check(swResponse.headers.get('cache-control') === 'no-cache', 'service worker update bypasses stale HTTP cache')

  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.goto(`${origin}/book`)
  await page.waitForFunction(() => document.querySelector('[data-app-ready="true"]'))
  check(await page.locator('link[rel="icon"][href="/favicon.svg?v=3"]').count() === 1, 'booking uses the transparent flower favicon')
  check((await page.locator('link[rel="manifest"]').getAttribute('href')).startsWith('/api/public/branding-manifest'), 'application links its manifest')
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 })
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return { scope: registration.scope, state: registration.active.state }
  })
  check(registration.scope === `${origin}/` && registration.state === 'activated', 'production service worker activates with root scope')
  const cdp = await context.newCDPSession(page)
  const installability = await cdp.send('Page.getInstallabilityErrors')
  check(installability.installabilityErrors.length === 0, 'Chromium reports no PWA installability errors')

  await page.goto(`${origin}/login`)
  await page.goto(`${origin}/job/pwa-privacy-test-token`)
  await page.evaluate(() => fetch('/api/auth/me').catch(() => {}))
  const cachedURLs = await page.evaluate(async () => {
    const names = await caches.keys()
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat()
  })
  const allowed = ['/offline.html', '/dokumentasi.html', '/favicon.svg', '/favicon.ico', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']
  check(cachedURLs.length === allowed.length && cachedURLs.every(path => allowed.includes(path)), 'cache contains only public help and icons, no APIs, booking, login or job tokens')

  await context.setOffline(true)
  await page.goto(`${origin}/book`)
  check(await page.locator('h1').textContent() === 'Koneksi internet terputus.', 'offline booking navigation shows connection help')
  check(await page.locator('form').count() === 0, 'offline page offers no transaction form')
  const retry = page.locator('a').filter({ hasText: 'Coba lagi' })
  check(await retry.evaluate(element => element.href) === `${origin}/book`, 'retry keeps the originally requested page')
  await page.goto(`${origin}/dokumentasi.html`)
  check(await page.locator('h1').textContent() === 'Satu panduan untuksetiap alur pelayanan.', 'public HTML guide remains available offline')
  check(await page.evaluate(async () => { try { await fetch('/api/auth/me'); return false } catch { return true } }), 'API requests fail offline rather than returning cached account data')
  const failedPost = await page.evaluate(async () => {
    try { await fetch('/api/bookings', { method: 'POST', body: '{}' }); return false } catch { return true }
  })
  check(failedPost, 'offline POST fails without replay or fake success')
  await context.setOffline(false)
  await page.goto(`${origin}/book`)
  await page.waitForFunction(() => document.querySelector('[data-app-ready="true"]'))
  check(await page.locator('form').count() > 0, 'booking form returns after reconnecting')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/pwa-booking.png' })
  console.log(`PWA verification complete: ${checks} checks passed.`)
} catch (error) {
  console.error(logs.slice(-2000))
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(3000)] )
  if (server.exitCode === null) server.kill('SIGKILL')
}
