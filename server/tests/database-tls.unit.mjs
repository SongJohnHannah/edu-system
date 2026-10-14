import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let sequence = 0
async function configuration(t, overrides) {
  for (const [name, value] of Object.entries({
    DB_HOST: 'localhost', DB_SSL: 'false', DB_SSL_ALLOW_SELF_SIGNED: 'false', DB_SSL_CA: '',
    ...overrides
  })) {
    const previous = process.env[name]
    process.env[name] = value
    t.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
  }
  const { default: pool } = await import(`../src/config/database.js?tls-test=${++sequence}`)
  t.after(() => pool.end())
  return pool.pool.config.connectionConfig
}

test('explicit TLS enables mysql2 encrypted authentication', async t => {
  const options = await configuration(t, { DB_SSL: 'true' })
  assert.ok(options.ssl, 'TLS must bypass the MariaDB RSA authentication path')
  assert.equal(options.ssl.rejectUnauthorized, true)
  assert.equal(options.ssl.verifyIdentity, true)
})

for (const host of ['localhost', '127.0.0.1', '::1']) {
  test(`local MariaDB automatic certificate is supported at ${host}`, async t => {
    const options = await configuration(t, {
      DB_HOST: host, DB_SSL: 'true', DB_SSL_ALLOW_SELF_SIGNED: 'true'
    })
    assert.ok(options.ssl)
    assert.equal(options.ssl.rejectUnauthorized, false)
  })
}

test('self-signed exception cannot be used for a remote database', async t => {
  await assert.rejects(configuration(t, {
    DB_HOST: 'db.example.com', DB_SSL: 'true', DB_SSL_ALLOW_SELF_SIGNED: 'true'
  }), /仅允许.*本机/)
})

test('CA file is loaded while certificate and host validation stay enabled', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'edu-database-tls-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const certificatePath = join(directory, 'ca.pem')
  await writeFile(certificatePath, 'test-certificate-content')
  const options = await configuration(t, {
    DB_HOST: 'db.example.com', DB_SSL: 'true', DB_SSL_CA: certificatePath
  })
  assert.equal(options.ssl.ca, 'test-certificate-content')
  assert.equal(options.ssl.rejectUnauthorized, true)
  assert.equal(options.ssl.verifyIdentity, true)
})

test('existing databases keep their connection mode unless TLS is configured', async t => {
  const options = await configuration(t, {})
  assert.equal(options.ssl, false)
})
