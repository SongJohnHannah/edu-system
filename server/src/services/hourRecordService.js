import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'

function formatRecord(row) {
  return {
    ...row,
    hours: Number(row.hours),
    studentId: row.student_id,
    relatedId: row.related_id,
    createdAt: formatDateTime(row.created_at)
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM hour_records ORDER BY created_at DESC')
    return rows.map(formatRecord)
  }
  const [rows] = await pool.execute(`
    SELECT hr.* FROM hour_records hr
    WHERE hr.student_id IN (
      SELECT DISTINCT s.id FROM students s
      WHERE s.creator_id = ?
      OR EXISTS (SELECT 1 FROM courses c WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(s.id)) AND c.teacher_id = ?)
      OR (s.created_by = 'admin' AND NOT EXISTS (SELECT 1 FROM courses c2 WHERE JSON_CONTAINS(c2.student_ids, JSON_QUOTE(s.id)) AND c2.teacher_id != ?))
    )
    ORDER BY hr.created_at DESC
  `, [teacherScope, teacherScope, teacherScope])
  return rows.map(formatRecord)
}

export async function getByStudent(studentId, teacherScope, { limit = 100, offset = 0 } = {}) {
  const limitNum = Math.min(parseInt(limit) || 100, 500)
  const offsetNum = parseInt(offset) || 0
  const fetchCount = limitNum + 1

  if (!teacherScope) {
    const [rows] = await pool.execute(
      `SELECT * FROM hour_records WHERE student_id = ? ORDER BY created_at DESC LIMIT ${fetchCount} OFFSET ${offsetNum}`,
      [studentId]
    )
    const hasMore = rows.length > limitNum
    return { data: (hasMore ? rows.slice(0, limitNum) : rows).map(formatRecord), hasMore }
  }

  // 教师只能查看自己创建的学生 或 自己课程中的学生 或 管理员创建且未被占用的学生
  const [students] = await pool.execute(
    `SELECT id FROM students WHERE id = ? AND (
      creator_id = ?
      OR EXISTS (SELECT 1 FROM courses c WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(students.id)) AND c.teacher_id = ?)
      OR (created_by = 'admin' AND NOT EXISTS (SELECT 1 FROM courses c2 WHERE JSON_CONTAINS(c2.student_ids, JSON_QUOTE(students.id)) AND c2.teacher_id != ?))
    )`,
    [studentId, teacherScope, teacherScope, teacherScope]
  )
  if (students.length === 0) {
    return { data: [], hasMore: false }
  }

  const [rows] = await pool.execute(
    `SELECT * FROM hour_records WHERE student_id = ? ORDER BY created_at DESC LIMIT ${fetchCount} OFFSET ${offsetNum}`,
    [studentId]
  )
  const hasMore = rows.length > limitNum
  return { data: (hasMore ? rows.slice(0, limitNum) : rows).map(formatRecord), hasMore }
}

export async function create(data, teacherScope) {
  if (teacherScope) {
    const [students] = await pool.execute(
      `SELECT id FROM students WHERE id = ? AND (
        creator_id = ?
        OR EXISTS (SELECT 1 FROM courses c WHERE JSON_CONTAINS(c.student_ids, JSON_QUOTE(students.id)) AND c.teacher_id = ?)
        OR (created_by = 'admin' AND NOT EXISTS (SELECT 1 FROM courses c2 WHERE JSON_CONTAINS(c2.student_ids, JSON_QUOTE(students.id)) AND c2.teacher_id != ?))
      )`,
      [data.studentId, teacherScope, teacherScope, teacherScope]
    )
    if (students.length === 0) {
      throw new Error('无权为该学生创建课时记录')
    }
  }

  const id = generateId()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute(
      'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.studentId, data.type, data.hours, data.remark || '', data.relatedId || null, data.operator || 'manual']
    )
    if (data.type === 'add') {
      await conn.execute('UPDATE students SET total_hours = total_hours + ? WHERE id = ?', [data.hours, data.studentId])
    } else if (data.type === 'subtract' || data.type === 'deduct') {
      await conn.execute('UPDATE students SET used_hours = used_hours + ? WHERE id = ?', [data.hours, data.studentId])
    }
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  const [rows] = await pool.execute('SELECT * FROM hour_records WHERE id = ?', [id])
  return rows[0] ? formatRecord(rows[0]) : null
}
