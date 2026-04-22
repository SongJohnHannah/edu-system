import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDate, formatDateTime } from '../utils/dateFormat.js'

function formatAttendance(row) {
  return {
    ...row,
    date: formatDate(row.date),
    courseId: row.course_id,
    studentIds: typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : (row.student_ids || []),
    hoursDeducted: row.hours_deducted,
    recordedBy: row.recorded_by,
    isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at)
  }
}

export async function getAll(teacherScope, { limit = 50, offset = 0 } = {}) {
  const limitNum = Math.min(parseInt(limit) || 50, 200)
  const offsetNum = parseInt(offset) || 0
  const fetchCount = limitNum + 1

  if (!teacherScope) {
    const [rows] = await pool.execute(
      `SELECT * FROM attendance ORDER BY created_at DESC LIMIT ${fetchCount} OFFSET ${offsetNum}`
    )
    const hasMore = rows.length > limitNum
    const data = hasMore ? rows.slice(0, limitNum) : rows
    return { data: data.map(formatAttendance), hasMore }
  }
  const [rows] = await pool.execute(`
    SELECT * FROM attendance
    WHERE recorded_by = ?
    ORDER BY created_at DESC
    LIMIT ${fetchCount} OFFSET ${offsetNum}
  `, [teacherScope])
  const hasMore = rows.length > limitNum
  const data = hasMore ? rows.slice(0, limitNum) : rows
  return { data: data.map(formatAttendance), hasMore }
}

export async function create(data, teacherScope, user) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    if (teacherScope) {
      const [courses] = await conn.execute('SELECT teacher_id FROM courses WHERE id = ?', [data.courseId])
      if (!courses[0] || courses[0].teacher_id !== teacherScope) {
        throw new Error('无权操作该课程')
      }
    }

    const id = generateId()
    const recordedBy = teacherScope || null
    await conn.execute(
      'INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, recorded_by, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.courseId, data.date, JSON.stringify(data.studentIds), data.hoursDeducted || 1, recordedBy, data.isTest ? 1 : 0]
    )

    // Batch update students used_hours
    const hours = data.hoursDeducted || 1
    const placeholders = data.studentIds.map(() => '?').join(',')
    await conn.execute(
      `UPDATE students SET used_hours = used_hours + ? WHERE id IN (${placeholders})`,
      [hours, ...data.studentIds]
    )

    // Batch insert hour_records (parameterized)
    for (const sid of data.studentIds) {
      await conn.execute(
        'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateId(), sid, 'deduct', hours, '点名扣除', id, user.username]
      )
    }

    await conn.commit()
    const [rows] = await pool.execute('SELECT * FROM attendance WHERE id = ?', [id])
    return rows[0] ? formatAttendance(rows[0]) : null
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function remove(attendanceId, teacherScope) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [records] = await conn.execute('SELECT * FROM attendance WHERE id = ?', [attendanceId])
    if (records.length === 0) throw new Error('点名记录不存在')

    const record = records[0]
    const studentIds = typeof record.student_ids === 'string' ? JSON.parse(record.student_ids) : (record.student_ids || [])

    if (teacherScope) {
      if (record.recorded_by && record.recorded_by !== teacherScope) {
        throw new Error('只能删除自己创建的点名记录')
      }
    }

    // Batch restore hours
    const placeholders = studentIds.map(() => '?').join(',')
    await conn.execute(
      `UPDATE students SET used_hours = GREATEST(0, used_hours - ?) WHERE id IN (${placeholders})`,
      [record.hours_deducted, ...studentIds]
    )

    // Batch insert restore records (parameterized)
    for (const sid of studentIds) {
      await conn.execute(
        'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateId(), sid, 'restore', record.hours_deducted, '删除点名记录还原', attendanceId, 'restore']
      )
    }

    await conn.execute('DELETE FROM attendance WHERE id = ?', [attendanceId])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function removeStudents(attendanceId, studentIdsToRemove, teacherScope) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [records] = await conn.execute('SELECT * FROM attendance WHERE id = ?', [attendanceId])
    if (records.length === 0) throw new Error('点名记录不存在')

    const record = records[0]
    const currentStudentIds = typeof record.student_ids === 'string' ? JSON.parse(record.student_ids) : (record.student_ids || [])

    if (teacherScope) {
      if (record.recorded_by && record.recorded_by !== teacherScope) {
        throw new Error('只能删除自己创建的点名记录')
      }
    }

    const removeSet = new Set(studentIdsToRemove)
    const remainingIds = currentStudentIds.filter(id => !removeSet.has(id))

    // Batch restore hours
    const placeholders = studentIdsToRemove.map(() => '?').join(',')
    await conn.execute(
      `UPDATE students SET used_hours = GREATEST(0, used_hours - ?) WHERE id IN (${placeholders})`,
      [record.hours_deducted, ...studentIdsToRemove]
    )

    // Batch insert restore records (parameterized)
    for (const sid of studentIdsToRemove) {
      await conn.execute(
        'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateId(), sid, 'restore', record.hours_deducted, '删除点名记录还原', attendanceId, 'restore']
      )
    }

    if (remainingIds.length === 0) {
      await conn.execute('DELETE FROM attendance WHERE id = ?', [attendanceId])
    } else {
      await conn.execute(
        'UPDATE attendance SET student_ids = ? WHERE id = ?',
        [JSON.stringify(remainingIds), attendanceId]
      )
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
