import { test, expect, ApiClient } from './fixtures.js'

test.describe('学生管理', () => {
  let api, createdIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test.afterAll(async () => {
    for (const id of createdIds) {
      try { await api.del(`/students/${id}`) } catch {}
    }
  })

  test('列表加载无控制台错误', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })

  test('添加学生', async ({ adminPage }) => {
    const name = 'UI测试学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')
    await adminPage.click('.modal button:has-text("保存")')
    await adminPage.waitForTimeout(1000)
    const res = await api.get('/students')
    const students = await res.json()
    const created = students.find(s => s.name === name)
    if (created) createdIds.push(created.id)
  })

  test('搜索学生', async ({ adminPage }) => {
    const name = '搜索测试_' + Date.now()
    const res = await api.post('/students', { name, totalHours: 5 })
    const student = await res.json()
    createdIds.push(student.id)

    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.fill('input[placeholder*="搜索"]', name)
    await adminPage.waitForTimeout(1000)
    await expect(adminPage.locator('text=' + name)).toBeVisible()
  })

  test('编辑学生信息', async ({ adminPage }) => {
    const name = '编辑测试_' + Date.now()
    const res = await api.post('/students', { name, totalHours: 5 })
    const student = await res.json()
    createdIds.push(student.id)

    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    const row = adminPage.locator('tr:has-text("' + name + '")')
    await row.locator('button:has-text("编辑")').first().click()
    const remarkInput = adminPage.locator('.modal textarea')
    if (await remarkInput.count() > 0) {
      await remarkInput.fill('测试备注')
      await adminPage.click('.modal button:has-text("保存")')
      await adminPage.waitForTimeout(1000)
    }
  })

  test('课时充值', async ({ adminPage }) => {
    const name = '充值测试_' + Date.now()
    const res = await api.post('/students', { name, totalHours: 5 })
    const student = await res.json()
    createdIds.push(student.id)

    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    const row = adminPage.locator('tr:has-text("' + name + '")')
    await row.locator('button:has-text("加课")').first().click()
    await adminPage.fill('.modal input[placeholder*="课时"]', '3')
    await adminPage.fill('.modal input[placeholder*="续费"], .modal input[placeholder*="备注"]', '测试充值')
    await adminPage.click('.modal button:has-text("确认")')
    await adminPage.waitForTimeout(1000)
  })

  test('学生状态切换', async ({ adminPage }) => {
    const name = '状态测试_' + Date.now()
    const res = await api.post('/students', { name, totalHours: 5 })
    const student = await res.json()
    createdIds.push(student.id)

    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    const row = adminPage.locator('tr:has-text("' + name + '")')
    await row.locator('.badge').first().click()
    await adminPage.waitForTimeout(500)
    await adminPage.click('.modal button:has-text("退学")')
    await adminPage.click('.modal button:has-text("确认修改")')
    await adminPage.waitForTimeout(1000)
  })

  test('批量添加学生', async ({ adminPage }) => {
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("批量添加")')
    await adminPage.waitForTimeout(500)
    await expect(adminPage.locator('.modal-title:has-text("批量添加")')).toBeVisible()
  })
})
