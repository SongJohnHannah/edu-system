import pool from '../config/database.js'
import { formatDate, formatDateTime } from '../utils/dateFormat.js'

function formatStudent(row) {
  return { ...row, totalHours: row.total_hours, usedHours: row.used_hours, classId: row.class_id, createdBy: row.created_by, creatorId: row.creator_id, isTest: !!row.is_test, createdAt: formatDateTime(row.created_at), updatedAt: formatDateTime(row.updated_at) }
}
function formatTeacher(row) {
  return { ...row, isTest: !!row.is_test, createdAt: formatDateTime(row.created_at), updatedAt: formatDateTime(row.updated_at) }
}
function formatCourse(row) {
  return { ...row, teacherId: row.teacher_id, startTime: row.start_time, endTime: row.end_time, hoursPerClass: row.hours_per_class, studentIds: typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : (row.student_ids || []), isTest: !!row.is_test, createdAt: formatDateTime(row.created_at), updatedAt: formatDateTime(row.updated_at) }
}

export async function exportData() {
  const [students] = await pool.execute('SELECT * FROM students')
  const [teachers] = await pool.execute('SELECT * FROM teachers')
  const [courses] = await pool.execute('SELECT * FROM courses')
  const [attendance] = await pool.execute('SELECT * FROM attendance')
  const [hourRecords] = await pool.execute('SELECT * FROM hour_records')
  const [classes] = await pool.execute('SELECT * FROM classes')
  const [handovers] = await pool.execute('SELECT * FROM course_handovers')

  return {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    source: 'mysql',
    data: {
      students: students.map(formatStudent),
      teachers: teachers.map(formatTeacher),
      courses: courses.map(formatCourse),
      attendance: attendance.map(a => ({
        ...a,
        date: formatDate(a.date),
        courseId: a.course_id,
        studentIds: typeof a.student_ids === 'string' ? JSON.parse(a.student_ids) : (a.student_ids || []),
        hoursDeducted: a.hours_deducted,
        recordedBy: a.recorded_by,
        isTest: !!a.is_test,
        createdAt: formatDateTime(a.created_at)
      })),
      hourRecords: hourRecords.map(r => ({
        ...r,
        studentId: r.student_id,
        relatedId: r.related_id,
        isTest: !!r.is_test,
        createdAt: formatDateTime(r.created_at)
      })),
      classes: classes.map(c => ({
        ...c,
        createdAt: formatDateTime(c.created_at)
      })),
      handovers: handovers.map(h => ({
        ...h,
        courseId: h.course_id,
        oldTeacherId: h.old_teacher_id,
        newTeacherId: h.new_teacher_id,
        createdAt: formatDateTime(h.created_at)
      }))
    }
  }
}

