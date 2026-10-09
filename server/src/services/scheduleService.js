import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { courseEndTime } from '../../../shared/courseTime.js'

const iso = value => value instanceof Date
  ? `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value).slice(0, 10)
const sqlDateTime = value => value instanceof Date
  ? `${iso(value)} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`
  : String(value).replace('T', ' ').slice(0, 19)
const day = value => new Date(`${iso(value)}T12:00:00`)
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = day(value)
  return Number.isFinite(parsed.getTime()) && iso(parsed) === value
}
const addDays = (value, count) => {
  const d = day(value)
  d.setDate(d.getDate() + count)
  return iso(d)
}
export const weekStartOf = value => {
  const d = day(value)
  d.setDate(d.getDate() - d.getDay())
  return iso(d)
}
const weekdayOn = (weekStart, weekday) => addDays(weekStart, weekday === 7 ? 0 : weekday)
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const overlaps = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime
const parseIds = value => typeof value === 'string' ? JSON.parse(value) : (value || [])
const conflict = message => Object.assign(new Error(message), { status: 409 })
const bad = message => Object.assign(new Error(message), { status: 400 })

export function futureTrialWindow(now = new Date()) {
  const today = iso(now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return {
    clause: '(booking_date > ? OR (booking_date = ? AND start_time > ?))',
    params: [today, today, time]
  }
}

export async function acquireScheduleLock(conn) {
  const [rows] = await conn.execute("SELECT GET_LOCK('edu-system-schedule', 5) AS acquired")
  if (rows[0]?.acquired !== 1) throw conflict('排课正被其他人修改，请稍后重试')
}

export async function releaseScheduleLock(conn) {
  await conn.execute("SELECT RELEASE_LOCK('edu-system-schedule')")
}

export async function closeScheduleConnection(conn, locked) {
  let discard = false
  try { if (locked) await releaseScheduleLock(conn) } catch { discard = true }
  if (discard) {
    try { conn.destroy() } catch { /* The connection is already unusable. */ }
  } else {
    try { conn.release() } catch { try { conn.destroy() } catch { /* The connection is already unusable. */ } }
  }
}

export function validateSlot(date, startTime, endTime) {
  if (!validDate(date)) throw bad('日期无效')
  if (!/^\d{2}:(00|30)$/.test(startTime) || !/^\d{2}:(00|30)$/.test(endTime)) throw bad('上课时间须为30分钟刻度')
  if (minutes(startTime) < 450 || minutes(endTime) > 1350 || startTime >= endTime) throw bad('课程时间须在07:30至22:30之间')
}

export function firstFutureCourseDate(course, now = new Date()) {
  validateSlot(iso(now), course.startTime, course.endTime)
  const weekday = Number(course.weekday)
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw bad('星期无效')
  const daysAhead = (weekday - (now.getDay() || 7) + 7) % 7
  return addDays(iso(now), daysAhead)
}

async function loadState(conn, start, end) {
  const [courses] = await conn.execute('SELECT * FROM courses')
  const [versions] = await conn.execute('SELECT * FROM course_schedule_versions ORDER BY effective_week_start')
  const [changes] = await conn.execute(
    'SELECT * FROM course_occurrence_changes WHERE (original_date BETWEEN ? AND ?) OR (target_date BETWEEN ? AND ?)',
    [start, end, start, end]
  )
  const [handovers] = await conn.execute('SELECT * FROM course_handovers ORDER BY created_at')
  const [rosterVersions] = await conn.execute('SELECT * FROM course_roster_versions ORDER BY effective_at')
  const [detailVersions] = await conn.execute('SELECT * FROM course_detail_versions ORDER BY effective_at, id')
  const [substitutions] = await conn.execute("SELECT * FROM course_substitutions WHERE status = 'active'")
  return { courses, versions, changes, handovers, rosterVersions, detailVersions, substitutions }
}

function teacherAt(state, course, date, startTime) {
  const handovers = (state.handovers || []).filter(h => h.course_id === course.id)
  if (!handovers.length) return course.teacher_id
  const prior = handovers.filter(h => sqlDateTime(h.created_at) <= `${date} ${startTime}:00`)
  return prior.length ? prior.at(-1).new_teacher_id : handovers[0].old_teacher_id
}

export function occurrencesFromState(state, start, end) {
  const result = []
  const startWeek = weekStartOf(start)
  const lastWeek = weekStartOf(end)
  const weeks = new Set()
  for (let week = startWeek; week <= lastWeek; week = addDays(week, 7)) weeks.add(week)
  for (const change of state.changes) {
    const targetDate = iso(change.target_date)
    if (targetDate >= start && targetDate <= end) weeks.add(weekStartOf(change.original_date))
  }
  for (const week of [...weeks].sort()) {
    for (const course of state.courses) {
      const versions = state.versions.filter(v => v.course_id === course.id && iso(v.effective_week_start) <= week)
      const version = versions.at(-1)
      const weekday = version?.weekday ?? course.weekday
      const originalDate = weekdayOn(week, weekday)
      const carriedClass = version && state.changes.find(c => c.course_id === course.id &&
        iso(c.target_date) === originalDate && weekStartOf(c.original_date) < week &&
        iso(version?.effective_week_start) === week && c.start_time === version?.start_time && c.end_time === version?.end_time)
      if (carriedClass) continue
      const change = state.changes.find(c => c.course_id === course.id && iso(c.original_date) === originalDate)
      const date = change ? iso(change.target_date) : originalDate
      const startTime = change?.start_time ?? version?.start_time ?? course.start_time
      if (date < start || date > end || (course.created_at && originalDate < iso(course.created_at)) ||
          (course.effective_start_date && originalDate < iso(course.effective_start_date)) ||
          (course.archived_at && `${date} ${startTime}:00` >= sqlDateTime(course.archived_at))) continue
      const detail = (state.detailVersions || []).filter(v => v.course_id === course.id && sqlDateTime(v.effective_at) <= `${date} ${startTime}:00`).at(-1) || course
      const roster = (state.rosterVersions || []).filter(r => r.course_id === course.id &&
        sqlDateTime(r.effective_at) <= `${date} ${startTime}:00`).at(-1)
      const originalTeacherId = teacherAt(state, course, date, startTime)
      const substitution = (state.substitutions || []).find(s => s.course_id === course.id && iso(s.original_date) === originalDate && s.status === 'active')
      result.push({
        id: `${course.id}:${originalDate}`, courseId: course.id, originalDate, date,
        weekday: date === originalDate ? weekday : (day(date).getDay() || 7),
        name: detail.name, teacherId: substitution?.teacher_id || originalTeacherId,
        originalTeacherId, ownerTeacherId: course.teacher_id,
        substitution: substitution ? { id: substitution.id, reason: substitution.reason, arrangedBy: substitution.arranged_by } : null,
        startTime,
        endTime: change?.end_time ?? version?.end_time ?? course.end_time,
        classroom: detail.classroom, hoursPerClass: Number(detail.hours_per_class),
        studentIds: parseIds(roster?.student_ids ?? course.student_ids), adjusted: !!change,
        isTest: !!course.is_test
      })
    }
  }
  return result.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
}

export async function listOccurrences(start, end, conn = pool) {
  if (!validDate(start) || !validDate(end) || end < start || (day(end) - day(start)) / 86400000 > 62) throw bad('日期范围无效或超过62天')
  const state = await loadState(conn, start, end)
  const rows = occurrencesFromState(state, start, end)
  const [teachers] = await conn.execute('SELECT id, name FROM teachers')
  const names = new Map(teachers.map(t => [t.id, t.name]))
  const [bookings] = await conn.execute(
    "SELECT course_id, occurrence_date FROM trial_bookings WHERE status = 'active' AND booking_date BETWEEN ? AND ? AND course_id IS NOT NULL",
    [start, end]
  )
  const counts = new Map()
  for (const booking of bookings) {
    const key = `${booking.course_id}:${iso(booking.occurrence_date)}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return rows.map(row => ({ ...row, teacherName: names.get(row.teacherId) || '',
    originalTeacherName: names.get(row.originalTeacherId) || '', trialCount: counts.get(row.id) || 0 }))
}

