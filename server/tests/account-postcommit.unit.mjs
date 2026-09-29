import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { updateProfile, updateUserByAdmin } from '../src/services/authService.js'

for (const actor of ['self', 'admin']) {
  test(`${actor} profile edit returns synchronized account and teacher data before commit`, async t => {
    const user = { id: 'u1', username: 'old-phone', role: 'teacher', teacher_id: 't1', display_name: '旧姓名', is_active: 1 }
    const teacher = { id: 't1', name: '旧姓名', phone: 'old-phone', subject: '语文' }
    let committed = false
    const conn = {
      beginTransaction: async () => {},
      commit: async () => { committed = true },
      rollback: async () => {},
      release: () => {},
      execute: async (sql, params = []) => {
        if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
        if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]]
        if (committed) throw new Error('response query ran after commit')
        if (sql === 'SELECT * FROM users WHERE id = ? FOR UPDATE') return [[user]]
        if (sql.startsWith('SELECT id FROM teachers WHERE TRIM(name) =')) return [[]]
        if (sql.startsWith('SELECT id FROM users WHERE TRIM(username) =')) return [[]]
        if (sql.startsWith('SELECT id FROM teachers WHERE TRIM(phone) =')) return [[]]
        if (sql.startsWith('UPDATE teachers SET name =')) { teacher.name = params[0]; return [{ affectedRows: 1 }] }
        if (sql.startsWith('UPDATE users SET display_name =')) { user.display_name = params[0]; return [{ affectedRows: 1 }] }
        if (sql.startsWith('UPDATE teachers SET phone =')) { teacher.phone = params[0]; return [{ affectedRows: 1 }] }
        if (sql.startsWith('UPDATE users SET username =')) { user.username = params[0]; return [{ affectedRows: 1 }] }
        if (sql === 'SELECT * FROM users WHERE id = ?') return [[user]]
        if (sql === 'SELECT * FROM teachers WHERE id = ?') return [[teacher]]
        throw new Error(`unexpected query: ${sql}`)
      }
    }
    t.mock.method(pool, 'getConnection', async () => conn)
    t.mock.method(pool, 'execute', async () => { throw new Error('post-commit pool read failed') })

    const profile = actor === 'self'
      ? await updateProfile('u1', { displayName: ' 新姓名 ' })
      : await updateUserByAdmin('u1', { displayName: ' 新姓名 ', phone: 'new-phone' }, { teacherOnly: true })
    assert.equal(profile.displayName, '新姓名')
    assert.equal(profile.teacher.name, '新姓名')
    assert.equal(profile.username, actor === 'admin' ? 'new-phone' : 'old-phone')
    assert.equal(profile.teacher.phone, actor === 'admin' ? 'new-phone' : 'old-phone')
    assert.equal(committed, true)
  })
}

test('profile and teacher account reject overlong fields without writing', async t => {
  let writes = 0
  const conn = {
    beginTransaction: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async sql => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]]
      if (sql === 'SELECT * FROM users WHERE id = ? FOR UPDATE') return [[{ id: 'u1', role: 'teacher', teacher_id: 't1' }]]
      if (sql.startsWith('UPDATE ')) { writes++; return [{ affectedRows: 1 }] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  await assert.rejects(updateProfile('u1', { displayName: '林'.repeat(101) }), error => error.status === 400 && /100/.test(error.message))
  await assert.rejects(updateUserByAdmin('u1', { phone: '1'.repeat(21) }, { teacherOnly: true }), error => error.status === 400 && /20/.test(error.message))
  assert.equal(writes, 0)
})
