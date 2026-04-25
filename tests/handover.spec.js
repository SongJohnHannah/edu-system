import { test, expect, ApiClient } from './fixtures.js'

test.describe('课程交接', () => {
  let adminApi, teacherAApi, teacherBApi
  let teacherAId, teacherBId, courseId
  const phoneA = '13810' + Date.now().toString().slice(-6)
  const phoneB = '13820' + Date.now().toString().slice(-6)

  test.beforeAll(async () => {
    adminApi = new ApiClient('http://localhost:3001')
    await adminApi.login('admin', 'admin123')

    const resA = await adminApi.post('/teachers', { name: '交接教师A_' + Date.now(), phone: phoneA, subject: '数学' })
    teacherAId = (await resA.json()).id
    const resB = await adminApi.post('/teachers', { name: '交接教师B_' + Date.now(), phone: phoneB, subject: '英语' })
    teacherBId = (await resB.json()).id

    teacherAApi = new ApiClient('http://localhost:3001')
    await teacherAApi.login(phoneA, '123456')

    // 教师A创建课程
    const courseRes = await adminApi.post('/courses', {
      name: '交接课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds: [],
    })
    courseId = (await courseRes.json()).id
  })

  test.afterAll(async () => {
    if (courseId) { try { await adminApi.del(`/courses/${courseId}`) } catch {} }
    if (teacherAId) { try { await adminApi.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await adminApi.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('执行课程交接', async () => {
    const res = await adminApi.post('/handovers', {
      courseId,
      newTeacherId: teacherBId,
      reason: '测试交接',
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.courseId).toBe(courseId)
    expect(result.newTeacherId).toBe(teacherBId)

    // 验证课程的 teacherId 已更新
    const courseRes = await adminApi.get('/courses')
    const courses = await courseRes.json()
    const course = courses.find(c => c.id === courseId)
    expect(course.teacherId).toBe(teacherBId)
  })

  test('交接历史可查', async () => {
    const res = await adminApi.get(`/handovers?courseId=${courseId}`)
    expect(res.status).toBe(200)
    const records = await res.json()
    expect(records.length).toBeGreaterThanOrEqual(1)
    const match = records.find(r => r.courseId === courseId || r.course_id === courseId)
    expect(match).toBeTruthy()
    expect(match.newTeacherId || match.new_teacher_id).toBe(teacherBId)
  })
})

test.describe('交接历史页面', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('页面加载无控制台错误', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/handovers')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })
})
