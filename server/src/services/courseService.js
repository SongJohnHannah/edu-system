import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDate, formatDateTime } from '../utils/dateFormat.js'

function parseStudentIds(raw) {
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return raw
}

function formatCourse(row) {
  if (!row) return null
  return {
    ...row,
    teacherId: row.teacher_id,
    startTime: row.start_time,
    endTime: row.end_time,
    hoursPerClass: Number(row.hours_per_class),
    studentIds: parseStudentIds(row.student_ids),
    isTest: !!row.is_test,
    teacherName: row.teacher_name || '',
    effectiveFrom: formatDate(row.effective_from),
    status: row.status || 'active',
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
  }
}

function formatSchedule(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    effectiveFrom: formatDate(row.effective_from),
    validUntil: formatDate(row.valid_until),
    teacherId: row.teacher_id,
    studentIds: parseStudentIds(row.student_ids),
    classroom: row.classroom || '',
    weekday: row.weekday,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    hoursPerClass: row.hours_per_class != null ? Number(row.hours_per_class) : null,
    teacherName: row.teacher_name || '',
    createdAt: formatDateTime(row.created_at)
  }
}

function formatHistory(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    effectiveFrom: formatDate(row.effective_from),
    supersededAt: formatDate(row.superseded_at),
    teacherId: row.teacher_id,
    studentIds: parseStudentIds(row.student_ids),
    classroom: row.classroom || '',
    weekday: row.weekday,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    hoursPerClass: row.hours_per_class != null ? Number(row.hours_per_class) : null,
    teacherName: row.teacher_name || ''
  }
}

