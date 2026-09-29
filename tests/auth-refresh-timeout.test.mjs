import test from 'node:test'
import assert from 'node:assert/strict'

test('a stalled token refresh times out and a later refresh can retry', async () => {
  const values = new Map([['refresh_token', 'test-refresh-token']])
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }

  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let timerCount = 0
  let clearedCount = 0
  let requestCount = 0
  let abortCount = 0
  globalThis.setTimeout = callback => {
    timerCount++
    queueMicrotask(callback)
    return timerCount
  }
  globalThis.clearTimeout = () => { clearedCount++ }
  globalThis.fetch = (url, options) => {
    assert.equal(url, '/edusystem/api/auth/refresh')
    requestCount++
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        abortCount++
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }

  try {
    const { api } = await import('../src/utils/api.js')
    assert.equal(await api.tryRefresh(), false)
    assert.equal(await api.tryRefresh(), false)
    assert.equal(requestCount, 2)
    assert.equal(abortCount, 2)
    assert.equal(clearedCount, 2)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    delete globalThis.fetch
    delete globalThis.localStorage
  }
})
