import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { updateStatus } from '../src/services/teacherService.js'

test('stopping a teacher only blocks trials whose start is still in the future', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  t.after(() => t.mock.timers.reset())
  let bookings = []
  let updates = []
  let trialQuery = null
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      if (sql.startsWith('SELECT id FROM teachers')) return [[{ id: 'teacher-1' }]]
      if (sql.startsWith('SELECT * FROM teachers')) return [[{ id: 'teacher-1', name: '林老师', status: 'deleted' }]]
      if (sql.startsWith('SELECT id, teacher_id FROM users')) return [[]]
      if (sql.startsWith('SELECT id FROM courses')) return [[]]
      if (sql.startsWith('SELECT id FROM trial_bookings')) {
        trialQuery = { sql, params }
        const [, afterDate, onDate, afterTime] = params
        return [bookings.filter(b => b.date > afterDate || (b.date === onDate && b.startTime > afterTime)).slice(0, 1)]
      }
      if (sql.startsWith('UPDATE teachers') || sql.startsWith('UPDATE users')) {
        updates.push(sql)
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }))
  t.mock.method(pool, 'execute', async sql => { throw new Error(`unexpected pool query: ${sql}`) })

  bookings = [{ id: 'past', date: '2030-09-28', startTime: '09:00' }]
  await updateStatus('teacher-1', 'deleted')
  assert.equal(updates.length, 2)
  assert.match(trialQuery.sql, /booking_date > \? OR \(booking_date = \? AND start_time > \?\)/)
  assert.deepEqual(trialQuery.params, ['teacher-1', '2030-09-28', '2030-09-28', '15:00'])

  updates = []
  bookings = [{ id: 'exact', date: '2030-09-28', startTime: '15:00' }]
  await updateStatus('teacher-1', 'deleted')
  assert.equal(updates.length, 2)

  for (const booking of [
    { id: 'later-today', date: '2030-09-28', startTime: '16:00' },
    { id: 'tomorrow', date: '2030-09-29', startTime: '09:00' }
  ]) {
    updates = []
    bookings = [booking]
    await assert.rejects(updateStatus('teacher-1', 'deleted'), error =>
      error.status === 409 && /未来的试听预约/.test(error.message))
    assert.equal(updates.length, 0)
  }
})
