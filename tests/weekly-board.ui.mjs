import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const teachers = ['林老师', '陈老师', '周老师'].map((name, index) => ({ id: `t${index + 1}`, name, status: 'active' }))
const students = teachers.map((teacher, index) => ({ id: `s${index + 1}`, name: `学生${index + 1}`, status: 'active', enrollmentStage: 'enrolled' }))
const rows = [
  ['long', '阅读与表达', 't1', '09:00', '12:00'],
  ['early', '数学思维', 't2', '09:00', '10:00'],
  ['middle', '英语口语', 't3', '09:30', '10:30'],
  ['reuse', '科学探索', 't2', '10:00', '11:00'],
  ['single', '书法', 't1', '13:00', '14:00']
].map(([courseId, name, teacherId, startTime, endTime]) => ({
  id: `${courseId}:2026-09-28`, courseId, name, teacherId,
  teacherName: teachers.find(teacher => teacher.id === teacherId).name,
  studentIds: [`s${teacherId.slice(1)}`], date: '2026-09-28', originalDate: '2026-09-28',
  startTime, endTime, hoursPerClass: (Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3)) - Number(startTime.slice(0, 2)) * 60 - Number(startTime.slice(3))) / 60,
  trialCount: courseId === 'early' ? 1 : 0
}))
const browser = await chromium.launch({ headless: true })
try {
  for (const size of [
    { name: 'PC', width: 1440, height: 1000 },
    { name: 'iPad', width: 1024, height: 900, hasTouch: true },
    { name: 'iPad portrait', width: 768, height: 1024, hasTouch: true },
    { name: 'phone', width: 390, height: 844, hasTouch: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.hasTouch, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-board-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'test-admin', role: 'admin', teacherId: 't1', displayName: '测试管理员' }))
    })
    let scheduleReads = 0
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (request.method() !== 'GET') writes.push(path)
      let payload = []
      if (path.endsWith('/teachers')) payload = teachers
      if (path.endsWith('/students')) payload = students
      if (path.endsWith('/courses/occurrences')) { scheduleReads++; payload = rows }
      if (path.endsWith('/trial-bookings')) payload = [{
        id: 'independent', date: '2026-09-28', startTime: '09:00', endTime: '10:00',
        teacherId: 't3', teacherName: '周老师', studentName: '试听学生', status: 'active'
      }, {
        id: 'attached', courseId: 'early', occurrenceDate: '2026-09-28', date: '2026-09-28',
        startTime: '09:00', endTime: '10:00', teacherId: 't2', teacherName: '陈老师', studentName: '预约学生', status: 'active'
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
    await page.addStyleTag({ content: '*,*::before,*::after { animation: none !important; transition: none !important; }' })
    const cards = page.locator(size.name === 'phone' ? '.agenda-card' : '.schedule-item')
    await cards.first().waitFor({ state: 'visible' })
    await expect(cards).toHaveCount(6)
    if (size.name === 'phone') {
      assert.ok(await page.locator('.mobile-two-weeks').isVisible())
      const legend = page.locator('.teacher-legend')
      await expect(legend.getByRole('button')).toHaveCount(3)
      await legend.getByRole('button', { name: '林老师', exact: true }).tap()
      await expect(cards).toHaveCount(2)
      await expect(legend.getByRole('button', { name: '林老师' })).toHaveAttribute('aria-pressed', 'true')
      assert.ok((await cards.allTextContents()).every(text => text.includes('林老师')))
      await legend.getByRole('button', { name: '周老师', exact: true }).tap()
      await expect(cards).toHaveCount(4)
      await expect(cards.filter({ hasText: '独立试听' })).toHaveCount(1)
      await legend.getByRole('button', { name: '林老师', exact: true }).tap()
      await expect(cards).toHaveCount(2)
      assert.ok((await cards.allTextContents()).every(text => text.includes('周老师')))
      await legend.getByRole('button', { name: '周老师', exact: true }).tap()
      await expect(cards).toHaveCount(6)
      await page.getByRole('button', { name: '我的课程', exact: true }).tap()
      await expect(cards).toHaveCount(2)
      await legend.getByRole('button', { name: '陈老师', exact: true }).tap()
      await expect(cards).toHaveCount(2)
      assert.ok((await cards.allTextContents()).every(text => text.includes('陈老师')))
      await page.getByRole('button', { name: '全部教师', exact: true }).tap()
      await expect(cards).toHaveCount(6)
      assert.equal(scheduleReads, 1, 'mobile teacher filters must use the loaded schedule')
      assert.deepEqual(writes, [], 'filtering must never write schedule data')
      await cards.filter({ hasText: '数学思维' }).click()
      assert.ok(await page.locator('.overlap-modal').isVisible())
      await context.close()
      console.log('PASS phone: teacher single/multi filtering, all/my reset, trials and overlap chooser')
      continue
    }

    const boxes = await cards.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect()
      return { name: element.querySelector('strong').textContent, start: element.querySelector('.bar-meta').textContent,
        x: box.x, y: box.y, width: box.width, height: box.height, outline: getComputedStyle(element).outlineStyle }
    }))
    assert.ok(boxes.every(box => Math.abs(box.width - boxes[0].width) < 1), 'all course columns must have equal widths')
    assert.ok(boxes.every(box => Math.abs(box.width - 70) < 1), 'all cards keep the requested fixed 70-pixel width')
    assert.ok(boxes.every(box => box.outline !== 'dashed'), 'overlap outline is temporarily disabled')
    const byName = Object.fromEntries(boxes.map(box => [box.name, box]))
    assert.ok(byName['数学思维'].x >= byName['阅读与表达'].x + byName['阅读与表达'].width)
    assert.ok(byName['英语口语'].y > byName['数学思维'].y, 'partial overlaps preserve their start times')
    assert.equal(byName['科学探索'].x, byName['数学思维'].x, 'an ended course frees its column')
    assert.ok(boxes.every(box => box.height >= box.width - 1 && box.height <= box.width * 1.75), 'ordinary course cards stay compact with full text')
    assert.ok(await page.locator('.day-lane').first().evaluate(element => element.clientHeight < 1200), 'time intervals are compressed')
    const early = cards.filter({ hasText: '数学思维' })
    await expect(early.locator('.bar-booking')).toHaveText('试听预约 1 人')
    assert.equal(await early.locator('.bar-booking').getAttribute('title'), '预约学生')
    await expect(cards.filter({ hasText: '独立试听' }).locator('.bar-booking')).toHaveText('预约 · 试听学生')
    assert.equal(await cards.locator('.drag-handle').count(), 6, 'all editable future course and independent trial cards have handles')
    const content = await early.evaluate(element => ['.bar-name', '.bar-meta', '.bar-bottom', '.bar-booking'].map(selector => {
      const child = element.querySelector(selector)
      const box = child.getBoundingClientRect()
      const card = element.getBoundingClientRect()
      return { fontSize: parseFloat(getComputedStyle(child).fontSize), fits: box.right <= card.right && box.bottom <= card.bottom }
    }))
    assert.ok(content.every(part => part.fits), 'course, time, teacher and booking must fit inside the card')
    assert.ok(content[0].fontSize >= 14 && content[1].fontSize >= 9 && content[2].fontSize >= 11, 'course, time and teacher text fit the compact columns')
    assert.ok(await cards.locator('.bar-meta').evaluateAll(elements => elements.every(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      const card = element.closest('.course-bar').getBoundingClientRect()
      return element.scrollWidth <= element.clientWidth + 1 && text.right <= card.right - 1
    })), 'start/end times are not truncated, including conflict warnings')
    assert.equal(await page.locator('.overlap-region').count(), 0)
    await cards.filter({ hasText: '数学思维' }).click()
    assert.ok(await page.locator('.detail-modal h2').getByText('数学思维').isVisible())
    assert.equal(await page.locator('.overlap-modal').count(), 0)
    await page.keyboard.press('Escape')

    const legend = page.locator('.teacher-legend')
    await legend.getByRole('button', { name: '林老师', exact: true }).click()
    await expect(cards).toHaveCount(2)
    assert.equal(await cards.filter({ hasText: '阅读与表达' }).locator('.drag-handle').count(), 1, 'overlapped cards retain their handles after filtering')
    assert.equal(await legend.getByRole('button').count(), 3, 'unselected teachers remain available')
    assert.equal(await legend.getByRole('button', { name: '林老师' }).getAttribute('aria-pressed'), 'true')
    await legend.getByRole('button', { name: '周老师', exact: true }).click()
    await expect(cards).toHaveCount(4)
    await legend.getByRole('button', { name: '林老师', exact: true }).click()
    await expect(cards).toHaveCount(2)
    await legend.getByRole('button', { name: '周老师', exact: true }).click()
    await expect(cards).toHaveCount(6)
    await page.getByRole('button', { name: '我的课程', exact: true }).click()
    await expect(cards).toHaveCount(2)
    await legend.getByRole('button', { name: '陈老师', exact: true }).click()
    await expect(cards).toHaveCount(2)
    assert.ok((await cards.allTextContents()).every(text => text.includes('陈老师')))
    await page.getByRole('button', { name: '全部教师', exact: true }).click()
    await expect(cards).toHaveCount(6)
    assert.equal(scheduleReads, 1, 'teacher filtering is local and must not reload the schedule')

    const scroll = page.locator('.board-scroll')
    await scroll.evaluate(element => { if (element.scrollWidth <= element.clientWidth) element.style.maxWidth = '850px' })
    const originalScroll = await scroll.evaluate(element => element.scrollLeft)
    const courseBox = await cards.filter({ hasText: '数学思维' }).boundingBox()
    const x = courseBox.x + courseBox.width / 2
    const y = courseBox.y + courseBox.height / 2
    if (size.hasTouch) {
      const cdp = await context.newCDPSession(page)
      const touch = (type, targetX) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x: targetX, y, id: 1 }]
      })
      await touch('touchStart', x)
      await touch('touchMove', x - 100)
      await touch('touchEnd', x - 100)
    } else {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x - 100, y, { steps: 5 })
      await page.mouse.up()
    }
    assert.ok(await scroll.evaluate(element => element.scrollLeft) > originalScroll + 70, 'horizontal gesture must pan the calendar')
    assert.equal(await page.locator('.detail-modal, .move-modal, .overlap-modal').count(), 0, 'panning must not open any modal')
    // Start from empty space and verify browsing in both directions.
    const boardBox = await scroll.boundingBox()
    const panY = boardBox.y + 105
    await page.mouse.move(boardBox.x + 300, panY)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 390, panY, { steps: 5 })
    await page.mouse.up()
    assert.ok(await scroll.evaluate(element => element.scrollLeft) < originalScroll + 40)
    if (size.hasTouch) {
      await scroll.evaluate(element => { element.scrollLeft = 0 })
      await cards.filter({ hasText: '书法' }).scrollIntoViewIfNeeded()
      const single = await cards.filter({ hasText: '书法' }).boundingBox()
      const cdp = await context.newCDPSession(page)
      const x = single.x + single.width / 2
      const y = single.y + single.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y, id: 2 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      assert.ok(await scroll.evaluate(element => element.scrollLeft) > 70, 'a quick swipe on a draggable course should browse')
      assert.equal(await page.locator('.detail-modal, .move-modal').count(), 0)
    }
    await scroll.evaluate(element => { element.scrollLeft = 0 })
    await scroll.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    assert.ok(await scroll.evaluate(element => element.scrollLeft) > 0, 'keyboard browsing remains available')
    assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), 'only the calendar should scroll horizontally')
    assert.deepEqual(errors, [])
    assert.deepEqual(writes, [], 'browsing and filtering must not write business data')
    if (process.env.WEEKLY_BOARD_SCREENSHOTS === '1') {
      await scroll.evaluate(element => { element.scrollLeft = 0 })
      await page.locator('.weekly-head h1').click()
      await page.screenshot({ path: `.qa/weekly-board-${size.width}.png`, animations: 'disabled' })
    }
    await context.close()
    console.log(`PASS ${size.name}: equal course widths, partial/contained overlaps, direct detail, multi-teacher filtering, two-way panning and keyboard scrolling`)
  }
} finally { await browser.close() }
