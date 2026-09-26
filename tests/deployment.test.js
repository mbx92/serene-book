import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'pg-connection-string'
import { databaseURL } from '../server/database/config.js'
import { resolveClientIP } from '../server/utils/client-ip.js'
import { bookingPhoneIdentity } from '../server/services/booking-rate-limit.service.js'

test('deployment connection configuration preserves special characters in credentials', () => {
  const config = parse(databaseURL({ DATABASE_HOST: 'postgres', DATABASE_USER: 'spa-user', DATABASE_PASSWORD: 'test@p:a%25/ss?#word', DATABASE_NAME: 'spa_management' }))
  assert.equal(config.password, 'test@p:a%25/ss?#word'); assert.equal(config.user, 'spa-user')
  assert.equal(config.host, 'postgres'); assert.equal(config.database, 'spa_management')
  assert.equal(databaseURL({ DATABASE_URL: 'postgresql://explicit' }), 'postgresql://explicit')
  assert.throws(() => databaseURL({}), /belum lengkap/)
})
test('client IP ignores spoofed prefixes and trusts only configured proxy hops', () => {
  assert.equal(resolveClientIP('127.0.0.1', '192.0.2.1', 0), '127.0.0.1')
  assert.equal(resolveClientIP('10.0.0.1', '192.0.2.99, 198.51.100.1', 1), '198.51.100.1')
  assert.equal(resolveClientIP('10.0.0.1', '192.0.2.99, 198.51.100.1', 2), '192.0.2.99')
  assert.equal(resolveClientIP('127.0.0.1', 'invalid', 1), '127.0.0.1')
  assert.equal(resolveClientIP('127.0.0.1', 'fe80::1%invalid', 1), '127.0.0.1')
  assert.equal(resolveClientIP('::ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(resolveClientIP('2001:db8:0:0::1'), '2001:db8::1')
  assert.equal(resolveClientIP('127.0.0.1', '192.0.2.1', 2), '127.0.0.1')
})
test('booking limits normalize local and international WhatsApp numbers', () => {
  assert.equal(bookingPhoneIdentity('0812 3456 7890'), '6281234567890')
  assert.equal(bookingPhoneIdentity('+6281234567890'), '6281234567890')
  assert.equal(bookingPhoneIdentity('81234567890'), '6281234567890')
})
