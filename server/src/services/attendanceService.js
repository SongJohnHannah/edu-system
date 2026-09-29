import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDate, formatDateTime } from '../utils/dateFormat.js'
import { listOccurrences, acquireScheduleLock, closeScheduleConnection } from './scheduleService.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const idsOf = value => typeof value === 'string' ? JSON.parse(value) : (value || [])
function formatAttendance(row) {
  return {
    ...row, date: formatDate(row.date), courseId: row.course_id,
    originalDate: row.original_date ? formatDate(row.original_date) : null,
    startTime: row.start_time_snapshot || null, endTime: row.end_time_snapshot || null,
    studentIds: idsOf(row.student_ids), hoursDeducted: Number(row.hours_deducted),
    originalStudentIds: idsOf(row.original_student_ids || row.student_ids),
    recordedBy: row.recorded_by, isTest: !!row.is_test,
    courseName: row.course_name_snapshot || '', teacherName: row.teacher_name_snapshot || '',
    studentNamesSnapshot: typeof row.student_names_snapshot === 'string'
      ? JSON.parse(row.student_names_snapshot) : (row.student_names_snapshot || {}),
    createdAt: formatDateTime(row.created_at),
    voidedAt: row.voided_at ? formatDateTime(row.voided_at) : null
  }
}

