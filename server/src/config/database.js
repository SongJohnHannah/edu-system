import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'

dotenv.config()

const enabled = value => /^(true|1|yes)$/i.test(value?.trim() || '')

function databaseTls() {
  if (!enabled(process.env.DB_SSL)) return undefined

  const host = (process.env.DB_HOST || 'localhost').toLowerCase()
  const allowSelfSigned = enabled(process.env.DB_SSL_ALLOW_SELF_SIGNED)
  if (allowSelfSigned && !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('DB_SSL_ALLOW_SELF_SIGNED 仅允许连接本机数据库；远程数据库请配置 DB_SSL_CA')
  }

  // MariaDB 11.4+ generates a local certificate on each startup. TLS avoids
  // the crashing RSA password-decryption path in Windows SHA2 authentication.
  return {
    rejectUnauthorized: !allowSelfSigned,
    verifyIdentity: !allowSelfSigned,
    ...(process.env.DB_SSL_CA ? { ca: readFileSync(process.env.DB_SSL_CA, 'utf8') } : {})
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'edu_system',
  ssl: databaseTls(),
  waitForConnections: true,
  connectionLimit: 20,
  connectTimeout: 10000,
  queueLimit: 50,
  charset: 'utf8mb4',
  timezone: '+08:00'
})

export default pool
