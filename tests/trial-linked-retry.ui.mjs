import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const date = '2099-01-10'
const originalDate = '2099-01-03'
try {
  for (const [device, viewport] of [
    ['PC', { width: 1440, height: 900 }],
    ['iPad', { width: 1024, height: 768 }],
    ['手机', { width: 390, height: 844 }]
  ]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-linked-retry-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const booking = { id: 'b1', studentId: 's1', studentName: '试听生', teacherId: 't1', teacherName: '林老师',
      courseId: 'c1', occurrenceDate: originalDate, courseName: '阅读课', date,
      startTime: '09:00', endTime: '10:00', note: '初始', status: 'active' }
    const occurrence = { id: `c1:${originalDate}`, courseId: 'c1', originalDate, date, name: '阅读课',
      teacherId: 't1', startTime: '09:00', endTime: '10:00', studentIds: [] }
    let occurrenceMode = 'fail-once'
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let payload = []
      let status = 200
      if (path.endsWith('/students')) payload = [{ id: 's1', name: '试听生', status: 'active', enrollmentStage: 'pending' }]
      else if (path.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      else if (path.endsWith('/trial-bookings') && request.method() === 'GET') payload = [booking]
      else if (path.endsWith('/courses/occurrences')) {
        if (occurrenceMode === 'fail-once') {
          occurrenceMode = 'ready'
          status = 503
          payload = { error: '课程暂不可用' }
        } else payload = occurrenceMode === 'missing' ? [] : [occurrence]
      } else if (path.endsWith('/trial-bookings/b1') && request.method() === 'PUT') {
        const body = request.postDataJSON()
        writes.push(body)
        booking.note = body.note
        payload = booking
      } else throw new Error(`Unexpected ${request.method()} ${path}`)
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded' })
      const card = page.locator('.booking-card').filter({ hasText: '试听生' })
      await card.getByRole('button', { name: '编辑' }).click()
      const editor = page.locator('.editor-modal')
      await editor.getByText('当日课程加载失败').waitFor({ state: 'visible' })
      assert.equal(await editor.getByRole('button', { name: '保存预约' }).isDisabled(), true)
      await editor.getByRole('button', { name: '重试' }).click()
      await editor.getByText('当日课程加载失败').waitFor({ state: 'hidden' })
      await editor.locator('textarea').fill('保留课程关联')
      await editor.getByRole('button', { name: '保存预约' }).click()
      await card.getByText('备注：保留课程关联').waitFor({ state: 'visible' })
      assert.equal(writes.length, 1, `${device} retry write count`)
      assert.equal(writes[0].courseId, 'c1', `${device} linked course lost on retry`)
      assert.equal(writes[0].occurrenceDate, originalDate, `${device} occurrence identity lost on retry`)

      occurrenceMode = 'missing'
      await card.getByRole('button', { name: '编辑' }).click()
      await editor.locator('textarea').fill('课次已失效')
      await editor.getByRole('button', { name: '保存预约' }).click()
      await page.getByText('原预约关联的课次已变化').first().waitFor({ state: 'visible' })
      assert.equal(writes.length, 1, `${device} missing occurrence was silently made independent`)
      assert.deepEqual(errors, [], `${device} page errors`)
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、手机：正式课试听加载重试保留课次，课次消失时拒绝静默转为独立试听')
} finally {
  await browser.close()
}
