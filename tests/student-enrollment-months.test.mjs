import test from 'node:test'
import assert from 'node:assert/strict'
import { getEnrollmentMonths } from '../src/utils/studentEnrollment.js'

test('enrollment duration uses calendar months rather than completed days or 30-day periods', () => {
  const now = new Date(2026, 9, 28, 12)
  for (const [date, expected] of [
    ['2026-10-01', 0], ['2026-10-28', 0], ['2026-09-01', 1], ['2026-09-30', 1],
    ['2026-01-31', 9], ['2025-10-28', 12], ['2025-10-31', 12], ['2024-02-29', 32]
  ]) assert.equal(getEnrollmentMonths(date, now), expected, date)
  assert.equal(getEnrollmentMonths('2026-09-30', new Date(2026, 9, 1)), 1)
  assert.equal(getEnrollmentMonths('2025-12-31', new Date(2026, 0, 1)), 1)
  assert.equal(getEnrollmentMonths('2024-01-31', new Date(2024, 1, 1)), 1)
})

test('missing and invalid enrollment dates remain unset, while future dates never give negative months', () => {
  const now = new Date(2026, 9, 28, 12)
  for (const date of [undefined, null, '', 'bad', '2025-02-29', '2026-04-31', '2026-00-10',
    '2026-13-10', '2026-10-00', '2026-1-01', '2026-10-28T00:00:00Z', '0000-01-01', 20261028, {}]) {
    assert.equal(getEnrollmentMonths(date, now), null, String(date))
  }
  for (const date of ['2026-10-29', '2026-11-01', '2030-01-01']) {
    assert.equal(getEnrollmentMonths(date, now), 0, date)
  }
  assert.equal(getEnrollmentMonths('2026-10-01', new Date('invalid')), null)
})

test('the default clock and an explicit local date follow month and year boundaries', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 11, 31, 23, 59, 59) })
  t.after(() => t.mock.timers.reset())
  assert.equal(getEnrollmentMonths('2026-09-30'), 3)
  t.mock.timers.tick(1000)
  assert.equal(getEnrollmentMonths('2026-09-30'), 4)
  assert.equal(getEnrollmentMonths('2026-12-31', new Date(2026, 11, 31)), 0)
  assert.equal(getEnrollmentMonths('2026-12-31', new Date(2027, 0, 1)), 1)
})
