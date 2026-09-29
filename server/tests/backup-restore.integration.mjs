import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('备份恢复集成测试只允许在显式指定的本机 3307 隔离 MySQL 实例运行')
}

const name = `edu_system_test_backup_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
const admin = await mysql.createConnection(config)
let migration
let pool
let created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  const datadir = String(identity.datadir).replaceAll('\\', '/').toLowerCase()
  if (Number(identity.port) !== 3307 || !datadir.endsWith('/.qa/mysql/')) throw new Error('数据库实例并非项目 .qa/mysql 隔离目录')

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
  const backup = await import('../src/services/backupService.js')
  pool = (await import('../src/config/database.js')).default

  await pool.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('office', '测试教室')")
  await pool.execute("INSERT INTO classes (id, name) VALUES ('class-1', '测试班级')")
  await pool.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '测试老师', 'active')")
  await pool.execute("INSERT INTO users (id, username, password_hash, role, teacher_id, display_name) VALUES ('user-1', 'backup-test', 'test-hash', 'teacher', 'teacher-1', '测试老师')")
  await pool.execute("INSERT INTO students (id, name, created_by, enrollment_stage) VALUES ('student-1', '正式学生', 'admin', 'enrolled'), ('student-2', '试听学生', 'admin', 'pending')")
  await pool.execute("INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, student_ids, effective_start_date) VALUES ('course-1', '阅读课程', 'teacher-1', 1, '09:00', '10:00', '[\"student-1\"]', '2099-01-04')")
  await pool.execute("INSERT INTO course_schedule_versions (id, course_id, effective_week_start, weekday, start_time, end_time) VALUES ('schedule-1', 'course-1', '2099-01-11', 2, '10:00', '11:00')")
  await pool.execute("INSERT INTO course_roster_versions (id, course_id, effective_at, student_ids) VALUES ('roster-1', 'course-1', '2099-01-01 00:00:00', '[\"student-1\"]')")
  await pool.execute("INSERT INTO course_detail_versions (id, course_id, effective_at, name, classroom, hours_per_class) VALUES ('detail-1', 'course-1', '2099-01-01 00:00:00', '阅读课程', 'A1', 1)")
  await pool.execute("INSERT INTO course_occurrence_changes (id, course_id, original_date, target_date, start_time, end_time) VALUES ('change-1', 'course-1', '2099-01-05', '2099-01-06', '09:00', '10:00')")
  await pool.execute("INSERT INTO trial_bookings (id, student_id, teacher_id, booking_date, start_time, end_time, note, teacher_name_snapshot, student_name_snapshot) VALUES ('trial-1', 'student-2', 'teacher-1', '2099-01-06', '11:00', '12:00', '体验;记录', '测试老师', '试听学生')")
  await pool.execute("INSERT INTO attendance (id, course_id, date, student_ids, original_student_ids, hours_deducted, recorded_by, course_name_snapshot, teacher_name_snapshot) VALUES ('attendance-1', 'course-1', '2099-01-06', '[\"student-1\"]', '[\"student-1\"]', 1, 'teacher-1', '阅读课程', '测试老师')")
  await pool.execute("INSERT INTO attendance_reversals (id, attendance_id, student_id, hours) VALUES ('reversal-1', 'attendance-1', 'student-1', 1)")
  await pool.execute("INSERT INTO hour_records (id, student_id, type, hours, related_id, operator) VALUES ('hour-1', 'student-1', 'restore', 1, 'attendance-1', 'backup-test')")
  await pool.execute("INSERT INTO course_handovers (id, course_id, course_name, old_teacher_id, old_teacher_name, new_teacher_id, new_teacher_name, performed_by) VALUES ('handover-1', 'course-1', '阅读课程', 'teacher-1', '测试老师', 'teacher-1', '测试老师', 'backup-test')")

  const snapshot = await backup.exportData()
  assert.equal(snapshot.version, '5.0')
  for (const table of backup.backupTables) assert.ok(snapshot.data.tables[table].length > 0, `${table} should be backed up`)
  const sql = await backup.exportSQL()

  const mutate = async () => {
    await pool.execute("UPDATE students SET name = '已改动' WHERE id = 'student-1'")
    await pool.execute("DELETE FROM trial_bookings WHERE id = 'trial-1'")
    await pool.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('extra', '应被清除')")
  }
  const assertRestored = async () => {
    const [[student]] = await pool.execute("SELECT name FROM students WHERE id = 'student-1'")
    const [[trial]] = await pool.execute("SELECT note FROM trial_bookings WHERE id = 'trial-1'")
    const [extra] = await pool.execute("SELECT setting_key FROM settings WHERE setting_key = 'extra'")
    assert.equal(student.name, '正式学生')
    assert.equal(trial.note, '体验;记录')
    assert.equal(extra.length, 0)
    for (const table of backup.backupTables) {
      const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`)
      assert.equal(count.total, snapshot.data.tables[table].length, `${table} row count changed`)
    }
    const restored = await backup.exportData()
    for (const table of backup.backupTables) {
      assert.deepEqual(restored.data.tables[table], snapshot.data.tables[table], `${table} fields changed during restore`)
    }
  }

  await mutate()
  assert.equal((await backup.importSQL(sql)).success, true)
  await assertRestored()
  await mutate()
  assert.equal((await backup.importData(snapshot)).success, true)
  await assertRestored()

  await assert.rejects(backup.importSQL("DELETE FROM students; INSERT INTO students (`missing_column`) VALUES ('bad');"))
  await assertRestored()
  await assert.rejects(backup.importData({ version: '5.0', data: { tables: { students: [] } } }), /新版备份文件不完整/)
  await assert.rejects(backup.importSQL('-- 嘉言思听教务系统 SQL 备份 v5\nDELETE FROM students;'), /新版 SQL 备份文件不完整/)
  await assertRestored()
  process.stdout.write('isolated backup restore passed: SQL, JSON, rollback, all tables\n')
} finally {
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
}
