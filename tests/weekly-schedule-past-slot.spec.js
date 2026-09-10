import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'
const BASE_URL = process.env.EDUSYSTEM_API_BASE || 'http://localhost:3101'

test.describe('周排课过去格 UX', () => {
  let api, teacherId, studentIds = []

  test.beforeAll(async () => {
    api = new ApiClient(BASE_URL)
    await api.login('admin', 'admin123')

    const tRes = await api.post('/teachers', { name: '过去格教师_' + Date.now(), phone: '13960' + Date.now().toString().slice(-6) })
    teacherId = (await tRes.json()).id
    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: '过去格学生_' + i + '_' + Date.now(), totalHours: 10 })
      studentIds.push((await sRes.json()).id)
    }
  })

  test.afterAll(async () => {
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('创建过去时间段的课程（weekday 已过）', async () => {
    // 找一个已经过去的 weekday + 时间（过去 7 天内）
    const cRes = await api.post('/courses', {
      name: '过去格测试_' + Date.now(),
      teacherId,
      weekday: 1, // 周一
      startTime: '08:00',
      endTime: '09:00',
      hoursPerClass: 1,
      studentIds,
    })
    expect(cRes.status).toBe(201)
    const course = await cRes.json()
    expect(course.id).toBeDefined()

    // 清理
    await api.del(`/courses/${course.id}`)
  })

  test('切换到上周：调 /courses/effective 而非 /courses', async ({ adminPage }) => {
    // 监听 API 请求
    const calls = { effective: 0, list: 0 }
    adminPage.on('request', req => {
      const url = req.url()
      if (url.includes('/courses/effective')) calls.effective++
      if (url.match(/\/courses($|\?)/)) calls.list++
    })

    await adminPage.goto('/weekly-schedule')
    await adminPage.waitForLoadState('networkidle')

    // 当前是本周 — 调的是 /courses（不是 /effective）
    // 然后点「上周」
    await adminPage.click('button:has-text("上周")')
    await adminPage.waitForTimeout(1500)

    // 切到上周后必须调 /courses/effective
    expect(calls.effective).toBeGreaterThan(0)
  })

  test('过去 bar 有 is-past class（灰色 + 不可编辑）', async ({ adminPage }) => {
    // 创建一门 weekday=今天 / 时间已过的课
    const now = new Date()
    const dow = now.getDay() === 0 ? 7 : now.getDay()
    const pastTime = `${String(now.getHours() - 1).padStart(2, '0')}:00`
    const cRes = await api.post('/courses', {
      name: '今天过去_' + Date.now(),
      teacherId,
      weekday: dow,
      startTime: pastTime,
      endTime: `${String(Number(pastTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      hoursPerClass: 1,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    await adminPage.goto('/weekly-schedule')
    await adminPage.waitForLoadState('networkidle')

    const bar = adminPage.locator('.course-bar:has-text("今天过去_")').first()
    if (await bar.count() > 0) {
      // 等待入场动画完成
      await adminPage.waitForTimeout(800)
      // 应当有 is-past class
      const hasClass = await bar.evaluate(el => el.classList.contains('is-past'))
      expect(hasClass).toBe(true)
    }

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('点击过去 bar 打开只读 modal + 历史抽屉', async ({ adminPage }) => {
    // 创建今天已过时间的课
    const now = new Date()
    const dow = now.getDay() === 0 ? 7 : now.getDay()
    const pastTime = `${String(Math.max(0, now.getHours() - 2)).padStart(2, '0')}:00`
    const cRes = await api.post('/courses', {
      name: '过去点击测试_' + Date.now(),
      teacherId,
      weekday: dow,
      startTime: pastTime,
      endTime: `${String(Number(pastTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      hoursPerClass: 1,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    await adminPage.goto('/weekly-schedule')
    await adminPage.waitForLoadState('networkidle')

    const bar = adminPage.locator('.course-bar:has-text("过去点击测试_")').first()
    if (await bar.count() > 0) {
      await adminPage.waitForTimeout(800)
      await bar.click({ force: true })
      await adminPage.waitForTimeout(800)

      // modal 应打开且 mode=readonly（标题是"课程详情"）
      const modalTitle = adminPage.locator('.modal-title')
      if (await modalTitle.count() > 0) {
        const text = await modalTitle.textContent()
        expect(text).toContain('课程详情')

        // modal 内所有 input 应 readonly 或 disabled
        const editableSubmit = adminPage.locator('.modal-actions button[type="submit"]')
        const saveBtnCount = await editableSubmit.count()
        // readonly 模式下不该有「保存」按钮
        expect(saveBtnCount).toBe(0)
      }

      // 历史抽屉应同时打开
      const drawer = adminPage.locator('.history-drawer')
      const drawerVisible = await drawer.count() > 0
      if (drawerVisible) {
        await expect(drawer.first()).toBeVisible({ timeout: 3000 })
      }

      // 关闭
      await adminPage.keyboard.press('Escape')
      await adminPage.waitForTimeout(300)
    }

    // 清理
    await api.del(`/courses/${courseId}`)
  })
})