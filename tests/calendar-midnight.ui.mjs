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
      localStorage.setItem('access_token', 'calendar-midnight-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const reads = []
    let raceRefresh = false
    let delayAttendance = false
    let releaseAttendance
    const heldAttendance = new Promise(resolve => { releaseAttendance = resolve })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/courses/occurrences')) reads.push(url.searchParams.get('start'))
      let payload = url.pathname.endsWith('/attendance') ? { data: [], hasMore: false } : []
      if (url.pathname.endsWith('/attendance') && raceRefresh) {
        if (delayAttendance) {
          delayAttendance = false
          await heldAttendance
        } else payload = { data: [{
          id: 'latest-attendance', date: '2026-10-06', courseId: 'c1', recordedBy: 't1',
          courseName: '阅读课', studentIds: ['s1'], studentNamesSnapshot: { s1: '最新点名' }, hoursDeducted: 1
        }], hasMore: false }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await page.goto('http://127.0.0.1:4174/calendar', { waitUntil: 'domcontentloaded' })
    await page.locator('.attendance-detail .detail-title').getByText('2026-09-30').waitFor({ state: 'visible' })
    if (!(await page.locator('.current-month').textContent()).includes('2026年9月')) throw new Error(`${size.name} 初始月份不正确`)
    const nextMonthRequest = page.waitForRequest(request => request.url().includes('/courses/occurrences?') && request.url().includes('start=2026-09-27'), { timeout: 3000 })
    await page.clock.fastForward(11_000)
    await nextMonthRequest
    await page.locator('.attendance-detail .detail-title').getByText('2026-10-01').waitFor({ state: 'visible' })
    if (!(await page.locator('.current-month').textContent()).includes('2026年10月')) throw new Error(`${size.name} 跨月后仍显示九月`)
    const today = page.locator('.calendar-day.today')
    if (await today.count() !== 1 || (await today.textContent()).trim() !== '1') throw new Error(`${size.name} 跨午夜的今天标记未移到十月一日`)
    if (!reads.includes('2026-09-27') || errors.length) throw new Error(`${size.name} 新月份未加载或页面脚本错误：${errors}`)

    const browsingPage = await context.newPage()
    browsingPage.on('pageerror', error => errors.push(error.message))
    await browsingPage.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await browsingPage.goto('http://127.0.0.1:4174/calendar', { waitUntil: 'domcontentloaded' })
    await browsingPage.locator('.attendance-detail .detail-title').getByText('2026-09-30').waitFor({ state: 'visible' })
    await browsingPage.getByRole('button', { name: '上月' }).click()
    await browsingPage.locator('.attendance-detail .detail-title').getByText('2026-08-01').waitFor({ state: 'visible' })
    await browsingPage.clock.fastForward(11_000)
    if (!(await browsingPage.locator('.current-month').textContent()).includes('2026年8月') || !(await browsingPage.locator('.attendance-detail .detail-title').textContent()).includes('2026-08-01')) throw new Error(`${size.name} 跨午夜覆盖了主动浏览的月份`)

    const sameMonthPage = await context.newPage()
    sameMonthPage.on('pageerror', error => errors.push(error.message))
    await sameMonthPage.clock.install({ time: new Date('2026-10-06T23:59:50+08:00') })
    await sameMonthPage.goto('http://127.0.0.1:4174/calendar', { waitUntil: 'domcontentloaded' })
    await sameMonthPage.locator('.attendance-detail .detail-title').getByText('2026-10-06').waitFor({ state: 'visible' })
    await sameMonthPage.clock.fastForward(11_000)
    await sameMonthPage.locator('.attendance-detail .detail-title').getByText('2026-10-07').waitFor({ state: 'visible' })
    if ((await sameMonthPage.locator('.calendar-day.today').textContent()).trim() !== '7') throw new Error(`${size.name} 同月跨天今天标记未更新`)

    const refreshPage = await context.newPage()
    refreshPage.on('pageerror', error => errors.push(error.message))
    await refreshPage.clock.install({ time: new Date('2026-10-06T08:00:00+08:00') })
    await refreshPage.goto('http://127.0.0.1:4174/calendar', { waitUntil: 'domcontentloaded' })
    await refreshPage.locator('.attendance-detail .detail-title').getByText('2026-10-06').waitFor({ state: 'visible' })
    raceRefresh = true
    delayAttendance = true
    const slowRefresh = refreshPage.waitForRequest(request => request.url().includes('/attendance?'))
    await refreshPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await slowRefresh
    await refreshPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await refreshPage.locator('.attendance-detail').getByText('最新点名').waitFor({ state: 'visible' })
    releaseAttendance()
    await refreshPage.waitForTimeout(100)
    if (!(await refreshPage.locator('.attendance-detail').textContent()).includes('最新点名')) throw new Error(`${size.name} 旧可见状态请求覆盖了新点名`)
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors}`)
    await context.close()
  }
  console.log('日历 PC、iPad、手机跨月／同月午夜跟随今天，历史浏览保留位置，旧可见刷新不覆盖新数据')
} finally {
  await browser.close()
}
