import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 768, height: 1024, hasTouch: true },
  { name: '手机', width: 390, height: 844, hasTouch: true }
]

function plusDays(date, count) {
  const day = new Date(`${date}T12:00:00`)
  day.setDate(day.getDate() + count)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.hasTouch, timezoneId: 'Asia/Shanghai' })
    let courseNameA = '阅读 A'
    let releaseSave
    const heldSave = new Promise(resolve => { releaseSave = resolve })
    let releaseMove
    const heldMove = new Promise(resolve => { releaseMove = resolve })
    let releaseDayMove
    const heldDayMove = new Promise(resolve => { releaseDayMove = resolve })
    let releaseCreate
    const heldCreate = new Promise(resolve => { releaseCreate = resolve })
    let releaseRemoval
    const heldRemoval = new Promise(resolve => { releaseRemoval = resolve })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-save-race-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      let status = 200
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
      if (url.pathname.endsWith('/courses/occurrences')) {
        const start = url.searchParams.get('start')
        payload = [['A', plusDays(start, 9)], ['B', plusDays(start, 10)]].map(([id, date]) => ({
          id: `c${id}:${date}`, courseId: `c${id}`, originalDate: date, date,
          name: id === 'A' ? courseNameA : '阅读 B', teacherId: 't1', teacherName: '林老师',
          startTime: '10:00', endTime: '11:00', studentIds: ['s1'], trialCount: 0, hoursPerClass: 1
        }))
      }
      if (url.pathname.endsWith('/courses/cA/adjustments')) payload = {
        once: [{ id: 'change-A', original_date: '2026-10-06', target_date: '2026-10-07', start_time: '10:00' }], future: []
      }
      if (url.pathname.endsWith('/courses/cB/adjustments')) payload = {
        once: [{ id: 'change-B', original_date: '2026-10-07', target_date: '2026-10-08', start_time: '10:00' }], future: []
      }
      if (url.pathname.endsWith('/courses/cA/adjustments/once/change-A') && route.request().method() === 'DELETE') {
        await heldRemoval
        payload = { ok: true }
      }
      if (url.pathname.endsWith('/courses/cA') && route.request().method() === 'PUT') {
        await heldSave
        courseNameA = route.request().postDataJSON().name
        payload = { id: 'cA', name: courseNameA }
      }
      if (url.pathname.endsWith('/courses/cB') && route.request().method() === 'PUT') {
        status = 409
        payload = { error: '课程资料冲突，请重试' }
      }
      if (url.pathname.endsWith('/courses/cA/reschedule') && route.request().method() === 'POST') {
        await heldMove
        payload = { ok: true }
      }
      if (url.pathname.endsWith('/courses/reschedule-day') && route.request().method() === 'POST') {
        await heldDayMove
        payload = { count: 1 }
      }
      if (url.pathname.endsWith('/courses') && route.request().method() === 'POST') {
        await heldCreate
        payload = { id: 'new-course' }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-29T08:00:00+08:00') })
    await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    const cards = page.locator(size.name === '手机' ? '.mobile-two-weeks .agenda-card' : '.combined-board .course-bar')
    await cards.filter({ hasText: '阅读 A' }).click()
    const modal = page.locator('.detail-modal')
    await modal.locator('h2').getByText('阅读 A').waitFor({ state: 'visible' })
    await modal.locator('.detail-input input').first().fill('阅读 A 新版')
    const saveRequest = page.waitForRequest(request => request.url().endsWith('/courses/cA') && request.method() === 'PUT')
    await modal.getByRole('button', { name: '保存课程资料与名单' }).click()
    await saveRequest
    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 B' }).click()
    await modal.locator('h2').getByText('阅读 B').waitFor({ state: 'visible' })
    const saveResponse = page.waitForResponse(response => response.url().endsWith('/courses/cA') && response.request().method() === 'PUT')
    releaseSave()
    await saveResponse
    await cards.filter({ hasText: '阅读 A 新版' }).waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    if (!(await modal.isVisible()) || !(await modal.locator('h2').textContent()).includes('阅读 B')) throw new Error(`${size.name} A 保存完成关闭了后来打开的 B 详情`)
    await modal.locator('.detail-input input').first().fill('阅读 B 待重试')
    const rejectedSave = page.waitForResponse(response => response.url().endsWith('/courses/cB') && response.request().method() === 'PUT')
    await modal.getByRole('button', { name: '保存课程资料与名单' }).click()
    await rejectedSave
    if (!(await modal.isVisible()) || await modal.locator('.detail-input input').first().inputValue() !== '阅读 B 待重试') throw new Error(`${size.name} 保存失败没有保留 B 的编辑内容`)
    if (await cards.filter({ hasText: '阅读 B 待重试' }).count()) throw new Error(`${size.name} 保存失败却更新了课表`)

    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 A 新版' }).click()
    await modal.getByRole('button', { name: '修改日期与时间' }).click()
    const moveModal = page.locator('.move-modal').filter({ hasText: '确认调课' })
    await moveModal.waitFor({ state: 'visible' })
    const sourceDate = await moveModal.locator('.office-date-picker input').inputValue()
    await moveModal.locator('.office-date-picker input').fill(plusDays(sourceDate, 1))
    await moveModal.locator('.office-date-picker input').press('Enter')
    await moveModal.getByText('仅这一次，之后仍按原星期上课').click()
    const moveRequest = page.waitForRequest(request => request.url().endsWith('/courses/cA/reschedule') && request.method() === 'POST')
    await moveModal.getByRole('button', { name: '确认调课' }).click()
    await moveRequest
    await page.keyboard.press('Escape')
    await moveModal.waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 B' }).click()
    await modal.getByRole('button', { name: '修改日期与时间' }).click()
    await moveModal.waitFor({ state: 'visible' })
    const moveResponse = page.waitForResponse(response => response.url().endsWith('/courses/cA/reschedule'))
    releaseMove()
    await moveResponse
    await page.waitForTimeout(500)
    if (!(await moveModal.isVisible()) || !(await moveModal.textContent()).includes('阅读 B')) throw new Error(`${size.name} A 调课完成关闭了后来打开的 B 确认框`)

    await page.keyboard.press('Escape')
    await moveModal.waitFor({ state: 'hidden' })
    const dayAction = date => page.getByRole('button', { name: `${size.name === '手机' ? '' : '拖动或点击'}整体调整 ${date} 的课程` })
    await dayAction(sourceDate).click()
    const dayModal = page.locator('.move-modal').filter({ hasText: '整天调课确认' })
    await dayModal.waitFor({ state: 'visible' })
    await dayModal.locator('.office-date-picker input').fill(plusDays(sourceDate, 1))
    await dayModal.locator('.office-date-picker input').press('Enter')
    await dayModal.getByText('仅这一次，后续仍按原星期上课').click()
    const dayRequest = page.waitForRequest(request => request.url().endsWith('/courses/reschedule-day') && request.method() === 'POST')
    await dayModal.getByRole('button', { name: '确认整体调课' }).click()
    await dayRequest
    await page.keyboard.press('Escape')
    await dayModal.waitFor({ state: 'hidden' })
    const nextDate = plusDays(sourceDate, 1)
    await dayAction(nextDate).click()
    await dayModal.waitFor({ state: 'visible' })
    const dayResponse = page.waitForResponse(response => response.url().endsWith('/courses/reschedule-day'))
    releaseDayMove()
    await dayResponse
    await page.waitForTimeout(500)
    if (!(await dayModal.isVisible()) || !(await dayModal.textContent()).includes(nextDate)) throw new Error(`${size.name} A 整天调课完成关闭了后来打开的 B 确认框`)

    await page.keyboard.press('Escape')
    await dayModal.waitFor({ state: 'hidden' })
    await page.locator('.head-actions').getByRole('button', { name: '创建课程' }).click()
    const createModal = page.locator('.detail-modal').filter({ hasText: '开始排课' })
    await createModal.waitFor({ state: 'visible' })
    await createModal.locator('.create-form input[type="text"]').first().fill('临时新课 A')
    await createModal.locator('.create-form .n-select').last().click()
    await page.locator('.n-base-select-option').filter({ hasText: '安安' }).click()
    const createRequest = page.waitForRequest(request => request.url().endsWith('/courses') && request.method() === 'POST')
    await createModal.getByRole('button', { name: '创建课程' }).click()
    await createRequest
    await page.keyboard.press('Escape')
    await createModal.waitFor({ state: 'hidden' })
    await page.locator('.head-actions').getByRole('button', { name: '创建课程' }).click()
    await createModal.waitFor({ state: 'visible' })
    await createModal.locator('.create-form input[type="text"]').first().fill('临时新课 B')
    const createResponse = page.waitForResponse(response => response.url().endsWith('/courses') && response.request().method() === 'POST')
    releaseCreate()
    await createResponse
    await page.waitForTimeout(500)
    if (!(await createModal.isVisible()) || await createModal.locator('.create-form input[type="text"]').first().inputValue() !== '临时新课 B') throw new Error(`${size.name} A 创建成功关闭了后来打开的 B 表单`)

    await page.keyboard.press('Escape')
    await createModal.waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 A 新版' }).click()
    await modal.locator('.adjustment-row').getByRole('button', { name: '移除' }).click()
    const removalDialog = page.locator('.n-dialog').filter({ hasText: '移除未发生的调课' })
    await removalDialog.waitFor({ state: 'visible' })
    const removalRequest = page.waitForRequest(request => request.url().endsWith('/courses/cA/adjustments/once/change-A') && request.method() === 'DELETE')
    await removalDialog.getByRole('button', { name: '确认移除' }).click()
    await removalRequest
    await removalDialog.getByRole('button', { name: '返回' }).click()
    await removalDialog.waitFor({ state: 'hidden' })
    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 B' }).click()
    await modal.locator('.adjustment-row').getByRole('button', { name: '移除' }).click()
    await removalDialog.waitFor({ state: 'visible' })
    const removalResponse = page.waitForResponse(response => response.url().endsWith('/courses/cA/adjustments/once/change-A'))
    releaseRemoval()
    await removalResponse
    await page.waitForTimeout(500)
    if (!(await removalDialog.isVisible()) || !(await modal.isVisible()) || !(await modal.locator('h2').textContent()).includes('阅读 B')) throw new Error(`${size.name} A 移除完成关闭了 B 的确认框或详情`)
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    await context.close()
  }
  console.log('周排课 PC、iPad、手机：资料保存、单节／整天调课、建课及移除的旧响应不影响新弹窗；保存失败保留编辑内容')
} finally {
  await browser.close()
}
