import test from 'node:test'
import assert from 'node:assert/strict'

test('工作台和日历读取超过一页的点名历史', async () => {
  const rows = Array.from({ length: 201 }, (_, index) => ({ id: `record-${index}` }))
  const offsets = []
  globalThis.window = { dispatchEvent() {} }
  globalThis.Event = class Event { constructor(type) { this.type = type } }
  globalThis.localStorage = { getItem() { return null } }
  globalThis.fetch = async url => {
    const query = new URL(url, 'http://localhost').searchParams
    const offset = Number(query.get('offset') || 0)
    const limit = Number(query.get('limit') || 50)
    offsets.push(offset)
    const data = rows.slice(offset, offset + limit)
    return { ok: true, json: async () => ({ data, hasMore: offset + limit < rows.length }) }
  }
  const { getAllAttendance } = await import('../src/utils/storage.api.js')
  const result = await getAllAttendance()
  assert.equal(result.length, 201)
  assert.deepEqual(offsets, [0, 200])
})

test('试听预约列表读取超过旧的 1000 条上限', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `booking-${index}` }))
  const offsets = []
  globalThis.window = { dispatchEvent() {} }
  globalThis.Event = class Event { constructor(type) { this.type = type } }
  globalThis.localStorage = { getItem() { return null } }
  globalThis.fetch = async url => {
    const query = new URL(url, 'http://localhost').searchParams
    const offset = Number(query.get('offset') || 0)
    const limit = Number(query.get('limit') || 500)
    offsets.push(offset)
    return { ok: true, json: async () => rows.slice(offset, offset + limit) }
  }
  const { getTrialBookings } = await import('../src/utils/storage.api.js')
  const result = await getTrialBookings({ status: 'active' })
  assert.equal(result.length, 1001)
  assert.deepEqual(offsets, [0, 500, 1000])
})

test('学生课时历史读取超过 500 条后仍保留完整流水', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `hour-${index}`, type: 'add', hours: 0.5 }))
  const offsets = []
  globalThis.window = { dispatchEvent() {} }
  globalThis.Event = class Event { constructor(type) { this.type = type } }
  globalThis.localStorage = { getItem() { return null } }
  globalThis.fetch = async url => {
    const query = new URL(url, 'http://localhost').searchParams
    assert.equal(query.get('studentId'), 'student-1')
    const offset = Number(query.get('offset') || 0)
    const limit = Number(query.get('limit') || 500)
    offsets.push(offset)
    return { ok: true, json: async () => ({ data: rows.slice(offset, offset + limit), hasMore: offset + limit < rows.length }) }
  }
  const { getHourRecordsByStudent } = await import('../src/utils/storage.api.js')
  const result = await getHourRecordsByStudent('student-1')
  assert.equal(result.length, 1001)
  assert.deepEqual(offsets, [0, 500, 1000])
})
