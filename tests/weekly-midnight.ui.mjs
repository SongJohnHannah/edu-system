import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 768, height: 1024, hasTouch: true },
  { name: '手机', width: 390, height: 844, hasTouch: true }
]

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.hasTouch, timezoneId: 'Asia/Shanghai' })
    const reads = []
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-midnight-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
      if (url.pathname.endsWith('/courses/occurrences')) {
        reads.push(url.searchParams.get('start'))
        payload = ['2026-10-03', '2026-10-04', '2026-10-06'].map(date => ({
          id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: `阅读课 ${date}`,
          teacherId: 't1', teacherName: '林老师', startTime: '09:00', endTime: '10:00',
          studentIds: ['s1'], trialCount: 0, hoursPerClass: 1
        }))
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-10-03T23:59:50+08:00') })
    await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    const mobile = size.name === '手机'
    const board = page.locator(mobile ? '.mobile-two-weeks' : '.combined-board')
    await board.getByText('阅读课 2026-10-03').waitFor({ state: 'visible' })
    if (!reads.includes('2026-09-27')) throw new Error(`${size.name} 初始周起点不正确：${reads}`)
    if (!(await page.locator('.weekly-head p').textContent()).includes('2026-09-27 — 2026-10-10')) throw new Error(`${size.name} 初始两周范围不正确`)

    const nextRead = page.waitForRequest(request => request.url().includes('/courses/occurrences?') && request.url().includes('start=2026-10-04'), { timeout: 3000 })
    await page.clock.fastForward(11_000)
    await nextRead
    await page.waitForFunction(() => document.querySelector('.weekly-head p')?.textContent?.includes('2026-10-04 — 2026-10-17'))
    await board.getByText('阅读课 2026-10-04').waitFor({ state: 'visible' })
    if (await board.getByText('阅读课 2026-10-03').count()) throw new Error(`${size.name} 跨周午夜仍显示昨天课程`)
    if (mobile) {
      if (await page.locator('.mobile-day.today').count() !== 1 || !(await page.locator('.mobile-day.today').textContent()).includes('10 月 4 日')) throw new Error('手机今天标记未更新')
    } else if (await page.locator('.combined-grid .day-head.active').getAttribute('data-date') !== '2026-10-04') throw new Error(`${size.name} 今天高亮未更新`)
    await page.getByRole('button', { name: '上两周' }).click()
    await page.getByRole('button', { name: '本周', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.weekly-head p')?.textContent?.includes('2026-10-04 — 2026-10-17'))

    const sameWeekPage = await context.newPage()
    sameWeekPage.on('pageerror', error => errors.push(error.message))
    await sameWeekPage.clock.install({ time: new Date('2026-10-06T23:59:50+08:00') })
    await sameWeekPage.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    const oldDayMarker = mobile
      ? sameWeekPage.getByRole('button', { name: '在 2026-10-06 创建课程' })
      : sameWeekPage.locator('.combined-grid .day-head.active[data-date="2026-10-06"]')
    await oldDayMarker.waitFor({ state: 'visible' })
    await sameWeekPage.clock.fastForward(11_000)
    await oldDayMarker.waitFor({ state: 'detached' })
    if (mobile) {
      if (!(await sameWeekPage.locator('.mobile-day.today').textContent()).includes('10 月 7 日')) throw new Error('手机同周跨天今天标记未更新')
    } else if (await sameWeekPage.locator('.combined-grid .day-head.active').getAttribute('data-date') !== '2026-10-07') throw new Error(`${size.name} 同周跨天高亮未更新`)
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    await context.close()
  }
  console.log('周排课 PC、iPad、手机持续可见跨周／同周午夜刷新及本周定位通过')
} finally {
  await browser.close()
}
