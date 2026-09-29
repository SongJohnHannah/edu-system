import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'
import { acquireScheduleLock, closeScheduleConnection, assertRecurringAvailable, assertCourseFutureAvailable, ensureCourseCanChange, firstFutureCourseDate, futureTrialWindow, weekStartOf, iso } from './scheduleService.js'

function courseDetails(data, previous = {}) {
  const name = String(data.name ?? previous.name ?? '').trim()
  const classroom = String(data.classroom ?? previous.classroom ?? '').trim()
  const hours = Number(data.hoursPerClass ?? previous.hours_per_class ?? 1)
  if (!name || [...name].length > 200) throw Object.assign(new Error('课程名称须填写且不能超过200个字符'), { status: 400 })
  if ([...classroom].length > 100) throw Object.assign(new Error('教室不能超过100个字符'), { status: 400 })
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 999.5 || !Number.isInteger(hours * 2)) {
    throw Object.assign(new Error('每次课时须为0.5至999.5之间的半课时倍数'), { status: 400 })
  }
  return { name, classroom, hours }
}

function formatCourse(row) {
  return {
    ...row,
    teacherId: row.teacher_id,
    startTime: row.start_time,
    endTime: row.end_time,
    hoursPerClass: Number(row.hours_per_class),
    studentIds: typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : (row.student_ids || []),
    isTest: !!row.is_test,
    archivedAt: row.archived_at ? formatDateTime(row.archived_at) : null,
    teacherName: row.teacher_name || '',
    effectiveStartDate: row.effective_start_date ? iso(row.effective_start_date) : null,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
  }
}

