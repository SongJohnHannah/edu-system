import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'
import { listOccurrences, validateSlot, overlaps, iso, acquireScheduleLock, closeScheduleConnection } from './scheduleService.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const parseIds = value => typeof value === 'string' ? JSON.parse(value) : (value || [])
const hasStarted = (date, startTime) => new Date(`${iso(date)}T${startTime}:00`) <= new Date()
function formatBooking(row) {
  return {
    ...row,
    studentId: row.student_id, teacherId: row.teacher_id, courseId: row.course_id,
    occurrenceDate: row.occurrence_date ? iso(row.occurrence_date) : null,
    date: iso(row.booking_date), startTime: row.start_time, endTime: row.end_time,
    studentName: row.student_name_snapshot, teacherName: row.teacher_name_snapshot,
    courseName: row.course_name_snapshot, isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at), updatedAt: formatDateTime(row.updated_at)
  }
}

export async function getAll(filters = {}) {
  const limit = Math.min(Math.max(Number.parseInt(filters.limit) || 500, 1), 500)
  const offset = Math.max(Number.parseInt(filters.offset) || 0, 0)
  const clauses = []
  const params = []
  if (filters.start) { clauses.push('booking_date >= ?'); params.push(filters.start) }
  if (filters.end) { clauses.push('booking_date <= ?'); params.push(filters.end) }
  if (filters.teacherId) { clauses.push('teacher_id = ?'); params.push(filters.teacherId) }
  if (filters.studentId) { clauses.push('student_id = ?'); params.push(filters.studentId) }
  if (filters.status) { clauses.push('status = ?'); params.push(filters.status) }
  const sql = `SELECT * FROM trial_bookings ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY booking_date DESC, start_time, id LIMIT ${limit} OFFSET ${offset}`
  const [rows] = await pool.execute(sql, params)
  return rows.map(formatBooking)
}

async function validatedBooking(conn, data, teacherScope, excludeId = null) {
  const studentId = data.studentId
  let teacherId = data.teacherId
  const courseId = data.courseId || null
  const date = data.date
  if (!studentId || !teacherId || !date) fail('请选择学生、教师和日期')
  if (teacherScope && teacherId !== teacherScope) fail('只能安排自己的试听预约', 403)
  const [students] = await conn.execute("SELECT * FROM students WHERE id = ? AND status = 'active'", [studentId])
  if (!students.length) fail('学生不存在或不可预约')
  const student = students[0]
  if (student.enrollment_stage !== 'pending') fail('试听学生应为待报名阶段')
  const [teachers] = await conn.execute("SELECT * FROM teachers WHERE id = ? AND status = 'active'", [teacherId])
  if (!teachers.length) fail('教师不存在或已停用')
  let occurrence = null
  if (courseId) {
    const occurrences = await listOccurrences(date, date, conn)
    occurrence = occurrences.find(o => o.courseId === courseId && o.originalDate === data.occurrenceDate)
    if (!occurrence) fail('找不到该日期的正式课次')
    if (occurrence.teacherId !== teacherId) fail('所选课程不属于该教师')
    if (occurrence.studentIds.includes(studentId)) fail('该学生已在正式课程名单中')
  }
  const startTime = occurrence?.startTime || data.startTime
  const endTime = occurrence?.endTime || data.endTime
  validateSlot(date, startTime, endTime)
  if (hasStarted(date, startTime)) fail('不能预约已开始的时段')
  const candidate = { date, startTime, endTime }
  const formal = await listOccurrences(date, date, conn)
  for (const item of formal) {
    if (!overlaps(item, candidate)) continue
    if (item.studentIds.includes(studentId)) fail(`与${item.name}的正式课时间冲突`, 409)
    if (item.teacherId === teacherId && (!occurrence || item.id !== occurrence.id)) fail(`与${item.name}的正式课时间冲突`, 409)
  }
  const [existing] = await conn.execute("SELECT * FROM trial_bookings WHERE booking_date = ? AND status = 'active'", [date])
  for (const item of existing) {
    if (item.id === excludeId || !overlaps({ startTime: item.start_time, endTime: item.end_time }, candidate)) continue
    if (item.student_id === studentId) fail('该学生已有同一时段的试听预约', 409)
    const sameClass = occurrence && item.course_id === courseId && iso(item.occurrence_date) === occurrence.originalDate
    if (item.teacher_id === teacherId && !sameClass) fail('该教师已有同一时段的试听预约', 409)
  }
  return {
    studentId, teacherId, courseId, occurrenceDate: occurrence?.originalDate || null,
    date, startTime, endTime, note: String(data.note || '').trim(),
    studentName: student.name, teacherName: teachers[0].name, courseName: occurrence?.name || null,
    isTest: data.isTest ? 1 : 0
  }
}

async function mutate(data, teacherScope, id = null) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    if (id) {
      const [rows] = await conn.execute('SELECT * FROM trial_bookings WHERE id = ? FOR UPDATE', [id])
      if (!rows.length || rows[0].status !== 'active') fail('预约不存在或已取消', 404)
      if (teacherScope && rows[0].teacher_id !== teacherScope) fail('只能修改自己的预约', 403)
      if (hasStarted(rows[0].booking_date, rows[0].start_time)) fail('过去的预约不能修改')
    }
    const booking = await validatedBooking(conn, data, teacherScope, id)
    if (id) {
      await conn.execute(
        `UPDATE trial_bookings SET student_id = ?, teacher_id = ?, course_id = ?, occurrence_date = ?,
         booking_date = ?, start_time = ?, end_time = ?, note = ?, student_name_snapshot = ?, teacher_name_snapshot = ?, course_name_snapshot = ? WHERE id = ?`,
        [booking.studentId, booking.teacherId, booking.courseId, booking.occurrenceDate, booking.date,
         booking.startTime, booking.endTime, booking.note, booking.studentName, booking.teacherName, booking.courseName, id]
      )
    } else {
      id = generateId()
      await conn.execute(
        `INSERT INTO trial_bookings (id, student_id, teacher_id, course_id, occurrence_date, booking_date,
         start_time, end_time, note, student_name_snapshot, teacher_name_snapshot, course_name_snapshot, is_test)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, booking.studentId, booking.teacherId, booking.courseId, booking.occurrenceDate, booking.date,
         booking.startTime, booking.endTime, booking.note, booking.studentName, booking.teacherName, booking.courseName, booking.isTest]
      )
    }
    const [rows] = await conn.execute('SELECT * FROM trial_bookings WHERE id = ?', [id])
    const result = formatBooking(rows[0])
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export const create = (data, teacherScope) => mutate(data, teacherScope)
export const update = (id, data, teacherScope) => mutate(data, teacherScope, id)

export async function cancel(id, teacherScope) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.execute('SELECT teacher_id, status, booking_date, start_time FROM trial_bookings WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) fail('预约不存在', 404)
    if (teacherScope && rows[0].teacher_id !== teacherScope) fail('只能取消自己的预约', 403)
    if (rows[0].status !== 'active') fail('预约已经取消')
    if (hasStarted(rows[0].booking_date, rows[0].start_time)) fail('过去的预约不能取消')
    await conn.execute("UPDATE trial_bookings SET status = 'cancelled' WHERE id = ?", [id])
    await conn.commit()
    return { success: true }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}
