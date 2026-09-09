import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'

test.describe('课程版本生效模式：cascading vs 临时窗口', () => {
  let api, teacherAId, teacherBId, studentIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
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

    const future = new Date(Date.now() + 14 * 86400000) // 两周后
    const futureStr = future.toISOString().slice(0, 10)

    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      effectiveFrom: futureStr,
      validUntil: null, // cascading
    })
    expect(putRes.status).toBe(200)

    // 验证历史时间线：1 条 history (A被替换) + 1 条 schedule (B从future起永久)
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

    // 验证 effective：在 futureStr 当天查询，应当返回 teacherBId
    const effRes = await api.get(`/courses/effective?weekStart=${futureStr}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const ourSlot = slots.find(s => s.courseId === courseId && s.slotDate === futureStr)
    expect(ourSlot).toBeDefined()
    expect(ourSlot.teacherId).toBe(teacherBId)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('临时窗口（validUntil=有效日期）：仅当天/某天临时生效', async () => {
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
    const todayStr = today.toISOString().slice(0, 10)
    const tomorrow = new Date(today.getTime() + 86400000)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    // 仅本节：validUntil = tomorrowStr → 仅 todayStr 当天用 B，之后恢复 A
    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      effectiveFrom: todayStr,
      validUntil: tomorrowStr,
    })
    expect(putRes.status).toBe(200)

    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    const schedules = items.filter(i => i.kind === 'schedule')

    // schedule 行必须有 validUntil=tomorrow
    const newSch = schedules.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0]
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(todayStr)
    expect(newSch.validUntil).toBe(tomorrowStr)

    // 验证 effective：今天应是 B，明天恢复 A
    const effRes = await api.get(`/courses/effective?weekStart=${todayStr}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const todaySlot = slots.find(s => s.courseId === courseId && s.slotDate === todayStr)
    const tomorrowSlot = slots.find(s => s.courseId === courseId && s.slotDate === tomorrowStr)
    if (todaySlot) expect(todaySlot.teacherId).toBe(teacherBId)
    if (tomorrowSlot) expect(tomorrowSlot.teacherId).toBe(teacherAId)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('UI：编辑课程时显示「生效日期」+ cascading 开关', async ({ adminPage }) => {
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

    // cascading 开关存在且默认勾选
    const toggle = adminPage.locator('.cascade-toggle input[type="checkbox"]')
    await expect(toggle).toBeVisible()
    const isChecked = await toggle.isChecked()
    expect(isChecked).toBe(true)

    // 取消勾选 → 提示「仅本节临时覆盖」
    await toggle.click()
    await adminPage.waitForTimeout(200)
    await expect(adminPage.locator('.cascade-hint')).toContainText('仅本节')

    // 关闭 modal
    await adminPage.locator('.modal button:has-text("取消")').click()
    await adminPage.waitForTimeout(300)

    // 清理
    await api.del(`/courses/${courseId}`)
  })
})