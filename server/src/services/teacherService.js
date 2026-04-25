import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import * as authService from './authService.js'
import { formatDateTime } from '../utils/dateFormat.js'

function formatTeacher(row) {
  return {
    ...row,
    isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM teachers ORDER BY created_at DESC')
    return enrichTeachersWithUserId(rows.map(formatTeacher))
  }
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [teacherScope])
  return enrichTeachersWithUserId(rows.map(formatTeacher))
}

async function enrichTeachersWithUserId(teachers) {
  if (teachers.length === 0) return teachers
  const [users] = await pool.execute('SELECT id, teacher_id FROM users WHERE teacher_id IS NOT NULL')
  const userMap = new Map(users.map(u => [u.teacher_id, u.id]))
  return teachers.map(t => {
    if (userMap.has(t.id)) {
      t.userId = userMap.get(t.id)
    }
    return t
  })
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  return rows[0] ? formatTeacher(rows[0]) : null
}

const DEFAULT_PASSWORD = '123456'

export async function create(data) {
  // 检查重名
  const [existing] = await pool.execute('SELECT id FROM teachers WHERE name = ?', [data.name])
  if (existing.length > 0) throw new Error('教师姓名已存在')

  // 检查手机号重复
  if (data.phone) {
    const [phoneCheck] = await pool.execute('SELECT id FROM teachers WHERE phone = ? AND id != ?', [data.phone, ''])
    if (phoneCheck.length > 0) throw new Error('该手机号已被其他教师使用')
  }

  const id = generateId()
  await pool.execute(
    'INSERT INTO teachers (id, name, phone, subject, remark, is_test) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.name, data.phone || '', data.subject || '', data.remark || '', data.isTest ? 1 : 0]
  )

  // 同时创建关联的 user 账号
  const username = data.phone || `teacher_${id}`
  const isTest = !!data.isTest
  try {
    await authService.createUser({
      username,
      password: DEFAULT_PASSWORD,
      role: 'teacher',
      teacherId: id,
      displayName: data.name,
      isTest
    })
  } catch (err) {
    // 用户名可能重复（手机号已存在），用备用用户名
    if (err.message?.includes('Duplicate')) {
      await authService.createUser({
        username: `teacher_${id}`,
        password: DEFAULT_PASSWORD,
        role: 'teacher',
        teacherId: id,
        displayName: data.name,
        isTest
      })
    } else {
      throw err
    }
  }

  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  const teacher = formatTeacher(rows[0])
  return { ...teacher, defaultPassword: DEFAULT_PASSWORD, username }
}

export async function update(id, data) {
  const [existing] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  if (existing.length === 0) throw new Error('教师不存在')

  // 检查重名（排除自身）
  if (data.name) {
    const [dup] = await pool.execute('SELECT id FROM teachers WHERE name = ? AND id != ?', [data.name, id])
    if (dup.length > 0) throw new Error('教师姓名已存在')
  }

  // 检查手机号重复（排除自身）
  if (data.phone) {
    const [phoneDup] = await pool.execute('SELECT id FROM teachers WHERE phone = ? AND id != ?', [data.phone, id])
    if (phoneDup.length > 0) throw new Error('该手机号已被其他教师使用')
  }

  const t = existing[0]
  const newPhone = data.phone !== undefined ? data.phone : t.phone
  await pool.execute(
    'UPDATE teachers SET name = ?, phone = ?, subject = ?, remark = ? WHERE id = ?',
    [
      data.name ?? t.name,
      newPhone,
      data.subject !== undefined ? data.subject : t.subject,
      data.remark !== undefined ? data.remark : t.remark,
      id
    ]
  )

  // 同步更新登录用户名（联系电话 = 登录账号）
  if (newPhone && newPhone !== t.phone) {
    const [dupUser] = await pool.execute('SELECT id FROM users WHERE username = ? AND teacher_id != ?', [newPhone, id])
    if (dupUser.length > 0) throw new Error('该手机号已被其他账号使用')
    await pool.execute('UPDATE users SET username = ? WHERE teacher_id = ?', [newPhone, id])
  }

  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  return formatTeacher(rows[0])
}

export async function remove(id) {
  await pool.execute('DELETE FROM users WHERE teacher_id = ?', [id])
  await pool.execute('DELETE FROM teachers WHERE id = ?', [id])
}

export async function updateStatus(id, status) {
  await pool.execute('UPDATE teachers SET status = ? WHERE id = ?', [status, id])
  const isActive = status === 'active'
  await pool.execute('UPDATE users SET is_active = ? WHERE teacher_id = ?', [isActive, id])
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  return rows[0] ? enrichTeachersWithUserId([formatTeacher(rows[0])]) : null
}
