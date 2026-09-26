import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whatsappNumber, whatsappUrl } from '../shared/utils/whatsapp.js'
test('WhatsApp numbers normalize Indonesian local and international formats without accepting malformed destinations', () => {
  assert.equal(whatsappNumber('0812 3456-7890'), '6281234567890')
  assert.equal(whatsappNumber('+62 (812) 34567890'), '6281234567890')
  assert.equal(whatsappNumber('+44 7700 900123'), '447700900123')
  for (const value of ['', null, '123', '62812abc', '1234567890123456']) assert.equal(whatsappNumber(value), null)
  const message = 'Job\nhttps://spa.example/job/token?test=a&b=1'
  const url = new URL(whatsappUrl('+6281234567890', message))
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.searchParams.get('text'), message)
  assert.equal(whatsappUrl('', message), null)
})
