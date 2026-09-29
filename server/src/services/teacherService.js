import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import * as authService from './authService.js'
import { formatDateTime } from '../utils/dateFormat.js'
import { randomBytes } from 'node:crypto'
import { acquireScheduleLock, closeScheduleConnection, futureTrialWindow } from './scheduleService.js'
import { acquireTeacherIdentityLock, closeTeacherIdentityConnection } from './teacherIdentityLock.js'

function formatTeacher(row) {
  return {
    ...row,
    isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
  }
}

function assertFieldLength(value, limit, label) {
  if ([...value].length > limit) throw Object.assign(new Error(`${label}不能超过${limit}个字符`), { status: 400 })
}

export async function getAll(teacherScope) {
  const [rows] = await pool.execute(`SELECT * FROM teachers ORDER BY created_at DESC`)
  const formatted = rows.map(formatTeacher)
  return teacherScope ? formatted : enrichTeachersWithUserId(formatted)
}

async function enrichTeachersWithUserId(teachers, db = pool) {
  if (teachers.length === 0) return teachers
  const [users] = await db.execute('SELECT id, teacher_id FROM users WHERE teacher_id IS NOT NULL')
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

export async function create(data) {
  const name = String(data?.name ?? '').trim()
  if (!name) throw Object.assign(new Error('请输入教师姓名'), { status: 400 })
  const phone = String(data.phone ?? '').trim()
  const subject = String(data.subject ?? '')
  assertFieldLength(name, 100, '教师姓名')
  assertFieldLength(phone, 20, '联系电话')
  assertFieldLength(subject, 100, '教授科目')
  const conn = await pool.getConnection()
  let identityLocked = false
  try {
    await acquireTeacherIdentityLock(conn)
    identityLocked = true
    await conn.beginTransaction()

    // 身份锁串行化查重与写入，兼顾尚无匹配行的并发创建。
    const [existing] = await conn.execute('SELECT id FROM teachers WHERE TRIM(name) = ? FOR UPDATE', [name])
    if (existing.length > 0) throw Object.assign(new Error('教师姓名已存在'), { status: 409 })

    // 检查手机号重复
    if (phone) {
      const [phoneCheck] = await conn.execute('SELECT id FROM teachers WHERE TRIM(phone) = ? FOR UPDATE', [phone])
      if (phoneCheck.length > 0) throw Object.assign(new Error('该手机号已被其他教师使用'), { status: 409 })
    }

    const id = generateId()
    await conn.execute(
      'INSERT INTO teachers (id, name, phone, subject, remark, is_test) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, phone, subject, data.remark || '', data.isTest ? 1 : 0]
    )

    let username = phone || `teacher_${id}`
    const initialPassword = randomBytes(9).toString('base64url')
    const isTest = !!data.isTest
    let createdUser
    try {
      createdUser = await authService.createUser({
        username,
        password: initialPassword,
        role: 'teacher',
        teacherId: id,
        displayName: name,
        isTest
      }, conn)
    } catch (err) {
      if (err.message?.includes('Duplicate')) {
        username = `teacher_${id}`
        createdUser = await authService.createUser({
          username,
          password: initialPassword,
          role: 'teacher',
          teacherId: id,
          displayName: name,
          isTest
        }, conn)
      } else {
        throw err
      }
    }

    const [rows] = await conn.execute('SELECT * FROM teachers WHERE id = ?', [id])
    const teacher = formatTeacher(rows[0])
    const result = { ...teacher, userId: createdUser.id, defaultPassword: initialPassword, username }
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    await closeTeacherIdentityConnection(conn, identityLocked)
  }
}

export async function update(id, data) {
  if (!data || typeof data !== 'object') throw Object.assign(new Error('教师资料无效'), { status: 400 })
  const name = data.name === undefined ? undefined : String(data.name).trim()
  if (name !== undefined && !name) throw Object.assign(new Error('请输入教师姓名'), { status: 400 })
  const phone = data.phone === undefined ? undefined : String(data.phone ?? '').trim()
  const subject = data.subject === undefined ? undefined : String(data.subject ?? '')
  if (name !== undefined) assertFieldLength(name, 100, '教师姓名')
  if (phone !== undefined) assertFieldLength(phone, 20, '联系电话')
  if (subject !== undefined) assertFieldLength(subject, 100, '教授科目')
  const conn = await pool.getConnection()
  let identityLocked = false
  try {
  await acquireTeacherIdentityLock(conn)
  identityLocked = true
  await conn.beginTransaction()
  const [existing] = await conn.execute('SELECT * FROM teachers WHERE id = ? FOR UPDATE', [id])
  if (existing.length === 0) throw Object.assign(new Error('教师不存在'), { status: 404 })

  // 检查重名（排除自身）
  if (name !== undefined) {
    const [dup] = await conn.execute('SELECT id FROM teachers WHERE TRIM(name) = ? AND id != ?', [name, id])
    if (dup.length > 0) throw Object.assign(new Error('教师姓名已存在'), { status: 409 })
  }

  // 检查手机号重复（排除自身）
  if (phone) {
    const [phoneDup] = await conn.execute('SELECT id FROM teachers WHERE TRIM(phone) = ? AND id != ?', [phone, id])
    if (phoneDup.length > 0) throw Object.assign(new Error('该手机号已被其他教师使用'), { status: 409 })
  }

  const t = existing[0]
  const newPhone = phone !== undefined ? phone : t.phone
  await conn.execute(
    'UPDATE teachers SET name = ?, phone = ?, subject = ?, remark = ? WHERE id = ?',
    [
      name ?? t.name,
      newPhone,
      subject !== undefined ? subject : t.subject,
      data.remark !== undefined ? data.remark : t.remark,
      id
    ]
  )

  // 同步 display_name
  if (name !== undefined) {
    await conn.execute('UPDATE users SET display_name = ? WHERE teacher_id = ?', [name, id])
  }

  // 同步更新登录用户名（联系电话 = 登录账号）
  if (newPhone && newPhone !== t.phone) {
    const [dupUser] = await conn.execute('SELECT id FROM users WHERE TRIM(username) = ? AND (teacher_id IS NULL OR teacher_id != ?)', [newPhone, id])
    if (dupUser.length > 0) throw Object.assign(new Error('该手机号已被其他账号使用'), { status: 409 })
    await conn.execute('UPDATE users SET username = ? WHERE teacher_id = ?', [newPhone, id])
  }

  const [rows] = await conn.execute('SELECT * FROM teachers WHERE id = ?', [id])
  const result = formatTeacher(rows[0])
  await conn.commit()
  return result
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeTeacherIdentityConnection(conn, identityLocked) }
}

export async function remove(id) {
  return updateStatus(id, 'deleted')
}

export async function updateStatus(id, status) {
  if (!['active', 'deleted'].includes(status)) throw Object.assign(new Error('无效的教师状态'), { status: 400 })
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const [existing] = await conn.execute('SELECT id FROM teachers WHERE id = ? FOR UPDATE', [id])
    if (!existing.length) throw Object.assign(new Error('教师不存在'), { status: 404 })
    if (status === 'deleted') {
      const [courses] = await conn.execute('SELECT id FROM courses WHERE teacher_id = ? AND archived_at IS NULL LIMIT 1', [id])
      if (courses.length) throw Object.assign(new Error('该教师仍有课程，请先交接或归档课程'), { status: 409 })
      const future = futureTrialWindow()
      const [trials] = await conn.execute(
        `SELECT id FROM trial_bookings WHERE teacher_id = ? AND status = 'active' AND ${future.clause} LIMIT 1`,
        [id, ...future.params]
      )
      if (trials.length) throw Object.assign(new Error('请先处理该教师未来的试听预约'), { status: 409 })
    }
    await conn.execute('UPDATE teachers SET status = ? WHERE id = ?', [status, id])
    await conn.execute('UPDATE users SET is_active = ? WHERE teacher_id = ?', [status === 'active', id])
    const [rows] = await conn.execute('SELECT * FROM teachers WHERE id = ?', [id])
    const result = rows[0] ? await enrichTeachersWithUserId([formatTeacher(rows[0])], conn) : null
    await conn.commit()
    return result
  } catch (error) { await conn.rollback(); throw error }
  finally { await closeScheduleConnection(conn, locked) }
}
