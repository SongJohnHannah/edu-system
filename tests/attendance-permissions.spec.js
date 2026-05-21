import { test, expect, ApiClient } from './fixtures.js'

test.describe('点名删除权限', () => {
  let adminApi, teacherAId, teacherBId, teacherAPhone, teacherBPhone, courseId, attendanceId, studentId

  test.beforeAll(async () => {
    adminApi = new ApiClient('http://localhost:3001')
    await adminApi.login('admin', 'admin123')

    teacherAPhone = '13620' + Date.now().toString().slice(-6)
    teacherBPhone = '13630' + Date.now().toString().slice(-6)
    const resA = await adminApi.post('/teachers', { name: '权限教师A_' + Date.now(), phone: teacherAPhone })
    teacherAId = (await resA.json()).id
    const resB = await adminApi.post('/teachers', { name: '权限教师B_' + Date.now(), phone: teacherBPhone })
    teacherBId = (await resB.json()).id

    const sRes = await adminApi.post('/students', { name: '权限学生_' + Date.now(), totalHours: 20 })
    studentId = (await sRes.json()).id

    const cRes = await adminApi.post('/courses', {
      name: '权限课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds: [studentId],
    })
    courseId = (await cRes.json()).id
  })

  test.afterAll(async () => {
    if (attendanceId) { try { await adminApi.del(`/attendance/${attendanceId}`) } catch {} }
    if (courseId) { try { await adminApi.del(`/courses/${courseId}`) } catch {} }
    if (studentId) { try { await adminApi.del(`/students/${studentId}`) } catch {} }
    if (teacherAId) { try { await adminApi.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await adminApi.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('管理员创建的点名记录，教师不能删除', async () => {
    const aRes = await adminApi.post('/attendance', {
      courseId,
      date: new Date().toISOString().slice(0, 10),
      studentIds: [studentId],
      hoursDeducted: 1,
    })
    attendanceId = (await aRes.json()).id

    // 教师A尝试删除管理员创建的记录
    const teacherApi = new ApiClient('http://localhost:3001')
    await teacherApi.login(teacherAPhone, '123456')
    teacherApi.token = (await teacherApi.login(teacherAPhone, '123456')).accessToken

    const delRes = await teacherApi.del(`/attendance/${attendanceId}`)
    expect(delRes.status).toBeGreaterThanOrEqual(400)
  })

  test('教师只能删除自己创建的点名记录', async () => {
    const teacherApi = new ApiClient('http://localhost:3001')
    const loginData = await teacherApi.login(teacherAPhone, '123456')
    teacherApi.token = loginData.accessToken

    // 教师A创建点名
    const aRes = await teacherApi.post('/attendance', {
      courseId,
      date: new Date().toISOString().slice(0, 10),
      studentIds: [studentId],
      hoursDeducted: 1,
    })
    const teacherAttendanceId = (await aRes.json()).id

    // 教师B不能删除教师A的记录
    const teacherBApi = new ApiClient('http://localhost:3001')
    const loginB = await teacherBApi.login(teacherBPhone, '123456')
    teacherBApi.token = loginB.accessToken

    const delRes = await teacherBApi.del(`/attendance/${teacherAttendanceId}`)
    expect(delRes.status).toBeGreaterThanOrEqual(400)

    // 教师A可以删除自己的
    const selfDelRes = await teacherApi.del(`/attendance/${teacherAttendanceId}`)
    expect(selfDelRes.status).toBe(200)
  })
})
