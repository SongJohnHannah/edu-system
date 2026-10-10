import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { getTeacherStats, getOverallStats } from '../src/services/statsService.js'

const teachers = [
  { id: 'owner', name: '原老师', status: 'active' },
  { id: 'substitute', name: '代课老师', status: 'active' }
]
const attendance = (hours, studentIds, extra = {}) => ({
  course_id: 'class', date: '2026-10-10', original_date: '2026-10-10',
  student_ids: JSON.stringify(studentIds), hours_deducted: hours,
  recorded_by: 'substitute', teaching_teacher_id: 'substitute', ...extra
})

function fixture(t, records) {
  t.mock.method(pool, 'execute', async (sql, params = []) => {
    if (/FROM attendance WHERE/.test(sql)) {
      assert.match(sql, /voided_at IS NULL/)
      return [records.filter(row => !row.voided_at)]
    }
    if (/COUNT\(\*\) AS totalTeachers FROM teachers/.test(sql)) {
      return [[{ totalTeachers: params.length ? 1 : teachers.length }]]
    }
    if (/COUNT\(DISTINCT id\) AS totalCourses/.test(sql)) return [[{ totalCourses: 1 }]]
    if (/SELECT id, name, phone, subject, status FROM teachers/.test(sql)) {
      return [params.length ? teachers.filter(row => row.id === params[0]) : teachers]
    }
    if (/COUNT\(DISTINCT c.id\) AS course_count/.test(sql)) return [[]]
    if (/^SELECT \* FROM (courses|course_)/.test(sql)) return [[]]
    if (/^SELECT id, name FROM teachers/.test(sql)) return [teachers]
    if (/FROM trial_bookings/.test(sql)) return [[]]
    throw new Error(`unexpected query: ${sql}`)
  })
}

test('ten students in a two-hour class count as two teacher hours', async t => {
  fixture(t, [attendance('2.0', Array.from({ length: 10 }, (_, i) => `student-${i}`))])
  const rows = await getTeacherStats('2026-10-10', '2026-10-10')
  assert.equal(rows.find(row => row.id === 'substitute').attendanceCount, 1)
  assert.equal(rows.find(row => row.id === 'substitute').consumedHours, 2)
  assert.equal(rows.find(row => row.id === 'owner').consumedHours, 0)
  const overall = await getOverallStats('2026-10-10', '2026-10-10')
  assert.equal(overall.totalAttendance, 1)
  assert.equal(overall.totalConsumedHours, 2)
})

test('partial student reversal keeps a whole class; voided attendance is excluded', async t => {
  fixture(t, [
    attendance('2.0', ['remaining-1', 'remaining-2']),
    attendance('1.5', [], { voided_at: '2026-10-10 12:00:00' })
  ])
  const overall = await getOverallStats('2026-10-10', '2026-10-10', 'substitute')
  assert.equal(overall.totalAttendance, 1)
  assert.equal(overall.totalConsumedHours, 2)
})

test('administrator attendance uses the saved teaching teacher and class hours', async t => {
  fixture(t, [attendance('1.5', ['s1', 's2'], { recorded_by: null })])
  const mine = await getTeacherStats('2026-10-10', '2026-10-10', 'substitute')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].attendanceCount, 1)
  assert.equal(mine[0].consumedHours, 1.5)
  const original = await getOverallStats('2026-10-10', '2026-10-10', 'owner')
  assert.equal(original.totalConsumedHours, 0)
})

test('saved class hours accumulate exactly across fractional classes', async t => {
  fixture(t, [attendance('0.1', ['s1']), attendance('0.2', ['s1'])])
  const rows = await getTeacherStats('2026-10-10', '2026-10-10')
  assert.equal(rows.find(row => row.id === 'substitute').consumedHours, 0.3)
  const overall = await getOverallStats('2026-10-10', '2026-10-10')
  assert.equal(overall.totalConsumedHours, 0.3)
})

test('overall sums fractional class hours across different teachers without floating point noise', async t => {
  fixture(t, [attendance('0.1', ['s1']), attendance('0.2', ['s2'], { teaching_teacher_id: 'owner' })])
  const overall = await getOverallStats('2026-10-10', '2026-10-10')
  assert.equal(overall.totalConsumedHours, 0.3)
  assert.equal(overall.totalAttendance, 2)
})