async function buildTeacherNameMap(teacherIds) {
  const ids = [...new Set(teacherIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await pool.execute(
    `SELECT id, name FROM teachers WHERE id IN (${placeholders})`,
    ids
  )
  return new Map(rows.map(r => [r.id, r.name]))
}

function attachTeacherNames(courses, nameMap) {
  return courses.map(c => ({ ...c, teacherName: nameMap.get(c.teacherId) || c.teacherName || '' }))
}

export async function getAll(teacherScope) {
  let rows
  if (!teacherScope) {
    ;[rows] = await pool.execute(`SELECT * FROM courses WHERE status = 'active' ORDER BY created_at DESC`)
  } else {
    ;[rows] = await pool.execute(
      `SELECT * FROM courses WHERE teacher_id = ? AND status = 'active' ORDER BY created_at DESC`,
      [teacherScope]
    )
  }
  const formatted = rows.map(formatCourse)
  const nameMap = await buildTeacherNameMap(formatted.map(c => c.teacherId))
  return attachTeacherNames(formatted, nameMap)
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM courses WHERE id = ?', [id])
  if (!rows[0]) return null
  const formatted = formatCourse(rows[0])
  const nameMap = await buildTeacherNameMap([formatted.teacherId])
  return { ...formatted, teacherName: nameMap.get(formatted.teacherId) || '' }
}

export async function verifyAccess(id, teacherScope) {
  if (!teacherScope) return true
  const [rows] = await pool.execute('SELECT teacher_id FROM courses WHERE id = ?', [id])
  if (rows.length === 0) throw new Error('课程不存在')
  if (rows[0].teacher_id !== teacherScope) throw new Error('无权访问该课程')
  return true
}

/**
 * 给定 (courseId, date) 返回该日期应当生效的可变字段值：
 * 优先查 course_schedule 中 applicable 的最新行，没有则 fallback 到 courses 表。
 * 返回 null 表示课程已被软删除或不存在。
 */
export async function getEffectiveAt(courseId, date) {
  const [rows] = await pool.execute(
    `SELECT * FROM courses WHERE id = ? AND status = 'active'`,
    [courseId]
  )
  if (!rows[0]) return null
  const course = formatCourse(rows[0])

  const [schRows] = await pool.execute(
    `SELECT cs.*, t.name AS teacher_name FROM course_schedule cs
     LEFT JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.course_id = ? AND cs.effective_from <= ?
       AND (cs.valid_until IS NULL OR cs.valid_until > ?)
     ORDER BY cs.effective_from DESC LIMIT 1`,
    [courseId, date, date]
  )
  if (schRows[0]) {
    const sch = formatSchedule(schRows[0])
    return { ...course, ...sch, teacherId: sch.teacherId, studentIds: sch.studentIds, classroom: sch.classroom }
  }
  return course
}

/**
 * 返回某课程完整的"历史 + 当前 + 待生效"时间线（按 effectiveFrom DESC）。
 */
export async function getHistory(courseId) {
  const [histRows] = await pool.execute(
    `SELECT ch.*, t.name AS teacher_name FROM course_history ch
     LEFT JOIN teachers t ON t.id = ch.teacher_id
     WHERE ch.course_id = ?
     ORDER BY ch.effective_from DESC`,
    [courseId]
  )
  const [schRows] = await pool.execute(
    `SELECT cs.*, t.name AS teacher_name FROM course_schedule cs
     LEFT JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.course_id = ?
     ORDER BY cs.effective_from DESC`,
    [courseId]
  )
  const histories = histRows.map(formatHistory).map(h => ({ ...h, kind: 'history' }))
  const schedules = schRows.map(formatSchedule).map(s => ({ ...s, kind: 'schedule' }))
  return [...schedules, ...histories]
}

/**
 * 给定一周起始日期，返回该周内每个课程的"按周几"的生效值（按天展开）。
 * 用于 WeeklySchedule 一次性拉数据。
 * - 每门课最多 7 个 slot，但通常 0~2 个（取决于 weekday 在该周是否变化）
 * - slot.weekday 来自 applicable schedule 行，不再 fallback 到 courses.weekday
 */
export async function getEffectiveForWeek(weekStartDate) {
  const weekStart = formatDate(weekStartDate)
  const start = new Date(weekStart + 'T00:00:00')
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(formatDate(d))
  }
  const weekEnd = days[6]

  const [courses] = await pool.execute(
    `SELECT * FROM courses WHERE status = 'active' ORDER BY created_at DESC`
  )
  const formatted = courses.map(formatCourse)
  if (formatted.length === 0) return []

  const ids = formatted.map(c => c.id)
  const placeholders = ids.map(() => '?').join(',')
  const [schRows] = await pool.execute(
    `SELECT cs.*, t.name AS teacher_name FROM course_schedule cs
     LEFT JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.course_id IN (${placeholders})
     ORDER BY cs.effective_from DESC, cs.valid_until IS NULL, cs.valid_until ASC`,
    ids
  )
  const schByCourse = new Map()
  for (const r of schRows) {
    if (!schByCourse.has(r.course_id)) schByCourse.set(r.course_id, [])
    schByCourse.get(r.course_id).push(formatSchedule(r))
  }

  const today = formatDate(new Date())
  const out = []
  for (const c of formatted) {
    // F1：回填上限 = courses.created_at（精确到日）。
    // eff < created_at 的"假装历史"在 L1 下被吞掉——用户应自知。
    // courses.createdAt 来自 formatDateTime("YYYY-MM-DD HH:mm:ss")，取前 10 位即日期。
    const createdDate = (c.createdAt || '').slice(0, 10) || formatDate(new Date())
    const schedules = schByCourse.get(c.id) || []
    for (const day of days) {
      const d = new Date(day + 'T00:00:00')
      const dow = d.getDay() === 0 ? 7 : d.getDay() // 1=Mon..7=Sun
      // K1：仅 weekday=N 且 day >= created_at 的格子才显示 slot。
      if (day < createdDate) continue
      const applicable = schedules.find(s =>
        s.effectiveFrom <= day && (!s.validUntil || s.validUntil > day)
      )
      if (!applicable) continue
      if (applicable.weekday !== dow) continue
      if (process.env.DBG_EFFECTIVE) {
        process.stderr.write(`[DBG] course=${c.id} day=${day} dow=${dow} sched=${applicable.effectiveFrom}/${applicable.weekday}/${applicable.validUntil || 'NULL'} -> push\n`)
      }
      out.push({
        ...c,
        courseId: c.id,
        // 课程身份字段必须以 applicable（course_schedule 行）为准，
        // 否则 courses 表里"默认值"会覆盖本周已版本化生效值
        teacherId: applicable.teacherId,
        teacher_id: applicable.teacherId,
        studentIds: applicable.studentIds,
        student_ids: applicable.studentIds,
        classroom: applicable.classroom,
        weekday: applicable.weekday,
        startTime: applicable.startTime,
        start_time: applicable.startTime,
        endTime: applicable.endTime,
        end_time: applicable.endTime,
        hoursPerClass: applicable.hoursPerClass,
        hours_per_class: applicable.hoursPerClass,
        effectiveFrom: applicable.effectiveFrom,
        effective_from: applicable.effectiveFrom,
        validUntil: applicable.validUntil,
        slotDate: day,
        isPast: day < today
      })
    }
  }
  return out
}

export async function create(data) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const id = generateId()
    const eff = data.effectiveFrom || formatDate(new Date())
    await conn.execute(
      `INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, is_test, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.teacherId, data.weekday, data.startTime, data.endTime,
       data.classroom || '', data.hoursPerClass || 1, JSON.stringify(data.studentIds || []),
       data.isTest ? 1 : 0, eff]
    )
    await conn.execute(
      `INSERT INTO course_schedule (id, course_id, effective_from, valid_until, teacher_id, student_ids, classroom, weekday, start_time, end_time, hours_per_class, created_by)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), id, eff, data.teacherId, JSON.stringify(data.studentIds || []),
       data.classroom || '',
       data.weekday, data.startTime, data.endTime, data.hoursPerClass || 1,
       data.createdBy || null]
    )
    await conn.commit()
    return await getById(id)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function update(id, data) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [existing] = await conn.execute('SELECT * FROM courses WHERE id = ?', [id])
    if (existing.length === 0) throw new Error('课程不存在')
    const c = existing[0]
    const currentStudentIds = parseStudentIds(c.student_ids)

    const hasEffectiveFrom = data.effectiveFrom !== undefined && data.effectiveFrom !== null
    const effectiveFrom = hasEffectiveFrom ? data.effectiveFrom : formatDate(c.effective_from || new Date())

    if (hasEffectiveFrom) {
      // 0. 关闭被新行取代的"开放" schedule 行：
      //    原行建课程时 valid_until=NULL（开放/永久生效），如果不显式关闭，
      //    新行的 effective_from 起它仍被认为"适用"，与新行重叠 ——
      //    读算法 .find() 会因 weekday 不匹配跳过新行，然后回退到老行，
      //    导致"已编辑的下一周仍显示老值"。这里把所有 eff < 新 eff 的开放行
      //    的 valid_until 设为新 eff，使它们从新 eff 起不再适用。
      await conn.execute(
        `UPDATE course_schedule SET valid_until = ?
         WHERE course_id = ? AND valid_until IS NULL AND effective_from <= ?`,
        [effectiveFrom, id, effectiveFrom]
      )
      // 1. 把当前可变值归档到 course_history
      await conn.execute(
        `INSERT INTO course_history (id, course_id, effective_from, superseded_at, teacher_id, student_ids, classroom, weekday, start_time, end_time, hours_per_class)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, formatDate(c.effective_from || new Date()), effectiveFrom,
         c.teacher_id, JSON.stringify(currentStudentIds), c.classroom || '',
         c.weekday, c.start_time, c.end_time, c.hours_per_class]
      )
      // 2. 新值写入 course_schedule（valid_until: null = cascading；日期 = 仅本节）
      const validUntil = data.validUntil || null
      await conn.execute(
        `INSERT INTO course_schedule (id, course_id, effective_from, valid_until, teacher_id, student_ids, classroom, weekday, start_time, end_time, hours_per_class, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, effectiveFrom, validUntil,
         data.teacherId ?? c.teacher_id,
         JSON.stringify(data.studentIds || currentStudentIds),
         data.classroom ?? (c.classroom || ''),
         data.weekday ?? c.weekday,
         data.startTime ?? c.start_time,
         data.endTime ?? c.end_time,
         data.hoursPerClass ?? c.hours_per_class,
         data.createdBy || null]
      )
    }

    // 3. 更新 courses 当前默认值
    await conn.execute(
      `UPDATE courses SET name = ?, teacher_id = ?, weekday = ?, start_time = ?, end_time = ?,
       classroom = ?, hours_per_class = ?, student_ids = ?, effective_from = ? WHERE id = ?`,
      [
        data.name ?? c.name,
        data.teacherId !== undefined ? data.teacherId : c.teacher_id,
        data.weekday !== undefined ? data.weekday : c.weekday,
        data.startTime ?? c.start_time,
        data.endTime ?? c.end_time,
        data.classroom !== undefined ? data.classroom : c.classroom,
        data.hoursPerClass !== undefined ? data.hoursPerClass : c.hours_per_class,
        JSON.stringify(data.studentIds || currentStudentIds),
        effectiveFrom,
        id
      ]
    )
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  return await getById(id)
}

