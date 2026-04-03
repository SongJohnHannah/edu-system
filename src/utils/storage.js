// 数据存储工具 - SQLite 版本
import { initDatabase, query, queryAll, queryOne, generateId, saveDatabase } from './db'

let initialized = false

// 确保数据库已初始化
async function ensureInit() {
  if (!initialized) {
    await initDatabase()
    initialized = true
  }
}

// 同步检查（用于兼容旧 API）
function checkInit() {
  if (!initialized) {
    throw new Error('数据库未初始化，请先调用 initDatabase()')
  }
}

// ========== 初始化 ==========

export async function initStorage() {
  await ensureInit()
}

// ========== 学生相关 ==========

export function getStudents() {
  checkInit()
  return queryAll('SELECT * FROM students ORDER BY created_at DESC').map(s => ({
    ...s,
    totalHours: s.total_hours,
    usedHours: s.used_hours,
    classId: s.class_id,
    createdAt: s.created_at,
    updatedAt: s.updated_at
  }))
}

export function saveStudents(students) {
  checkInit()
  query('DELETE FROM students')
  students.forEach(s => {
    query(`INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.phone || '', s.age, s.remark || '', s.totalHours, s.usedHours || 0, s.status || 'active', s.classId || '', s.createdAt, s.updatedAt]
    )
  })
}

export function addStudent(student) {
  checkInit()
  const id = generateId()
  const now = Date.now()
  query(`INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, student.name, student.phone || '', student.age, student.remark || '', student.totalHours, 0, 'active', student.classId || '', now, now]
  )
  return getStudents()
}

export function updateStudent(id, updates) {
  checkInit()
  const student = queryOne('SELECT * FROM students WHERE id = ?', [id])
  if (student) {
    query(`UPDATE students SET name = ?, phone = ?, age = ?, remark = ?, total_hours = ?, used_hours = ?, status = ?, class_id = ?, updated_at = ? WHERE id = ?`,
      [updates.name || student.name,
       updates.phone !== undefined ? updates.phone : student.phone,
       updates.age !== undefined ? updates.age : student.age,
       updates.remark !== undefined ? updates.remark : student.remark,
       updates.totalHours !== undefined ? updates.totalHours : student.total_hours,
       updates.usedHours !== undefined ? updates.usedHours : student.used_hours,
       updates.status || student.status,
       updates.classId !== undefined ? updates.classId : student.class_id,
       Date.now(), id]
    )
  }
  return getStudents()
}

export function deleteStudent(id) {
  checkInit()
  query('DELETE FROM students WHERE id = ?', [id])
  return getStudents()
}

export function checkStudentNameExists(name, excludeId = null) {
  checkInit()
  if (excludeId) {
    const result = queryOne('SELECT id FROM students WHERE name = ? AND id != ?', [name, excludeId])
    return !!result
  }
  const result = queryOne('SELECT id FROM students WHERE name = ?', [name])
  return !!result
}

// ========== 教师相关 ==========

export function getTeachers() {
  checkInit()
  return queryAll('SELECT * FROM teachers ORDER BY created_at DESC').map(t => ({
    ...t,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  }))
}

export function saveTeachers(teachers) {
  checkInit()
  query('DELETE FROM teachers')
  teachers.forEach(t => {
    query(`INSERT INTO teachers (id, name, phone, subject, remark, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [t.id, t.name, t.phone || '', t.subject || '', t.remark || '', t.createdAt, t.updatedAt]
    )
  })
}

export function addTeacher(teacher) {
  checkInit()
  const id = generateId()
  const now = Date.now()
  query(`INSERT INTO teachers (id, name, phone, subject, remark, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, teacher.name, teacher.phone || '', teacher.subject || '', teacher.remark || '', now, now]
  )
  return getTeachers()
}

export function updateTeacher(id, updates) {
  checkInit()
  const teacher = queryOne('SELECT * FROM teachers WHERE id = ?', [id])
  if (teacher) {
    query(`UPDATE teachers SET name = ?, phone = ?, subject = ?, remark = ?, updated_at = ? WHERE id = ?`,
      [updates.name || teacher.name,
       updates.phone !== undefined ? updates.phone : teacher.phone,
       updates.subject !== undefined ? updates.subject : teacher.subject,
       updates.remark !== undefined ? updates.remark : teacher.remark,
       Date.now(), id]
    )
  }
  return getTeachers()
}

export function deleteTeacher(id) {
  checkInit()
  query('DELETE FROM teachers WHERE id = ?', [id])
  return getTeachers()
}

// ========== 课程相关 ==========

export function getCourses() {
  checkInit()
  return queryAll('SELECT * FROM courses ORDER BY created_at DESC').map(c => ({
    ...c,
    teacherId: c.teacher_id,
    startTime: c.start_time,
    endTime: c.end_time,
    hoursPerClass: c.hours_per_class,
    studentIds: JSON.parse(c.student_ids || '[]'),
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }))
}

export function saveCourses(courses) {
  checkInit()
  query('DELETE FROM courses')
  courses.forEach(c => {
    query(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.teacherId, c.weekday, c.startTime, c.endTime, c.classroom || '', c.hoursPerClass || 1, JSON.stringify(c.studentIds || []), c.createdAt, c.updatedAt]
    )
  })
}

export function addCourse(course) {
  checkInit()
  const id = generateId()
  const now = Date.now()
  query(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, course.name, course.teacherId, course.weekday, course.startTime, course.endTime, course.classroom || '', course.hoursPerClass || 1, JSON.stringify(course.studentIds || []), now, now]
  )
  return getCourses()
}

export function updateCourse(id, updates) {
  checkInit()
  const course = queryOne('SELECT * FROM courses WHERE id = ?', [id])
  if (course) {
    query(`UPDATE courses SET name = ?, teacher_id = ?, weekday = ?, start_time = ?, end_time = ?, classroom = ?, hours_per_class = ?, student_ids = ?, updated_at = ? WHERE id = ?`,
      [updates.name || course.name,
       updates.teacherId !== undefined ? updates.teacherId : course.teacher_id,
       updates.weekday !== undefined ? updates.weekday : course.weekday,
       updates.startTime || course.start_time,
       updates.endTime || course.end_time,
       updates.classroom !== undefined ? updates.classroom : course.classroom,
       updates.hoursPerClass !== undefined ? updates.hoursPerClass : course.hours_per_class,
       JSON.stringify(updates.studentIds || JSON.parse(course.student_ids || '[]')),
       Date.now(), id]
    )
  }
  return getCourses()
}

export function deleteCourse(id) {
  checkInit()
  query('DELETE FROM courses WHERE id = ?', [id])
  return getCourses()
}

// ========== 点名记录相关 ==========

export function getAttendance() {
  checkInit()
  return queryAll('SELECT * FROM attendance ORDER BY created_at DESC').map(a => ({
    ...a,
    courseId: a.course_id,
    studentIds: JSON.parse(a.student_ids || '[]'),
    hoursDeducted: a.hours_deducted,
    createdAt: a.created_at
  }))
}

export function addAttendance(record) {
  checkInit()
  const id = generateId()
  const now = Date.now()
  query(`INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    [id, record.courseId, record.date, JSON.stringify(record.studentIds), record.hoursDeducted, now]
  )
}

export function deductHours(studentId, hours, relatedId = null) {
  checkInit()
  query('UPDATE students SET used_hours = used_hours + ?, updated_at = ? WHERE id = ?', [hours, Date.now(), studentId])
  addHourRecord({
    studentId,
    type: 'deduct',
    hours,
    remark: '点名扣除',
    relatedId,
    operator: 'attendance'
  })
  return getStudents()
}

export function restoreHours(studentId, hours) {
  checkInit()
  query('UPDATE students SET used_hours = MAX(0, used_hours - ?), updated_at = ? WHERE id = ?', [hours, Date.now(), studentId])
  return getStudents()
}

export function deleteAttendance(attendanceId) {
  checkInit()
  const record = queryOne('SELECT * FROM attendance WHERE id = ?', [attendanceId])
  if (record) {
    const studentIds = JSON.parse(record.student_ids || '[]')
    studentIds.forEach(studentId => {
      query('UPDATE students SET used_hours = MAX(0, used_hours - ?), updated_at = ? WHERE id = ?', [record.hours_deducted, Date.now(), studentId])
      addHourRecord({
        studentId,
        type: 'restore',
        hours: record.hours_deducted,
        remark: '删除点名记录还原',
        relatedId: attendanceId,
        operator: 'restore'
      })
    })
    query('DELETE FROM attendance WHERE id = ?', [attendanceId])
  }
  return getAttendance()
}

// ========== 课时记录相关 ==========

export function getHourRecords() {
  checkInit()
  return queryAll('SELECT * FROM hour_records ORDER BY created_at DESC').map(r => ({
    ...r,
    studentId: r.student_id,
    relatedId: r.related_id,
    createdAt: r.created_at
  }))
}

export function saveHourRecords(records) {
  checkInit()
  query('DELETE FROM hour_records')
  records.forEach(r => {
    query(`INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.studentId, r.type, r.hours, r.remark || '', r.relatedId, r.operator, r.createdAt]
    )
  })
}

