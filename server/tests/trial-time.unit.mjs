import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import * as trials from '../src/services/trialBookingService.js'

test('an already-started booking from today cannot be cancelled', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  const executed = []
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      executed.push(sql)
      if (sql.startsWith('SELECT teacher_id, status, booking_date')) return [[{
        teacher_id: 'teacher-a', status: 'active', booking_date: '2030-09-28', start_time: '09:00'
      }]]
      throw new Error(`unexpected query: ${sql}`)
    },
    rollback: async () => {},
    release: () => {}
  }))
  t.after(() => t.mock.timers.reset())

  await assert.rejects(trials.cancel('booking-1', 'teacher-a'), error =>
    error.status === 400 && /过去的预约不能取消/.test(error.message))
  assert.equal(executed.some(sql => sql.startsWith('UPDATE')), false)
})

test('an already-started booking from today cannot be edited', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  const executed = []
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      executed.push(sql)
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT * FROM trial_bookings WHERE id')) return [[{
        teacher_id: 'teacher-a', status: 'active', booking_date: '2030-09-28', start_time: '09:00'
      }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    },
    rollback: async () => {},
    release: () => {}
  }))
  t.after(() => t.mock.timers.reset())

  await assert.rejects(trials.update('booking-1', {}, 'teacher-a'), error =>
    error.status === 400 && /过去的预约不能修改/.test(error.message))
  assert.equal(executed.some(sql => sql.startsWith('UPDATE')), false)
})

test('a new booking cannot start earlier today', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  const executed = []
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      executed.push(sql)
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT * FROM students')) return [[{ name: '试听学生', enrollment_stage: 'pending' }]]
      if (sql.startsWith('SELECT * FROM teachers')) return [[{ name: '林老师' }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    },
    rollback: async () => {},
    release: () => {}
  }))
  t.after(() => t.mock.timers.reset())

  await assert.rejects(trials.create({
    studentId: 'student-a', teacherId: 'teacher-a', date: '2030-09-28',
    startTime: '09:00', endTime: '10:00'
  }, 'teacher-a'), error => error.status === 400 && /不能预约已开始的时段/.test(error.message))
  assert.equal(executed.some(sql => sql.startsWith('INSERT')), false)
})

test('a booking later today remains allowed', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  const executed = []
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params = []) => {
      executed.push(sql)
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT * FROM students')) return [[{ name: '试听学生', enrollment_stage: 'pending' }]]
      if (sql.startsWith('SELECT * FROM teachers')) return [[{ name: '林老师' }]]
      if (sql.startsWith('SELECT id, name FROM teachers')) return [[{ id: 'teacher-a', name: '林老师' }]]
      if (sql.startsWith('SELECT * FROM trial_bookings WHERE id')) return [[{
        id: params[0], student_id: 'student-a', teacher_id: 'teacher-a',
        booking_date: '2030-09-28', start_time: '16:00', end_time: '17:00',
        student_name_snapshot: '试听学生', teacher_name_snapshot: '林老师', status: 'active'
      }]]
      if (sql.startsWith('SELECT * FROM') || sql.startsWith('SELECT course_id') || sql.startsWith('SELECT * FROM trial_bookings WHERE booking_date')) return [[]]
      if (sql.startsWith('INSERT INTO trial_bookings')) return [{ affectedRows: 1 }]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  }))
  t.after(() => t.mock.timers.reset())

  const booking = await trials.create({
    studentId: 'student-a', teacherId: 'teacher-a', date: '2030-09-28',
    startTime: '16:00', endTime: '17:00'
  }, 'teacher-a')
  assert.equal(booking.startTime, '16:00')
  assert.equal(executed.filter(sql => sql.startsWith('INSERT INTO trial_bookings')).length, 1)
})
