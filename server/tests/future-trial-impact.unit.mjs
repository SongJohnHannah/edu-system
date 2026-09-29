import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureCourseCanChange } from '../src/services/scheduleService.js'

test('course changes only block affected trials that have not started', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 8, 28, 15, 0) })
  t.after(() => t.mock.timers.reset())
  let bookings = []
  let lastQuery
  const conn = {
    execute: async (sql, params) => {
      lastQuery = { sql, params }
      const [, fromDate, afterDate, onDate, afterTime] = params
      return [bookings.filter(b => b.date >= fromDate && (b.date > afterDate || (b.date === onDate && b.time > afterTime)))
        .map(b => ({ id: b.id, booking_date: b.date, start_time: b.time, student_name_snapshot: '试听学生', teacher_name_snapshot: '林老师' }))]
    }
  }

  bookings = [{ id: 'past', date: '2030-09-28', time: '09:00' }]
  await ensureCourseCanChange(conn, 'course-1')
  assert.match(lastQuery.sql, /booking_date > \? OR \(booking_date = \? AND start_time > \?\)/)
  assert.deepEqual(lastQuery.params, ['course-1', '2030-09-28', '2030-09-28', '2030-09-28', '15:00'])

  bookings = [{ id: 'future', date: '2030-09-28', time: '16:00' }]
  await assert.rejects(ensureCourseCanChange(conn, 'course-1'), error =>
    error.status === 409 && error.details?.[0]?.id === 'future')

  await ensureCourseCanChange(conn, 'course-1', '2030-09-29')
  bookings = [{ id: 'tomorrow', date: '2030-09-29', time: '09:00' }]
  await assert.rejects(ensureCourseCanChange(conn, 'course-1', '2030-09-29'), error =>
    error.status === 409 && error.details?.[0]?.id === 'tomorrow')
})