export function addHourRecord(record) {
  checkInit()
  const id = generateId()
  const now = Date.now()
  query(`INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, record.studentId, record.type, record.hours, record.remark || '', record.relatedId, record.operator || 'manual', now]
  )
  return getHourRecords()
}

export function getHourRecordsByStudent(studentId) {
  checkInit()
  return queryAll('SELECT * FROM hour_records WHERE student_id = ? ORDER BY created_at DESC', [studentId]).map(r => ({
    ...r,
    studentId: r.student_id,
    relatedId: r.related_id,
    createdAt: r.created_at
  }))
}

// ========== 学生状态管理 ==========

export function updateStudentStatus(studentId, status) {
  checkInit()
  query('UPDATE students SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), studentId])
  return getStudents()
}

// ========== 批量添加学生 ==========

export function addStudentsBatch(studentList, defaultHours = 0) {
  checkInit()
  const timestamp = Date.now()
  let addedCount = 0

  studentList.forEach((student, index) => {
    if (student.name && student.name.trim()) {
      const id = generateId()
      query(`INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, student.name.trim(), '', student.age || null, '', student.totalHours || defaultHours, 0, 'active', '', timestamp + index, timestamp]
      )
      addedCount++
    }
  })

  return { students: getStudents(), addedCount }
}

