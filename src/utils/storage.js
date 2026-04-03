// 数据存储工具 - 支持 Electron 和浏览器环境

const STORAGE_KEY = 'edu-system-data'

// 检测是否在 Electron 环境中
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI
}

// 获取默认数据结构
const getDefaultData = () => ({
  students: [],
  teachers: [],
  courses: [],
  attendance: [],
  hourRecords: [],
  classes: []
})

// 同步获取数据（用于浏览器环境）
export function getData() {
  if (isElectron()) {
    // Electron 环境：使用同步方式获取缓存的数据
    // 注意：在 Electron 中，数据在应用启动时加载
    return window._electronData || getDefaultData()
  }

  // 浏览器环境：使用 localStorage
  const data = localStorage.getItem(STORAGE_KEY)
  const parsed = data ? JSON.parse(data) : getDefaultData()

  // 兼容性处理
  if (!parsed.hourRecords) parsed.hourRecords = []
  if (!parsed.classes) parsed.classes = []
  parsed.students = parsed.students.map(s => ({
    ...s,
    status: s.status || 'active',
    classId: s.classId || ''
  }))

  return parsed
}

// 保存数据
export function saveData(data) {
  if (isElectron()) {
    // Electron 环境：通过 IPC 保存
    window._electronData = data
    window.electronAPI.saveData(data)
  } else {
    // 浏览器环境：使用 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

// 初始化 Electron 数据（在应用启动时调用）
export async function initElectronData() {
  if (isElectron()) {
    const data = await window.electronAPI.getData()
    window._electronData = data
    return data
  }
  return getData()
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// ========== 学生相关 ==========

export function getStudents() {
  return getData().students
}

export function saveStudents(students) {
  const data = getData()
  data.students = students
  saveData(data)
}

export function addStudent(student) {
  const students = getStudents()
  students.push({
    ...student,
    id: generateId(),
    usedHours: 0,
    status: 'active',
    classId: student.classId || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  saveStudents(students)
  return students
}

export function updateStudent(id, updates) {
  const students = getStudents()
  const index = students.findIndex(s => s.id === id)
  if (index !== -1) {
    students[index] = { ...students[index], ...updates, updatedAt: Date.now() }
    saveStudents(students)
  }
  return students
}

export function deleteStudent(id) {
  const students = getStudents().filter(s => s.id !== id)
  saveStudents(students)
  return students
}

export function checkStudentNameExists(name, excludeId = null) {
  const students = getStudents()
  return students.some(s => s.name === name && s.id !== excludeId)
}

// ========== 教师相关 ==========

export function getTeachers() {
  return getData().teachers
}

export function saveTeachers(teachers) {
  const data = getData()
  data.teachers = teachers
  saveData(data)
}

export function addTeacher(teacher) {
  const teachers = getTeachers()
  teachers.push({
    ...teacher,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  saveTeachers(teachers)
  return teachers
}

export function updateTeacher(id, updates) {
  const teachers = getTeachers()
  const index = teachers.findIndex(t => t.id === id)
  if (index !== -1) {
    teachers[index] = { ...teachers[index], ...updates, updatedAt: Date.now() }
    saveTeachers(teachers)
  }
  return teachers
}

export function deleteTeacher(id) {
  const teachers = getTeachers().filter(t => t.id !== id)
  saveTeachers(teachers)
  return teachers
}

// ========== 课程相关 ==========

export function getCourses() {
  return getData().courses
}

export function saveCourses(courses) {
  const data = getData()
  data.courses = courses
  saveData(data)
}

export function addCourse(course) {
  const courses = getCourses()
  courses.push({
    ...course,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  saveCourses(courses)
  return courses
}

export function updateCourse(id, updates) {
  const courses = getCourses()
  const index = courses.findIndex(c => c.id === id)
  if (index !== -1) {
    courses[index] = { ...courses[index], ...updates, updatedAt: Date.now() }
    saveCourses(courses)
  }
  return courses
}

export function deleteCourse(id) {
  const courses = getCourses().filter(c => c.id !== id)
  saveCourses(courses)
  return courses
}

// ========== 点名记录相关 ==========

export function getAttendance() {
  return getData().attendance
}

export function addAttendance(record) {
  const data = getData()
  data.attendance.push({
    ...record,
    id: generateId(),
    createdAt: Date.now()
  })
  saveData(data)
}

export function deductHours(studentId, hours, relatedId = null) {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (student) {
    student.usedHours += hours
    student.updatedAt = Date.now()
    saveStudents(students)

    addHourRecord({
      studentId,
      type: 'deduct',
      hours,
      remark: '点名扣除',
      relatedId,
      operator: 'attendance'
    })
  }
  return students
}

export function restoreHours(studentId, hours) {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (student) {
    student.usedHours = Math.max(0, student.usedHours - hours)
    student.updatedAt = Date.now()
    saveStudents(students)
  }
  return students
}

export function deleteAttendance(attendanceId) {
  const data = getData()
  const record = data.attendance.find(a => a.id === attendanceId)

  if (record) {
    record.studentIds.forEach(studentId => {
      const student = data.students.find(s => s.id === studentId)
      if (student) {
        student.usedHours = Math.max(0, student.usedHours - record.hoursDeducted)
        student.updatedAt = Date.now()

        data.hourRecords = data.hourRecords || []
        data.hourRecords.push({
          id: generateId(),
          studentId,
          type: 'restore',
          hours: record.hoursDeducted,
          remark: '删除点名记录还原',
          relatedId: attendanceId,
          operator: 'restore',
          createdAt: Date.now()
        })
      }
    })

    data.attendance = data.attendance.filter(a => a.id !== attendanceId)
    saveData(data)
  }

  return data.attendance
}

// ========== 课时记录相关 ==========

export function getHourRecords() {
  return getData().hourRecords || []
}

export function saveHourRecords(records) {
  const data = getData()
  data.hourRecords = records
  saveData(data)
}

export function addHourRecord(record) {
  const records = getHourRecords()
  records.push({
    ...record,
    id: generateId(),
    createdAt: Date.now()
  })
  saveHourRecords(records)
  return records
}

export function getHourRecordsByStudent(studentId) {
  return getHourRecords().filter(r => r.studentId === studentId)
}

// ========== 学生状态管理 ==========

export function updateStudentStatus(studentId, status) {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (student) {
    student.status = status
    student.updatedAt = Date.now()
    saveStudents(students)
  }
  return students
}

// ========== 批量添加学生 ==========

export function addStudentsBatch(studentList, defaultHours = 0) {
  const students = getStudents()
  const timestamp = Date.now()

  const newStudents = studentList
    .filter(s => s.name && s.name.trim())
    .map((student, index) => ({
      name: student.name.trim(),
      age: student.age || null,
      phone: '',
      remark: '',
      totalHours: student.totalHours || defaultHours,
      id: generateId(),
      usedHours: 0,
      status: 'active',
      classId: '',
      createdAt: timestamp + index,
      updatedAt: timestamp
    }))

  students.push(...newStudents)
  saveStudents(students)
  return { students, addedCount: newStudents.length }
}

// ========== 添加课时 ==========

export function addHours(studentId, hours, remark = '') {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)

  if (student) {
    student.totalHours += hours
    student.updatedAt = Date.now()
    saveStudents(students)

    addHourRecord({
      studentId,
      type: 'add',
      hours,
      remark,
      operator: 'manual'
    })
  }

  return students
}

// ========== 班级管理 ==========

export function getClasses() {
  return getData().classes || []
}

export function saveClasses(classes) {
  const data = getData()
  data.classes = classes
  saveData(data)
}

export function addClass(cls) {
  const classes = getClasses()
  classes.push({
    ...cls,
    id: generateId(),
    createdAt: Date.now()
  })
  saveClasses(classes)
  return classes
}

export function updateClass(id, updates) {
  const classes = getClasses()
  const index = classes.findIndex(c => c.id === id)
  if (index !== -1) {
    classes[index] = { ...classes[index], ...updates }
    saveClasses(classes)
  }
  return classes
}

export function deleteClass(id) {
  const classes = getClasses().filter(c => c.id !== id)
  saveClasses(classes)
  return classes
}

export function getClassName(classId) {
  const cls = getClasses().find(c => c.id === classId)
  return cls ? cls.name : ''
}

// ========== 数据备份与恢复 ==========

// 导出所有数据
export function exportData() {
  const data = getData()
  const exportObj = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    source: isElectron() ? 'electron-store' : 'localStorage',
    data
  }
  return JSON.stringify(exportObj, null, 2)
}

// 导入数据
export function importData(jsonString) {
  try {
    const importObj = JSON.parse(jsonString)

    // 验证数据格式
    if (!importObj.data) {
      throw new Error('无效的备份文件格式')
    }

    const { data } = importObj

    // 确保必要字段存在
    if (!data.students) data.students = []
    if (!data.teachers) data.teachers = []
    if (!data.courses) data.courses = []
    if (!data.attendance) data.attendance = []
    if (!data.hourRecords) data.hourRecords = []
    if (!data.classes) data.classes = []

    // 兼容性处理
    data.students = data.students.map(s => ({
      ...s,
      status: s.status || 'active',
      classId: s.classId || ''
    }))

    // 保存导入的数据
    saveData(data)

    return { success: true, message: '数据导入成功' }
  } catch (error) {
    return { success: false, message: '数据导入失败：' + error.message }
  }
}

// 下载备份文件
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

// 获取数据存储路径（仅 Electron）
export async function getStorePath() {
  if (isElectron() && window.electronAPI.getStorePath) {
    return await window.electronAPI.getStorePath()
  }
  return null
}

// 检查是否在 Electron 环境
export function checkIsElectron() {
  return isElectron()
}