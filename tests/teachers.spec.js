import { test, expect, ApiClient } from './fixtures.js'

test.describe('教师管理 (Admin)', () => {
  let api, createdIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test.afterAll(async () => {
    for (const id of createdIds) {
      try { await api.del(`/teachers/${id}`) } catch {}
    }
  })

  test('教师列表加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })

  test('添加教师', async ({ adminPage }) => {
    const phone = '13800' + Date.now().toString().slice(-6)
    const name = 'UI测试教师_' + Date.now()
    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加教师")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="电话"]', phone)
    await adminPage.click('.modal button:has-text("保存")')
    await adminPage.waitForTimeout(2000)
    const res = await api.get('/teachers')
    const teachers = await res.json()
    const created = teachers.find(t => t.phone === phone)
    if (created) createdIds.push(created.id)
  })

  test('编辑教师', async ({ adminPage }) => {
    const phone = '13801' + Date.now().toString().slice(-6)
    const res = await api.post('/teachers', { name: '编辑教师_' + Date.now(), phone })
    const teacher = await res.json()
    createdIds.push(teacher.id)

    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    const card = adminPage.locator(`.teacher-card:has-text("${teacher.name}")`)
    await card.locator('button:has-text("编辑")').first().click()
    await adminPage.waitForTimeout(500)
  })

  test('删除教师', async ({ adminPage }) => {
    const phone = '13802' + Date.now().toString().slice(-6)
    const name = '删除教师_' + Date.now()
    const res = await api.post('/teachers', { name, phone })
    const teacher = await res.json()
    createdIds.push(teacher.id)

    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    const card = adminPage.locator(`.teacher-card:has-text("${name}")`)
    await card.locator('button:has-text("删除")').first().click()
    await adminPage.click('.modal button:has-text("确认")')
    await adminPage.waitForTimeout(1000)
    createdIds = createdIds.filter(id => id !== teacher.id)
  })
})
