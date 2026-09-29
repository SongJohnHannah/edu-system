import pool from '../config/database.js'

export const backupTables = ['settings', 'classes', 'teachers', 'users', 'students', 'courses',
  'course_schedule_versions', 'course_roster_versions', 'course_detail_versions', 'course_occurrence_changes',
  'trial_bookings', 'attendance', 'attendance_reversals', 'hour_records', 'course_handovers']
const extensionTables = ['attendance_reversals', 'trial_bookings', 'course_occurrence_changes',
  'course_schedule_versions', 'course_roster_versions', 'course_detail_versions', 'course_handovers']
const invalid = message => Object.assign(new Error(message), { status: 400 })

export async function exportData() {
  const conn = await pool.getConnection()
  try {
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')
    const tables = {}
    for (const table of backupTables) {
      const [rows] = await conn.query({ sql: `SELECT * FROM ${table}`, dateStrings: true })
      tables[table] = rows
    }
    await conn.commit()
    return { version: '5.0', exportedAt: new Date().toISOString(), source: 'mysql', data: { tables } }
  } catch (error) { await conn.rollback(); throw error }
  finally { conn.release() }
}

export async function exportSQL() {
  const { data: { tables } } = await exportData()
  const lines = ['-- 嘉言思听教务系统 SQL 备份 v5', `-- 导出时间: ${new Date().toISOString()}`]
  for (const table of [...backupTables].reverse()) lines.push(`DELETE FROM ${table};`)
  for (const table of backupTables) for (const row of tables[table]) {
    const columns = Object.keys(row)
    const values = columns.map(key => pool.escape(typeof row[key] === 'object' && row[key] !== null && !Buffer.isBuffer(row[key]) ? JSON.stringify(row[key]) : row[key]))
    lines.push(`INSERT INTO ${table} (${columns.map(c => '\`' + c + '\`').join(', ')}) VALUES (${values.join(', ')});`)
  }
  return lines.join('\n')
}

export function normalizeBackupValue(value, type) {
  if (value === null || value === undefined) return null
  if (/^(datetime|timestamp)/.test(type)) {
    if (value instanceof Date || /[zZ]|[+-]\d{2}:\d{2}$/.test(String(value))) return new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false })
    return String(value).replace('T', ' ').slice(0, 23)
  }
  if (/^date$/.test(type)) return String(value).slice(0, 10)
  if (type.startsWith('json') && typeof value === 'object') return JSON.stringify(value)
  return value
}

export async function importData(input) {
  if (!input || typeof input !== 'object') throw invalid('无效的备份文件')
  const data = input.data || input
  let tables = data.tables
  if (!tables) {
    const mapping = { students: 'students', teachers: 'teachers', courses: 'courses', attendance: 'attendance', hourRecords: 'hour_records', classes: 'classes', handovers: 'course_handovers', scheduleVersions: 'course_schedule_versions', rosterVersions: 'course_roster_versions', occurrenceChanges: 'course_occurrence_changes', trialBookings: 'trial_bookings', attendanceReversals: 'attendance_reversals' }
    if (!Object.keys(mapping).some(key => Array.isArray(data[key]))) throw invalid('无效的备份文件')
    tables = {}
    for (const [key, table] of Object.entries(mapping)) tables[table] = (data[key] || []).map(row => Object.fromEntries(Object.entries(row).map(([field, value]) => [field.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), value])))
    tables.course_detail_versions = []
  }
  for (const [table, rows] of Object.entries(tables)) if (!backupTables.includes(table) || !Array.isArray(rows)) throw invalid('备份表或数据格式无效')
  if (input.version === '5.0' && backupTables.some(table => !Object.hasOwn(tables, table))) {
    throw invalid('新版备份文件不完整，缺少业务表')
  }
  const order = backupTables.filter(table => Object.hasOwn(tables, table))
  if (!order.length) throw invalid('备份为空')
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const table of extensionTables) {
      if (!Object.hasOwn(tables, table)) await conn.execute(`DELETE FROM ${table}`)
    }
    for (const table of [...order].reverse()) await conn.execute(`DELETE FROM ${table}`)
    for (const table of order) {
      const [definition] = await conn.execute(`SHOW COLUMNS FROM ${table}`)
      const allowed = new Map(definition.map(col => [col.Field, col.Type]))
      for (const row of tables[table]) {
        const columns = Object.keys(row).filter(key => allowed.has(key))
        if (!columns.length) throw invalid('备份记录没有有效字段')
        await conn.execute(`INSERT INTO ${table} (${columns.map(c => '\`' + c + '\`').join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map(key => normalizeBackupValue(row[key], allowed.get(key))))
      }
    }
    await conn.commit()
    return { success: true, message: '数据恢复成功' }
  } catch (error) { await conn.rollback(); throw error }
  finally { conn.release() }
}

// Split statements only outside strings; exported text may contain semicolons or comments.
export function splitBackupSQL(sql) {
  const statements = []
  let buffer = '', quote = null
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (quote) {
      buffer += c
      if (c === '\\' && quote !== '\`') { buffer += sql[++i] || ''; continue }
      if (c === quote) { if (sql[i + 1] === quote) buffer += sql[++i]; else quote = null }
      continue
    }
    if (c === '-' && sql[i + 1] === '-' && /\s/.test(sql[i + 2] || '')) { while (i < sql.length && sql[i] !== '\n') i++; buffer += '\n'; continue }
    if (c === "'" || c === '"' || c === '\`') quote = c
    if (c === ';') { if (buffer.trim()) statements.push(buffer.trim()); buffer = '' }
    else buffer += c
  }
  if (quote) throw invalid('SQL 备份字符串不完整')
  if (buffer.trim()) statements.push(buffer.trim())
  return statements
}

export async function importSQL(sql) {
  if (typeof sql !== 'string') throw invalid('SQL 备份格式无效')
  const isVersionFive = /^\s*--\s*嘉言思听教务系统 SQL 备份 v5\b/m.test(sql)
  const statements = splitBackupSQL(sql).map(statement => statement.replace(/^TRUNCATE\s+TABLE\s+/i, 'DELETE FROM '))
  if (!statements.length) throw invalid('SQL 备份为空')
  const includedTables = new Set()
  const clearedTables = new Set()
  for (const statement of statements) {
    const match = statement.match(/^(?:INSERT INTO|DELETE FROM)\s+`?([a-z_]+)`?(?=\s|$|\()/i)
    if (!match || !backupTables.includes(match[1])) throw invalid('仅支持系统备份中的数据语句')
    includedTables.add(match[1])
    if (/^DELETE FROM\s+/i.test(statement)) clearedTables.add(match[1])
  }
  if (isVersionFive && backupTables.some(table => !clearedTables.has(table))) {
    throw invalid('新版 SQL 备份文件不完整，缺少业务表清理语句')
  }
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Older backups omit tables added later. Clear only those absent tables so
    // stale rows cannot affect the restored schedule or attendance history.
    for (const table of extensionTables) {
      if (!includedTables.has(table)) await conn.execute(`DELETE FROM ${table}`)
    }
    for (const statement of statements) await conn.query(statement)
    await conn.commit()
    return { success: true, message: 'SQL 数据恢复成功' }
  } catch (error) { await conn.rollback(); throw error }
  finally { conn.release() }
}
