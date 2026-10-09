import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import * as courses from '../src/services/courseService.js'
import * as attendance from '../src/services/attendanceService.js'
import { listOccurrences } from '../src/services/scheduleService.js'

function storage(t, hour, minute = 0) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 9, hour, minute) })
  t.after(() => t.mock.timers.reset())
  const data = { courses: [], attendance: [], usedHours: 0, records: [] }
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async sql => {
      assert.match(sql, /SELECT id FROM students/)
      return [[{ id: 's1' }]]
    },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[]]
      if (sql.startsWith('SELECT id FROM teachers')) return [[{ id: 't1' }]]
      if (sql === 'SELECT id, name FROM teachers') return [[{ id: 't1', name: '林老师' }]]
      if (sql.startsWith('SELECT id, name FROM students')) return [[{ id: 's1', name: '学生甲' }]]
      if (sql.startsWith('INSERT INTO courses')) {
        const columns = ['id', 'name', 'teacher_id', 'weekday', 'start_time', 'end_time', 'classroom', 'hours_per_class', 'student_ids', 'is_test', 'effective_start_date']
        data.courses.push({ ...Object.fromEntries(columns.map((key, index) => [key, params[index]])), created_at: new Date() })
        return [{ affectedRows: 1 }]
      }
      if (sql === 'SELECT * FROM courses') return [data.courses]
      if (sql.startsWith('SELECT * FROM courses WHERE id') || sql.startsWith('SELECT archived_at, is_test FROM courses')) {
        return [data.courses.filter(course => course.id === params[0])]
      }
      if (sql.startsWith('SELECT id FROM attendance')) return [data.attendance.filter(row => row.course_id === params[0] && row.date === params[1])]
      if (sql.startsWith('INSERT INTO attendance')) {
        const columns = ['id', 'course_id', 'date', 'original_date', 'student_ids', 'hours_deducted', 'recorded_by', 'is_test', 'course_name_snapshot', 'teacher_name_snapshot', 'student_names_snapshot', 'original_student_ids', 'start_time_snapshot', 'end_time_snapshot', 'teaching_teacher_id']
        data.attendance.push({ ...Object.fromEntries(columns.map((key, index) => [key, params[index]])), created_at: new Date() })
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('SELECT * FROM attendance WHERE id')) return [data.attendance.filter(row => row.id === params[0])]
      if (sql.startsWith('UPDATE students SET used_hours')) { data.usedHours += params[0]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('INSERT INTO hour_records')) { data.records.push(params); return [{ affectedRows: 1 }] }
      if (/^SELECT .*\b(?:course_schedule_versions|course_occurrence_changes|course_handovers|course_roster_versions|course_detail_versions|course_substitutions|trial_bookings)\b/.test(sql) || sql.startsWith('SELECT effective_start_date FROM courses')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  return { data, conn }
}

const input = { name: '当天新课', teacherId: 't1', weekday: 5, startTime: '09:00', endTime: '10:00', hoursPerClass: 1.5, studentIds: ['s1'] }

test('courses created today can be attended today before, at and after class starts', async t => {
  for (const [hour, minute] of [[8, 30], [9, 0], [9, 30], [16, 0]]) {
    await t.test(`${hour}:${minute}`, async child => {
      const { data, conn } = storage(child, hour, minute)
      const course = await courses.create(input)
      assert.equal(course.effectiveStartDate, '2026-10-09')
      assert.equal(course.endTime, '10:30', 'the backend derives end time even if the request contains a different end')
      const rows = await listOccurrences('2026-10-09', '2026-10-09', conn)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].courseId, course.id)
      const record = await attendance.create({ courseId: course.id, date: '2026-10-09', studentIds: ['s1'] }, 't1', { username: 'teacher1' })
      assert.equal(record.date, '2026-10-09')
      assert.equal(record.hoursDeducted, 1.5)
      assert.equal(data.usedHours, 1.5)
      assert.equal(data.records.length, 1)
      await assert.rejects(attendance.create({ courseId: course.id, date: '2026-10-09', studentIds: ['s1'] }, 't1', { username: 'teacher1' }), error => error.status === 409)
      assert.equal(data.usedHours, 1.5)
    })
  }
})

test('an explicit start today is accepted even after the class ends', async t => {
  const { conn } = storage(t, 16)
  const course = await courses.create({ ...input, effectiveStartDate: '2026-10-09' })
  assert.equal(course.effectiveStartDate, '2026-10-09')
  assert.equal((await listOccurrences('2026-10-09', '2026-10-09', conn)).length, 1)
})

test('explicit future starts and other weekdays do not produce an extra class today', async t => {
  const { conn, data } = storage(t, 16)
  const course = await courses.create({ ...input, effectiveStartDate: '2026-10-16' })
  assert.equal(course.effectiveStartDate, '2026-10-16')
  assert.deepEqual(await listOccurrences('2026-10-09', '2026-10-09', conn), [])
  await assert.rejects(attendance.create({ courseId: course.id, date: '2026-10-09', studentIds: ['s1'] }, 't1', { username: 'teacher1' }), /所选日期没有/)
  assert.equal(data.usedHours, 0)
  const sunday = await courses.create({ ...input, name: '周日课程', weekday: 7 })
  assert.equal(sunday.effectiveStartDate, '2026-10-11')
  assert.deepEqual(await listOccurrences('2026-10-09', '2026-10-09', conn), [])
})
