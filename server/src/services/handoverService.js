import pool from '../config/database.js'
import { generateId } from '../utils/helpers.js'
import { formatDateTime } from '../utils/dateFormat.js'
import { acquireScheduleLock, closeScheduleConnection, ensureCourseCanChange, assertCourseFutureAvailable, assertRecurringAvailable, weekStartOf, iso } from './scheduleService.js'

export async function performHandover({ courseId, newTeacherId, performedBy, reason }) {
  const conn = await pool.getConnection()
  let locked = false
  try {
    await acquireScheduleLock(conn)
    locked = true
    await conn.beginTransaction()

    // 查询课程
    const [courses] = await conn.execute('SELECT * FROM courses WHERE id = ?', [courseId])
    if (courses.length === 0) throw Object.assign(new Error('课程不存在'), { status: 404 })
    const course = courses[0]
    if (course.archived_at) throw Object.assign(new Error('归档课程不能交接'), { status: 409 })

    // 查询新教师
    const [newTeachers] = await conn.execute("SELECT * FROM teachers WHERE id = ? AND status = 'active'", [newTeacherId])
    if (newTeachers.length === 0) throw Object.assign(new Error('目标教师不存在或已停用'), { status: 404 })
    const newTeacher = newTeachers[0]

    // 查询原教师
    const [oldTeachers] = await conn.execute('SELECT * FROM teachers WHERE id = ?', [course.teacher_id])
    if (oldTeachers.length === 0) throw Object.assign(new Error('原教师不存在'), { status: 409 })
    const oldTeacher = oldTeachers[0]

    if (course.teacher_id === newTeacherId) {
      throw Object.assign(new Error('新教师与当前教师相同，无需交接'), { status: 409 })
    }

    await ensureCourseCanChange(conn, courseId)
    // 插入交接记录
    const id = generateId()
    await conn.execute(
      `INSERT INTO course_handovers (id, course_id, course_name, old_teacher_id, old_teacher_name, new_teacher_id, new_teacher_name, performed_by, reason, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, courseId, course.name, oldTeacher.id, oldTeacher.name, newTeacher.id, newTeacher.name, performedBy, reason || null, course.is_test || 0]
    )

    // 更新课程教师
    await conn.execute('UPDATE courses SET teacher_id = ? WHERE id = ?', [newTeacherId, courseId])

    await assertCourseFutureAvailable(conn, courseId)
    await conn.commit()

    return {
      id,
      courseId,
      courseName: course.name,
      oldTeacherId: oldTeacher.id,
      oldTeacherName: oldTeacher.name,
      newTeacherId: newTeacher.id,
      newTeacherName: newTeacher.name,
      performedBy,
      reason,
      createdAt: new Date().toISOString()
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    await closeScheduleConnection(conn, locked)
  }
}

export async function getHandoverHistory({ courseId } = {}) {
  let sql = 'SELECT * FROM course_handovers'
  const params = []
  if (courseId) {
    sql += ' WHERE course_id = ?'
    params.push(courseId)
  }
  sql += ' ORDER BY created_at DESC'

  const [rows] = await pool.execute(sql, params)
  return rows.map(row => ({
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    oldTeacherId: row.old_teacher_id,
    oldTeacherName: row.old_teacher_name,
    newTeacherId: row.new_teacher_id,
    newTeacherName: row.new_teacher_name,
    performedBy: row.performed_by,
    reason: row.reason,
    createdAt: formatDateTime(row.created_at)
  }))
}