async function ensureNoTrialImpact(conn, courseId, fromDate, onlyOriginalDate = null, untilDate = null) {
  const future = futureTrialWindow()
  const [rows] = await conn.execute(
    `SELECT id, booking_date, start_time, student_name_snapshot, teacher_name_snapshot FROM trial_bookings WHERE course_id = ? AND status = 'active'
     AND booking_date >= ? AND ${future.clause} ${onlyOriginalDate ? 'AND occurrence_date = ?' : ''}
     ${untilDate ? 'AND booking_date < ?' : ''} ORDER BY booking_date, start_time`,
    [courseId, fromDate, ...future.params, ...(onlyOriginalDate ? [onlyOriginalDate] : []), ...(untilDate ? [untilDate] : [])]
  )
  if (rows.length) throw Object.assign(conflict('请先取消或重新安排以下试听预约'), { details: rows.map(r => ({ id: r.id, date: iso(r.booking_date), time: r.start_time, student: r.student_name_snapshot, teacher: r.teacher_name_snapshot })) })
}

function assertNoOccurrenceConflict(candidate, occurrences, ownCourseId) {
  for (const item of occurrences) {
    if (item.courseId === ownCourseId && item.originalDate === candidate.originalDate) continue
    if (item.date !== candidate.date || !overlaps(item, candidate)) continue
    const sameTeacher = item.teacherId === candidate.teacherId
    const sameStudent = item.studentIds.some(id => candidate.studentIds.includes(id))
    if (sameTeacher || sameStudent) throw conflict(`与${item.name}的上课时间冲突`)
  }
}

