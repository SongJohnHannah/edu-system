import { test, expect, ApiClient } from './fixtures.js'

test.describe('减课时 API', () => {
  let api, studentId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const res = await api.post('/students', { name: '减课学生_' + Date.now(), totalHours: 20 })
    studentId = (await res.json()).id
  })

  test.afterAll(async () => {
    if (studentId) { try { await api.del(`/students/${studentId}`) } catch {} }
  })

  test('减课时成功', async () => {
    const res = await api.post(`/students/${studentId}/subtract-hours`, {
      hours: 5,
      remark: '测试减课',
    })
    expect(res.status).toBe(200)
    const student = await res.json()
    expect(student.totalHours).toBe(15)
  })

  test('减课时记录类型为 subtract', async () => {
    const res = await api.get(`/hour-records?studentId=${studentId}&limit=500`)
    const body = await res.json()
    const records = Array.isArray(body) ? body : (body.data || [])
    const subtractRecord = records.find(r => r.type === 'subtract')
    expect(subtractRecord).toBeTruthy()
    expect(subtractRecord.hours).toBe(5)
  })

  test('减课时允许超过剩余课时（余额变负）', async () => {
    const res = await api.post(`/students/${studentId}/subtract-hours`, {
      hours: 999,
      remark: '超额减课',
    })
    expect(res.status).toBe(200)
    const student = await res.json()
    const remaining = student.totalHours - (student.usedHours || 0)
    expect(remaining).toBeLessThan(0)
  })
})

test.describe('课时历史页面', () => {
  let api, studentId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const res = await api.post('/students', { name: '历史页学生_' + Date.now(), totalHours: 10 })
    studentId = (await res.json()).id
    // 加课时以产生记录
    await api.post(`/students/${studentId}/add-hours`, { hours: 5, remark: '历史页测试加课' })
    await api.post(`/students/${studentId}/subtract-hours`, { hours: 2, remark: '历史页测试减课' })
  })

  test.afterAll(async () => {
    if (studentId) { try { await api.del(`/students/${studentId}`) } catch {} }
  })

  test('课时历史页面加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto(`/hours-history?studentId=${studentId}`)
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED') && !e.includes('Failed to fetch'))).toHaveLength(0)
  })

  test('显示学生信息和记录', async ({ adminPage }) => {
    await adminPage.goto(`/hours-history?studentId=${studentId}`)
    await adminPage.waitForLoadState('networkidle')
    // 验证统计卡片存在
    await expect(adminPage.locator('.stat-item').first()).toBeVisible()
    // 验证记录表格存在
    const rows = adminPage.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('类型筛选下拉', async ({ adminPage }) => {
    await adminPage.goto(`/hours-history?studentId=${studentId}`)
    await adminPage.waitForLoadState('networkidle')
    // 点击筛选下拉
    const filterSelect = adminPage.locator('.filter-bar .search-select')
    if (await filterSelect.count() > 0) {
      await filterSelect.locator('.ss-input').click()
      await adminPage.waitForTimeout(300)
      // 应该显示选项
      await expect(adminPage.locator('.ss-option').first()).toBeVisible()
    }
  })
})
