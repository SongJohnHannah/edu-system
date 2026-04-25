// 远程 API 存储适配器 - 所有函数与 storage.local.js 保持相同签名（async 版本）
import { api } from './api.js'

// ========== 学生相关 ==========

export async function getStudents() {
  return api.get('/students')
}

export async function addStudent(student) {
  const result = await api.post('/students', student)
  return api.get('/students')
}

export async function updateStudent(id, updates) {
  await api.put(`/students/${id}`, updates)
  return api.get('/students')
}

export async function deleteStudent(id) {
  await api.del(`/students/${id}`)
  return api.get('/students')
}

export async function checkStudentNameExists(name, excludeId = null) {
  const result = await api.get(`/students/check-name?name=${encodeURIComponent(name)}${excludeId ? '&excludeId=' + excludeId : ''}`)
  return result.exists
}

export async function saveStudents(students) {
  throw new Error('API 模式不支持批量保存，请使用 addStudent/updateStudent')
}

export async function addStudentsBatch(studentList, defaultHours = 0) {
  const result = await api.post('/students/batch', { students: studentList, defaultHours })
  const allStudents = await api.get('/students')
  return { students: allStudents, addedCount: result.addedCount, skipped: result.skipped || [] }
}

export async function updateStudentStatus(studentId, status) {
  await api.put(`/students/${studentId}/status`, { status })
  return api.get('/students')
}

export async function addHours(studentId, hours, remark = '') {
  await api.post(`/students/${studentId}/add-hours`, { hours, remark })
  return api.get('/students')
}

export async function subtractHours(studentId, hours, remark = '') {
  await api.post(`/students/${studentId}/subtract-hours`, { hours, remark })
  return api.get('/students')
}

// ========== 教师相关 ==========

export async function getTeachers() {
  return api.get('/teachers')
}

export async function saveTeachers(teachers) {
  throw new Error('API 模式不支持批量保存')
}

export async function addTeacher(teacher) {
  const result = await api.post('/teachers', teacher)
  const allTeachers = await api.get('/teachers')
  return { students: allTeachers, defaultPassword: result.defaultPassword, username: result.username }
}

export async function updateTeacher(id, updates) {
  await api.put(`/teachers/${id}`, updates)
  return api.get('/teachers')
}

export async function deleteTeacher(id) {
  await api.del(`/teachers/${id}`)
  return api.get('/teachers')
}

export async function updateTeacherStatus(id, status) {
  await api.put(`/teachers/${id}/status`, { status })
  return api.get('/teachers')
}

// ========== 课程相关 ==========

export async function getCourses() {
  return api.get('/courses')
}

export async function saveCourses(courses) {
  throw new Error('API 模式不支持批量保存')
}

export async function addCourse(course) {
  await api.post('/courses', course)
  return api.get('/courses')
}

export async function updateCourse(id, updates) {
  await api.put(`/courses/${id}`, updates)
  return api.get('/courses')
}

export async function deleteCourse(id) {
  await api.del(`/courses/${id}`)
  return api.get('/courses')
}

// ========== 点名记录相关 ==========

export async function getAttendance({ limit, offset } = {}) {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit)
  if (offset) params.set('offset', offset)
  const query = params.toString()
  const result = await api.get(`/attendance${query ? '?' + query : ''}`)
  // Support both old array and new paginated format
  if (Array.isArray(result)) return result
  return result.data || result
}

export async function getAttendancePage({ limit = 50, offset = 0 } = {}) {
  const result = await api.get(`/attendance?limit=${limit}&offset=${offset}`)
  if (Array.isArray(result)) return { data: result, hasMore: false }
  return result
}

export async function addAttendance(record) {
  return api.post('/attendance', record)
}

export async function deductHours(studentId, hours, relatedId = null) {
  await api.post('/attendance', {
    courseId: relatedId,
    studentIds: [studentId],
    hoursDeducted: hours
  })
  return api.get('/students')
}

export async function restoreHours(studentId, hours) {
  throw new Error('请使用 deleteAttendance 或 removeStudentsFromRecord')
}

export async function deleteAttendance(attendanceId) {
  await api.del(`/attendance/${attendanceId}`)
  const result = await api.get('/attendance')
  if (Array.isArray(result)) return result
  return result.data || result
}

