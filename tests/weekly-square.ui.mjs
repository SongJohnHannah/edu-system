import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const teachers = [
  { id: 't1', name: '欧阳老师（阅读表达与英语口语专任教师）', status: 'active' },
  { id: 't2', name: '林老师', status: 'active' }
]
const rows = [
  ['short', '书法', 't2', '09:00', '09:15', 0],
  ['long', '阅读写作进阶与EnglishReadingAndSpeaking专项训练课程', 't1', '09:15', '09:30', 12345],
  ['ordinary', '数学思维', 't2', '13:00', '14:00', 1]
].map(([courseId, name, teacherId, startTime, endTime, trialCount]) => ({
  id: `${courseId}:2026-09-28`, courseId, name, teacherId,
  teacherName: teachers.find(teacher => teacher.id === teacherId).name,
  date: '2026-09-28', originalDate: '2026-09-28', studentIds: ['s1'], startTime, endTime, trialCount,
  hoursPerClass: courseId === 'ordinary' ? 1 : 0.25
}))
const studentName = '欧阳同学（ReadingAndSpeaking阅读表达专项试听预约）'
const fields = '.bar-name, .bar-meta, .bar-teacher, .bar-students, .bar-booking'
const browser = await chromium.launch({ headless: true })

async function assertReadable(cards) {
  const results = await cards.evaluateAll((elements, selector) => elements.map(card => {
    const box = card.getBoundingClientRect()
    const parts = [...card.querySelectorAll(selector)].map(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = [...range.getClientRects()]
      return {
        text: element.textContent,
        weight: getComputedStyle(element).fontWeight,
        fits: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 &&
          lines.every(line => line.left >= box.left - 1 && line.right <= box.right + 1 && line.bottom <= box.bottom + 1)
      }
    })
    return { name: card.querySelector('.bar-name').textContent, width: box.width, height: box.height, parts }
  }), fields)
  for (const result of results) {
    assert.ok(result.parts.every(part => part.fits && part.weight === '400'), `full regular-weight text must fit: ${JSON.stringify(result)}`)
    assert.ok(Math.abs(result.width - 70) < 1 && result.height >= 70, 'cards keep the fixed 70-pixel width and grow for complete text')
  }
  return results
}

try {
  for (const size of [
    { name: 'PC', width: 1440, height: 1000 },
    { name: 'iPad', width: 1024, height: 900, hasTouch: true },
    { name: 'iPad portrait', width: 768, height: 1024, hasTouch: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.hasTouch, timezoneId: 'Asia/Shanghai' })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'weekly-square-test-only')
        localStorage.setItem('user', JSON.stringify({ id: 'test-admin', role: 'admin', displayName: '测试管理员' }))
      })
      const writes = []
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() !== 'GET') writes.push(path)
        let payload = []
        if (path.endsWith('/teachers')) payload = teachers
        if (path.endsWith('/students')) payload = [{ id: 's1', name: '正式学生', status: 'active', enrollmentStage: 'enrolled' }]
        if (path.endsWith('/courses/occurrences')) payload = rows
        if (path.endsWith('/trial-bookings')) payload = [{
          id: 'independent', date: '2026-09-28', startTime: '09:00', endTime: '09:30',
          teacherId: 't1', teacherName: teachers[0].name, studentName, status: 'active'
        }]
        if (path.endsWith('/adjustments')) payload = { once: [], future: [] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-28T08:00:00+08:00') })
      await page.goto(`${base}/weekly-schedule`)
      await page.addStyleTag({ content: '*,*::before,*::after { animation: none !important; transition: none !important; } .course-bar { transform: none !important; }' })
      const cards = page.locator('.schedule-item')
      await expect(cards).toHaveCount(4)
      const ordinary = cards.filter({ hasText: '数学思维' })
      await expect(ordinary.locator('.bar-booking')).toHaveText('试听预约 1 人')
      await expect(cards.filter({ hasText: '独立试听' }).locator('.bar-booking')).toHaveText(`预约 · ${studentName}`)
      await expect.poll(async () => {
        const before = await cards.filter({ hasText: '书法' }).boundingBox()
        const after = await cards.filter({ hasText: '专项训练课程' }).boundingBox()
        return after.y - before.y - before.height
      }).toBeGreaterThanOrEqual(3)
      await expect.poll(async () => (await cards.filter({ hasText: '专项训练课程' }).evaluate(card => {
        const box = card.getBoundingClientRect()
        return [...card.querySelectorAll('.bar-name, .bar-meta, .bar-bottom, .bar-booking')].every(child => child.getBoundingClientRect().bottom < box.bottom - 10)
      }))).toBe(true)
      const results = await assertReadable(cards)
      const square = results.find(result => result.name === '数学思维')
      assert.ok(square.height <= square.width * 1.5, 'ordinary booked cards stay close to square')
      assert.ok(results.every(result => Math.abs(result.width - square.width) < 1), 'long labels keep the same fixed width as every other card')
      assert.ok(results.find(result => result.name.includes('专项训练课程')).height > square.height, 'long labels grow vertically without widening every card')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'the page must not overflow horizontally')

      if (size.name === 'PC') {
        await page.setViewportSize({ width: 3200, height: 1200 })
        await expect.poll(async () => {
          const box = await ordinary.boundingBox()
          return Math.abs(box.height - square.height)
        }).toBeLessThan(3)
        await assertReadable(cards)
        await page.setViewportSize({ width: size.width, height: size.height })
        await expect.poll(async () => Math.abs((await ordinary.boundingBox()).width - square.width)).toBeLessThan(1)
        await expect.poll(async () => Math.abs((await ordinary.boundingBox()).height - square.height)).toBeLessThan(1)
      }

      const trial = cards.filter({ hasText: '独立试听' })
      await trial.scrollIntoViewIfNeeded()
      const original = await trial.boundingBox()
      const source = await trial.locator('.drag-handle').boundingBox()
      const lane = await page.locator('.day-lane[data-date="2026-09-29"]').boundingBox()
      const offset = await page.locator('.time-cell').nth(3).evaluate(element => parseFloat(element.style.top))
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
      await page.mouse.down()
      await page.mouse.move(lane.x + lane.width / 2, lane.y + offset + 5, { steps: 5 })
      for (const selector of ['.drag-ghost', '.drop-preview']) {
        const preview = page.locator(selector)
        await expect(preview).toBeVisible()
        await assertReadable(preview)
        const box = await preview.boundingBox()
        assert.ok(Math.abs(box.width - original.width) < 1 && Math.abs(box.height - original.height) < 1, 'full-content drag previews retain the card size')
      }
      await page.mouse.up()
      await expect(page.locator('.move-modal')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.move-modal, .n-modal-mask')).toHaveCount(0)
      assert.deepEqual(writes, [], 'sizing and cancelled dragging must not write business data')
      assert.deepEqual(errors, [])
      if (process.env.WEEKLY_SQUARE_SCREENSHOTS === '1') await page.screenshot({ path: `.qa/weekly-square-${size.name.replaceAll(' ', '-')}.png` })
      console.log(`PASS ${size.name}: fixed 70-pixel cards, complete long labels, adjacent short courses, regular weight and full-size drag previews`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
