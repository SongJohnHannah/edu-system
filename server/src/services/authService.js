import { createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../config/database.js'
import { acquireTeacherIdentityLock, closeTeacherIdentityConnection } from './teacherIdentityLock.js'
import authConfig from '../config/auth.js'
import { generateId } from '../utils/helpers.js'

export const credentialVersion = user => createHmac('sha256', authConfig.secret).update(user.password_hash).digest('hex')
const tokenPayload = user => ({ id: user.id, username: user.username, role: user.role, teacherId: user.teacher_id, credential: credentialVersion(user) })

export async function login(username, password) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
    [username]
  )
  const user = rows[0]
  if (!user) {
    throw Object.assign(new Error('用户名或密码错误'), { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    throw Object.assign(new Error('用户名或密码错误'), { status: 401 })
  }

  const accessToken = jwt.sign({ ...tokenPayload(user), kind: 'access' }, authConfig.secret, { expiresIn: authConfig.expiresIn })
  const refreshToken = jwt.sign({ ...tokenPayload(user), kind: 'refresh' }, authConfig.secret, { expiresIn: authConfig.refreshExpiresIn })

  await pool.execute(
    'UPDATE users SET last_login = NOW() WHERE id = ?',
    [user.id]
  )

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      teacherId: user.teacher_id
    }
  }
}

export async function refreshAccessToken(refreshToken) {
  let decoded
  try { decoded = jwt.verify(refreshToken, authConfig.secret) }
  catch { throw Object.assign(new Error('刷新凭证无效或已过期'), { status: 401 }) }
  if (decoded.kind !== 'refresh') throw Object.assign(new Error('无效的刷新凭证'), { status: 401 })
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
    [decoded.id]
  )
  const user = rows[0]
  if (!user || decoded.credential !== credentialVersion(user)) {
    throw Object.assign(new Error('登录已失效，请重新登录'), { status: 401 })
  }

  const accessToken = jwt.sign({ ...tokenPayload(user), kind: 'access' }, authConfig.secret, { expiresIn: authConfig.expiresIn })

  return { accessToken }
}

export async function createUser({ username, password, role, teacherId, displayName, isTest }, conn = pool) {
  const id = generateId()
  const passwordHash = await bcrypt.hash(password, 10)
  await conn.execute(
    'INSERT INTO users (id, username, password_hash, role, teacher_id, display_name) VALUES (?, ?, ?, ?, ?, ?)',
    [id, username, passwordHash, role || 'teacher', teacherId || null, displayName || username]
  )
  return { id, username, role: role || 'teacher', displayName: displayName || username }
}

export async function changePassword(userId, oldPassword, newPassword) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId])
  const user = rows[0]
  if (!user) throw Object.assign(new Error('用户不存在'), { status: 404 })

  const valid = await bcrypt.compare(oldPassword, user.password_hash)
  if (!valid) throw Object.assign(new Error('旧密码错误'), { status: 400 })

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId])
}

export async function resetPassword(userId, newPassword) {
  const [rows] = await pool.execute('SELECT id, role FROM users WHERE id = ?', [userId])
  if (!rows[0]) throw Object.assign(new Error('用户不存在'), { status: 404 })
  if (rows[0].role !== 'teacher') throw Object.assign(new Error('只能重置教师账号密码'), { status: 403 })

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId])
}

export async function getUserProfile(userId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId])
  const user = rows[0]
  if (!user) throw Object.assign(new Error('用户不存在'), { status: 404 })

  const profile = {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    teacherId: user.teacher_id,
    isActive: user.is_active,
    createdAt: user.created_at
  }

  if (user.teacher_id) {
    const [teachers] = await db.execute('SELECT * FROM teachers WHERE id = ?', [user.teacher_id])
    if (teachers[0]) {
      profile.teacher = {
        id: teachers[0].id,
        name: teachers[0].name,
        phone: teachers[0].phone,
        subject: teachers[0].subject
      }
    }
  }

  return profile
}

export async function updateProfile(userId, { displayName }) {
  return updateUserByAdmin(userId, { displayName })
}

export async function updateUserByAdmin(userId, { displayName, phone }, { teacherOnly = false } = {}) {
  const conn = await pool.getConnection()
  let identityLocked = false
  try {
    await acquireTeacherIdentityLock(conn)
    identityLocked = true
    await conn.beginTransaction()
    const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId])
    const user = rows[0]
    if (!user) throw Object.assign(new Error('账号不存在'), { status: 404 })
    if (teacherOnly && user.role !== 'teacher') throw Object.assign(new Error('只能编辑教师账号'), { status: 403 })
    if (displayName !== undefined) {
      displayName = String(displayName).trim()
      if (!displayName) throw Object.assign(new Error('姓名不能为空'), { status: 400 })
      if ([...displayName].length > 100) throw Object.assign(new Error('姓名不能超过100个字符'), { status: 400 })
      if (user.teacher_id) {
        const [duplicates] = await conn.execute('SELECT id FROM teachers WHERE TRIM(name) = ? AND id != ?', [displayName, user.teacher_id])
        if (duplicates.length) throw Object.assign(new Error('教师姓名已存在'), { status: 409 })
        await conn.execute('UPDATE teachers SET name = ? WHERE id = ?', [displayName, user.teacher_id])
      }
      await conn.execute('UPDATE users SET display_name = ? WHERE id = ?', [displayName, userId])
    }
    if (phone !== undefined && user.teacher_id) {
      phone = String(phone).trim()
      if ([...phone].length > 20) throw Object.assign(new Error('手机号不能超过20个字符'), { status: 400 })
      const [duplicates] = await conn.execute('SELECT id FROM users WHERE TRIM(username) = ? AND id != ?', [phone, userId])
      const [teachers] = await conn.execute('SELECT id FROM teachers WHERE TRIM(phone) = ? AND id != ? AND TRIM(phone) != ""', [phone, user.teacher_id])
      if (duplicates.length || teachers.length) throw Object.assign(new Error('该手机号已被其他账号使用'), { status: 409 })
      await conn.execute('UPDATE teachers SET phone = ? WHERE id = ?', [phone, user.teacher_id])
      if (phone) await conn.execute('UPDATE users SET username = ? WHERE id = ?', [phone, userId])
    }
    const profile = await getUserProfile(userId, conn)
    await conn.commit()
    return profile
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeTeacherIdentityConnection(conn, identityLocked) }
}
