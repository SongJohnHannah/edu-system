import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 1024, height: 768, hasTouch: true },
  { name: '手机', width: 390, height: 844, hasTouch: true }
]

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.hasTouch, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-clock-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '待报名学生', status: 'active', enrollmentStage: 'pending' }]
      if (url.pathname.endsWith('/trial-bookings')) payload = [{
        id: 'b1', studentId: 's1', studentName: '待报名学生', teacherId: 't1', teacherName: '林老师',
        date: '2026-10-01', startTime: '16:00', endTime: '17:00', status: 'active', courseId: null
      }]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded' })
    const createButton = page.getByRole('button', { name: '新增预约' })
    await createButton.click()
    const editor = page.locator('.editor-modal')
    await editor.waitFor({ state: 'visible' })
    const dateInput = editor.locator('.office-date-picker input')
    if (await dateInput.inputValue() !== '2026-09-30') throw new Error(`${size.name} 初始新预约日期不正确`)
    await page.keyboard.press('Escape')
    await editor.waitFor({ state: 'hidden' })
    await page.clock.fastForward(11_000)
    await createButton.click()
    await editor.waitFor({ state: 'visible' })
    if (await dateInput.inputValue() !== '2026-10-01') throw new Error(`${size.name} 跨午夜后仍使用昨天作为预约默认日期`)
    await dateInput.click()
    const yesterday = page.locator('.n-date-panel-date--excluded').filter({ hasText: /^30$/ }).first()
    if (!await yesterday.evaluate(element => element.classList.contains('n-date-panel-date--disabled'))) throw new Error(`${size.name} 跨午夜后仍允许选择昨天`)
    await editor.locator('.n-card-header').click()

    const laterPage = await context.newPage()
    laterPage.on('pageerror', error => errors.push(error.message))
    await laterPage.clock.install({ time: new Date('2026-10-01T15:59:50+08:00') })
    await laterPage.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded' })
    const card = laterPage.locator('.booking-card').filter({ hasText: '待报名学生' })
    await card.waitFor({ state: 'visible' })
    if (await card.locator('.booking-actions').count() !== 1) throw new Error(`${size.name} 未开始的预约缺少操作入口`)
    await laterPage.clock.fastForward(11_000)
    await card.locator('.booking-actions').waitFor({ state: 'detached' })
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    await context.close()
  }
  console.log('试听预约 PC、iPad、手机：午夜更新新预约日期，时段开始后自动收起编辑和取消入口')
} finally {
  await browser.close()
}
