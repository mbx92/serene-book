import { test } from 'node:test'
import assert from 'node:assert/strict'
import { treatmentWindow, countdownLabel } from '../shared/utils/treatment.js'
test('completion uses actual start plus snapshot duration, with an exact completion boundary', () => {
  const start = '2026-09-27T06:15:00.000Z'
  const timing = treatmentWindow(start, 90, '2026-09-27T07:44:59.001Z')
  assert.equal(timing.endsAt, '2026-09-27T07:45:00.000Z')
  assert.equal(timing.remainingSeconds, 1); assert.equal(timing.canComplete, false)
  assert.equal(treatmentWindow(start, 90, timing.endsAt).canComplete, true)
  assert.equal(treatmentWindow(start, 90, '2026-09-28T07:00:00Z').remainingSeconds, 0)
  assert.equal(treatmentWindow(start, 60 * 2 + 90, start).remainingSeconds, 210 * 60)
  for (const [date, duration] of [[null, 60], ['invalid', 60], [start, 0], [start, -1], [start, NaN]]) assert.equal(treatmentWindow(date, duration, start).canComplete, false)
})
test('countdown displays hours, minutes and seconds without going negative', () => {
  assert.equal(countdownLabel(3600), '01:00:00'); assert.equal(countdownLabel(90), '00:01:30')
  assert.equal(countdownLabel(0), '00:00:00'); assert.equal(countdownLabel(-10), '00:00:00')
  assert.equal(countdownLabel(null), '—'); assert.equal(countdownLabel(24 * 3600), '24:00:00')
})
