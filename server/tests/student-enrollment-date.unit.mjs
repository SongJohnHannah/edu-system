import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { addBatch, create, getAll, update } from '../src/services/studentService.js'

test('enrollment dates round-trip, preserve on partial edits, clear, and reject invalid dates', async t => {
  const originalGetConnection = pool.getConnection
  const originalExecute = pool.execute
  const students = new Map()
  let commits = 0
  const execute = async (sql, params = []) => {
    if (sql.includes('GET_LOCK') || sql.includes('RELEASE_LOCK')) return [[{ acquired: 1 }]]
    if (sql.startsWith('SELECT id FROM students WHERE')) return [[]]
    if (sql.startsWith('INSERT INTO students')) {
      const row = {
        id: params[0], name: params[1], phone: params[2], age: params[3], remark: params[4],
        total_hours: params[5], used_hours: 0, status: 'active', created_by: params[6],
        creator_id: params[7], is_test: params[8], enrollment_stage: params[9], enrollment_date: params[10]
      }
      students.set(row.id, row)
      return [{ affectedRows: 1 }]
    }
    if (sql.startsWith('SELECT * FROM students WHERE')) return [[{ ...students.get(params[0]) }]]
    if (sql.startsWith('SELECT * FROM students ORDER')) return [[...students.values()]]
    if (sql.startsWith('UPDATE students SET name')) {
      Object.assign(students.get(params.at(-1)), {
        name: params[0], phone: params[1], age: params[2], remark: params[3],
        status: params[4], enrollment_stage: params[5], enrollment_date: params[6]
      })
      return [{ affectedRows: 1 }]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  pool.execute = execute
  pool.getConnection = async () => ({
    execute, beginTransaction: async () => {}, commit: async () => { commits++ },
    rollback: async () => {}, release: () => {}
  })
  t.after(async () => {
    pool.getConnection = originalGetConnection
    pool.execute = originalExecute
    await pool.end()
  })

  const student = await create({ name: '入学日期测试', enrollmentDate: '2024-02-29' })
  assert.equal(student.enrollmentDate, '2024-02-29')
  assert.equal((await update(student.id, { remark: '只修改备注' })).enrollmentDate, '2024-02-29')
  assert.equal((await update(student.id, { enrollmentDate: '1999-09-01' })).enrollmentDate, '1999-09-01')
  assert.equal((await update(student.id, { enrollmentDate: '2035-09-01' })).enrollmentDate, '2035-09-01')
  for (const enrollmentDate of ['', null]) {
    assert.equal((await update(student.id, { enrollmentDate })).enrollmentDate, null)
  }
  assert.equal((await create({ name: '未填写入学时间' })).enrollmentDate, null)
  await addBatch([{ name: '批量日期', enrollmentDate: '2020-09-01' }], 0)
  assert.equal((await getAll()).find(item => item.name === '批量日期').enrollmentDate, '2020-09-01')

  const beforeInvalid = commits
  for (const enrollmentDate of ['2025-02-29', '2024-02-30', '2024-04-31', '2024-13-01', '2024-00-01', '2024-1-1', '0000-01-01', '2024-01-01T00:00:00Z', 123, {}, 'abc']) {
    const badDate = error => error.status === 400 && /入学时间/.test(error.message)
    await assert.rejects(() => create({ name: '无效日期', enrollmentDate }), badDate)
    await assert.rejects(() => update(student.id, { enrollmentDate }), badDate)
    await assert.rejects(() => addBatch([{ name: '批量无效日期', enrollmentDate }], 0), badDate)
  }
  assert.equal(commits, beforeInvalid, 'invalid dates must never commit')
  assert.equal((await getAll()).find(item => item.id === student.id).enrollmentDate, null)
})
