import { test, expect, ApiClient } from './fixtures.js'

test.describe('教师管理扩展', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('搜索教师', async ({ adminPage }) => {
    const name = '搜索教师_' + Date.now()
    const res = await api.post('/teachers', { name, phone: '13830' + Date.now().toString().slice(-6) })
    const teacher = await res.json()

    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.fill('input[placeholder*="搜索"]', name)
    await adminPage.waitForTimeout(500)
    await expect(adminPage.locator(`.teacher-card:has-text("${name}")`).first()).toBeVisible()

    await api.del(`/teachers/${teacher.id}`)
  })

  test('有课程的教师不能删除', async () => {
    const tRes = await api.post('/teachers', { name: '有课教师_' + Date.now(), phone: '13840' + Date.now().toString().slice(-6) })
    const teacher = await tRes.json()
    const sRes = await api.post('/students', { name: '教师课学生_' + Date.now(), totalHours: 10 })
    const student = await sRes.json()
    const cRes = await api.post('/courses', {
      name: '教师课程_' + Date.now(),
      teacherId: teacher.id,
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds: [student.id],
    })
    const course = await cRes.json()

    const delRes = await api.del(`/teachers/${teacher.id}`)
    expect(delRes.status).toBeGreaterThanOrEqual(400)
    const body = await delRes.json()
    expect(body.error).toContain('课程')

    await api.del(`/courses/${course.id}`)
    await api.del(`/students/${student.id}`)
    await api.del(`/teachers/${teacher.id}`)
  })

  test('教师软删除和恢复', async () => {
    const tRes = await api.post('/teachers', { name: '软删教师_' + Date.now(), phone: '13850' + Date.now().toString().slice(-6) })
    const teacher = await tRes.json()

    const statusRes = await api.put(`/teachers/${teacher.id}/status`, { status: 'deleted' })
    expect(statusRes.status).toBe(200)

    // Deleted teacher should not appear in list
    const listRes = await api.get('/teachers')
    const teachers = await listRes.json()
    const found = teachers.find(t => t.id === teacher.id)
    expect(found).toBeFalsy()

    // Restore
    const restoreRes = await api.put(`/teachers/${teacher.id}/status`, { status: 'active' })
    expect(restoreRes.status).toBe(200)

    // After restore, should appear again
    const listRes2 = await api.get('/teachers')
    const teachers2 = await listRes2.json()
    const found2 = teachers2.find(t => t.id === teacher.id)
    expect(found2).toBeTruthy()

    await api.del(`/teachers/${teacher.id}`)
  })

  test('重名教师创建失败', async () => {
    const name = '重名教师_' + Date.now()
    await api.post('/teachers', { name, phone: '13860' + Date.now().toString().slice(-6) })
    const res = await api.post('/teachers', { name, phone: '13861' + Date.now().toString().slice(-6) })
    expect(res.status).toBeGreaterThanOrEqual(400)

    const listRes = await api.get('/teachers')
    const teachers = await listRes.json()
    const same = teachers.filter(t => t.name === name)
    expect(same.length).toBe(1)
    await api.del(`/teachers/${same[0].id}`)
  })
})

test.describe('教师账户管理', () => {
  let api, teacherId, teacherPhone

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    teacherPhone = '13870' + Date.now().toString().slice(-6)
    const res = await api.post('/teachers', { name: '账户教师_' + Date.now(), phone: teacherPhone })
    teacherId = (await res.json()).id
  })

  test.afterAll(async () => {
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('教师可以用默认密码登录', async () => {
    const teacherApi = new ApiClient('http://localhost:3001')
    const loginData = await teacherApi.login(teacherPhone, '123456')
    expect(loginData.accessToken).toBeTruthy()
  })

  test('管理员重置教师密码', async () => {
    const listRes = await api.get('/teachers')
    const teachers = await listRes.json()
    const teacher = teachers.find(t => t.id === teacherId)
    expect(teacher).toBeTruthy()
    expect(teacher.userId).toBeTruthy()

    const resetRes = await api.put(`/auth/users/${teacher.userId}/password`, { newPassword: '654321' })
    expect(resetRes.status).toBe(200)

    const teacherApi = new ApiClient('http://localhost:3001')
    const loginData = await teacherApi.login(teacherPhone, '654321')
    expect(loginData.accessToken).toBeTruthy()
  })
})
