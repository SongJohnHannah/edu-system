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
  throw new Error('学生浏览器测试只允许显式指定本机 3307 隔离 MySQL 实例')
}
const databaseName = `edu_system_test_student_ui_${process.pid}_${Date.now()}`
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
  const teacherPassword = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-student-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  await migration.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '林老师', 'active')")
  await migration.execute('INSERT INTO users (id, username, password_hash, role, teacher_id, display_name) VALUES (?, ?, ?, ?, ?, ?)',
    ['teacher-user-1', 'isolated-student-teacher', await bcrypt.hash(teacherPassword, 10), 'teacher', 'teacher-1', '林老师'])

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
  const loginAs = async (username, loginPassword) => {
    const response = await fetch(`${base}/edusystem/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: loginPassword })
    })
    assert.equal(response.status, 200)
    return response.json()
  }
  const login = await loginAs('isolated-student-admin', password)
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
  await page.goto(`${base}/students`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '添加学生' }).first().click()
  const create = page.locator('.modal').filter({ hasText: '添加学生' })
  await create.getByPlaceholder('请输入学生姓名').fill('隔离测试新生')
  await create.getByPlaceholder('请输入学生年龄').fill('9')
  await create.getByPlaceholder('请输入家长联系电话').fill('13800000001')
  await create.getByPlaceholder('请输入购买课时数').fill('1.5')
  await create.getByRole('button', { name: '保存' }).click()
  const row = page.locator('.students table tbody tr').filter({ hasText: '隔离测试新生' })
  await row.waitFor({ state: 'visible' })
  const search = page.getByPlaceholder('搜索学生姓名或电话...')
  await search.fill('不存在的学生')
  await row.waitFor({ state: 'hidden' })
  await search.fill('13800000001')
  await row.waitFor({ state: 'visible' })
  await search.fill('')
  const [[student]] = await pool.execute('SELECT id, total_hours, created_by, enrollment_stage FROM students WHERE name = ?', ['隔离测试新生'])
  assert.ok(student?.id)
  assert.equal(Number(student.total_hours), 1.5)
  assert.equal(student.created_by, 'admin')
  assert.equal(student.enrollment_stage, 'enrolled')

  const authHeaders = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' }
  const invalidCases = [
    { name: '学'.repeat(101) }, { name: '字段过长学生', phone: '1'.repeat(21) },
    { name: '年龄越界学生', age: 101 }, { name: '年龄小数学生', age: 1.5 }
  ]
  for (const body of invalidCases) {
    const response = await fetch(`${base}/edusystem/api/students`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) })
    assert.equal(response.status, 400)
    const batch = await fetch(`${base}/edusystem/api/students/batch`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ students: [body] })
    })
    assert.equal(batch.status, 400)
  }
  for (const body of [{ name: '学'.repeat(101) }, { phone: '1'.repeat(21) }, { age: 0 }, { age: 100.5 }]) {
    const response = await fetch(`${base}/edusystem/api/students/${student.id}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify(body)
    })
    assert.equal(response.status, 400)
  }
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM students'))[0][0].total, 1)
  await pool.execute("INSERT INTO students (id, name, phone, status, created_by, enrollment_stage) VALUES ('legacy-phone', '旧号码学生', ' 13800000002 ', 'active', 'admin', 'enrolled')")
  const duplicatePhone = await fetch(`${base}/edusystem/api/students`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: '重复联系电话新生', phone: '13800000002' })
  })
  assert.equal(duplicatePhone.status, 409)
  assert.match((await duplicatePhone.json()).error, /手机号已被其他学生使用/)
  const duplicateName = await fetch(`${base}/edusystem/api/students`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: '隔离测试新生' })
  })
  assert.equal(duplicateName.status, 409)
  assert.match((await duplicateName.json()).error, /学生姓名已存在/)
  await pool.execute("INSERT INTO students (id, name, status, created_by, enrollment_stage) VALUES ('legacy-name', ' 旧姓名学生 ', 'active', 'admin', 'enrolled')")
  const legacyNameCheck = await fetch(`${base}/edusystem/api/students/check-name?name=${encodeURIComponent(' 旧姓名学生 ')}`, { headers: authHeaders })
  assert.equal(legacyNameCheck.status, 200)
  assert.equal((await legacyNameCheck.json()).exists, true)
  const legacyNameCreate = await fetch(`${base}/edusystem/api/students`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ name: '旧姓名学生' })
  })
  assert.equal(legacyNameCreate.status, 409)
  const legacyNameUpdate = await fetch(`${base}/edusystem/api/students/${student.id}`, {
    method: 'PUT', headers: authHeaders, body: JSON.stringify({ name: ' 旧姓名学生 ' })
  })
  assert.equal(legacyNameUpdate.status, 409)
  const legacyNameBatch = await fetch(`${base}/edusystem/api/students/batch`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ students: [{ name: '旧姓名学生' }] })
  })
  assert.deepEqual(await legacyNameBatch.json(), { addedCount: 0, skipped: ['旧姓名学生'] })
  const duplicatePhoneBatch = await fetch(`${base}/edusystem/api/students/batch`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ students: [{ name: '批量重复联系电话', phone: ' 13800000002 ' }] })
  })
  assert.equal(duplicatePhoneBatch.status, 200)
  assert.deepEqual(await duplicatePhoneBatch.json(), { addedCount: 0, skipped: ['批量重复联系电话'] })
  const duplicatePhoneEdit = await fetch(`${base}/edusystem/api/students/${student.id}`, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ phone: ' 13800000002 ' })
  })
  assert.equal(duplicatePhoneEdit.status, 409)
  assert.match((await duplicatePhoneEdit.json()).error, /手机号已被其他学生使用/)
  assert.equal((await pool.execute('SELECT phone FROM students WHERE id = ?', [student.id]))[0][0].phone, '13800000001')
  const normalizedCreate = await fetch(`${base}/edusystem/api/students`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: '去空格号码新生', phone: ' 13900000003 ' })
  })
  assert.equal(normalizedCreate.status, 201)
  const normalizedStudent = await normalizedCreate.json()
  assert.equal(normalizedStudent.phone, '13900000003')
  const normalizedBatch = await fetch(`${base}/edusystem/api/students/batch`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ students: [{ name: '去空格批量新生', phone: ' 13700000004 ' }] })
  })
  assert.equal(normalizedBatch.status, 200)
  assert.equal((await normalizedBatch.json()).addedCount, 1)
  assert.equal((await pool.execute('SELECT phone FROM students WHERE name = ?', ['去空格批量新生']))[0][0].phone, '13700000004')
  const normalizedEdit = await fetch(`${base}/edusystem/api/students/${normalizedStudent.id}`, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ phone: ' 13600000005 ' })
  })
  assert.equal(normalizedEdit.status, 200)
  assert.equal((await normalizedEdit.json()).phone, '13600000005')
  const spoofedCreate = await fetch(`${base}/edusystem/api/students`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: '隔离旧班级字段新生', totalHours: 1, classId: 'removed-class' })
  })
  assert.equal(spoofedCreate.status, 201)
  const createdWithoutClass = await spoofedCreate.json()
  assert.equal(Object.hasOwn(createdWithoutClass, 'classId'), false)
  assert.equal(Object.hasOwn(createdWithoutClass, 'class_id'), false)
  assert.equal((await pool.execute('SELECT class_id FROM students WHERE id = ?', [createdWithoutClass.id]))[0][0].class_id, '')

  await pool.execute('UPDATE students SET class_id = ? WHERE id = ?', ['legacy-class', student.id])
  const spoofedUpdate = await fetch(`${base}/edusystem/api/students/${student.id}`, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ remark: '正常编辑保留旧班级数据', classId: 'removed-class' })
  })
  assert.equal(spoofedUpdate.status, 200)
  const updatedWithoutClass = await spoofedUpdate.json()
  assert.equal(Object.hasOwn(updatedWithoutClass, 'classId'), false)
  assert.equal(Object.hasOwn(updatedWithoutClass, 'class_id'), false)
  assert.equal((await pool.execute('SELECT class_id FROM students WHERE id = ?', [student.id]))[0][0].class_id, 'legacy-class')
  const spoofedBatch = await fetch(`${base}/edusystem/api/students/batch`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ defaultHours: 1, students: [{ name: '隔离批量旧班级字段新生', classId: 'removed-class' }] })
  })
  assert.equal(spoofedBatch.status, 200)
  assert.equal((await spoofedBatch.json()).addedCount, 1)
  assert.equal((await pool.execute('SELECT class_id FROM students WHERE name = ?', ['隔离批量旧班级字段新生']))[0][0].class_id, '')
  const listedStudents = await fetch(`${base}/edusystem/api/students`, { headers: authHeaders })
  assert.equal(listedStudents.status, 200)
  assert.equal((await listedStudents.json()).some(item => Object.hasOwn(item, 'classId') || Object.hasOwn(item, 'class_id')), false)

  await row.getByRole('button', { name: '加减课' }).click()
  const hoursModal = page.locator('.modal').filter({ hasText: '加减课时' })
  await hoursModal.locator('.hours-amount input').fill('2')
  await hoursModal.getByPlaceholder('如：续费20课时').fill('续费')
  await hoursModal.getByRole('button', { name: '确认' }).click()
  await hoursModal.waitFor({ state: 'hidden' })
  await row.getByRole('button', { name: '加减课' }).click()
  await hoursModal.locator('.hours-type-btn').filter({ hasText: '减课时' }).click()
  await hoursModal.locator('.hours-amount input').fill('0.5')
  await hoursModal.getByPlaceholder('如：输错修正').fill('修正')
  await hoursModal.getByRole('button', { name: '确认' }).click()
  await hoursModal.waitFor({ state: 'hidden' })
  const [[balance]] = await pool.execute('SELECT total_hours FROM students WHERE id = ?', [student.id])
  assert.equal(Number(balance.total_hours), 3)
  const [records] = await pool.execute('SELECT type, hours, remark, operator FROM hour_records WHERE student_id = ? ORDER BY created_at, id', [student.id])
  assert.deepEqual(records.map(record => [record.type, Number(record.hours), record.remark, record.operator]).sort(), [
    ['add', 2, '续费', 'isolated-student-admin'], ['subtract', 0.5, '修正', 'isolated-student-admin']
  ].sort())
  const duplicate = await fetch(`${base}/edusystem/api/students/check-name?name=${encodeURIComponent('隔离测试新生')}`, {
    headers: { Authorization: `Bearer ${login.accessToken}` }
  })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).exists, true)

  await row.getByRole('button', { name: '编辑' }).click()
  const edit = page.locator('.modal').filter({ hasText: '编辑学生' })
  await edit.getByPlaceholder('特殊情况说明').fill('试听转报名待确认')
  await edit.locator('.n-select').click()
  await page.locator('.n-base-select-option').filter({ hasText: '待报名（可预约试听）' }).click()
  await edit.getByRole('button', { name: '保存' }).click()
  await row.getByText('待报名').waitFor({ state: 'visible' })
  const [[stage]] = await pool.execute('SELECT enrollment_stage, remark FROM students WHERE id = ?', [student.id])
  assert.equal(stage.enrollment_stage, 'pending')
  assert.equal(stage.remark, '试听转报名待确认')

  await row.locator('.badge').first().click()
  const statusModal = page.locator('.modal').filter({ hasText: '修改学生状态' })
  await statusModal.getByRole('button', { name: /退学/ }).click()
  await statusModal.getByRole('button', { name: '确认修改' }).click()
  await row.getByText('退学', { exact: true }).waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'quit')
  await row.locator('.badge').first().click()
  await statusModal.getByRole('button', { name: /正常/ }).click()
  await statusModal.getByRole('button', { name: '确认修改' }).click()
  await row.getByText('正常', { exact: true }).first().waitFor({ state: 'visible' })

  const excess = await fetch(`${base}/edusystem/api/students/${student.id}/subtract-hours`, {
    method: 'POST', headers: { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours: 100, remark: '超额修正' })
  })
  assert.equal(excess.status, 200)
  assert.equal((await excess.json()).totalHours, -97)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await row.waitFor({ state: 'visible' })

  const teacherLogin = await loginAs('isolated-student-teacher', teacherPassword)
  const denied = await fetch(`${base}/edusystem/api/students/${student.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${teacherLogin.accessToken}` }
  })
  assert.equal(denied.status, 403)
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'active')

  await row.locator('.badge').first().click()
  await statusModal.getByRole('button', { name: /退学/ }).click()
  await statusModal.getByRole('button', { name: '确认修改' }).click()
  await row.getByText('退学', { exact: true }).waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'quit')
  await row.getByRole('button', { name: '归档' }).click()
  const confirm = page.locator('.modal').filter({ hasText: '归档学生' })
  await confirm.waitFor({ state: 'visible' })
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'quit')
  await confirm.getByRole('button', { name: '确认' }).click()
  await row.waitFor({ state: 'detached' })
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'deleted')
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM hour_records WHERE student_id = ?', [student.id]))[0][0].total, 3)
  await page.getByRole('button', { name: '查看归档' }).click()
  await row.waitFor({ state: 'visible' })
  const historyPagePromise = page.waitForEvent('popup')
  await row.getByRole('button', { name: '历史' }).click()
  const historyPage = await historyPagePromise
  await historyPage.getByRole('heading', { name: '隔离测试新生 - 课时记录' }).waitFor({ state: 'visible' })
  await historyPage.locator('.hours-history tbody tr').first().waitFor({ state: 'visible' })
  assert.equal(await historyPage.locator('.hours-history tbody tr').count(), 3)
  await historyPage.close()

  const [[archivedStudent]] = await pool.execute('SELECT id, name, phone, total_hours, used_hours, enrollment_stage, remark, class_id FROM students WHERE id = ?', [student.id])
  const deniedRestore = await fetch(`${base}/edusystem/api/students/${student.id}/restore`, {
    method: 'POST', headers: { Authorization: `Bearer ${teacherLogin.accessToken}` }
  })
  assert.equal(deniedRestore.status, 403)
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'deleted')
  await row.getByRole('button', { name: '恢复', exact: true }).click()
  const restoreConfirm = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '恢复学生', exact: true }) })
  const restoredResponse = page.waitForResponse(response => response.url().endsWith(`/students/${student.id}/restore`))
  await restoreConfirm.getByRole('button', { name: '确认', exact: true }).click()
  assert.equal((await restoredResponse).status(), 200)
  await restoreConfirm.waitFor({ state: 'hidden' })
  await row.waitFor({ state: 'detached' })
  const [[restoredStudent]] = await pool.execute('SELECT id, name, phone, total_hours, used_hours, enrollment_stage, remark, class_id FROM students WHERE id = ?', [student.id])
  assert.deepEqual(restoredStudent, archivedStudent, '恢复须保留原学生信息和课时余额')
  assert.equal((await pool.execute('SELECT status FROM students WHERE id = ?', [student.id]))[0][0].status, 'active')
  assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM hour_records WHERE student_id = ?', [student.id]))[0][0].total, 3)
  await page.getByRole('button', { name: '隐藏归档', exact: true }).click()
  await row.waitFor({ state: 'visible' })
  await row.getByText('正常', { exact: true }).first().waitFor({ state: 'visible' })
  await pool.execute("INSERT INTO students (id, name, status, created_by, creator_id, enrollment_stage, total_hours, used_hours) VALUES ('teacher-archived', '教师自己归档学生', 'deleted', 'teacher', 'teacher-1', 'enrolled', 20, 2)")
  const ownRestored = await fetch(`${base}/edusystem/api/students/teacher-archived/restore`, {
    method: 'POST', headers: { Authorization: `Bearer ${teacherLogin.accessToken}` }
  })
  assert.equal(ownRestored.status, 200)
  const ownStudent = await ownRestored.json()
  assert.equal(ownStudent.status, 'active')
  assert.equal(ownStudent.totalHours, 20)
  assert.equal(ownStudent.usedHours, 2)

  await pool.execute("INSERT INTO students (id, name, status, created_by, enrollment_stage) VALUES ('history-student', '历史学生', 'active', 'admin', 'enrolled')")
  await pool.execute(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, student_ids, archived_at)
    VALUES ('history-course', '历史课程', 'teacher-1', 1, '09:00', '10:00', '["history-student"]', CURRENT_TIMESTAMP)`)
  await pool.execute(`INSERT INTO attendance (id, course_id, date, student_ids, original_student_ids, recorded_by)
    VALUES ('history-attendance', 'history-course', '2026-01-05', '["history-student"]', '["history-student"]', 'teacher-1')`)
  const archiveHistory = await fetch(`${base}/edusystem/api/students/history-student`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${login.accessToken}` }
  })
  assert.equal(archiveHistory.status, 200)
  const [[historicalAttendance]] = await pool.execute('SELECT student_ids, original_student_ids FROM attendance WHERE id = ?', ['history-attendance'])
  assert.ok(historicalAttendance)
  for (const value of [historicalAttendance.student_ids, historicalAttendance.original_student_ids]) {
    assert.deepEqual(typeof value === 'string' ? JSON.parse(value) : value, ['history-student'])
  }

  const schedule = await import('../src/services/scheduleService.js')
  const today = schedule.iso(new Date())
  const priorDate = schedule.addDays(today, -7)
  const nextDate = schedule.addDays(today, 7)
  const weekday = new Date(`${today}T12:00:00`).getDay()
  const oldIds = ['roster-active', 'history-student', 'missing-student']
  const jsonIds = value => typeof value === 'string' ? JSON.parse(value) : value
  await pool.execute("INSERT INTO students (id, name, status, created_by, enrollment_stage, total_hours) VALUES ('roster-active', '在读名单学生', 'active', 'admin', 'enrolled', 20)")
  for (const [id, name, start, end] of [
    ['legacy-roster', '管理旧名单课程', '09:00', '10:00'], ['weekly-roster', '周排课旧名单课程', '11:00', '12:00']
  ]) {
    await pool.execute(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, student_ids, effective_start_date, created_at)
      VALUES (?, ?, 'teacher-1', ?, ?, ?, ?, ?, ?)`, [id, name, weekday, start, end, JSON.stringify(oldIds), priorDate, `${priorDate} 00:00:00`])
  }
  // Strict API validation stays in place; the edit form must remove hidden invalid IDs.
  const rejected = await fetch(`${base}/edusystem/api/courses/legacy-roster`, {
    method: 'PUT', headers: authHeaders, body: JSON.stringify({ studentIds: oldIds })
  })
  assert.equal(rejected.status, 400)
  assert.match((await rejected.json()).error, /课程名单包含不存在或已归档的学生/)
  await page.goto(`${base}/courses`)
  const card = page.locator('.course-card').filter({ has: page.getByRole('heading', { name: '管理旧名单课程', exact: true }) })
  await card.getByText(/历史学生（已归档）/).waitFor({ state: 'visible' })
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  const courseEdit = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑课程', exact: true }) })
  await courseEdit.getByText(/本次名单已移除：历史学生（已归档）、已不存在的学生/).waitFor({ state: 'visible' })
  await courseEdit.getByPlaceholder('如：三年级数学提高班').fill('管理旧名单已修复')
  const courseSaved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/courses/legacy-roster'))
  await courseEdit.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await courseSaved).status(), 200)
  await courseEdit.waitFor({ state: 'hidden' })

  await page.goto(`${base}/weekly-schedule`)
  const nextOccurrence = page.locator(`.day-lane[data-date="${nextDate}"] .course-bar`).filter({ hasText: '周排课旧名单课程' })
  await nextOccurrence.click()
  const weeklyEdit = page.locator('.detail-modal').filter({ has: page.getByRole('heading', { name: '课程资料', exact: true }) })
  await weeklyEdit.getByText(/本次名单已移除：历史学生（已归档）、已不存在的学生/).waitFor({ state: 'visible' })
  await weeklyEdit.locator('label').filter({ hasText: '课程名称' }).locator('input').fill('周排课旧名单已修复')
  const weeklySaved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/courses/weekly-roster'))
  await weeklyEdit.getByRole('button', { name: '保存课程资料与名单' }).click()
  assert.equal((await weeklySaved).status(), 200)
  await weeklyEdit.waitFor({ state: 'hidden' })
  for (const id of ['legacy-roster', 'weekly-roster']) {
    const [[storedCourse]] = await pool.execute('SELECT student_ids FROM courses WHERE id = ?', [id])
    assert.deepEqual(jsonIds(storedCourse.student_ids), ['roster-active'])
    const [versions] = await pool.execute('SELECT student_ids FROM course_roster_versions WHERE course_id = ? ORDER BY effective_at', [id])
    assert.deepEqual(versions.map(v => jsonIds(v.student_ids)), [oldIds, ['roster-active']])
    const past = (await schedule.listOccurrences(priorDate, priorDate)).find(item => item.courseId === id)
    const future = (await schedule.listOccurrences(nextDate, nextDate)).find(item => item.courseId === id)
    assert.deepEqual(past.studentIds, oldIds, '修复名单不能修改历史课次的名单')
    assert.deepEqual(future.studentIds, ['roster-active'], '后续课次应使用修复后的在读名单')
  }
  const [[retainedAttendance]] = await pool.execute('SELECT student_ids, original_student_ids FROM attendance WHERE id = ?', ['history-attendance'])
  assert.deepEqual(retainedAttendance, historicalAttendance, '修复课程名单不能改写历史点名记录')
  assert.deepEqual(errors, [])
  await context.close()
  process.stdout.write('isolated student browser API passed: student lifecycle and recovery permissions/balances; both course editors repair archived/missing rosters while preserving historical occurrences/attendance\n')
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
