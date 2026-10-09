import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'
import { acquireScheduleLock, releaseScheduleLock, closeScheduleConnection, futureTrialWindow } from './scheduleService.js'

async function acquireStudentIdentityLock(conn) {
  const [rows] = await conn.execute("SELECT GET_LOCK('edu-system-student-identity', 5) AS acquired")
  if (rows[0]?.acquired !== 1) throw Object.assign(new Error('学生资料正由其他人录入，请稍后重试'), { status: 409 })
}

async function releaseStudentIdentityLock(conn) {
  await conn.execute("SELECT RELEASE_LOCK('edu-system-student-identity')")
}

async function closeStudentWriteConnection(conn, identityLocked, scheduleLocked = false) {
  let discard = false
  try { if (identityLocked) await releaseStudentIdentityLock(conn) } catch { discard = true }
  try { if (scheduleLocked) await releaseScheduleLock(conn) } catch { discard = true }
  if (discard) {
    try { conn.destroy() } catch { /* The connection is already unusable. */ }
  } else {
    try { conn.release() } catch { try { conn.destroy() } catch { /* The connection is already unusable. */ } }
  }
}

function initialHours(value) {
  const hours = Number(value ?? 0)
  if (!Number.isFinite(hours) || hours < 0 || hours > 10000 || !Number.isInteger(hours * 2)) {
    throw Object.assign(new Error('初始课时须为 0 至 10000 之间的半课时倍数'), { status: 400 })
  }
  return hours
}

function initialEnrollmentStage(value) {
  if (value === undefined) return 'enrolled'
  if (value !== 'pending' && value !== 'enrolled') {
    throw Object.assign(new Error('报名阶段须为待报名或已报名'), { status: 400 })
  }
  return value
}

function normalizedPhone(value) {
  return String(value ?? '').trim()
}

function assertStudentFieldLengths(name, phone) {
  if ([...name].length > 100) throw Object.assign(new Error('学生姓名不能超过100个字符'), { status: 400 })
  if ([...phone].length > 20) throw Object.assign(new Error('联系电话不能超过20个字符'), { status: 400 })
}

function normalizedAge(value) {
  if (value === null || value === undefined || value === '') return null
  const age = Number(value)
  if (!Number.isInteger(age) || age < 1 || age > 100) {
    throw Object.assign(new Error('年龄须为1至100的整数'), { status: 400 })
  }
  return age
}

function formatStudent(row) {
  const student = { ...row }
  delete student.class_id
  return {
    ...student,
    totalHours: Number(row.total_hours),
    usedHours: Number(row.used_hours),
    createdBy: row.created_by,
    creatorId: row.creator_id,
    enrollmentStage: row.enrollment_stage,
    isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
  }
}

