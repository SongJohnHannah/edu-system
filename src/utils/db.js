// SQLite 数据库模块 - 使用 sql.js
import initSqlJs from 'sql.js'

let db = null
let SQL = null

// 数据库版本，用于迁移
const DB_VERSION = 1

// 检测运行环境
function isElectron() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:'
}

// 初始化数据库
export async function initDatabase() {
  if (db) return db

  try {
    // 动态加载 WASM 文件
    const wasmUrl = await getWasmUrl()

    SQL = await initSqlJs({
      locateFile: () => wasmUrl
    })
  } catch (error) {
    console.error('Failed to load SQL.js:', error)
    console.error('Error details:', error.message, error.stack)
    throw new Error(`数据库加载失败: ${error.message}`)
  }

  // 尝试从存储加载现有数据库
  const savedData = await loadFromStorage()
  if (savedData) {
    db = new SQL.Database(savedData)
  } else {
    db = new SQL.Database()
    createTables()
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['db_version', DB_VERSION])
  }

  // 运行迁移
  runMigrations()

  // 自动保存
  autoSave()

  return db
}

// 获取 WASM 文件 URL
async function getWasmUrl() {
  if (isElectron()) {
    // Electron 环境：使用 CDN
    return 'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.wasm'
  }

  // 浏览器环境：使用 Vite 的 ?url 导入
  try {
    const wasmModule = await import('sql.js/dist/sql-wasm.wasm?url')
    return wasmModule.default
  } catch {
    return 'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.wasm'
  }
}

// 从存储加载数据（IndexedDB 或 localStorage）
async function loadFromStorage() {
  if (isElectron()) {
    // Electron 环境使用 localStorage
    try {
      const data = localStorage.getItem('edu-system-db')
      if (data) {
        const uint8Array = new Uint8Array(JSON.parse(data))
        return uint8Array
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
    }
    return null
  }

  // 浏览器环境使用 IndexedDB
  return loadFromIndexedDB()
}

// 保存数据到存储
async function saveToStorage() {
  if (!db) return

  if (isElectron()) {
    // Electron 环境使用 localStorage
    try {
      const data = db.export()
      const array = Array.from(data)
      localStorage.setItem('edu-system-db', JSON.stringify(array))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
    return
  }

  // 浏览器环境使用 IndexedDB
  return saveToIndexedDB()
}

// IndexedDB 操作（浏览器环境）
const DB_NAME = 'edu-system-db'
const STORE_NAME = 'database'

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const idb = event.target.result
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function loadFromIndexedDB() {
  try {
    const idb = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get('data')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } catch (error) {
    console.error('Failed to load from IndexedDB:', error)
    return null
  }
}

async function saveToIndexedDB() {
  if (!db) return

  try {
    const data = db.export()
    const idb = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(data, 'data')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error)
  }
}

// 自动保存
let saveTimeout = null
function autoSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveToStorage()
  }, 1000)
}

// 创建数据表
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      age INTEGER,
      remark TEXT DEFAULT '',
      total_hours INTEGER DEFAULT 0,
      used_hours INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      class_id TEXT DEFAULT '',
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      teacher_id TEXT,
      weekday INTEGER,
      start_time TEXT,
      end_time TEXT,
      classroom TEXT DEFAULT '',
      hours_per_class INTEGER DEFAULT 1,
      student_ids TEXT DEFAULT '[]',
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      date TEXT,
      student_ids TEXT DEFAULT '[]',
      hours_deducted INTEGER DEFAULT 1,
      created_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS hour_records (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      type TEXT,
      hours INTEGER,
      remark TEXT DEFAULT '',
      related_id TEXT,
      operator TEXT DEFAULT 'manual',
      created_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_students_name ON students(name)')
  db.run('CREATE INDEX IF NOT EXISTS idx_students_status ON students(status)')
  db.run('CREATE INDEX IF NOT EXISTS idx_hour_records_student ON hour_records(student_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_course ON attendance(course_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)')
}

// 运行数据库迁移
function runMigrations() {
  const result = db.exec("SELECT value FROM settings WHERE key = 'db_version'")
  const currentVersion = result.length > 0 ? parseInt(result[0].values[0][0]) : 0

  if (currentVersion < DB_VERSION) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['db_version', DB_VERSION])
    saveToStorage()
  }
}

// 导出数据库
export function exportDatabase() {
  if (!db) return null
  return db.export()
}

// 导入数据库
export async function importDatabase(data) {
  const wasmUrl = await getWasmUrl()
  SQL = SQL || await initSqlJs({
    locateFile: () => wasmUrl
  })
  db = new SQL.Database(data)
  await saveToStorage()
}

// 获取数据库实例
export function getDb() {
  return db
}

// 执行查询并返回结果
export function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized')
  db.run(sql, params)
  autoSave()
}

// 执行查询并返回所有结果
export function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized')
  const result = db.exec(sql, params)
  if (result.length === 0) return []
  const columns = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

// 执行查询并返回单个结果
export function queryOne(sql, params = []) {
  const results = queryAll(sql, params)
  return results.length > 0 ? results[0] : null
}

// 生成 ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// 保存数据库
export function saveDatabase() {
  return saveToStorage()
}
