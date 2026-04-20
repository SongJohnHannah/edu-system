import { test, expect, ApiClient } from './fixtures.js'

test.describe('防抖 - 防重复提交', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  async function cleanup(prefixes) {
    try {
      const res = await api.get('/students')
      const students = await res.json()
      for (const s of students) {
        if (prefixes.some(p => s.name.startsWith(p))) {
          await api.del(`/students/${s.id}`)
        }
      }
    } catch {}
    try {
      const res = await api.get('/teachers')
      const teachers = await res.json()
      for (const t of teachers) {
        if (prefixes.some(p => t.name.startsWith(p))) {
          await api.del(`/teachers/${t.id}`)
        }
      }
    } catch {}
    try {
      const res = await api.get('/courses')
      const courses = await res.json()
      for (const c of courses) {
        if (c.name && prefixes.some(p => c.name.startsWith(p))) {
          await api.del(`/courses/${c.id}`)
        }
      }
    } catch {}
  }

  test.afterAll(async () => {
    await cleanup(['防抖测试_', '防抖双击_', '防抖恢复_', '防抖课时_', '防抖删除_'])
  })

  test('添加学生 - 提交后按钮变禁用', async ({ adminPage }) => {
    const name = '防抖测试_学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')

    const saveBtn = adminPage.locator('.modal button:has-text("保存")')
    await saveBtn.click({ noWaitAfter: true })
    await adminPage.waitForTimeout(100)

    const isDisabled = await saveBtn.isDisabled()
    const text = await saveBtn.textContent()
    await adminPage.waitForTimeout(2000)
    await cleanup(['防抖测试_'])

    expect(isDisabled || text.includes('保存中')).toBeTruthy()
  })

  test('添加教师 - 提交后按钮变禁用', async ({ adminPage }) => {
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
    await cleanup(['防抖测试_'])

    expect(isDisabled || text.includes('保存中')).toBeTruthy()
  })

  test('添加学生 - JS双击只创建一条', async ({ adminPage }) => {
    const name = '防抖双击_学生_' + Date.now()
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.fill('.modal input[placeholder*="姓名"]', name)
    await adminPage.fill('.modal input[placeholder*="课时"]', '10')

    await adminPage.evaluate(() => {
      const btn = document.querySelector('.modal button[type="submit"]')
      if (btn) { btn.click(); btn.click() }
    })
    await adminPage.waitForTimeout(2000)

    const res = await api.get('/students')
    const students = await res.json()
    const matches = students.filter(s => s.name === name)
    await cleanup(['防抖双击_'])

    expect(matches.length).toBe(1)
  })

  test('添加教师 - JS双击只创建一条', async ({ adminPage }) => {
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
    await cleanup(['防抖双击_'])

    expect(matches.length).toBe(1)
  })

  test('充值课时 - JS双击只充值一次', async ({ adminPage }) => {
    // 先创建学生
    const name = '防抖课时_学生_' + Date.now()
    const createRes = await api.post('/students', { name, totalHours: 10 })
    const student = await createRes.json()

    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    const row = adminPage.locator('tr:has-text("' + name + '")')
    await row.locator('button:has-text("加课")').first().click()
    await adminPage.waitForTimeout(500)

    // 填写充值课时
    const hoursInput = adminPage.locator('.modal input[type="number"]')
    if (await hoursInput.count() > 0) {
      await hoursInput.fill('5')
    }

    // JS双击提交
    await adminPage.evaluate(() => {
      const btn = document.querySelector('.modal button[type="submit"]')
      if (btn) { btn.click(); btn.click() }
    })
    await adminPage.waitForTimeout(2000)

    // 验证只充值了一次（totalHours 应该是 15，不是 20）
    const res = await api.get('/students')
    const students = await res.json()
    const updated = students.find(s => s.id === student.id)
    await cleanup(['防抖课时_'])

    expect(updated.totalHours).toBe(15)
  })

  test('删除教师 - JS双击不会重复删除', async ({ adminPage }) => {
    // 创建两个教师
    const phone1 = '13902' + Date.now().toString().slice(-6)
    const phone2 = '13903' + Date.now().toString().slice(-6)
    const name1 = '防抖删除_教师A_' + Date.now()
    const name2 = '防抖删除_教师B_' + Date.now()
    const res1 = await api.post('/teachers', { name: name1, phone: phone1 })
    const res2 = await api.post('/teachers', { name: name2, phone: phone2 })
    const t1 = await res1.json()
    const t2 = await res2.json()

    await adminPage.goto('/teachers')
    await adminPage.waitForLoadState('networkidle')

    // 删除教师A
    const card = adminPage.locator(`.teacher-card:has-text("${name1}")`)
    await card.locator('button:has-text("删除")').first().click()
    await adminPage.waitForTimeout(300)

    // 双击确认删除
    await adminPage.evaluate(() => {
      const buttons = document.querySelectorAll('.modal button')
      const btn = Array.from(buttons).find(b => b.textContent.includes('确认删除'))
      if (btn) { btn.click(); btn.click() }
    })
    await adminPage.waitForTimeout(2000)

    // 验证教师B还在
    const checkRes = await api.get('/teachers')
    const teachers = await checkRes.json()
    const teacherB = teachers.find(t => t.id === t2.id)
    await cleanup(['防抖删除_'])

    expect(teacherB).toBeTruthy()
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

    // 再次打开添加学生
    await adminPage.click('button:has-text("添加学生")')
    await adminPage.waitForTimeout(300)

    const saveBtn = adminPage.locator('.modal button:has-text("保存")')
    const isEnabled = await saveBtn.isEnabled()
    const text = await saveBtn.textContent()

    await cleanup(['防抖恢复_'])
    await adminPage.click('.modal button:has-text("取消")')

    expect(isEnabled).toBeTruthy()
    expect(text).toBe('保存')
  })
})
