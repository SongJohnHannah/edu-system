import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { create } from '../src/services/trialBookingService.js'

test('trial creation reads its response inside the transaction before commit', async t => {
  let committed = false
  let insertedId = null
  let released = false
  const conn = {
    beginTransaction: async () => {},
    commit: async () => { committed = true },
    rollback: async () => {},
    release: () => { released = true },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      if (sql.startsWith('SELECT * FROM students WHERE')) return [[{ id: 'student-1', name: '试听学生', enrollment_stage: 'pending' }]]
      if (sql.startsWith('SELECT * FROM teachers WHERE')) return [[{ id: 'teacher-1', name: '林老师' }]]
      if (sql.startsWith('SELECT * FROM trial_bookings WHERE booking_date')) return [[]]
      if (sql.startsWith('SELECT * FROM trial_bookings WHERE id')) {
        assert.equal(committed, false, 'response lookup must precede commit')
        return [[{
          id: insertedId, student_id: 'student-1', teacher_id: 'teacher-1', course_id: null,
          occurrence_date: null, booking_date: '2030-09-30', start_time: '10:00', end_time: '11:00',
          status: 'active', student_name_snapshot: '试听学生', teacher_name_snapshot: '林老师',
          course_name_snapshot: null, is_test: 0, created_at: new Date('2030-09-29T10:00:00+08:00'),
          updated_at: new Date('2030-09-29T10:00:00+08:00')
        }]]
      }
      if (sql.startsWith('INSERT INTO trial_bookings')) { insertedId = params[0]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('SELECT id, name FROM teachers')) return [[]]
      if (sql.startsWith('SELECT * FROM courses') || sql.startsWith('SELECT * FROM course_') ||
          sql.startsWith('SELECT course_id, occurrence_date')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  t.mock.method(pool, 'execute', async () => { throw new Error('post-commit pool read failed') })

  const booking = await create({
    studentId: 'student-1', teacherId: 'teacher-1', date: '2030-09-30',
    startTime: '10:00', endTime: '11:00'
  }, null)
  assert.equal(booking.id, insertedId)
  assert.equal(booking.studentName, '试听学生')
  assert.equal(committed, true)
  assert.equal(released, true)
})
