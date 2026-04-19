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

  // Single query to get attendance stats per teacher
  const [attStats] = await pool.execute(`
    SELECT c.teacher_id,
           COUNT(a.id) AS attendance_count,
           COALESCE(SUM(
             (a.hours_deducted || 1) * JSON_LENGTH(a.student_ids)
           ), 0) AS consumed_hours
    FROM courses c
    LEFT JOIN attendance a ON a.course_id = c.id AND a.date BETWEEN ? AND ?
    WHERE c.teacher_id IN (${teacherIds.map(() => '?').join(',')})
    GROUP BY c.teacher_id
  `, [startDate, endDate, ...teacherIds])

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
  let params = [startDate, endDate]
  let courseParams = []

  if (teacherScope) {
    teacherWhere = ' WHERE id = ?'
    courseFilter = ' AND c.teacher_id = ?'
    params.push(teacherScope)
    courseParams = [teacherScope]
  }

  const [[{ totalTeachers }]] = await pool.execute(
    `SELECT COUNT(*) AS totalTeachers FROM teachers${teacherWhere}`,
    teacherScope ? [teacherScope] : []
  )

  const [stats] = await pool.execute(`
    SELECT COUNT(DISTINCT c.id) AS totalCourses,
           COUNT(a.id) AS totalAttendance,
           COALESCE(SUM(
             (a.hours_deducted || 1) * JSON_LENGTH(a.student_ids)
           ), 0) AS totalConsumedHours,
           COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN c.teacher_id END) AS activeTeachers
    FROM courses c
    LEFT JOIN attendance a ON a.course_id = c.id AND a.date BETWEEN ? AND ?
    WHERE 1=1 ${courseFilter}
  `, params)

  return {
    totalTeachers,
    activeTeachers: stats[0].activeTeachers || 0,
    totalCourses: stats[0].totalCourses || 0,
    totalAttendance: stats[0].totalAttendance || 0,
    totalConsumedHours: stats[0].totalConsumedHours || 0
  }
}
