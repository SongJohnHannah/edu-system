import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'

function formatRecord(row) {
  return {
    ...row,
    studentId: row.student_id,
    relatedId: row.related_id,
    createdAt: row.created_at
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM hour_records ORDER BY created_at DESC')
    return rows.map(formatRecord)
  }
  const [rows] = await pool.execute(`
    SELECT hr.* FROM hour_records hr
    JOIN courses c ON JSON_CONTAINS(c.student_ids, JSON_QUOTE(hr.student_id))
    WHERE c.teacher_id = ?
    ORDER BY hr.created_at DESC
  `, [teacherScope])
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
  const [rows] = await pool.execute(`
    SELECT hr.* FROM hour_records hr
    JOIN courses c ON JSON_CONTAINS(c.student_ids, JSON_QUOTE(hr.student_id))
    WHERE hr.student_id = ? AND c.teacher_id = ?
    ORDER BY hr.created_at DESC
    LIMIT ${fetchCount} OFFSET ${offsetNum}
  `, [studentId, teacherScope])
  const hasMore = rows.length > limitNum
  return { data: (hasMore ? rows.slice(0, limitNum) : rows).map(formatRecord), hasMore }
}

export async function create(data, teacherScope) {
  if (teacherScope) {
    const [courses] = await pool.execute(
      'SELECT id FROM courses WHERE teacher_id = ? AND JSON_CONTAINS(student_ids, JSON_QUOTE(?))',
      [teacherScope, data.studentId]
    )
    if (courses.length === 0) {
      throw new Error('无权为该学生创建课时记录')
    }
  }

  const id = generateId()
  await pool.execute(
    'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.studentId, data.type, data.hours, data.remark || '', data.relatedId || null, data.operator || 'manual']
  )
  const [rows] = await pool.execute('SELECT * FROM hour_records WHERE id = ?', [id])
  return rows[0] ? formatRecord(rows[0]) : null
}
