import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('点名浏览器集成测试只允许显式指定本机 3307 隔离 MySQL 实例')
}

const name = `edu_system_test_attendance_${process.pid}_${Date.now()}`
const config = {
  host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00'
}
const admin = await mysql.createConnection(config)
let migration, pool, server, browser, created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  if (Number(identity.port) !== 3307 || !String(identity.datadir).replaceAll('\\', '/').toLowerCase().endsWith('/.qa/mysql/')) {
    throw new Error('数据库实例并非项目 .qa/mysql 隔离目录')
  }
  await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  created = true
  migration = await mysql.createConnection({ ...config, database: name })
  for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(file => /^0\d{2}_.*\.sql$/.test(file)).sort()) {
    let sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8')
    if (file.startsWith('001_')) sql = sql.replace(/CREATE DATABASE IF NOT EXISTS edu_system[^;]*;/i, '').replace(/USE edu_system;/i, '')
    if (file.startsWith('002_')) continue
    await migration.query(sql)
  }

  const password = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-attendance-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay() || 7
  await migration.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '林老师', 'active')")
  await migration.execute(`INSERT INTO students (id, name, total_hours, used_hours, status, created_by, enrollment_stage)
    VALUES ('student-1', '学生甲', 2, 1, 'active', 'admin', 'enrolled'), ('student-2', '学生乙', 10, 0, 'active', 'admin', 'enrolled')`)
  await migration.execute(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, hours_per_class, student_ids)
    VALUES ('course-1', '阅读课', 'teacher-1', ?, '09:00', '10:00', 1.5, '["student-1","student-2"]')`, [weekday])

  process.env.DB_NAME = name
  process.env.PORT = '0'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const health = await (await fetch(`${base}/edusystem/api/health`)).json()
  assert.equal(health.isolatedTestDatabase, true)
  assert.equal(health.database, 'ok')
  const loginResponse = await fetch(`${base}/edusystem/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'isolated-attendance-admin', password })
  })
  assert.equal(loginResponse.status, 200)
  const login = await loginResponse.json()

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' })
  await context.addInitScript(data => {
    localStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
  }, login)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/attendance`, { waitUntil: 'domcontentloaded' })
  await page.locator('.select-course .search-select').waitFor({ state: 'visible' })
  await page.locator('.select-course .search-select').click()
  await page.locator('.n-base-select-option').filter({ hasText: '阅读课' }).click()
  const form = page.locator('.attendance-form')
  await form.getByText('学生甲').waitFor({ state: 'visible' })
  await form.getByRole('button', { name: /确认点名/ }).click()
  const confirm = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '确认点名' }) })
  await confirm.getByText('以下学生课时不足').waitFor({ state: 'visible' })
  await confirm.getByRole('button', { name: '确认点名' }).click()
  await page.locator('.history-item').getByText('出勤: 学生甲、学生乙').waitFor({ state: 'visible' })
  const [recordRows] = await pool.execute('SELECT id, student_ids FROM attendance WHERE course_id = ?', ['course-1'])
  assert.equal(recordRows.length, 1)
  const id = recordRows[0].id
  const ids = value => typeof value === 'string' ? JSON.parse(value) : value
  assert.deepEqual(ids(recordRows[0].student_ids), ['student-1', 'student-2'])
  const balances = async () => (await pool.execute('SELECT id, used_hours FROM students ORDER BY id'))[0].map(row => Number(row.used_hours))
  assert.deepEqual(await balances(), [2.5, 1.5])
  const staleSelection = await fetch(`${base}/edusystem/api/attendance/${id}/remove-students`, {
    method: 'POST', headers: { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentIds: ['student-1', 'missing-student'] })
  })
  assert.equal(staleSelection.status, 409)
  assert.match((await staleSelection.json()).error, /刷新后重试/)
  assert.deepEqual(await balances(), [2.5, 1.5])
  assert.deepEqual(ids((await pool.execute('SELECT student_ids FROM attendance WHERE id = ?', [id]))[0][0].student_ids), ['student-1', 'student-2'])
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM attendance_reversals WHERE attendance_id = ?', [id]))[0][0].total, 0)

  await page.locator('.history-item').getByRole('button', { name: '撤销' }).click()
  const reverse = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '撤销点名记录' }) })
  await reverse.locator('.delete-student-item').filter({ hasText: '学生甲' }).locator('input').check()
  await reverse.getByRole('button', { name: /确认撤销/ }).click()
  await page.locator('.history-item').getByText('出勤: 学生乙').waitFor({ state: 'visible' })
  assert.deepEqual(await balances(), [1, 1.5])
  const [[partial]] = await pool.execute('SELECT student_ids, voided_at FROM attendance WHERE id = ?', [id])
  assert.deepEqual(ids(partial.student_ids), ['student-2'])
  assert.equal(partial.voided_at, null)

  await page.locator('.history-item').getByRole('button', { name: '撤销' }).click()
  await reverse.locator('.delete-student-item').filter({ hasText: '学生乙' }).locator('input').check()
  await reverse.getByRole('button', { name: /确认撤销/ }).click()
  await page.getByText('暂无点名记录').waitFor({ state: 'visible' })
  assert.deepEqual(await balances(), [1, 0])
  const [[voided]] = await pool.execute('SELECT voided_at FROM attendance WHERE id = ?', [id])
  assert.ok(voided.voided_at)
  const [reversals] = await pool.execute('SELECT student_id FROM attendance_reversals WHERE attendance_id = ? ORDER BY student_id', [id])
  assert.deepEqual(reversals.map(row => row.student_id), ['student-1', 'student-2'])
  await page.getByRole('button', { name: '查看已撤销' }).click()
  await page.locator('.history-item').getByText('原出勤: 学生甲、学生乙').waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  process.stdout.write('isolated attendance browser API passed: create, partial reversal, full reversal, balances, history\n')
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
}