export async function exportSQL() {
  const [students] = await pool.execute('SELECT * FROM students')
  const [teachers] = await pool.execute('SELECT * FROM teachers')
  const [courses] = await pool.execute('SELECT * FROM courses')
  const [attendance] = await pool.execute('SELECT * FROM attendance')
  const [hourRecords] = await pool.execute('SELECT * FROM hour_records')
  const [classes] = await pool.execute('SELECT * FROM classes')
  const [handovers] = await pool.execute('SELECT * FROM course_handovers')

  const lines = []
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  lines.push('-- 嘉言思听教务系统 SQL 备份')
  lines.push(`-- 导出时间: ${now}`)
  lines.push('')

  function escape(val) {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return val ? '1' : '0'
    if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`
    if (Array.isArray(val) || typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "\\'")}'`
    return `'${String(val).replace(/'/g, "\\'")}'`
  }

  function insertBlock(table, columns, rows) {
    if (!rows.length) return
    lines.push(`-- ${table} (${rows.length} 条)`)
    lines.push(`TRUNCATE TABLE ${table};`)
    for (const row of rows) {
      const vals = columns.map(col => escape(row[col]))
      lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${vals.join(', ')});`)
    }
    lines.push('')
  }

  insertBlock('classes', ['id', 'name', 'created_at'], classes)
  insertBlock('teachers', ['id', 'name', 'phone', 'subject', 'remark', 'created_at', 'updated_at'], teachers)
  insertBlock('students', ['id', 'name', 'phone', 'age', 'remark', 'total_hours', 'used_hours', 'status', 'class_id', 'created_by', 'creator_id', 'is_test', 'created_at', 'updated_at'], students)
  insertBlock('courses', ['id', 'name', 'teacher_id', 'weekday', 'start_time', 'end_time', 'classroom', 'hours_per_class', 'student_ids', 'created_at', 'updated_at'], courses)
  insertBlock('attendance', ['id', 'course_id', 'date', 'student_ids', 'hours_deducted', 'recorded_by', 'is_test', 'created_at'], attendance)
  insertBlock('hour_records', ['id', 'student_id', 'type', 'hours', 'remark', 'related_id', 'operator', 'is_test', 'created_at'], hourRecords)
  insertBlock('course_handovers', ['id', 'course_id', 'course_name', 'old_teacher_id', 'old_teacher_name', 'new_teacher_id', 'new_teacher_name', 'performed_by', 'reason', 'created_at'], handovers)

  return lines.join('\n')
}

export async function importData(data) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.execute('DELETE FROM hour_records')
    await conn.execute('DELETE FROM attendance')
    await conn.execute('DELETE FROM course_handovers')
    await conn.execute('DELETE FROM courses')
    await conn.execute('DELETE FROM students')
    await conn.execute('DELETE FROM teachers')
    await conn.execute('DELETE FROM classes')

    if (data.classes) {
      for (const c of data.classes) {
        await conn.execute(
          'INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)',
          [c.id, c.name, c.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.teachers) {
      for (const t of data.teachers) {
        await conn.execute(
          'INSERT INTO teachers (id, name, phone, subject, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [t.id, t.name, t.phone || '', t.subject || '', t.remark || '',
           t.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
           t.updatedAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.students) {
      for (const s of data.students) {
        await conn.execute(
          `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_by, creator_id, is_test, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.phone || '', s.age || null, s.remark || '',
           s.totalHours || s.total_hours || 0, s.usedHours || s.used_hours || 0,
           s.status || 'active', s.classId || s.class_id || '',
           s.createdBy || s.created_by || 'admin', s.creatorId || s.creator_id || null,
           s.isTest || s.is_test ? 1 : 0,
           s.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
           s.updatedAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.courses) {
      for (const c of data.courses) {
        await conn.execute(
          `INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.teacherId || c.teacher_id, c.weekday,
           c.startTime || c.start_time, c.endTime || c.end_time,
           c.classroom || '', c.hoursPerClass || c.hours_per_class || 1,
           JSON.stringify(c.studentIds || []),
           c.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
           c.updatedAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.attendance) {
      for (const a of data.attendance) {
        await conn.execute(
          'INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, recorded_by, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [a.id, a.courseId || a.course_id, a.date,
           JSON.stringify(a.studentIds || []),
           a.hoursDeducted || a.hours_deducted || 1,
           a.recordedBy || a.recorded_by || null,
           a.isTest || a.is_test ? 1 : 0,
           a.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.hourRecords) {
      for (const r of data.hourRecords) {
        await conn.execute(
          'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.studentId || r.student_id, r.type, r.hours, r.remark || '',
           r.relatedId || r.related_id, r.operator || 'manual',
           r.isTest || r.is_test ? 1 : 0,
           r.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.handovers) {
      for (const h of data.handovers) {
        await conn.execute(
          `INSERT INTO course_handovers (id, course_id, course_name, old_teacher_id, old_teacher_name, new_teacher_id, new_teacher_name, performed_by, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [h.id, h.courseId || h.course_id, h.courseName || h.course_name || '',
           h.oldTeacherId || h.old_teacher_id, h.oldTeacherName || h.old_teacher_name || '',
           h.newTeacherId || h.new_teacher_id, h.newTeacherName || h.new_teacher_name || '',
           h.performedBy || h.performed_by || '', h.reason || '',
           h.createdAt || h.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    await conn.commit()
    return { success: true, message: '数据导入成功' }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function importSQL(sql) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const statements = sql
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const stmt of statements) {
      await conn.execute(stmt)
    }

    await conn.commit()
    return { success: true, message: 'SQL 数据恢复成功' }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
