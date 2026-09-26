import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoneyInput, parseMoneyInput } from '../shared/utils/money-input.js'

test('rupiah inputs preserve the numerical amount through grouping and decimal edits', () => {
  for (const [input, amount, text] of [
    ['250000', 250000, '250.000'], ['1.000', 1000, '1.000'],
    ['Rp 1.234.567,89', 1234567.89, '1.234.567,89'],
    ['1234.50', 1234.5, '1.234,50'], ['0,01', .01, '0,01'],
    ['1000,', 1000, '1.000,'], ['000123', 123, '123'],
    ['', null, ''], ['0', 0, '0']
  ]) assert.deepEqual(parseMoneyInput(input), { amount, text, valid: true })
  assert.equal(formatMoneyInput('250000.00'), '250.000')
  assert.equal(formatMoneyInput(1234567.89), '1.234.567,89')
  assert.equal(formatMoneyInput(null), '')
})

test('invalid monetary input cannot silently turn into a different valid amount', () => {
  for (const input of ['-1000', '1e6', '12abc34', '12.34.567', '100,001', '1,234.56', 'Infinity']) {
    assert.equal(parseMoneyInput(input).valid, false)
    assert.equal(parseMoneyInput(input).amount, null)
  }
})
