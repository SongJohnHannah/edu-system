import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })
const viewports = [
  { width: 768, height: 1024 },
  { width: 810, height: 1080 },
  { width: 820, height: 1180 },
  { width: 834, height: 1194 },
  { width: 912, height: 1368 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]

async function isReachable(button) {
  return button.evaluate(element => {
    const box = element.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    if (box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) return false
    const hit = document.elementFromPoint(x, y)
    return hit === element || element.contains(hit)
  })
}

async function swipeLeft(context, page, table) {
  const box = await table.boundingBox()
  const cdp = await context.newCDPSession(page)
  const fromX = Math.min(box.x + box.width - 30, page.viewportSize().width - 30)
  const toX = Math.max(box.x + 30, fromX - 500)
  const y = box.y + box.height / 2
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
  })
  await touch('touchStart', fromX)
  for (let step = 1; step <= 15; step++) {
    await touch('touchMove', fromX + (toX - fromX) * step / 15)
    await page.waitForTimeout(20)
  }
  await touch('touchEnd', toX)
  await page.waitForTimeout(200)
  await cdp.detach()
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'student-tablet-test')
        localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '测试管理员' }))
      })
      await context.route('**/edusystem/api/**', async route => {
        assert.equal(route.request().method(), 'GET', '布局测试不应写入业务数据')
        const pathname = new URL(route.request().url()).pathname
        let payload = []
        if (pathname.endsWith('/students')) payload = [{
          id: 's1', name: '平板测试学生', age: 8, phone: '13900000000', status: 'active',
          createdBy: 'admin', enrollmentStage: 'enrolled', totalHours: 20, usedHours: 2, remark: ''
        }]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/students`)
      await page.addStyleTag({ content: '*,*::before,*::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
      const row = page.locator(viewport.width <= 768 ? '.mobile-card:visible' : '.table tbody tr:visible')
      await row.waitFor({ state: 'visible' })
      const edit = row.getByRole('button', { name: '编辑', exact: true })
      const table = page.locator('.students .table-container:visible')
      for (let attempt = 0; attempt < 3 && !await isReachable(edit) && await table.count(); attempt++) {
        await swipeLeft(context, page, table)
      }
      if (!await isReachable(edit)) {
        const layout = await table.evaluate(element => ({
          width: element.clientWidth, scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft,
          overflowX: getComputedStyle(element).overflowX,
          tableWidth: element.querySelector('table').getBoundingClientRect().width
        }))
        await mkdir('.qa/ui', { recursive: true })
        await page.screenshot({ path: `.qa/ui/student-tablet-${viewport.width}-failure.png` })
        assert.fail(`${viewport.width}px: 原生左右滑动后编辑操作仍被裁切：${JSON.stringify(layout)}`)
      }
      for (const name of ['加减课', '历史', '编辑', '归档']) {
        assert.ok(await isReachable(row.getByRole('button', { name, exact: true })), `${viewport.width}px: ${name}操作无法点击`)
      }
      if (process.env.UI_SCREENSHOTS === '1') {
        await mkdir('.qa/ui', { recursive: true })
        await page.screenshot({ path: `.qa/ui/student-tablet-${viewport.width}-passed.png` })
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${viewport.width}px: 整个页面横向溢出`)
      await edit.tap()
      const modal = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑学生' }) })
      await modal.waitFor({ state: 'visible' })
      assert.equal(await modal.getByPlaceholder('请输入学生姓名').inputValue(), '平板测试学生')
      await modal.getByRole('button', { name: '取消', exact: true }).tap()
      assert.deepEqual(errors, [])
      console.log(`${viewport.width}×${viewport.height}: 学生操作可见、原生触摸可达、编辑弹窗通过`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
