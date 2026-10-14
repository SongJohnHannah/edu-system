import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const students = [
  { id: 'a', name: '林安安', status: 'active', phone: '13800138001', createdBy: 'admin' },
  { id: 'b', name: '陈乐乐', status: 'active', phone: '13800138002', creatorId: 't1', createdBy: 'teacher', enrollmentStage: 'pending' },
  { id: 'c', name: '林小雨', status: 'quit', phone: '13800138003', createdBy: 'admin' },
  { id: 'd', name: '归档学生', status: 'deleted', phone: '13800138004', createdBy: 'admin' }
].map(student => ({ totalHours: 20, usedHours: 2, enrollmentStage: 'enrolled', ...student }))
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1440 })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'student-filter-ui')
        localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'admin', displayName: '测试管理员' }))
      })
      const writes = []
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        if (request.method() !== 'GET') writes.push(request.url())
        const payload = request.url().endsWith('/students') ? students : []
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/students`)
      const rows = page.locator(width <= 768 ? '.mobile-card' : '.desktop-only tbody tr')
      const count = page.locator('.filter-count')
      const search = page.getByRole('textbox', { name: '搜索学生姓名或电话' })
      const select = page.locator('.student-status-select')
      async function status(label) {
        await select.click()
        await page.locator('.n-base-select-menu').getByText(label, { exact: true }).click()
      }
      await expect(rows).toHaveCount(3)
      await expect(page.locator('.student-total')).toHaveText('学生总数 4 人')
      await expect(page.locator('.summary-note')).toHaveText('含已归档 1 人')
      await expect(count).toHaveText('当前显示 3 人')
      await status('退学')
      await expect(rows).toHaveCount(1)
      await expect(rows).toContainText('林小雨')
      await expect(count).toHaveText('当前显示 1 人')
      await search.fill('38003')
      await expect(rows).toHaveCount(1)
      await search.fill('陈')
      await expect(rows).toHaveCount(0)
      await expect(count).toHaveText('当前显示 0 人')
      const empty = page.locator(width <= 768 ? '.empty-state.mobile-only' : '.desktop-only .empty-state')
      await expect(empty).toContainText('没有符合筛选条件的学生')
      await empty.getByRole('button', { name: '清除筛选' }).click()
      await expect(rows).toHaveCount(3)
      await status('正常')
      await expect(rows).toHaveCount(2)
      await page.getByRole('button', { name: '我录入的', exact: true }).click()
      await expect(rows).toHaveCount(1)
      await expect(rows).toContainText('林安安')
      await page.getByRole('button', { name: '全部学生', exact: true }).click()
      await status('已归档')
      await expect(rows).toHaveCount(1)
      await expect(rows).toContainText('归档学生')
      await expect(page.getByRole('button', { name: '隐藏归档', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '隐藏归档', exact: true }).click()
      await expect(rows).toHaveCount(3)
      await expect(select).toContainText('全部状态（未归档）')
      await page.getByRole('button', { name: '查看归档', exact: true }).click()
      await expect(select).toContainText('已归档')
      await expect(rows).toHaveCount(1)
      await status('全部状态（未归档）')
      await select.locator('.n-base-selection').focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(select).toContainText('正常')
      await expect(rows).toHaveCount(2)
      await expect(page.locator('.student-total')).toHaveText('学生总数 4 人')
      const style = await select.locator('.n-base-selection').evaluate(element => ({
        radius: parseFloat(getComputedStyle(element).borderRadius), height: element.getBoundingClientRect().height
      }))
      assert.ok(style.radius >= 10 && style.height >= 40, 'dropdown follows the modern rounded application style')
      assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), 'filters do not overflow the page')
      assert.deepEqual(writes, [], 'searching never writes student data')
      assert.deepEqual(errors, [])
      if (process.env.STUDENT_FILTER_SCREENSHOTS === '1') {
        await select.click()
        await page.waitForTimeout(250)
        await page.screenshot({ path: `.qa/student-filters-${width}.png`, fullPage: true, animations: 'disabled' })
      }
      console.log(`PASS ${width}px: total count, combined status/name/phone/scope filters, archive synchronization, empty result and keyboard selection`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
