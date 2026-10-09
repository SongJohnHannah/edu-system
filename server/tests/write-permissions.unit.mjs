import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import pool from '../src/config/database.js'
import * as students from '../src/services/studentService.js'
import * as courses from '../src/services/courseService.js'
import * as trials from '../src/services/trialBookingService.js'
import * as attendance from '../src/services/attendanceService.js'
import teacherRoutes from '../src/routes/teachers.js'
import studentRoutes from '../src/routes/students.js'
import courseRoutes from '../src/routes/courses.js'
import handoverRoutes from '../src/routes/handovers.js'
import backupRoutes from '../src/routes/backup.js'
import { requireRole } from '../src/middleware/rbac.js'

test('teachers may edit admin or own students, but may only archive their own', async t => {
  const original = pool.execute
  let row = { created_by: 'admin', creator_id: null, status: 'active' }
  pool.execute = async sql => {
    if (sql.startsWith('SELECT created_by')) return [[row]]
    if (sql.startsWith('SELECT creator_id')) return [[{ creator_id: row.creator_id }]]
    throw new Error(`unexpected query: ${sql}`)
  }
  t.after(() => { pool.execute = original })

  await students.verifyAccess('s1', 'teacher-a')
  await assert.rejects(students.verifyDeleteAccess('s1', 'teacher-a'), error => error.status === 403)
  row = { created_by: 'teacher', creator_id: 'teacher-a', status: 'active' }
  await students.verifyAccess('s1', 'teacher-a')
  await students.verifyDeleteAccess('s1', 'teacher-a')
  await assert.rejects(students.verifyAccess('s1', 'teacher-b'), error => error.status === 403)
  await assert.rejects(students.verifyDeleteAccess('s1', 'teacher-b'), error => error.status === 403)
  row = { ...row, status: 'deleted' }
  await assert.rejects(students.verifyAccess('s1', 'teacher-a'), error => error.status === 404)
})

test('course ownership is checked before any write', async t => {
  const original = pool.execute
  let row = { teacher_id: 'teacher-a', archived_at: null }
  pool.execute = async sql => {
    if (sql.startsWith('SELECT teacher_id, archived_at')) return [[row]]
    throw new Error(`unexpected query: ${sql}`)
  }
  t.after(() => { pool.execute = original })

  await courses.verifyAccess('c1', 'teacher-a')
  await courses.verifyAccess('c1', null)
  await assert.rejects(courses.verifyAccess('c1', 'teacher-b'), error => error.status === 403)
  row = { ...row, archived_at: new Date() }
  await assert.rejects(courses.verifyAccess('c1', 'teacher-a'), error => error.status === 404)
})

test('another teacher cannot cancel a trial booking and no update is executed', async t => {
  const original = pool.getConnection
  const executed = []
  let rolledBack = false
  let released = false
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      executed.push(sql)
      if (sql.startsWith('SELECT teacher_id, status, booking_date')) return [[{
        teacher_id: 'teacher-a', status: 'active', booking_date: '2099-01-01'
      }]]
      throw new Error(`unexpected query: ${sql}`)
    },
    rollback: async () => { rolledBack = true },
    release: () => { released = true }
  })
  t.after(() => { pool.getConnection = original })

  await assert.rejects(trials.cancel('booking-1', 'teacher-b'), error => error.status === 403)
  assert.equal(executed.length, 1)
  assert.equal(rolledBack, true)
  assert.equal(released, true)
})

test('another teacher cannot reverse attendance and no balance write is executed', async t => {
  const original = pool.getConnection
  const executed = []
  let rolledBack = false
  let released = false
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      executed.push(sql)
      if (sql.startsWith('SELECT * FROM attendance WHERE id')) return [[{
        recorded_by: 'teacher-a', voided_at: null, student_ids: '["student-1"]', hours_deducted: 1
      }]]
      throw new Error(`unexpected query: ${sql}`)
    },
    rollback: async () => { rolledBack = true },
    release: () => { released = true }
  })
  t.after(() => { pool.getConnection = original })

  await assert.rejects(attendance.remove('record-1', 'teacher-b', { username: 'other' }), error => error.status === 403)
  assert.equal(executed.length, 1)
  assert.equal(rolledBack, true)
  assert.equal(released, true)
})

test('HTTP write endpoints reject teacher attempts before reaching the database', async t => {
  const originalExecute = pool.execute
  const originalConnection = pool.getConnection
  let touchedDatabase = false
  pool.execute = async () => { touchedDatabase = true; throw new Error('unexpected database query') }
  pool.getConnection = async () => { touchedDatabase = true; throw new Error('unexpected database connection') }
  t.after(() => { pool.execute = originalExecute; pool.getConnection = originalConnection })

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { role: 'teacher', teacherId: 'teacher-a', username: 'test-teacher' }
    next()
  })
  app.use('/teachers', teacherRoutes)
  app.use('/students', studentRoutes)
  app.use('/courses', courseRoutes)
  app.use('/handovers', handoverRoutes)
  app.use('/backup', requireRole('admin'), backupRoutes)
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => server.close(resolve)))
  await new Promise(resolve => server.once('listening', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  const request = async (method, path, body = {}) => {
    const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) })
    return response.status
  }

  assert.equal(await request('POST', '/teachers'), 403)
  assert.equal(await request('POST', '/students/batch', { students: [null] }), 400)
  assert.equal(await request('PUT', '/teachers/teacher-b'), 403)
  assert.equal(await request('DELETE', '/teachers/teacher-b'), 403)
  assert.equal(await request('GET', '/handovers'), 403)
  assert.equal(await request('POST', '/handovers', { courseId: 'c1', newTeacherId: 'teacher-b' }), 403)
  assert.equal(await request('POST', '/courses', { name: '测试课程', teacherId: 'teacher-b', studentIds: ['student-1'] }), 403)
  assert.equal(await request('GET', '/backup/export'), 403)
  assert.equal(await request('POST', '/backup/import', { data: { tables: { students: [] } } }), 403)
  assert.equal(await request('POST', '/backup/import-sql', { data: 'DELETE FROM students;' }), 403)
  assert.equal(touchedDatabase, false)
})
