import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { mock } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('排课集成测试只允许在显式指定的本机 3307 隔离 MySQL 实例运行')
}
const suppliedName = process.env.TEST_DB_NAME?.trim()
if (suppliedName && !/^edu_system_test_[a-z0-9_]+$/.test(suppliedName)) {
  throw new Error('TEST_DB_NAME 仅允许 edu_system_test_ 前缀的隔离测试库')
}
const name = suppliedName || `edu_system_test_${process.pid}_${Date.now()}`
const config = {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  multipleStatements: true, timezone: '+08:00'
}
const admin = await mysql.createConnection(config)
let pool
let created = false
let initialized = false
let migration
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  if (Number(identity.port) !== 3307 || !String(identity.datadir).replaceAll('\\', '/').toLowerCase().endsWith('/.qa/mysql/')) {
    throw new Error('数据库实例并非项目 .qa/mysql 隔离目录')
  }
  if (!suppliedName) {
    await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    created = true
  }
  migration = await mysql.createConnection({ ...config, database: name })
  const [existingTables] = await migration.query('SHOW TABLES')
  if (existingTables.length) throw new Error('隔离测试库已有表；为保护数据，拒绝运行集成测试')
  initialized = true
  for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(f => /^0\d{2}_.*\.sql$/.test(f)).sort()) {
    let sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8')
    if (file.startsWith('001_')) sql = sql.replace(/CREATE DATABASE IF NOT EXISTS edu_system[^;]*;/i, '').replace(/USE edu_system;/i, '')
    if (file.startsWith('002_')) continue
    await migration.query(sql)
  }
  process.env.DB_NAME = name
  const database = await import('../src/config/database.js')
  pool = database.default
  const course = await import('../src/services/courseService.js')
  const schedule = await import('../src/services/scheduleService.js')
  const trial = await import('../src/services/trialBookingService.js')
  const attendance = await import('../src/services/attendanceService.js')
  const student = await import('../src/services/studentService.js')
  const teacher = await import('../src/services/teacherService.js')
  const handover = await import('../src/services/handoverService.js')
  const stats = await import('../src/services/statsService.js')
  await pool.execute("INSERT INTO teachers (id,name,status) VALUES ('t1','老师甲','active'),('t2','老师乙','active')")
  await pool.execute("INSERT INTO students (id,name,created_by,creator_id,enrollment_stage) VALUES ('s1','正式生甲','admin',NULL,'enrolled'),('s2','正式生乙','teacher','t2','enrolled'),('p1','试听生','teacher','t1','pending')")
  await assert.rejects(() => course.create({ name: '误把试听生加入正式课', teacherId: 't1', weekday: 5,
    startTime: '09:00', endTime: '10:00', studentIds: ['p1'] }), error => error.status === 400 && /已报名/.test(error.message))
  const one = await course.create({ name: '课程甲', teacherId: 't1', weekday: 1, startTime: '09:00', endTime: '10:00', studentIds: ['s1'] })
  assert.ok(one.effectiveStartDate)
  assert.equal((await schedule.listOccurrences(schedule.addDays(one.effectiveStartDate, -1), one.effectiveStartDate))
    .filter(row => row.courseId === one.id).map(row => row.date).join(','), one.effectiveStartDate)
  await assert.rejects(() => course.update(one.id, { studentIds: ['s1', 'p1'] }, 't1'), error => error.status === 400 && /已报名/.test(error.message))
  assert.deepEqual((await course.getById(one.id)).studentIds, ['s1'])
  const currentSunday = schedule.weekStartOf(schedule.iso(new Date()))
  const secondSunday = schedule.addDays(currentSunday, 7)
  const futureCourse = await course.create({ name: '第二周课程', teacherId: 't1', weekday: 3, startTime: '11:00', endTime: '12:00', studentIds: ['s1'], effectiveStartDate: secondSunday })
  assert.equal(futureCourse.effectiveStartDate, secondSunday)
  const twoWeeks = await schedule.listOccurrences(currentSunday, schedule.addDays(secondSunday, 6))
  assert.deepEqual(twoWeeks.filter(row => row.courseId === futureCourse.id).map(row => row.date), [schedule.addDays(secondSunday, 3)])
  const distantWeek = schedule.addDays(currentSunday, 196)
  const distantCourse = await course.create({ name: '远期生效课程', teacherId: 't1', weekday: 2,
    startTime: '16:00', endTime: '17:00', studentIds: ['s1'], effectiveStartDate: distantWeek })
  const parallelCourse = await course.create({ name: '另一教师同一时段', teacherId: 't2', weekday: 2,
    startTime: '16:00', endTime: '17:00', studentIds: ['s2'] })
  await assert.rejects(() => course.create({ name: '提前创建的撞课', teacherId: 't1', weekday: 2,
    startTime: '16:00', endTime: '17:00', studentIds: ['s1'] }), /冲突/)
  await assert.rejects(() => course.update(parallelCourse.id, { studentIds: ['s1', 's2'] }, 't2'), /冲突/)
  assert.deepEqual((await course.getById(parallelCourse.id)).studentIds, ['s2'])
  await course.remove(parallelCourse.id)
  await course.remove(distantCourse.id)
  const sameWeekday = await course.create({ name: '永久微调时段', teacherId: 't2', weekday: 5,
    startTime: '18:00', endTime: '19:00', studentIds: ['s2'], effectiveStartDate: schedule.addDays(currentSunday, 42) })
  const changedFriday = schedule.addDays(currentSunday, 54)
  for (const scope of ['once', 'future']) {
    await assert.rejects(() => schedule.reschedule(sameWeekday.id, { originalDate: changedFriday, targetDate: changedFriday,
      startTime: '18:00', endTime: '19:00', scope }, 't2'), /日期和时间未改变/)
  }
  assert.deepEqual(await schedule.getAdjustments(sameWeekday.id), { once: [], future: [] })
  const laterBlocker = await course.create({ name: '微调后真实冲突', teacherId: 't2', weekday: 5,
    startTime: '19:00', endTime: '20:00', studentIds: ['s2'], effectiveStartDate: schedule.addDays(currentSunday, 42) })
  await assert.rejects(() => schedule.reschedule(sameWeekday.id, { originalDate: changedFriday, targetDate: changedFriday,
    startTime: '18:30', endTime: '19:30', scope: 'future' }, 't2'), /微调后真实冲突/)
  assert.deepEqual((await schedule.getAdjustments(sameWeekday.id)).future, [])
  await course.remove(laterBlocker.id)
  await schedule.reschedule(sameWeekday.id, { originalDate: changedFriday, targetDate: changedFriday,
    startTime: '18:30', endTime: '19:30', scope: 'future' }, 't2')
  assert.deepEqual((await schedule.listOccurrences(changedFriday, schedule.addDays(changedFriday, 7)))
    .filter(row => row.courseId === sameWeekday.id).map(row => row.startTime), ['18:30', '18:30'])
  await course.remove(sameWeekday.id)
  const movedDate = schedule.addDays(secondSunday, 4)
  await schedule.reschedule(futureCourse.id, {
    originalDate: schedule.addDays(secondSunday, 3), targetDate: movedDate,
    startTime: '11:30', endTime: '12:30', scope: 'future'
  }, 't1')
  const laterWeeks = await schedule.listOccurrences(secondSunday, schedule.addDays(secondSunday, 13))
  assert.deepEqual(laterWeeks.filter(row => row.courseId === futureCourse.id).map(row => [row.date, row.startTime]), [
    [movedDate, '11:30'], [schedule.addDays(movedDate, 7), '11:30']
  ])
  await assert.rejects(() => student.update('s1', { enrollmentStage: 'pending' }), /正式课程名单/)
  await assert.rejects(() => student.updateStatus('s1', 'quit'), /正式课程名单/)
  assert.equal((await student.getById('s1')).status, 'active')
  const otherTeacherCourse = await course.create({ name: '课程乙', teacherId: 't2', weekday: 1, startTime: '09:00', endTime: '10:00', studentIds: ['s2'] })
  const sharedStudentCourse = await course.create({ name: '跨教师学生课程', teacherId: 't1', weekday: 4, startTime: '13:00', endTime: '14:00', studentIds: ['s2'] })
  assert.deepEqual(sharedStudentCourse.studentIds, ['s2'])
  assert.deepEqual((await course.update(sharedStudentCourse.id, { studentIds: ['s1', 's2'] }, 't1')).studentIds, ['s1', 's2'])
  await assert.rejects(() => course.update(otherTeacherCourse.id, { name: '越权修改' }, 't1'), error => error.status === 403)
  await assert.rejects(() => course.remove(otherTeacherCourse.id, 't1'), error => error.status === 403)
  const [[untouched]] = await pool.execute('SELECT name, archived_at FROM courses WHERE id = ?', [otherTeacherCourse.id])
  assert.equal(untouched.name, '课程乙')
  assert.equal(untouched.archived_at, null)
  await handover.performHandover({ courseId: sharedStudentCourse.id, newTeacherId: 't2', performedBy: 'test-admin', reason: '工作安排' })
  const transferHistory = await handover.getHandoverHistory({ courseId: sharedStudentCourse.id })
  assert.equal(transferHistory.length, 1)
  assert.deepEqual([
    transferHistory[0].courseName, transferHistory[0].oldTeacherName,
    transferHistory[0].newTeacherName, transferHistory[0].performedBy, transferHistory[0].reason
  ], ['跨教师学生课程', '老师甲', '老师乙', 'test-admin', '工作安排'])
  assert.equal((await course.getById(sharedStudentCourse.id)).teacherId, 't2')
  const nextWeek = schedule.addDays(schedule.weekStartOf(schedule.iso(new Date())), 7)
  const [transferredOccurrence] = (await schedule.listOccurrences(nextWeek, schedule.addDays(nextWeek, 6)))
    .filter(row => row.courseId === sharedStudentCourse.id)
  assert.equal(transferredOccurrence.teacherId, 't2')
  await assert.rejects(() => course.create({ name: '冲突课程', teacherId: 't2', weekday: 1, startTime: '09:00', endTime: '10:00', studentIds: ['s1'] }), /冲突/)
  const now = new Date()
  const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7))
  const originalDate = schedule.iso(nextMonday)
  const targetDate = schedule.addDays(originalDate, 1)
  await assert.rejects(() => schedule.reschedule(one.id, { originalDate, targetDate, startTime: '09:30', endTime: '10:30', scope: 'once' }, 't2'), /自己的课程/)
  await schedule.reschedule(one.id, { originalDate, targetDate, startTime: '09:30', endTime: '10:30', scope: 'once' }, 't1')
  const occurrences = await schedule.listOccurrences(originalDate, targetDate)
  assert.equal(occurrences.filter(o => o.courseId === one.id && o.date === originalDate).length, 0)
  assert.equal(occurrences.find(o => o.courseId === one.id)?.date, targetDate)
  const booking = await trial.create({ studentId: 'p1', teacherId: 't1', courseId: one.id, occurrenceDate: originalDate, date: targetDate }, 't1')
  await assert.rejects(() => student.update('p1', { enrollmentStage: 'enrolled' }), /未来的试听预约/)
  await assert.rejects(() => student.update('p1', { status: 'quit' }), /未来的试听预约/)
  await assert.rejects(() => student.updateStatus('p1', 'quit'), /未来的试听预约/)
  assert.equal((await student.getById('p1')).status, 'active')
  assert.equal((await schedule.listOccurrences(targetDate, targetDate)).find(o => o.courseId === one.id).trialCount, 1)
  await assert.rejects(() => schedule.reschedule(one.id, { originalDate, targetDate, startTime: '10:00', endTime: '11:00', scope: 'once' }, 't1'), /试听预约/)
  await assert.rejects(() => attendance.create({ courseId: one.id, date: targetDate, studentIds: ['p1'] }, 't1', { username: 'teacher1' }), /正式课程学生/)
  const record = await attendance.create({ courseId: one.id, date: targetDate, studentIds: ['s1'] }, 't1', { username: 'teacher1' })
  await assert.rejects(() => attendance.remove(record.id, 't2'), error => error.status === 403)
  await attendance.remove(record.id, 't1')
  const [oldAttendance] = await pool.execute('SELECT voided_at FROM attendance WHERE id = ?', [record.id])
  assert.ok(oldAttendance[0].voided_at)
  const [[restoredStudent]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s1'])
  assert.equal(Number(restoredStudent.used_hours), 0)
  const [hourHistory] = await pool.execute('SELECT type, hours FROM hour_records WHERE student_id = ? AND related_id = ?', ['s1', record.id])
  assert.deepEqual(hourHistory.map(row => [row.type, Number(row.hours)]).sort(), [['deduct', 1], ['restore', 1]])
  const [reversals] = await pool.execute('SELECT id FROM attendance_reversals WHERE attendance_id = ?', [record.id])
  assert.equal(reversals.length, 1)
  const partial = await attendance.create({ courseId: sharedStudentCourse.id, date: transferredOccurrence.date, studentIds: ['s1', 's2'] }, null, { username: 'test-admin' })
  await attendance.removeStudents(partial.id, ['s1'], null, { username: 'test-admin' })
  const [[partiallyActive]] = await pool.execute('SELECT student_ids, voided_at FROM attendance WHERE id = ?', [partial.id])
  assert.deepEqual(typeof partiallyActive.student_ids === 'string' ? JSON.parse(partiallyActive.student_ids) : partiallyActive.student_ids, ['s2'])
  assert.equal(partiallyActive.voided_at, null)
  const [[firstBalance]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s1'])
  assert.equal(Number(firstBalance.used_hours), 0)
  const transferWorkload = await stats.getTeacherStats(transferredOccurrence.date, transferredOccurrence.date, 't2')
  assert.equal(transferWorkload[0].attendanceCount, 1)
  assert.equal(transferWorkload[0].consumedHours, 1)
  await attendance.removeStudents(partial.id, ['s2'], null, { username: 'test-admin' })
  const [[fullyVoided]] = await pool.execute('SELECT voided_at FROM attendance WHERE id = ?', [partial.id])
  assert.ok(fullyVoided.voided_at)
  const [[secondBalance]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s2'])
  assert.equal(Number(secondBalance.used_hours), 0)
  const [partialReversals] = await pool.execute('SELECT student_id FROM attendance_reversals WHERE attendance_id = ? ORDER BY student_id', [partial.id])
  assert.deepEqual(partialReversals.map(row => row.student_id), ['s1', 's2'])
  const adminRecord = await attendance.create({ courseId: futureCourse.id, date: movedDate, studentIds: ['s1'] }, null, { username: 'test-admin' })
  await assert.rejects(() => attendance.remove(adminRecord.id, 't1'), error => error.status === 403)
  const [attendanceForStats] = await pool.execute('SELECT course_id, date, recorded_by FROM attendance WHERE date = ? AND voided_at IS NULL', [movedDate])
  const occurrenceForStats = (await schedule.listOccurrences(movedDate, movedDate)).filter(row => row.courseId === futureCourse.id)
  assert.equal(occurrenceForStats.length, 1)
  assert.equal(attendanceForStats.length, 1)
  assert.equal(schedule.iso(attendanceForStats[0].date), movedDate)
  const workload = await stats.getTeacherStats(movedDate, movedDate, 't1')
  assert.equal(workload[0].attendanceCount, 1)
  assert.equal(workload[0].consumedHours, 1)
  const summary = await stats.getOverallStats(movedDate, movedDate, 't1')
  assert.equal(summary.totalAttendance, 1)
  assert.equal(summary.totalConsumedHours, 1)
  assert.equal(summary.activeTeachers, 1)

  const historicalWeek = schedule.addDays(currentSunday, -7)
  const historicalDate = schedule.addDays(historicalWeek, 4)
  await pool.execute("INSERT INTO teachers (id, name, status) VALUES ('t3', '历史教师', 'active')")
  await pool.execute(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, student_ids, created_at)
    VALUES ('history-course', '历史课程', 't3', 4, '20:00', '21:00', '["s2"]', ?)`, [`${historicalWeek} 00:00:00`])
  await pool.execute(`INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, recorded_by,
    course_name_snapshot, teacher_name_snapshot, student_names_snapshot, original_student_ids)
    VALUES ('history-attendance', 'history-course', ?, '["s2"]', 1, NULL, '历史课程', '历史教师', '{"s2":"正式生乙"}', '["s2"]')`, [historicalDate])
  await course.remove('history-course')
  await teacher.updateStatus('t3', 'deleted')
  const historicalStats = await stats.getTeacherStats(historicalDate, historicalDate)
  assert.equal(historicalStats.find(row => row.id === 't3')?.attendanceCount, 1)
  const historicalOverall = await stats.getOverallStats(historicalDate, historicalDate)
  assert.equal(historicalOverall.totalAttendance, historicalStats.reduce((sum, row) => sum + row.attendanceCount, 0))
  assert.equal(historicalOverall.totalTeachers, 3)

  const sourceWeek = schedule.addDays(currentSunday, 28)
  const sourceSaturday = schedule.addDays(sourceWeek, 6)
  const followingWeek = schedule.addDays(sourceWeek, 7)
  const nextTuesday = schedule.addDays(followingWeek, 2)
  const temporary = await course.create({ name: '跨周临时', teacherId: 't1', weekday: 6, startTime: '09:00', endTime: '10:00', studentIds: ['s1'], effectiveStartDate: sourceWeek })
  const permanent = await course.create({ name: '跨周永久', teacherId: 't2', weekday: 6, startTime: '11:00', endTime: '12:00', studentIds: ['s2'], effectiveStartDate: sourceWeek })
  for (const scope of ['once', 'future']) {
    await assert.rejects(() => schedule.reschedule(temporary.id, {
      originalDate: sourceSaturday, targetDate: schedule.addDays(sourceSaturday, 7),
      startTime: '09:00', endTime: '10:00', scope
    }, 't1'), error => error.status === 409 && /冲突/.test(error.message))
  }
  assert.deepEqual((await schedule.listOccurrences(sourceSaturday, sourceSaturday))
    .filter(row => row.courseId === temporary.id).map(row => row.date), [sourceSaturday])
  assert.deepEqual((await schedule.getAdjustments(temporary.id)).once, [])
  await schedule.reschedule(temporary.id, { originalDate: sourceSaturday, targetDate: nextTuesday, startTime: '09:00', endTime: '10:00', scope: 'once' }, 't1')
  await schedule.reschedule(permanent.id, { originalDate: sourceSaturday, targetDate: nextTuesday, startTime: '11:00', endTime: '12:00', scope: 'future' }, 't2')
  const vacatedSaturday = await schedule.listOccurrences(sourceSaturday, sourceSaturday)
  assert.equal(vacatedSaturday.filter(row => [temporary.id, permanent.id].includes(row.courseId)).length, 0)
  const targetOnly = await schedule.listOccurrences(followingWeek, schedule.addDays(followingWeek, 6))
  assert.deepEqual(targetOnly.filter(row => row.courseId === temporary.id).map(row => row.date), [nextTuesday, schedule.addDays(followingWeek, 6)])
  assert.deepEqual(targetOnly.filter(row => row.courseId === permanent.id).map(row => row.date), [nextTuesday])
  const afterTarget = await schedule.listOccurrences(schedule.addDays(followingWeek, 7), schedule.addDays(followingWeek, 13))
  assert.deepEqual(afterTarget.filter(row => row.courseId === temporary.id).map(row => row.date), [schedule.addDays(sourceSaturday, 14)])
  assert.deepEqual(afterTarget.filter(row => row.courseId === permanent.id).map(row => row.date), [schedule.addDays(nextTuesday, 7)])
  const linkedAdjustments = await schedule.getAdjustments(permanent.id)
  assert.equal(linkedAdjustments.once.length, 1)
  assert.equal(linkedAdjustments.future.length, 1)
  const restoredBlocker = await course.create({ name: '恢复冲突', teacherId: 't2', weekday: 6, startTime: '11:00', endTime: '12:00', studentIds: ['s2'], effectiveStartDate: sourceWeek })
  await assert.rejects(() => schedule.removeAdjustment(permanent.id, 'future', linkedAdjustments.future[0].id, 't2'), /冲突/)
  assert.equal((await schedule.getAdjustments(permanent.id)).once.length, 1)
  await course.remove(restoredBlocker.id)
  await schedule.removeAdjustment(permanent.id, 'future', linkedAdjustments.future[0].id, 't2')
  const clearedAdjustments = await schedule.getAdjustments(permanent.id)
  assert.equal(clearedAdjustments.once.length, 0)
  assert.equal(clearedAdjustments.future.length, 0)
  assert.deepEqual((await schedule.listOccurrences(sourceWeek, schedule.addDays(followingWeek, 6)))
    .filter(row => row.courseId === permanent.id).map(row => row.date), [sourceSaturday, schedule.addDays(followingWeek, 6)])
  await schedule.reschedule(permanent.id, { originalDate: sourceSaturday, targetDate: nextTuesday, startTime: '11:00', endTime: '12:00', scope: 'future' }, 't2')
  const relinked = await schedule.getAdjustments(permanent.id)
  const laterTrialDate = schedule.addDays(nextTuesday, 7)
  const [laterOccurrence] = (await schedule.listOccurrences(laterTrialDate, laterTrialDate))
    .filter(row => row.courseId === permanent.id)
  assert.ok(laterOccurrence)
  const laterTrial = await trial.create({ studentId: 'p1', teacherId: 't2', courseId: permanent.id,
    occurrenceDate: laterOccurrence.originalDate, date: laterTrialDate }, 't2')
  await assert.rejects(() => schedule.removeAdjustment(permanent.id, 'once', relinked.once[0].id, 't2'), /试听预约/)
  assert.equal((await schedule.getAdjustments(permanent.id)).future.length, 1)
  await trial.cancel(laterTrial.id, 't2')
  await schedule.removeAdjustment(permanent.id, 'once', relinked.once[0].id, 't2')
  assert.deepEqual((await schedule.getAdjustments(permanent.id)).future, [])
  await course.remove(temporary.id)
  await course.remove(permanent.id)

  const independentWeek = schedule.addDays(currentSunday, 84)
  const independentWednesday = schedule.addDays(independentWeek, 3)
  const independentThursday = schedule.addDays(independentWeek, 4)
  const independentCourse = await course.create({ name: '单次调课撤销', teacherId: 't1', weekday: 3,
    startTime: '19:00', endTime: '20:00', studentIds: ['s1'], effectiveStartDate: independentWeek })
  await schedule.reschedule(independentCourse.id, { originalDate: independentWednesday,
    targetDate: independentThursday, startTime: '19:00', endTime: '20:00', scope: 'once' }, 't1')
  const laterAttendance = await attendance.create({ courseId: independentCourse.id,
    date: schedule.addDays(independentWednesday, 7), studentIds: ['s1'] }, 't1', { username: 'teacher1' })
  const independentAdjustment = await schedule.getAdjustments(independentCourse.id)
  await schedule.removeAdjustment(independentCourse.id, 'once', independentAdjustment.once[0].id, 't1')
  assert.deepEqual((await schedule.listOccurrences(independentWeek, schedule.addDays(independentWeek, 6)))
    .filter(row => row.courseId === independentCourse.id).map(row => row.date), [independentWednesday])
  const [retainedAttendance] = await pool.execute('SELECT id FROM attendance WHERE id = ? AND voided_at IS NULL', [laterAttendance.id])
  assert.equal(retainedAttendance.length, 1)
  await course.remove(independentCourse.id)

  const versionWeek = schedule.addDays(currentSunday, 112)
  const versionWednesday = schedule.addDays(versionWeek, 3)
  const secondVersionWeek = schedule.addDays(versionWeek, 7)
  const secondVersionThursday = schedule.addDays(secondVersionWeek, 4)
  const secondVersionFriday = schedule.addDays(secondVersionWeek, 5)
  const versionedCourse = await course.create({ name: '两次固定调课', teacherId: 't2', weekday: 3,
    startTime: '17:00', endTime: '18:00', studentIds: ['s2'], effectiveStartDate: versionWeek })
  await schedule.reschedule(versionedCourse.id, { originalDate: versionWednesday,
    targetDate: schedule.addDays(versionWeek, 4), startTime: '17:00', endTime: '18:00', scope: 'future' }, 't2')
  await schedule.reschedule(versionedCourse.id, { originalDate: secondVersionThursday,
    targetDate: secondVersionFriday, startTime: '17:00', endTime: '18:00', scope: 'future' }, 't2')
  const laterVersionDate = schedule.addDays(secondVersionFriday, 7)
  const [laterVersionOccurrence] = (await schedule.listOccurrences(laterVersionDate, laterVersionDate))
    .filter(row => row.courseId === versionedCourse.id)
  assert.ok(laterVersionOccurrence)
  const laterVersionTrial = await trial.create({ studentId: 'p1', teacherId: 't2', courseId: versionedCourse.id,
    occurrenceDate: laterVersionOccurrence.originalDate, date: laterVersionDate }, 't2')
  const laterVersionAttendance = await attendance.create({ courseId: versionedCourse.id,
    date: laterVersionDate, studentIds: ['s2'] }, 't2', { username: 'teacher2' })
  const versionAdjustments = await schedule.getAdjustments(versionedCourse.id)
  await schedule.removeAdjustment(versionedCourse.id, 'future', versionAdjustments.future[0].id, 't2')
  assert.deepEqual((await schedule.listOccurrences(versionWeek, schedule.addDays(versionWeek, 6)))
    .filter(row => row.courseId === versionedCourse.id).map(row => row.date), [versionWednesday])
  assert.deepEqual((await schedule.listOccurrences(laterVersionDate, laterVersionDate))
    .filter(row => row.courseId === versionedCourse.id).map(row => row.date), [laterVersionDate])
  const [laterAttendanceRows] = await pool.execute('SELECT id FROM attendance WHERE id = ? AND voided_at IS NULL', [laterVersionAttendance.id])
  assert.equal(laterAttendanceRows.length, 1)
  await trial.cancel(laterVersionTrial.id, 't2')
  await course.remove(versionedCourse.id)

  const batchWeek = schedule.addDays(currentSunday, 56)
  const batchSaturday = schedule.addDays(batchWeek, 6)
  const batchTuesday = schedule.addDays(batchWeek, 9)
  const batchA = await course.create({ name: '整天甲', teacherId: 't1', weekday: 6, startTime: '13:00', endTime: '14:00', studentIds: ['s1'], effectiveStartDate: batchWeek })
  const batchB = await course.create({ name: '整天乙', teacherId: 't2', weekday: 6, startTime: '15:00', endTime: '16:00', studentIds: ['s2'], effectiveStartDate: batchWeek })
  const batchTrial = await trial.create({ studentId: 'p1', teacherId: 't2', courseId: batchB.id,
    occurrenceDate: batchSaturday, date: batchSaturday }, 't2')
  await assert.rejects(() => schedule.rescheduleDay({ sourceDate: batchSaturday, targetDate: batchTuesday, scope: 'once' }, null), /整天乙：.*试听预约/)
  const [afterTrialBlock] = await pool.execute('SELECT course_id FROM course_occurrence_changes WHERE course_id IN (?, ?)', [batchA.id, batchB.id])
  assert.equal(afterTrialBlock.length, 0)
  assert.deepEqual((await schedule.listOccurrences(batchSaturday, batchSaturday))
    .filter(row => [batchA.id, batchB.id].includes(row.courseId)).map(row => row.courseId), [batchA.id, batchB.id])
  await trial.cancel(batchTrial.id, 't2')
  const blocker = await course.create({ name: '目标冲突', teacherId: 't2', weekday: 2, startTime: '15:00', endTime: '16:00', studentIds: ['s2'], effectiveStartDate: schedule.addDays(batchWeek, 7) })
  await assert.rejects(() => schedule.rescheduleDay({ sourceDate: batchSaturday, targetDate: batchTuesday, scope: 'once' }, null), /冲突/)
  const [unchangedChanges] = await pool.execute('SELECT course_id FROM course_occurrence_changes WHERE course_id IN (?, ?)', [batchA.id, batchB.id])
  assert.equal(unchangedChanges.length, 0)
  const teacherOnlyMove = await schedule.rescheduleDay({ sourceDate: batchSaturday, targetDate: batchTuesday, scope: 'once' }, 't1')
  assert.deepEqual(teacherOnlyMove.changes.map(change => change.courseId), [batchA.id])
  assert.deepEqual((await schedule.listOccurrences(batchSaturday, batchSaturday))
    .filter(row => [batchA.id, batchB.id].includes(row.courseId)).map(row => row.courseId), [batchB.id])
  const teacherAdjustment = await schedule.getAdjustments(batchA.id)
  await schedule.removeAdjustment(batchA.id, 'once', teacherAdjustment.once[0].id, 't1')
  await course.remove(blocker.id)
  const movedDay = await schedule.rescheduleDay({ sourceDate: batchSaturday, targetDate: batchTuesday, scope: 'once' }, null)
  assert.equal(movedDay.count, 2)
  const batchTargetRows = await schedule.listOccurrences(batchTuesday, batchTuesday)
  assert.deepEqual(batchTargetRows.filter(row => [batchA.id, batchB.id].includes(row.courseId)).map(row => row.startTime), ['13:00', '15:00'])
  const permanentBatchSaturday = schedule.addDays(batchSaturday, 14)
  const permanentBatchTuesday = schedule.addDays(permanentBatchSaturday, 3)
  const permanentBatch = await schedule.rescheduleDay({ sourceDate: permanentBatchSaturday, targetDate: permanentBatchTuesday, scope: 'future' }, null)
  assert.equal(permanentBatch.count, 2)
  const permanentBatchWeek = schedule.weekStartOf(permanentBatchTuesday)
  const permanentBatchRows = await schedule.listOccurrences(permanentBatchWeek, schedule.addDays(permanentBatchWeek, 13))
  assert.deepEqual(permanentBatchRows.filter(row => [batchA.id, batchB.id].includes(row.courseId)).map(row => row.date), [
    permanentBatchTuesday, permanentBatchTuesday, schedule.addDays(permanentBatchTuesday, 7), schedule.addDays(permanentBatchTuesday, 7)
  ])

  const decimalWeek = schedule.addDays(currentSunday, 84)
  const halfDate = schedule.addDays(decimalWeek, 5)
  const oneHalfDate = schedule.addDays(decimalWeek, 6)
  const halfCourse = await course.create({ name: '半课时课', teacherId: 't1', weekday: 5, startTime: '17:00', endTime: '17:30', hoursPerClass: 0.5, studentIds: ['s1'], effectiveStartDate: decimalWeek })
  const oneHalfCourse = await course.create({ name: '一点五课时课', teacherId: 't1', weekday: 6, startTime: '18:00', endTime: '19:30', hoursPerClass: 1.5, studentIds: ['s1'], effectiveStartDate: decimalWeek })
  const wholeCourse = await course.create({ name: '两课时课', teacherId: 't2', weekday: 7, startTime: '19:00', endTime: '21:00', hoursPerClass: 2, studentIds: ['s2'], effectiveStartDate: decimalWeek })
  assert.deepEqual([halfCourse.hoursPerClass, oneHalfCourse.hoursPerClass, wholeCourse.hoursPerClass], [0.5, 1.5, 2])
  const [[beforeDecimal]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s1'])
  for (const [item, date, hours] of [[halfCourse, halfDate, 0.5], [oneHalfCourse, oneHalfDate, 1.5]]) {
    const decimalRecord = await attendance.create({ courseId: item.id, date, studentIds: ['s1'] }, 't1', { username: 'teacher1' })
    assert.equal(decimalRecord.hoursDeducted, hours)
    const [[afterDeduct]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s1'])
    assert.equal(Number(afterDeduct.used_hours), Number(beforeDecimal.used_hours) + hours)
    await attendance.remove(decimalRecord.id, 't1', { username: 'teacher1' })
    const [[afterRestore]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s1'])
    assert.equal(Number(afterRestore.used_hours), Number(beforeDecimal.used_hours))
  }
  const editedHalf = await course.update(halfCourse.id, { name: '半课时资料改动', classroom: 'A101', hoursPerClass: 1.5 }, 't1')
  assert.deepEqual([editedHalf.weekday, editedHalf.startTime, editedHalf.endTime, editedHalf.hoursPerClass, editedHalf.classroom], [5, '17:00', '17:30', 1.5, 'A101'])
  await course.update(halfCourse.id, { startTime: '16:00' }, 't1')
  const editedSlot = (await schedule.listOccurrences(halfDate, halfDate)).find(row => row.courseId === halfCourse.id)
  assert.deepEqual([editedSlot.startTime, editedSlot.endTime, editedSlot.hoursPerClass], ['16:00', '17:30', 1.5])
  await course.remove(oneHalfCourse.id, 't1')
  const [[archivedDecimal]] = await pool.execute('SELECT archived_at FROM courses WHERE id = ?', [oneHalfCourse.id])
  const [[retainedDecimalAttendance]] = await pool.execute('SELECT COUNT(*) AS total FROM attendance WHERE course_id = ?', [oneHalfCourse.id])
  assert.ok(archivedDecimal.archived_at)
  assert.equal(retainedDecimalAttendance.total, 1)

  const collisionWeek = schedule.addDays(currentSunday, 168)
  const sourceSunday = schedule.addDays(collisionWeek, 7)
  const combinedSunday = schedule.addDays(sourceSunday, 7)
  const sameDayCourse = await course.create({ name: '同日两节课次', teacherId: 't2', weekday: 7,
    startTime: '07:30', endTime: '08:30', studentIds: ['s2'], effectiveStartDate: collisionWeek })
  await schedule.reschedule(sameDayCourse.id, { originalDate: sourceSunday, targetDate: combinedSunday,
    startTime: '09:00', endTime: '10:00', scope: 'once' }, 't2')
  const sameDayOccurrences = (await schedule.listOccurrences(combinedSunday, combinedSunday))
    .filter(row => row.courseId === sameDayCourse.id)
  assert.deepEqual(sameDayOccurrences.map(row => [row.originalDate, row.startTime]),
    [[combinedSunday, '07:30'], [sourceSunday, '09:00']])
  await assert.rejects(() => attendance.create({ courseId: sameDayCourse.id, date: combinedSunday,
    studentIds: ['s2'] }, 't2', { username: 'teacher2' }), /具体课次/)
  const [[beforeSameDay]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s2'])
  const sameDayRecords = []
  for (const occurrence of sameDayOccurrences) {
    sameDayRecords.push(await attendance.create({ courseId: sameDayCourse.id, date: combinedSunday,
      originalDate: occurrence.originalDate, studentIds: ['s2'] }, 't2', { username: 'teacher2' }))
  }
  assert.deepEqual(sameDayRecords.map(record => [record.originalDate, record.startTime]),
    [[combinedSunday, '07:30'], [sourceSunday, '09:00']])
  await assert.rejects(() => attendance.create({ courseId: sameDayCourse.id, date: combinedSunday,
    originalDate: sourceSunday, studentIds: ['s2'] }, 't2', { username: 'teacher2' }),
  error => error.status === 409)
  const [[afterSameDay]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['s2'])
  assert.equal(Number(afterSameDay.used_hours), Number(beforeSameDay.used_hours) + 2)
  assert.equal((await stats.getTeacherStats(combinedSunday, combinedSunday)).find(row => row.id === 't2')?.attendanceCount, 2)
  assert.equal((await attendance.getAll(null, { courseId: sameDayCourse.id, date: combinedSunday,
    originalDate: sourceSunday })).data.length, 1)
  await attendance.remove(sameDayRecords[1].id, 't2', { username: 'teacher2' })
  await schedule.reschedule(sameDayCourse.id, { originalDate: sourceSunday, targetDate: combinedSunday,
    startTime: '10:00', endTime: '11:00', scope: 'once' }, 't2')
  assert.equal((await schedule.listOccurrences(combinedSunday, combinedSunday))
    .find(row => row.courseId === sameDayCourse.id && row.originalDate === sourceSunday)?.startTime, '10:00')
  const adjustedSameDay = (await schedule.getAdjustments(sameDayCourse.id)).once
    .find(row => row.original_date === sourceSunday)
  await schedule.removeAdjustment(sameDayCourse.id, 'once', adjustedSameDay.id, 't2')
  assert.equal((await schedule.listOccurrences(sourceSunday, sourceSunday))
    .find(row => row.courseId === sameDayCourse.id)?.startTime, '07:30')
  const [[protectedRecord]] = await pool.execute('SELECT voided_at FROM attendance WHERE id = ?', [sameDayRecords[0].id])
  assert.equal(protectedRecord.voided_at, null)

  await trial.cancel(booking.id, 't1')
  assert.equal((await student.updateStatus('p1', 'quit')).status, 'quit')
  await student.updateStatus('p1', 'active')
  assert.equal((await student.update('p1', { enrollmentStage: 'enrolled' })).enrollmentStage, 'enrolled')
  await assert.rejects(() => trial.create({ studentId: 'p1', teacherId: 't1', date: targetDate,
    startTime: '15:00', endTime: '16:00' }, 't1'), error => error.status === 400 && /待报名/.test(error.message))
  await course.remove(one.id)
  const [archived] = await pool.execute('SELECT archived_at FROM courses WHERE id = ?', [one.id])
  assert.ok(archived[0].archived_at)
  await pool.execute("INSERT INTO teachers (id,name,status) VALUES ('same-day-teacher','当天老师','active')")
  await pool.execute("INSERT INTO students (id,name,total_hours,enrollment_stage) VALUES ('same-day-student','当天学生',20,'enrolled')")
  const today = schedule.iso(new Date())
  const todayWeekday = new Date().getDay() || 7
  mock.timers.enable({ apis: ['Date'], now: new Date(`${today}T23:00:00`) })
  try {
    const sameDay = await course.create({ name: '当天课后录入', teacherId: 'same-day-teacher', weekday: todayWeekday,
      startTime: '09:00', endTime: '21:00', hoursPerClass: 1.5, studentIds: ['same-day-student'] })
    assert.equal(sameDay.effectiveStartDate, today)
    assert.equal(sameDay.endTime, '10:30')
    const todayRows = await schedule.listOccurrences(today, today)
    assert.ok(todayRows.some(row => row.courseId === sameDay.id))
    const sameDayRecord = await attendance.create({ courseId: sameDay.id, date: today, studentIds: ['same-day-student'] }, null, { username: 'test-admin' })
    assert.equal(sameDayRecord.hoursDeducted, 1.5)
    const blocker = await course.create({ name: '结束时间冲突验证', teacherId: 'same-day-teacher', weekday: todayWeekday,
      startTime: '12:00', hoursPerClass: 1, studentIds: ['same-day-student'] })
    await assert.rejects(course.update(sameDay.id, { startTime: '11:00', hoursPerClass: 2 }), /冲突/)
    assert.equal((await course.getById(sameDay.id)).hoursPerClass, 1.5)
    assert.equal((await schedule.getAdjustments(sameDay.id)).future.length, 0)
    await course.remove(blocker.id)
    const edited = await course.update(sameDay.id, { startTime: '11:00', endTime: '22:00', hoursPerClass: 2 })
    const nextDate = schedule.addDays(today, 7)
    assert.equal(edited.timeChange.effectiveDate, nextDate)
    assert.equal(edited.upcomingSchedule.startTime, '11:00')
    const earlier = (await schedule.listOccurrences(today, today)).find(row => row.courseId === sameDay.id)
    const next = (await schedule.listOccurrences(nextDate, nextDate)).find(row => row.courseId === sameDay.id)
    assert.deepEqual([earlier.startTime, earlier.endTime, earlier.hoursPerClass], ['09:00', '10:30', 1.5])
    assert.deepEqual([next.startTime, next.endTime, next.hoursPerClass], ['11:00', '13:00', 2])
    mock.timers.setTime(new Date(`${today}T08:00:00`).getTime())
    await course.update(sameDay.id, { startTime: '13:00', hoursPerClass: 0.5 })
    const revised = (await schedule.listOccurrences(nextDate, nextDate)).find(row => row.courseId === sameDay.id)
    assert.deepEqual([revised.startTime, revised.endTime, revised.hoursPerClass], ['13:00', '13:30', 0.5])
    await course.update(sameDay.id, { startTime: '08:00', hoursPerClass: 1 })
    for (const date of [nextDate, schedule.addDays(nextDate, 7)]) {
      const advanced = (await schedule.listOccurrences(date, date)).find(row => row.courseId === sameDay.id)
      assert.deepEqual([advanced.startTime, advanced.endTime, advanced.hoursPerClass], ['08:00', '09:00', 1])
    }
    await course.update(sameDay.id, { startTime: '07:30', hoursPerClass: 1 })
    const advancedAgain = (await schedule.listOccurrences(nextDate, nextDate)).find(row => row.courseId === sameDay.id)
    assert.deepEqual([advancedAgain.startTime, advancedAgain.endTime, advancedAgain.hoursPerClass], ['07:30', '08:30', 1])
    mock.timers.setTime(new Date(`${today}T23:00:00`).getTime())
    const pendingTime = (await schedule.getAdjustments(sameDay.id)).future[0]
    await schedule.removeAdjustment(sameDay.id, 'future', pendingTime.id)
    const restoredTime = (await schedule.listOccurrences(nextDate, nextDate)).find(row => row.courseId === sameDay.id)
    assert.deepEqual([restoredTime.startTime, restoredTime.endTime, restoredTime.hoursPerClass], ['09:00', '10:30', 1.5])
    assert.equal((await course.getById(sameDay.id)).hoursPerClass, 1.5)
    const [[balance]] = await pool.execute('SELECT used_hours FROM students WHERE id = ?', ['same-day-student'])
    assert.equal(Number(balance.used_hours), 1.5)
    await course.remove(sameDay.id)
    const [[retained]] = await pool.execute('SELECT archived_at FROM courses WHERE id = ?', [sameDay.id])
    const [[history]] = await pool.execute('SELECT id FROM attendance WHERE id = ?', [sameDayRecord.id])
    assert.ok(retained.archived_at)
    assert.equal(history.id, sameDayRecord.id)
    console.log('当天建课与点名、自动结束时间、每周时间编辑、冲突回滚和归档历史保留通过')
  } finally { mock.timers.reset() }
  await student.verifyAccess('p1', 't1')
  await assert.rejects(() => student.verifyDeleteAccess('p1', 't2'), /只能修改/)
  await student.remove('p1')
  const [history] = await pool.execute('SELECT id FROM trial_bookings WHERE id = ?', [booking.id])
  assert.equal(history.length, 1)
  process.stdout.write('shared schedule integration passed\n')
} catch (error) {
  if (error.code === 'ER_DBACCESS_DENIED_ERROR') {
    process.stderr.write(`BLOCKED: database user cannot ${suppliedName ? 'access the supplied isolated test database' : 'create an isolated test database'}\n`)
    process.exitCode = 2
  } else {
    throw error
  }
} finally {
  if (pool) await pool.end()
  if (suppliedName && initialized && migration) {
    // The supplied database was verified empty before migration. Remove only
    // tables created by this run; never drop the caller-provided database.
    await migration.query('SET FOREIGN_KEY_CHECKS = 0')
    try {
      const [tables] = await migration.query('SHOW TABLES')
      for (const row of tables) await migration.query(`DROP TABLE ${mysql.escapeId(Object.values(row)[0])}`)
    } finally {
      await migration.query('SET FOREIGN_KEY_CHECKS = 1')
    }
  }
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE IF EXISTS ${name}`)
  await admin.end()
}
