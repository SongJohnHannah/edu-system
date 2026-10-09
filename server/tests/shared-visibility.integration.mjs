import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('共享可见性集成测试只允许在显式指定的本机 3307 隔离 MySQL 运行')
}
const name = `edu_system_test_visibility_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
const admin = await mysql.createConnection(config)
let migration
let server
let pool
let created = false
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
    ['admin-1', 'visibility-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  process.env.DB_NAME = name
  process.env.PORT = '0'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/edusystem/api`
  const call = async (method, route, body, token) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: response.status, data: await response.json() }
  }
  assert.equal((await call('GET', '/health')).data.isolatedTestDatabase, true)
  const adminLogin = await call('POST', '/auth/login', { username: 'visibility-admin', password })
  assert.equal(adminLogin.status, 200)
  const adminToken = adminLogin.data.accessToken
  const teacherA = await call('POST', '/teachers', { name: '教师甲', phone: '13800001111', subject: '语文' }, adminToken)
  const teacherB = await call('POST', '/teachers', { name: '教师乙', phone: '13800002222', subject: '数学' }, adminToken)
  assert.deepEqual([teacherA.status, teacherB.status], [201, 201])
  const loginA = await call('POST', '/auth/login', { username: teacherA.data.username, password: teacherA.data.defaultPassword })
  const loginB = await call('POST', '/auth/login', { username: teacherB.data.username, password: teacherB.data.defaultPassword })
  assert.deepEqual([loginA.status, loginB.status], [200, 200])
  const tokenA = loginA.data.accessToken
  const tokenB = loginB.data.accessToken

  const shared = await call('POST', '/students', { name: '公共学生', totalHours: 10 }, adminToken)
  const studentA = await call('POST', '/students', { name: '甲录入学生', totalHours: 2, createdBy: 'admin', creatorId: null }, tokenA)
  const studentB = await call('POST', '/students', { name: '乙录入学生', totalHours: 3 }, tokenB)
  assert.deepEqual([shared.status, studentA.status, studentB.status], [201, 201, 201])
  assert.deepEqual([studentA.data.createdBy, studentA.data.creatorId], ['teacher', teacherA.data.id])
  for (const token of [adminToken, tokenA, tokenB]) {
    const list = await call('GET', '/students', undefined, token)
    assert.equal(list.status, 200)
    assert.deepEqual(new Set(list.data.map(student => student.id)), new Set([shared.data.id, studentA.data.id, studentB.data.id]))
  }
  const forgedBatch = await call('POST', '/students/batch', {
    createdBy: 'admin', creatorId: null,
    students: [{ name: '批量归属核对', totalHours: 1, createdBy: 'admin', creatorId: null }]
  }, tokenA)
  assert.equal(forgedBatch.status, 200)
  const [[batchOwner]] = await migration.execute('SELECT created_by, creator_id FROM students WHERE name = ?', ['批量归属核对'])
  assert.deepEqual([batchOwner.created_by, batchOwner.creator_id], ['teacher', teacherA.data.id])
  assert.equal((await call('POST', `/students/${studentA.data.id}/add-hours`, { hours: 0.5, remark: '甲续费' }, tokenA)).status, 200)
  assert.equal((await call('POST', `/students/${studentB.data.id}/add-hours`, { hours: 1.5, remark: '乙续费' }, tokenB)).status, 200)
  assert.equal((await call('POST', `/students/${studentA.data.id}/add-hours`, { hours: 5, remark: '越权' }, tokenB)).status, 403)
  const [[balanceA]] = await migration.execute('SELECT total_hours FROM students WHERE id = ?', [studentA.data.id])
  assert.equal(Number(balanceA.total_hours), 2.5)
  for (const [studentId, hours] of [[studentA.data.id, 0.5], [studentB.data.id, 1.5]]) {
    for (const token of [adminToken, tokenA, tokenB]) {
      const history = await call('GET', `/hour-records?studentId=${studentId}&limit=10`, undefined, token)
      assert.equal(history.status, 200)
      assert.ok(history.data.data.some(record => record.type === 'add' && record.hours === hours))
    }
  }
  const allHours = await call('GET', '/hour-records', undefined, tokenA)
  assert.equal(allHours.status, 200)
  assert.ok(allHours.data.some(record => record.studentId === studentB.data.id))

  const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const courseA = await call('POST', '/courses', {
    name: '甲的共享课程', teacherId: teacherA.data.id, studentIds: [shared.data.id],
    weekday: 1, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, effectiveStartDate: start
  }, tokenA)
  const courseB = await call('POST', '/courses', {
    name: '乙的共享课程', teacherId: teacherB.data.id, studentIds: [shared.data.id],
    weekday: 2, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, effectiveStartDate: start
  }, adminToken)
  assert.deepEqual([courseA.status, courseB.status], [201, 201])
  const sharedCourses = await call('GET', '/courses', undefined, tokenB)
  assert.equal(sharedCourses.status, 200)
  assert.ok(sharedCourses.data.some(course => course.id === courseA.data.id && course.studentIds.includes(shared.data.id)))
  assert.ok(sharedCourses.data.some(course => course.id === courseB.data.id && course.studentIds.includes(shared.data.id)))
  assert.equal((await call('PUT', `/courses/${courseA.data.id}`, { name: '越权修改' }, tokenB)).status, 403)
  const end = new Date(new Date(`${start}T12:00:00`).getTime() + 13 * 86400000).toISOString().slice(0, 10)
  const range = `start=${start}&end=${end}`
  const [allDetails, mineDetails, allOverall, mineOverall, allWeekdays, mineWeekdays] = await Promise.all([
    call('GET', `/stats/teachers?${range}&scope=all`, undefined, tokenA),
    call('GET', `/stats/teachers?${range}&scope=mine`, undefined, tokenA),
    call('GET', `/stats/overall?${range}&scope=all`, undefined, tokenA),
    call('GET', `/stats/overall?${range}&scope=mine`, undefined, tokenA),
    call('GET', `/stats/weekday-distribution?${range}&scope=all`, undefined, tokenA),
    call('GET', `/stats/weekday-distribution?${range}&scope=mine`, undefined, tokenA)
  ])
  for (const result of [allDetails, mineDetails, allOverall, mineOverall, allWeekdays, mineWeekdays]) assert.equal(result.status, 200)
  assert.deepEqual(new Set(allDetails.data.map(item => item.id)), new Set([teacherA.data.id, teacherB.data.id]))
  assert.deepEqual(mineDetails.data.map(item => item.id), [teacherA.data.id])
  assert.deepEqual([allOverall.data.totalTeachers, allOverall.data.totalCourses], [2, 2])
  assert.deepEqual([mineOverall.data.totalTeachers, mineOverall.data.totalCourses], [1, 1])
  assert.ok(allWeekdays.data[0] > 0 && allWeekdays.data[1] > 0)
  assert.ok(mineWeekdays.data[0] > 0 && mineWeekdays.data[1] === 0)
  const occurrences = await call('GET', `/courses/occurrences?${range}`, undefined, tokenA)
  assert.equal(occurrences.status, 200)
  for (const [course, token] of [[courseA.data, tokenA], [courseB.data, tokenB]]) {
    const item = occurrences.data.find(entry => entry.courseId === course.id)
    assert.ok(item, `课程 ${course.id} 缺少未来课次`)
    const saved = await call('POST', '/attendance', {
      courseId: course.id, date: item.date, originalDate: item.originalDate, studentIds: [shared.data.id]
    }, token)
    assert.equal(saved.status, 201)
  }
  for (const [token, teacherId] of [[tokenA, teacherA.data.id], [tokenB, teacherB.data.id]]) {
    const all = await call('GET', '/attendance?scope=all&limit=1', undefined, token)
    const mine = await call('GET', '/attendance?scope=mine&limit=1', undefined, token)
    assert.equal(all.status, 200)
    assert.equal(mine.status, 200)
    assert.equal(all.data.hasMore, true)
    assert.equal(mine.data.hasMore, false)
    assert.deepEqual(mine.data.data.map(record => record.recordedBy), [teacherId])
  }
  const adminAttendance = await call('GET', '/attendance?limit=10', undefined, adminToken)
  assert.equal(adminAttendance.status, 200)
  assert.equal(adminAttendance.data.data.length, 2)

  const studentService = await import('../src/services/studentService.js')
  const archived = await call('POST', '/students', { name: '归档并发核对', totalHours: 2 }, tokenA)
  assert.equal(archived.status, 201)
  await studentService.verifyAccess(archived.data.id, teacherA.data.id)
  assert.equal((await call('DELETE', `/students/${archived.data.id}`, undefined, tokenA)).status, 200)
  for (const adjust of [studentService.addHours, studentService.subtractHours]) {
    await assert.rejects(adjust(archived.data.id, 0.5, '归档后禁止写入', 'visibility-test', teacherA.data.id),
      error => error.status === 404)
    await assert.rejects(adjust(studentB.data.id, 0.5, '跨教师禁止写入', 'visibility-test', teacherA.data.id),
      error => error.status === 403)
  }
  const [[archivedBalance]] = await migration.execute('SELECT total_hours FROM students WHERE id = ?', [archived.data.id])
  const [[archivedRecords]] = await migration.execute('SELECT COUNT(*) AS count FROM hour_records WHERE student_id = ?', [archived.data.id])
  const [[foreignBalance]] = await migration.execute('SELECT total_hours FROM students WHERE id = ?', [studentB.data.id])
  const [[foreignRecords]] = await migration.execute('SELECT COUNT(*) AS count FROM hour_records WHERE student_id = ? AND remark = ?', [studentB.data.id, '跨教师禁止写入'])
  assert.equal(Number(archivedBalance.total_hours), 2)
  assert.equal(Number(archivedRecords.count), 0)
  assert.equal(Number(foreignBalance.total_hours), 4.5)
  assert.equal(Number(foreignRecords.count), 0)
  process.stdout.write('isolated shared visibility passed: students, hours, ownership, cross-teacher courses, stats and attendance scopes\n')
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
