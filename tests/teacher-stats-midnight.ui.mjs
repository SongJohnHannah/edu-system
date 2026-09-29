import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const [device, viewport] of [['PC', { width: 1440, height: 900 }], ['iPad', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'stats-midnight-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '测试管理员' }))
    })
    const requests = []
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      if (!url.pathname.includes('/stats/')) throw new Error(`unexpected API: ${url.pathname}`)
      requests.push({ start: url.searchParams.get('start'), end: url.searchParams.get('end') })
      const endpoint = url.pathname.split('/').at(-1)
      const data = endpoint === 'overall'
        ? { activeTeachers: 0, totalTeachers: 0, totalAttendance: 0, totalConsumedHours: 0 }
        : endpoint === 'weekday-distribution' ? [0, 0, 0, 0, 0, 0, 0] : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-30T23:59:50+08:00') })
    await page.goto('http://127.0.0.1:4174/teacher-stats', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.getByText('2026-09-01 至 2026-09-30').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '今日' }).click()
    await page.getByText('2026-09-30 至 2026-09-30').waitFor({ state: 'visible' })
    await page.clock.fastForward(11_000)
    await page.getByText('2026-10-01 至 2026-10-01').waitFor({ state: 'visible' })
    assert(requests.slice(-3).every(request => request.start === '2026-10-01' && request.end === '2026-10-01'), `${device}: today APIs kept yesterday`)

    await page.getByRole('button', { name: '自定义' }).click()
    const dates = page.locator('.custom-range input[type="date"]')
    await dates.nth(0).fill('2026-09-01')
    await dates.nth(1).fill('2026-09-03')
    await page.getByRole('button', { name: '应用' }).click()
    await page.getByText('2026-09-01 至 2026-09-03').waitFor({ state: 'visible' })
    const beforeMidnight = requests.length
    await page.clock.fastForward(86_400_000)
    assert.equal(await page.locator('.current-range').textContent().then(text => text.trim()), '2026-09-01 至 2026-09-03', `${device}: custom range changed overnight`)
    assert.equal(requests.length, beforeMidnight, `${device}: custom range reloaded overnight`)
    const visibleReload = page.waitForResponse(response => response.url().includes('/stats/overall?'))
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await visibleReload
    assert(requests.length >= beforeMidnight + 3, `${device}: visible page did not reload custom statistics`)
    assert(requests.slice(-3).every(request => request.start === '2026-09-01' && request.end === '2026-09-03'), `${device}: visible page lost custom range`)
    assert.deepEqual(errors, [], `${device}: page errors`)
    await context.close()
    console.log(`${device}: rolling preset follows midnight and custom range stays fixed`)
  }
} finally {
  await browser.close()
}
