import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'

function formatCourse(row) {
  return {
    ...row,
    teacherId: row.teacher_id,
    startTime: row.start_time,
    endTime: row.end_time,
    hoursPerClass: row.hours_per_class,
    studentIds: typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : (row.student_ids || []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function getAll(teacherScope) {
  if (!teacherScope) {
    const [rows] = await pool.execute('SELECT * FROM courses ORDER BY created_at DESC')
    return rows.map(formatCourse)
  }
  const [rows] = await pool.execute(
    'SELECT * FROM courses WHERE teacher_id = ? ORDER BY created_at DESC',
    [teacherScope]
  )
  return rows.map(formatCourse)
}

export async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM courses WHERE id = ?', [id])
  return rows[0] ? formatCourse(rows[0]) : null
}

export async function verifyAccess(id, teacherScope) {
  if (!teacherScope) return true
  const [rows] = await pool.execute('SELECT teacher_id FROM courses WHERE id = ?', [id])
  if (rows.length === 0) throw new Error('课程不存在')
  if (rows[0].teacher_id !== teacherScope) throw new Error('无权访问该课程')
  return true
}

export async function create(data) {
  const id = generateId()
  await pool.execute(
    `INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.teacherId, data.weekday, data.startTime, data.endTime,
     data.classroom || '', data.hoursPerClass || 1, JSON.stringify(data.studentIds || [])]
  )
  const [rows] = await pool.execute('SELECT * FROM courses WHERE id = ?', [id])
  return formatCourse(rows[0])
}

export async function update(id, data) {
  const [existing] = await pool.execute('SELECT * FROM courses WHERE id = ?', [id])
  if (existing.length === 0) throw new Error('课程不存在')

  const c = existing[0]
  const currentStudentIds = typeof c.student_ids === 'string' ? JSON.parse(c.student_ids) : (c.student_ids || [])

  await pool.execute(
    `UPDATE courses SET name = ?, teacher_id = ?, weekday = ?, start_time = ?, end_time = ?,
     classroom = ?, hours_per_class = ?, student_ids = ? WHERE id = ?`,
    [
      data.name ?? c.name,
      data.teacherId !== undefined ? data.teacherId : c.teacher_id,
      data.weekday !== undefined ? data.weekday : c.weekday,
      data.startTime ?? c.start_time,
      data.endTime ?? c.end_time,
      data.classroom !== undefined ? data.classroom : c.classroom,
      data.hoursPerClass !== undefined ? data.hoursPerClass : c.hours_per_class,
      JSON.stringify(data.studentIds || currentStudentIds),
      id
    ]
  )
  const [rows] = await pool.execute('SELECT * FROM courses WHERE id = ?', [id])
  return formatCourse(rows[0])
}

export async function remove(id) {
  await pool.execute('DELETE FROM courses WHERE id = ?', [id])
}
