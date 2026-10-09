import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/database.js'
import { addBatch, checkNameExists, create, update } from '../src/services/studentService.js'

test('batch students skip duplicates, keep valid rows, and reject invalid hours before database access', async t => {
  const originalGetConnection = pool.getConnection
  const names = new Set(['已存在'])
  const inserts = []
  const insertSql = []
  let opened = 0
  let commits = 0
  pool.getConnection = async () => {
    opened++
    return {
      beginTransaction: async () => {},
      commit: async () => { commits++ },
      rollback: async () => {},
      release: () => {},
      execute: async (sql, params) => {
        if (sql.includes('GET_LOCK')) {
          assert.match(sql, /edu-system-student-identity/)
          return [[{ acquired: 1 }]]
        }
        if (sql.includes('RELEASE_LOCK')) {
          assert.match(sql, /edu-system-student-identity/)
          return [[]]
        }
        if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) return [names.has(params[0]) ? [{ id: 'existing' }] : []]
        if (sql.startsWith('INSERT INTO students')) {
          insertSql.push(sql)
          inserts.push(params)
          names.add(params[1])
          return [{ affectedRows: 1 }]
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }
  }
  t.after(() => { pool.getConnection = originalGetConnection })

  for (const value of [-1, 0.3, 10000.5, 'bad', Infinity]) {
    await assert.rejects(() => addBatch([{ name: '新生' }], value), error => error.status === 400)
    await assert.rejects(() => create({ name: '新生', totalHours: value }), error => error.status === 400)
  }
  for (const enrollmentStage of [null, '', 'unknown', '待报名']) {
    await assert.rejects(() => create({ name: '新生', enrollmentStage }), error => error.status === 400 && /报名阶段/.test(error.message))
    await assert.rejects(() => addBatch([{ name: '新生', enrollmentStage }], 1), error => error.status === 400 && /报名阶段/.test(error.message))
  }
  await assert.rejects(() => addBatch([{ name: '新生', totalHours: 0.3 }], 1), error => error.status === 400)
  await assert.rejects(() => addBatch([], 1), error => error.status === 400)
  for (const payload of [{ name: '学'.repeat(101) }, { name: '新生', phone: '1'.repeat(21) }, { name: '新生', age: 0 }, { name: '新生', age: 101 }, { name: '新生', age: 1.5 }, { name: '新生', age: 'bad' }]) {
    await assert.rejects(() => create(payload), error => error.status === 400)
    await assert.rejects(() => addBatch([payload], 1), error => error.status === 400)
  }
  assert.equal(opened, 0)

  const result = await addBatch([
    { name: '已存在' }, { name: ' 新生 ', enrollmentStage: 'pending', classId: 'retired-feature' }, { name: '新生' }
  ], 1.5, 'teacher', 't1')
  assert.deepEqual(result, { addedCount: 1, skipped: ['已存在', '新生'] })
  assert.equal(opened, 1)
  assert.equal(commits, 1)
  assert.equal(inserts.length, 1)
  assert.doesNotMatch(insertSql[0], /class_id/)
  assert.equal(inserts[0][1], '新生')
  assert.equal(inserts[0][5], 1.5)
  assert.equal(inserts[0][6], 'teacher')
  assert.equal(inserts[0][7], 't1')
  assert.equal(inserts[0][9], 'pending')
})

test('single and batch student creation serialize duplicate checks before writing', async t => {
  const originalGetConnection = pool.getConnection
  t.after(() => { pool.getConnection = originalGetConnection })
  const students = new Map()
  const waiting = []
  let held = false
  let inserts = 0
  let releases = 0
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) {
        assert.match(sql, /edu-system-student-identity/)
        if (held) await new Promise(resolve => waiting.push(resolve))
        held = true
        return [[{ acquired: 1 }]]
      }
      if (sql.includes('RELEASE_LOCK')) {
        assert.match(sql, /edu-system-student-identity/)
        held = false
        releases++
        waiting.shift()?.()
        return [[]]
      }
      if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) {
        await new Promise(resolve => setTimeout(resolve, 1))
        const row = students.get(params[0])
        return [row ? [{ id: row.id }] : []]
      }
      if (sql.startsWith('INSERT INTO students')) {
        inserts++
        const row = { id: params[0], name: params[1], total_hours: params[5], used_hours: 0 }
        students.set(row.name, row)
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('SELECT * FROM students WHERE id =')) {
        return [[...students.values()].filter(row => row.id === params[0])]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  })

  const attempts = await Promise.allSettled([
    create({ name: '同名学生', totalHours: 1 }),
    addBatch([{ name: '同名学生' }], 1)
  ])
  assert.equal(inserts, 1)
  assert.equal(students.size, 1)
  assert.equal(releases, 2)
  assert.ok(attempts.some(result => result.status === 'fulfilled'))
  assert.ok(attempts.some(result => result.status === 'rejected' || result.value.skipped?.includes('同名学生')))
})

test('student creation refuses a busy identity lock without inserting data', async t => {
  const originalGetConnection = pool.getConnection
  t.after(() => { pool.getConnection = originalGetConnection })
  let began = false
  let inserted = false
  let released = false
  pool.getConnection = async () => ({
    beginTransaction: async () => { began = true },
    rollback: async () => {},
    release: () => { released = true },
    execute: async sql => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 0 }]]
      inserted = true
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  })
  await assert.rejects(() => create({ name: '新生' }), error => error.status === 409 && /稍后重试/.test(error.message))
  assert.equal(began, false)
  assert.equal(inserted, false)
  assert.equal(released, true)
})

