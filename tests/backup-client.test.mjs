import test from 'node:test'
import assert from 'node:assert/strict'
import { importData } from '../src/utils/storage.api.js'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
const originalWindow = globalThis.window

test.after(() => {
  globalThis.fetch = originalFetch
  globalThis.localStorage = originalStorage
  globalThis.window = originalWindow
})

test.beforeEach(() => {
  globalThis.localStorage = { getItem: key => key === 'access_token' ? 'backup-test' : null }
  globalThis.window = { dispatchEvent: () => {} }
})

test('imports SQL without a leading comment and keeps its statements', async () => {
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ success: true }) }
  }
  const sql = "DELETE FROM students; INSERT INTO students (`id`) VALUES ('student-1');"
  assert.equal((await importData(sql)).success, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/edusystem/api/backup/import-sql')
  assert.equal(requests[0].options.body, sql)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer backup-test')
})

test('imports a JSON backup with a UTF-8 BOM', async () => {
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ success: true }) }
  }
  const backup = { data: { tables: { students: [] } } }
  assert.equal((await importData(`\uFEFF  ${JSON.stringify(backup)}`)).success, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/edusystem/api/backup/import')
  assert.deepEqual(JSON.parse(requests[0].options.body), backup)
})

test('returns a failed result for rejected SQL without claiming success', async () => {
  globalThis.fetch = async () => ({
    ok: false, status: 400,
    json: async () => ({ error: '仅支持系统备份中的数据语句' })
  })
  const result = await importData('DROP TABLE students;')
  assert.deepEqual(result, { success: false, message: '仅支持系统备份中的数据语句' })
})
