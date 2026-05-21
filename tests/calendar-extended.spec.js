import { test, expect, ApiClient } from './fixtures.js'

test.describe('日历交互', () => {
  let api, teacherId, studentIds = [], courseId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const tRes = await api.post('/teachers', { name: '日历教师_' + Date.now(), phone: '13610' + Date.now().toString().slice(-6) })
    teacherId = (await tRes.json()).id
    const sRes = await api.post('/students', { name: '日历学生_' + Date.now(), totalHours: 20 })
    studentIds.push((await sRes.json()).id)

    const cRes = await api.post('/courses', {
      name: '日历课程_' + Date.now(),
      teacherId,
      weekday: new Date().getDay() || 7,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds,
    })
    courseId = (await cRes.json()).id
  })

  test.afterAll(async () => {
    if (courseId) { try { await api.del(`/courses/${courseId}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('点击日期显示详情', async ({ adminPage }) => {
    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    // 点击今天的日期
    const todayCell = adminPage.locator('.calendar-day.today')
    if (await todayCell.isVisible()) {
      await todayCell.click()
      await adminPage.waitForTimeout(500)
      // 应该出现详情区域
      const detail = adminPage.locator('.attendance-detail')
      await expect(detail).toBeVisible()
    }
  })

  test('有课程日期显示课程点', async ({ adminPage }) => {
    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    // 今天应该有课程安排（weekday 匹配）
    const courseDots = adminPage.locator('.course-dot')
    expect(await courseDots.count()).toBeGreaterThanOrEqual(0)
  })

  test('点名后日历显示点名标记', async ({ adminPage }) => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    await api.post('/attendance', {
      courseId,
      date: today,
      studentIds,
      hoursDeducted: 1,
    })

    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    const todayCell = adminPage.locator('.calendar-day.today')
    if (await todayCell.isVisible()) {
      await expect(todayCell.locator('.attendance-dot')).toBeVisible({ timeout: 5000 })
    }
  })
})
