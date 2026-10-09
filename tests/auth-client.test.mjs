import test from 'node:test'
import assert from 'node:assert/strict'

test('a failed login shows its own error without attempting to refresh an older session', async () => {
  const values = new Map([['refresh_token', 'stale-token']])
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }
  globalThis.window = { dispatchEvent() {}, location: { pathname: '/login', href: '/login' } }
  globalThis.Event = class Event { constructor(type) { this.type = type } }
  const requests = []
  globalThis.fetch = async url => {
    requests.push(url)
    return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { api } = await import('../src/utils/api.js')
  await assert.rejects(api.post('/auth/login', { username: 'wrong', password: 'wrong' }), error =>
    error.status === 401 && error.message === '用户名或密码错误')
  assert.deepEqual(requests, ['/edusystem/api/auth/login'])
  assert.equal(values.has('refresh_token'), false)
})
