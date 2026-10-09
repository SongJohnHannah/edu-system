import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'
import { verifySubstitutionUI } from './substitution-ui.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('代课测试只允许项目 .qa/mysql 的本机 3307 隔离实例')
}
const name = `edu_system_test_substitution_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  multipleStatements: true, timezone: '+08:00', dateStrings: true }
const admin = await mysql.createConnection(config)
let migration, pool, server, created = false
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
  await migration.execute("INSERT INTO teachers (id,name,status) VALUES ('t1','老师甲','active'),('t2','老师乙','active'),('t3','老师丙','active'),('t4','停用老师','deleted')")
  const password = randomBytes(18).toString('base64url')
  const hash = await bcrypt.hash(password, 10)
  for (const [id, role, teacherId] of [['admin', 'admin', null], ['t1', 'teacher', 't1'], ['t2', 'teacher', 't2'], ['t3', 'teacher', 't3']]) {
    await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name, teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
      [`user-${id}`, `substitute-${id}`, hash, role, id, teacherId])
  }
  await migration.execute(`INSERT INTO students (id,name,created_by,enrollment_stage,total_hours)
    VALUES ('s1','学生甲','admin','enrolled',20),('s2','学生乙','admin','enrolled',20),('p1','试听生','admin','pending',0)`)
  process.env.DB_NAME = name; process.env.PORT = '0'; process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  const schedule = await import('../src/services/scheduleService.js')
  const stats = await import('../src/services/statsService.js')
  const backup = await import('../src/services/backupService.js')
  const teacher = await import('../src/services/teacherService.js')
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function api(method, route, login, body, status) {
    const response = await fetch(`${base}/edusystem/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(login ? { Authorization: `Bearer ${login.accessToken}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${route}: ${data.error || ''}`)
    return data
  }
  const adminLogin = await api('POST', '/auth/login', null, { username: 'substitute-admin', password }, 200)
  const ownerLogin = await api('POST', '/auth/login', null, { username: 'substitute-t1', password }, 200)
  const substituteLogin = await api('POST', '/auth/login', null, { username: 'substitute-t2', password }, 200)
  const otherLogin = await api('POST', '/auth/login', null, { username: 'substitute-t3', password }, 200)
  const date = schedule.addDays(schedule.weekStartOf(schedule.iso(new Date())), 8)
  await pool.execute(`INSERT INTO courses (id,name,teacher_id,weekday,start_time,end_time,hours_per_class,student_ids,effective_start_date)
    VALUES ('c1','代课测试课程','t1',1,'10:00','11:00',1.5,'["s1"]',?),('c2','冲突课程','t2',1,'10:00','11:00',1,'["s2"]',?)`, [date, date])
  const data = { originalDate: date, teacherId: 't2', reason: '原老师临时有事' }
  await api('POST', '/courses/c1/substitution', null, data, 401)
  await api('POST', '/courses/c1/substitution', otherLogin, data, 403)
  await api('POST', '/courses/c1/substitution', substituteLogin, data, 403)
  await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, originalDate: '2026-02-30' }, 400)
  await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, teacherId: 't1' }, 400)
  await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, teacherId: 't4' }, 400)
  await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, reason: '字'.repeat(501) }, 400)
  await pool.execute(`INSERT INTO courses (id,name,teacher_id,weekday,start_time,end_time,hours_per_class,student_ids,created_at)
    VALUES ('past','已开始课程','t1',1,'07:30','08:30',1,'["s1"]','2020-01-01')`)
  const pastDate = schedule.addDays(date, -14)
  const pastResult = await api('POST', '/courses/past/substitution', ownerLogin, { ...data, originalDate: pastDate }, 400)
  assert.match(pastResult.error, /已开始/)
  await pool.execute("DELETE FROM courses WHERE id = 'past'")
  const trial = await api('POST', '/trial-bookings', ownerLogin,
    { studentId: 'p1', teacherId: 't1', courseId: 'c1', occurrenceDate: date, date }, 201)
  const blocked = await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, acknowledgedConflicts: ['anything'] }, 409)
  assert.match(blocked.error, /试听预约/)
  await api('POST', `/trial-bookings/${trial.id}/cancel`, ownerLogin, undefined, 200)
  const warning = await api('POST', '/courses/c1/substitution', ownerLogin, data, 409)
  assert.equal(warning.details[0].type, 'teacher_overlap')
  assert.match(warning.details[0].student, /冲突课程/)
  assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM course_substitutions WHERE status = 'active'"))[0][0].n, 0)
  await pool.execute("UPDATE courses SET end_time = '11:30' WHERE id = 'c2'")
  const newWarning = await api('POST', '/courses/c1/substitution', ownerLogin,
    { ...data, acknowledgedConflicts: warning.details.map(row => row.id) }, 409)
  assert.notEqual(newWarning.details[0].id, warning.details[0].id)
  await pool.execute("UPDATE courses SET end_time = '11:00' WHERE id = 'c2'")
  await verifySubstitutionUI({ base, date, ownerLogin, substituteLogin, api })
  let assigned = await api('POST', '/courses/c1/substitution', adminLogin, { ...data, teacherId: 't3' }, 200)
  assert.equal(assigned.teacherId, 't3')
  await assert.rejects(() => teacher.updateStatus('t3', 'deleted'), /代课/)
  await api('DELETE', `/courses/c1/substitution/${date}`, otherLogin, undefined, 403)
  await api('DELETE', `/courses/c1/substitution/${date}`, adminLogin, undefined, 200)
  const confirmed = { ...data, acknowledgedConflicts: warning.details.map(row => row.id) }
  assigned = await api('POST', '/courses/c1/substitution', ownerLogin, confirmed, 200)
  assert.equal(assigned.originalTeacherId, 't1'); assert.equal(assigned.ownerTeacherId, 't1')
  assert.equal((await pool.execute("SELECT teacher_id FROM courses WHERE id = 'c1'"))[0][0].teacher_id, 't1')
  const nextDate = schedule.addDays(date, 7)
  assert.equal((await schedule.listOccurrences(nextDate, nextDate)).find(row => row.courseId === 'c1').teacherId, 't1')
  const move = { originalDate: date, targetDate: schedule.addDays(date, 1), startTime: '10:00', endTime: '11:00', scope: 'future' }
  const blockedMove = await api('POST', '/courses/c1/reschedule', ownerLogin, move, 409)
  assert.match(blockedMove.error, /临时代课/)
  await api('POST', '/courses/c1/reschedule', ownerLogin, { ...move, scope: 'once' }, 200)
  const moved = (await schedule.listOccurrences(move.targetDate, move.targetDate)).find(row => row.courseId === 'c1')
  assert.equal(moved.teacherId, 't2'); assert.equal(moved.originalDate, date)
  const attendanceData = { courseId: 'c1', originalDate: date, date: move.targetDate, studentIds: ['s1'], hoursDeducted: 1.5 }
  await api('POST', '/attendance', ownerLogin, attendanceData, 403)
  const attendance = await api('POST', '/attendance', substituteLogin, attendanceData, 201)
  assert.equal(attendance.teachingTeacherId, 't2')
  assert.equal(Number((await pool.execute("SELECT used_hours FROM students WHERE id = 's1'"))[0][0].used_hours), 1.5)
  await api('POST', '/courses/c1/substitution', adminLogin, { ...data, teacherId: 't3' }, 409)
  await api('DELETE', `/courses/c1/substitution/${date}`, adminLogin, undefined, 409)
  let totals = await stats.getTeacherStats(date, move.targetDate)
  assert.equal(totals.find(row => row.id === 't2').consumedHours, 1.5)
  assert.equal(totals.find(row => row.id === 't1').consumedHours, 0)
  // A saved attendance teacher remains authoritative even if later schedule data changes.
  await pool.execute("UPDATE course_substitutions SET status = 'cancelled' WHERE course_id = 'c1'")
  totals = await stats.getTeacherStats(date, move.targetDate)
  assert.equal(totals.find(row => row.id === 't2').consumedHours, 1.5)
  await api('DELETE', `/attendance/${attendance.id}`, substituteLogin, undefined, 200)
  assert.equal(Number((await pool.execute("SELECT used_hours FROM students WHERE id = 's1'"))[0][0].used_hours), 0)
  await api('POST', '/courses/c1/substitution', ownerLogin, { ...data, teacherId: 't3' }, 200)
  const adminAttendance = await api('POST', '/attendance', adminLogin, attendanceData, 201)
  assert.equal(adminAttendance.teachingTeacherId, 't3')
  totals = await stats.getTeacherStats(date, move.targetDate)
  assert.equal(totals.find(row => row.id === 't3').consumedHours, 1.5)
  const snapshot = await backup.exportData()
  assert.equal(snapshot.version, '6.0'); assert.ok(snapshot.data.tables.course_substitutions.length)
  const sql = await backup.exportSQL()
  assert.match(sql, /SQL 备份 v6/); assert.match(sql, /INSERT INTO course_substitutions/)
  await backup.importSQL(sql)
  assert.equal((await pool.execute('SELECT teaching_teacher_id FROM attendance WHERE id = ?', [adminAttendance.id]))[0][0].teaching_teacher_id, 't3')
  const [[history]] = await pool.execute("SELECT COUNT(*) AS n FROM course_substitutions WHERE status = 'cancelled'")
  assert.ok(history.n >= 5)
  console.log('临时代课：PC/iPad 横竖屏/手机真实页面、原老师与管理员权限、冲突确认与重新核验、试听保护、单次调课、实际老师点名统计、撤销与备份恢复通过（3307 隔离随机库）')
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
}
