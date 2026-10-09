import test from 'node:test'
import assert from 'node:assert/strict'
import { occurrencesFromState, weekStartOf, addDays, assertCourseFutureAvailable, firstFutureCourseDate, validateSlot, listOccurrences } from '../src/services/scheduleService.js'

const base = {
  id: 'course-1', name: '语文', teacher_id: 'teacher-1', weekday: 1,
  start_time: '09:00', end_time: '10:00', student_ids: JSON.stringify(['s1']),
  hours_per_class: 1, classroom: '', archived_at: null, is_test: 0
}
const state = (versions = [], changes = [], handovers = [], course = base) => ({
  courses: [course], versions, changes, handovers
})

test('occurrence queries reject impossible dates before accessing storage', async () => {
  let queries = 0
  const conn = { execute: async () => { queries++; return [[]] } }
  for (const [start, end] of [
    ['2026-02-30', '2026-03-01'],
    ['2026-13-01', '2026-13-02'],
    ['2026-09-01', '2026-09-31']
  ]) {
    await assert.rejects(() => listOccurrences(start, end, conn), /日期范围无效/)
  }
  assert.equal(queries, 0)
})

test('roster changes keep student names associated with earlier occurrences', () => {
  const rosterVersions = [
    { course_id: 'course-1', effective_at: '1000-01-01 00:00:00', student_ids: JSON.stringify(['s1']) },
    { course_id: 'course-1', effective_at: '2026-10-09 15:00:00', student_ids: JSON.stringify(['s2']) }
  ]
  const rows = occurrencesFromState({ ...state([], [], [], { ...base, student_ids: JSON.stringify(['s2']) }), rosterVersions }, '2026-10-04', '2026-10-17')
  assert.deepEqual(rows.map(r => r.studentIds), [['s1'], ['s2']])
})

test('week starts on Sunday and base course repeats', () => {
  assert.equal(weekStartOf('2026-10-05'), '2026-10-04')
  const rows = occurrencesFromState(state(), '2026-10-04', '2026-10-17')
  assert.deepEqual(rows.map(r => r.date), ['2026-10-05', '2026-10-12'])
})

test('the year-1000 history baseline stays before current weeks and advances normally', async () => {
  const baselineWeek = weekStartOf('1000-01-01')
  assert.equal(baselineWeek, '0999-12-29')
  assert.equal(addDays(baselineWeek, 7), '1000-01-05')
  assert.ok(baselineWeek < weekStartOf('2026-09-28'))
  let queries = 0
  const conn = { execute: async sql => {
    queries++
    if (queries > 20) throw new Error('历史基线导致未来课次检查无限循环')
    if (sql.startsWith('SELECT effective_week_start AS boundary')) return [[{ boundary: new Date(1000, 0, 1, 12) }]]
    return [[]]
  } }
  await assertCourseFutureAvailable(conn, 'course-1')
  assert.ok(queries > 1 && queries <= 20)
})

test('a course created for the second displayed week starts in that week', () => {
  const course = { ...base, created_at: '2026-10-05 10:00:00', effective_start_date: '2026-10-11' }
  const rows = occurrencesFromState(state([], [], [], course), '2026-10-04', '2026-10-24')
  assert.deepEqual(rows.map(row => row.date), ['2026-10-12', '2026-10-19'])
})

test('new recurring courses include today even after the class has started', () => {
  const tuesdayMorning = new Date(2026, 8, 29, 8, 30)
  const tuesdayAfternoon = new Date(2026, 8, 29, 16, 0)
  assert.equal(firstFutureCourseDate({ weekday: 2, startTime: '09:00', endTime: '10:00' }, tuesdayMorning), '2026-09-29')
  assert.equal(firstFutureCourseDate({ weekday: 2, startTime: '09:00', endTime: '10:00' }, tuesdayAfternoon), '2026-09-29')
  assert.equal(firstFutureCourseDate({ weekday: 1, startTime: '09:00', endTime: '10:00' }, tuesdayMorning), '2026-10-05')
  assert.equal(firstFutureCourseDate({ weekday: 7, startTime: '09:00', endTime: '10:00' }, tuesdayMorning), '2026-10-04')
})

test('one-time move appears once on target date and preserves other weeks', () => {
  const change = { course_id: 'course-1', original_date: '2026-10-05', target_date: '2026-10-06', start_time: '09:30', end_time: '10:30' }
  const rows = occurrencesFromState(state([], [change]), '2026-10-04', '2026-10-17')
  assert.deepEqual(rows.map(r => [r.originalDate, r.date, r.startTime]), [
    ['2026-10-05', '2026-10-06', '09:30'], ['2026-10-12', '2026-10-12', '09:00']
  ])
})

