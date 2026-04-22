import pool from '../config/database.js'

export async function getTeacherStats(startDate, endDate, teacherScope) {
  let teacherQuery = 'SELECT id, name, phone, subject FROM teachers'
  let teacherParams = []
  if (teacherScope) {
    teacherQuery += ' WHERE id = ?'
    teacherParams = [teacherScope]
  }
  const [teachers] = await pool.execute(teacherQuery, teacherParams)

  const teacherIds = teachers.map(t => t.id)
  if (teacherIds.length === 0) return []

  // Single query to get course stats per teacher
  const [courseStats] = await pool.execute(`
    SELECT c.teacher_id,
           COUNT(DISTINCT c.id) AS course_count,
           COUNT(DISTINCT h.student_id) AS student_count
    FROM courses c
    LEFT JOIN (
      SELECT DISTINCT c2.id AS course_id, j.student_id
      FROM courses c2, JSON_TABLE(c2.student_ids, '$[*]' COLUMNS (student_id VARCHAR(36) PATH '$')) j
      WHERE c2.teacher_id IN (${teacherIds.map(() => '?').join(',')})
    ) h ON h.course_id = c.id
    WHERE c.teacher_id IN (${teacherIds.map(() => '?').join(',')})
    GROUP BY c.teacher_id
  `, [...teacherIds, ...teacherIds])

  // Attendance stats by actual recorder (recorded_by), not current course owner
  const [attStats] = await pool.execute(`
    SELECT a.recorded_by AS teacher_id,
           COUNT(a.id) AS attendance_count,
           COALESCE(SUM(
             (a.hours_deducted || 1) * JSON_LENGTH(a.student_ids)
           ), 0) AS consumed_hours
    FROM attendance a
    WHERE a.recorded_by IN (${teacherIds.map(() => '?').join(',')})
      AND a.date BETWEEN ? AND ?
    GROUP BY a.recorded_by
  `, [...teacherIds, startDate, endDate])

  const courseMap = new Map(courseStats.map(r => [r.teacher_id, r]))
  const attMap = new Map(attStats.map(r => [r.teacher_id, r]))

  return teachers.map(teacher => ({
    ...teacher,
    courseCount: courseMap.get(teacher.id)?.course_count || 0,
    studentCount: courseMap.get(teacher.id)?.student_count || 0,
    attendanceCount: attMap.get(teacher.id)?.attendance_count || 0,
    consumedHours: attMap.get(teacher.id)?.consumed_hours || 0
  }))
}

export async function getWeekdayDistribution(teacherScope) {
  let query = 'SELECT weekday, COUNT(*) AS cnt FROM courses'
  let params = []
  if (teacherScope) {
    query += ' WHERE teacher_id = ?'
    params = [teacherScope]
  }
  query += ' GROUP BY weekday'
  const [rows] = await pool.execute(query, params)
  const distribution = [0, 0, 0, 0, 0, 0, 0]
  rows.forEach(r => {
    if (r.weekday >= 1 && r.weekday <= 7) {
      distribution[r.weekday - 1] = r.cnt
    }
  })
  return distribution
}

export async function getOverallStats(startDate, endDate, teacherScope) {
  let teacherWhere = ''
  let courseFilter = ''
  let courseParams = []

  if (teacherScope) {
    teacherWhere = ' WHERE id = ?'
    courseFilter = ' AND c.teacher_id = ?'
    courseParams = [teacherScope]
  }

  const [[{ totalTeachers }]] = await pool.execute(
    `SELECT COUNT(*) AS totalTeachers FROM teachers${teacherWhere}`,
    teacherScope ? [teacherScope] : []
  )

  // Course count (by current ownership)
  const [[{ totalCourses }]] = await pool.execute(
    `SELECT COUNT(DISTINCT id) AS totalCourses FROM courses WHERE 1=1 ${courseFilter ? ' AND teacher_id = ?' : ''}`,
    courseParams
  )

  // Attendance stats (by recorded_by, the actual teacher who took attendance)
  const attFilter = teacherScope ? ' AND a.recorded_by = ?' : ''
  const [stats] = await pool.execute(`
    SELECT COUNT(a.id) AS totalAttendance,
           COALESCE(SUM(
             (a.hours_deducted || 1) * JSON_LENGTH(a.student_ids)
           ), 0) AS totalConsumedHours,
           COUNT(DISTINCT a.recorded_by) AS activeTeachers
    FROM attendance a
    WHERE a.date BETWEEN ? AND ? ${attFilter}
  `, teacherScope ? [startDate, endDate, teacherScope] : [startDate, endDate])

  return {
    totalTeachers,
    activeTeachers: stats[0].activeTeachers || 0,
    totalCourses: totalCourses || 0,
    totalAttendance: stats[0].totalAttendance || 0,
    totalConsumedHours: stats[0].totalConsumedHours || 0
  }
}