export async function getAll(teacherScope) {
  const [rows] = await pool.execute('SELECT * FROM students ORDER BY created_at DESC')
  return rows.map(formatStudent)
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function verifyAccess(id, teacherScope) {
  const [rows] = await pool.execute('SELECT created_by, creator_id, status FROM students WHERE id = ?', [id])
  assertWriteAccess(rows[0], teacherScope)
  return true
}

function assertWriteAccess(student, teacherScope) {
  if (!student || student.status === 'deleted') throw Object.assign(new Error('学生不存在'), { status: 404 })
  if (teacherScope && student.created_by !== 'admin' && student.creator_id !== teacherScope) {
    throw Object.assign(new Error('只能修改自己或管理员录入的学生'), { status: 403 })
  }
}

export async function verifyDeleteAccess(id, teacherScope) {
  await verifyAccess(id, teacherScope)
  if (!teacherScope) return true
  const [rows] = await pool.execute('SELECT creator_id FROM students WHERE id = ?', [id])
  if (rows[0].creator_id !== teacherScope) {
    throw Object.assign(new Error('只能归档自己录入的学生'), { status: 403 })
  }
  return true
}

export async function create(data) {
  if (!data || typeof data !== 'object') throw Object.assign(new Error('学生资料无效'), { status: 400 })
  const name = String(data.name ?? '').trim()
  if (!name) throw Object.assign(new Error('请输入学生姓名'), { status: 400 })
  const phone = normalizedPhone(data.phone)
  assertStudentFieldLengths(name, phone)
  const age = normalizedAge(data.age)
  const totalHours = initialHours(data.totalHours)
  const enrollmentStage = initialEnrollmentStage(data.enrollmentStage)
  const conn = await pool.getConnection()
  let identityLocked = false
  try {
    await acquireStudentIdentityLock(conn)
    identityLocked = true
    await conn.beginTransaction()
    const [dup] = await conn.execute('SELECT id FROM students WHERE TRIM(name) = ? FOR UPDATE', [name])
    if (dup.length > 0) throw Object.assign(new Error('学生姓名已存在'), { status: 409 })

    if (phone) {
      const [phoneDup] = await conn.execute('SELECT id FROM students WHERE TRIM(phone) = ? AND phone != "" FOR UPDATE', [phone])
      if (phoneDup.length > 0) throw Object.assign(new Error('该手机号已被其他学生使用'), { status: 409 })
    }

    const id = generateId()
    await conn.execute(
      `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, created_by, creator_id, is_test, enrollment_stage)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`,
      [id, name, phone, age, data.remark || '', totalHours,
       data.createdBy || 'admin', data.creatorId || null, data.isTest ? 1 : 0, enrollmentStage]
    )
    const [rows] = await conn.execute('SELECT * FROM students WHERE id = ?', [id])
    const result = formatStudent(rows[0])
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    await closeStudentWriteConnection(conn, identityLocked)
  }
}

export async function update(id, data) {
  const conn = await pool.getConnection()
  let locked = false
  let identityLocked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await acquireStudentIdentityLock(conn)
    identityLocked = true
    await conn.beginTransaction()
    const [existing] = await conn.execute('SELECT * FROM students WHERE id = ? FOR UPDATE', [id])
    if (!existing.length || existing[0].status === 'deleted') throw Object.assign(new Error('学生不存在'), { status: 404 })
    const s = existing[0]
    const name = String(data.name ?? s.name).trim()
    const phone = data.phone === undefined ? s.phone : normalizedPhone(data.phone)
    if (!name) throw Object.assign(new Error('请输入学生姓名'), { status: 400 })
    assertStudentFieldLengths(name, phone)
    const age = data.age === undefined ? s.age : normalizedAge(data.age)
    if (data.status !== undefined && !['active', 'quit'].includes(data.status)) {
      throw Object.assign(new Error('无效的学生状态'), { status: 400 })
    }
    if (data.enrollmentStage !== undefined && !['pending', 'enrolled'].includes(data.enrollmentStage)) {
      throw Object.assign(new Error('无效的报名阶段'), { status: 400 })
    }
    if ((data.totalHours !== undefined && Number(data.totalHours) !== Number(s.total_hours)) ||
        (data.usedHours !== undefined && Number(data.usedHours) !== Number(s.used_hours))) {
      throw Object.assign(new Error('课时变更请使用加减课时操作'), { status: 400 })
    }

    const [dup] = await conn.execute('SELECT id FROM students WHERE TRIM(name) = ? AND id != ?', [name, id])
    if (dup.length) throw Object.assign(new Error('学生姓名已存在'), { status: 409 })
    if (data.phone !== undefined && phone) {
      const [phoneDup] = await conn.execute('SELECT id FROM students WHERE TRIM(phone) = ? AND id != ? AND phone != ""', [phone, id])
      if (phoneDup.length) throw Object.assign(new Error('该手机号已被其他学生使用'), { status: 409 })
    }

    const nextStage = data.enrollmentStage ?? s.enrollment_stage
    if (nextStage !== s.enrollment_stage) {
      if (nextStage === 'pending') {
        const [courses] = await conn.execute(
          'SELECT id FROM courses WHERE archived_at IS NULL AND JSON_CONTAINS(student_ids, JSON_QUOTE(?)) LIMIT 1', [id])
        if (courses.length) throw Object.assign(new Error('请先从正式课程名单移除该学生，再改为待报名'), { status: 409 })
      } else {
        const future = futureTrialWindow()
        const [bookings] = await conn.execute(
          `SELECT id FROM trial_bookings WHERE student_id = ? AND status = 'active' AND ${future.clause} LIMIT 1`,
          [id, ...future.params])
        if (bookings.length) throw Object.assign(new Error('请先处理该学生未来的试听预约，再改为已报名'), { status: 409 })
      }
    }
    if (data.status === 'quit' && s.status !== 'quit') {
      const [courses] = await conn.execute(
        'SELECT id FROM courses WHERE archived_at IS NULL AND JSON_CONTAINS(student_ids, JSON_QUOTE(?)) LIMIT 1', [id])
      if (courses.length) throw Object.assign(new Error('请先从正式课程名单移除该学生，再办理退学'), { status: 409 })
      const future = futureTrialWindow()
      const [bookings] = await conn.execute(
        `SELECT id FROM trial_bookings WHERE student_id = ? AND status = 'active' AND ${future.clause} LIMIT 1`,
        [id, ...future.params])
      if (bookings.length) throw Object.assign(new Error('请先处理该学生未来的试听预约，再办理退学'), { status: 409 })
    }

    await conn.execute(
      'UPDATE students SET name = ?, phone = ?, age = ?, remark = ?, status = ?, enrollment_stage = ? WHERE id = ?',
      [name, phone, age,
        data.remark !== undefined ? data.remark : s.remark, data.status ?? s.status,
        nextStage, id]
    )
    const [rows] = await conn.execute('SELECT * FROM students WHERE id = ?', [id])
    const result = formatStudent(rows[0])
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeStudentWriteConnection(conn, identityLocked, locked)
  }
}

