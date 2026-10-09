import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import pool from '../src/config/database.js'
import studentRoutes from '../src/routes/students.js'

test('archived student recovery preserves data and enforces archive ownership through HTTP', async t => {
  const original = { getConnection: pool.getConnection, execute: pool.execute }
  let rows
  let writes
  let failReadBack = false
  const initialRows = () => Object.fromEntries([
    ['admin', 'admin', null, 'enrolled'], ['own', 'teacher', 't1', 'pending'], ['other', 'teacher', 't2', 'enrolled']
  ].map(([id, created_by, creator_id, enrollment_stage]) => [id, {
    id, name: `归档学生 ${id}`, phone: '13600000001', age: 10, remark: '原备注', status: 'deleted',
    created_by, creator_id, enrollment_stage, total_hours: 20, used_hours: 3.5, class_id: 'legacy-class',
    created_at: '2026-10-01 08:00:00', updated_at: '2026-10-02 08:00:00'
  }]))
  pool.getConnection = async () => {
    let transaction
    return {
      beginTransaction: async () => { transaction = structuredClone(rows) },
      commit: async () => { rows = transaction },
      rollback: async () => {}, release: () => {},
      execute: async (sql, params = []) => {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
        if (sql.includes('RELEASE_LOCK')) return [[]]
        if (sql.startsWith('SELECT * FROM students WHERE id')) {
          if (failReadBack && !sql.includes('FOR UPDATE')) throw new Error('模拟数据库读取失败')
          return [transaction[params[0]] ? [{ ...transaction[params[0]] }] : []]
        }
        if (sql === "UPDATE students SET status = 'active' WHERE id = ?") {
          writes.push(sql)
          transaction[params[0]].status = 'active'
          return [{ affectedRows: 1 }]
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }
  }
  pool.execute = async (sql, params = []) => {
    if (sql.startsWith('SELECT created_by, creator_id, status FROM students')) return [rows[params[0]] ? [rows[params[0]]] : []]
    throw new Error(`Unexpected pool SQL: ${sql}`)
  }
  t.after(() => Object.assign(pool, original))
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = req.headers['x-role'] ? { role: req.headers['x-role'], teacherId: req.headers['x-teacher'] } : null
    next()
  })
  app.use('/students', studentRoutes)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => server.close(resolve)))
  await new Promise(resolve => server.once('listening', resolve))
  const request = (id, role, teacher = '', method = 'POST', suffix = 'restore', body = {}) => fetch(
    `http://127.0.0.1:${server.address().port}/students/${id}/${suffix}`, {
      method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-role': role } : {}), ...(teacher ? { 'x-teacher': teacher } : {}) },
      body: JSON.stringify(body)
    })
  for (const [id, role, teacher, status] of [
    ['admin', 'admin', '', 200], ['other', 'admin', '', 200], ['own', 'teacher', 't1', 200],
    ['admin', 'teacher', 't1', 403], ['other', 'teacher', 't1', 403], ['own', 'teacher', '', 403],
    ['missing', 'admin', '', 404], ['own', '', '', 401], ['own', 'student', '', 403]
  ]) {
    await t.test(`${role || 'anonymous'} ${teacher} restores ${id}: ${status}`, async () => {
      rows = initialRows(); writes = []
      const before = structuredClone(rows)
      const response = await request(id, role, teacher)
      assert.equal(response.status, status)
      if (status === 200) {
        const restored = await response.json()
        assert.equal(restored.status, 'active')
        assert.equal(restored.totalHours, 20)
        assert.equal(restored.usedHours, 3.5)
        assert.equal(restored.enrollmentStage, before[id].enrollment_stage)
        before[id].status = 'active'
      }
      assert.deepEqual(rows, before)
      assert.equal(writes.length, status === 200 ? 1 : 0)
    })
  }
  for (const status of ['active', 'quit']) {
    rows = initialRows(); rows.own.status = status; writes = []
    assert.equal((await request('own', 'admin')).status, 400)
    assert.equal(rows.own.status, status)
    assert.equal(writes.length, 0)
  }
  rows = initialRows(); writes = []
  assert.equal((await request('own', 'teacher', 't1', 'PUT', 'status', { status: 'active' })).status, 404)
  assert.equal((await request('own', 'teacher', 't1', 'POST', 'add-hours', { hours: 1 })).status, 404)
  assert.equal(writes.length, 0)
  const before = structuredClone(rows)
  failReadBack = true
  assert.equal((await request('own', 'admin')).status, 500)
  assert.deepEqual(rows, before, '恢复失败必须回滚学生状态')
})
