// 存储门面 - 根据 VITE_USE_API 环境变量切换本地存储或远程 API
// VITE_USE_API=true  → 使用后端 API + MySQL
// VITE_USE_API=false → 使用本地 SQLite（Electron 或离线模式）

const useApi = import.meta.env.VITE_USE_API === 'true'

let adapter = null

async function loadAdapter() {
  if (adapter) return adapter
  if (useApi) {
    const mod = await import('./storage.api.js')
    adapter = mod
  } else {
    const mod = await import('./storage.local.js')
    adapter = mod
  }
  return adapter
}

// 代理所有导出的函数
const functionNames = [
  'initStorage',
  'getStudents', 'saveStudents', 'addStudent', 'updateStudent', 'deleteStudent',
  'checkStudentNameExists', 'addStudentsBatch', 'updateStudentStatus', 'addHours',
  'getTeachers', 'saveTeachers', 'addTeacher', 'updateTeacher', 'deleteTeacher',
  'getCourses', 'saveCourses', 'addCourse', 'updateCourse', 'deleteCourse',
  'getAttendance', 'getAttendancePage', 'addAttendance', 'deductHours', 'restoreHours',
  'deleteAttendance', 'removeStudentsFromRecord',
  'getHourRecords', 'saveHourRecords', 'addHourRecord', 'getHourRecordsByStudent',
  'getClasses', 'saveClasses', 'addClass', 'updateClass', 'deleteClass', 'getClassName',
  'exportData', 'importData', 'downloadBackup',
  'getStorePath', 'checkIsElectron',
  'getTeacherStats', 'getWeekdayDistribution', 'getOverallStats', 'getDateRange'
]

const proxy = {}
for (const name of functionNames) {
  proxy[name] = (...args) => loadAdapter().then(mod => {
    if (typeof mod[name] === 'function') {
      return mod[name](...args)
    }
    return undefined
  })
}

export const {
  initStorage,
  getStudents, saveStudents, addStudent, updateStudent, deleteStudent,
  checkStudentNameExists, addStudentsBatch, updateStudentStatus, addHours,
  getTeachers, saveTeachers, addTeacher, updateTeacher, deleteTeacher,
  getCourses, saveCourses, addCourse, updateCourse, deleteCourse,
  getAttendance, getAttendancePage, addAttendance, deductHours, restoreHours,
  deleteAttendance, removeStudentsFromRecord,
  getHourRecords, saveHourRecords, addHourRecord, getHourRecordsByStudent,
  getClasses, saveClasses, addClass, updateClass, deleteClass, getClassName,
  exportData, importData, downloadBackup,
  getStorePath, checkIsElectron,
  getTeacherStats, getWeekdayDistribution, getOverallStats, getDateRange
} = proxy
