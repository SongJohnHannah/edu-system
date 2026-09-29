import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const bookings = ['t1', 't2'].map((teacherId, index) => ({
  id: `booking-${index}`, teacherId, teacherName: index ? '陈老师' : '林老师',
  studentId: `s${index + 1}`, studentName: index ? '试听学生乙' : '试听学生甲',
  date: '2099-01-05', startTime: index ? '11:00' : '09:00',
  endTime: index ? '12:00' : '10:00', status: 'active', courseId: null
}))

try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-scope-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
    })
    const queries = []
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      let result = []
      if (request.method() !== 'GET') writes.push(`${request.method()} ${url.pathname}`)
      if (url.pathname.endsWith('/teachers')) result = [
        { id: 't1', name: '林老师', status: 'active' },
        { id: 't2', name: '陈老师', status: 'active' }
      ]
      else if (url.pathname.endsWith('/students')) result = bookings.map(item => ({
        id: item.studentId, name: item.studentName, status: 'active', enrollmentStage: 'pending'
      }))
      else if (url.pathname.endsWith('/trial-bookings')) {
        queries.push(url.searchParams)
        result = bookings.filter(item => !url.searchParams.get('teacherId') || item.teacherId === url.searchParams.get('teacherId'))
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/trial-bookings')
      await page.waitForFunction(() => document.querySelectorAll('.booking-card').length === 2)
      const dateInput = page.locator('.filters .office-date-picker input')
      await dateInput.fill('2099-01-05')
      await dateInput.press('Enter')
      await dateInput.dispatchEvent('change')
      await page.getByRole('button', { name: '我的预约' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.booking-card').length === 1)
      assert.match(await page.locator('.booking-card').textContent(), /试听学生甲/, `${width}px 我的预约归属`)
      assert.equal(queries.at(-1).get('teacherId'), 't1', `${width}px 我的预约服务端筛选`)
      assert.equal(queries.at(-1).get('start'), '2099-01-05', `${width}px 我的预约丢失日期筛选`)
      await page.getByRole('button', { name: '全部预约' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.booking-card').length === 2)
      assert.equal(queries.at(-1).get('teacherId'), null, `${width}px 全部预约仍限定教师`)
      assert.equal(queries.at(-1).get('start'), '2099-01-05', `${width}px 全部预约丢失日期筛选`)
      assert.equal(await dateInput.inputValue(), '2099-01-05', `${width}px 日期输入被重置`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${width}px 页面横向溢出`)
      assert.deepEqual(writes, [], `${width}px 切换筛选产生写请求`)
      assert.deepEqual(errors, [], `${width}px 页面脚本错误`)
    } finally {
      await context.close()
    }
  }
  console.log('试听预约全部／我的筛选在 PC、iPad、手机保留日期条件、正确查询且无写入')
} finally {
  await browser.close()
}
