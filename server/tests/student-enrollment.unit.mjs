import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { update, updateStatus, remove } from '../src/services/studentService.js'

test('student enrollment and withdrawal respect formal rosters and future trial bookings', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  t.after(() => t.mock.timers.reset())
  const originalGetConnection = pool.getConnection
  const originalExecute = pool.execute
  const student = {
    id: 's1', name: '测试学生', phone: '', age: null, remark: '', status: 'active',
    class_id: '', total_hours: 0, used_hours: 0, enrollment_stage: 'enrolled'
  }
  let hasCourse = true
  let bookings = []
  let commits = 0
  let rollbacks = 0
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => { commits++ },
    rollback: async () => { rollbacks++ },
    release: () => {},
    execute: async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.includes('RELEASE_LOCK')) return [[]]
      if (sql.startsWith('SELECT * FROM students WHERE id = ? FOR UPDATE')) return [[{ ...student }]]
      if (sql === 'SELECT * FROM students WHERE id = ?') return [[{ ...student }]]
      if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) return [[]]
      if (sql.startsWith('SELECT id FROM courses WHERE')) return [hasCourse ? [{ id: 'c1' }] : []]
      if (sql.startsWith('SELECT id FROM trial_bookings WHERE')) {
        assert.match(sql, /booking_date > \? OR \(booking_date = \? AND start_time > \?\)/)
        const [, afterDate, onDate, afterTime] = params
        assert.equal(afterDate, '2030-09-28')
        return [bookings.filter(b => b.date > afterDate || (b.date === onDate && b.startTime > afterTime))]
      }
      if (sql.startsWith("UPDATE students SET status = 'deleted'")) {
        student.status = 'deleted'
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('UPDATE students SET')) {
        assert.doesNotMatch(sql, /class_id/)
        student.name = params[0]
        student.status = params[4]
        student.enrollment_stage = params[5]
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  })
  pool.execute = async sql => { throw new Error(`Unexpected pool SQL: ${sql}`) }
  try {
    await assert.rejects(() => update('s1', { enrollmentStage: 'pending' }), error => error.status === 409 && /正式课程名单/.test(error.message))
    assert.equal(student.enrollment_stage, 'enrolled')
    await assert.rejects(() => updateStatus('s1', 'quit'), error => error.status === 409 && /正式课程名单/.test(error.message))
    assert.equal(student.status, 'active')
    hasCourse = false
    await update('s1', { enrollmentStage: 'pending' })
    assert.equal(student.enrollment_stage, 'pending')

    bookings = [{ id: 'past', date: '2030-09-28', startTime: '09:00' }]
    await update('s1', { enrollmentStage: 'enrolled' })
    assert.equal(student.enrollment_stage, 'enrolled')
    await update('s1', { enrollmentStage: 'pending' })

    bookings = [{ id: 'future', date: '2030-09-28', startTime: '16:00' }]
    await assert.rejects(() => update('s1', { enrollmentStage: 'enrolled' }), error => error.status === 409 && /未来的试听预约/.test(error.message))
    assert.equal(student.enrollment_stage, 'pending')
    await assert.rejects(() => update('s1', { status: 'quit' }), error => error.status === 409 && /未来的试听预约/.test(error.message))
    await assert.rejects(() => updateStatus('s1', 'quit'), error => error.status === 409 && /未来的试听预约/.test(error.message))
    assert.equal(student.status, 'active')
    bookings = []
    assert.equal((await update('s1', { enrollmentStage: 'enrolled' })).enrollmentStage, 'enrolled')
    await assert.rejects(() => update('s1', { enrollmentStage: 'unknown' }), error => error.status === 400)

    bookings = [{ id: 'tomorrow', date: '2030-09-29', startTime: '09:00' }]
    await assert.rejects(() => remove('s1'), error => error.status === 409 && /未来的试听预约/.test(error.message))
    bookings = [{ id: 'past', date: '2030-09-28', startTime: '09:00' }]
    await updateStatus('s1', 'quit')
    assert.equal(student.status, 'quit')
    await updateStatus('s1', 'active')
    await remove('s1')
    assert.equal(student.status, 'deleted')
    assert.equal(commits, 7)
    assert.equal(rollbacks, 7)
  } finally {
    pool.getConnection = originalGetConnection
    pool.execute = originalExecute
    await pool.end()
  }
})