export async function remove(id) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const future = futureTrialWindow()
    const [bookings] = await conn.execute(
      `SELECT id FROM trial_bookings WHERE student_id = ? AND status = 'active' AND ${future.clause} LIMIT 1`,
      [id, ...future.params])
    if (bookings.length) throw Object.assign(new Error('请先处理该学生未来的试听预约'), { status: 409 })
    const [courses] = await conn.execute("SELECT id FROM courses WHERE archived_at IS NULL AND JSON_CONTAINS(student_ids, JSON_QUOTE(?)) LIMIT 1", [id])
    if (courses.length) throw Object.assign(new Error('请先从正式课程名单移除该学生'), { status: 409 })
    await conn.execute("UPDATE students SET status = 'deleted' WHERE id = ?", [id])
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function restore(id, teacherScope = null) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()
    const [[student]] = await conn.execute('SELECT * FROM students WHERE id = ? FOR UPDATE', [id])
    if (!student) throw Object.assign(new Error('学生不存在'), { status: 404 })
    if (teacherScope && student.creator_id !== teacherScope) throw Object.assign(new Error('只能恢复自己录入的学生'), { status: 403 })
    if (student.status !== 'deleted') throw Object.assign(new Error('该学生未归档，无需恢复'), { status: 400 })
    await conn.execute("UPDATE students SET status = 'active' WHERE id = ?", [id])
    const [[restored]] = await conn.execute('SELECT * FROM students WHERE id = ?', [id])
    const result = formatStudent(restored)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function checkNameExists(name, excludeId) {
  name = String(name ?? '').trim()
  if (!name) return false
  if (excludeId) {
    const [rows] = await pool.execute('SELECT id FROM students WHERE TRIM(name) = ? AND id != ?', [name, excludeId])
    return rows.length > 0
  }
  const [rows] = await pool.execute('SELECT id FROM students WHERE TRIM(name) = ?', [name])
  return rows.length > 0
}

export async function updateStatus(id, status) {
  return update(id, { status })
}

function validateManualHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 10000 || !Number.isInteger(hours * 2)) {
    throw Object.assign(new Error('课时数须为 0.5 至 10000 之间的半课时倍数'), { status: 400 })
  }
  return hours
}

