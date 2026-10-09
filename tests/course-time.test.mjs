import test from 'node:test'
import assert from 'node:assert/strict'
import { courseEndTime } from '../shared/courseTime.js'

test('end time follows the chosen start and half-hour course hours', () => {
  assert.equal(courseEndTime('09:00', 0.5), '09:30')
  assert.equal(courseEndTime('09:00', 1.5), '10:30')
  assert.equal(courseEndTime('13:30', '2'), '15:30')
  assert.equal(courseEndTime('22:00', 0.5), '22:30')
  assert.equal(courseEndTime('07:30', 15), '22:30')
})

test('invalid hours, clock values and an end after the grid boundary cannot be saved', () => {
  for (const [start, hours] of [['09:15', 1], ['06:30', 1], ['24:00', 1], ['09:00', 0], ['09:00', 0.75], ['09:00', NaN], ['22:00', 1], ['09:00', 999.5]]) {
    assert.equal(courseEndTime(start, hours), '')
  }
})
