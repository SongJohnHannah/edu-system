import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('测试数据清理仅允许显式指定本机 3307 隔离 MySQL')
}
const databaseName = `edu_system_test_cleanup_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
const admin = await mysql.createConnection(config)
let migration, pool, server, created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  if (Number(identity.port) !== 3307 || !String(identity.datadir).replaceAll('\\', '/').toLowerCase().endsWith('/.qa/mysql/')) {
    throw new Error('数据库实例并非项目 .qa/mysql 隔离目录')
  }
  await admin.query(`CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  created = true
  migration = await mysql.createConnection({ ...config, database: databaseName })
  for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(file => /^0\d{2}_.*\.sql$/.test(file)).sort()) {
    let sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8')
    if (file.startsWith('001_')) sql = sql.replace(/CREATE DATABASE IF NOT EXISTS edu_system[^;]*;/i, '').replace(/USE edu_system;/i, '')
    if (file.startsWith('002_')) continue
    await migration.query(sql)
  }

  const password = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-cleanup-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  await migration.execute("INSERT INTO users (id,username,password_hash,role,teacher_id,display_name) VALUES ('test-u','test-teacher-user','x','teacher','test-t','测试账号')")
  await migration.execute("INSERT INTO teachers (id,name,status,is_test) VALUES ('main-t','正常教师','active',0),('test-t','测试教师','active',1)")
  await migration.execute("INSERT INTO students (id,name,created_by,enrollment_stage,is_test) VALUES ('main-s','正常学生','admin','pending',0),('test-s','测试学生','admin','pending',1)")
  await migration.execute("INSERT INTO courses (id,name,teacher_id,weekday,start_time,end_time,student_ids,is_test) VALUES ('main-c','正常课程','main-t',1,'09:00','10:00','[]',0),('test-c','测试课程','test-t',2,'11:00','12:00','[]',1)")
  await migration.execute("INSERT INTO trial_bookings (id,student_id,teacher_id,course_id,occurrence_date,booking_date,start_time,end_time,student_name_snapshot,teacher_name_snapshot,is_test) VALUES ('main-b','main-s','main-t','main-c','2099-01-05','2099-01-05','09:00','10:00','正常学生','正常教师',0),('test-b','test-s','test-t','test-c','2099-01-06','2099-01-06','11:00','12:00','测试学生','测试教师',0)")
  await migration.execute("INSERT INTO trial_bookings (id,student_id,teacher_id,course_id,occurrence_date,booking_date,start_time,end_time,student_name_snapshot,teacher_name_snapshot,is_test) VALUES ('test-student-b','test-s','main-t','main-c','2099-01-12','2099-01-12','09:00','10:00','测试学生','正常教师',0),('test-teacher-b','main-s','test-t','main-c','2099-01-13','2099-01-13','09:00','10:00','正常学生','测试教师',0),('test-course-b','main-s','main-t','test-c','2099-01-14','2099-01-14','11:00','12:00','正常学生','正常教师',0)")
  await migration.execute("INSERT INTO course_schedule_versions (id,course_id,effective_week_start,weekday,start_time,end_time) VALUES ('test-v','test-c','2099-01-04',2,'11:00','12:00')")
  await migration.execute("INSERT INTO attendance (id,course_id,date,student_ids,hours_deducted,is_test) VALUES ('test-a','test-c','2099-01-06','[]',1,1)")
  await migration.execute("INSERT INTO attendance (id,course_id,date,student_ids,hours_deducted,is_test) VALUES ('test-a-unflagged','test-c','2099-01-07','[]',1,0),('main-a','main-c','2099-01-05','[]',1,0)")
  await migration.execute("INSERT INTO attendance_reversals (id,attendance_id,student_id,hours) VALUES ('test-r','test-a','test-s',1)")
  await migration.execute("INSERT INTO attendance_reversals (id,attendance_id,student_id,hours) VALUES ('test-r-unflagged','test-a-unflagged','main-s',1),('main-r','main-a','main-s',1)")
  await migration.execute("INSERT INTO hour_records (id,student_id,type,hours,related_id,is_test) VALUES ('test-h','test-s','restore',1,'test-a',1)")
  await migration.execute("INSERT INTO hour_records (id,student_id,type,hours,related_id,is_test) VALUES ('test-h-unflagged','main-s','deduct',1,'test-a-unflagged',0),('main-h','main-s','deduct',1,'main-a',0)")
  await migration.execute("INSERT INTO hour_records (id,student_id,type,hours,is_test) VALUES ('test-add','main-s','add',3,1)")
  await migration.execute("UPDATE students SET total_hours = 2, used_hours = 2 WHERE id = 'main-s'")
  await migration.execute("INSERT INTO course_handovers (id,course_id,course_name,old_teacher_id,old_teacher_name,new_teacher_id,new_teacher_name,performed_by,is_test) VALUES ('test-o','test-c','测试课程','test-t','测试教师','main-t','正常教师','isolated-cleanup-admin',0)")
  await migration.execute("INSERT INTO course_handovers (id,course_id,course_name,old_teacher_id,old_teacher_name,new_teacher_id,new_teacher_name,performed_by,is_test) VALUES ('test-o-flagged','main-c','正常课程','main-t','正常教师','main-t','正常教师','isolated-cleanup-admin',1),('main-o','main-c','正常课程','main-t','正常教师','main-t','正常教师','isolated-cleanup-admin',0)")

  process.env.DB_NAME = databaseName
  process.env.PORT = '0'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/edusystem/api`
  const health = await (await fetch(`${base}/health`)).json()
  assert.equal(health.isolatedTestDatabase, true)
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'isolated-cleanup-admin', password }) })
  assert.equal(loginResponse.status, 200)
  const { accessToken } = await loginResponse.json()
  const response = await fetch(`${base}/admin/test-data`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.deleted.trial_bookings, 4)
  assert.equal(result.deleted.attendance, 2)

  for (const [table, id] of [['users', 'test-u'], ['teachers', 'test-t'], ['students', 'test-s'], ['courses', 'test-c'], ['trial_bookings', 'test-b'], ['trial_bookings', 'test-student-b'], ['trial_bookings', 'test-teacher-b'], ['trial_bookings', 'test-course-b'], ['course_schedule_versions', 'test-v'], ['attendance', 'test-a'], ['attendance', 'test-a-unflagged'], ['attendance_reversals', 'test-r'], ['attendance_reversals', 'test-r-unflagged'], ['hour_records', 'test-h'], ['hour_records', 'test-h-unflagged'], ['hour_records', 'test-add'], ['course_handovers', 'test-o'], ['course_handovers', 'test-o-flagged']]) {
    const [[row]] = await pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE id = ?`, [id])
    assert.equal(row.total, 0, `${table} test row remained`)
  }
  for (const [table, id] of [['users', 'admin-1'], ['teachers', 'main-t'], ['students', 'main-s'], ['courses', 'main-c'], ['trial_bookings', 'main-b'], ['attendance', 'main-a'], ['attendance_reversals', 'main-r'], ['hour_records', 'main-h'], ['course_handovers', 'main-o']]) {
    const [[row]] = await pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE id = ?`, [id])
    assert.equal(row.total, 1, `${table} non-test row was removed`)
  }
  const [[mainStudent]] = await pool.execute("SELECT total_hours, used_hours FROM students WHERE id = 'main-s'")
  assert.equal(Number(mainStudent.total_hours), -1, 'cleanup changed the normal student’s pre-existing negative hour balance')
  assert.equal(Number(mainStudent.used_hours), 1, 'normal attendance charge was changed during cleanup')
  process.stdout.write('isolated test-data cleanup removed related trials and history, preserved non-test rows\n')
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${databaseName}`)
  await admin.end()
}