async function assertNoTrialConflict(conn, candidate, ownCourseId) {
  const [trials] = await conn.execute(
    "SELECT * FROM trial_bookings WHERE status = 'active' AND booking_date = ?", [candidate.date]
  )
  for (const trial of trials) {
    if (trial.course_id === ownCourseId) continue
    if (trial.start_time < candidate.endTime && candidate.startTime < trial.end_time &&
      (trial.teacher_id === candidate.teacherId || candidate.studentIds.includes(trial.student_id))) {
      throw conflict('与已有试听预约的时间冲突')
    }
  }
}

export async function assertRecurringAvailable(conn, candidate, ownCourseId = null, fromDate = iso(new Date()), untilDate = null) {
  candidate = { ...candidate, studentIds: candidate.studentIds || [] }
  validateSlot(fromDate, candidate.startTime, candidate.endTime)
  if (!Number.isInteger(Number(candidate.weekday)) || Number(candidate.weekday) < 1 || Number(candidate.weekday) > 7) throw bad('星期无效')
  const week = weekStartOf(fromDate)
  const [versions] = await conn.execute('SELECT effective_week_start FROM course_schedule_versions WHERE effective_week_start >= ?', [week])
  const [changes] = await conn.execute('SELECT target_date FROM course_occurrence_changes WHERE target_date >= ?', [fromDate])
  const [trials] = await conn.execute("SELECT booking_date FROM trial_bookings WHERE status = 'active' AND booking_date >= ?", [fromDate])
  const [futureCourses] = await conn.execute('SELECT effective_start_date FROM courses WHERE effective_start_date >= ? AND archived_at IS NULL', [fromDate])
  const [substitutions] = await conn.execute("SELECT original_date FROM course_substitutions WHERE status = 'active' AND original_date >= ?", [fromDate])
  const boundaries = [week, ...versions.map(v => weekStartOf(v.effective_week_start)),
    ...changes.map(c => weekStartOf(c.target_date)), ...trials.map(t => weekStartOf(t.booking_date)),
    ...futureCourses.map(c => weekStartOf(c.effective_start_date)), ...substitutions.map(s => weekStartOf(s.original_date))]
  const weeks = [...new Set(boundaries.flatMap(boundary => [boundary, addDays(boundary, 7)]))]
    .filter(value => !untilDate || value < untilDate).sort()
  for (const boundary of weeks) {
    const targetDate = weekdayOn(boundary, Number(candidate.weekday))
    if (targetDate < fromDate) continue
    const state = await loadState(conn, boundary, addDays(boundary, 6))
    const occurrences = occurrencesFromState(state, boundary, addDays(boundary, 6))
    // A cross-week move still collides with the target week's existing lesson;
    // subsequent weeks replace their own recurring lesson.
    const replacesOwnWeek = weekStartOf(candidate.originalDate || targetDate) === boundary || boundary > weekStartOf(fromDate)
    const ownOccurrence = replacesOwnWeek && ownCourseId && occurrences.find(item => item.courseId === ownCourseId && weekStartOf(item.originalDate) === boundary)
    const proposed = { ...candidate, date: targetDate, originalDate: ownOccurrence?.originalDate ?? candidate.originalDate,
      teacherId: ownOccurrence?.substitution ? ownOccurrence.teacherId : candidate.teacherId }
    assertNoOccurrenceConflict(proposed, occurrences, ownCourseId)
    await assertNoTrialConflict(conn, proposed, ownCourseId)
  }
}

