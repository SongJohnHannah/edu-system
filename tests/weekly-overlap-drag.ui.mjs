import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })
try {
  for (const size of [{ width: 1440, height: 1000 }, { width: 1024, height: 900, hasTouch: true }, { width: 768, height: 1024, hasTouch: true }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.hasTouch, timezoneId: 'Asia/Shanghai' })
    try {
      const courses = [
        { courseId: 'a', name: '阅读表达进阶课程', teacherId: 't1', startTime: '09:00', endTime: '10:00', trialCount: 1 },
        { courseId: 'b', name: '半小时口语', teacherId: 't2', startTime: '09:00', endTime: '09:30', trialCount: 1 },
        { courseId: 'past', name: '已结束课程', teacherId: 't1', startTime: '07:30', endTime: '08:00' }
      ].map(course => ({ ...course, id: `${course.courseId}:2026-09-28`, date: '2026-09-28', originalDate: '2026-09-28',
        teacherName: course.teacherId === 't1' ? '林老师' : '陈老师', studentIds: ['s1'], hoursPerClass: course.courseId === 'a' ? 1 : 0.5 }))
      const trials = [
        { id: 'independent', teacherId: 't1', teacherName: '林老师', studentId: 's2', studentName: '试听学生',
          date: '2026-09-28', startTime: '09:00', endTime: '10:30', status: 'active', note: '保留预约备注' },
        { id: 'attached', teacherId: 't1', studentName: '预约学生', courseId: 'a', occurrenceDate: '2026-09-28', status: 'active' },
        { id: 'half-booking', teacherId: 't2', studentName: '半小时预约', courseId: 'b', occurrenceDate: '2026-09-28', status: 'active' }
      ]
      const writes = []
      const attempts = new Map()
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'overlap-drag-ui')
        localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'admin', displayName: '测试管理员' }))
      })
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let payload = []
        if (path.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }, { id: 't2', name: '陈老师', status: 'active' }]
        if (path.endsWith('/students')) payload = [{ id: 's1', name: '正式学生', status: 'active', enrollmentStage: 'enrolled' }, { id: 's2', name: '试听学生', status: 'active', enrollmentStage: 'pending' }]
        if (path.endsWith('/courses/occurrences')) payload = courses
        if (path.endsWith('/trial-bookings')) payload = trials
        if (path.endsWith('/adjustments')) payload = { once: [], future: [] }
        if (request.method() !== 'GET') {
          const body = request.postDataJSON()
          writes.push({ path, method: request.method(), body })
          const attempt = (attempts.get(path) || 0) + 1
          attempts.set(path, attempt)
          if (attempt === 1) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '目标时段有冲突，请重新选择' }) })
          if (path.endsWith('/courses/a/reschedule')) {
            Object.assign(courses[0], { date: body.targetDate, startTime: body.startTime, endTime: body.endTime })
          } else if (path.endsWith('/trial-bookings/independent')) Object.assign(trials[0], body)
          else throw new Error(`unexpected write: ${path}`)
          payload = { ok: true }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-28T08:30:00+08:00') })
      await page.goto(`${base}/weekly-schedule`)
      await page.addStyleTag({ content: '*,*::before,*::after { animation: none !important; transition: none !important; }' })
      const cards = page.locator('.schedule-item')
      await expect(cards).toHaveCount(4)
      await expect(cards.locator('.drag-handle')).toHaveCount(3)
      await expect(cards.filter({ hasText: '已结束课程' }).locator('.drag-handle')).toHaveCount(0)
      const half = cards.filter({ hasText: '半小时口语' })
      const halfContent = await half.evaluate(card => {
        const bottom = card.getBoundingClientRect().bottom
        return ['.bar-name', '.bar-meta', '.bar-bottom', '.bar-booking'].every(selector => card.querySelector(selector).getBoundingClientRect().bottom <= bottom)
      })
      assert.ok(halfContent, '30-minute course name/time/teacher/booking all fit')
      await expect(half.locator('.bar-booking')).toHaveText('试听预约 1 人')
      const scroll = page.locator('.board-scroll')
      async function dragCard(name, targetDate) {
        await expect(page.locator('.n-modal-mask')).toHaveCount(0)
        const card = cards.filter({ hasText: name })
        await scroll.evaluate(element => { element.scrollLeft = 0 })
        await card.scrollIntoViewIfNeeded()
        const originalSize = await card.evaluate(element => {
          const style = getComputedStyle(element)
          return { width: parseFloat(style.width), height: parseFloat(style.height) }
        })
        const originalTeacher = await card.locator('.bar-teacher').textContent()
        async function checkPreviewSize() {
          for (const selector of ['.drag-ghost', '.drop-preview']) {
            const preview = page.locator(selector)
            await expect(preview).toBeVisible()
            const box = await preview.boundingBox()
            assert.ok(Math.abs(box.width - originalSize.width) < 1, `${selector} must retain original card width`)
            assert.ok(Math.abs(box.height - originalSize.height) < 1, `${selector} must retain original card height`)
            await expect(preview.locator('.bar-teacher')).toHaveText(originalTeacher)
            await expect(preview.locator('.bar-booking')).toBeVisible()
            const contentFits = await preview.evaluate(element => {
              const bottom = element.getBoundingClientRect().bottom
              return ['.bar-name', '.bar-meta', '.bar-bottom', '.bar-booking'].every(selector =>
                element.querySelector(selector).getBoundingClientRect().bottom <= bottom)
            })
            assert.ok(contentFits, `${selector} must keep name, time, teacher and booking readable`)
          }
        }
        const origin = await (size.hasTouch ? card : card.locator('.drag-handle')).boundingBox()
        const lane = await page.locator(`.day-lane[data-date="${targetDate}"]`).boundingBox()
        const x = origin.x + origin.width / 2
        const y = origin.y + origin.height / 2
        const timeOffset = await page.locator('.time-cell').nth(6).evaluate(element => parseFloat(element.style.top))
        const target = { x: lane.x + lane.width / 2, y: lane.y + timeOffset + 8 }
        if (size.hasTouch) {
          const cdp = await context.newCDPSession(page)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
          await page.waitForTimeout(350)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...target, id: 1 }] })
          await expect(page.locator('.drop-preview')).toBeVisible()
          await checkPreviewSize()
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        } else {
          await page.mouse.move(x, y)
          await page.mouse.down()
          await page.mouse.move(target.x, target.y, { steps: 5 })
          await expect(page.locator('.drop-preview')).toBeVisible()
          await checkPreviewSize()
          await page.mouse.up()
        }
        await expect(page.locator('.move-modal')).toBeVisible()
        await expect(page.locator('.detail-modal')).toHaveCount(0)
      }
      await dragCard('阅读表达进阶课程', '2026-09-29')
      const modal = page.locator('.move-modal')
      await expect(modal.locator('.end-time-preview')).toHaveText('11:30')
      assert.equal(writes.length, 0, 'dragging only opens confirmation')
      await expect(modal.getByRole('button', { name: '确认调课', exact: true })).toBeDisabled()
      await modal.getByText('仅这一次，之后仍按原星期上课').click()
      await modal.getByRole('button', { name: '确认调课', exact: true }).click()
      await expect(page.getByText('目标时段有冲突，请重新选择', { exact: true })).toBeVisible()
      await expect(modal).toBeVisible()
      assert.equal(courses[0].date, '2026-09-28', 'conflict must leave the course unchanged')
      await modal.getByRole('button', { name: '确认调课', exact: true }).click()
      await expect(modal).toHaveCount(0)
      assert.deepEqual(writes[1].body, { originalDate: '2026-09-28', targetDate: '2026-09-29', startTime: '10:30', endTime: '11:30', scope: 'once' })
      await expect(page.locator('.day-lane[data-date="2026-09-29"]')).toContainText('阅读表达进阶课程')

      await dragCard('独立试听', '2026-09-29')
      await expect(modal.getByRole('heading', { name: '调整试听预约', exact: true })).toBeVisible()
      await expect(modal.locator('.end-time-preview')).toHaveText('12:00')
      assert.equal(await modal.locator('.n-radio').count(), 0, 'independent trials do not need course recurrence scope')
      assert.equal(writes.length, 2, 'trial drag is not saved before confirmation')
      await modal.getByRole('button', { name: '保存预约时间' }).click()
      await expect(modal).toBeVisible()
      assert.equal(trials[0].date, '2026-09-28')
      await modal.getByRole('button', { name: '保存预约时间' }).click()
      await expect(modal).toHaveCount(0)
      assert.equal(writes[3].path, '/edusystem/api/trial-bookings/independent')
      assert.equal(writes[3].method, 'PUT')
      assert.deepEqual(writes[3].body, { studentId: 's2', teacherId: 't1', date: '2026-09-29', startTime: '10:30', endTime: '12:00', note: '保留预约备注', courseId: null, occurrenceDate: null })
      await expect(page.locator('.day-lane[data-date="2026-09-29"]')).toContainText('预约 · 试听学生')
      await dragCard('半小时口语', '2026-09-29')
      await modal.getByRole('button', { name: '返回', exact: true }).click()
      assert.equal(writes.length, 4, 'cancelling the half-hour drag must not save changes')
      assert.deepEqual(errors, [])
      console.log(`PASS ${size.width}px: course/trial/half-hour ghost and placeholder retain size and content; confirmation, cancellation and conflict retry`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
