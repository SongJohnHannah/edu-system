import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const [device, viewport] of [['PC', { width: 1440, height: 900 }], ['iPad', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'history-race-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '测试管理员' }))
    })
    let releaseHandover, releaseHours
    const handoverHeld = new Promise(resolve => { releaseHandover = resolve })
    const hoursHeld = new Promise(resolve => { releaseHours = resolve })
    let handoverStarted, hoursStarted
    const handoverStart = new Promise(resolve => { handoverStarted = resolve })
    const hoursStart = new Promise(resolve => { hoursStarted = resolve })
    await context.route('**/edusystem/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/handovers')) {
        handoverStarted()
        await handoverHeld
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '过期的交接请求' }) })
      }
      if (path.endsWith('/hour-records')) {
        hoursStarted()
        await hoursHeld
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '过期的课时请求' }) })
      }
      const data = path.endsWith('/students') ? [{ id: 's1', name: '安安', totalHours: 10, usedHours: 0, status: 'active' }] : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/handovers', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await handoverStart
    const staleHandover = page.waitForResponse(response => response.url().includes('/handovers') && response.status() === 503)
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/students'))
    await page.waitForURL('**/students')
    releaseHandover()
    await staleHandover
    await page.waitForTimeout(100)
    assert.equal(await page.getByText('过期的交接请求').count(), 0, `${device}: old handover failure leaked into student page`)

    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/hours-history?studentId=s1'))
    await hoursStart
    const staleHours = page.waitForResponse(response => response.url().includes('/hour-records') && response.status() === 503)
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/students'))
    await page.waitForURL('**/students')
    releaseHours()
    await staleHours
    await page.waitForTimeout(100)
    assert.equal(await page.getByText('过期的课时请求').count(), 0, `${device}: old hour-record failure leaked into student page`)
    assert.deepEqual(errors, [], `${device}: page errors`)
    await context.close()
    console.log(`${device}: obsolete history requests stay silent after navigation`)
  }
} finally {
  await browser.close()
}
