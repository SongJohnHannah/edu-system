import test from 'node:test'
import assert from 'node:assert/strict'
import { groupScheduleItems } from '../src/utils/scheduleLayout.js'

const course = (id, startTime, endTime) => ({ id, startTime, endTime })

test('partly overlapping courses form one selection group with their full time range', () => {
  const input = [course('english', '09:30', '10:30'), course('pu', '09:00', '10:00')]
  const [group] = groupScheduleItems(input)
  assert.deepEqual(group.items.map(item => item.id), ['pu', 'english'])
  assert.equal(group.startTime, '09:00')
  assert.equal(group.endTime, '10:30')
  assert.equal(input[0].id, 'english', 'layout must not reorder source records')
})

test('chained and contained overlaps remain selectable, while adjacent classes stay separate', () => {
  const groups = groupScheduleItems([
    course('a', '09:00', '10:00'), course('b', '09:30', '11:00'),
    course('inside', '10:00', '10:30'), course('c', '10:30', '11:30'),
    course('adjacent', '11:30', '12:00')
  ])
  assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [['a', 'b', 'inside', 'c'], ['adjacent']])
  assert.equal(groups[0].endTime, '11:30')
  assert.deepEqual(groupScheduleItems([]), [])
})
