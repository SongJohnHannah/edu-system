import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const date = '2026-09-28'
try {
  for (const width of [1440, 1024, 390, 320]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(role => {
      localStorage.setItem('access_token', 'attendance-hours-test')
      localStorage.setItem('user', JSON.stringify({ id: 'user-1', role, teacherId: role === 'teacher' ? 't1' : null }))
    }, role)
    const students = [
      { id: 's1', name: '学生甲', status: 'active', totalHours: 2, usedHours: 1 },
      { id: 's2', name: '学生乙', status: 'active', totalHours: 10, usedHours: 0 }
    ]
    const courses = [
      { id: 'c1', name: '阅读课', teacherId: 't1', studentIds: ['s1', 's2'], hoursPerClass: 1.5 },
      { id: 'c2', name: '书法课', teacherId: 't1', studentIds: ['s1'], hoursPerClass: 0.5 }
    ]
    const occurrences = courses.map(c => ({ ...c, id: `${c.id}:${date}`, courseId: c.id, originalDate: date, date, startTime: '09:00', endTime: '10:30' }))
    const writes = []
    let savedRecord
    let failStudentRefresh = false
    let releasePost
    const postGate = new Promise(resolve => { releasePost = resolve })
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let result = []
      if (path.endsWith('/students')) {
        if (failStudentRefresh) return route.fulfill({ status: 503, json: { error: '学生资料刷新失败' } })
        result = students
      } else if (path.endsWith('/teachers')) result = [{ id: 't1', name: '林老师' }]
      else if (path.endsWith('/courses')) result = courses
      else if (path.endsWith('/courses/occurrences')) result = occurrences
      else if (path.endsWith('/attendance') && request.method() === 'GET') result = { data: savedRecord ? [savedRecord] : [], hasMore: false }
      else if (path.endsWith('/attendance') && request.method() === 'POST') {
        const body = request.postDataJSON()
        writes.push(body)
        await postGate
        savedRecord = { id: 'a1', ...body, originalStudentIds: body.studentIds, courseName: '阅读课', createdAt: `${date} 12:00:00` }
        failStudentRefresh = true
        result = savedRecord
      }
      await route.fulfill({ status: 200, json: result })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-28T12:00:00+08:00') })
      await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
      const choose = async name => {
        await page.locator('.select-course .search-select').click()
        await page.locator('.n-base-select-option').filter({ hasText: name }).click()
      }
      await choose('阅读课')
      const form = page.locator('.attendance-form')
      const open = () => form.getByRole('button', { name: /确认点名/ }).click()
      const modal = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '确认点名' }) })
      const hours = modal.getByRole('spinbutton', { name: '本次扣除课时' })
      const minus = modal.getByRole('button', { name: '减少 0.5 课时' })
      const plus = modal.getByRole('button', { name: '增加 0.5 课时' })
      const confirm = modal.getByRole('button', { name: '确认点名', exact: true })
      await open()
      assert.equal(await hours.inputValue(), '1.5')
      await modal.locator('.confirm-warning').waitFor({ state: 'visible' })
      await minus.click()
      assert.equal(await hours.inputValue(), '1')
      await modal.locator('.confirm-warning').waitFor({ state: 'hidden' })
      await minus.click()
      assert.equal(await hours.inputValue(), '0.5')
      assert.equal(await minus.isDisabled(), true)
      await plus.click()
      assert.equal(await hours.inputValue(), '1')
      await plus.click()
      await modal.locator('.confirm-warning').waitFor({ state: 'visible' })
      for (const invalid of ['', '0', '-1', '0.3', '1.25', '1000']) {
        await hours.fill(invalid)
        assert.equal(await confirm.isDisabled(), true, `${width}px ${role}: accepted ${invalid}`)
        await modal.getByRole('alert').waitFor({ state: 'visible' })
      }
      assert.equal(writes.length, 0)
      await hours.fill('999.5')
      assert.equal(await plus.isDisabled(), true)
      await minus.click()
      assert.equal(await hours.inputValue(), '999')
      await hours.fill('3.5')
      await minus.click()
      assert.equal(await hours.inputValue(), '3')
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(writes.length, 0)
      await open()
      assert.equal(await hours.inputValue(), '1.5', 'reopening must restore the course default')
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      await choose('书法课')
      await open()
      assert.equal(await hours.inputValue(), '0.5', 'switching courses must use the new default')
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      await choose('阅读课')
      await open()
      await hours.fill('2.5')
      assert.equal(await modal.locator('.hours-total').innerText(), '共计：5 课时')
      assert.equal(await form.locator('.deduct-info').innerText(), '将扣除 1.5 课时/人\n共 3 课时')
      const box = await modal.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width)
      assert.equal(await modal.evaluate(el => el.scrollWidth > el.clientWidth + 2), false)
      if (role === 'admin') await page.screenshot({ path: `.qa/attendance-hours-${width}.png`, animations: 'disabled' })
      const pending = page.waitForRequest(r => r.url().endsWith('/attendance') && r.method() === 'POST')
      await confirm.click()
      await pending
      assert.equal(await hours.isDisabled(), true)
      assert.equal(await plus.isDisabled(), true)
      assert.equal(await modal.getByRole('button', { name: '提交中...' }).isDisabled(), true)
      releasePost()
      await modal.waitFor({ state: 'hidden' })
      await page.locator('.history-item').getByText('扣除 2.5 课时/人').waitFor()
      await form.getByText('欠 1.5 课时').waitFor()
      await form.getByText('剩余 7.5 课时').waitFor()
      assert.equal(writes.length, 1)
      assert.equal(writes[0].hoursDeducted, 2.5)
      assert.deepEqual(writes[0].studentIds, ['s1', 's2'])
      assert.equal(writes[0].originalDate, date)
      assert.deepEqual(errors, [])
    } finally {
      releasePost()
      await context.close()
    }
  }
  console.log('点名课时调节：四种屏宽、两种角色，默认值、加减、输入校验、预警、重置、提交及余额通过')
} finally {
  await browser.close()
}
