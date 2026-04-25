import { test, expect, ApiClient } from './fixtures.js'

const API_BASE = 'http://localhost:3001'

test.describe('教师角色工作流：创建学生→加课时→查历史', () => {
  let adminApi, teacherApi, teacherId, studentId
  const teacherPhone = '13800' + Date.now().toString().slice(-6)
  const studentName = '教师生_' + Date.now()

  test.beforeAll(async () => {
    adminApi = new ApiClient(API_BASE)
    await adminApi.login('admin', 'admin123')

    // 创建教师
    const tRes = await adminApi.post('/teachers', {
      name: '流程教师_' + Date.now(),
      phone: teacherPhone,
      subject: '语文',
    })
    const tData = await tRes.json()
    teacherId = tData.id

    // 教师登录
    teacherApi = new ApiClient(API_BASE)
    await teacherApi.login(teacherPhone, '123456')
  })

  test.afterAll(async () => {
    if (studentId) { try { await adminApi.del(`/students/${studentId}`) } catch {} }
    if (teacherId) { try { await adminApi.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('教师创建学生', async () => {
    const res = await teacherApi.post('/students', { name: studentName, totalHours: 20 })
    expect(res.status).toBe(201)
    const student = await res.json()
    expect(student.name).toBe(studentName)
    expect(student.totalHours).toBe(20)
    studentId = student.id
  })

  test('教师给学生加课时', async () => {
    const res = await teacherApi.post(`/students/${studentId}/add-hours`, {
      hours: 10,
      remark: '续费10课时',
    })
    expect(res.status).toBe(200)
    const student = await res.json()
    expect(student.totalHours).toBe(30)
  })

  test('教师查看该学生的课时历史', async () => {
    const res = await teacherApi.get(`/hour-records?studentId=${studentId}&limit=500`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const records = Array.isArray(body) ? body : (body.data || [])
    expect(records.length).toBeGreaterThanOrEqual(1)
    const addRecords = records.filter(r => r.type === 'add')
    expect(addRecords.length).toBeGreaterThanOrEqual(1)
  })

  test('教师查看所有课时记录包含自己的学生', async () => {
    const res = await teacherApi.get('/hour-records')
    expect(res.status).toBe(200)
    const records = await res.json()
    const myStudentRecords = records.filter(r => r.studentId === studentId)
    expect(myStudentRecords.length).toBeGreaterThanOrEqual(1)
  })

  test('管理员能看到该学生的课时历史', async () => {
    const res = await adminApi.get(`/hour-records?studentId=${studentId}&limit=500`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const records = Array.isArray(body) ? body : (body.data || [])
    expect(records.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('教师角色课时记录权限隔离', () => {
  let adminApi, teacherAApi, teacherBApi
  let teacherAId, teacherBId, studentAId, studentBId
  const phoneA = '13801' + Date.now().toString().slice(-6)
  const phoneB = '13802' + Date.now().toString().slice(-6)

  test.beforeAll(async () => {
    adminApi = new ApiClient(API_BASE)
    await adminApi.login('admin', 'admin123')

    // 创建教师A和B
    const resA = await adminApi.post('/teachers', { name: '教师A_' + Date.now(), phone: phoneA, subject: '数学' })
    teacherAId = (await resA.json()).id
    const resB = await adminApi.post('/teachers', { name: '教师B_' + Date.now(), phone: phoneB, subject: '英语' })
    teacherBId = (await resB.json()).id

    teacherAApi = new ApiClient(API_BASE)
    await teacherAApi.login(phoneA, '123456')
    teacherBApi = new ApiClient(API_BASE)
    await teacherBApi.login(phoneB, '123456')

    // 教师A创建学生A并加课时
    const sA = await (await teacherAApi.post('/students', { name: '学生A_' + Date.now(), totalHours: 10 })).json()
    studentAId = sA.id
    await teacherAApi.post(`/students/${studentAId}/add-hours`, { hours: 5, remark: '续费' })

    // 教师B创建学生B并加课时
    const sB = await (await teacherBApi.post('/students', { name: '学生B_' + Date.now(), totalHours: 15 })).json()
    studentBId = sB.id
    await teacherBApi.post(`/students/${studentBId}/add-hours`, { hours: 3, remark: '续费' })
  })

  test.afterAll(async () => {
    for (const id of [studentAId, studentBId]) {
      if (id) { try { await adminApi.del(`/students/${id}`) } catch {} }
    }
    for (const id of [teacherAId, teacherBId]) {
      if (id) { try { await adminApi.del(`/teachers/${id}`) } catch {} }
    }
  })

  test('教师A能查看自己学生的课时历史', async () => {
    const res = await teacherAApi.get(`/hour-records?studentId=${studentAId}&limit=500`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const records = Array.isArray(body) ? body : (body.data || [])
    expect(records.length).toBeGreaterThanOrEqual(1)
  })

  test('教师B看不到教师A学生的课时历史', async () => {
    const res = await teacherBApi.get(`/hour-records?studentId=${studentAId}&limit=500`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const records = Array.isArray(body) ? body : (body.data || [])
    expect(records.length).toBe(0)
  })

  test('教师B不能给教师A的学生加课时', async () => {
    const res = await teacherBApi.post(`/students/${studentAId}/add-hours`, {
      hours: 5,
      remark: '尝试加课',
    })
    // 应该因为 verifyAccess 失败（学生不在 B 的可见范围内）
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  test('教师A的课时列表不包含教师B的学生', async () => {
    const res = await teacherAApi.get('/hour-records')
    expect(res.status).toBe(200)
    const records = await res.json()
    const bStudentRecords = records.filter(r => r.studentId === studentBId)
    expect(bStudentRecords.length).toBe(0)
  })

  test('管理员能看到所有学生的课时历史', async () => {
    const resA = await adminApi.get(`/hour-records?studentId=${studentAId}&limit=500`)
    const bodyA = await resA.json()
    const recordsA = Array.isArray(bodyA) ? bodyA : (bodyA.data || [])
    expect(recordsA.length).toBeGreaterThanOrEqual(1)

    const resB = await adminApi.get(`/hour-records?studentId=${studentBId}&limit=500`)
    const bodyB = await resB.json()
    const recordsB = Array.isArray(bodyB) ? bodyB : (bodyB.data || [])
    expect(recordsB.length).toBeGreaterThanOrEqual(1)
  })
})
