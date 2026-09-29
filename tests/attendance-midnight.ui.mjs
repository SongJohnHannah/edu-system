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
      localStorage.setItem('access_token', 'attendance-midnight-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const reads = []
    let holdPost = false
    let releasePost
    const heldPost = new Promise(resolve => { releasePost = resolve })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/courses')) payload = [{ id: 'c1', name: '阅读课', teacherId: 't1', studentIds: ['s1'], hoursPerClass: 1 }]
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', totalHours: 10, usedHours: 0 }]
      if (url.pathname.endsWith('/attendance')) {
        if (route.request().method() === 'POST') {
          if (holdPost) await heldPost
          payload = { id: 'new-attendance' }
        } else payload = { data: [], hasMore: false }
      }
      if (url.pathname.endsWith('/courses/occurrences')) {
        const date = url.searchParams.get('start')
        reads.push(date)
        payload = [{ id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读课', teacherId: 't1', studentIds: ['s1'], startTime: '10:00', endTime: '11:00', hoursPerClass: 1 }]
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
    const picker = page.locator('input[aria-label="点名日期"]')
    await picker.waitFor({ state: 'visible' })
    if (await picker.inputValue() !== '2026-09-30') throw new Error(`${size.name} 初始点名日期不正确`)
    const nextRead = page.waitForRequest(request => request.url().includes('/courses/occurrences?start=2026-10-01'), { timeout: 3000 })
    await page.clock.fastForward(11_000)
    await nextRead
    await page.waitForFunction(() => document.querySelector('input[aria-label="点名日期"]')?.value === '2026-10-01')
    if (!reads.includes('2026-10-01')) throw new Error(`${size.name} 新日期课程未读取`)
    if (!(await page.locator('.month-label').textContent()).includes('2026年10月')) throw new Error(`${size.name} 点名历史仍停在旧月份`)

    const browsingPage = await context.newPage()
    browsingPage.on('pageerror', error => errors.push(error.message))
    await browsingPage.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await browsingPage.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
    const browsingPicker = browsingPage.locator('input[aria-label="点名日期"]')
    await browsingPicker.waitFor({ state: 'visible' })
    await browsingPicker.fill('2026-09-28')
    await browsingPage.clock.fastForward(11_000)
    if (await browsingPicker.inputValue() !== '2026-09-28') throw new Error(`${size.name} 午夜覆盖了主动选择的点名日期`)

    const submittingPage = await context.newPage()
    submittingPage.on('pageerror', error => errors.push(error.message))
    await submittingPage.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await submittingPage.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
    const submittingPicker = submittingPage.locator('input[aria-label="点名日期"]')
    await submittingPicker.waitFor({ state: 'visible' })
    await submittingPage.locator('.select-course .search-select').click()
    await submittingPage.locator('.n-base-select-option').filter({ hasText: '阅读课' }).click()
    await submittingPage.locator('.attendance-form').getByRole('button', { name: /确认点名/ }).click()
    await submittingPage.locator('.modal').getByRole('button', { name: '确认点名', exact: true }).waitFor({ state: 'visible' })
    holdPost = true
    const pendingPost = submittingPage.waitForRequest(request => request.url().endsWith('/attendance') && request.method() === 'POST')
    await submittingPage.locator('.modal').getByRole('button', { name: '确认点名', exact: true }).click()
    await pendingPost
    await submittingPage.clock.fastForward(11_000)
    if (await submittingPicker.inputValue() !== '2026-09-30') throw new Error(`${size.name} 点名提交途中切换了日期`)
    const postResponse = submittingPage.waitForResponse(response => response.url().endsWith('/attendance') && response.request().method() === 'POST')
    releasePost()
    await postResponse
    await submittingPage.waitForFunction(() => document.querySelector('input[aria-label="点名日期"]')?.value === '2026-10-01')
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    await context.close()
  }
  console.log('点名 PC、iPad、手机：午夜跟随默认今天、保留手动日期，提交中的课次待完成后再切换')
} finally {
  await browser.close()
}
