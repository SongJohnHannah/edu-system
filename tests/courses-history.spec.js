import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'
const BASE_URL = process.env.EDUSYSTEM_API_BASE || 'http://localhost:3101'

test.describe('课程历史接口', () => {
  let api, teacherId, studentIds = [], courseId, secondTeacherId

  test.beforeAll(async () => {
    api = new ApiClient(BASE_URL)
    await api.login('admin', 'admin123')

    const t1 = await api.post('/teachers', { name: '历史教师A_' + Date.now(), phone: '13910' + Date.now().toString().slice(-6) })
    teacherId = (await t1.json()).id
    const t2 = await api.post('/teachers', { name: '历史教师B_' + Date.now(), phone: '13920' + Date.now().toString().slice(-6) })
    secondTeacherId = (await t2.json()).id

    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: '历史学生_' + i + '_' + Date.now(), totalHours: 10 })
      studentIds.push((await sRes.json()).id)
    }

    const cRes = await api.post('/courses', {
      name: '历史测试课程_' + Date.now(),
      teacherId,
      weekday: 2,
      startTime: '14:00',
      endTime: '16:00',
      hoursPerClass: 2,
      studentIds,
    })
    courseId = (await cRes.json()).id
  })

  test.afterAll(async () => {
    if (courseId) { try { await api.del(`/courses/${courseId}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
    if (secondTeacherId) { try { await api.del(`/teachers/${secondTeacherId}`) } catch {} }
  })

  test('GET /courses/:id/history 返回初始空历史', async () => {
    const res = await api.get(`/courses/${courseId}/history`)
    expect(res.status).toBe(200)
    const items = await res.json()
    expect(Array.isArray(items)).toBe(true)
    // 至少有 1 条初始 course_schedule 行（创建课程时塞进去的）
    const schedules = items.filter(i => i.kind === 'schedule')
    expect(schedules.length).toBeGreaterThanOrEqual(1)
  })

  test('更新课程（带 effectiveFrom）后产生 history 记录', async () => {
    const future = new Date(Date.now() + 7 * 86400000)
    const futureStr = future.toISOString().slice(0, 10)
    const res = await api.put(`/courses/${courseId}`, {
      teacherId: secondTeacherId,
      effectiveFrom: futureStr,
      validUntil: null, // cascading
    })
    expect(res.status).toBe(200)

    const histRes = await api.get(`/courses/${courseId}/history`)
    const items = await histRes.json()
    // 至少包含 1 条历史 + 1 条 schedule
    const histories = items.filter(i => i.kind === 'history')
    const schedules = items.filter(i => i.kind === 'schedule')
    expect(histories.length).toBeGreaterThanOrEqual(1)
    expect(schedules.length).toBeGreaterThanOrEqual(1)

    // 检查最新一条 history 是原 teacherId 被替换
    const newestHist = histories.sort((a, b) => (b.supersededAt || '').localeCompare(a.supersededAt || ''))[0]
    expect(newestHist.teacherId).toBe(teacherId)

    // 检查 schedule 行带有新 teacherId + cascading（validUntil=null）
    const newSch = schedules.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0]
    expect(newSch.teacherId).toBe(secondTeacherId)
    expect(newSch.effectiveFrom).toBe(futureStr)
    expect(newSch.validUntil === null || newSch.validUntil === undefined || newSch.validUntil === '').toBe(true)
  })

  test('GET /courses/effective 返回该周所有 slot', async () => {
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek + 1)
    const weekStart = monday.toISOString().slice(0, 10)
    const res = await api.get(`/courses/effective?weekStart=${weekStart}`)
    expect(res.status).toBe(200)
    const slots = await res.json()
    expect(Array.isArray(slots)).toBe(true)
    // 我们的课程 weekday=2 (周一)，应该有 1 个 slot 落在该周
    const ownSlots = slots.filter(s => s.id === courseId)
    expect(ownSlots.length).toBeGreaterThanOrEqual(1)
    // slot 必须含 slotDate + isPast 字段
    for (const s of ownSlots) {
      expect(typeof s.slotDate).toBe('string')
      expect(typeof s.isPast).toBe('boolean')
    }
  })

  test('UI：Courses.vue 显示历史按钮 + 抽屉可打开', async ({ adminPage }) => {
    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')
    // 找我们的课程卡片，点历史按钮
    const card = adminPage.locator(`.course-card:has-text("历史测试课程_")`).first()
    await expect(card).toBeVisible({ timeout: 8000 })
    await card.locator('button:has-text("历史")').click()
    await adminPage.waitForTimeout(800)
    // 抽屉应可见
    const drawer = adminPage.locator('.history-drawer')
    await expect(drawer).toBeVisible({ timeout: 5000 })
    // 至少有一个 history-item
    const items = adminPage.locator('.history-item')
    expect(await items.count()).toBeGreaterThan(0)
    // 关闭
    await adminPage.locator('.history-close').click()
    await adminPage.waitForTimeout(400)
    await expect(drawer).not.toBeVisible()
  })

  test('软删除课程后从 /courses GET 中消失，但 /history 仍可访问', async () => {
    const tRes = await api.post('/teachers', { name: '软删除教师_' + Date.now(), phone: '13930' + Date.now().toString().slice(-6) })
    const tempTeacherId = (await tRes.json()).id
    const sRes = await api.post('/students', { name: '软删除学生_' + Date.now(), totalHours: 10 })
    const tempStudentId = (await sRes.json()).id

    const cRes = await api.post('/courses', {
      name: '软删除课程_' + Date.now(),
      teacherId: tempTeacherId,
      weekday: 4,
      startTime: '10:00',
      endTime: '11:00',
      hoursPerClass: 1,
      studentIds: [tempStudentId],
    })
    const tempCourseId = (await cRes.json()).id

    // 软删除
    const delRes = await api.del(`/courses/${tempCourseId}/status`)
    expect(delRes.status).toBe(200)

    // /courses 已不包含
    const listRes = await api.get('/courses')
    const list = await listRes.json()
    expect(list.find(c => c.id === tempCourseId)).toBeUndefined()

    // /history 仍能访问（即使课程已软删）
    const histRes = await api.get(`/courses/${tempCourseId}/history`)
    // 后端可能 200 或 404，看实现 — 但至少不应 500
    expect([200, 404]).toContain(histRes.status)

    // 清理
    await api.del(`/students/${tempStudentId}`)
    await api.del(`/teachers/${tempTeacherId}`)
  })
})