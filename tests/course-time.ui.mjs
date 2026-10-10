import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 820, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Shanghai' })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'course-time-ui')
        localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
      })
      const writes = []
      let failDetails = false
      const course = { id: 'c1', name: '阅读课', teacherId: 't1', weekday: 5, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, studentIds: ['s1'], classroom: '' }
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let payload = []
        if (path.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
        if (path.endsWith('/students')) payload = [{ id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled' }]
        if (path.endsWith('/courses') && request.method() === 'GET') payload = [course]
        if (path.endsWith('/courses/occurrences')) payload = [{ ...course, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, id: 'c1:2026-10-09', courseId: 'c1', date: '2026-10-09', originalDate: '2026-10-09', teacherName: '林老师' }]
        if (path.endsWith('/adjustments')) {
          if (failDetails) {
            failDetails = false
            return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '课程资料暂时不可用' }) })
          }
          payload = { once: [], future: [], course }
        }
        if (request.method() === 'POST' || request.method() === 'PUT') {
          const body = request.postDataJSON()
          writes.push({ method: request.method(), body })
          payload = { ...course, ...body, id: request.method() === 'POST' ? 'new-course' : 'c1' }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      await page.clock.install({ time: new Date('2026-10-09T08:00:00+08:00') })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      async function choose(select, value) {
        await select.click()
        await page.locator('.n-base-select-option').getByText(value, { exact: true }).click()
      }
      async function endIsReadOnly(input, expected) {
        assert.equal(await input.inputValue(), expected)
        assert.equal(await input.evaluate(element => element.readOnly), true)
        assert.equal(await input.isDisabled(), true)
      }
      await page.goto('http://127.0.0.1:4174/courses')
      await page.getByRole('button', { name: '创建课程' }).click()
      const create = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '创建课程' }) })
      await create.getByPlaceholder('如：三年级数学提高班').fill('计算结束时间的课程')
      const createEnd = create.locator('.time-row .form-group').last().locator('input')
      await endIsReadOnly(createEnd, '10:00')
      await create.locator('.hours-amount input').fill('2')
      await choose(create.locator('.time-row .search-select'), '10:30')
      await endIsReadOnly(createEnd, '12:30')
      await create.getByRole('button', { name: '学生甲', exact: true }).click()
      await create.getByRole('button', { name: '保存', exact: true }).click()
      await create.waitFor({ state: 'hidden' })
      assert.equal(writes[0].body.endTime, '12:30')
      const card = page.locator('.course-card').filter({ has: page.getByRole('heading', { name: '阅读课', exact: true }) })
      await card.getByRole('button', { name: '编辑', exact: true }).click()
      const edit = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑课程' }) })
      await edit.getByText('结束时间（自动计算）', { exact: true }).waitFor({ state: 'visible' })
      await edit.locator('.hours-amount input').fill('1.5')
      await choose(edit.locator('.time-row .search-select'), '10:00')
      await endIsReadOnly(edit.locator('.time-row .form-group').last().locator('input'), '11:30')
      await edit.getByRole('button', { name: '保存', exact: true }).click()
      await edit.waitFor({ state: 'hidden' })
      assert.deepEqual([writes[1].body.startTime, writes[1].body.endTime, writes[1].body.hoursPerClass], ['10:00', '11:30', 1.5])

      await page.goto('http://127.0.0.1:4174/weekly-schedule')
      await page.getByRole('button', { name: '创建课程', exact: true }).click()
      const weeklyCreate = page.locator('.detail-modal').filter({ hasText: '开始排课' })
      await weeklyCreate.getByPlaceholder('请输入课程名称').fill('周课表自动结束时间')
      const hours = weeklyCreate.locator('label').filter({ hasText: '每次课时' }).locator('input')
      await hours.fill('0.5')
      await hours.press('Tab')
      await choose(weeklyCreate.locator('.move-times .n-select'), '09:30')
      await endIsReadOnly(weeklyCreate.locator('.move-times input'), '10:00')
      await choose(weeklyCreate.locator('.create-form .n-select').last(), '学生甲')
      await weeklyCreate.getByRole('button', { name: '创建课程', exact: true }).click()
      await weeklyCreate.waitFor({ state: 'hidden' })
      assert.deepEqual([writes[2].body.startTime, writes[2].body.endTime, writes[2].body.hoursPerClass], ['09:30', '10:00', 0.5])
      await page.locator(width < 600 ? '.agenda-card' : '.course-bar').first().click()
      const detail = page.locator('.detail-modal').filter({ has: page.getByRole('heading', { name: '课程资料', exact: true }) })
      await detail.getByText('结束时间（自动计算）', { exact: true }).waitFor({ state: 'visible' })
      const detailHours = detail.locator('label').filter({ hasText: '每次课时' }).locator('input')
      await detailHours.fill('2')
      await detailHours.press('Tab')
      await choose(detail.locator('label').filter({ hasText: '开始时间' }).locator('.n-select'), '10:30')
      await endIsReadOnly(detail.locator('label').filter({ hasText: '结束时间' }).locator('input'), '12:30')
      await detail.getByRole('button', { name: '保存课程资料与名单' }).click()
      await detail.waitFor({ state: 'hidden' })
      assert.deepEqual([writes[3].body.startTime, writes[3].body.endTime, writes[3].body.hoursPerClass], ['10:30', '12:30', 2])
      course.upcomingSchedule = { effectiveWeekStart: '2026-10-11', startTime: '13:00', endTime: '13:30' }
      course.hoursPerClass = 0.5
      failDetails = true
      await page.locator(width < 600 ? '.agenda-card' : '.course-bar').first().click()
      await detail.locator('.course-warning').getByText('课程资料暂时不可用').waitFor({ state: 'visible' })
      assert.equal(await detail.getByRole('button', { name: '保存课程资料与名单' }).isDisabled(), true)
      assert.equal(writes.length, 4)
      await page.getByRole('button', { name: '关闭提示' }).click()
      await detail.getByRole('button', { name: '重试', exact: true }).click()
      await detail.getByRole('button', { name: '保存课程资料与名单' }).waitFor({ state: 'visible' })
      await page.getByText('正在加载最新课程资料…').waitFor({ state: 'hidden' })
      await endIsReadOnly(detail.locator('label').filter({ hasText: '结束时间' }).locator('input'), '13:30')
      assert.equal(await detail.locator('label').filter({ hasText: '每次课时' }).locator('input').inputValue(), '0.5')
      await detail.getByRole('button', { name: '保存课程资料与名单' }).click()
      await detail.waitFor({ state: 'hidden' })
      assert.deepEqual([writes[4].body.startTime, writes[4].body.endTime, writes[4].body.hoursPerClass], ['13:00', '13:30', 0.5])
      assert.deepEqual(errors, [])
      console.log(`${width}px: 两个界面的创建/编辑允许修改开始时间和课时，结束时间自动计算且只读`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
