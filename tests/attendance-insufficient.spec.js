import { test, expect, ApiClient } from './fixtures.js'

test.describe('课时不足警告但允许点名', () => {
  let api, teacherId, studentIds = [], courseId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')

    const tRes = await api.post('/teachers', { name: '不足教师_' + Date.now(), phone: '13770' + Date.now().toString().slice(-6) })
    teacherId = (await tRes.json()).id

    // 创建两个学生：一个够课时，一个不够
    const s1Res = await api.post('/students', { name: '充足学生_' + Date.now(), totalHours: 20 })
    studentIds.push((await s1Res.json()).id)
    const s2Res = await api.post('/students', { name: '不足学生_' + Date.now(), totalHours: 1 })
    studentIds.push((await s2Res.json()).id)

    const cRes = await api.post('/courses', {
      name: '不足课程_' + Date.now(),
      teacherId,
      weekday: new Date().getDay() || 7,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 2,
      studentIds,
    })
    courseId = (await cRes.json()).id
  })

  test.afterAll(async () => {
    if (courseId) { try { await api.del(`/courses/${courseId}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('学生课时不足时 UI 弹窗警告但允许继续点名', async ({ adminPage }) => {
    await adminPage.goto('/attendance')
    await adminPage.waitForLoadState('networkidle')

    // 选择今日 weekday
    const weekday = new Date().getDay() || 7
    const weekdayLabels = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }
    const weekdayLabel = weekdayLabels[weekday]

    // 点击 weekday selector
    const weekdaySelect = adminPage.locator('.select-course .search-select').first()
    await weekdaySelect.locator('.ss-input').click()
    await adminPage.waitForTimeout(300)
    await adminPage.locator(`.ss-option:has-text("${weekdayLabel}")`).click()
    await adminPage.waitForTimeout(500)

    // 选择课程
    const courseSelect = adminPage.locator('.select-course .search-select').last()
    await courseSelect.locator('.ss-input').click()
    await adminPage.waitForTimeout(300)
    await adminPage.locator('.ss-option').first().click()
    await adminPage.waitForTimeout(1000)

    // 确保两个学生都被勾选
    const checkboxes = adminPage.locator('.student-item input[type="checkbox"]')
    const count = await checkboxes.count()
    for (let i = 0; i < count; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check()
      }
    }

    // 点击确认点名
    await adminPage.click('button:has-text("确认点名")')
    await adminPage.waitForTimeout(1000)

    // 应该出现弹窗，且包含"课时不足"警告
    const modal = adminPage.locator('.modal.modal-sm')
    await expect(modal).toBeVisible()

    // 验证警告存在
    await expect(modal.locator('text=课时不足')).toBeVisible()
    await expect(modal.locator('text=不足学生')).toBeVisible()

    // 验证"确认点名"按钮存在（警告但不阻断）
    await expect(modal.locator('button:has-text("确认点名")')).toBeVisible()

    // 关闭弹窗
    await modal.locator('button:has-text("取消")').click()
    await adminPage.waitForTimeout(500)
    await expect(modal).not.toBeVisible()
  })

  test('课时充足时正常点名', async () => {
    // 只传充足学生，应该成功
    const res = await api.post('/attendance', {
      courseId,
      date: new Date().toISOString().slice(0, 10),
      studentIds: [studentIds[0]],
      hoursDeducted: 2,
    })
    expect(res.status).toBe(201)

    // 清理
    const data = await res.json()
    await api.del(`/attendance/${data.id}`)
  })
})