async function rescheduleInTransaction(conn, courseId, data, teacherScope, editedHours = null) {
  const originalDate = data.originalDate
  const targetDate = data.targetDate
  const startTime = data.startTime
  const scope = data.scope
  if (!['once', 'future'].includes(scope)) throw bad('请选择仅这一次或从这次起每周')
  if (!validDate(targetDate)) throw bad('日期无效')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(originalDate || '') || iso(day(originalDate)) !== originalDate) throw bad('原上课日期无效')
  const week = weekStartOf(originalDate)
  const targetWeek = weekStartOf(targetDate)
  const crossWeek = week !== targetWeek
  if (scope === 'future' && crossWeek && targetWeek !== addDays(week, 7)) throw bad('跨周永久调课只可从下一周开始')
    const [found] = await conn.execute('SELECT * FROM courses WHERE id = ? FOR UPDATE', [courseId])
    const course = found[0]
    if (!course || course.archived_at) throw bad('课程不存在或已归档')
    if (teacherScope && course.teacher_id !== teacherScope) throw Object.assign(new Error('只能调整自己的课程'), { status: 403 })
    const [existingChange] = await conn.execute('SELECT target_date FROM course_occurrence_changes WHERE course_id = ? AND original_date = ?', [courseId, originalDate])
    const firstWeek = [week, targetWeek, existingChange[0] ? weekStartOf(existingChange[0].target_date) : week].sort()[0]
    const lastWeek = [week, targetWeek, existingChange[0] ? weekStartOf(existingChange[0].target_date) : week].sort().at(-1)
    const state = await loadState(conn, firstWeek, addDays(lastWeek, 6))
    const current = occurrencesFromState(state, firstWeek, addDays(lastWeek, 6)).find(o => o.courseId === courseId && o.originalDate === originalDate)
    if (!current) throw bad('所选课次不存在')
    const endTime = courseEndTime(startTime, editedHours ?? current.hoursPerClass)
    if (!endTime) throw bad('请检查开始时间和课时，课程须在07:30至22:30之间')
    validateSlot(targetDate, startTime, endTime)
    if (current.date === targetDate && current.startTime === startTime && current.endTime === endTime) throw bad('调课日期和时间未改变')
    const now = new Date()
    const sourceStart = new Date(`${current.date}T${current.startTime}:00`)
    const targetStart = new Date(`${targetDate}T${startTime}:00`)
    if (sourceStart < now || targetStart < now) throw bad('过去的课程不能调课')
    if (scope === 'future') {
      const [recorded] = await conn.execute(`SELECT id FROM attendance WHERE course_id = ?
        AND (original_date >= ? OR (original_date IS NULL AND date >= ?))
        AND voided_at IS NULL LIMIT 1`, [courseId, originalDate, week])
      if (recorded.length) throw conflict('后续已有点名的课次，不能改变固定课表')
    }
    if (scope === 'once') {
      await ensureNoTrialImpact(conn, courseId, iso(new Date()), originalDate)
      const [attendance] = await conn.execute(`SELECT id FROM attendance WHERE course_id = ?
        AND (original_date = ? OR (original_date IS NULL AND date = ?))
        AND voided_at IS NULL LIMIT 1`, [courseId, originalDate, current.date])
      if (attendance.length) throw conflict('已点名的课次不能调课')
      const candidate = { ...current, date: targetDate, startTime, endTime }
      assertNoOccurrenceConflict(candidate, occurrencesFromState(state, targetWeek, addDays(targetWeek, 6)), courseId)
      await assertNoTrialConflict(conn, candidate, courseId)
      await conn.execute(
        `INSERT INTO course_occurrence_changes (id, course_id, original_date, target_date, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE target_date = VALUES(target_date), start_time = VALUES(start_time), end_time = VALUES(end_time)`,
        [generateId(), courseId, originalDate, targetDate, startTime, endTime]
      )
    } else {
      const [substitutions] = await conn.execute("SELECT id FROM course_substitutions WHERE course_id = ? AND original_date >= ? AND status = 'active' LIMIT 1", [courseId, originalDate])
      if (substitutions.length) throw conflict('请先取消该课程后续的临时代课，再更改固定课表')
      await ensureNoTrialImpact(conn, courseId, week > iso(new Date()) ? week : iso(new Date()))
      const [futureChanges] = await conn.execute('SELECT id FROM course_occurrence_changes WHERE course_id = ? AND original_date >= ? LIMIT 1', [courseId, originalDate])
      if (futureChanges.length) throw conflict('请先处理该课程后续的单次调课')
      const [futureVersions] = await conn.execute('SELECT id FROM course_schedule_versions WHERE course_id = ? AND effective_week_start > ? LIMIT 1', [courseId, week])
      if (futureVersions.length) throw conflict('请先处理该课程已安排的后续固定课表版本')
      const candidate = { ...current, date: targetDate, startTime, endTime }
      await assertRecurringAvailable(conn, { ...candidate, weekday: day(targetDate).getDay() || 7 }, courseId, targetDate)
      await conn.execute(
        `INSERT INTO course_schedule_versions (id, course_id, effective_week_start, weekday, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE weekday = VALUES(weekday), start_time = VALUES(start_time), end_time = VALUES(end_time)`,
        [generateId(), courseId, crossWeek ? targetWeek : week, day(targetDate).getDay() || 7, startTime, endTime]
      )
      if (crossWeek) await conn.execute(
        `INSERT INTO course_occurrence_changes (id, course_id, original_date, target_date, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`, [generateId(), courseId, originalDate, targetDate, startTime, endTime]
      )
    }
    return { courseId, originalDate, targetDate, startTime, endTime, scope }
}

