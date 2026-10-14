import test from 'node:test'
import assert from 'node:assert/strict'
import { groupScheduleItems, layoutScheduleItems, scheduleSlotOffsets } from '../src/utils/scheduleLayout.js'

const course = (id, startTime, endTime) => ({ id, startTime, endTime })

test('compact timeline leaves short empty slots and enough space for successive card text', () => {
  const items = [
    { ...course('long', '09:00', '12:00'), minimumHeight: 80 },
    { ...course('half', '09:00', '09:30'), minimumHeight: 60 },
    { ...course('next-half', '09:30', '10:00'), minimumHeight: 60 },
    { ...course('hour', '10:00', '11:00'), minimumHeight: 94 }
  ]
  const before = structuredClone(items)
  const offsets = scheduleSlotOffsets(items, 450, 1350, 32)
  assert.equal(offsets.length, 31)
  assert.equal(offsets[1] - offsets[0], 32, 'unoccupied slots stay short')
  assert.ok(offsets[4] - offsets[3] >= 60, 'a half-hour card does not cover its next course')
  assert.ok(offsets[5] - offsets[4] >= 60)
  assert.ok(offsets[7] - offsets[5] >= 94, 'long names and booking details fit before the next hour')
  assert.ok(offsets.at(-1) < 1200, 'the timeline stays shorter than the expanded grid')
  assert.deepEqual(items, before)
})

test('compact timeline handles off-grid boundaries and shorter appointments without losing text space', () => {
  const offsets = scheduleSlotOffsets([
    { ...course('short', '09:00', '09:15'), minimumHeight: 72 },
    { ...course('outside', '06:00', '07:00'), minimumHeight: 80 },
    { ...course('late', '22:00', '23:00'), minimumHeight: 80 }
  ], 450, 1350, 32)
  assert.ok((offsets[4] - offsets[3]) / 2 >= 72, 'even a fifteen-minute appointment fits its card text')
  assert.equal(offsets[1], 32, 'an entirely off-grid course does not expand the timeline')
  assert.ok(offsets[30] - offsets[29] >= 80, 'partially visible late cards keep enough room')
})

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

test('parallel layout preserves times and reuses a column at an exact end boundary', () => {
  const input = [course('long', '09:00', '12:00'), course('early', '09:00', '10:00'),
    course('middle', '09:30', '10:30'), course('reuse', '10:00', '11:00'), course('next', '12:00', '13:00')]
  const original = structuredClone(input)
  const output = layoutScheduleItems(input)
  const byId = Object.fromEntries(output.map(item => [item.id, item]))
  assert.equal(byId.long.laneIndex, 0)
  assert.equal(byId.early.laneIndex, 1)
  assert.equal(byId.middle.laneIndex, 2)
  assert.equal(byId.reuse.laneIndex, 1)
  assert.equal(byId.next.laneIndex, 0)
  assert.deepEqual(output.map(item => item.laneCount), [3, 3, 3, 3, 1])
  assert.deepEqual(input, original, 'layout must not mutate source data')
  for (const item of output) {
    const source = original.find(entry => entry.id === item.id)
    assert.equal(item.startTime, source.startTime)
    assert.equal(item.endTime, source.endTime)
    for (const other of output) {
      if (item.id === other.id || item.endTime <= other.startTime || other.endTime <= item.startTime) continue
      assert.notEqual(item.laneIndex, other.laneIndex, 'simultaneous courses must occupy distinct columns')
    }
  }
})

test('a chain of overlaps needs only the peak number of concurrent columns', () => {
  const output = layoutScheduleItems([course('a', '09:00', '10:00'), course('b', '09:30', '10:30'), course('c', '10:00', '11:00')])
  assert.deepEqual(output.map(item => [item.laneIndex, item.laneCount]), [[0, 2], [1, 2], [0, 2]])
  assert.deepEqual(layoutScheduleItems([]), [])
})
