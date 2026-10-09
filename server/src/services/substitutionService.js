import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { listOccurrences, iso, overlaps, acquireScheduleLock, closeScheduleConnection } from './scheduleService.js'

const fail = (message, status = 400, details) => { throw Object.assign(new Error(message), { status, details }) }
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T12:00:00`).getTime()) && iso(new Date(`${value}T12:00:00`)) === value

async function currentOccurrence(conn, courseId, originalDate, teacherScope) {
  if (!validDate(originalDate)) fail('请选择有效的课次日期')
  const [courses] = await conn.execute('SELECT * FROM courses WHERE id = ? FOR UPDATE', [courseId])
  const course = courses[0]
  if (!course || course.archived_at) fail('课程不存在或已归档', 404)
  if (teacherScope && course.teacher_id !== teacherScope) fail('只有课程原老师或管理员可以安排代课', 403)
  const [moves] = await conn.execute('SELECT target_date FROM course_occurrence_changes WHERE course_id = ? AND original_date = ?', [courseId, originalDate])
  const date = moves.length ? iso(moves[0].target_date) : originalDate
  const rows = await listOccurrences(date, date, conn)
  const occurrence = rows.find(row => row.courseId === courseId && row.originalDate === originalDate)
  if (!occurrence) fail('所选课次不存在')
  if (new Date(`${date}T${occurrence.startTime}:00`) <= new Date()) fail('已开始的课次不能安排或取消代课')
  const [attendance] = await conn.execute(`SELECT id FROM attendance WHERE course_id = ?
    AND (original_date = ? OR (original_date IS NULL AND date = ?)) AND voided_at IS NULL LIMIT 1`,
  [courseId, originalDate, date])
  if (attendance.length) fail('已点名的课次不能更改代课', 409)
  return { occurrence, rows }
}

async function ensureNoLinkedTrials(conn, occurrence) {
  const [trials] = await conn.execute(`SELECT id, student_name_snapshot FROM trial_bookings
    WHERE course_id = ? AND occurrence_date = ? AND status = 'active'`, [occurrence.courseId, occurrence.originalDate])
  if (trials.length) fail(`请先取消或重新安排本课次的试听预约：${trials.map(row => row.student_name_snapshot).join('、')}`, 409)
}

async function teacherConflicts(conn, occurrence, rows, teacherId) {
  const conflicts = rows.filter(row => row.id !== occurrence.id && row.teacherId === teacherId && overlaps(row, occurrence))
    .map(row => ({ id: `course:${row.id}:${row.date}:${row.startTime}:${row.endTime}`, type: 'teacher_overlap',
      date: row.date, time: `${row.startTime}—${row.endTime}`, student: row.name, teacher: row.teacherName }))
  const [trials] = await conn.execute(`SELECT * FROM trial_bookings WHERE teacher_id = ? AND booking_date = ? AND status = 'active'`,
    [teacherId, occurrence.date])
  for (const row of trials) if (overlaps({ startTime: row.start_time, endTime: row.end_time }, occurrence)) {
    conflicts.push({ id: `trial:${row.id}:${iso(row.booking_date)}:${row.start_time}:${row.end_time}`, type: 'teacher_overlap',
      date: iso(row.booking_date), time: `${row.start_time}—${row.end_time}`, student: `试听：${row.student_name_snapshot}`, teacher: row.teacher_name_snapshot })
  }
  return conflicts
}

async function cancelActive(conn, courseId, originalDate, operator) {
  await conn.execute(`UPDATE course_substitutions SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?
    WHERE course_id = ? AND original_date = ? AND status = 'active'`, [operator, courseId, originalDate])
}

export async function arrange(courseId, data, teacherScope, user) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn); locked = true
    await conn.beginTransaction()
    const { occurrence, rows } = await currentOccurrence(conn, courseId, data.originalDate, teacherScope)
    const reason = String(data.reason || '').trim()
    if ([...reason].length > 500) fail('代课原因不能超过500个字符')
    if (!data.teacherId || data.teacherId === occurrence.originalTeacherId) fail('请选择其他老师代课')
    const [teachers] = await conn.execute("SELECT id FROM teachers WHERE id = ? AND status = 'active'", [data.teacherId])
    if (!teachers.length) fail('代课老师不存在或已停用')
    await ensureNoLinkedTrials(conn, occurrence)
    const conflicts = await teacherConflicts(conn, occurrence, rows, data.teacherId)
    const acknowledged = Array.isArray(data.acknowledgedConflicts) ? data.acknowledgedConflicts : []
    if (conflicts.some(row => !acknowledged.includes(row.id))) fail('代课老师在此时段已有安排，是否仍安排代课？', 409, conflicts)
    const operator = user.username
    await cancelActive(conn, courseId, occurrence.originalDate, operator)
    await conn.execute(`INSERT INTO course_substitutions
      (id, course_id, original_date, teacher_id, original_teacher_id, reason, arranged_by, confirmed_conflicts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [generateId(), courseId, occurrence.originalDate, data.teacherId,
      occurrence.originalTeacherId, reason, operator, JSON.stringify(conflicts)])
    const result = (await listOccurrences(occurrence.date, occurrence.date, conn)).find(row => row.id === occurrence.id)
    await conn.commit()
    return result
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeScheduleConnection(conn, locked) }
}

export async function cancel(courseId, originalDate, teacherScope, user) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn); locked = true
    await conn.beginTransaction()
    const { occurrence, rows } = await currentOccurrence(conn, courseId, originalDate, teacherScope)
    if (!occurrence.substitution) fail('本课次没有临时代课')
    await ensureNoLinkedTrials(conn, occurrence)
    if ((await teacherConflicts(conn, occurrence, rows, occurrence.originalTeacherId)).length) fail('原老师在此时段已有其他安排，请先处理后再取消代课', 409)
    await cancelActive(conn, courseId, originalDate, user.username)
    await conn.commit()
    return { success: true }
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeScheduleConnection(conn, locked) }
}
