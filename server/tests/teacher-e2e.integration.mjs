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
  throw new Error('教师浏览器测试只允许显式指定本机 3307 隔离 MySQL 实例')
}
const databaseName = `edu_system_test_teacher_ui_${process.pid}_${Date.now()}`
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
  const adminPassword = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-teacher-admin', await bcrypt.hash(adminPassword, 10), 'admin', '测试管理员'])
  process.env.DB_NAME = databaseName
  process.env.PORT = '0'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await (await fetch(`${base}/edusystem/api/health`)).json()).isolatedTestDatabase, true)
  const loginAs = async (username, password) => fetch(`${base}/edusystem/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const adminResponse = await loginAs('isolated-teacher-admin', adminPassword)
  assert.equal(adminResponse.status, 200)
  const adminLogin = await adminResponse.json()
  const adminHeaders = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' }
  const blankCreate = await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: '   ', phone: '13800000020' })
  })
  assert.equal(blankCreate.status, 400)
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM teachers'))[0][0].total, 0)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(data => {
    localStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
  }, adminLogin)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/teachers`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '添加教师' }).first().click()
  const create = page.locator('.modal').filter({ hasText: '添加教师' })
  await create.getByPlaceholder('请输入教师姓名').fill('隔离测试教师')
  await create.getByPlaceholder('请输入联系电话').fill(' 13800000021 ')
  await create.getByPlaceholder('如：数学、英语').fill('阅读')
  await create.getByRole('button', { name: '保存' }).click()
  const success = page.locator('.modal').filter({ hasText: '教师创建成功' })
  await success.waitFor({ state: 'visible' })
  const username = (await success.locator('.success-row').first().locator('.success-value').textContent()).trim()
  const initialPassword = (await success.locator('.success-row').nth(1).locator('.success-value').textContent()).trim()
  assert.ok(username && initialPassword)
  const [[teacher]] = await pool.execute('SELECT id, name, phone, subject, status FROM teachers WHERE name = ?', ['隔离测试教师'])
  assert.ok(teacher?.id)
  const [[teacherUser]] = await pool.execute('SELECT id, username, teacher_id, is_active FROM users WHERE teacher_id = ?', [teacher.id])
  assert.equal(teacherUser.username, username)
  assert.equal(username, '13800000021')
  assert.equal(teacher.phone, '13800000021')
  assert.equal(teacherUser.teacher_id, teacher.id)
  assert.equal(teacherUser.is_active, 1)
  const blankUpdate = await fetch(`${base}/edusystem/api/teachers/${teacher.id}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ name: '   ' })
  })
  assert.equal(blankUpdate.status, 400)
  assert.equal((await pool.execute('SELECT name FROM teachers WHERE id = ?', [teacher.id]))[0][0].name, '隔离测试教师')
  assert.equal((await pool.execute('SELECT display_name FROM users WHERE id = ?', [teacherUser.id]))[0][0].display_name, '隔离测试教师')
  const teacherResponse = await loginAs(username, initialPassword)
  assert.equal(teacherResponse.status, 200)
  const teacherLogin = await teacherResponse.json()
  assert.equal(teacherLogin.user.teacherId, teacher.id)
  assert.equal((await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: { Authorization: `Bearer ${teacherLogin.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '越权创建' })
  })).status, 403)
  await success.getByRole('button', { name: '知道了' }).click()

  const card = page.locator('.teacher-card').filter({ hasText: '隔离测试教师' })
  const search = page.getByPlaceholder('搜索教师姓名...')
  await search.fill('不存在的教师')
  await card.waitFor({ state: 'hidden' })
  await search.fill('隔离测试教师')
  await card.waitFor({ state: 'visible' })
  await search.fill('')
  const duplicate = await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '隔离测试教师', phone: '13800000023' })
  })
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).error, '教师姓名已存在')
  const duplicatePhone = await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: '其他教师', phone: ' 13800000021 ' })
  })
  assert.equal(duplicatePhone.status, 409)
  assert.equal((await duplicatePhone.json()).error, '该手机号已被其他教师使用')
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM teachers WHERE name = ?', ['隔离测试教师']))[0][0].total, 1)
  const secondTeacher = await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: '校验教师', phone: '13800000023' })
  })
  assert.equal(secondTeacher.status, 201)
  const secondId = (await secondTeacher.json()).id
  await pool.execute('UPDATE teachers SET phone = ? WHERE id = ?', [' 13800000023 ', secondId])
  const legacyPhoneDuplicate = await fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: '旧资料号码校验', phone: '13800000023' })
  })
  assert.equal(legacyPhoneDuplicate.status, 409)
  for (const body of [{ name: ' 隔离测试教师 ' }, { phone: ' 13800000021 ' }]) {
    const response = await fetch(`${base}/edusystem/api/teachers/${secondId}`, {
      method: 'PUT', headers: adminHeaders, body: JSON.stringify(body)
    })
    assert.equal(response.status, 409)
  }
  const concurrentCreates = await Promise.all([31, 32].map(number => fetch(`${base}/edusystem/api/teachers`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: '并发教师', phone: `138000000${number}` })
  })))
  assert.deepEqual(concurrentCreates.map(response => response.status).sort(), [201, 409])
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM teachers WHERE name = ?', ['并发教师']))[0][0].total, 1)
  const concurrentTeacher = await concurrentCreates.find(response => response.status === 201).json()
  const concurrentUpdates = await Promise.all([
    fetch(`${base}/edusystem/api/teachers/${secondId}`, {
      method: 'PUT', headers: adminHeaders, body: JSON.stringify({ name: '并发改名' })
    }),
    fetch(`${base}/edusystem/api/auth/users/${concurrentTeacher.userId}`, {
      method: 'PUT', headers: adminHeaders, body: JSON.stringify({ displayName: '并发改名' })
    })
  ])
  assert.deepEqual(concurrentUpdates.map(response => response.status).sort(), [200, 409])
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM teachers WHERE name = ?', ['并发改名']))[0][0].total, 1)
  await card.getByRole('button', { name: '编辑' }).click()
  const edit = page.locator('.modal').filter({ hasText: '编辑教师' })
  await edit.getByPlaceholder('如：数学、英语').fill('书法')
  await edit.getByRole('button', { name: '保存' }).click()
  await card.getByText('书法').waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT subject FROM teachers WHERE id = ?', [teacher.id]))[0][0].subject, '书法')
  const paddedUpdate = await fetch(`${base}/edusystem/api/teachers/${teacher.id}`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ phone: ' 13800000024 ' })
  })
  assert.equal(paddedUpdate.status, 200)
  assert.equal((await pool.execute('SELECT phone FROM teachers WHERE id = ?', [teacher.id]))[0][0].phone, '13800000024')
  assert.equal((await pool.execute('SELECT username FROM users WHERE id = ?', [teacherUser.id]))[0][0].username, '13800000024')

  await card.getByRole('button', { name: '账户' }).click()
  const accountModal = page.locator('.modal').filter({ hasText: '教师账户管理' })
  await accountModal.locator('input[type="text"]').first().fill('隔离测试教师新名')
  await accountModal.locator('input[type="tel"]').fill(' 13800000022 ')
  const resetPassword = randomBytes(12).toString('base64url')
  await accountModal.locator('input[type="password"]').fill(resetPassword)
  await accountModal.getByRole('button', { name: '保存' }).click()
  await accountModal.waitFor({ state: 'hidden' })
  await page.locator('.teacher-card').filter({ hasText: '隔离测试教师新名' }).waitFor({ state: 'visible' })
  const [[updatedUser]] = await pool.execute('SELECT username, display_name FROM users WHERE id = ?', [teacherUser.id])
  const [[updatedTeacher]] = await pool.execute('SELECT name, phone FROM teachers WHERE id = ?', [teacher.id])
  assert.equal(updatedUser.username, '13800000022')
  assert.equal(updatedUser.display_name, '隔离测试教师新名')
  assert.equal(updatedTeacher.name, '隔离测试教师新名')
  assert.equal(updatedTeacher.phone, '13800000022')
  assert.equal((await loginAs(username, initialPassword)).status, 401)
  const resetLoginResponse = await loginAs('13800000022', resetPassword)
  assert.equal(resetLoginResponse.status, 200)
  const resetLogin = await resetLoginResponse.json()
  assert.equal((await fetch(`${base}/edusystem/api/auth/profile`, {
    headers: { Authorization: `Bearer ${teacherLogin.accessToken}` }
  })).status, 401)

  await pool.execute("INSERT INTO students (id, name, status, created_by, enrollment_stage) VALUES ('student-1', '测试学生', 'active', 'admin', 'enrolled')")
  await pool.execute("INSERT INTO students (id, name, status, created_by, enrollment_stage) VALUES ('trial-student-1', '试听学生', 'active', 'admin', 'pending')")
  await pool.execute("INSERT INTO teachers (id, name, status) VALUES ('recipient-1', '接任教师', 'active')")
  await pool.execute('INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, student_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['course-1', '待交接课程', teacher.id, 1, '09:00', '10:00', '["student-1"]'])
  const rejectedHandover = async (courseId, newTeacherId, expectedStatus, expectedMessage) => {
    const response = await fetch(`${base}/edusystem/api/handovers`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ courseId, newTeacherId, reason: '隔离校验' })
    })
    assert.equal(response.status, expectedStatus)
    assert.equal((await response.json()).error, expectedMessage)
    assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM course_handovers'))[0][0].total, 0)
  }
  await rejectedHandover('missing-course', 'recipient-1', 404, '课程不存在')
  await rejectedHandover('course-1', 'missing-teacher', 404, '目标教师不存在或已停用')
  await rejectedHandover('course-1', teacher.id, 409, '新教师与当前教师相同，无需交接')
  await pool.execute('UPDATE courses SET archived_at = CURRENT_TIMESTAMP WHERE id = ?', ['course-1'])
  await rejectedHandover('course-1', 'recipient-1', 409, '归档课程不能交接')
  await pool.execute('UPDATE courses SET archived_at = NULL WHERE id = ?', ['course-1'])
  await page.reload({ waitUntil: 'domcontentloaded' })
  const renamedCard = page.locator('.teacher-card').filter({ hasText: '隔离测试教师新名' })
  await renamedCard.getByText('1 门课程').waitFor({ state: 'visible' })
  await renamedCard.getByRole('button', { name: '停用' }).click()
  const stop = page.locator('.modal').filter({ hasText: '停用教师' })
  await stop.getByRole('button', { name: '确认停用' }).click()
  await page.getByText('该教师仍有课程，请先交接或归档课程').waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT status FROM teachers WHERE id = ?', [teacher.id]))[0][0].status, 'active')
  await stop.getByRole('button', { name: '取消' }).click()
  const schedule = await import('../src/services/scheduleService.js')
  const currentWeek = schedule.weekStartOf(schedule.iso(new Date()))
  const pastWeekStart = schedule.addDays(currentWeek, -7)
  const pastDate = schedule.addDays(pastWeekStart, 1)
  const bookingDate = schedule.addDays(currentWeek, 8)
  await pool.execute('UPDATE courses SET created_at = ? WHERE id = ?', [`${pastWeekStart} 08:00:00`, 'course-1'])
  const occurrenceAt = async date => {
    const response = await fetch(`${base}/edusystem/api/courses/occurrences?start=${date}&end=${date}`, {
      headers: { Authorization: `Bearer ${adminLogin.accessToken}` }
    })
    assert.equal(response.status, 200)
    return (await response.json()).find(item => item.courseId === 'course-1')
  }
  assert.equal((await occurrenceAt(pastDate))?.teacherId, teacher.id)
  assert.equal((await occurrenceAt(bookingDate))?.teacherId, teacher.id)
  const bookingResponse = await fetch(`${base}/edusystem/api/trial-bookings`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: 'trial-student-1', teacherId: teacher.id, courseId: 'course-1', occurrenceDate: bookingDate, date: bookingDate })
  })
  assert.equal(bookingResponse.status, 201)
  const booking = await bookingResponse.json()
  await renamedCard.getByRole('button', { name: '交接课程' }).click()
  const handover = page.locator('.modal').filter({ hasText: '课程交接' })
  await handover.getByText('待交接课程').waitFor({ state: 'visible' })
  await handover.locator('.search-select').click()
  await page.getByText('接任教师', { exact: true }).last().click()
  await handover.getByPlaceholder('如：教师离职、课程调整等').fill('工作安排')
  await handover.getByRole('button', { name: '确认交接' }).click()
  const blocker = page.locator('.toast-message')
  await blocker.getByText('请先取消或重新安排以下试听预约', { exact: false }).waitFor({ state: 'visible' })
  assert.ok((await blocker.textContent()).includes(`${bookingDate} 09:00 · 试听学生`))
  assert.equal(await blocker.evaluate(element => getComputedStyle(element).whiteSpace), 'pre-line')
  assert.equal((await pool.execute('SELECT teacher_id FROM courses WHERE id = ?', ['course-1']))[0][0].teacher_id, teacher.id)
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM course_handovers WHERE course_id = ?', ['course-1']))[0][0].total, 0)
  assert.equal((await pool.execute('SELECT status FROM trial_bookings WHERE id = ?', [booking.id]))[0][0].status, 'active')
  const cancelResponse = await fetch(`${base}/edusystem/api/trial-bookings/${booking.id}/cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminLogin.accessToken}` }
  })
  assert.equal(cancelResponse.status, 200)
  assert.equal((await pool.execute('SELECT status FROM trial_bookings WHERE id = ?', [booking.id]))[0][0].status, 'cancelled')
  await handover.getByRole('button', { name: '确认交接' }).click()
  await page.getByText('已成功交接 1 门课程').waitFor({ state: 'visible' })
  await renamedCard.getByText('0 门课程').waitFor({ state: 'visible' })
  const [[transferred]] = await pool.execute('SELECT teacher_id, archived_at FROM courses WHERE id = ?', ['course-1'])
  assert.equal(transferred.teacher_id, 'recipient-1')
  assert.equal(transferred.archived_at, null)
  const [[handoverRecord]] = await pool.execute('SELECT old_teacher_id, new_teacher_id, reason FROM course_handovers WHERE course_id = ?', ['course-1'])
  assert.deepEqual([handoverRecord.old_teacher_id, handoverRecord.new_teacher_id, handoverRecord.reason], [teacher.id, 'recipient-1', '工作安排'])
  assert.equal((await occurrenceAt(pastDate))?.teacherId, teacher.id)
  assert.equal((await occurrenceAt(bookingDate))?.teacherId, 'recipient-1')
  await pool.execute("UPDATE teachers SET name = '接任教师新名' WHERE id = 'recipient-1'")
  await page.goto(`${base}/courses`, { waitUntil: 'domcontentloaded' })
  await page.locator('.course-card').filter({ hasText: '待交接课程' }).getByText('接任教师新名').waitFor({ state: 'visible' })
  await page.goto(`${base}/weekly-schedule`, { waitUntil: 'domcontentloaded' })
  await page.locator(`.combined-grid .day-lane[data-date="${bookingDate}"] .course-bar`).filter({ hasText: '待交接课程' }).getByText('接任教师新名').waitFor({ state: 'visible' })
  await page.goto(`${base}/teachers`, { waitUntil: 'domcontentloaded' })
  const stoppedCard = page.locator('.teacher-card').filter({ hasText: '隔离测试教师新名' })
  await stoppedCard.getByRole('button', { name: '停用' }).click()
  await stop.getByRole('button', { name: '确认停用' }).click()
  await stoppedCard.getByText('已停用').waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT is_active FROM users WHERE id = ?', [teacherUser.id]))[0][0].is_active, 0)
  assert.equal((await loginAs('13800000022', resetPassword)).status, 401)
  assert.equal((await fetch(`${base}/edusystem/api/auth/profile`, {
    headers: { Authorization: `Bearer ${resetLogin.accessToken}` }
  })).status, 401)
  await stoppedCard.getByRole('button', { name: '恢复' }).click()
  await stoppedCard.getByRole('button', { name: '编辑' }).waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT is_active FROM users WHERE id = ?', [teacherUser.id]))[0][0].is_active, 1)
  assert.equal((await loginAs('13800000022', resetPassword)).status, 200)
  await page.goto(`${base}/handovers`, { waitUntil: 'domcontentloaded' })
  const historyRow = page.locator('.handover-page tbody tr').filter({ hasText: '工作安排' })
  await historyRow.getByText('工作安排').waitFor({ state: 'visible' })
  await historyRow.getByText('隔离测试教师新名').waitFor({ state: 'visible' })
  await historyRow.getByText('接任教师', { exact: true }).waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  await context.close()
  process.stdout.write('isolated teacher browser API passed: create, account reset, handover, past/future occurrences, course and weekly views, history snapshots, stop/restore\n')
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