export async function editRecurringTime(conn, course, startTime, hours, teacherScope) {
  const now = new Date()
  const nowText = sqlDateTime(now)
  const from = [iso(now), course.effectiveStartDate || iso(now), course.upcomingSchedule?.effectiveWeekStart || iso(now)].sort().at(-1)
  const endTime = courseEndTime(startTime, hours)
  if (!endTime) throw bad('请检查开始时间和课时，课程须在07:30至22:30之间')
  const state = await loadState(conn, from, addDays(from, 20))
  const next = occurrencesFromState(state, from, addDays(from, 20)).find(row =>
    row.courseId === course.id && `${row.date} ${row.startTime}:00` > nowText && `${row.date} ${startTime}:00` > nowText)
  if (!next) throw bad('没有可调整的后续课程，请先检查周排课')
  if (next.startTime !== startTime || next.endTime !== endTime) {
    await rescheduleInTransaction(conn, course.id, {
      originalDate: next.originalDate, targetDate: next.date, startTime, scope: 'future'
    }, teacherScope, hours)
  }
  return { effectiveDate: next.date, startTime, endTime }
}

export async function reschedule(courseId, data, teacherScope) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const result = await rescheduleInTransaction(conn, courseId, data, teacherScope)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function rescheduleDay(data, teacherScope) {
  const { sourceDate, targetDate, scope } = data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate || '') || iso(day(sourceDate)) !== sourceDate) throw bad('原上课日期无效')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate || '') || iso(day(targetDate)) !== targetDate) throw bad('新上课日期无效')
  if (!['once', 'future'].includes(scope)) throw bad('请选择仅这一次或从这次起每周')
  if (sourceDate === targetDate) throw bad('请选择其他日期')
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const week = weekStartOf(sourceDate)
    const state = await loadState(conn, week, addDays(week, 6))
    const rows = occurrencesFromState(state, sourceDate, sourceDate)
      .filter(row => !teacherScope || row.teacherId === teacherScope)
    if (!rows.length) throw bad('这一天没有可调整的正式课程')
    const changes = []
    for (const row of rows) {
      try {
        changes.push(await rescheduleInTransaction(conn, row.courseId, {
          originalDate: row.originalDate, targetDate,
          startTime: row.startTime, endTime: row.endTime, scope
        }, teacherScope))
      } catch (error) {
        error.message = `${row.name}：${error.message}`
        throw error
      }
    }
    await conn.commit()
    return { sourceDate, targetDate, scope, count: changes.length, changes }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function ensureCourseCanChange(conn, courseId, fromDate = iso(new Date())) {
  await ensureNoTrialImpact(conn, courseId, fromDate)
}

export { iso, addDays, overlaps }

