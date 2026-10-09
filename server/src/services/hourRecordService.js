import pool from '../config/database.js'
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
  const [rows] = await pool.execute('SELECT * FROM hour_records ORDER BY created_at DESC, id DESC')
  return rows.map(formatRecord)
}

export async function getByStudent(studentId, teacherScope, { limit = 100, offset = 0 } = {}) {
  const limitNum = Math.max(1, Math.min(parseInt(limit) || 100, 500))
  const offsetNum = Math.max(0, parseInt(offset) || 0)
  const fetchCount = limitNum + 1

  const [rows] = await pool.execute(
    `SELECT * FROM hour_records WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT ${fetchCount} OFFSET ${offsetNum}`,
    [studentId]
  )
  const hasMore = rows.length > limitNum
  return { data: (hasMore ? rows.slice(0, limitNum) : rows).map(formatRecord), hasMore }
}
