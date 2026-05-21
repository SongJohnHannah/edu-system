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
    const [rows] = await pool.execute("SELECT * FROM teachers WHERE status != 'deleted' ORDER BY created_at DESC")
    return enrichTeachersWithUserId(rows.map(formatTeacher))
  }
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ? AND status != ?', [teacherScope, 'deleted'])
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
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 检查重名（加锁防止并发创建）
    const [existing] = await conn.execute('SELECT id FROM teachers WHERE name = ? FOR UPDATE', [data.name])
    if (existing.length > 0) throw new Error('教师姓名已存在')

    // 检查手机号重复
    if (data.phone) {
      const [phoneCheck] = await conn.execute('SELECT id FROM teachers WHERE phone = ? AND id != ? FOR UPDATE', [data.phone, ''])
      if (phoneCheck.length > 0) throw new Error('该手机号已被其他教师使用')
    }

    const id = generateId()
    await conn.execute(
      'INSERT INTO teachers (id, name, phone, subject, remark, is_test) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.name, data.phone || '', data.subject || '', data.remark || '', data.isTest ? 1 : 0]
    )

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

    await conn.commit()
    const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
    const teacher = formatTeacher(rows[0])
    return { ...teacher, defaultPassword: DEFAULT_PASSWORD, username }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
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

  // 同步 display_name
  if (data.name) {
    await pool.execute('UPDATE users SET display_name = ? WHERE teacher_id = ?', [data.name, id])
  }

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
  const [courses] = await pool.execute('SELECT id FROM courses WHERE teacher_id = ?', [id])
  if (courses.length > 0) throw new Error('该教师仍有课程，请先交接或删除课程')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('DELETE FROM users WHERE teacher_id = ?', [id])
    await conn.execute('DELETE FROM teachers WHERE id = ?', [id])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function updateStatus(id, status) {
  if (status === 'deleted') {
    const [courses] = await pool.execute('SELECT id FROM courses WHERE teacher_id = ?', [id])
    if (courses.length > 0) throw new Error('该教师仍有课程，请先交接或删除课程')
  }
  await pool.execute('UPDATE teachers SET status = ? WHERE id = ?', [status, id])
  const isActive = status === 'active'
  await pool.execute('UPDATE users SET is_active = ? WHERE teacher_id = ?', [isActive, id])
  const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [id])
  return rows[0] ? enrichTeachersWithUserId([formatTeacher(rows[0])]) : null
}