// Validate actual dated occurrences, including this course's one-time overrides.
export async function assertCourseFutureAvailable(conn, courseId) {
  const today = iso(new Date())
  const [versions] = await conn.execute("SELECT effective_week_start AS boundary FROM course_schedule_versions UNION SELECT target_date FROM course_occurrence_changes UNION SELECT original_date FROM course_occurrence_changes UNION SELECT original_date FROM course_substitutions WHERE status = 'active' UNION SELECT DATE(effective_at) FROM course_roster_versions UNION SELECT DATE(created_at) FROM course_handovers UNION SELECT effective_start_date FROM courses WHERE effective_start_date IS NOT NULL AND archived_at IS NULL")
  const starts = [weekStartOf(today), ...versions.map(v => weekStartOf(v.boundary)).filter(w => w >= weekStartOf(today))]
  const weeks = [...new Set(starts.flatMap(w => [w, addDays(w, 7)]))]
  const now = sqlDateTime(new Date())
  for (const week of weeks) {
    const state = await loadState(conn, week, addDays(week, 6))
    const all = occurrencesFromState(state, week, addDays(week, 6))
    for (const item of all.filter(o => o.courseId === courseId && `${o.date} ${o.startTime}:00` >= now)) {
      assertNoOccurrenceConflict(item, all, courseId)
      await assertNoTrialConflict(conn, item, courseId)
    }
  }
}

export async function getAdjustments(courseId) {
  const [once] = await pool.execute('SELECT * FROM course_occurrence_changes WHERE course_id = ? ORDER BY original_date', [courseId])
  const [future] = await pool.execute('SELECT * FROM course_schedule_versions WHERE course_id = ? ORDER BY effective_week_start', [courseId])
  return {
    once: once.map(change => ({ ...change, original_date: iso(change.original_date), target_date: iso(change.target_date),
      linkedFutureId: future.find(version => weekStartOf(change.original_date) === addDays(iso(version.effective_week_start), -7) &&
        weekdayOn(iso(version.effective_week_start), version.weekday) === iso(change.target_date) &&
        version.start_time === change.start_time && version.end_time === change.end_time)?.id || null })),
    future: future.map(v => ({ ...v, effective_week_start: iso(v.effective_week_start) }))
  }
}

