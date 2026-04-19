import pool from '../config/database.js'

function formatStudent(row) {
  return { ...row, totalHours: row.total_hours, usedHours: row.used_hours, classId: row.class_id, createdAt: row.created_at, updatedAt: row.updated_at }
}
function formatTeacher(row) {
  return { ...row, createdAt: row.created_at, updatedAt: row.updated_at }
}
function formatCourse(row) {
  return { ...row, teacherId: row.teacher_id, startTime: row.start_time, endTime: row.end_time, hoursPerClass: row.hours_per_class, studentIds: typeof row.student_ids === 'string' ? JSON.parse(row.student_ids) : (row.student_ids || []), createdAt: row.created_at, updatedAt: row.updated_at }
}

export async function exportData() {
  const [students] = await pool.execute('SELECT * FROM students')
  const [teachers] = await pool.execute('SELECT * FROM teachers')
  const [courses] = await pool.execute('SELECT * FROM courses')
  const [attendance] = await pool.execute('SELECT * FROM attendance')
  const [hourRecords] = await pool.execute('SELECT * FROM hour_records')
  const [classes] = await pool.execute('SELECT * FROM classes')

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
        courseId: a.course_id,
        studentIds: typeof a.student_ids === 'string' ? JSON.parse(a.student_ids) : (a.student_ids || []),
        hoursDeducted: a.hours_deducted,
        createdAt: a.created_at
      })),
      hourRecords: hourRecords.map(r => ({
        ...r,
        studentId: r.student_id,
        relatedId: r.related_id,
        createdAt: r.created_at
      })),
      classes: classes.map(c => ({
        ...c,
        createdAt: c.created_at
      }))
    }
  }
}

export async function importData(data) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.execute('DELETE FROM hour_records')
    await conn.execute('DELETE FROM attendance')
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
          `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.phone || '', s.age || null, s.remark || '',
           s.totalHours || s.total_hours || 0, s.usedHours || s.used_hours || 0,
           s.status || 'active', s.classId || s.class_id || '',
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
          'INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [a.id, a.courseId || a.course_id, a.date,
           JSON.stringify(a.studentIds || []),
           a.hoursDeducted || a.hours_deducted || 1,
           a.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
        )
      }
    }

    if (data.hourRecords) {
      for (const r of data.hourRecords) {
        await conn.execute(
          'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.studentId || r.student_id, r.type, r.hours, r.remark || '',
           r.relatedId || r.related_id, r.operator || 'manual',
           r.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' ')]
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
