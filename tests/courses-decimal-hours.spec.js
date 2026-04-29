import { test, expect, ApiClient } from './fixtures.js'

const API = 'http://localhost:3001'

async function getStudent(api, id) {
  const res = await api.get('/students')
  const students = await res.json()
  return students.find(s => s.id === id)
}

test.describe('课程课时小数支持', () => {
  let api, teacherId, studentIds = [], courseIds = []

  test.beforeAll(async () => {
    api = new ApiClient(API)
    await api.login('admin', 'admin123')
    const tRes = await api.post('/teachers', { name: '小数课时教师_' + Date.now(), phone: '13800' + Date.now().toString().slice(-6) })
    const t = await tRes.json()
    teacherId = t.id
    for (let i = 0; i < 2; i++) {
      const sRes = await api.post('/students', { name: '小数课时学生_' + i + '_' + Date.now(), totalHours: 20 })
      const s = await sRes.json()
      studentIds.push(s.id)
    }
  })

  test.afterAll(async () => {
    for (const id of courseIds) { try { await api.del(`/courses/${id}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('创建课程 - hoursPerClass=0.5', async () => {
    const res = await api.post('/courses', {
      name: '小数课时课程_0.5_' + Date.now(),
      teacherId,
      weekday: 1,
      startTime: '10:00',
      endTime: '10:30',
      hoursPerClass: 0.5,
      studentIds,
    })
    expect(res.ok).toBeTruthy()
    const course = await res.json()
    expect(course.hoursPerClass).toBe(0.5)
    expect(course.isTest).toBe(true)
    courseIds.push(course.id)
  })

  test('创建课程 - hoursPerClass=1.5', async () => {
    const res = await api.post('/courses', {
      name: '小数课时课程_1.5_' + Date.now(),
      teacherId,
      weekday: 2,
      startTime: '14:00',
      endTime: '15:30',
      hoursPerClass: 1.5,
      studentIds,
    })
    expect(res.ok).toBeTruthy()
    const course = await res.json()
    expect(course.hoursPerClass).toBe(1.5)
    expect(course.isTest).toBe(true)
    courseIds.push(course.id)
  })

  test('创建课程 - hoursPerClass=2（整数）', async () => {
    const res = await api.post('/courses', {
      name: '小数课时课程_2_' + Date.now(),
      teacherId,
      weekday: 3,
      startTime: '09:00',
      endTime: '11:00',
      hoursPerClass: 2,
      studentIds,
    })
    expect(res.ok).toBeTruthy()
    const course = await res.json()
    expect(course.hoursPerClass).toBe(2)
    expect(course.isTest).toBe(true)
    courseIds.push(course.id)
  })

  test('更新课程 - 修改课时为0.5', async () => {
    const cRes = await api.post('/courses', {
      name: '待更新课时课程_' + Date.now(),
      teacherId,
      weekday: 4,
      startTime: '11:00',
      endTime: '12:00',
      hoursPerClass: 1,
      studentIds,
    })
    const c = await cRes.json()
    courseIds.push(c.id)

    const updateRes = await api.put(`/courses/${c.id}`, {
      ...c,
      hoursPerClass: 0.5,
    })
    expect(updateRes.ok).toBeTruthy()
    const updated = await updateRes.json()
    expect(updated.hoursPerClass).toBe(0.5)
  })

  test('点名 - hoursDeducted=0.5 扣课时正确', async () => {
    const cRes = await api.post('/courses', {
      name: '点名扣课时课程_0.5_' + Date.now(),
      teacherId,
      weekday: 5,
      startTime: '15:00',
      endTime: '15:30',
      hoursPerClass: 0.5,
      studentIds,
    })
    const c = await cRes.json()
    courseIds.push(c.id)

    const sBefore = await getStudent(api, studentIds[0])
    const usedBefore = sBefore.usedHours

    const aRes = await api.post('/attendance', {
      courseId: c.id,
      date: '2026-04-29',
      studentIds: [studentIds[0]],
      hoursDeducted: 0.5,
    })
    expect(aRes.ok).toBeTruthy()
    const attendance = await aRes.json()
    expect(attendance.hoursDeducted).toBe(0.5)

    const sAfter = await getStudent(api, studentIds[0])
    expect(sAfter.usedHours).toBeCloseTo(usedBefore + 0.5, 1)

    // 删除点名还原课时
    await api.del(`/attendance/${attendance.id}`)
    const sRestored = await getStudent(api, studentIds[0])
    expect(sRestored.usedHours).toBeCloseTo(usedBefore, 1)
  })

  test('点名 - hoursDeducted=1.5 扣课时正确', async () => {
    const cRes = await api.post('/courses', {
      name: '点名扣课时课程_1.5_' + Date.now(),
      teacherId,
      weekday: 6,
      startTime: '16:00',
      endTime: '17:30',
      hoursPerClass: 1.5,
      studentIds,
    })
    const c = await cRes.json()
    courseIds.push(c.id)

    const sBefore = await getStudent(api, studentIds[1])
    const usedBefore = sBefore.usedHours

    const aRes = await api.post('/attendance', {
      courseId: c.id,
      date: '2026-04-29',
      studentIds: [studentIds[1]],
      hoursDeducted: 1.5,
    })
    expect(aRes.ok).toBeTruthy()
    const attendance = await aRes.json()
    expect(attendance.hoursDeducted).toBe(1.5)

    const sAfter = await getStudent(api, studentIds[1])
    expect(sAfter.usedHours).toBeCloseTo(usedBefore + 1.5, 1)

    await api.del(`/attendance/${attendance.id}`)
    const sRestored = await getStudent(api, studentIds[1])
    expect(sRestored.usedHours).toBeCloseTo(usedBefore, 1)
  })

  test('加减课时 - 增加0.5课时', async () => {
    const sBefore = await getStudent(api, studentIds[0])
    const totalBefore = sBefore.totalHours

    const addRes = await api.post(`/students/${studentIds[0]}/add-hours`, { hours: 0.5, remark: '测试加0.5课时' })
    expect(addRes.ok).toBeTruthy()

    const sAfter = await getStudent(api, studentIds[0])
    expect(sAfter.totalHours).toBeCloseTo(totalBefore + 0.5, 1)
  })

  test('加减课时 - 减少1.5课时', async () => {
    const sBefore = await getStudent(api, studentIds[1])
    const totalBefore = sBefore.totalHours
    const remaining = totalBefore - sBefore.usedHours

    if (remaining >= 1.5) {
      const subRes = await api.post(`/students/${studentIds[1]}/subtract-hours`, { hours: 1.5, remark: '测试减1.5课时' })
      expect(subRes.ok).toBeTruthy()

      const sAfter = await getStudent(api, studentIds[1])
      expect(sAfter.totalHours).toBeCloseTo(totalBefore - 1.5, 1)
    }
  })

  test('前端课程编辑弹窗 - step=0.5 min=0.5', async ({ adminPage }) => {
    await adminPage.goto('/courses')
    await adminPage.waitForLoadState('networkidle')

    await adminPage.click('button:has-text("创建课程")')
    await adminPage.waitForTimeout(800)

    const modal = adminPage.locator('.modal')
    const allAttrs = await modal.locator('input[type="number"]').evaluateAll(els =>
      Array.from(els).map(el => ({
        label: el.closest('.form-group')?.querySelector('label')?.textContent?.trim(),
        step: el.getAttribute('step'),
        min: el.getAttribute('min'),
        val: el.value
      }))
    )
    const found = allAttrs.find(a => a.label?.includes('每次课时'))
    expect(found).toBeDefined()
    expect(found.step).toBe('0.5')
    expect(found.min).toBe('0.5')
  })

  test('前端学生加减课时弹窗 - step=0.5 min=0.5', async ({ adminPage }) => {
    await adminPage.goto('/students')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.waitForTimeout(1500)

    const addHoursBtn = adminPage.locator('button:has-text("加减课")').first()
    await addHoursBtn.waitFor({ state: 'visible', timeout: 10000 })
    await addHoursBtn.click()
    await adminPage.waitForTimeout(800)

    const modal = adminPage.locator('.modal')
    const allAttrs = await modal.locator('input[type="number"]').evaluateAll(els =>
      Array.from(els).map(el => ({
        label: el.closest('.form-group')?.querySelector('label')?.textContent?.trim(),
        step: el.getAttribute('step'),
        min: el.getAttribute('min'),
        val: el.value
      }))
    )
    const found = allAttrs.find(a => a.label?.includes('课时数'))
    expect(found).toBeDefined()
    expect(found.step).toBe('0.5')
    expect(found.min).toBe('0.5')
  })
})