export async function softDelete(id) {
  const [result] = await pool.execute(
    `UPDATE courses SET status = 'deleted' WHERE id = ? AND status = 'active'`,
    [id]
  )
  if (result.affectedRows === 0) throw new Error('课程不存在或已删除')
  return { success: true }
}

export async function remove(id) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [records] = await conn.execute('SELECT student_ids, hours_deducted FROM attendance WHERE course_id = ?', [id])
    for (const r of records) {
      const studentIds = parseStudentIds(r.student_ids)
      if (studentIds.length > 0) {
        const placeholders = studentIds.map(() => '?').join(',')
        await conn.execute(
          `UPDATE students SET used_hours = GREATEST(0, used_hours - ?) WHERE id IN (${placeholders})`,
          [r.hours_deducted, ...studentIds]
        )
      }
    }
    await conn.execute('DELETE FROM hour_records WHERE related_id IN (SELECT id FROM attendance WHERE course_id = ?)', [id])
    await conn.execute('DELETE FROM attendance WHERE course_id = ?', [id])
    await conn.execute('DELETE FROM course_schedule WHERE course_id = ?', [id])
    await conn.execute('DELETE FROM course_history WHERE course_id = ?', [id])
    await conn.execute('DELETE FROM courses WHERE id = ?', [id])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}