import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1024 }, timezoneId: 'Asia/Shanghai' })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'archived-roster-ui')
        localStorage.setItem('user', JSON.stringify({ id: 'a1', role: 'admin', displayName: '管理员' }))
      })
      const students = [
        { id: 'active', name: '在读学生', status: 'active', enrollmentStage: 'enrolled' },
        { id: 'archived', name: '归档学生', status: 'deleted', enrollmentStage: 'enrolled' },
        { id: 'quit', name: '退学学生', status: 'quit', enrollmentStage: 'enrolled' },
        { id: 'pending', name: '待报名学生', status: 'active', enrollmentStage: 'pending' }
      ]
      const oldIds = ['active', 'archived', 'missing', 'quit', 'pending']
      let course = { id: 'c1', name: '旧名单课程', teacherId: 't1', weekday: 5, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, studentIds: [...oldIds] }
      const writes = []
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let payload = []
        if (path.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
        if (path.endsWith('/students')) payload = students
        if (path.endsWith('/courses')) payload = [course]
        if (path.endsWith('/adjustments')) payload = { once: [], future: [], course }
        if (path.endsWith('/courses/occurrences')) payload = [{ ...course, id: 'c1:2026-10-16', courseId: 'c1', date: '2026-10-16', originalDate: '2026-10-16', teacherName: '林老师' }]
        if (request.method() === 'PUT') {
          const body = request.postDataJSON()
          writes.push(body)
          if (body.studentIds.some(id => id !== 'active')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '课程名单包含不存在或已归档的学生' }) })
          course = { ...course, ...body }
          payload = course
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      await page.clock.install({ time: new Date('2026-10-09T08:00:00+08:00') })
      await page.goto(`${base}/courses`)
      await page.locator('.course-card').getByText(/归档学生（已归档）/).waitFor({ state: 'visible' })
      await page.locator('.course-card').getByRole('button', { name: '编辑', exact: true }).click()
      const edit = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑课程' }) })
      await edit.getByText(/本次名单已移除：归档学生（已归档）/).waitFor({ state: 'visible' })
      assert.equal(await edit.locator('.student-btn').count(), 1, '名单候选只应包含已报名在读学生')
      await edit.getByPlaceholder('如：三年级数学提高班').fill('可以修改的课程')
      const saved = page.waitForResponse(response => response.request().method() === 'PUT')
      await edit.getByRole('button', { name: '保存', exact: true }).click()
      assert.equal((await saved).status(), 200, '排课管理仍提交了编辑界面隐藏的归档学生')
      await edit.waitFor({ state: 'hidden' })
      assert.deepEqual(writes[0].studentIds, ['active'])
      course.studentIds = [...oldIds]
      await page.goto(`${base}/weekly-schedule`)
      await page.locator(width < 600 ? '.agenda-card' : '.course-bar').first().click()
      const detail = page.locator('.detail-modal').filter({ has: page.getByRole('heading', { name: '课程资料' }) })
      await detail.locator('label').filter({ hasText: '课程名称' }).locator('input').fill('周排课可以修改')
      const weeklySaved = page.waitForResponse(response => response.request().method() === 'PUT')
      await detail.getByRole('button', { name: '保存课程资料与名单' }).click()
      assert.equal((await weeklySaved).status(), 200, '周排课仍提交了已归档或不存在的学生')
      await detail.waitFor({ state: 'hidden' })
      assert.deepEqual(writes[1].studentIds, ['active'])
      course.studentIds = oldIds.filter(id => id !== 'active')
      await page.goto(`${base}/courses`)
      await page.locator('.course-card').getByRole('button', { name: '编辑', exact: true }).click()
      await edit.getByRole('button', { name: '保存', exact: true }).click()
      await page.getByText('请至少选择一名已报名且在读的学生，或先恢复归档学生', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(writes.length, 2, '旧名单全部失效时不能提交空名单')
      await edit.getByRole('button', { name: '在读学生', exact: true }).click()
      const validSave = page.waitForResponse(response => response.request().method() === 'PUT')
      await edit.getByRole('button', { name: '保存', exact: true }).click()
      assert.equal((await validSave).status(), 200)
      await edit.waitFor({ state: 'hidden' })
      assert.deepEqual(writes[2].studentIds, ['active'])
      console.log(`${width}px 排课管理与周排课：旧名单中的归档/不存在学生不再阻止保存`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
