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
  throw new Error('周排课浏览器集成测试只允许显式指定本机 3307 隔离 MySQL 实例')
}
const name = `edu_system_test_weekly_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
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
    ['admin-1', 'isolated-weekly-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  await migration.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '林老师', 'active'), ('teacher-2', '陈老师', 'active')")
  await migration.execute(`INSERT INTO students (id, name, total_hours, status, created_by, enrollment_stage)
    VALUES ('student-1', '安安', 10, 'active', 'admin', 'enrolled'), ('student-2', '乐乐', 10, 'active', 'admin', 'enrolled')`)

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  const firstSundayDate = new Date(`${today}T12:00:00+08:00`)
  firstSundayDate.setUTCDate(firstSundayDate.getUTCDate() - firstSundayDate.getUTCDay())
  const iso = date => date.toISOString().slice(0, 10)
  const firstSunday = iso(firstSundayDate)
  const addDays = (date, count) => {
    const day = new Date(`${date}T12:00:00Z`)
    day.setUTCDate(day.getUTCDate() + count)
    return iso(day)
  }
  const secondSunday = addDays(firstSunday, 7)
  const secondMonday = addDays(secondSunday, 1)
  const secondTuesday = addDays(secondSunday, 2)
  await migration.execute(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, hours_per_class, student_ids, created_at)
    VALUES ('course-existing', '第一周数学', 'teacher-2', 2, '14:00', '15:00', 1, '["student-2"]', ?)`, [`${firstSunday} 08:00:00`])

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
    body: JSON.stringify({ username: 'isolated-weekly-admin', password })
  })
  assert.equal(loginResponse.status, 200)
  const login = await loginResponse.json()
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` }
  const validCourse = { name: '字段边界课程', teacherId: 'teacher-1', studentIds: ['student-1'], weekday: 1,
    startTime: '09:00', endTime: '10:00', effectiveStartDate: secondMonday }
  for (const invalid of [{ name: '课'.repeat(201) }, { classroom: '教'.repeat(101) },
    { hoursPerClass: 1000 }, { hoursPerClass: 0.3 }]) {
    const response = await fetch(`${base}/edusystem/api/courses`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ ...validCourse, ...invalid })
    })
    assert.equal(response.status, 400)
  }
  assert.equal((await pool.execute("SELECT COUNT(*) AS total FROM courses WHERE name LIKE '字段边界课程%'"))[0][0].total, 0)

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
  await page.goto(`${base}/weekly-schedule`, { waitUntil: 'domcontentloaded' })
  const grid = page.locator('.combined-grid')
  const weekHeaders = page.locator('.combined-week-head > span')
  await grid.locator('.course-bar').first().waitFor({ state: 'visible' })
  assert.equal(await weekHeaders.count(), 2)
  assert.equal(await grid.locator('.day-head').count(), 14)
  await weekHeaders.nth(1).getByRole('button', { name: '在本周创建课程' }).click()
  const create = page.locator('.detail-modal').filter({ hasText: '开始排课' })
  await create.waitFor({ state: 'visible' })
  await create.locator('.create-form input[type="text"]').first().fill('第二周阅读课')
  await create.locator('.create-form .n-select').last().click()
  await page.locator('.n-base-select-option').filter({ hasText: '安安' }).click()
  await page.keyboard.press('Escape')
  await create.getByRole('button', { name: '创建课程' }).click()
  await grid.locator(`.day-lane[data-date="${secondMonday}"] .course-bar`).filter({ hasText: '第二周阅读课' }).waitFor({ state: 'visible' })
  for (let i = 0; i < 7; i++) assert.equal(await grid.locator('.day-lane').nth(i).locator('.course-bar').filter({ hasText: '第二周阅读课' }).count(), 0)
  const [[newCourse]] = await pool.execute('SELECT id, effective_start_date, weekday, teacher_id, student_ids FROM courses WHERE name = ?', ['第二周阅读课'])
  assert.ok(newCourse)
  for (const invalid of [{ name: '课'.repeat(201) }, { classroom: '教'.repeat(101) }, { hoursPerClass: 1000 }]) {
    const response = await fetch(`${base}/edusystem/api/courses/${newCourse.id}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify(invalid)
    })
    assert.equal(response.status, 400)
  }
  const dateValue = value => value instanceof Date ? new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10) : String(value).slice(0, 10)
  assert.equal(dateValue(newCourse.effective_start_date), secondSunday)
  assert.equal(newCourse.weekday, 1)
  assert.equal(newCourse.teacher_id, 'teacher-1')
  assert.deepEqual(typeof newCourse.student_ids === 'string' ? JSON.parse(newCourse.student_ids) : newCourse.student_ids, ['student-1'])
  const schedule = await import('../src/services/scheduleService.js')
  const before = await schedule.listOccurrences(firstSunday, addDays(secondSunday, 6))
  assert.deepEqual(before.filter(row => row.courseId === newCourse.id).map(row => row.date), [secondMonday])

  await grid.locator(`.day-lane[data-date="${secondMonday}"] .course-bar`).filter({ hasText: '第二周阅读课' }).click()
  const detail = page.locator('.detail-modal').filter({ hasText: '课程资料' })
  await detail.getByRole('button', { name: '修改日期与时间' }).click()
  const move = page.locator('.move-modal')
  await move.waitFor({ state: 'visible' })
  await move.locator('input[type="date"]').fill(secondTuesday)
  assert.equal(await move.getByRole('button', { name: '确认调课' }).isEnabled(), false)
  await move.getByText('仅这一次，之后仍按原星期上课').click()
  await move.getByRole('button', { name: '确认调课' }).click()
  await move.waitFor({ state: 'hidden' })
  await grid.locator(`.day-lane[data-date="${secondTuesday}"] .course-bar`).filter({ hasText: '第二周阅读课' }).waitFor({ state: 'visible' })
  const [[change]] = await pool.execute('SELECT original_date, target_date, start_time, end_time FROM course_occurrence_changes WHERE course_id = ?', [newCourse.id])
  assert.equal(dateValue(change.original_date), secondMonday)
  assert.equal(dateValue(change.target_date), secondTuesday)
  assert.equal(change.start_time, '09:00')
  assert.equal(change.end_time, '11:00')
  const after = await schedule.listOccurrences(firstSunday, addDays(secondSunday, 13))
  assert.deepEqual(after.filter(row => row.courseId === newCourse.id).map(row => row.date), [secondTuesday, addDays(secondMonday, 7)])

  await page.goto(`${base}/courses`, { waitUntil: 'domcontentloaded' })
  const card = page.locator('.course-card').filter({ hasText: '第二周阅读课' })
  await card.waitFor({ state: 'visible' })
  await card.getByRole('button', { name: '编辑' }).click()
  const edit = page.locator('.modal').filter({ hasText: '编辑课程' })
  await edit.locator('input[placeholder="如：三年级数学提高班"]').fill('第二周阅读进阶')
  await edit.locator('input[placeholder="如：A101"]').fill('A101')
  await edit.locator('.hours-amount input').fill('1.5')
  await edit.getByRole('button', { name: '乐乐' }).click()
  await edit.getByRole('button', { name: '保存' }).click()
  const editedCard = page.locator('.course-card').filter({ hasText: '第二周阅读进阶' })
  await editedCard.getByText('安安、乐乐').waitFor({ state: 'visible' })
  const [[edited]] = await pool.execute('SELECT name, classroom, hours_per_class, student_ids FROM courses WHERE id = ?', [newCourse.id])
  assert.equal(edited.name, '第二周阅读进阶')
  assert.equal(edited.classroom, 'A101')
  assert.equal(Number(edited.hours_per_class), 1.5)
  assert.deepEqual(typeof edited.student_ids === 'string' ? JSON.parse(edited.student_ids) : edited.student_ids, ['student-1', 'student-2'])
  const [[detailHistory]] = await pool.execute('SELECT COUNT(*) AS total FROM course_detail_versions WHERE course_id = ?', [newCourse.id])
  const [[rosterHistory]] = await pool.execute('SELECT COUNT(*) AS total FROM course_roster_versions WHERE course_id = ?', [newCourse.id])
  assert.equal(detailHistory.total, 2)
  assert.equal(rosterHistory.total, 2)

  await editedCard.getByRole('button', { name: '归档' }).click()
  await page.getByRole('button', { name: '确认归档' }).click()
  await editedCard.waitFor({ state: 'detached' })
  const [[archived]] = await pool.execute('SELECT archived_at FROM courses WHERE id = ?', [newCourse.id])
  const [[savedMove]] = await pool.execute('SELECT COUNT(*) AS total FROM course_occurrence_changes WHERE course_id = ?', [newCourse.id])
  assert.ok(archived.archived_at)
  assert.equal(savedMove.total, 1)

  const thirdSunday = addDays(firstSunday, 14)
  const batchSaturday = addDays(thirdSunday, 6)
  const batchTuesday = addDays(thirdSunday, 9)
  const batchCourses = []
  for (const [name, teacherId, studentId, startTime, endTime] of [
    ['整天甲', 'teacher-1', 'student-1', '10:00', '11:00'],
    ['整天乙', 'teacher-2', 'student-2', '12:00', '13:00']
  ]) {
    const response = await fetch(`${base}/edusystem/api/courses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` },
      body: JSON.stringify({ name, teacherId, studentIds: [studentId], weekday: 6, startTime, endTime, hoursPerClass: 1, effectiveStartDate: thirdSunday })
    })
    assert.equal(response.status, 201)
    batchCourses.push((await response.json()).id)
  }
  const unauthorized = await fetch(`${base}/edusystem/api/courses/reschedule-day`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceDate: batchSaturday, targetDate: batchTuesday, scope: 'future' })
  })
  assert.equal(unauthorized.status, 401)
  await page.goto(`${base}/weekly-schedule`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '下两周' }).click()
  const dayHandle = page.getByRole('button', { name: `拖动或点击整体调整 ${batchSaturday} 的课程` })
  await dayHandle.waitFor({ state: 'visible' })
  await dayHandle.click()
  const dayMove = page.locator('.move-modal').filter({ hasText: '整天调课确认' })
  await dayMove.waitFor({ state: 'visible' })
  assert.equal(await dayMove.getByText('2 节正式课程').count(), 1)
  await dayMove.locator('input[type="date"]').fill(batchTuesday)
  await dayMove.getByText('从这次起，每周改到目标星期').click()
  await dayMove.getByRole('button', { name: '确认整体调课' }).click()
  await dayMove.waitFor({ state: 'hidden' })
  const batchResult = await schedule.listOccurrences(thirdSunday, addDays(thirdSunday, 20))
  const movedDates = batchResult.filter(row => batchCourses.includes(row.courseId)).map(row => row.date)
  assert.deepEqual(movedDates, [batchTuesday, batchTuesday, addDays(batchTuesday, 7), addDays(batchTuesday, 7)])
  const [[batchChanges]] = await pool.execute('SELECT COUNT(*) AS total FROM course_occurrence_changes WHERE course_id IN (?, ?)', batchCourses)
  const [[batchVersions]] = await pool.execute('SELECT COUNT(*) AS total FROM course_schedule_versions WHERE course_id IN (?, ?)', batchCourses)
  assert.equal(batchChanges.total, 2)
  assert.equal(batchVersions.total, 2)
  await page.locator(`.combined-grid .day-lane[data-date="${batchTuesday}"] .course-bar`).filter({ hasText: '整天甲' }).waitFor({ state: 'visible' })
  assert.equal(await page.locator(`.combined-grid .day-lane[data-date="${batchSaturday}"] .course-bar`).filter({ hasText: '整天甲' }).count(), 0)
  assert.deepEqual(errors, [])
  process.stdout.write('isolated weekly and course browser API passed: second-week create, once move, edit, archive, permanent whole-day move\n')
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
