import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { brandingSchema } from '../shared/schemas/index.js'
import { normalizeBrandImage } from '../server/utils/brand-image.js'

test('branding validates names and rejects SVG, remote URLs and oversized uploads', () => {
  assert.equal(brandingSchema.parse({ appName: '  Spa Baru  ', logo: null, favicon: null }).appName, 'Spa Baru')
  for (const appName of ['', 'a', 'a'.repeat(81)]) assert.equal(brandingSchema.safeParse({ appName, logo: null, favicon: null }).success, false)
  for (const logo of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + 'a'.repeat(2800000)]) assert.equal(brandingSchema.safeParse({ appName: 'Spa Baru', logo, favicon: null }).success, false)
})
test('uploaded raster is decoded and normalized to a square PNG with transparency', async () => {
  const input = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#41777a' } }).jpeg().toBuffer()
  const output = await normalizeBrandImage(`data:image/jpeg;base64,${input.toString('base64')}`, 512)
  const metadata = await sharp(Buffer.from(output.split(',')[1], 'base64')).metadata()
  assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.hasAlpha, true)
  assert.equal(await normalizeBrandImage(null, 512), null)
})
test('invalid image contents and embedded SVG are rejected despite a PNG data URL', async () => {
  for (const content of ['invalid image', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>']) {
    await assert.rejects(normalizeBrandImage(`data:image/png;base64,${Buffer.from(content).toString('base64')}`, 64), { statusCode: 400 })
  }
})
