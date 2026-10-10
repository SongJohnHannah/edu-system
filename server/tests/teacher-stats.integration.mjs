import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('教师工作量测试只允许项目 .qa/mysql 的本机 3307 隔离实例')
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = `edu_system_test_teacher_stats_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00', dateStrings: true }
const admin = await mysql.createConnection(config)
let migration, pool, created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  assert.equal(Number(identity.port), 3307)
  assert.ok(String(identity.datadir).replaceAll('\\', '/').toLowerCase().endsWith('/.qa/mysql/'))
  await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  created = true
  migration = await mysql.createConnection({ ...config, database: name })
  for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(file => /^0\d{2}_.*\.sql$/.test(file)).sort()) {
    let sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8')
    if (file.startsWith('001_')) sql = sql.replace(/CREATE DATABASE IF NOT EXISTS edu_system[^;]*;/i, '').replace(/USE edu_system;/i, '')
    if (file.startsWith('002_')) continue
    await migration.query(sql)
  }
  process.env.DB_NAME = name
  pool = (await import('../src/config/database.js')).default
  const schedule = await import('../src/services/scheduleService.js')
  const substitution = await import('../src/services/substitutionService.js')
  const attendance = await import('../src/services/attendanceService.js')
  const stats = await import('../src/services/statsService.js')
  await pool.execute("INSERT INTO teachers (id,name,status) VALUES ('owner','原老师','active'),('substitute','代课老师','active'),('other','其他老师','active')")
  const students = Array.from({ length: 10 }, (_, i) => `student-${i}`)
  for (const id of students) await pool.execute('INSERT INTO students (id,name,total_hours,enrollment_stage) VALUES (?,?,20,?)', [id, id, 'enrolled'])
  const date = schedule.addDays(schedule.weekStartOf(schedule.iso(new Date())), 8)
  await pool.execute(`INSERT INTO courses (id,name,teacher_id,weekday,start_time,end_time,hours_per_class,student_ids,effective_start_date)
    VALUES ('class','十人两课时班','owner',1,'10:00','12:00',2,?,?)`, [JSON.stringify(students), date])
  await substitution.arrange('class', { originalDate: date, teacherId: 'substitute' }, 'owner', { username: 'owner' })
  const input = { courseId: 'class', originalDate: date, date, studentIds: students, hoursDeducted: 2 }
  await assert.rejects(() => attendance.create(input, 'owner', { username: 'owner' }), error => error.status === 403)
  const recorded = await attendance.create(input, 'substitute', { username: 'substitute' })
  assert.equal(recorded.teachingTeacherId, 'substitute')
  assert.equal(recorded.hoursDeducted, 2)
  await assert.rejects(() => attendance.create(input, 'substitute', { username: 'substitute' }), error => error.status === 409)

  async function expectWorkload(teacherId, hours, count) {
    const rows = await stats.getTeacherStats(date, date, teacherId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].consumedHours, hours)
    assert.equal(rows[0].attendanceCount, count)
    const overall = await stats.getOverallStats(date, date, teacherId)
    assert.equal(overall.totalConsumedHours, hours)
    assert.equal(overall.totalAttendance, count)
  }
  await expectWorkload('substitute', 2, 1)
  await expectWorkload('owner', 0, 0)
  assert.equal((await stats.getOverallStats(date, date)).totalConsumedHours, 2)
  assert.equal((await stats.getWeekdayDistribution('substitute', date, date))[0], 1)
  assert.equal((await stats.getWeekdayDistribution('owner', date, date))[0], 0)
  let [[studentTotal]] = await pool.execute('SELECT SUM(used_hours) AS hours FROM students')
  assert.equal(Number(studentTotal.hours), 20)
  console.log('PASS: 10 人 × 2 学生课时 = 20；教师一次点名计 2，归实际代课老师，原老师计 0；重复点名被拒绝')

  await attendance.removeStudents(recorded.id, students.slice(0, 9), 'substitute', { username: 'substitute' })
  await expectWorkload('substitute', 2, 1)
  ;[[studentTotal]] = await pool.execute('SELECT SUM(used_hours) AS hours FROM students')
  assert.equal(Number(studentTotal.hours), 2)
  await attendance.remove(recorded.id, 'substitute', { username: 'substitute' })
  await expectWorkload('substitute', 0, 0)
  ;[[studentTotal]] = await pool.execute('SELECT SUM(used_hours) AS hours FROM students')
  assert.equal(Number(studentTotal.hours), 0)
  console.log('PASS: 部分学生撤销仍计教师 2；整次撤销计 0，学生余额分别按实际人数恢复')

  await substitution.arrange('class', { originalDate: date, teacherId: 'other' }, 'owner', { username: 'owner' })
  const movedDate = schedule.addDays(date, 1)
  await schedule.reschedule('class', { originalDate: date, targetDate: movedDate,
    startTime: '10:00', endTime: '12:00', scope: 'once' }, 'owner')
  const adminRecorded = await attendance.create({ ...input, date: movedDate }, null, { username: 'admin' })
  assert.equal(adminRecorded.teachingTeacherId, 'other')
  assert.equal(adminRecorded.recordedBy, null)
  assert.equal((await stats.getOverallStats(date, date)).totalAttendance, 0)
  let moved = await stats.getTeacherStats(movedDate, movedDate, 'other')
  assert.equal(moved[0].consumedHours, 2)
  assert.equal(moved[0].attendanceCount, 1)
  const overall = await stats.getOverallStats(date, movedDate)
  assert.equal(overall.totalAttendance, 1)
  assert.equal(overall.totalConsumedHours, 2)
  assert.equal(overall.activeTeachers, 1)
  const details = await stats.getTeacherStats(date, movedDate)
  assert.equal(details.reduce((total, row) => total + row.consumedHours, 0), overall.totalConsumedHours)
  console.log('PASS: 跨日调课按实际点名日统计，管理员代点名归实际代课老师，汇总与明细一致')

  // Saved attendance remains authoritative after later roster, hours, or owner changes.
  await pool.execute("UPDATE courses SET teacher_id = 'owner', hours_per_class = 4, student_ids = '[]', archived_at = ? WHERE id = 'class'",
    [`${schedule.addDays(movedDate, 1)} 00:00:00`])
  await pool.execute("UPDATE course_substitutions SET status = 'cancelled' WHERE course_id = 'class'")
  await pool.execute("UPDATE teachers SET status = 'deleted' WHERE id = 'other'")
  moved = await stats.getTeacherStats(movedDate, movedDate, 'other')
  assert.equal(moved.length, 1)
  assert.equal(moved[0].status, 'deleted')
  assert.equal(moved[0].consumedHours, 2)
  assert.equal(moved[0].attendanceCount, 1)
  assert.equal(moved[0].courseCount, 0)
  assert.equal((await stats.getTeacherStats(movedDate, movedDate, 'owner'))[0].consumedHours, 0)
  console.log('PASS: 后续改课时、名单、归属、取消代课和停用老师均不会改写已保存点名的教师课时')
} finally {
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
  console.log('随机临时库已清理；现有 edu_system 未写入')
}