export async function removeStudentsFromRecord(attendanceId, studentIdsToRemove) {
  await api.post(`/attendance/${attendanceId}/remove-students`, { studentIds: studentIdsToRemove })
  const result = await api.get('/attendance?limit=50')
  if (Array.isArray(result)) return result
  return result.data || result
}

// ========== 课时记录相关 ==========

export async function getHourRecords() {
  return api.get('/hour-records')
}

export async function saveHourRecords(records) {
  throw new Error('API 模式不支持批量保存')
}

export async function addHourRecord(record) {
  return api.post('/hour-records', record)
}

export async function getHourRecordsByStudent(studentId) {
  const result = await api.get(`/hour-records?studentId=${studentId}&limit=500`)
  if (Array.isArray(result)) return result
  return result.data || result
}

// ========== 班级管理 ==========

export async function getClasses() {
  return api.get('/classes')
}

export async function saveClasses(classes) {
  throw new Error('API 模式不支持批量保存')
}

export async function addClass(cls) {
  await api.post('/classes', cls)
  return api.get('/classes')
}

export async function updateClass(id, updates) {
  await api.put(`/classes/${id}`, updates)
  return api.get('/classes')
}

export async function deleteClass(id) {
  await api.del(`/classes/${id}`)
  return api.get('/classes')
}

export async function getClassName(classId) {
  if (!classId) return ''
  const classes = await api.get('/classes')
  const cls = classes.find(c => c.id === classId)
  return cls ? cls.name : ''
}

// ========== 数据备份与恢复 ==========

export async function exportData() {
  const resp = await fetch('/edusystem/api/backup/export', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
  })
  return await resp.text()
}

export async function importData(fileContent) {
  try {
    if (fileContent.trim().startsWith('--')) {
      const resp = await fetch('/edusystem/api/backup/import-sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: fileContent
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }))
        return { success: false, message: err.message || err.error || 'SQL导入失败' }
      }
      return await resp.json()
    }
    const importObj = JSON.parse(fileContent)
    if (!importObj.data) {
      return { success: false, message: '无效的备份文件格式' }
    }
    const result = await api.post('/backup/import', importObj.data)
    return result
  } catch (err) {
    return { success: false, message: '数据导入失败：' + err.message }
  }
}

export async function downloadBackup() {
  try {
    const sqlContent = await exportData()
    const blob = new Blob([sqlContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `嘉言思听教务系统备份_${timestamp}.sql`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('导出失败:', error)
  }
}

// ========== 工具函数 ==========

export async function getStorePath() {
  return '远程数据库 (MySQL)'
}

export function checkIsElectron() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:'
}

// ========== 统计相关 ==========

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getTeacherStats(startDate, endDate) {
  const start = toLocalDate(startDate)
  const end = toLocalDate(endDate)
  return api.get(`/stats/teachers?start=${start}&end=${end}`)
}

export async function getWeekdayDistribution() {
  return api.get('/stats/weekday-distribution')
}

export async function getOverallStats(startDate, endDate) {
  const start = toLocalDate(startDate)
  const end = toLocalDate(endDate)
  return api.get(`/stats/overall?start=${start}&end=${end}`)
}

export function getDateRange(preset) {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  switch (preset) {
    case 'today':
      return { start: startOfDay, end: startOfDay }
    case 'week': {
      const dayOfWeek = today.getDay() || 7
      const start = new Date(startOfDay)
      start.setDate(start.getDate() - dayOfWeek + 1)
      return { start, end: startOfDay }
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start, end: startOfDay }
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { start, end: startOfDay }
    }
    default:
      return { start: startOfDay, end: startOfDay }
  }
}

// ========== 交接管理 ==========

export async function performHandover(courseId, newTeacherId, reason) {
  return api.post('/handovers', { courseId, newTeacherId, reason })
}

export async function getHandoverHistory(courseId) {
  const params = courseId ? `?courseId=${courseId}` : ''
  return api.get(`/handovers${params}`)
}

// ========== 初始化 ==========

export async function initStorage() {
  // API 模式无需初始化
}
