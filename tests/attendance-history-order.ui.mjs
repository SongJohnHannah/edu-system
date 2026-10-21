import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
// Submission order intentionally differs from the dates of the attended classes.
const records = Array.from({ length: 57 }, (_, index) => ({
  id: `attendance-${57 - index}`, courseId: 'c1', courseName: `点名记录 ${index + 1}`,
  date: index % 2 ? '2026-10-20' : '2026-10-07', studentIds: ['s1'], originalStudentIds: ['s1'],
  studentNamesSnapshot: { s1: '学生甲' }, hoursDeducted: 1, recordedBy: null,
  createdAt: new Date(Date.UTC(2026, 9, 21, 12) - index * 1000).toISOString().slice(0, 19).replace('T', ' ')
}))
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'attendance-history-order-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const offsets = []
    await context.route('**/edusystem/api/**', async route => {
      assert.equal(route.request().method(), 'GET')
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/attendance')) {
        const offset = Number(url.searchParams.get('offset') || 0)
        const limit = Number(url.searchParams.get('limit') || 50)
        offsets.push(offset)
        payload = { data: records.slice(offset, offset + limit), hasMore: offset + limit < records.length }
      }
      await route.fulfill({ status: 200, json: payload })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-21T21:00:00+08:00') })
      await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
      const items = page.locator('.history-item .history-course')
      await items.first().waitFor()
      assert.deepEqual(await items.allTextContents(), records.slice(0, 50).map(record => record.courseName))
      await page.getByRole('button', { name: '加载更多记录', exact: true }).click()
      await items.filter({ hasText: '点名记录 57' }).waitFor()
      assert.deepEqual(await items.allTextContents(), records.map(record => record.courseName))
      assert.deepEqual(offsets, [0, 50])
      assert.equal(await page.getByRole('button', { name: '加载更多记录', exact: true }).count(), 0)
      await page.getByRole('button', { name: '查看已撤销', exact: true }).click()
      await page.getByRole('button', { name: '加载更多记录', exact: true }).waitFor()
      assert.deepEqual(await items.allTextContents(), records.slice(0, 50).map(record => record.courseName))
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  }
  console.log('点名历史 PC、iPad、手机：按提交点名时间倒序，加载下一页及切换筛选保持顺序')
} finally {
  await browser.close()
}
