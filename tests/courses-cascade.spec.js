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

  test('cascading（validUntil=null）：编辑即改即用，立即永久生效', async () => {
    // 用 weekday=5 (Fri)，确保今天如果是 Fri 时也能在当前周找到 slot
    const cRes = await api.post('/courses', {
      name: 'cascading课程_' + Date.now(),
      teacherId: teacherAId,
      weekday: 5,
      startTime: '15:00',
      endTime: '17:00',
      hoursPerClass: 2,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    // 即改即用：前端不再传 effectiveFrom；后端自动用 today 作为新 cascading 行的 effective_from
    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
    })
    expect(putRes.status).toBe(200)

    // 验证历史时间线：1 条 history (A被替换) + 1 条 active schedule (B 从今天起永久)
    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    const schedules = items.filter(i => i.kind === 'schedule')
    const histories = items.filter(i => i.kind === 'history')

    expect(histories.length).toBeGreaterThanOrEqual(1)
    expect(schedules.length).toBeGreaterThanOrEqual(1)

    // cascading schedule 必须 validUntil 为空
    const newSch = schedules.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0]
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(toDateStr(new Date()))
    expect(newSch.validUntil === null || newSch.validUntil === undefined || newSch.validUntil === '').toBe(true)

    // 验证 effective: 当前所在周应有 teacherBId 的 slot
    const today = new Date()
    const sun = new Date(today)
    sun.setDate(sun.getDate() - (sun.getDay() === 0 ? 0 : sun.getDay()))
    const weekStart = toDateStr(sun)
    const effRes = await api.get(`/courses/effective?weekStart=${weekStart}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const ourSlot = slots.find(s => s.courseId === courseId)
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

    // 即改即用：applyTemp + tempWeekStart = 本周周一；后端返回 [Mon, nextMon) 临时行
    const mon = new Date()
    const dow = mon.getDay() === 0 ? 7 : mon.getDay()
    mon.setDate(mon.getDate() - (dow - 1))
    const tempWeekStart = toDateStr(mon)
    const nextMon = new Date(mon)
    nextMon.setDate(nextMon.getDate() + 7)
    const tempWeekEnd = toDateStr(nextMon)

    // 本周 = tempWeekStart 所在周（Mon..Sun）；/effective 的 weekStart 取该周的周日
    // 例：本周 Mon=Sept 7 → Sun=Sept 6
    const sun = new Date(mon)
    sun.setDate(sun.getDate() - 1)
    const weekStart = toDateStr(sun)

    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      applyTemp: true,
      tempWeekStart,
    })
    expect(putRes.status).toBe(200)

    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    const schedules = items.filter(i => i.kind === 'schedule' && i.validUntil && i.validUntil !== '')

    expect(schedules.length).toBe(1)
    const newSch = schedules[0]
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(tempWeekStart)
    expect(newSch.validUntil).toBe(tempWeekEnd)

    // 验证 effective: temp 行 weekday=5 (周五)，本周内仅周五出现 teacherB
    const fri = new Date(mon)
    fri.setDate(fri.getDate() + 4)  // Mon=0 → Fri=4
    const friStr = toDateStr(fri)
    const effRes = await api.get(`/courses/effective?weekStart=${weekStart}`)
    expect(effRes.status).toBe(200)
    const slots = await effRes.json()
    const ourSlots = slots.filter(s => s.courseId === courseId)
    // 本周内恰好 1 个 slot，落在周五，是 teacherB
    expect(ourSlots.length).toBe(1)
    expect(ourSlots[0].slotDate).toBe(friStr)
    expect(ourSlots[0].teacherId).toBe(teacherBId)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('applyTemp 同周多次：只保留最新 1 行', async () => {
    const cRes = await api.post('/courses', {
      name: '同周覆盖_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      hoursPerClass: 1,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    const mon = new Date()
    const dow = mon.getDay() === 0 ? 7 : mon.getDay()
    mon.setDate(mon.getDate() - (dow - 1))
    const tempWeekStart = toDateStr(mon)

    // 第 1 次 applyTemp
    await api.put(`/courses/${courseId}`, {
      teacherId: teacherAId,
      startTime: '10:00',
      applyTemp: true,
      tempWeekStart,
    })
    // 第 2 次 applyTemp (同周)，会 archive 旧的、插入新的
    await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      startTime: '14:00',
      applyTemp: true,
      tempWeekStart,
    })

    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    const activeTemps = items.filter(i => i.kind === 'schedule' && i.validUntil && i.validUntil !== '')
    expect(activeTemps.length).toBe(1)
    expect(activeTemps[0].teacherId).toBe(teacherBId)
    expect(activeTemps[0].startTime).toBe('14:00')

    await api.del(`/courses/${courseId}`)
  })

  test('cascading 永久改 → 清空所有未来/当前 temp 行', async () => {
    const cRes = await api.post('/courses', {
      name: 'casc清temp_' + Date.now(),
      teacherId: teacherAId,
      weekday: 4,
      startTime: '08:00',
      endTime: '09:00',
      hoursPerClass: 1,
      studentIds,
    })
    const courseId = (await cRes.json()).id

    const mon = new Date()
    const dow = mon.getDay() === 0 ? 7 : mon.getDay()
    mon.setDate(mon.getDate() - (dow - 1))
    const tempWeekStart = toDateStr(mon)

    // 先 applyTemp 建一个临时行
    await api.put(`/courses/${courseId}`, {
      teacherId: teacherAId,
      startTime: '08:00',
      applyTemp: true,
      tempWeekStart,
    })

    let histRes = await api.get(`/courses/${courseId}/history`)
    let items = await histRes.json()
    let activeTemps = items.filter(i => i.kind === 'schedule' && i.validUntil && i.validUntil !== '')
    expect(activeTemps.length).toBe(1)

    // cascading 永久改（不勾 applyTemp）→ 清空 temp
    await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      startTime: '20:00',
    })

    histRes = await api.get(`/courses/${courseId}/history`)
    items = await histRes.json()
    activeTemps = items.filter(i => i.kind === 'schedule' && i.validUntil && i.validUntil !== '')
    expect(activeTemps.length).toBe(0)
    const activeCasc = items.filter(i => i.kind === 'schedule' && (!i.validUntil || i.validUntil === ''))
    expect(activeCasc.length).toBe(1)
    expect(activeCasc[0].teacherId).toBe(teacherBId)

    await api.del(`/courses/${courseId}`)
  })

  test('UI：编辑课程时显示「查看周」+ 整周临时开关', async ({ adminPage }) => {
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

    // 顶部 banner 改显示"查看周" + 周范围（不再是"生效日期"+具体日期）
    const banner = adminPage.locator('.effective-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('查看周')
    // 文案形如 "9月7日-13日" 或 "9月28日-10月4日"
    await expect(banner).toContainText(/\d+月\d+日-\d+/)

    // 没有本周临时 → 复选框默认未勾选（= cascading）
    const toggle = adminPage.locator('.cascade-toggle input[type="checkbox"]')
    await expect(toggle).toBeVisible()
    const isChecked = await toggle.isChecked()
    expect(isChecked).toBe(false)

    // cascade-text 显示动态周范围文案
    const cascadeText = adminPage.locator('.cascade-text')
    await expect(cascadeText).toContainText('整周')

    // 默认状态显示 cascading 提示
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

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}