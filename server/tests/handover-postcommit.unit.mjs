import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { performHandover } from '../src/services/handoverService.js'

test('a committed handover stays successful if schedule lock release fails', async t => {
  let committed = false
  let destroyed = false
  const course = { id: 'c1', name: '阅读课', teacher_id: 't1', archived_at: null, is_test: 0 }
  const conn = {
    beginTransaction: async () => {},
    commit: async () => { committed = true },
    rollback: async () => {},
    release: () => { throw new Error('unhealthy connection must not return to pool') },
    destroy: () => { destroyed = true },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) throw new Error('connection lost after commit')
      if (sql === 'SELECT * FROM courses WHERE id = ?') return [[course]]
      if (sql.startsWith('SELECT * FROM teachers WHERE id = ? AND status')) return [[{ id: 't2', name: '陈老师' }]]
      if (sql === 'SELECT * FROM teachers WHERE id = ?') return [[{ id: 't1', name: '林老师' }]]
      if (sql.startsWith('SELECT effective_week_start AS boundary')) return [[]]
      if (sql.startsWith('INSERT INTO course_handovers')) return [{ affectedRows: 1 }]
      if (sql.startsWith('UPDATE courses SET teacher_id')) { course.teacher_id = params[0]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('SELECT')) return [[]]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)

  const result = await performHandover({ courseId: 'c1', newTeacherId: 't2', performedBy: '管理员', reason: '工作安排' })
  assert.equal(result.newTeacherId, 't2')
  assert.equal(course.teacher_id, 't2')
  assert.equal(committed, true)
  assert.equal(destroyed, true)
})
