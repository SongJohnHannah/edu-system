// Read-only smoke test: no migrations, fixture inserts, or real account login.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pool from '../src/config/database.js'
import { login } from '../src/services/authService.js'

const username = `__probe_${randomUUID()}`
const password = randomUUID()
const url = `http://localhost:${process.env.PORT || 3001}/edusystem/api`

try {
  const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username])
  assert.equal(existing.length, 0, 'Connectivity probe must use a nonexistent user')
  const [tls] = await pool.query("SHOW SESSION STATUS LIKE 'Ssl_version'")
  if (/^(true|1|yes)$/i.test(process.env.DB_SSL || '')) {
    assert.match(tls[0]?.Value || '', /^TLS/, 'Database connection must use TLS')
  }
  await assert.rejects(login(username, password), error => error.status === 401)

  const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10000) })
  assert.equal(health.status, 200, 'Database health endpoint must be available')
  for (let i = 0; i < 3; i++) {
    const response = await fetch(`${url}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(10000)
    })
    assert.equal(response.status, 401, 'Unknown credentials must return 401, not a database error')
    assert.equal((await response.json()).error, '用户名或密码错误')
  }
  console.log(`PASS: database health 200, TLS ${tls[0]?.Value || 'disabled'}, login 401 × 3; no business writes`)
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', name: error.name, code: error.code,
    ...(error.name === 'AssertionError' ? { message: error.message } : {}) }))
  process.exitCode = 1
} finally { await pool.end() }
