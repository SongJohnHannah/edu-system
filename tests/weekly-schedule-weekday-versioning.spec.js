import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'
const BASE_URL = process.env.EDUSYSTEM_API_BASE || 'http://localhost:3101'

// Plan B: 周几/开始时间/结束时间 也按版本生效。
// 期望：在「下周」视图把周二调到周四后，本周仍显示周二、上周仍显示周二，
//       仅下周出现周四（且下下周按 cascading 仍是周四）。

function dayOfWeek(date) {
  const dow = date.getDay()
  return dow === 0 ? 7 : dow
}

function dateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nextTuesday() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  let diff = (2 - dayOfWeek(now) + 7) % 7
  if (diff === 0) diff = 7
  const d = new Date(now)
  d.setDate(d.getDate() + diff)
  return d
}

function prevSunday(d) {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}

test.describe('Plan B：weekday/start_time/end_time 跨周版本化', () => {
  let api, teacherAId, teacherBId, studentIds = []

  test.beforeAll(async () => {
    api = new ApiClient(BASE_URL)
    await api.login('admin', 'admin123')

    const tA = await api.post('/teachers', { name: 'P_B_教师A_' + Date.now(), phone: '13970' + Date.now().toString().slice(-6) })
    teacherAId = (await tA.json()).id
    const tB = await api.post('/teachers', { name: 'P_B_教师B_' + Date.now(), phone: '13971' + Date.now().toString().slice(-6) })
    teacherBId = (await tB.json()).id

    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: 'P_B_学生_' + i + '_' + Date.now(), totalHours: 10 })
      studentIds.push((await sRes.json()).id)
    }
  })

  test.beforeEach(async () => {
    // 测试失败可能留下 P_B_ 课程干扰后续断言 ——
    // 每次跑前都清理掉所有 P_B_ 课程（含上次失败留下的）。
    // 注意：只清 P_B_ 前缀的本测试自身的产物，不要碰手动测试数据（如「阿松测试」）。
    const all = await (await api.get('/courses')).json()
    const leftovers = all.filter(c => /^P_B_/.test(c.name || ''))
    for (const c of leftovers) { try { await api.del(`/courses/${c.id}`) } catch {} }
  })

  test.afterAll(async () => {
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherAId) { try { await api.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await api.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('API：编辑"下周"课节后，本周/上周仍按旧值生效', async () => {
    // 把 effectiveFrom 设为本周初，确保本周就有周二 slot
    const thisWeek = prevSunday(new Date())
    const thisWeekStr = dateStr(thisWeek)
    const nextWeek = new Date(thisWeek); nextWeek.setDate(nextWeek.getDate() + 7)
    const lastWeek = new Date(thisWeek); lastWeek.setDate(lastWeek.getDate() - 7)

    const cRes = await api.post('/courses', {
      name: 'P_B_版本化课_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2, // 周二
      startTime: '09:00',
      endTime: '11:00',
      hoursPerClass: 2,
      studentIds,
      effectiveFrom: thisWeekStr,
    })
    const courseId = (await cRes.json()).id

    const nextTue = nextTuesday() // 下周二的日期

    const before = {
      thisWeek: (await (await api.get(`/courses/effective?weekStart=${thisWeekStr}`)).json()),
      nextWeek: (await (await api.get(`/courses/effective?weekStart=${dateStr(nextWeek)}`)).json()),
      lastWeek: (await (await api.get(`/courses/effective?weekStart=${dateStr(lastWeek)}`)).json()),
    }

    const findOurSlots = (slots) => slots.filter(s => s.courseId === courseId)
    expect(findOurSlots(before.thisWeek).length).toBeGreaterThan(0)
    expect(findOurSlots(before.nextWeek).length).toBeGreaterThan(0)
    // 上周可能没有（如果这周一是开学第一周），不强制

    // 确认下周周二有 slot
    const nextTueBefore = findOurSlots(before.nextWeek).find(s => s.slotDate === dateStr(nextTue))
    expect(nextTueBefore).toBeDefined()
    expect(nextTueBefore.weekday).toBe(2)
    expect(nextTueBefore.startTime).toBe('09:00')

    // ---- 步骤 2：模拟"在 WeeklySchedule 上下周视图"里编辑该 slot ----
    //       把周几改成 4（周四）+ 时间改成 14:00-16:00 + 教师换成 B
    //       effectiveFrom = 下周二的日期 + cascading（validUntil=null）
    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      weekday: 4, // 周四
      startTime: '14:00',
      endTime: '16:00',
      effectiveFrom: dateStr(nextTue),
      validUntil: null, // cascading
    })
    expect(putRes.status).toBe(200)

    // ---- 步骤 3：编辑后 — 本周/上周 仍是周二+09:00+教师A；下周变成周四+14:00+教师B ----
    const after = {
      thisWeek: (await (await api.get(`/courses/effective?weekStart=${dateStr(thisWeek)}`)).json()),
      nextWeek: (await (await api.get(`/courses/effective?weekStart=${dateStr(nextWeek)}`)).json()),
      lastWeek: (await (await api.get(`/courses/effective?weekStart=${dateStr(lastWeek)}`)).json()),
    }

    const afterSlots = {
      thisWeek: findOurSlots(after.thisWeek),
      nextWeek: findOurSlots(after.nextWeek),
      lastWeek: findOurSlots(after.lastWeek),
    }

    // 本周：仍应是周二 09:00 + 教师A
    const thisWeekTue = afterSlots.thisWeek.find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    if (thisWeekTue) {
      expect(thisWeekTue.startTime).toBe('09:00')
      expect(thisWeekTue.teacherId).toBe(teacherAId)
    }
    // 本周不应出现周四
    const thisWeekThu = afterSlots.thisWeek.find(s => dayOfWeek(new Date(s.slotDate)) === 4)
    expect(thisWeekThu).toBeUndefined()

    // 上周：仍应是周二 09:00 + 教师A
    const lastWeekTue = afterSlots.lastWeek.find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    if (lastWeekTue) {
      expect(lastWeekTue.startTime).toBe('09:00')
      expect(lastWeekTue.teacherId).toBe(teacherAId)
    }
    const lastWeekThu = afterSlots.lastWeek.find(s => dayOfWeek(new Date(s.slotDate)) === 4)
    expect(lastWeekThu).toBeUndefined()

    // 下周：原来的周二不应再出现；应该出现周四 14:00 + 教师B
    const nextWeekTueStill = afterSlots.nextWeek.find(s => s.slotDate === dateStr(nextTue))
    expect(nextWeekTueStill).toBeUndefined()

    // 下周里最早出现的周四应是新值
    const nextWeekThu = afterSlots.nextWeek
      .filter(s => dayOfWeek(new Date(s.slotDate)) === 4)
      .sort((a, b) => (a.slotDate || '').localeCompare(b.slotDate || ''))[0]
    expect(nextWeekThu).toBeDefined()
    expect(nextWeekThu.startTime).toBe('14:00')
    expect(nextWeekThu.endTime).toBe('16:00')
    expect(nextWeekThu.teacherId).toBe(teacherBId)

    // ---- 步骤 4：历史时间线 — 应有 1 条 history (周二+教师A 被替换) + 1 条 active schedule (新 cascading) ----
    // 新模型: 老 cascading archived=1 (kind=history)；新 cascading archived=0 (kind=schedule)
    const histItems = await (await api.get(`/courses/${courseId}/history`)).json()
    const histories = histItems.filter(i => i.kind === 'history')
    const schedules = histItems.filter(i => i.kind === 'schedule')
    expect(histories.length).toBeGreaterThanOrEqual(1)
    expect(schedules.length).toBeGreaterThanOrEqual(1)

    const replacedHist = histories[0]
    expect(replacedHist.weekday).toBe(2)
    expect(replacedHist.teacherId).toBe(teacherAId)

    const newSch = schedules.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0]
    expect(newSch.weekday).toBe(4)
    expect(newSch.startTime).toBe('14:00')
    expect(newSch.teacherId).toBe(teacherBId)
    expect(newSch.effectiveFrom).toBe(dateStr(nextTue))
    expect(newSch.validUntil === null || newSch.validUntil === undefined || newSch.validUntil === '').toBe(true)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('UI：在 WeeklySchedule 上编辑下周课节后，本周视图不变', async ({ adminPage }) => {
    const thisWeek = prevSunday(new Date())
    const thisWeekStr = dateStr(thisWeek)

    const cRes = await api.post('/courses', {
      name: 'P_B_UI_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2,
      startTime: '08:00',
      endTime: '09:00',
      hoursPerClass: 1,
      studentIds,
      effectiveFrom: thisWeekStr,
    })
    const courseId = (await cRes.json()).id

    const nextTue = nextTuesday()

    // 先在数据库上做一次"编辑下周"的操作，等同于 UI 上的手动流程
    const putRes = await api.put(`/courses/${courseId}`, {
      weekday: 5,
      startTime: '15:00',
      endTime: '16:00',
      effectiveFrom: dateStr(nextTue),
      validUntil: null,
    })
    expect(putRes.status).toBe(200)

    // ---- 本周视图：周二有 bar + 周五没 bar ----
    await adminPage.goto('/weekly-schedule')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.waitForTimeout(600)

    // 当前周内 任意周二列里应该出现本课程的 bar
    const thisWeekTuesdayBar = adminPage.locator('.course-bar:has-text("P_B_UI_")').first()
    await thisWeekTuesdayBar.waitFor({ state: 'visible', timeout: 8000 })
    // bar 应包含 08:00（原始时间）
    await expect(thisWeekTuesdayBar).toContainText('08:00')

    // ---- 切到下周：周二不应再有 bar；周五列应出现新 bar ----
    // 等待 /effective 接口完成后再断言（页面 onMounted/watch weekOffset 都走这里）
    await Promise.all([
      adminPage.waitForResponse(r => r.url().includes('/courses/effective') && r.status() === 200, { timeout: 8000 }).catch(() => null),
      adminPage.click('button:has-text("下周")')
    ])
    await adminPage.waitForLoadState('networkidle')
    await adminPage.waitForTimeout(600)

    // 周二列里不该出现 P_B_UI_（已迁移到周五）
    const allBars = adminPage.locator('.course-bar:has-text("P_B_UI_")')
    const barTexts = await allBars.allTextContents()
    const nextWeekHasTuesday = barTexts.some(t => t.includes('08:00'))
    expect(nextWeekHasTuesday).toBe(false)
    const nextWeekHasFridayNew = barTexts.some(t => t.includes('15:00'))
    expect(nextWeekHasFridayNew).toBe(true)

    // 清理
    await api.del(`/courses/${courseId}`)
  })
})