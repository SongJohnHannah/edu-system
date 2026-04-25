import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../config/database.js'
import authConfig from '../config/auth.js'
import { generateId } from '../utils/helpers.js'

export async function login(username, password) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
    [username]
  )
  const user = rows[0]
  if (!user) {
    throw new Error('用户名或密码错误')
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    throw new Error('用户名或密码错误')
  }

  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    teacherId: user.teacher_id
  }

  const accessToken = jwt.sign(tokenPayload, authConfig.secret, {
    expiresIn: authConfig.expiresIn
  })

  const refreshToken = jwt.sign(tokenPayload, authConfig.secret, {
    expiresIn: authConfig.refreshExpiresIn
  })

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
  const decoded = jwt.verify(refreshToken, authConfig.secret)
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
    [decoded.id]
  )
  const user = rows[0]
  if (!user) {
    throw new Error('用户不存在或已禁用')
  }

  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    teacherId: user.teacher_id
  }

  const accessToken = jwt.sign(tokenPayload, authConfig.secret, {
    expiresIn: authConfig.expiresIn
  })

  return { accessToken }
}

export async function createUser({ username, password, role, teacherId, displayName, isTest }) {
  const id = generateId()
  const passwordHash = await bcrypt.hash(password, 10)
  await pool.execute(
    'INSERT INTO users (id, username, password_hash, role, teacher_id, display_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, username, passwordHash, role || 'teacher', teacherId || null, displayName || username, isTest ? 1 : 0]
  )
  return { id, username, role: role || 'teacher', displayName: displayName || username }
}

export async function changePassword(userId, oldPassword, newPassword) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId])
  const user = rows[0]
  if (!user) throw new Error('用户不存在')

  const valid = await bcrypt.compare(oldPassword, user.password_hash)
  if (!valid) throw new Error('旧密码错误')

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId])
}

export async function resetPassword(userId, newPassword) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId])
  if (!rows[0]) throw new Error('用户不存在')

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId])
}

export async function getUserProfile(userId) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId])
  const user = rows[0]
  if (!user) throw new Error('用户不存在')

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
    const [teachers] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [user.teacher_id])
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
  const updates = []
  const values = []
  if (displayName !== undefined) {
    updates.push('display_name = ?')
    values.push(displayName)
  }
  if (updates.length === 0) return

  updates.push('updated_at = NOW()')
  values.push(userId)
  await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
}

export async function updateUserByAdmin(userId, { displayName, phone }) {
  const updates = []
  const values = []

  if (displayName !== undefined) {
    updates.push('display_name = ?')
    values.push(displayName)
  }

  if (updates.length > 0) {
    updates.push('updated_at = NOW()')
    values.push(userId)
    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
  }

  // Update teacher phone if teacher_id exists, also sync login username
  const [rows] = await pool.execute('SELECT teacher_id, username FROM users WHERE id = ?', [userId])
  const user = rows[0]
  if (user?.teacher_id && phone !== undefined) {
    await pool.execute('UPDATE teachers SET phone = ? WHERE id = ?', [phone, user.teacher_id])
    // 同步更新登录用户名（联系电话 = 登录账号）
    if (phone && phone !== user.username) {
      const [dupUser] = await pool.execute('SELECT id FROM users WHERE username = ? AND id != ?', [phone, userId])
      if (dupUser.length > 0) throw new Error('该手机号已被其他账号使用')
      await pool.execute('UPDATE users SET username = ? WHERE id = ?', [phone, userId])
    }
  }
}
