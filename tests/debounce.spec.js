import { test, expect, ApiClient } from './fixtures.js'

test.describe('防抖 - 防重复提交', () => {
  let api, createdIds = [], createdTeacherIds = [], createdCourseIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test.afterAll(async () => {
    for (const id of createdIds) {
      try { await api.del(`/students/${id}`) } catch {}
    }
    for (const id of createdTeacherIds) {
      try { await api.del(`/teachers/${id}`) } catch {}
    }
    for (const id of createdCourseIds) {
      try { await api.del(`/courses/${id}`) } catch {}
    }
  })

  test('添加学生 - UI提交后按钮变为禁用且文字变为保存中', async ({ adminPage }) => {
    const name = '防抖测试_学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')

    const saveBtn = adminPage.locator('.modal button:has-text("保存")')
    // 点击并立即检查按钮状态
    await saveBtn.click({ noWaitAfter: true })
    await adminPage.waitForTimeout(100)

    // 按钮应变为禁用状态
    const isDisabled = await saveBtn.isDisabled()
    const text = await saveBtn.textContent()

    await adminPage.waitForTimeout(2000)

    // 清理
    const res = await api.get('/students')
    const students = await res.json()
    const created = students.find(s => s.name === name)
    if (created) createdIds.push(created.id)

    expect(isDisabled || text.includes('保存中')).toBeTruthy()
  })

  test('添加教师 - UI提交后按钮变为禁用且文字变为保存中', async ({ adminPage }) => {
    const phone = '13900' + Date.now().toString().slice(-6)
    const name = '防抖测试_教师_' + Date.now()
    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加教师")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="电话"]', phone)

    const saveBtn = adminPage.locator('.modal button:has-text("保存")')
    await saveBtn.click({ noWaitAfter: true })
    await adminPage.waitForTimeout(100)

    const isDisabled = await saveBtn.isDisabled()
    const text = await saveBtn.textContent()

    await adminPage.waitForTimeout(2000)

    // 清理
    const res = await api.get('/teachers')
    const teachers = await res.json()
    const created = teachers.find(t => t.phone === phone)
    if (created) createdTeacherIds.push(created.id)

    expect(isDisabled || text.includes('保存中')).toBeTruthy()
  })

  test('添加学生 - 双击后只创建一条记录', async ({ adminPage }) => {
    const name = '防抖双击_学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')

    // 通过 JS 直接模拟真正的快速双击
    await adminPage.evaluate(() => {
      const btn = document.querySelector('.modal button[type="submit"]')
      if (btn) { btn.click(); btn.click() }
    })

    await adminPage.waitForTimeout(2000)

    const res = await api.get('/students')
    const students = await res.json()
    const matches = students.filter(s => s.name === name)
    for (const s of matches) createdIds.push(s.id)

    expect(matches.length).toBe(1)
  })

  test('添加教师 - 双击后只创建一条记录', async ({ adminPage }) => {
    const phone = '13901' + Date.now().toString().slice(-6)
    const name = '防抖双击_教师_' + Date.now()
    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加教师")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="电话"]', phone)

    await adminPage.evaluate(() => {
      const btn = document.querySelector('.modal button[type="submit"]')
      if (btn) { btn.click(); btn.click() }
    })

    await adminPage.waitForTimeout(2000)

    const res = await api.get('/teachers')
    const teachers = await res.json()
    const matches = teachers.filter(t => t.phone === phone)
    for (const t of matches) createdTeacherIds.push(t.id)

    expect(matches.length).toBe(1)
  })

  test('保存完成后按钮恢复可用', async ({ adminPage }) => {
    const name = '防抖恢复_学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')

    await adminPage.click('.modal button:has-text("保存")')
    await adminPage.waitForTimeout(2000)

    // 模态框应已关闭，再次打开添加学生
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.waitForTimeout(300)

    const saveBtn = adminPage.locator('.modal button:has-text("保存")')
    // 新的保存按钮应该是可用状态
    const isEnabled = await saveBtn.isEnabled()
    const text = await saveBtn.textContent()

    // 清理
    const res = await api.get('/students')
    const students = await res.json()
    const created = students.find(s => s.name === name)
    if (created) createdIds.push(created.id)

    await adminPage.click('.modal button:has-text("取消")')

    expect(isEnabled).toBeTruthy()
    expect(text).toBe('保存')
  })
})