export async function addHours(id, hours, remark, operator, teacherScope = null) {
  hours = validateManualHours(hours)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [students] = await conn.execute('SELECT created_by, creator_id, status FROM students WHERE id = ? FOR UPDATE', [id])
    assertWriteAccess(students[0], teacherScope)
    await conn.execute('UPDATE students SET total_hours = total_hours + ? WHERE id = ?', [hours, id])
    const recordId = generateId()
    await conn.execute(
      'INSERT INTO hour_records (id, student_id, type, hours, remark, operator, is_test) VALUES (?, ?, ?, ?, ?, ?, (SELECT is_test FROM students WHERE id = ?))',
      [recordId, id, 'add', hours, remark || '手动添加', operator || 'manual', id]
    )
    const [rows] = await conn.execute('SELECT * FROM students WHERE id = ?', [id])
    const result = rows[0] ? formatStudent(rows[0]) : null
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function subtractHours(id, hours, remark, operator, teacherScope = null) {
  hours = validateManualHours(hours)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [students] = await conn.execute('SELECT created_by, creator_id, status FROM students WHERE id = ? FOR UPDATE', [id])
    assertWriteAccess(students[0], teacherScope)
    await conn.execute('UPDATE students SET total_hours = total_hours - ? WHERE id = ?', [hours, id])
    const recordId = generateId()
    await conn.execute(
      'INSERT INTO hour_records (id, student_id, type, hours, remark, operator, is_test) VALUES (?, ?, ?, ?, ?, ?, (SELECT is_test FROM students WHERE id = ?))',
      [recordId, id, 'subtract', hours, remark || '手动减少', operator || 'manual', id]
    )
    const [rows] = await conn.execute('SELECT * FROM students WHERE id = ?', [id])
    const result = rows[0] ? formatStudent(rows[0]) : null
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function addBatch(studentList, defaultHours, createdBy = 'admin', creatorId = null) {
  if (!Array.isArray(studentList) || !studentList.length || studentList.some(student => !student || typeof student !== 'object')) {
    throw Object.assign(new Error('请提供有效的学生列表'), { status: 400 })
  }
  const normalizedDefaultHours = initialHours(defaultHours)
  const prepared = studentList.map(student => ({
    ...student,
    name: String(student.name ?? '').trim(),
    phone: normalizedPhone(student.phone),
    totalHours: initialHours(student.totalHours ?? normalizedDefaultHours),
    enrollmentStage: initialEnrollmentStage(student.enrollmentStage)
  })).filter(student => student.name)
  if (!prepared.length) throw Object.assign(new Error('请至少填写一个学生姓名'), { status: 400 })
  for (const student of prepared) {
    assertStudentFieldLengths(student.name, student.phone)
    student.age = normalizedAge(student.age)
  }
  const conn = await pool.getConnection()
  let identityLocked = false
  let addedCount = 0
  const skipped = []
  try {
    await acquireStudentIdentityLock(conn)
    identityLocked = true
    await conn.beginTransaction()
    for (const student of prepared) {
      const name = student.name
      const [dup] = await conn.execute('SELECT id FROM students WHERE TRIM(name) = ?', [name])
      if (dup.length > 0) {
        skipped.push(name)
        continue
      }
      if (student.phone) {
        const [phoneDup] = await conn.execute('SELECT id FROM students WHERE TRIM(phone) = ? AND phone != ""', [student.phone])
        if (phoneDup.length > 0) {
          skipped.push(name)
          continue
        }
      }
      const id = generateId()
      await conn.execute(
        `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, created_by, creator_id, is_test, enrollment_stage)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`,
        [id, name, student.phone || '', student.age ?? null, student.remark || '', student.totalHours,
         createdBy, creatorId, student.isTest ? 1 : 0, student.enrollmentStage]
      )
      addedCount++
    }
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    await closeStudentWriteConnection(conn, identityLocked)
  }
  return { addedCount, skipped }
}

export async function validateStudentsForCourse(studentIds, teacherScope, excludeCourseId = null) {
  if (!Array.isArray(studentIds) || !studentIds.length) return
  const unique = [...new Set(studentIds)]
  const [rows] = await pool.query('SELECT id FROM students WHERE id IN (?) AND status != ?', [unique, 'deleted'])
  if (rows.length !== unique.length) throw Object.assign(new Error('课程名单包含不存在或已归档的学生'), { status: 400 })
}
