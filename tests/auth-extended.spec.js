import { test, expect, ApiClient } from './fixtures.js'

test.describe('Token 刷新', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
  })

  test('refresh token 可换取新 access token', async () => {
    const loginRes = await api.login('admin', 'admin123')
    expect(loginRes.refreshToken).toBeTruthy()

    const res = await fetch('http://localhost:3001/edusystem/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginRes.refreshToken }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.accessToken).toBeTruthy()
    expect(typeof data.accessToken).toBe('string')
  })

  test('无效 refresh token 返回错误', async () => {
    const res = await fetch('http://localhost:3001/edusystem/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid_token' }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

test.describe('管理员修改用户', () => {
  let api, teacherId, teacherPhone

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    teacherPhone = '13830' + Date.now().toString().slice(-6)
    const res = await api.post('/teachers', { name: '用户管理教师_' + Date.now(), phone: teacherPhone, subject: '物理' })
    teacherId = (await res.json()).id
  })

  test.afterAll(async () => {
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('管理员重置教师密码', async () => {
    // 先获取教师关联的 userId
    const teachersRes = await api.get('/teachers')
    const teachers = await teachersRes.json()
    const teacher = teachers.find(t => t.id === teacherId)
    expect(teacher?.userId).toBeTruthy()

    const res = await api.put(`/auth/users/${teacher.userId}/password`, {
      newPassword: 'newpass123',
    })
    expect(res.status).toBe(200)

    // 用新密码登录
    const loginRes = await fetch('http://localhost:3001/edusystem/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: teacherPhone, password: 'newpass123' }),
    })
    expect(loginRes.status).toBe(200)
    const data = await loginRes.json()
    expect(data.accessToken).toBeTruthy()
  })
})

test.describe('Dashboard 页面', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('页面加载无控制台错误', async ({ adminPage, consoleErrors }) => {
    // adminPage fixture already navigated to /, Dashboard is already loaded
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED') && !e.includes('Failed to fetch'))).toHaveLength(0)
  })

  test('显示统计卡片', async ({ adminPage }) => {
    await adminPage.goto('/')
    await adminPage.waitForLoadState('networkidle')
    await expect(adminPage.locator('.stat-card').first()).toBeVisible()
    await expect(adminPage.locator('.action-card').first()).toBeVisible()
  })
})