async function buildTeacherNameMap(teacherIds, db = pool) {
  const ids = [...new Set(teacherIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await db.execute(
    `SELECT id, name FROM teachers WHERE id IN (${placeholders})`,
    ids
  )
  return new Map(rows.map(r => [r.id, r.name]))
}

function attachTeacherNames(courses, nameMap) {
  return courses.map(c => ({ ...c, teacherName: nameMap.get(c.teacherId) || c.teacherName || '' }))
}

export async function getAll(teacherScope, includeArchived = false) {
  const [rows] = await pool.execute(`SELECT * FROM courses ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY created_at DESC`)
  const formatted = await overlayCurrentSchedules(rows.map(formatCourse))
  const nameMap = await buildTeacherNameMap(formatted.map(c => c.teacherId))
  return attachTeacherNames(formatted, nameMap)
}

async function overlayCurrentSchedules(courses, db = pool) {
  const [versions] = await db.execute('SELECT * FROM course_schedule_versions WHERE effective_week_start <= ? ORDER BY effective_week_start', [weekStartOf(iso(new Date()))])
  return courses.map(course => {
    const version = versions.filter(v => v.course_id === course.id).at(-1)
    return version ? { ...course, weekday: version.weekday, startTime: version.start_time, endTime: version.end_time } : course
  })
}

export async function getById(id, db = pool) {
  const [rows] = await db.execute('SELECT * FROM courses WHERE id = ?', [id])
  if (!rows[0]) return null
  const formatted = (await overlayCurrentSchedules([formatCourse(rows[0])], db))[0]
  const nameMap = await buildTeacherNameMap([formatted.teacherId], db)
  return { ...formatted, teacherName: nameMap.get(formatted.teacherId) || '' }
}

export async function verifyAccess(id, teacherScope) {
  const [rows] = await pool.execute('SELECT teacher_id, archived_at FROM courses WHERE id = ?', [id])
  if (!rows.length || rows[0].archived_at) throw Object.assign(new Error('课程不存在'), { status: 404 })
  if (teacherScope && rows[0].teacher_id !== teacherScope) throw Object.assign(new Error('只能修改自己的课程'), { status: 403 })
  return true
}

export async function create(data) {
  const details = courseDetails(data)
  const id = generateId()
  const now = new Date()
  const firstDate = firstFutureCourseDate(data, now)
  const effectiveStartDate = data.effectiveStartDate || firstDate
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStartDate) || iso(new Date(`${effectiveStartDate}T12:00:00`)) !== effectiveStartDate || effectiveStartDate < iso(now)) {
    throw Object.assign(new Error('课程开始生效日期须为今天或之后的有效日期'), { status: 400 })
  }
  if (effectiveStartDate === iso(now) && firstDate > effectiveStartDate && Number(data.weekday) === (now.getDay() || 7)) {
    throw Object.assign(new Error('今天这节课已开始，请选择未来的排课日期'), { status: 400 })
  }
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const [teachers] = await conn.execute("SELECT id FROM teachers WHERE id = ? AND status = 'active'", [data.teacherId])
    if (!teachers.length) throw Object.assign(new Error('授课教师不存在或已停用'), { status: 400 })
    await validateRoster(conn, data.studentIds)
    await assertRecurringAvailable(conn, data, null, effectiveStartDate)
    await conn.execute(
      `INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, is_test, effective_start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, details.name, data.teacherId, data.weekday, data.startTime, data.endTime,
       details.classroom, details.hours, JSON.stringify(data.studentIds || []), data.isTest ? 1 : 0, effectiveStartDate]
    )
    const [rows] = await conn.execute('SELECT * FROM courses WHERE id = ?', [id])
    const result = formatCourse(rows[0])
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function update(id, data, teacherScope = null) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn); locked = true
    await conn.beginTransaction()
    const [rows] = await conn.execute('SELECT * FROM courses WHERE id = ? FOR UPDATE', [id])
    const c = rows[0]
    if (!c || c.archived_at) throw Object.assign(new Error('课程不存在或已归档'), { status: 404 })
    if (teacherScope && c.teacher_id !== teacherScope) throw Object.assign(new Error('只能修改自己的课程'), { status: 403 })
    if (data.teacherId && data.teacherId !== c.teacher_id) throw Object.assign(new Error('请使用课程交接功能更换教师'), { status: 400 })
    const current = await getById(id, conn)
    if (['weekday', 'startTime', 'endTime'].some(key => data[key] !== undefined && String(data[key]) !== String(current[key]))) throw Object.assign(new Error('请在周排课中选择调课范围后修改时间'), { status: 400 })
    const oldIds = typeof c.student_ids === 'string' ? JSON.parse(c.student_ids) : c.student_ids || []
    const nextIds = data.studentIds ?? oldIds
    if (JSON.stringify(oldIds) !== JSON.stringify(nextIds)) {
      await validateRoster(conn, nextIds)
      const future = futureTrialWindow()
      const [trials] = await conn.execute(
        `SELECT student_id FROM trial_bookings WHERE course_id = ? AND status = 'active' AND ${future.clause}`,
        [id, ...future.params]
      )
      if (trials.some(t => nextIds.includes(t.student_id))) throw Object.assign(new Error('请先处理转为正式学生的试听预约'), { status: 409 })
      const [history] = await conn.execute('SELECT id FROM course_roster_versions WHERE course_id = ? LIMIT 1', [id])
      if (!history.length) await conn.execute('INSERT INTO course_roster_versions (id, course_id, effective_at, student_ids) VALUES (?, ?, ?, ?)', [generateId(), id, '1000-01-01', JSON.stringify(oldIds)])
      await conn.execute('INSERT INTO course_roster_versions (id, course_id, effective_at, student_ids) VALUES (?, ?, CURRENT_TIMESTAMP, ?)', [generateId(), id, JSON.stringify(nextIds)])
      await conn.execute('UPDATE courses SET student_ids = ? WHERE id = ?', [JSON.stringify(nextIds), id])
      await assertCourseFutureAvailable(conn, id)
    }
    const { name, classroom, hours } = courseDetails(data, c)
    if (name !== c.name || classroom !== c.classroom || hours !== Number(c.hours_per_class)) {
      const [history] = await conn.execute('SELECT id FROM course_detail_versions WHERE course_id = ? LIMIT 1', [id])
      if (!history.length) await conn.execute('INSERT INTO course_detail_versions (id, course_id, effective_at, name, classroom, hours_per_class) VALUES (?, ?, ?, ?, ?, ?)', [generateId(), id, '1000-01-01', c.name, c.classroom || '', c.hours_per_class])
      await conn.execute('INSERT INTO course_detail_versions (id, course_id, effective_at, name, classroom, hours_per_class) VALUES (?, ?, CURRENT_TIMESTAMP(3), ?, ?, ?)', [generateId(), id, name, classroom || '', hours])
      await conn.execute('UPDATE courses SET name = ?, classroom = ?, hours_per_class = ? WHERE id = ?', [name, classroom, hours, id])
    }
    const result = await getById(id, conn)
    await conn.commit()
    return result
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeScheduleConnection(conn, locked) }
}

async function validateRoster(conn, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw Object.assign(new Error('请选择有效的正式学生名单'), { status: 400 })
  const [students] = await conn.query("SELECT id FROM students WHERE id IN (?) AND status = 'active' AND enrollment_stage = 'enrolled'", [ids])
  if (students.length !== ids.length) throw Object.assign(new Error('正式名单只能选择已报名且在读的学生，请先在学生页办理报名'), { status: 400 })
}

export async function remove(id, teacherScope = null) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const [rows] = await conn.execute('SELECT teacher_id, archived_at FROM courses WHERE id = ? FOR UPDATE', [id])
    if (!rows[0] || rows[0].archived_at) throw Object.assign(new Error('课程不存在'), { status: 404 })
    if (teacherScope && rows[0].teacher_id !== teacherScope) throw Object.assign(new Error('只能归档自己的课程'), { status: 403 })
    await ensureCourseCanChange(conn, id)
    await conn.execute('UPDATE courses SET archived_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}
