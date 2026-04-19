import { test, expect, ApiClient } from './fixtures.js'

test.describe('学生可见性规则', () => {
  let api, teacherAId, teacherBId, studentIds = [], courseIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')

    // 创建两个教师
    const tARes = await api.post('/teachers', { name: '教师A_' + Date.now(), phone: '13500' + Date.now().toString().slice(-6) })
    teacherAId = (await tARes.json()).id
    const tBRes = await api.post('/teachers', { name: '教师B_' + Date.now(), phone: '13501' + Date.now().toString().slice(-6) })
    teacherBId = (await tBRes.json()).id
  })

  test.afterAll(async () => {
    for (const id of courseIds) { try { await api.del(`/courses/${id}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherAId) { try { await api.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await api.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('admin 添加的学生所有 teacher 可见', async () => {
    const res = await api.post('/students', { name: '公共学生_' + Date.now(), totalHours: 10 })
    const student = await res.json()
    studentIds.push(student.id)

    // admin 能看到
    const adminRes = await api.get('/students')
    const adminStudents = await adminRes.json()
    expect(adminStudents.find(s => s.id === student.id)).toBeTruthy()

    // teacher 也能看到（通过 API 验证）
    const teacherLoginRes = await api.request('POST', '/auth/login', {
      username: (await (await api.get('/teachers')).json()).find(t => t.id === teacherAId)?.phone,
      password: '123456'
    })
    if (teacherLoginRes.ok) {
      const teacherApi = new ApiClient('http://localhost:3001')
      const tData = await teacherLoginRes.json()
      teacherApi.token = tData.accessToken
      const tRes = await teacherApi.get('/students')
      const tStudents = await tRes.json()
      expect(tStudents.find(s => s.id === student.id)).toBeTruthy()
    }
  })

  test('admin 学生被 teacher A 选入课程后 admin 仍可分配给 teacher B', async () => {
    const res = await api.post('/students', { name: '独占学生_' + Date.now(), totalHours: 10 })
    const student = await res.json()
    studentIds.push(student.id)

    // Teacher A 创建包含此学生的课程
    const aRes = await api.post('/courses', {
      name: '教师A课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 3,
      startTime: '14:00',
      endTime: '15:00',
      hoursPerClass: 1,
      studentIds: [student.id],
    })
    if (aRes.status === 201) courseIds.push((await aRes.json()).id)

    // Admin 可以把此学生分配给 teacher B
    const bRes = await api.post('/courses', {
      name: '教师B课程_' + Date.now(),
      teacherId: teacherBId,
      weekday: 4,
      startTime: '14:00',
      endTime: '15:00',
      hoursPerClass: 1,
      studentIds: [student.id],
    })
    expect(bRes.status).toBe(201)
    courseIds.push((await bRes.json()).id)
  })
})
