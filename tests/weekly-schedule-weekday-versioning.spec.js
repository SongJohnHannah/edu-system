import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'
const BASE_URL = process.env.EDUSYSTEM_API_BASE || 'http://localhost:3101'

// 即改即用：cascading 编辑立即生效（eff=today）；「仅下周生效」改用 applyTemp+tempWeekStart。
// 期望：在「下周」视图编辑课节 + 勾 applyTemp → 本周/上周仍按旧值生效，仅下周出现新值。

function dayOfWeek(date) {
  const dow = date.getDay()
  return dow === 0 ? 7 : dow
}

function dateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function thisMonday() {
  const now = new Date()
  const dow = now.getDay() === 0 ? 7 : now.getDay()
  const m = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow - 1))
  return m
}

function nextMonday() {
  const m = thisMonday()
  m.setDate(m.getDate() + 7)
  return m
}

function prevSunday(d) {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}

test.describe('即改即用：applyTemp 让修改仅作用于所查看的那一周', () => {
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
    const all = await (await api.get('/courses')).json()
    const leftovers = all.filter(c => /^P_B_/.test(c.name || ''))
    for (const c of leftovers) { try { await api.del(`/courses/${c.id}`) } catch {} }
  })

  test.afterAll(async () => {
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherAId) { try { await api.del(`/teachers/${teacherAId}`) } catch {} }
    if (teacherBId) { try { await api.del(`/teachers/${teacherBId}`) } catch {} }
  })

  test('API：下周临时（applyTemp + tempWeekStart）→ 仅下周生效，本周/上周仍按旧值', async () => {
    const thisMon = thisMonday()
    const thisMonStr = dateStr(thisMon)
    const thisWeekStart = prevSunday(new Date())  // 周日作为 /effective 的 weekStart
    const thisWeekStr = dateStr(thisWeekStart)
    const nextMon = nextMonday()
    const nextMonStr = dateStr(nextMon)
    const nextWeekStart = new Date(thisWeekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7)
    const nextWeekStr = dateStr(nextWeekStart)
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekStr = dateStr(lastWeekStart)

    const cRes = await api.post('/courses', {
      name: 'P_B_临时课_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2, // 周二
      startTime: '09:00',
      endTime: '11:00',
      hoursPerClass: 2,
      studentIds,
      effectiveFrom: thisMonStr,
    })
    const courseId = (await cRes.json()).id

    const before = {
      thisWeek: (await (await api.get(`/courses/effective?weekStart=${thisWeekStr}`)).json()),
      nextWeek: (await (await api.get(`/courses/effective?weekStart=${nextWeekStr}`)).json()),
    }
    const findOurSlots = (slots) => slots.filter(s => s.courseId === courseId)
    expect(findOurSlots(before.thisWeek).length).toBeGreaterThan(0)
    expect(findOurSlots(before.nextWeek).length).toBeGreaterThan(0)

    // ---- 模拟"在 WeeklySchedule 上下周视图"编辑 + 勾 applyTemp ----
    // 把周几改成 4（周四）+ 时间改成 14:00-16:00 + 教师换成 B
    // 仅下周临时覆盖（[nextMon, next+7Mon)）
    const putRes = await api.put(`/courses/${courseId}`, {
      teacherId: teacherBId,
      weekday: 4, // 周四
      startTime: '14:00',
      endTime: '16:00',
      applyTemp: true,
      tempWeekStart: nextMonStr,
    })
    expect(putRes.status).toBe(200)

    // ---- 验证：本周/上周仍是周二+09:00+教师A；下周变成周四+14:00+教师B ----
    const after = {
      thisWeek: (await (await api.get(`/courses/effective?weekStart=${thisWeekStr}`)).json()),
      nextWeek: (await (await api.get(`/courses/effective?weekStart=${nextWeekStr}`)).json()),
      lastWeek: (await (await api.get(`/courses/effective?weekStart=${lastWeekStr}`)).json()),
    }

    // 本周：仍应是周二 09:00 + 教师A
    const thisWeekTue = findOurSlots(after.thisWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    if (thisWeekTue) {
      expect(thisWeekTue.startTime).toBe('09:00')
      expect(thisWeekTue.teacherId).toBe(teacherAId)
    }
    // 本周不应出现周四
    expect(findOurSlots(after.thisWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 4)).toBeUndefined()

    // 上周：仍应是周二 09:00 + 教师A
    const lastWeekTue = findOurSlots(after.lastWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    if (lastWeekTue) {
      expect(lastWeekTue.startTime).toBe('09:00')
      expect(lastWeekTue.teacherId).toBe(teacherAId)
    }
    expect(findOurSlots(after.lastWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 4)).toBeUndefined()

    // 下周：原来的周二不应再出现；应该出现周四 14:00 + 教师B
    const nextWeekTueStill = findOurSlots(after.nextWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    expect(nextWeekTueStill).toBeUndefined()
    const nextWeekThu = findOurSlots(after.nextWeek)
      .filter(s => dayOfWeek(new Date(s.slotDate)) === 4)
      .sort((a, b) => (a.slotDate || '').localeCompare(b.slotDate || ''))[0]
    expect(nextWeekThu).toBeDefined()
    expect(nextWeekThu.startTime).toBe('14:00')
    expect(nextWeekThu.endTime).toBe('16:00')
    expect(nextWeekThu.teacherId).toBe(teacherBId)

    // 历史时间线：applyTemp 不 archive 老 cascading，只 insert 新 temp 行；
    // 老 cascading row 保留 (active=0 schedule)，新 temp 行 (active=0 schedule)。
    const histItems = await (await api.get(`/courses/${courseId}/history`)).json()
    const schedules = histItems.filter(i => i.kind === 'schedule')
    // active temp 行：validUntil != null，eff = nextMon
    const activeTemps = schedules.filter(s => s.validUntil && s.validUntil !== '')
    expect(activeTemps.length).toBe(1)
    expect(activeTemps[0].weekday).toBe(4)
    expect(activeTemps[0].startTime).toBe('14:00')
    expect(activeTemps[0].teacherId).toBe(teacherBId)
    expect(activeTemps[0].effectiveFrom).toBe(nextMonStr)

    // 清理
    await api.del(`/courses/${courseId}`)
  })

  test('API：cascading 立即生效（不勾 applyTemp）→ 本周和下周都用新值', async () => {
    const thisMon = thisMonday()
    const thisMonStr = dateStr(thisMon)
    const thisWeekStart = prevSunday(new Date())
    const thisWeekStr = dateStr(thisWeekStart)
    const nextWeekStart = new Date(thisWeekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7)
    const nextWeekStr = dateStr(nextWeekStart)

    const cRes = await api.post('/courses', {
      name: 'P_B_立即_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2,
      startTime: '08:00',
      endTime: '09:00',
      hoursPerClass: 1,
      studentIds,
      effectiveFrom: thisMonStr,
    })
    const courseId = (await cRes.json()).id

    // 不勾 applyTemp → 后端用 today 作为 eff，本周和下周都用新值
    await api.put(`/courses/${courseId}`, {
      weekday: 5,
      startTime: '15:00',
      endTime: '16:00',
    })

    const after = {
      thisWeek: (await (await api.get(`/courses/effective?weekStart=${thisWeekStr}`)).json()),
      nextWeek: (await (await api.get(`/courses/effective?weekStart=${nextWeekStr}`)).json()),
    }
    const findOurSlots = (slots) => slots.filter(s => s.courseId === courseId)

    // 即改即用语义：edit 后从 today 起永久生效。
    // 本周 today 之后（含 today）的 Tue 替换成 Fri；today 之前的 Tue 仍按旧值作为历史快照。
    const today = new Date()
    const todayStr = dateStr(today)
    const ourThisWeekSlots = findOurSlots(after.thisWeek)
    // 未来 / 今天本身：周二不再出现
    const futureTue = ourThisWeekSlots.find(s => s.slotDate > todayStr && dayOfWeek(new Date(s.slotDate)) === 2)
    expect(futureTue).toBeUndefined()
    // 今天/未来 出现周五（teacherB 15:00）
    const thisWeekFri = ourThisWeekSlots.find(s => s.slotDate >= todayStr && dayOfWeek(new Date(s.slotDate)) === 5)
    expect(thisWeekFri).toBeDefined()
    expect(thisWeekFri.startTime).toBe('15:00')

    // 下周：周二不再出现；周五 + 新值（cascading 已影响未来）
    const nextWeekTue = findOurSlots(after.nextWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 2)
    expect(nextWeekTue).toBeUndefined()
    const nextWeekFri = findOurSlots(after.nextWeek).find(s => dayOfWeek(new Date(s.slotDate)) === 5)
    expect(nextWeekFri).toBeDefined()
    expect(nextWeekFri.startTime).toBe('15:00')

    await api.del(`/courses/${courseId}`)
  })

  test('UI：下周临时勾上后，本周视图保持原状', async ({ adminPage }) => {
    const thisMon = thisMonday()
    const thisMonStr = dateStr(thisMon)

    const cRes = await api.post('/courses', {
      name: 'P_B_UI_' + Date.now(),
      teacherId: teacherAId,
      weekday: 2,
      startTime: '08:00',
      endTime: '09:00',
      hoursPerClass: 1,
      studentIds,
      effectiveFrom: thisMonStr,
    })
    const courseId = (await cRes.json()).id

    const nextMon = nextMonday()
    const nextMonStr = dateStr(nextMon)

    // 等同于 UI 上下周视图编辑 + 勾 applyTemp 的流程
    await api.put(`/courses/${courseId}`, {
      weekday: 5,
      startTime: '15:00',
      endTime: '16:00',
      applyTemp: true,
      tempWeekStart: nextMonStr,
    })

    // ---- 本周视图：周二有 bar（08:00）+ 周五没 bar ----
    await adminPage.goto('/weekly-schedule')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.waitForTimeout(600)

    const thisWeekTuesdayBar = adminPage.locator('.course-bar:has-text("P_B_UI_")').first()
    await thisWeekTuesdayBar.waitFor({ state: 'visible', timeout: 8000 })
    await expect(thisWeekTuesdayBar).toContainText('08:00')

    // ---- 切到下周：周二不应再有 bar；周五列应出现新 bar ----
    await Promise.all([
      adminPage.waitForResponse(r => r.url().includes('/courses/effective') && r.status() === 200, { timeout: 8000 }).catch(() => null),
      adminPage.click('button:has-text("下周")')
    ])
    await adminPage.waitForLoadState('networkidle')
    await adminPage.waitForTimeout(600)

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