test('a committed student write keeps its success result if lock release fails', async t => {
  const originalGetConnection = pool.getConnection
  t.after(() => { pool.getConnection = originalGetConnection })
  for (const write of [() => create({ name: '新生' }), () => addBatch([{ name: '新生' }], 0)]) {
    let committed = false
    let destroyed = false
    let returnedToPool = false
    pool.getConnection = async () => ({
      beginTransaction: async () => {},
      commit: async () => { committed = true },
      rollback: async () => {},
      release: () => { returnedToPool = true },
      destroy: () => { destroyed = true },
      execute: async (sql, params = []) => {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
        if (sql.includes('RELEASE_LOCK')) throw new Error('connection lost after commit')
        if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) return [[]]
        if (sql.startsWith('INSERT INTO students')) return [{ affectedRows: 1 }]
        if (sql.startsWith('SELECT * FROM students WHERE id =')) return [[{ id: params[0], name: '新生', total_hours: 0, used_hours: 0 }]]
        throw new Error(`Unexpected SQL: ${sql}`)
      }
    })
    const result = await write()
    assert.equal(committed, true)
    assert.equal(destroyed, true)
    assert.equal(returnedToPool, false)
    assert.ok(result.id || result.addedCount === 1)
  }
})

test('student phone checks trim input and detect legacy numbers with surrounding spaces', async t => {
  const originalGetConnection = pool.getConnection
  t.after(() => { pool.getConnection = originalGetConnection })
  const rows = [
    { id: 'legacy', name: '旧生', phone: ' 13800138000 ', status: 'active', enrollment_stage: 'enrolled', total_hours: 0, used_hours: 0 },
    { id: 'editable', name: '可编辑', phone: '', status: 'active', enrollment_stage: 'enrolled', total_hours: 0, used_hours: 0 }
  ]
  const phoneQueries = []
  pool.getConnection = async () => ({
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.includes('RELEASE_LOCK')) return [[]]
      if (sql.startsWith('SELECT * FROM students WHERE id =')) return [rows.filter(row => row.id === params[0])]
      if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) return [rows.filter(row => row.name.trim() === params[0] && (!params[1] || row.id !== params[1]))]
      if (sql.startsWith('SELECT id FROM students WHERE phone =') || sql.startsWith('SELECT id FROM students WHERE TRIM(phone) =')) {
        phoneQueries.push({ sql, params })
        return [rows.filter(row => (sql.includes('TRIM(phone)') ? row.phone.trim() : row.phone) === params[0] && (!params[1] || row.id !== params[1]))]
      }
      if (sql.startsWith('INSERT INTO students')) {
        rows.push({ id: params[0], name: params[1], phone: params[2], total_hours: params[5], used_hours: 0 })
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('UPDATE students SET name =')) {
        Object.assign(rows.find(row => row.id === params[6]), { name: params[0], phone: params[1] })
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  })

  await assert.rejects(() => create({ name: '重复号码', phone: '13800138000' }), /手机号已被其他学生使用/)
  assert.deepEqual(await addBatch([{ name: '批量重复号码', phone: ' 13800138000 ' }], 0), { addedCount: 0, skipped: ['批量重复号码'] })
  await assert.rejects(() => update('editable', { phone: ' 13800138000 ' }), /手机号已被其他学生使用/)
  assert.equal((await create({ name: '新生', phone: ' 13900139000 ' })).phone, '13900139000')
  assert.deepEqual(await addBatch([{ name: '批量新生', phone: ' 13700137000 ' }], 0), { addedCount: 1, skipped: [] })
  assert.equal(rows.find(row => row.name === '批量新生').phone, '13700137000')
  assert.equal((await update('editable', { phone: ' 13600136000 ' })).phone, '13600136000')
  assert.ok(phoneQueries.every(({ sql }) => sql.includes('TRIM(phone)')))
  assert.ok(phoneQueries.some(({ params }) => params[0] === '13800138000'))
})

test('student name preview and writes agree for legacy names with surrounding spaces', async t => {
  const originalExecute = pool.execute
  const originalGetConnection = pool.getConnection
  t.after(() => { pool.execute = originalExecute; pool.getConnection = originalGetConnection })
  const rows = [
    { id: 'legacy', name: ' 旧生 ', phone: '', status: 'active', enrollment_stage: 'enrolled', total_hours: 0, used_hours: 0 },
    { id: 'editable', name: '可编辑', phone: '', status: 'active', enrollment_stage: 'enrolled', total_hours: 0, used_hours: 0 }
  ]
  const execute = async (sql, params = []) => {
    if (sql.includes('GET_LOCK') || sql.includes('RELEASE_LOCK')) return [[{ acquired: 1 }]]
    if (sql.startsWith('SELECT * FROM students WHERE id =')) return [rows.filter(row => row.id === params[0])]
    if (sql.startsWith('SELECT id FROM students WHERE TRIM(name) =')) {
      return [rows.filter(row => row.name.trim() === params[0] && (!params[1] || row.id !== params[1])).map(row => ({ id: row.id }))]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  pool.execute = execute
  pool.getConnection = async () => ({ execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} })
  assert.equal(await checkNameExists(' 旧生 '), true)
  assert.equal(await checkNameExists('旧生', 'legacy'), false)
  assert.equal(await checkNameExists('  '), false)
  await assert.rejects(() => create({ name: '旧生' }), error => error.status === 409)
  await assert.rejects(() => update('editable', { name: ' 旧生 ' }), error => error.status === 409)
  assert.deepEqual(await addBatch([{ name: '旧生' }], 0), { addedCount: 0, skipped: ['旧生'] })
})
