import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import pool from '../src/config/database.js'
import { create, update } from '../src/services/teacherService.js'

test('teacher creation returns the one-time password without a post-commit read', async t => {
  let teacherId = null
  let userId = null
  let passwordHash = null
  let committed = false
  const conn = {
    beginTransaction: async () => {},
    commit: async () => { committed = true },
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]]
      if (sql.startsWith('SELECT id FROM teachers WHERE TRIM(name)')) return [[]]
      if (sql.startsWith('INSERT INTO teachers')) { teacherId = params[0]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('INSERT INTO users')) {
        userId = params[0]
        assert.equal(params[4], teacherId)
        passwordHash = params[2]
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('SELECT * FROM teachers WHERE id')) {
        assert.equal(committed, false, 'teacher response must be read before commit')
        return [[{ id: teacherId, name: '林老师', phone: '', subject: '', status: 'active' }]]
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  t.mock.method(pool, 'execute', async () => { throw new Error('post-commit pool read failed') })

  const teacher = await create({ name: ' 林老师 ' })
  assert.equal(teacher.id, teacherId)
  assert.equal(teacher.name, '林老师')
  assert.equal(teacher.username, `teacher_${teacherId}`)
  assert.equal(teacher.userId, userId)
  assert.ok(teacher.defaultPassword)
  assert.equal(await bcrypt.compare(teacher.defaultPassword, passwordHash), true)
  assert.equal(committed, true)
})

test('teacher creation refuses a busy identity lock without writing', async t => {
  let began = false
  let released = false
  const conn = {
    beginTransaction: async () => { began = true },
    rollback: async () => {},
    release: () => { released = true },
    execute: async sql => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 0 }]]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  await assert.rejects(create({ name: '林老师' }), error => error.status === 409 && /稍后重试/.test(error.message))
  assert.equal(began, false)
  assert.equal(released, true)
})

test('teacher fields exceeding database limits fail before opening a transaction', async t => {
  t.mock.method(pool, 'getConnection', async () => { throw new Error('database should not be opened') })
  for (const data of [
    { name: '林'.repeat(101) },
    { name: '林老师', phone: '1'.repeat(21) },
    { name: '林老师', subject: '语'.repeat(101) }
  ]) {
    await assert.rejects(create(data), error => error.status === 400 && /不能超过/.test(error.message))
  }
  for (const data of [
    { name: '林'.repeat(101) },
    { phone: '1'.repeat(21) },
    { subject: '语'.repeat(101) }
  ]) {
    await assert.rejects(update('t1', data), error => error.status === 400 && /不能超过/.test(error.message))
  }
})

test('a committed teacher keeps its success result if lock release fails', async t => {
  let committed = false
  let destroyed = false
  const conn = {
    beginTransaction: async () => {},
    commit: async () => { committed = true },
    rollback: async () => {},
    release: () => { throw new Error('unhealthy connection must not return to pool') },
    destroy: () => { destroyed = true },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) throw new Error('connection lost after commit')
      if (sql.startsWith('SELECT id FROM teachers WHERE TRIM(name)')) return [[]]
      if (sql.startsWith('INSERT INTO teachers') || sql.startsWith('INSERT INTO users')) return [{ affectedRows: 1 }]
      if (sql.startsWith('SELECT * FROM teachers WHERE id')) return [[{ id: params[0], name: '林老师', phone: '', status: 'active' }]]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  const result = await create({ name: '林老师' })
  assert.equal(result.name, '林老师')
  assert.equal(committed, true)
  assert.equal(destroyed, true)
})
