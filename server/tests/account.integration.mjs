import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('账号集成测试只允许在显式指定的本机 3307 隔离 MySQL 实例运行')
}

const name = `edu_system_test_account_${process.pid}_${Date.now()}`
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

  const adminPassword = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-admin', await bcrypt.hash(adminPassword, 10), 'admin', '测试管理员'])
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
    const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
    return { status: response.status, payload }
  }

  assert.equal((await call('GET', '/health')).payload.isolatedTestDatabase, true)
  assert.equal((await call('POST', '/auth/login', { username: 'isolated-admin', password: 'wrong' })).status, 401)
  const adminLogin = await call('POST', '/auth/login', { username: 'isolated-admin', password: adminPassword })
  assert.equal(adminLogin.status, 200)
  const adminToken = adminLogin.payload.accessToken
  assert.equal((await call('PUT', '/auth/users/admin-1', { displayName: '越权改名' }, adminToken)).status, 403)
  assert.equal((await call('PUT', '/auth/users/admin-1/password', { newPassword: 'ForbiddenAdmin1' }, adminToken)).status, 403)
  assert.equal((await call('GET', '/auth/profile', undefined, adminToken)).payload.displayName, '测试管理员')
  const selfProfile = await call('PUT', '/auth/profile', { displayName: '管理员本人改名' }, adminToken)
  assert.equal(selfProfile.status, 200)
  assert.equal(selfProfile.payload.displayName, '管理员本人改名')
  assert.equal((await call('POST', '/auth/login', { username: 'isolated-admin', password: adminPassword })).status, 200)
  const refreshedAdmin = await call('POST', '/auth/refresh', { refreshToken: adminLogin.payload.refreshToken })
  assert.equal(refreshedAdmin.status, 200)
  assert.equal((await call('GET', '/auth/profile', undefined, refreshedAdmin.payload.accessToken)).status, 200)
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: adminToken })).status, 401)

  const createdTeacher = await call('POST', '/teachers', { name: '测试教师', phone: '13800138000', subject: '语文', isTest: true }, adminToken)
  assert.equal(createdTeacher.status, 201)
  const teacherId = createdTeacher.payload.id
  const initialPassword = createdTeacher.payload.defaultPassword
  const username = createdTeacher.payload.username
  assert.ok(teacherId && initialPassword && username)
  const [[createdUser]] = await migration.execute('SELECT id FROM users WHERE teacher_id = ?', [teacherId])
  assert.equal(createdTeacher.payload.userId, createdUser.id)

  const teacherLogin = await call('POST', '/auth/login', { username, password: initialPassword })
  assert.equal(teacherLogin.status, 200)
  assert.equal(teacherLogin.payload.user.teacherId, teacherId)
  const originalTeacherToken = teacherLogin.payload.accessToken
  const originalRefreshToken = teacherLogin.payload.refreshToken
  const refreshedTeacher = await call('POST', '/auth/refresh', { refreshToken: originalRefreshToken })
  assert.equal(refreshedTeacher.status, 200)
  assert.equal((await call('GET', '/auth/profile', undefined, refreshedTeacher.payload.accessToken)).status, 200)
  assert.equal((await call('POST', '/teachers', { name: '越权创建' }, originalTeacherToken)).status, 403)
  assert.equal((await call('GET', '/backup/export', undefined, originalTeacherToken)).status, 403)
  assert.equal((await call('POST', '/courses', { name: '越权课程', teacherId: 'other', studentIds: ['student-1'] }, originalTeacherToken)).status, 403)

  const updatedProfile = await call('PUT', '/auth/profile', { displayName: '新教师姓名' }, originalTeacherToken)
  assert.equal(updatedProfile.status, 200)
  assert.equal(updatedProfile.payload.displayName, '新教师姓名')
  const [[teacherRow]] = await migration.execute('SELECT name FROM teachers WHERE id = ?', [teacherId])
  assert.equal(teacherRow.name, '新教师姓名')

  assert.equal((await call('PUT', '/auth/password', { oldPassword: 'wrong', newPassword: 'NextPassword1' }, originalTeacherToken)).status, 400)
  assert.equal((await call('PUT', '/auth/password', { oldPassword: initialPassword, newPassword: 'NextPassword1' }, originalTeacherToken)).status, 200)
  assert.equal((await call('GET', '/auth/profile', undefined, originalTeacherToken)).status, 401)
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: originalRefreshToken })).status, 401)
  assert.equal((await call('POST', '/auth/login', { username, password: initialPassword })).status, 401)
  const changedLogin = await call('POST', '/auth/login', { username, password: 'NextPassword1' })
  assert.equal(changedLogin.status, 200)
  assert.equal((await call('PUT', `/auth/users/${teacherId}/password`, { newPassword: 'Forbidden1' }, changedLogin.payload.accessToken)).status, 403)

  const [[teacherUser]] = await migration.execute('SELECT id FROM users WHERE teacher_id = ?', [teacherId])
  assert.equal((await call('PUT', `/auth/users/${teacherUser.id}/password`, { newPassword: 'ResetPassword1' }, adminToken)).status, 200)
  assert.equal((await call('GET', '/auth/profile', undefined, changedLogin.payload.accessToken)).status, 401)
  assert.equal((await call('POST', '/auth/login', { username, password: 'NextPassword1' })).status, 401)
  const resetLogin = await call('POST', '/auth/login', { username, password: 'ResetPassword1' })
  assert.equal(resetLogin.status, 200)

  const newUsername = '13900139000'
  const adminEdited = await call('PUT', `/auth/users/${teacherUser.id}`, { displayName: '管理员修订姓名', phone: newUsername }, adminToken)
  assert.equal(adminEdited.status, 200)
  assert.equal(adminEdited.payload.displayName, '管理员修订姓名')
  assert.equal(adminEdited.payload.teacher.name, '管理员修订姓名')
  assert.equal(adminEdited.payload.username, newUsername)
  assert.equal(adminEdited.payload.teacher.phone, newUsername)
  assert.equal((await call('POST', '/auth/login', { username, password: 'ResetPassword1' })).status, 401)
  assert.equal((await call('POST', '/auth/login', { username: newUsername, password: 'ResetPassword1' })).status, 200)

  assert.equal((await call('PUT', `/teachers/${teacherId}/status`, { status: 'deleted' }, adminToken)).status, 200)
  assert.equal((await call('GET', '/auth/profile', undefined, resetLogin.payload.accessToken)).status, 401)
  assert.equal((await call('POST', '/auth/login', { username: newUsername, password: 'ResetPassword1' })).status, 401)
  assert.equal((await call('PUT', `/teachers/${teacherId}/status`, { status: 'active' }, adminToken)).status, 200)
  assert.equal((await call('POST', '/auth/login', { username: newUsername, password: 'ResetPassword1' })).status, 200)
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: 'invalid' })).status, 401)

  process.stdout.write('isolated account API passed: create, login, permissions, profile, passwords, disable/enable\n')
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
