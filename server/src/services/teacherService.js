import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import * as authService from './authService.js'

function formatTeacher(row) {
  return {
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
  const id = generateId()
  await pool.execute(
    'INSERT INTO teachers (id, name, phone, subject, remark) VALUES (?, ?, ?, ?, ?)',
    [id, data.name, data.phone || '', data.subject || '', data.remark || '']
  )

  // 同时创建关联的 user 账号
  const username = data.phone || `teacher_${id}`
  try {
    await authService.createUser({
      username,
      password: DEFAULT_PASSWORD,
      role: 'teacher',
      teacherId: id,
      displayName: data.name
    })
  } catch (err) {
    // 用户名可能重复（手机号已存在），用备用用户名
    if (err.message?.includes('Duplicate')) {
      await authService.createUser({
        username: `teacher_${id}`,
        password: DEFAULT_PASSWORD,
        role: 'teacher',
        teacherId: id,
        displayName: data.name
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

  const t = existing[0]
  await pool.execute(
    'UPDATE teachers SET name = ?, phone = ?, subject = ?, remark = ? WHERE id = ?',
    [
      data.name ?? t.name,
      data.phone !== undefined ? data.phone : t.phone,
      data.subject !== undefined ? data.subject : t.subject,
      data.remark !== undefined ? data.remark : t.remark,
      id
    ]
  )
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  return formatTeacher(rows[0])
}

export async function remove(id) {
  await pool.execute('DELETE FROM teachers WHERE id = ?', [id])
}
