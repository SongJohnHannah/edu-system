import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'

function formatStudent(row) {
  return {
    ...row,
    totalHours: Number(row.total_hours),
    usedHours: Number(row.used_hours),
    classId: row.class_id,
    createdBy: row.created_by,
    creatorId: row.creator_id,
    isTest: !!row.is_test,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at)
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
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [dup] = await conn.execute('SELECT id FROM students WHERE name = ? FOR UPDATE', [data.name])
    if (dup.length > 0) throw new Error('学生姓名已存在')

    if (data.phone) {
      const [phoneDup] = await conn.execute('SELECT id FROM students WHERE phone = ? AND phone != "" FOR UPDATE', [data.phone])
      if (phoneDup.length > 0) throw new Error('该手机号已被其他学生使用')
    }

    const id = generateId()
    await conn.execute(
      `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id, is_test)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`,
      [id, data.name, data.phone || '', data.age || null, data.remark || '', data.totalHours || 0, data.classId || '',
       data.createdBy || 'admin', data.creatorId || null, data.isTest ? 1 : 0]
    )
    await conn.commit()
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
    return formatStudent(rows[0])
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function update(id, data) {
  const [existing] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  if (existing.length === 0) throw new Error('学生不存在')

  if (data.name) {
    const [dup] = await pool.execute('SELECT id FROM students WHERE name = ? AND id != ?', [data.name, id])
    if (dup.length > 0) throw new Error('学生姓名已存在')
  }

  if (data.phone) {
    const [phoneDup] = await pool.execute('SELECT id FROM students WHERE phone = ? AND id != ? AND phone != ""', [data.phone, id])
    if (phoneDup.length > 0) throw new Error('该手机号已被其他学生使用')
  }

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
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('DELETE FROM hour_records WHERE student_id = ?', [id])
    const [records] = await conn.execute('SELECT id, student_ids FROM attendance WHERE JSON_CONTAINS(student_ids, JSON_QUOTE(?))', [id])
    for (const r of records) {
      const ids = typeof r.student_ids === 'string' ? JSON.parse(r.student_ids) : (r.student_ids || [])
      const remaining = ids.filter(sid => sid !== id)
      if (remaining.length === 0) {
        await conn.execute('DELETE FROM attendance WHERE id = ?', [r.id])
      } else {
        await conn.execute('UPDATE attendance SET student_ids = ? WHERE id = ?', [JSON.stringify(remaining), r.id])
      }
    }
    const [courses] = await conn.execute('SELECT id, student_ids FROM courses WHERE JSON_CONTAINS(student_ids, JSON_QUOTE(?))', [id])
    for (const c of courses) {
      const ids = typeof c.student_ids === 'string' ? JSON.parse(c.student_ids) : (c.student_ids || [])
      const remaining = ids.filter(sid => sid !== id)
      await conn.execute('UPDATE courses SET student_ids = ? WHERE id = ?', [JSON.stringify(remaining), c.id])
    }
    await conn.execute('DELETE FROM students WHERE id = ?', [id])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
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
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('UPDATE students SET total_hours = total_hours + ? WHERE id = ?', [hours, id])
    const recordId = generateId()
    await conn.execute(
      'INSERT INTO hour_records (id, student_id, type, hours, remark, operator) VALUES (?, ?, ?, ?, ?, ?)',
      [recordId, id, 'add', hours, remark || '手动添加', operator || 'manual']
    )
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function subtractHours(id, hours, remark, operator) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [students] = await conn.execute('SELECT * FROM students WHERE id = ? FOR UPDATE', [id])
    if (students.length === 0) throw new Error('学生不存在')
    const student = students[0]
    await conn.execute('UPDATE students SET total_hours = total_hours - ? WHERE id = ?', [hours, id])
    const recordId = generateId()
    await conn.execute(
      'INSERT INTO hour_records (id, student_id, type, hours, remark, operator) VALUES (?, ?, ?, ?, ?, ?)',
      [recordId, id, 'subtract', hours, remark || '手动减少', operator || 'manual']
    )
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [id])
  return rows[0] ? formatStudent(rows[0]) : null
}

export async function addBatch(studentList, defaultHours, createdBy = 'admin', creatorId = null) {
  const conn = await pool.getConnection()
  let addedCount = 0
  const skipped = []
  try {
    await conn.beginTransaction()
    for (const student of studentList) {
      if (student.name && student.name.trim()) {
        const name = student.name.trim()
        const [dup] = await conn.execute('SELECT id FROM students WHERE name = ?', [name])
        if (dup.length > 0) {
          skipped.push(name)
          continue
        }
        if (student.phone) {
          const [phoneDup] = await conn.execute('SELECT id FROM students WHERE phone = ? AND phone != ""', [student.phone])
          if (phoneDup.length > 0) {
            skipped.push(name)
            continue
          }
        }
        const id = generateId()
        await conn.execute(
          `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id, is_test)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`,
          [id, name, '', student.age || null, '', student.totalHours || defaultHours || 0, student.classId || '',
           createdBy, creatorId, student.isTest ? 1 : 0]
        )
        addedCount++
      }
    }
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  return { addedCount, skipped }
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