export async function removeAdjustment(courseId, kind, adjustmentId, teacherScope) {
  const table = { once: 'course_occurrence_changes', future: 'course_schedule_versions' }[kind]
  if (!table) throw bad('调课类型无效')
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn); locked = true
    await conn.beginTransaction()
    const [courses] = await conn.execute('SELECT * FROM courses WHERE id = ? FOR UPDATE', [courseId])
    if (!courses[0] || courses[0].archived_at) throw bad('课程不存在或已归档')
    if (teacherScope && courses[0].teacher_id !== teacherScope) throw Object.assign(new Error('只能调整自己的课程'), { status: 403 })
    const [rows] = await conn.execute(`SELECT * FROM ${table} WHERE id = ? AND course_id = ?`, [adjustmentId, courseId])
    const record = rows[0]
    if (!record) throw bad('调课记录不存在')
    const linked = kind === 'once'
      ? (await conn.execute('SELECT * FROM course_schedule_versions WHERE course_id = ? AND effective_week_start = ?', [courseId, weekStartOf(record.target_date)]))[0]
        .find(v => weekStartOf(record.original_date) === addDays(iso(v.effective_week_start), -7) &&
          weekdayOn(iso(v.effective_week_start), v.weekday) === iso(record.target_date) &&
          v.start_time === record.start_time && v.end_time === record.end_time)
      : (await conn.execute('SELECT * FROM course_occurrence_changes WHERE course_id = ? AND target_date = ?', [courseId, weekdayOn(iso(record.effective_week_start), record.weekday)]))[0]
        .find(c => weekStartOf(c.original_date) === addDays(iso(record.effective_week_start), -7) &&
          c.start_time === record.start_time && c.end_time === record.end_time)
    const boundary = kind === 'once' ? iso(record.original_date) : iso(record.effective_week_start)
    const week = weekStartOf(boundary)
    const now = sqlDateTime(new Date())
    if (kind === 'future' && week <= weekStartOf(iso(new Date()))) throw bad('已生效的固定课表不能移除，请另建后续版本')
    if (kind === 'once' && `${iso(record.target_date)} ${record.start_time}:00` <= now) throw bad('过去的调课不能移除')
    if (linked && `${iso(kind === 'once' ? record.original_date : linked.original_date)} ${linked.start_time}:00` <= now) throw bad('原课次已开始，不能移除这项跨周永久调课')
    const onceRecord = kind === 'once' ? record : linked
    const futureRecord = kind === 'future' ? record : linked
    let nextVersionStart = null
    if (futureRecord) {
      const [nextVersions] = await conn.execute(
        'SELECT effective_week_start FROM course_schedule_versions WHERE course_id = ? AND effective_week_start > ? ORDER BY effective_week_start LIMIT 1',
        [courseId, iso(futureRecord.effective_week_start)]
      )
      nextVersionStart = nextVersions[0] ? iso(nextVersions[0].effective_week_start) : null
    }
    if (onceRecord) await ensureNoTrialImpact(conn, courseId, iso(new Date()), iso(onceRecord.original_date))
    if (futureRecord) await ensureNoTrialImpact(conn, courseId, iso(futureRecord.effective_week_start), null, nextVersionStart)
    if (futureRecord) {
      const [substitutions] = await conn.execute("SELECT id FROM course_substitutions WHERE course_id = ? AND original_date >= ? AND status = 'active' LIMIT 1", [courseId, iso(futureRecord.effective_week_start)])
      if (substitutions.length) throw conflict('请先取消受影响的临时代课，再移除固定课表')
    }
    if (onceRecord) {
      const [attendance] = await conn.execute(
        `SELECT id FROM attendance WHERE course_id = ? AND
          (original_date = ? OR (original_date IS NULL AND date IN (?, ?)))
          AND voided_at IS NULL LIMIT 1`,
        [courseId, iso(onceRecord.original_date), iso(onceRecord.original_date), iso(onceRecord.target_date)]
      )
      if (attendance.length) throw conflict('受影响课次已有点名记录')
    }
    if (futureRecord) {
      const [attendance] = await conn.execute(
        `SELECT id FROM attendance WHERE course_id = ?
          AND (original_date >= ? OR (original_date IS NULL AND date >= ?))
          AND voided_at IS NULL ${nextVersionStart ? 'AND (original_date < ? OR (original_date IS NULL AND date < ?))' : ''} LIMIT 1`,
        [courseId, iso(futureRecord.effective_week_start), iso(futureRecord.effective_week_start),
          ...(nextVersionStart ? [nextVersionStart, nextVersionStart] : [])]
      )
      if (attendance.length) throw conflict('受影响课次已有点名记录')
    }
    await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [adjustmentId])
    if (linked) await conn.execute(`DELETE FROM ${kind === 'once' ? 'course_schedule_versions' : 'course_occurrence_changes'} WHERE id = ?`, [linked.id])
    if (futureRecord) {
      // A not-yet-effective course edit stores its hours alongside this schedule period.
      const [removedDetails] = await conn.execute(
        `DELETE FROM course_detail_versions WHERE course_id = ? AND effective_at >= ? ${nextVersionStart ? 'AND effective_at < ?' : ''}`,
        [courseId, `${iso(futureRecord.effective_week_start)} 00:00:00`, ...(nextVersionStart ? [`${nextVersionStart} 00:00:00`] : [])]
      )
      if (removedDetails.affectedRows) {
        const [[latest]] = await conn.execute('SELECT name, classroom, hours_per_class FROM course_detail_versions WHERE course_id = ? ORDER BY effective_at DESC, id DESC LIMIT 1', [courseId])
        if (latest) await conn.execute('UPDATE courses SET name = ?, classroom = ?, hours_per_class = ? WHERE id = ?', [latest.name, latest.classroom, latest.hours_per_class, courseId])
      }
    }
    const affectedWeeks = new Set([week])
    if (linked) affectedWeeks.add(weekStartOf(kind === 'once' ? record.target_date : linked.original_date))
    for (const affectedWeek of affectedWeeks) {
      const all = occurrencesFromState(await loadState(conn, affectedWeek, addDays(affectedWeek, 6)), affectedWeek, addDays(affectedWeek, 6))
      for (const restored of all.filter(o => o.courseId === courseId)) {
        if (`${restored.date} ${restored.startTime}:00` <= now) throw bad('不能恢复到过去的时段')
        assertNoOccurrenceConflict(restored, all, courseId)
        await assertNoTrialConflict(conn, restored, courseId)
      }
    }
    await assertCourseFutureAvailable(conn, courseId)
    await conn.commit()
    return { success: true }
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeScheduleConnection(conn, locked) }
}
