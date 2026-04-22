import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'

function formatClass(row) {
  return {
    ...row,
    createdAt: formatDateTime(row.created_at)
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM classes ORDER BY created_at DESC')
    return rows.map(formatClass)
  }
  const [rows] = await pool.execute(`
    SELECT DISTINCT cl.* FROM classes cl
    JOIN students s ON s.class_id = cl.id
    JOIN courses c ON JSON_CONTAINS(c.student_ids, JSON_QUOTE(s.id))
    WHERE c.teacher_id = ?
    ORDER BY cl.created_at DESC
  `, [teacherScope])
  return rows.map(formatClass)
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM classes WHERE id = ?', [id])
  return rows[0] ? formatClass(rows[0]) : null
}

export async function create(data) {
  const id = generateId()
  await pool.execute('INSERT INTO classes (id, name) VALUES (?, ?)', [id, data.name])
  const [rows] = await pool.execute('SELECT * FROM classes WHERE id = ?', [id])
  return rows[0] ? formatClass(rows[0]) : null
}

export async function update(id, data) {
  await pool.execute('UPDATE classes SET name = ? WHERE id = ?', [data.name, id])
  const [rows] = await pool.execute('SELECT * FROM classes WHERE id = ?', [id])
  return rows[0] ? formatClass(rows[0]) : null
}

export async function remove(id) {
  await pool.execute('DELETE FROM classes WHERE id = ?', [id])
}
