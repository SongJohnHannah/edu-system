import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })
const failures = []
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', hasTouch: width < 1440 })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'presentation-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', teacherId: 't1', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data = []
      if (path.endsWith('/teachers')) data = [{ id: 't1', name: '林老师', status: 'active' }, { id: 't2', name: '陈老师', status: 'active' }]
      if (path.endsWith('/students')) data = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }, { id: 's2', name: '试听学生', status: 'active', enrollmentStage: 'pending' }]
      if (path.endsWith('/adjustments')) data = { once: [], future: [] }
      if (path.endsWith('/courses/occurrences')) data = [
        { courseId: 'c1', name: 'PU 0 周三', startTime: '09:00', endTime: '10:00', teacherId: 't1' },
        { courseId: 'c2', name: '主题英语启蒙', startTime: '09:30', endTime: '10:30', teacherId: 't2' },
        { courseId: 'c3', name: '独立课程', startTime: '11:00', endTime: '12:00', teacherId: 't1' }
      ].map(item => ({ ...item, id: `${item.courseId}:2026-09-30`, date: '2026-09-30', originalDate: '2026-09-30', teacherName: '林老师', studentIds: ['s1'], hoursPerClass: 1, trialCount: 0 }))
      if (path.endsWith('/attendance')) data = { data: [], hasMore: false }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-28T08:00:00+08:00') })
    const check = async (name, fn) => {
      try { await fn(); console.log(`PASS ${width}: ${name}`) }
      catch (error) { failures.push(`${width}: ${name}: ${error.message}`); console.log(`FAIL ${failures.at(-1)}`) }
    }
    await page.goto(`${base}/weekly-schedule`)
    await page.addStyleTag({ content: '*,*::before,*::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
    const cards = page.locator(width >= 600 ? '.combined-board .course-bar' : '.mobile-two-weeks .agenda-card')
    await cards.first().waitFor()
    await page.getByRole('button', { name: '创建课程', exact: true }).click()
    const create = page.locator('.detail-modal')
    await create.waitFor()
    await check('创建课程弹窗宽度', async () => {
      const box = await create.boundingBox()
      assert.ok(box.width <= (width >= 600 ? 640 : width), `弹窗宽 ${box.width}px`)
      if (width >= 600) assert.ok(box.x >= 24, 'PC/iPad 弹窗没有两侧留白')
    })
    await page.keyboard.press('Escape')
    await cards.filter({ hasText: '独立课程' }).click()
    await page.getByRole('button', { name: '修改日期与时间' }).click()
    const move = page.locator('.move-modal')
    await move.waitFor()
    await check('单选框与文字同一行', async () => {
      const radio = move.locator('.n-radio').first()
      const offset = await radio.evaluate(element => {
        const mark = element.querySelector('.n-radio__dot-wrapper').getBoundingClientRect()
        const label = element.querySelector('.n-radio__label').getBoundingClientRect()
        return Math.abs(mark.y + mark.height / 2 - label.y - label.height / 2)
      })
      assert.ok(offset < 7, `单选框与文字偏移 ${offset}px`)
    })
    await check('日期选择使用统一组件', async () => {
      assert.equal(await move.locator('.office-date-picker').count(), 1)
      await move.locator('.office-date-picker input').click()
      await page.locator('.n-date-panel').waitFor()
      const panel = await page.locator('.n-date-panel').boundingBox()
      assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1, '日期面板溢出屏幕')
      if (process.env.PRESENTATION_SCREENSHOTS) await page.screenshot({ path: `.qa/date-picker-${width}.png` })
      await move.locator('.move-course').click()
    })
    await page.keyboard.press('Escape')
    if (width >= 600) {
      await check('拖动有目标时段占位', async () => {
        const handle = cards.filter({ hasText: '独立课程' }).locator('.drag-handle')
        await cards.filter({ hasText: '独立课程' }).hover()
        const origin = await handle.boundingBox()
        const lane = await page.locator('.day-lane[data-date="2026-10-01"]').boundingBox()
        await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
        await page.mouse.down()
        await page.mouse.move(lane.x + lane.width / 2, lane.y + 120, { steps: 5 })
        assert.equal(await page.locator('.drop-preview').count(), 1, '目标时段没有占位卡片')
        assert.ok(await page.locator('.drop-preview').innerText().then(text => text.includes('10:00') && text.includes('11:00')))
      })
      await page.mouse.up()
      await page.keyboard.press('Escape')
      await check('重叠课程占用同一横向位置', async () => {
        const a = await cards.filter({ hasText: 'PU 0 周三' }).boundingBox()
        const b = await cards.filter({ hasText: '主题英语启蒙' }).boundingBox()
        assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > a.width * .8, '课程仍被分成左右两列')
        assert.equal(await cards.filter({ hasText: 'PU 0 周三' }).locator('.drag-handle').count(), 0, '重叠课程仍可拖动')
        assert.equal(await page.locator('.day-head[data-date="2026-09-30"] .day-drag-handle').count(), 0, '整天拖动可绕过重叠限制')
        assert.equal(await page.locator('.overlap-region').evaluate(element => getComputedStyle(element).borderStyle), 'dashed')
      })
    }
    // Click an exposed part of the stacked group, or its dedicated chooser surface.
    await page.locator('.overlap-region, .agenda-card.has-overlap, .course-bar.has-overlap').filter({ visible: true }).first().click()
    await check('点击重叠课程先选择编辑对象', async () => {
      assert.equal(await page.locator('.overlap-modal').count(), 1, '没有弹出课程选择窗口')
      const chooser = page.locator('.overlap-modal')
      assert.ok(await chooser.getByRole('button', { name: /PU 0 周三/ }).isVisible())
      await chooser.getByRole('button', { name: /主题英语启蒙/ }).click()
      assert.ok(await page.locator('.detail-modal').getByRole('heading', { name: '主题英语启蒙' }).isVisible())
    })
    await page.keyboard.press('Escape')
    if (width >= 600) {
      await page.getByRole('button', { name: '我的课程' }).click()
      await check('教师筛选不能绕过重叠禁拖限制', async () => {
        assert.equal(await cards.filter({ hasText: 'PU 0 周三' }).locator('.drag-handle').count(), 0)
      })
      await page.getByRole('button', { name: '全部教师' }).click()
    }
    if (process.env.PRESENTATION_SCREENSHOTS) await page.screenshot({ path: `.qa/overlap-schedule-${width}.png` })
    for (const [path, button, selector] of [
      ['/students', /添加学生/, '.office-modal-shell'],
      ['/teachers', /添加教师/, '.office-modal-shell'],
      ['/courses', /创建课程/, '.office-modal-shell'],
      ['/trial-bookings', /新增预约/, '.editor-modal']
    ]) {
      await page.goto(`${base}${path}`)
      await page.getByRole('button', { name: button }).click()
      const modal = page.locator(selector)
      await modal.waitFor()
      await check(`${path} 弹窗尺寸`, async () => {
        const box = await modal.boundingBox()
        assert.ok(box.width <= Math.min(width, 640), `弹窗宽 ${box.width}px`)
        if (width >= 600) assert.ok(box.x >= 24, '没有两侧留白')
        assert.ok(box.height <= 880, '弹窗超出可视高度')
      })
    }
    await page.goto(`${base}/calendar`)
    await page.locator('.calendar-body').waitFor()
    await check('日历组件可通过键盘选择日期', async () => {
      const day = page.locator('.calendar-day').filter({ hasText: /^30$/ }).first()
      await day.focus()
      await page.keyboard.press('Enter')
      assert.equal(await day.getAttribute('aria-pressed'), 'true')
      if (process.env.PRESENTATION_SCREENSHOTS) await page.screenshot({ path: `.qa/month-calendar-${width}.png` })
    })
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally { await browser.close() }
assert.deepEqual(failures, [])
