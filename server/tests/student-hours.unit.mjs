import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { addHours, subtractHours } from '../src/services/studentService.js'

test('manual hour adjustments reject invalid values before opening a transaction', async t => {
  const original = pool.getConnection
  let opened = false
  pool.getConnection = async () => { opened = true; throw new Error('unexpected database connection') }
  t.after(() => { pool.getConnection = original })

  for (const value of [null, 0, -1, 0.3, 1.25, 10000.5, NaN, Infinity, 'bad']) {
    await assert.rejects(addHours('s1', value, '', 'test'), error => error.status === 400)
    await assert.rejects(subtractHours('s1', value, '', 'test'), error => error.status === 400)
  }
  assert.equal(opened, false)
})
test('hour adjustments recheck archived and cross-teacher students inside the transaction', async t => {
  const original = pool.getConnection
  t.after(() => { pool.getConnection = original })
  for (const [student, expectedStatus] of [
    [undefined, 404],
    [{ status: 'deleted', created_by: 'teacher', creator_id: 't1' }, 404],
    [{ status: 'active', created_by: 'teacher', creator_id: 't2' }, 403]
  ]) {
    for (const adjust of [addHours, subtractHours]) {
      const queries = []
      let rolledBack = false
      let released = false
      pool.getConnection = async () => ({
        beginTransaction: async () => {},
        execute: async (sql) => {
          queries.push(sql)
          return [[...(student ? [student] : [])]]
        },
        commit: async () => { throw new Error('unexpected commit') },
        rollback: async () => { rolledBack = true },
        release: () => { released = true }
      })
      await assert.rejects(adjust('s1', 1, '', 'test', 't1'), error => error.status === expectedStatus)
      assert.deepEqual(queries, ['SELECT created_by, creator_id, status FROM students WHERE id = ? FOR UPDATE'])
      assert.equal(rolledBack, true)
      assert.equal(released, true)
    }
  }
})
