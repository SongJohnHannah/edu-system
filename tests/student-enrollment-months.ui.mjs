import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true,
  ...(process.env.UI_BROWSER_CHANNEL ? { channel: process.env.UI_BROWSER_CHANNEL } : {}) })
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Asia/Shanghai' })
    const students = [
      { id: 'past', name: '月底入学', enrollmentDate: '2026-09-30' },
      { id: 'same', name: '当月入学', enrollmentDate: '2026-10-15' },
      { id: 'unset', name: '未填日期', enrollmentDate: null },
      { id: 'future', name: '未来入学', enrollmentDate: '2026-12-01' },
      { id: 'leap', name: '闰年入学', enrollmentDate: '2024-02-29' }
    ].map(student => ({ status: 'active', createdBy: 'admin', enrollmentStage: 'enrolled', totalHours: 10, usedHours: 0, ...student }))
    let reads = 0
    const writes = []
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'student-enrollment-months-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'admin', displayName: '测试管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let result = []
      if (path.endsWith('/students') && request.method() === 'GET') { reads++; result = students }
      if (path.endsWith('/students/check-name')) result = { exists: false }
      if (request.method() === 'PUT') {
        const body = request.postDataJSON()
        writes.push(body)
        const student = students.find(item => path.endsWith(`/students/${item.id}`))
        Object.assign(student, body, { enrollmentDate: body.enrollmentDate || null })
        result = student
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-31T23:59:00+08:00') })
      await page.goto(`${base}/students`)
      const row = name => page.locator(width > 768 ? '.desktop-only tbody tr' : '.mobile-card').filter({ hasText: name })
      const months = name => row(name).locator('.enrollment-months')
      const expectMonths = async (name, value) => expect(months(name)).toHaveText(width > 768 ? value : `已入学月数：${value}`)
      for (const [name, value] of [['月底入学', '1 个月'], ['当月入学', '0 个月'], ['未填日期', '未填写'], ['未来入学', '0 个月'], ['闰年入学', '32 个月']]) {
        await expectMonths(name, value)
      }
      assert.equal(reads, 1)
      await page.clock.fastForward(60_100)
      await expectMonths('月底入学', '2 个月')
      await expectMonths('当月入学', '1 个月')
      await expectMonths('闰年入学', '33 个月')
      assert.equal(reads, 1, 'month rollover updates the computed values without API writes or reloads')

      const editDate = async value => {
        await row('月底入学').getByRole('button', { name: '编辑', exact: true }).click()
        const modal = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑学生' }) })
        const input = modal.getByPlaceholder('请选择入学日期')
        await input.fill(value)
        await input.press('Enter')
        await modal.getByRole('heading').click()
        await modal.getByRole('button', { name: '保存', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
      }
      await editDate('2026-08-31')
      await expectMonths('月底入学', '3 个月')
      assert.equal(writes[0].enrollmentDate, '2026-08-31')
      assert.equal(Object.hasOwn(writes[0], 'enrollmentMonths'), false, 'derived months must never be saved to the API')
      await editDate('')
      await expectMonths('月底入学', '未填写')
      assert.equal(writes[1].enrollmentDate, '')

      await page.clock.setSystemTime(new Date('2026-12-01T10:00:00+08:00'))
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await expectMonths('当月入学', '2 个月')
      await expectMonths('未来入学', '0 个月')
      assert.equal(writes.length, 2)
      assert.deepEqual(errors, [])
      if (process.env.STUDENT_ENROLLMENT_SCREENSHOTS === '1') {
        await page.screenshot({ path: `.qa/student-enrollment-months-${width}.png`, fullPage: true })
      }
      console.log(`${width}px: calendar-month duration, midnight rollover, editing, clearing and visible-page refresh passed`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
