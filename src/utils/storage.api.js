// 教务数据统一经服务端 API 读写。
import { api, apiUrl } from './api.js'

// ========== 学生相关 ==========

export async function getStudents() {
  return api.get('/students')
}

export async function addStudent(student) {
  return api.post('/students', student)
}

export async function updateStudent(id, updates) {
  return api.put(`/students/${id}`, updates)
}

export async function deleteStudent(id) {
  return api.del(`/students/${id}`)
}

export async function checkStudentNameExists(name, excludeId = null) {
  const result = await api.get(`/students/check-name?name=${encodeURIComponent(name)}${excludeId ? '&excludeId=' + excludeId : ''}`)
  return result.exists
}

export async function addStudentsBatch(studentList, defaultHours = 0) {
  const result = await api.post('/students/batch', { students: studentList, defaultHours })
  try {
    const allStudents = await api.get('/students')
    return { students: allStudents, addedCount: result.addedCount, skipped: result.skipped || [] }
  } catch {
    return { students: null, addedCount: result.addedCount, skipped: result.skipped || [], refreshFailed: true }
  }
}

export async function updateStudentStatus(studentId, status) {
  return api.put(`/students/${studentId}/status`, { status })
}

export async function addHours(studentId, hours, remark = '') {
  return api.post(`/students/${studentId}/add-hours`, { hours, remark })
}

export async function subtractHours(studentId, hours, remark = '') {
  return api.post(`/students/${studentId}/subtract-hours`, { hours, remark })
}

// ========== 教师相关 ==========

export async function getTeachers() {
  return api.get('/teachers')
}

export async function addTeacher(teacher) {
  const result = await api.post('/teachers', teacher)
  const { defaultPassword, username, ...createdTeacher } = result
  try {
    const allTeachers = await api.get('/teachers')
    return { teachers: allTeachers, defaultPassword, username }
  } catch {
    return { teachers: null, createdTeacher, defaultPassword, username, refreshFailed: true }
  }
}

export async function updateTeacher(id, updates) {
  return api.put(`/teachers/${id}`, updates)
}

export async function deleteTeacher(id) {
  return api.del(`/teachers/${id}`)
}

export async function updateTeacherStatus(id, status) {
  return api.put(`/teachers/${id}/status`, { status })
}

// ========== 课程相关 ==========

export async function getCourses({ includeArchived = false } = {}) {
  return api.get(`/courses${includeArchived ? '?includeArchived=1' : ''}`)
}

export async function addCourse(course) {
  return api.post('/courses', course)
}

export async function updateCourse(id, updates) {
  return api.put(`/courses/${id}`, updates)
}

export async function deleteCourse(id) {
  return api.del(`/courses/${id}`)
}

