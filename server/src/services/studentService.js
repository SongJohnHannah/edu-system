import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'

function formatStudent(row) {
  return {
    ...row,
    totalHours: row.total_hours,
    usedHours: row.used_hours,
    classId: row.class_id,
    createdBy: row.created_by,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM students ORDER BY created_at DESC')
    return rows.map(formatStudent)
  }
  // 教师可见学生：自己创建的 + 自己课程中的 + 管理员创建且未被其他老师占用的
  const [rows] = await pool.execute(`
    SELECT DISTINCT s.* FROM students s
    WHERE
      s.creator_id = ?
      OR EXISTS (
        SELECT 1 FROM courses c
        WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(s.id))
        AND c.teacher_id = ?
      )
      OR (
        s.created_by = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM courses c2
          WHERE JSON_CONTAINS(c2.student_ids, JSON_QUOTE(s.id))
          AND c2.teacher_id != ?
        )
      )
    ORDER BY s.created_at DESC
  `, [teacherScope, teacherScope, teacherScope])
  return rows.map(formatStudent)
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function verifyAccess(id, teacherScope) {
  if (!teacherScope) return true
  const [rows] = await pool.execute(`
    SELECT 1 FROM students s
    WHERE s.id = ? AND (
      s.creator_id = ?
      OR EXISTS (
        SELECT 1 FROM courses c
        WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(s.id))
        AND c.teacher_id = ?
      )
      OR (
        s.created_by = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM courses c2
          WHERE JSON_CONTAINS(c2.student_ids, JSON_QUOTE(s.id))
          AND c2.teacher_id != ?
        )
      )
    )
    LIMIT 1
  `, [id, teacherScope, teacherScope, teacherScope])
  if (rows.length === 0) throw new Error('无权访问该学生数据')
  return true
}

export async function create(data) {
  const id = generateId()
  await pool.execute(
    `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
    [id, data.name, data.phone || '', data.age || null, data.remark || '', data.totalHours || 0, data.classId || '',
     data.createdBy || 'admin', data.creatorId || null]
  )
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return formatStudent(rows[0])
}

export async function update(id, data) {
  const [existing] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  if (existing.length === 0) throw new Error('学生不存在')

  const s = existing[0]
  await pool.execute(
    `UPDATE students SET name = ?, phone = ?, age = ?, remark = ?, total_hours = ?,
     used_hours = ?, status = ?, class_id = ? WHERE id = ?`,
    [
      data.name ?? s.name,
      data.phone !== undefined ? data.phone : s.phone,
      data.age !== undefined ? data.age : s.age,
      data.remark !== undefined ? data.remark : s.remark,
      data.totalHours !== undefined ? data.totalHours : s.total_hours,
      data.usedHours !== undefined ? data.usedHours : s.used_hours,
      data.status ?? s.status,
      data.classId !== undefined ? data.classId : s.class_id,
      id
    ]
  )
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return formatStudent(rows[0])
}

export async function remove(id) {
  await pool.execute('DELETE FROM students WHERE id = ?', [id])
}

export async function checkNameExists(name, excludeId) {
  if (excludeId) {
    const [rows] = await pool.execute('SELECT id FROM students WHERE name = ? AND id != ?', [name, excludeId])
    return rows.length > 0
  }
  const [rows] = await pool.execute('SELECT id FROM students WHERE name = ?', [name])
  return rows.length > 0
}

export async function updateStatus(id, status) {
  await pool.execute('UPDATE students SET status = ? WHERE id = ?', [status, id])
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function addHours(id, hours, remark, operator) {
  await pool.execute('UPDATE students SET total_hours = total_hours + ? WHERE id = ?', [hours, id])
  const recordId = generateId()
  await pool.execute(
    'INSERT INTO hour_records (id, student_id, type, hours, remark, operator) VALUES (?, ?, ?, ?, ?, ?)',
    [recordId, id, 'add', hours, remark || '手动添加', operator || 'manual']
  )
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function addBatch(studentList, defaultHours, createdBy = 'admin', creatorId = null) {
  let addedCount = 0
  for (const student of studentList) {
    if (student.name && student.name.trim()) {
      const id = generateId()
      await pool.execute(
        `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
        [id, student.name.trim(), '', student.age || null, '', student.totalHours || defaultHours || 0, student.classId || '',
         createdBy, creatorId]
      )
      addedCount++
    }
  }
  return { addedCount }
}

// 验证教师能否将这些学生加入课程（管理员创建的学生若已被其他老师选入则不可再选）
export async function validateStudentsForCourse(studentIds, teacherScope, excludeCourseId = null) {
  if (!teacherScope || !studentIds || studentIds.length === 0) return

  for (const studentId of studentIds) {
    const [rows] = await pool.execute(
      'SELECT created_by FROM students WHERE id = ?', [studentId]
    )
    if (rows.length === 0 || rows[0].created_by !== 'admin') continue

    let query = `
      SELECT c.teacher_id, t.name as teacher_name FROM courses c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(?))
      AND c.teacher_id != ?
    `
    const params = [studentId, teacherScope]

    if (excludeCourseId) {
      query += ' AND c.id != ?'
      params.push(excludeCourseId)
    }

    const [courses] = await pool.execute(query, params)
    if (courses.length > 0) {
      const teacherName = courses[0].teacher_name || '其他教师'
      const [studentRows] = await pool.execute('SELECT name FROM students WHERE id = ?', [studentId])
      const studentName = studentRows[0]?.name || '该学生'
      throw new Error(`${studentName} 已被${teacherName}选入班级，无法重复选择`)
    }
  }
}