// ========== 添加课时 ==========

export function addHours(studentId, hours, remark = '') {
  checkInit()
  query('UPDATE students SET total_hours = total_hours + ?, updated_at = ? WHERE id = ?', [hours, Date.now(), studentId])
  addHourRecord({
    studentId,
    type: 'add',
    hours,
    remark,
    operator: 'manual'
  })
  return getStudents()
}

// ========== 班级管理 ==========

export function getClasses() {
  checkInit()
  return queryAll('SELECT * FROM classes ORDER BY created_at DESC').map(c => ({
    ...c,
    createdAt: c.created_at
  }))
}

export function saveClasses(classes) {
  checkInit()
  query('DELETE FROM classes')
  classes.forEach(c => {
    query('INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)', [c.id, c.name, c.createdAt])
  })
}

export function addClass(cls) {
  checkInit()
  const id = generateId()
  query('INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)', [id, cls.name, Date.now()])
  return getClasses()
}

export function updateClass(id, updates) {
  checkInit()
  query('UPDATE classes SET name = ? WHERE id = ?', [updates.name, id])
  return getClasses()
}

export function deleteClass(id) {
  checkInit()
  query('DELETE FROM classes WHERE id = ?', [id])
  return getClasses()
}

export function getClassName(classId) {
  checkInit()
  if (!classId) return ''
  const cls = queryOne('SELECT name FROM classes WHERE id = ?', [classId])
  return cls ? cls.name : ''
}

// ========== 数据备份与恢复 ==========

export function exportData() {
  const data = {
    students: getStudents(),
    teachers: getTeachers(),
    courses: getCourses(),
    attendance: getAttendance(),
    hourRecords: getHourRecords(),
    classes: getClasses()
  }
  const exportObj = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    source: 'sqlite',
    data
  }
  return JSON.stringify(exportObj, null, 2)
}

export function importData(jsonString) {
  try {
    const importObj = JSON.parse(jsonString)

    if (!importObj.data) {
      throw new Error('无效的备份文件格式')
    }

    const { data } = importObj

    // 清空现有数据
    checkInit()
    query('DELETE FROM students')
    query('DELETE FROM teachers')
    query('DELETE FROM courses')
    query('DELETE FROM attendance')
    query('DELETE FROM hour_records')
    query('DELETE FROM classes')

    // 导入数据
    if (data.students) {
      data.students.forEach(s => {
        query(`INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.phone || '', s.age, s.remark || '', s.totalHours || s.total_hours || 0, s.usedHours || s.used_hours || 0, s.status || 'active', s.classId || s.class_id || '', s.createdAt || Date.now(), s.updatedAt || Date.now()]
        )
      })
    }

    if (data.teachers) {
      data.teachers.forEach(t => {
        query(`INSERT INTO teachers (id, name, phone, subject, remark, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.name, t.phone || '', t.subject || '', t.remark || '', t.createdAt || Date.now(), t.updatedAt || Date.now()]
        )
      })
    }

    if (data.courses) {
      data.courses.forEach(c => {
        query(`INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.teacherId || c.teacher_id, c.weekday, c.startTime || c.start_time, c.endTime || c.end_time, c.classroom || '', c.hoursPerClass || c.hours_per_class || 1, JSON.stringify(c.studentIds || []), c.createdAt || Date.now(), c.updatedAt || Date.now()]
        )
      })
    }

    if (data.attendance) {
      data.attendance.forEach(a => {
        query(`INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
          [a.id, a.courseId || a.course_id, a.date, JSON.stringify(a.studentIds || []), a.hoursDeducted || a.hours_deducted || 1, a.createdAt || Date.now()]
        )
      })
    }

    if (data.hourRecords) {
      data.hourRecords.forEach(r => {
        query(`INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.studentId || r.student_id, r.type, r.hours, r.remark || '', r.relatedId || r.related_id, r.operator || 'manual', r.createdAt || Date.now()]
        )
      })
    }

    if (data.classes) {
      data.classes.forEach(c => {
        query('INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)', [c.id, c.name, c.createdAt || Date.now()])
      })
    }

    saveDatabase()

    return { success: true, message: '数据导入成功' }
  } catch (error) {
    return { success: false, message: '数据导入失败：' + error.message }
  }
}

export function downloadBackup() {
  const jsonStr = exportData()
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `教务系统备份_${timestamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function getStorePath() {
  return 'IndexedDB: edu-system-db'
}

export function checkIsElectron() {
  return false
}