export async function getAll(teacherScope, { limit = 50, offset = 0, includeVoided = false, courseId, month, date, originalDate, scope = 'all' } = {}) {
  const pageSize = Math.min(Math.max(Number.parseInt(limit) || 50, 1), 200)
  const skip = Math.max(Number.parseInt(offset) || 0, 0)
  const clauses = []
  const params = []
  if (!includeVoided) clauses.push('voided_at IS NULL')
  if (scope === 'mine' && teacherScope) { clauses.push('recorded_by = ?'); params.push(teacherScope) }
  if (courseId) { clauses.push('course_id = ?'); params.push(courseId) }
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('月份无效')
    const [year, monthNumber] = month.split('-').map(Number)
    if (year < 1900 || year > 9998) fail('月份无效')
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
    clauses.push('date >= ? AND date < ?')
    params.push(`${month}-01`, nextMonth)
  }
  if (date) {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) fail('日期无效')
    clauses.push('date = ?')
    params.push(date)
  }
  if (originalDate) {
    const parsed = new Date(`${originalDate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(originalDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== originalDate) fail('原上课日期无效')
    clauses.push('(original_date = ? OR original_date IS NULL)')
    params.push(originalDate)
  }
  const [rows] = await pool.execute(
    `SELECT * FROM attendance ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${pageSize + 1} OFFSET ${skip}`,
    params
  )
  return { data: rows.slice(0, pageSize).map(formatAttendance), hasMore: rows.length > pageSize }
}

export async function create(data, teacherScope, user) {
  if (!Array.isArray(data.studentIds) || !data.studentIds.length || new Set(data.studentIds).size !== data.studentIds.length) fail('请选择有效的正式课程学生')
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const [courseRows] = await conn.execute('SELECT archived_at, is_test FROM courses WHERE id = ?', [data.courseId])
    if (!courseRows.length || courseRows[0].archived_at) fail('归档课程不能新增点名')
    const matches = (await listOccurrences(data.date, data.date, conn)).filter(item => item.courseId === data.courseId)
    const occurrence = data.originalDate
      ? matches.find(item => item.originalDate === data.originalDate)
      : matches.length === 1 ? matches[0] : null
    if (matches.length > 1 && !data.originalDate) fail('同日有多节该课程，请选择具体课次')
    if (!occurrence) fail('所选日期没有该正式课程')
    const hours = Number(occurrence.hoursPerClass)
    if (data.hoursDeducted !== undefined && Number(data.hoursDeducted) !== hours) fail('扣除课时须与该课次课时一致')
    if (teacherScope && occurrence.teacherId !== teacherScope) fail('只能点名自己的课程', 403)
    if (data.studentIds.some(id => !occurrence.studentIds.includes(id))) fail('点名名单只能包含正式课程学生')
    const [studentRows] = await conn.execute(`SELECT id, name FROM students WHERE id IN (${data.studentIds.map(() => '?').join(',')})`, data.studentIds)
    const studentNames = Object.fromEntries(studentRows.map(row => [row.id, row.name]))
    const [duplicates] = await conn.execute(`SELECT id FROM attendance WHERE course_id = ? AND date = ?
      AND (original_date = ? OR original_date IS NULL) AND voided_at IS NULL LIMIT 1 FOR UPDATE`,
    [data.courseId, data.date, occurrence.originalDate])
    if (duplicates.length) fail('该课次已经点名', 409)
    const id = generateId()
    await conn.execute(
      `INSERT INTO attendance (id, course_id, date, original_date, student_ids, hours_deducted, recorded_by, is_test,
       course_name_snapshot, teacher_name_snapshot, student_names_snapshot, original_student_ids,
       start_time_snapshot, end_time_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.courseId, data.date, occurrence.originalDate, JSON.stringify(data.studentIds), hours, teacherScope || null,
       (data.isTest || courseRows[0].is_test) ? 1 : 0, occurrence.name, occurrence.teacherName,
       JSON.stringify(studentNames), JSON.stringify(data.studentIds), occurrence.startTime, occurrence.endTime]
    )
    for (const studentId of data.studentIds) {
      await conn.execute('UPDATE students SET used_hours = used_hours + ? WHERE id = ?', [hours, studentId])
      await conn.execute(
        'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [generateId(), studentId, 'deduct', hours, '点名扣除', id, user.username, (data.isTest || courseRows[0].is_test) ? 1 : 0]
      )
    }
    const [rows] = await conn.execute('SELECT * FROM attendance WHERE id = ?', [id])
    const result = formatAttendance(rows[0])
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

async function reverse(attendanceId, studentIdsToRemove, teacherScope, user) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.execute('SELECT * FROM attendance WHERE id = ? FOR UPDATE', [attendanceId])
    if (!rows.length) fail('点名记录不存在', 404)
    const record = rows[0]
    if (record.voided_at) fail('该点名已撤销', 409)
    if (teacherScope && record.recorded_by !== teacherScope) fail('只能撤销自己记录的点名', 403)
    const current = idsOf(record.student_ids)
    if (studentIdsToRemove !== null && !Array.isArray(studentIdsToRemove)) fail('撤销名单无效')
    const requested = studentIdsToRemove || current
    if (requested.some(id => !current.includes(id))) fail('选择的学生已不在当前点名记录中，请刷新后重试', 409)
    const valid = [...new Set(requested)]
    if (!valid.length) fail('没有可撤销的学生')
    for (const studentId of valid) {
      await conn.execute('UPDATE students SET used_hours = GREATEST(0, used_hours - ?) WHERE id = ?', [record.hours_deducted, studentId])
      await conn.execute(
        'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [generateId(), studentId, 'restore', record.hours_deducted, '撤销点名还原', attendanceId, user?.username || teacherScope || 'admin', record.is_test || 0]
      )
      await conn.execute('INSERT INTO attendance_reversals (id, attendance_id, student_id, hours) VALUES (?, ?, ?, ?)',
        [generateId(), attendanceId, studentId, record.hours_deducted])
    }
    const remaining = current.filter(id => !valid.includes(id))
    await conn.execute(
      'UPDATE attendance SET student_ids = ?, voided_at = ? WHERE id = ?',
      [JSON.stringify(remaining), remaining.length ? null : new Date(), attendanceId]
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export const remove = (attendanceId, teacherScope, user) => reverse(attendanceId, null, teacherScope, user)
export const removeStudents = (attendanceId, studentIds, teacherScope, user) => reverse(attendanceId, studentIds, teacherScope, user)
