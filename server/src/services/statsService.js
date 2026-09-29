import { listOccurrences, iso, addDays, weekStartOf } from './scheduleService.js'
import pool from '../config/database.js'

function validateRange(start, end) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && iso(new Date(`${value}T12:00:00`)) === value
  if (!valid(start) || !valid(end) || start > end || (new Date(end) - new Date(start)) / 86400000 > 366) {
    throw Object.assign(new Error('统计日期范围须在一年以内'), { status: 400 })
  }
}

async function attendanceByTeacher(start, end) {
  validateRange(start, end)
  const [attendance] = await pool.execute(`
    SELECT course_id, date, original_date, student_ids, hours_deducted, recorded_by
    FROM attendance WHERE date BETWEEN ? AND ? AND voided_at IS NULL
  `, [start, end])
  if (!attendance.length) return new Map()

  // recorded_by identifies the operator. Admin attendance has no recorded_by;
  // historical handovers also make the current course owner unreliable.
  const occurrenceTeachers = new Map()
  const legacyDateTeachers = new Map()
  for (let day = start; day <= end; day = addDays(day, 62)) {
    const chunkEnd = addDays(day, 61) < end ? addDays(day, 61) : end
    for (const row of await listOccurrences(day, chunkEnd)) {
      occurrenceTeachers.set(row.id, row.teacherId)
      legacyDateTeachers.set(`${row.courseId}:${row.date}`, row.teacherId)
    }
  }

  const totals = new Map()
  for (const row of attendance) {
    const teacherId = row.original_date
      ? occurrenceTeachers.get(`${row.course_id}:${iso(row.original_date)}`) || row.recorded_by
      : legacyDateTeachers.get(`${row.course_id}:${iso(row.date)}`) || row.recorded_by
    if (!teacherId) continue
    const current = totals.get(teacherId) || { attendanceCount: 0, consumedHours: 0 }
    const studentIds = typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : row.student_ids
    current.attendanceCount++
    current.consumedHours += Number(row.hours_deducted ?? 1) * studentIds.length
    totals.set(teacherId, current)
  }
  return totals
}

export async function getTeacherStats(startDate, endDate, teacherScope) {
  validateRange(startDate, endDate)
  const attMap = await attendanceByTeacher(startDate, endDate)
  let teacherQuery = 'SELECT id, name, phone, subject, status FROM teachers'
  let teacherParams = []
  if (teacherScope) {
    teacherQuery += ' WHERE id = ?'
    teacherParams = [teacherScope]
  }
  const [teacherRows] = await pool.execute(teacherQuery, teacherParams)
  const teachers = teacherRows.filter(teacher => teacher.status !== 'deleted' || attMap.has(teacher.id))

  const teacherIds = teachers.map(t => t.id)
  if (teacherIds.length === 0) return []

  // Single query to get course stats per teacher
  const [courseStats] = await pool.execute(`
    SELECT c.teacher_id,
           COUNT(DISTINCT c.id) AS course_count,
           COUNT(DISTINCT h.student_id) AS student_count
    FROM courses c
    LEFT JOIN (
      SELECT DISTINCT c2.id AS course_id, j.student_id
      FROM courses c2, JSON_TABLE(c2.student_ids, '$[*]' COLUMNS (student_id VARCHAR(36) PATH '$')) j
      WHERE c2.teacher_id IN (${teacherIds.map(() => '?').join(',')})
    ) h ON h.course_id = c.id
    WHERE c.teacher_id IN (${teacherIds.map(() => '?').join(',')}) AND c.archived_at IS NULL
    GROUP BY c.teacher_id
  `, [...teacherIds, ...teacherIds])

  const courseMap = new Map(courseStats.map(r => [r.teacher_id, r]))

  return teachers.map(teacher => ({
    ...teacher,
    courseCount: courseMap.get(teacher.id)?.course_count || 0,
    studentCount: courseMap.get(teacher.id)?.student_count || 0,
    attendanceCount: attMap.get(teacher.id)?.attendanceCount || 0,
    consumedHours: attMap.get(teacher.id)?.consumedHours || 0
  }))
}

export async function getWeekdayDistribution(teacherScope, start = weekStartOf(iso(new Date())), end = addDays(start, 6)) {
  validateRange(start, end)
  const distribution = [0, 0, 0, 0, 0, 0, 0]
  for (let day = start; day <= end; day = addDays(day, 62)) {
    const chunkEnd = addDays(day, 61) < end ? addDays(day, 61) : end
    const rows = await listOccurrences(day, chunkEnd)
    for (const row of rows) if (!teacherScope || row.teacherId === teacherScope) distribution[row.weekday - 1]++
  }
  return distribution
}

export async function getOverallStats(startDate, endDate, teacherScope) {
  validateRange(startDate, endDate)
  let courseFilter = ''
  let courseParams = []

  if (teacherScope) {
    courseFilter = ' AND c.teacher_id = ?'
    courseParams = [teacherScope]
  }

  const [[{ totalTeachers }]] = await pool.execute(
    `SELECT COUNT(*) AS totalTeachers FROM teachers${teacherScope ? ' WHERE id = ?' : ''}`,
    teacherScope ? [teacherScope] : []
  )

  // Course count (by current ownership)
  const [[{ totalCourses }]] = await pool.execute(
    `SELECT COUNT(DISTINCT id) AS totalCourses FROM courses WHERE archived_at IS NULL ${courseFilter ? ' AND teacher_id = ?' : ''}`,
    courseParams
  )

  const attendance = await attendanceByTeacher(startDate, endDate)
  const totals = teacherScope ? [attendance.get(teacherScope)].filter(Boolean) : [...attendance.values()]

  return {
    totalTeachers,
    activeTeachers: totals.length,
    totalCourses: totalCourses || 0,
    totalAttendance: totals.reduce((sum, item) => sum + item.attendanceCount, 0),
    totalConsumedHours: totals.reduce((sum, item) => sum + item.consumedHours, 0)
  }
}
