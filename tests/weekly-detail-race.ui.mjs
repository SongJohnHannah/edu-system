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
    let dateA = ''
    let dateB = ''
    let releaseA
    const holdA = new Promise(resolve => { releaseA = resolve })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-detail-race-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
      if (url.pathname.endsWith('/courses/occurrences')) {
        const start = url.searchParams.get('start')
        dateA = plusDays(start, 9)
        dateB = plusDays(start, 10)
        payload = [['A', dateA], ['B', dateB]].map(([id, date]) => ({
          id: `c${id}:${date}`, courseId: `c${id}`, originalDate: date, date, name: `阅读 ${id}`,
          teacherId: 't1', teacherName: '林老师', startTime: '10:00', endTime: '11:00',
          studentIds: ['s1'], trialCount: 0, hoursPerClass: 1
        }))
      }
      if (url.pathname.endsWith('/courses/cA/adjustments')) {
        await holdA
        payload = { once: [{ id: 'change-A', original_date: dateA, target_date: plusDays(dateA, 1), start_time: '09:00' }], future: [] }
      }
      if (url.pathname.endsWith('/courses/cB/adjustments')) {
        payload = { once: [{ id: 'change-B', original_date: dateB, target_date: plusDays(dateB, 1), start_time: '15:00' }], future: [] }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-29T08:00:00+08:00') })
    await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    const cards = page.locator(size.name === '手机' ? '.mobile-two-weeks .agenda-card' : '.combined-board .course-bar')
    const oldRequest = page.waitForRequest(request => request.url().endsWith('/courses/cA/adjustments'))
    await cards.filter({ hasText: '阅读 A' }).click()
    await oldRequest
    await page.locator('.detail-modal h2').getByText('阅读 A').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.locator('.detail-modal').waitFor({ state: 'hidden' })
    await cards.filter({ hasText: '阅读 B' }).click()
    await page.locator('.detail-modal h2').getByText('阅读 B').waitFor({ state: 'visible' })
    await page.locator('.detail-modal .adjustment-row').getByText('15:00').waitFor({ state: 'visible' })
    const oldResponse = page.waitForResponse(response => response.url().endsWith('/courses/cA/adjustments'))
    releaseA()
    await oldResponse
    await page.waitForTimeout(50)
    const modal = page.locator('.detail-modal')
    const adjustment = await modal.locator('.adjustment-row').textContent()
    if (!(await modal.locator('h2').textContent()).includes('阅读 B') || !adjustment.includes('15:00') || adjustment.includes('09:00')) throw new Error(`${size.name} 课程 A 的慢返回覆盖了课程 B 的调课记录`)
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    await context.close()
  }
  console.log('周排课 PC、iPad、手机快速切换课程详情时调课记录始终属于当前课程')
} finally {
  await browser.close()
}
