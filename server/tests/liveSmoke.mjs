// Run only against a database that may briefly contain tagged test fixtures.
// Every fixture is removed by its exact generated ID in finally.
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { generateId } from '../src/utils/helpers.js'
import { weekStartOf, addDays, listOccurrences, reschedule } from '../src/services/scheduleService.js'
import * as courseService from '../src/services/courseService.js'
import * as trialService from '../src/services/trialBookingService.js'
import * as attendanceService from '../src/services/attendanceService.js'
import * as studentService from '../src/services/studentService.js'

if (process.env.ALLOW_LIVE_SMOKE !== '1') throw new Error('Set ALLOW_LIVE_SMOKE=1 to use the configured database')

const teacherId = generateId()
const formalStudentId = generateId()
const trialStudentId = generateId()
let courseId = null
let futureCourseId = null
let trialId = null
let attendanceId = null
const monday = addDays(weekStartOf(new Date()), 8)
const tuesday = addDays(monday, 1)

try {
  await pool.execute("INSERT INTO teachers (id, name, phone, subject, remark, is_test, status) VALUES (?, ?, '', '', '', 1, 'active')", [teacherId, `smoke-teacher-${teacherId}`])
  for (const [id, stage] of [[formalStudentId, 'enrolled'], [trialStudentId, 'pending']]) {
    await pool.execute(
      "INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id, is_test, enrollment_stage) VALUES (?, ?, '', NULL, '', 10, 0, 'active', '', 'admin', NULL, 1, ?)",
      [id, `smoke-student-${id}`, stage]
    )
  }

  const course = await courseService.create({
    name: 'smoke-course', teacherId, weekday: 1, startTime: '21:00', endTime: '22:00',
    hoursPerClass: 1, studentIds: [formalStudentId], isTest: true
  })
  courseId = course.id
  const booked = await trialService.create({
    studentId: trialStudentId, teacherId, courseId, occurrenceDate: monday, date: monday,
    note: 'smoke test', isTest: true
  }, teacherId)
  trialId = booked.id
  assert.equal(booked.startTime, '21:00')
  assert.equal((await listOccurrences(monday, monday)).find(o => o.courseId === courseId)?.trialCount, 1)

  await assert.rejects(
    () => reschedule(courseId, { originalDate: monday, targetDate: tuesday, startTime: '21:00', endTime: '22:00', scope: 'once' }, teacherId),
    error => error.status === 409
  )
  await trialService.cancel(trialId, teacherId)
  const changed = await reschedule(courseId, {
    originalDate: monday, targetDate: tuesday, startTime: '21:00', endTime: '22:00', scope: 'once'
  }, teacherId)
  assert.equal(changed.targetDate, tuesday)
  assert.equal((await listOccurrences(tuesday, tuesday)).find(o => o.courseId === courseId)?.date, tuesday)
  assert.equal((await listOccurrences(monday, monday)).some(o => o.courseId === courseId), false)
  await assert.rejects(
    () => reschedule(courseId, { originalDate: monday, targetDate: monday, startTime: '20:30', endTime: '21:30', scope: 'once' }, 'another-teacher'),
    error => error.status === 403
  )
  const futureCourse = await courseService.create({
    name: 'smoke-future-course', teacherId, weekday: 1, startTime: '19:30', endTime: '20:30',
    hoursPerClass: 1, studentIds: [formalStudentId], isTest: true
  })
  futureCourseId = futureCourse.id
  await studentService.verifyAccess(formalStudentId, teacherId)
  await assert.rejects(() => studentService.verifyDeleteAccess(formalStudentId, teacherId), error => error.status === 403)
  const attendance = await attendanceService.create({
    courseId: futureCourseId, date: monday, studentIds: [formalStudentId], hoursDeducted: 1, isTest: true
  }, teacherId, { username: 'smoke' })
  attendanceId = attendance.id
  await attendanceService.remove(attendanceId, teacherId)
  const [balance] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', [formalStudentId])
  assert.equal(Number(balance[0].used_hours), 0)
  const [voided] = await pool.execute('SELECT voided_at FROM attendance WHERE id = ?', [attendanceId])
  assert.ok(voided[0].voided_at)
  const laterMonday = addDays(monday, 7)
  const laterTuesday = addDays(laterMonday, 1)
  await reschedule(futureCourseId, {
    originalDate: laterMonday, targetDate: laterTuesday,
    startTime: '19:30', endTime: '20:30', scope: 'future'
  }, teacherId)
  assert.equal((await listOccurrences(monday, monday)).find(o => o.courseId === futureCourseId)?.date, monday)
  assert.equal((await listOccurrences(laterTuesday, laterTuesday)).find(o => o.courseId === futureCourseId)?.date, laterTuesday)
  console.log('live smoke passed: course, booking marker, trial blocker, cancellation, one-time/future move, ownership, attendance reversal')
} finally {
  try {
    if (attendanceId) {
      await pool.execute('DELETE FROM attendance_reversals WHERE attendance_id = ?', [attendanceId])
      await pool.execute('DELETE FROM hour_records WHERE related_id = ?', [attendanceId])
      await pool.execute('DELETE FROM attendance WHERE id = ?', [attendanceId])
    }
    if (trialId) await pool.execute('DELETE FROM trial_bookings WHERE id = ?', [trialId])
    if (courseId) {
      await pool.execute('DELETE FROM course_occurrence_changes WHERE course_id = ?', [courseId])
      await pool.execute('DELETE FROM course_schedule_versions WHERE course_id = ?', [courseId])
      await pool.execute('DELETE FROM course_roster_versions WHERE course_id = ?', [courseId])
      await pool.execute('DELETE FROM courses WHERE id = ?', [courseId])
    }
    if (futureCourseId) {
      await pool.execute('DELETE FROM course_schedule_versions WHERE course_id = ?', [futureCourseId])
      await pool.execute('DELETE FROM courses WHERE id = ?', [futureCourseId])
    }
    await pool.execute('DELETE FROM students WHERE id IN (?, ?)', [formalStudentId, trialStudentId])
    await pool.execute('DELETE FROM teachers WHERE id = ?', [teacherId])
  } finally { await pool.end() }
}
