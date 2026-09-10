import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'
const BASE_URL = process.env.EDUSYSTEM_API_BASE || 'http://localhost:3101'

test.describe('课程版本生效模式：cascading vs 临时窗口', () => {
  let api, teacherAId, teacherBId, studentIds = []

  test.beforeAll(async () => {
    api = new ApiClient(BASE_URL)
    await api.login('admin', 'admin123')

    const tA = await api.post('/teachers', { name: '教师A_' + Date.now(), phone: '13940' + Date.now().toString().slice(-6) })
    teacherAId = (await tA.json()).id
    const tB = await api.post('/teachers', { name: '教师B_' + Date.now(), phone: '13950' + Date.now().toString().slice(-6) })
    teacherBId = (await tB.json()).id

    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: '版本学生_' + i + '_' + Date.now(), totalHours: 10 })
      studentIds.push((await sRes.json()).id)
    }
  })

  test.afterAll(async () => {
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherAId) { try { await api.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await api.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('cascading（validUntil=null）：从某天起永久生效', async () => {
    const cRes = await api.post('/courses', {
      name: 'cascading课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 3,
      startTime: '15:00',
      endTime: '17:00',
      hoursPerClass: 2,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    // 找一个未来 weekday=3 (周三) 的日期，作为 new eff
    let future = new Date()
    future.setHours(0, 0, 0, 0)
    while (((future.getDay() || 7) !== 3) || future <= new Date()) {
      future.setDate(future.getDate() + 1)
    }
    // 本地日期（避免 toISOString 的 UTC 偏移）
    const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`

    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      effectiveFrom: futureStr,
      validUntil: null, // cascading
    })
    expect(putRes.status).toBe(200)

    // 验证历史时间线：1 条 history (A被替换) + 1 条 active schedule (B从future起永久)
    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    const schedules = items.filter(i => i.kind === 'schedule')
    const histories = items.filter(i => i.kind === 'history')

    expect(histories.length).toBeGreaterThanOrEqual(1)
    expect(schedules.length).toBeGreaterThanOrEqual(1)

    // cascading schedule 必须 validUntil 为空
    const newSch = schedules.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0]
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(futureStr)
    expect(newSch.validUntil === null || newSch.validUntil === undefined || newSch.validUntil === '').toBe(true)

    // 验证 effective: 在 futureStr 当天所在周，应有 teacherBId 的 slot
    const effRes = await api.get(`/courses/effective?weekStart=${futureStr}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const ourSlot = slots.find(s => s.courseId === courseId && s.slotDate === futureStr)
    expect(ourSlot).toBeDefined()
    expect(ourSlot.teacherId).toBe(teacherBId)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('临时窗口（applyTemp=true）：仅本周一节临时生效', async () => {
    const cRes = await api.post('/courses', {
      name: '临时窗口课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 5,
      startTime: '16:00',
      endTime: '18:00',
      hoursPerClass: 2,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // 本周(weekStart=本周日)，用于 effective 查询
    const sun = new Date(today)
    sun.setDate(sun.getDate() - (sun.getDay() === 0 ? 0 : sun.getDay()))
    const weekStart = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`

    // 新模型：applyTemp=true + effectiveFrom=今天 → 本周临时覆盖
    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      effectiveFrom: todayStr,
      applyTemp: true,
    })
    expect(putRes.status).toBe(200)

    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    // 本周临时行 validUntil != null，且 archived=0 → kind='schedule'
    const schedules = items.filter(i => i.kind === 'schedule' && i.validUntil && i.validUntil !== '')

    // schedule 行必须有 validUntil=下周一（不是 tomorrowStr）
    expect(schedules.length).toBe(1)
    const newSch = schedules[0]
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(todayStr)
    expect(newSch.validUntil).toBeTruthy()
    // validUntil 应该是下周一（明天之后）
    expect(newSch.validUntil > todayStr).toBe(true)

    // 验证 effective: temp 行 weekday=5 (周五)，本周内仅周五 9/11 应出现 teacherB
    // 本周(weekStart=本周日)的周五日期
    const fri = new Date(sun)
    fri.setDate(fri.getDate() + 5)
    const friStr = `${fri.getFullYear()}-${String(fri.getMonth() + 1).padStart(2, '0')}-${String(fri.getDate()).padStart(2, '0')}`
    const effRes = await api.get(`/courses/effective?weekStart=${weekStart}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const ourSlots = slots.filter(s => s.courseId === courseId)
    // 本周内应该恰好 1 个 slot，落在周五
    expect(ourSlots.length).toBe(1)
    expect(ourSlots[0].slotDate).toBe(friStr)
    expect(ourSlots[0].teacherId).toBe(teacherBId)
    // 本周其他日(非周五)不出现
    const otherDays = ourSlots.filter(s => s.slotDate !== friStr)
    expect(otherDays.length).toBe(0)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('UI：编辑课程时显示「生效日期」+ 本周临时开关', async ({ adminPage }) => {
    const cRes = await api.post('/courses', {
      name: 'UI模式课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')
    const card = adminPage.locator(`.course-card:has-text("UI模式课程_")`).first()
    await expect(card).toBeVisible({ timeout: 8000 })
    await card.locator('button:has-text("编辑")').click()
    await adminPage.waitForTimeout(700)

    // 顶部生效日期 banner
    const banner = adminPage.locator('.effective-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('生效日期')

    // 没有本周临时 → 复选框默认未勾选（= cascading）
    const toggle = adminPage.locator('.cascade-toggle input[type="checkbox"]')
    await expect(toggle).toBeVisible()
    const isChecked = await toggle.isChecked()
    expect(isChecked).toBe(false)

    // 默认状态下显示 cascading 提示
    await expect(adminPage.locator('.cascade-hint')).toContainText('cascading')

    // 勾上 → 提示消失（= 本周临时模式）
    await toggle.click()
    await adminPage.waitForTimeout(200)
    await expect(adminPage.locator('.cascade-hint')).toHaveCount(0)

    // 关闭 modal
    await adminPage.locator('.modal button:has-text("取消")').click()
    await adminPage.waitForTimeout(300)

    // 清理
    await api.del(`/courses/${courseId}`)
  })
})