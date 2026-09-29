import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { getAll } from '../src/services/attendanceService.js'

const row = id => ({
  id, date: '2026-12-15', course_id: 'course-1', student_ids: '["student-1"]',
  original_student_ids: '["student-1"]', hours_deducted: '1.0',
  student_names_snapshot: '{"student-1":"测试学生"}',
  course_name_snapshot: '测试课程', teacher_name_snapshot: '测试教师',
  recorded_by: 'teacher-1', is_test: 1, created_at: '2026-12-15 10:00:00', voided_at: null
})

test('attendance history combines course and month filters with stable pagination', async t => {
  let query
  t.mock.method(pool, 'execute', async (sql, params) => {
    query = { sql, params }
    return [[row('a3'), row('a2'), row('a1')]]
  })
  const page = await getAll(null, { limit: 2, offset: 3, courseId: 'course-1', month: '2026-12', includeVoided: true })
  assert.match(query.sql, /course_id = \?/)
  assert.match(query.sql, /date >= \? AND date < \?/)
  assert.doesNotMatch(query.sql, /voided_at IS NULL/)
  assert.match(query.sql, /ORDER BY created_at DESC, id DESC LIMIT 3 OFFSET 3/)
  assert.deepEqual(query.params, ['course-1', '2026-12-01', '2027-01-01'])
  assert.deepEqual(page.data.map(item => item.id), ['a3', 'a2'])
  assert.equal(page.hasMore, true)
  assert.deepEqual(page.data[0].studentIds, ['student-1'])
  assert.equal(page.data[0].originalDate, null)
})

test('attendance history excludes voided rows by default and validates dates before querying', async t => {
  let calls = 0
  t.mock.method(pool, 'execute', async (sql, params) => { calls++; return [[]] })
  const page = await getAll(null, { month: '2026-02', date: '2026-02-28', limit: 1 })
  assert.equal(page.hasMore, false)
  assert.deepEqual(page.data, [])
  assert.equal(calls, 1)
  await assert.rejects(() => getAll(null, { month: '2026-13' }), /月份无效/)
  await assert.rejects(() => getAll(null, { date: '2026-02-30' }), /日期无效/)
  assert.equal(calls, 1)
})

test('attendance lookup identifies one actual occurrence while conservatively including legacy rows', async t => {
  let query
  t.mock.method(pool, 'execute', async (sql, params) => { query = { sql, params }; return [[]] })
  await getAll(null, { courseId: 'course-1', date: '2026-12-15', originalDate: '2026-12-08' })
  assert.match(query.sql, /original_date = \? OR original_date IS NULL/)
  assert.deepEqual(query.params, ['course-1', '2026-12-15', '2026-12-08'])
  await assert.rejects(() => getAll(null, { originalDate: '2026-02-30' }), /原上课日期无效/)
})

test('teacher history filters by recorder in SQL before pagination', async t => {
  const queries = []
  t.mock.method(pool, 'execute', async (sql, params) => {
    queries.push({ sql, params })
    return [[row('own-2'), row('own-1')]]
  })
  const mine = await getAll('teacher-1', { scope: 'mine', courseId: 'course-1', limit: 1, offset: 1 })
  assert.match(queries[0].sql, /WHERE voided_at IS NULL AND recorded_by = \? AND course_id = \?/)
  assert.match(queries[0].sql, /LIMIT 2 OFFSET 1/)
  assert.deepEqual(queries[0].params, ['teacher-1', 'course-1'])
  assert.deepEqual(mine.data.map(item => item.id), ['own-2'])
  assert.equal(mine.hasMore, true)

  await getAll('teacher-1', { scope: 'all', limit: 1 })
  assert.doesNotMatch(queries[1].sql, /recorded_by = \?/)
  assert.deepEqual(queries[1].params, [])
})
