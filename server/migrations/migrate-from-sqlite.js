// 从 SQLite JSON 备份迁移数据到 MySQL
// 用法: node migrate-from-sqlite.js --file=backup.json

import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function epochToDatetime(epoch) {
  if (!epoch) return new Date().toISOString().slice(0, 19).replace('T', ' ')
  if (typeof epoch === 'string' && epoch.includes('-')) return epoch.slice(0, 19)
  const ms = typeof epoch === 'number' ? epoch : parseInt(epoch)
  if (isNaN(ms)) return new Date().toISOString().slice(0, 19).replace('T', ' ')
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

async function migrate() {
  const args = process.argv.slice(2)
  const fileArg = args.find(a => a.startsWith('--file='))
  if (!fileArg) {
    console.error('用法: node migrate-from-sqlite.js --file=backup.json')
    process.exit(1)
  }
  const filePath = fileArg.split('=')[1]
  const fullPath = path.resolve(__dirname, filePath)

  if (!fs.existsSync(fullPath)) {
    console.error(`文件不存在: ${fullPath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(fullPath, 'utf-8')
  const importObj = JSON.parse(raw)
  const data = importObj.data

  console.log('读取到的数据:')
  console.log(`  学生: ${data.students?.length || 0}`)
  console.log(`  教师: ${data.teachers?.length || 0}`)
  console.log(`  课程: ${data.courses?.length || 0}`)
  console.log(`  点名: ${data.attendance?.length || 0}`)
  console.log(`  课时记录: ${data.hourRecords?.length || 0}`)
  console.log(`  班级: ${data.classes?.length || 0}`)

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'edu_system',
    charset: 'utf8mb4',
    multipleStatements: true
  })

  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    // 清空现有数据
    console.log('\n清空现有数据...')
    await conn.execute('DELETE FROM hour_records')
    await conn.execute('DELETE FROM attendance')
    await conn.execute('DELETE FROM courses')
    await conn.execute('DELETE FROM students')
    await conn.execute('DELETE FROM teachers')
    await conn.execute('DELETE FROM classes')

    // 导入班级
    if (data.classes?.length) {
      console.log(`导入 ${data.classes.length} 个班级...`)
      for (const c of data.classes) {
        await conn.execute(
          'INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)',
          [c.id, c.name, epochToDatetime(c.createdAt || c.created_at)]
        )
      }
    }

    // 导入教师
    if (data.teachers?.length) {
      console.log(`导入 ${data.teachers.length} 个教师...`)
      for (const t of data.teachers) {
        await conn.execute(
          'INSERT INTO teachers (id, name, phone, subject, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [t.id, t.name, t.phone || '', t.subject || '', t.remark || '',
           epochToDatetime(t.createdAt || t.created_at),
           epochToDatetime(t.updatedAt || t.updated_at)]
        )
      }
    }

    // 导入学生
    if (data.students?.length) {
      console.log(`导入 ${data.students.length} 个学生...`)
      for (const s of data.students) {
        await conn.execute(
          `INSERT INTO students (id, name, phone, age, remark, total_hours, used_hours, status, class_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.phone || '', s.age || null, s.remark || '',
           s.totalHours || s.total_hours || 0, s.usedHours || s.used_hours || 0,
           s.status || 'active', s.classId || s.class_id || '',
           epochToDatetime(s.createdAt || s.created_at),
           epochToDatetime(s.updatedAt || s.updated_at)]
        )
      }
    }

    // 导入课程
    if (data.courses?.length) {
      console.log(`导入 ${data.courses.length} 个课程...`)
      for (const c of data.courses) {
        await conn.execute(
          `INSERT INTO courses (id, name, teacher_id, weekday, start_time, end_time, classroom, hours_per_class, student_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.teacherId || c.teacher_id, c.weekday,
           c.startTime || c.start_time, c.endTime || c.end_time,
           c.classroom || '', c.hoursPerClass || c.hours_per_class || 1,
           JSON.stringify(c.studentIds || []),
           epochToDatetime(c.createdAt || c.created_at),
           epochToDatetime(c.updatedAt || c.updated_at)]
        )
      }
    }

    // 导入点名记录
    if (data.attendance?.length) {
      console.log(`导入 ${data.attendance.length} 条点名记录...`)
      for (const a of data.attendance) {
        await conn.execute(
          'INSERT INTO attendance (id, course_id, date, student_ids, hours_deducted, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [a.id, a.courseId || a.course_id, a.date,
           JSON.stringify(a.studentIds || []),
           a.hoursDeducted || a.hours_deducted || 1,
           epochToDatetime(a.createdAt || a.created_at)]
        )
      }
    }

    // 导入课时记录
    if (data.hourRecords?.length) {
      console.log(`导入 ${data.hourRecords.length} 条课时记录...`)
      for (const r of data.hourRecords) {
        await conn.execute(
          'INSERT INTO hour_records (id, student_id, type, hours, remark, related_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.studentId || r.student_id, r.type, r.hours, r.remark || '',
           r.relatedId || r.related_id, r.operator || 'manual',
           epochToDatetime(r.createdAt || r.created_at)]
        )
      }
    }

    await conn.commit()
    console.log('\n迁移完成！')
  } catch (err) {
    await conn.rollback()
    console.error('\n迁移失败:', err.message)
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

migrate().catch(err => {
  console.error(err)
  process.exit(1)
})
