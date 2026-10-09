import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const [device, viewport] of [
    ['PC', { width: 1440, height: 900 }],
    ['iPad', { width: 1024, height: 768 }],
    ['phone', { width: 390, height: 844 }]
  ]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-time-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    await context.route('**/edusystem/api/**', route => {
      const path = new URL(route.request().url()).pathname
      let data = []
      if (path.endsWith('/teachers')) data = [{ id: 't1', name: '林老师', status: 'active' }]
      if (path.endsWith('/students')) data = [{ id: 's1', name: '甲同学', status: 'active', enrollmentStage: 'pending' }]
      if (path.endsWith('/trial-bookings')) data = [
        { id: 'past', studentId: 's1', studentName: '上午试听', teacherId: 't1', teacherName: '林老师', date: '2030-09-28', startTime: '09:00', endTime: '10:00', status: 'active' },
        { id: 'future', studentId: 's1', studentName: '下午试听', teacherId: 't1', teacherName: '林老师', date: '2030-09-28', startTime: '16:00', endTime: '17:00', status: 'active' }
      ]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2030-09-28T15:00:00+08:00') })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    const past = page.locator('.booking-card').filter({ hasText: '上午试听' })
    const future = page.locator('.booking-card').filter({ hasText: '下午试听' })
    await past.waitFor({ state: 'visible', timeout: 15000 })
    await future.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await past.locator('.booking-actions').count(), 0, `${device}: already-started booking remains editable`)
    assert.equal(await future.locator('.booking-actions').count(), 1, `${device}: later booking cannot be edited`)
    await future.getByRole('button', { name: '编辑' }).evaluate(button => button.click())
    await page.locator('.editor-modal').waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${device}: horizontal overflow`)
    assert.deepEqual(errors, [], `${device}: page errors`)
    await context.close()
    console.log(`${device}: same-day trial actions passed`)
  }
} finally {
  await browser.close()
}
