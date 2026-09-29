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
  throw new Error('备份浏览器测试只允许显式指定本机 3307 隔离 MySQL 实例')
}

const databaseName = `edu_system_test_backup_ui_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
const admin = await mysql.createConnection(config)
let migration, pool, server, browser, created = false

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
    ['admin-1', 'isolated-backup-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  await migration.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '林老师', 'active')")
  const teacherPassword = randomBytes(18).toString('hex')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, teacher_id, display_name) VALUES (?, ?, ?, ?, ?, ?)',
    ['teacher-user-1', 'isolated-backup-teacher', await bcrypt.hash(teacherPassword, 10), 'teacher', 'teacher-1', '林老师'])
  await migration.execute("INSERT INTO students (id, name, created_by, enrollment_stage) VALUES ('student-1', '备份前学生', 'admin', 'enrolled')")

  process.env.DB_NAME = databaseName
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
    body: JSON.stringify({ username: 'isolated-backup-admin', password })
  })
  assert.equal(loginResponse.status, 200)
  const login = await loginResponse.json()

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  await context.addInitScript(data => {
    localStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
  }, login)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`${base}/profile`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '个人账户' }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '账户' }).click()
  await page.locator('.account-dropdown').getByRole('button', { name: '数据备份与恢复' }).click()
  await page.getByRole('heading', { name: '数据备份与恢复' }).waitFor({ state: 'visible' })

  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  const download = await downloadEvent
  assert.match(download.suggestedFilename(), /\.sql$/)
  const sql = await fs.readFile(await download.path(), 'utf8')
  assert.match(sql, /INSERT INTO `?students`?/i)
  assert.match(sql, /备份前学生/)

  const teacherLoginResponse = await fetch(`${base}/edusystem/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'isolated-backup-teacher', password: teacherPassword })
  })
  assert.equal(teacherLoginResponse.status, 200)
  const teacherLogin = await teacherLoginResponse.json()
  const teacherHeaders = { Authorization: `Bearer ${teacherLogin.accessToken}` }
  assert.equal((await fetch(`${base}/edusystem/api/backup/export`, { headers: teacherHeaders })).status, 403)
  assert.equal((await fetch(`${base}/edusystem/api/backup/import-sql`, {
    method: 'POST', headers: { ...teacherHeaders, 'Content-Type': 'text/plain' }, body: sql
  })).status, 403)

  await pool.execute("UPDATE students SET name = '备份后改动' WHERE id = 'student-1'")
  const input = page.locator('input[accept=".sql,.json"]')
  const backupFile = { name: 'isolated-backup.sql', mimeType: 'text/plain', buffer: Buffer.from(sql) }
  await input.setInputFiles(backupFile)
  await page.getByRole('heading', { name: '确认恢复备份' }).waitFor({ state: 'visible' })
  assert.equal((await pool.execute("SELECT name FROM students WHERE id = 'student-1'"))[0][0].name, '备份后改动')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await pool.execute("SELECT name FROM students WHERE id = 'student-1'"))[0][0].name, '备份后改动')
  await input.setInputFiles(backupFile)
  const importResponse = page.waitForResponse(response => response.url().endsWith('/backup/import-sql'))
  await page.getByRole('button', { name: '确认恢复' }).click()
  const response = await importResponse
  assert.equal(response.status(), 200)
  assert.equal((await response.json()).success, true)
  assert.equal((await pool.execute("SELECT name FROM students WHERE id = 'student-1'"))[0][0].name, '备份前学生')
  const backupService = await import('../src/services/backupService.js')
  const jsonBackup = await backupService.exportData()
  const adminHeaders = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' }
  await pool.execute("UPDATE students SET name = 'JSON 恢复前改动' WHERE id = 'student-1'")
  const jsonResponse = await fetch(`${base}/edusystem/api/backup/import`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify(jsonBackup)
  })
  assert.equal(jsonResponse.status, 200)
  assert.equal((await pool.execute("SELECT name FROM students WHERE id = 'student-1'"))[0][0].name, '备份前学生')
  const incompleteResponse = await fetch(`${base}/edusystem/api/backup/import`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ version: '5.0', data: { tables: { students: [] } } })
  })
  assert.equal(incompleteResponse.status, 400)
  assert.equal((await pool.execute("SELECT name FROM students WHERE id = 'student-1'"))[0][0].name, '备份前学生')
  assert.deepEqual(pageErrors, [])
  await context.close()
  process.stdout.write('isolated backup browser API passed: SQL download/restore, JSON restore, incomplete backup rejection\n')
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${databaseName}`)
  await admin.end()
}