test('a class moved across weeks appears when only the target week is queried', () => {
  const saturdayCourse = { ...base, weekday: 6 }
  const change = { course_id: 'course-1', original_date: '2026-10-10', target_date: '2026-10-13', start_time: '09:00', end_time: '10:00' }
  const data = state([], [change], [], saturdayCourse)
  assert.deepEqual(occurrencesFromState(data, '2026-10-04', '2026-10-10'), [])
  assert.deepEqual(occurrencesFromState(data, '2026-10-11', '2026-10-17').map(row => [row.originalDate, row.date]), [
    ['2026-10-10', '2026-10-13'], ['2026-10-17', '2026-10-17']
  ])
  const notYetStarted = state([], [change], [], { ...saturdayCourse, effective_start_date: '2026-10-11' })
  assert.deepEqual(occurrencesFromState(notYetStarted, '2026-10-11', '2026-10-17').map(row => row.date), ['2026-10-17'])
})

test('permanent Saturday to next Tuesday begins Tuesday once and then repeats every Tuesday', () => {
  const saturdayCourse = { ...base, weekday: 6 }
  const change = { course_id: 'course-1', original_date: '2026-10-10', target_date: '2026-10-13', start_time: '09:00', end_time: '10:00' }
  const version = { course_id: 'course-1', effective_week_start: '2026-10-11', weekday: 2, start_time: '09:00', end_time: '10:00' }
  const rows = occurrencesFromState(state([version], [change], [], saturdayCourse), '2026-10-04', '2026-10-31')
  assert.deepEqual(rows.map(row => [row.originalDate, row.date]), [
    ['2026-10-10', '2026-10-13'], ['2026-10-20', '2026-10-20'], ['2026-10-27', '2026-10-27']
  ])
})

test('future version changes subsequent weeks while past weeks retain baseline', () => {
  const version = { course_id: 'course-1', effective_week_start: '2026-10-11', weekday: 3, start_time: '10:00', end_time: '11:00' }
  const rows = occurrencesFromState(state([version]), '2026-10-04', '2026-10-24')
  assert.deepEqual(rows.map(r => r.date), ['2026-10-05', '2026-10-14', '2026-10-21'])
})

test('handover and archive keep earlier occurrence history', () => {
  const handover = { course_id: 'course-1', old_teacher_id: 'teacher-1', new_teacher_id: 'teacher-2', created_at: '2026-10-10 10:00:00' }
  const rows = occurrencesFromState(state([], [], [handover], { ...base, teacher_id: 'teacher-2', archived_at: '2026-10-16 10:00:00' }), '2026-10-04', '2026-10-24')
  assert.deepEqual(rows.map(r => [r.date, r.teacherId]), [
    ['2026-10-05', 'teacher-1'], ['2026-10-12', 'teacher-2']
  ])
})

test('archiving after a class keeps the class earlier that same day', () => {
  const rows = occurrencesFromState(state([], [], [], { ...base, archived_at: '2026-10-05 18:00:00' }), '2026-10-04', '2026-10-11')
  assert.deepEqual(rows.map(row => row.date), ['2026-10-05'])
})

test('course detail changes retain the earlier class charging rule', () => {
  const detailVersions = [
    { course_id: 'course-1', effective_at: '1000-01-01 00:00:00', name: '语文', classroom: 'A', hours_per_class: 1 },
    { course_id: 'course-1', effective_at: '2026-10-09 12:00:00', name: '语文进阶', classroom: 'B', hours_per_class: 2 }
  ]
  const rows = occurrencesFromState({ ...state([], [], [], { ...base, name: '语文进阶', classroom: 'B', hours_per_class: 2 }), detailVersions }, '2026-10-04', '2026-10-17')
  assert.deepEqual(rows.map(row => [row.name, row.classroom, row.hoursPerClass]), [
    ['语文', 'A', 1], ['语文进阶', 'B', 2]
  ])
})

test('slot validation uses 30 minute increments and grid bounds', () => {
  assert.doesNotThrow(() => validateSlot('2026-10-05', '07:30', '08:00'))
  assert.throws(() => validateSlot('2026-10-05', '09:15', '10:00'), /30分钟/)
  assert.throws(() => validateSlot('2026-10-05', '22:00', '23:00'), /07:30/)
})
