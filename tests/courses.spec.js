import { test, expect, ApiClient } from './fixtures.js'

test.describe('课程管理', () => {
  let api, teacherId, studentIds = [], courseIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const tRes = await api.post('/teachers', { name: '课程教师_' + Date.now(), phone: '13700' + Date.now().toString().slice(-6) })
    const t = await tRes.json()
    teacherId = t.id
    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: '课程学生_' + i + '_' + Date.now(), totalHours: 20 })
      const s = await sRes.json()
      studentIds.push(s.id)
    }
  })

  test.afterAll(async () => {
    for (const id of courseIds) { try { await api.del(`/courses/${id}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('创建课程', async ({ adminPage }) => {
    const name = 'UI测试课程_' + Date.now()
    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("创建课程")')
    await adminPage.waitForTimeout(500)
    await adminPage.fill('.modal input[placeholder*="班"], .modal input[placeholder*="课程"]', name)
    // Select teacher via SearchSelect
    const teacherSelect = adminPage.locator('.modal .search-select').first()
    await teacherSelect.locator('.ss-input').click()
    await adminPage.waitForTimeout(300)
    await adminPage.locator('.ss-option').first().click()
    await adminPage.waitForTimeout(500)
    await adminPage.click('.modal button:has-text("保存")')
    await adminPage.waitForTimeout(2000)
    const res = await api.get('/courses')
    const courses = await res.json()
    const created = courses.find(c => c.name === name)
    if (created) courseIds.push(created.id)
  })

  test('课程列表加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })

  test('删除课程', async ({ adminPage }) => {
    const cRes = await api.post('/courses', {
      name: '待删课程_' + Date.now(),
      teacherId,
      weekday: 1,
      startTime: '10:00',
      endTime: '11:00',
      hoursPerClass: 1,
      studentIds,
    })
    const c = await cRes.json()
    courseIds.push(c.id)

    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')
    const card = adminPage.locator('.course-card:has-text("待删课程_")').first()
    if (await card.isVisible()) {
      await card.locator('button:has-text("删除")').click()
      await adminPage.click('.modal button:has-text("确认")')
      await adminPage.waitForTimeout(1000)
      courseIds = courseIds.filter(id => id !== c.id)
    }
  })
})
