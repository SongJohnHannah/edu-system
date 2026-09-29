import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../src/config/database.js'
import { backupTables, importData, importSQL, splitBackupSQL } from '../src/services/backupService.js'

async function migrationTables(includeFile = () => true) {
  const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')
  const created = new Set()
  for (const file of (await fs.readdir(migrations)).filter(name => /^0\d{2}_.*\.sql$/.test(name) && includeFile(name))) {
    const sql = await fs.readFile(path.join(migrations, file), 'utf8')
    for (const match of sql.matchAll(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_]+)`?\s*\(/gim)) created.add(match[1])
  }
  return created
}

test('backup table list covers every table created by migrations', async () => {
  assert.deepEqual([...backupTables].sort(), [...await migrationTables()].sort())
})

test('SQL backup parser keeps semicolons inside values and rejects DDL', async () => {
  const statements = splitBackupSQL("-- backup\nINSERT INTO settings (`value`) VALUES ('a;b');\nDELETE FROM students;")
  assert.deepEqual(statements, ["INSERT INTO settings (`value`) VALUES ('a;b')", 'DELETE FROM students'])
  await assert.rejects(() => importSQL('DROP TABLE students;'), /仅支持系统备份中的数据语句/)
})

test('incomplete version 5 backups are rejected before connecting to the database', async () => {
  const original = pool.getConnection
  let connections = 0
  pool.getConnection = async () => { connections++; throw new Error('unexpected connection') }
  try {
    await assert.rejects(() => importData({ version: '5.0', data: { tables: { students: [] } } }), /新版备份文件不完整/)
    await assert.rejects(() => importSQL('-- 嘉言思听教务系统 SQL 备份 v5\nDELETE FROM students;'), /新版 SQL 备份文件不完整/)
    assert.equal(connections, 0)
  } finally { pool.getConnection = original }
})

test('older SQL backup clears only missing extension tables before restore', async () => {
  const executed = []
  const original = pool.getConnection
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async sql => { executed.push(sql) },
    query: async sql => { executed.push(sql) },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  })
  try {
    await importSQL('DELETE FROM course_schedule_versions; DELETE FROM courses;')
    for (const table of await migrationTables(file => !file.startsWith('001_'))) {
      if (table !== 'course_schedule_versions') assert.ok(executed.includes(`DELETE FROM ${table}`), `${table} survived old SQL restore`)
    }
    assert.equal(executed.filter(sql => sql === 'DELETE FROM course_schedule_versions').length, 1)
    assert.equal(executed.at(-1), 'DELETE FROM courses')
  } finally { pool.getConnection = original }
})

test('older JSON backup clears missing extension tables in the same transaction', async () => {
  const executed = []
  const original = pool.getConnection
  pool.getConnection = async () => ({
    beginTransaction: async () => { executed.push('BEGIN') },
    execute: async sql => { executed.push(sql); return [[]] },
    commit: async () => { executed.push('COMMIT') },
    rollback: async () => { executed.push('ROLLBACK') },
    release: () => {}
  })
  try {
    await importData({ version: '4.0', data: { tables: { courses: [], course_schedule_versions: [] } } })
    assert.equal(executed[0], 'BEGIN')
    for (const table of await migrationTables(file => !file.startsWith('001_'))) {
      if (table !== 'course_schedule_versions') assert.ok(executed.includes(`DELETE FROM ${table}`), `${table} survived old JSON restore`)
    }
    assert.equal(executed.filter(sql => sql === 'DELETE FROM course_schedule_versions').length, 1)
    assert.deepEqual(executed.filter(sql => sql.startsWith('DELETE FROM ')).slice(-2), ['DELETE FROM course_schedule_versions', 'DELETE FROM courses'])
    assert.equal(executed.at(-1), 'COMMIT')
  } finally { pool.getConnection = original }
})

await pool.end()
