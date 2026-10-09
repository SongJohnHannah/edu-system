import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 820, 768, 390]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height: 1024 }, timezoneId: 'Asia/Shanghai' })
    try {
      await context.addInitScript(role => {
        localStorage.setItem('access_token', 'student-restore-ui')
        localStorage.setItem('user', JSON.stringify({ id: 'u1', role, teacherId: role === 'teacher' ? 't1' : null, displayName: '测试用户' }))
      }, role)
      const students = [
        { id: 'admin', name: '管理员归档学生', createdBy: 'admin', creatorId: null },
        { id: 'own', name: '自己归档学生', createdBy: 'teacher', creatorId: 't1' },
        { id: 'other', name: '其他教师归档学生', createdBy: 'teacher', creatorId: 't2' }
      ].map(student => ({ ...student, status: 'deleted', enrollmentStage: 'pending', totalHours: 20, usedHours: 3.5 }))
      const student = students[1]
      const before = { ...student }
      const writes = []
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let payload = path.endsWith('/students') ? students : []
        if (path.endsWith('/restore') && request.method() === 'POST') {
          writes.push(path)
          if (writes.length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '恢复暂时失败，请重试' }) })
          assert.equal(path, '/edusystem/api/students/own/restore')
          student.status = 'active'
          payload = student
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/students`)
      await page.getByRole('button', { name: '查看归档', exact: true }).click()
      const rows = page.locator(width <= 768 ? '.mobile-card' : '.desktop-only tbody tr')
      const row = rows.filter({ hasText: student.name })
      await row.waitFor({ state: 'visible' })
      assert.equal(await rows.getByRole('button', { name: '恢复', exact: true }).count(), role === 'admin' ? 3 : 1, '恢复权限应沿用归档权限')
      const restore = row.getByRole('button', { name: '恢复', exact: true })
      const confirm = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '恢复学生', exact: true }) })
      await restore.click()
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await confirm.waitFor({ state: 'hidden' })
      assert.equal(writes.length, 0, '取消确认不能恢复学生')
      await restore.click()
      const failed = page.waitForResponse(response => response.url().endsWith('/restore'))
      await confirm.getByRole('button', { name: '确认', exact: true }).click()
      assert.equal((await failed).status(), 503)
      await page.getByText('恢复暂时失败，请重试', { exact: true }).waitFor({ state: 'visible' })
      assert.deepEqual(student, before, '请求失败不能从归档名单移走学生')
      assert.equal(await confirm.isVisible(), true, '失败后保留确认框以便重试')
      const success = page.waitForResponse(response => response.url().endsWith('/restore'))
      await confirm.getByRole('button', { name: '确认', exact: true }).click()
      assert.equal((await success).status(), 200)
      await confirm.waitFor({ state: 'hidden' })
      await row.waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '隐藏归档', exact: true }).click()
      await row.waitFor({ state: 'visible' })
      await row.getByText('正常', { exact: true }).first().waitFor({ state: 'visible' })
      await row.getByText('待报名', { exact: width > 768 }).first().waitFor({ state: 'visible' })
      assert.deepEqual(student, { ...before, status: 'active' }, '恢复保留原编号、报名阶段和课时')
      await page.reload()
      await row.waitFor({ state: 'visible' })
      assert.equal(await row.getByRole('button', { name: '恢复', exact: true }).count(), 0)
      assert.deepEqual(errors, [])
      console.log(`${width}px ${role}：归档恢复权限、取消、失败重试及原课时保留通过`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
