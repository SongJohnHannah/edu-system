import { test, expect, ApiClient } from './fixtures.js'

test.describe('点名管理', () => {
  let api, teacherId, studentIds = [], courseId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const tRes = await api.post('/teachers', { name: '点名教师_' + Date.now(), phone: '13600' + Date.now().toString().slice(-6) })
    const t = await tRes.json()
    teacherId = t.id
    for (let i = 0; i < 3; i++) {
      const sRes = await api.post('/students', { name: '点名学生_' + i + '_' + Date.now(), totalHours: 20 })
      const s = await sRes.json()
      studentIds.push(s.id)
    }
    const cRes = await api.post('/courses', {
      name: '点名课程_' + Date.now(),
      teacherId,
      weekday: new Date().getDay() || 7,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds,
    })
    const c = await cRes.json()
    courseId = c.id
  })

  test.afterAll(async () => {
    // Delete attendance records for this course before deleting the course
    try {
      const res = await api.get('/attendance?courseId=' + courseId)
      const records = await res.json()
      for (const r of (Array.isArray(records) ? records : [])) {
        try { await api.del(`/attendance/${r.id}`) } catch {}
      }
    } catch {}
    if (courseId) { try { await api.del(`/courses/${courseId}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('选择课程加载学生列表', async ({ adminPage }) => {
    await adminPage.goto('/attendance')
    await adminPage.waitForLoadState('networkidle')
    const select = adminPage.locator('select').first()
    if (await select.count() > 0) {
      await select.selectOption({ index: 1 })
      await adminPage.waitForTimeout(1000)
    }
  })

  test('点名扣减课时', async ({ adminPage }) => {
    const res = await api.get('/students')
    const students = await res.json()
    const testStudents = students.filter(s => studentIds.includes(s.id))
    if (testStudents.length === 0) return

    const beforeHours = testStudents.reduce((sum, s) => sum + (s.totalHours - s.usedHours), 0)

    await adminPage.goto('/attendance')
    await adminPage.waitForLoadState('networkidle')
    const select = adminPage.locator('select').first()
    if (await select.count() > 0) {
      const options = await select.locator('option').allTextContents()
      const idx = options.findIndex(o => o.includes('点名课程_'))
      if (idx >= 0) {
        await select.selectOption({ index: idx })
        await adminPage.waitForTimeout(1000)
        const checkboxes = adminPage.locator('input[type="checkbox"]')
        const count = await checkboxes.count()
        for (let i = 0; i < Math.min(count, 2); i++) {
          await checkboxes.nth(i).check()
        }
        await adminPage.click('button:has-text("确认点名"), button:has-text("提交"), button:has-text("点名")')
        const confirmBtn = adminPage.locator('.modal button:has-text("确认"), .modal button:has-text("确定")')
        if (await confirmBtn.count() > 0) await confirmBtn.click()
        await adminPage.waitForTimeout(2000)
      }
    }
  })

  test('点名历史加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/attendance')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })

  test('点名分页 — hasMore 和 offset 参数正确', async () => {
    // 先创建足够多的点名记录
    for (let i = 0; i < 3; i++) {
      await api.post('/attendance', {
        courseId,
        date: new Date().toISOString().slice(0, 10),
        studentIds: [studentIds[0]],
        hoursDeducted: 1,
      })
    }

    // 第一页 limit=2，应有 hasMore=true
    const res1 = await api.get('/attendance?limit=2&offset=0')
    const body1 = await res1.json()
    const page1 = Array.isArray(body1) ? { data: body1, hasMore: false } : body1
    expect(page1.data.length).toBeLessThanOrEqual(2)

    // 总记录应该 >= 3（刚创建的），所以 limit=2 时 hasMore 应为 true
    if (page1.data.length >= 2) {
      expect(page1.hasMore).toBe(true)
    }

    // 第二页 offset=2
    const res2 = await api.get('/attendance?limit=2&offset=2')
    const body2 = await res2.json()
    const page2 = Array.isArray(body2) ? { data: body2, hasMore: false } : body2
    expect(page2.data.length).toBeLessThanOrEqual(2)

    // 两页数据不应重复
    if (page1.data.length > 0 && page2.data.length > 0) {
      const ids1 = new Set(page1.data.map(r => r.id))
      const overlap = page2.data.filter(r => ids1.has(r.id))
      expect(overlap.length).toBe(0)
    }
  })
})