export async function getCourseOccurrences(start, end) {
  return api.get(`/courses/occurrences?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
}

export async function rescheduleCourse(id, changes) {
  return api.post(`/courses/${id}/reschedule`, changes)
}

export async function rescheduleCourseDay(changes) {
  return api.post('/courses/reschedule-day', changes)
}

export async function getTrialBookings(filters = {}) {
  const bookings = []
  while (true) {
    const query = new URLSearchParams(Object.entries({ ...filters, limit: 500, offset: bookings.length })
      .filter(([, value]) => value !== '' && value !== null && value !== undefined))
    const page = await api.get(`/trial-bookings?${query}`)
    bookings.push(...page)
    if (page.length < 500) return bookings
  }
}

export async function addTrialBooking(data) { return api.post('/trial-bookings', data) }
export async function updateTrialBooking(id, data) { return api.put(`/trial-bookings/${id}`, data) }
export async function cancelTrialBooking(id) { return api.post(`/trial-bookings/${id}/cancel`, {}) }

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

// 日历与工作台需要完整记录；点名管理页仍使用分页接口。
export async function getAllAttendance(filters = {}) {
  const records = []
  let offset = 0
  while (true) {
    const page = await getAttendancePage({ ...filters, limit: 200, offset })
    records.push(...(page.data || []))
    if (!page.hasMore || !page.data?.length) return records
    offset += page.data.length
  }
}

export async function getAttendancePage({ limit = 50, offset = 0, includeVoided = false, courseId, month, date, originalDate, scope } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (includeVoided) query.set('includeVoided', '1')
  if (courseId) query.set('courseId', courseId)
  if (month) query.set('month', month)
  if (date) query.set('date', date)
  if (originalDate) query.set('originalDate', originalDate)
  if (scope === 'mine') query.set('scope', scope)
  const result = await api.get(`/attendance?${query}`)
  if (Array.isArray(result)) return { data: result, hasMore: false }
  return result
}

export async function addAttendance(record) {
  return api.post('/attendance', record)
}

export async function deductHours(studentId, hours, relatedId = null) {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  await api.post('/attendance', {
    courseId: relatedId,
    studentIds: [studentId],
    hoursDeducted: hours,
    date
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
  return api.post(`/attendance/${attendanceId}/remove-students`, { studentIds: studentIdsToRemove })
}

// ========== 课时记录相关 ==========

export async function getHourRecords() {
  return api.get('/hour-records')
}

export async function saveHourRecords(records) {
  throw new Error('API 模式不支持批量保存')
}

export async function addHourRecord(record) {
  throw new Error('请通过学生课时操作或正式课程点名生成课时记录')
}

export async function getHourRecordsByStudent(studentId) {
  const records = []
  for (let offset = 0; ; offset += 500) {
    const result = await api.get(`/hour-records?studentId=${encodeURIComponent(studentId)}&limit=500&offset=${offset}`)
    if (Array.isArray(result)) return result
    records.push(...result.data)
    if (!result.hasMore) return records
  }
}

// ========== 数据备份与恢复 ==========

export async function exportData() {
  const token = localStorage.getItem('access_token')
  const resp = await fetch(apiUrl('/backup/export'), {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (resp.status === 401) {
    const refreshed = await api.tryRefresh()
    if (refreshed) {
      const retryResp = await fetch(apiUrl('/backup/export'), {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!retryResp.ok) throw new Error('导出失败，请重新登录或稍后重试')
      return await retryResp.text()
    }
  }
  if (!resp.ok) throw new Error('导出失败，请重新登录或稍后重试')
  return await resp.text()
}

export async function importData(fileContent) {
  try {
    const content = fileContent.replace(/^\uFEFF/, '').trimStart()
    if (!content.startsWith('{')) {
      const token = localStorage.getItem('access_token')
      let resp = await fetch(apiUrl('/backup/import-sql'), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${token}`
        },
        body: content
      })
      if (resp.status === 401) {
        const refreshed = await api.tryRefresh()
        if (refreshed) {
          resp = await fetch(apiUrl('/backup/import-sql'), {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: content
          })
        }
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }))
        return { success: false, message: err.message || err.error || 'SQL导入失败' }
      }
      return await resp.json()
    }
    const importObj = JSON.parse(content)
    if (!importObj.data) {
      return { success: false, message: '无效的备份文件格式' }
    }
    const result = await api.post('/backup/import', importObj)
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
    throw error
  }
}

// ========== 统计相关 ==========

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getTeacherStats(startDate, endDate, scope = 'all') {
  const start = toLocalDate(startDate)
  const end = toLocalDate(endDate)
  return api.get(`/stats/teachers?start=${start}&end=${end}&scope=${scope}`)
}

export async function getWeekdayDistribution(start, end, scope = 'all') {
  return api.get(`/stats/weekday-distribution?start=${toLocalDate(start)}&end=${toLocalDate(end)}&scope=${scope}`)
}

export async function getOverallStats(startDate, endDate, scope = 'all') {
  const start = toLocalDate(startDate)
  const end = toLocalDate(endDate)
  return api.get(`/stats/overall?start=${start}&end=${end}&scope=${scope}`)
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

export const getScheduleAdjustments = id => api.get(`/courses/${id}/adjustments`)
export const removeScheduleAdjustment = (id, kind, changeId) => api.del(`/courses/${id}/adjustments/${kind}/${changeId}`)
export const arrangeSubstitution = (id, data) => api.post(`/courses/${id}/substitution`, data)
export const cancelSubstitution = (id, originalDate) => api.del(`/courses/${id}/substitution/${originalDate}`)
