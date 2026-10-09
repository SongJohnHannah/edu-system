import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const rows = [
  { id: 'h1', courseName: '阅读课', oldTeacherName: '林老师', newTeacherName: '陈老师', performedBy: '管理员', reason: '工作安排', createdAt: '2026-09-28 09:30:00' },
  { id: 'h2', courseName: '写作课', oldTeacherName: '陈老师', newTeacherName: '林老师', performedBy: '管理员', reason: null, createdAt: '2026-09-27 14:00:00' }
]

try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'handover-history-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    let fail = false
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/handovers') && fail) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '网络临时故障' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/handovers') ? rows : []) })
      }
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/handovers', { waitUntil: 'domcontentloaded' })
      const recordRows = page.locator(width < 600 ? '.handover-mobile-card' : '.handover-page tbody tr')
      await recordRows.first().waitFor({ state: 'visible' })
      if (width >= 600) {
        const headers = await page.locator('.handover-page th').allTextContents()
        if (headers.join(',') !== '时间,课程,原教师,新教师,操作人,原因') throw new Error(`${width}px 六个原版字段不完整`)
      }
      if (await recordRows.count() !== 2 || !await recordRows.first().getByText('工作安排').isVisible()) throw new Error(`${width}px 交接记录缺失`)
      if (width < 600) {
        if (!await page.locator('.handover-table').isHidden()) throw new Error(`${width}px 手机仍显示宽表格`)
        const fields = await recordRows.first().locator('dl > div').evaluateAll(elements => elements.map(element =>
          `${element.querySelector('dt')?.textContent}:${element.querySelector('dd')?.textContent}`))
        if (fields.join(',') !== '课程:阅读课,时间:2026-09-28 09:30,原教师:林老师,新教师:陈老师,操作人:管理员,原因:工作安排') {
          throw new Error(`${width}px 手机记录字段错误：${fields}`)
        }
        if (await recordRows.nth(1).locator('dd').last().textContent() !== '-') throw new Error(`${width}px 空原因未显示占位`)
        const clipped = await recordRows.first().evaluate(card => card.scrollWidth > card.clientWidth + 2)
        if (clipped) throw new Error(`${width}px 手机交接卡仍需横向滚动`)
      } else {
        const first = (await recordRows.first().locator('td').allTextContents()).map(value => value.trim())
        if (first.join(',') !== '2026-09-28 09:30,阅读课,林老师,陈老师,管理员,工作安排') throw new Error(`${width}px 记录字段错误：${first}`)
        if (await recordRows.nth(1).locator('td').last().textContent() !== '-') throw new Error(`${width}px 空原因未显示占位`)
        if (width === 768) {
          const bounds = await page.locator('.handover-table').evaluate(table => {
            const tableBox = table.getBoundingClientRect()
            const lastCell = table.querySelector('th:last-child').getBoundingClientRect()
            return { scrolls: table.scrollWidth > table.clientWidth + 2, clipped: lastCell.right > tableBox.right + 2 }
          })
          if (bounds.scrolls || bounds.clipped) throw new Error(`iPad 竖屏交接表未显示全部六列：${JSON.stringify(bounds)}`)
        }
      }
      fail = true
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByText('交接记录加载失败，请重试').waitFor({ state: 'visible' })
      fail = false
      await page.getByRole('button', { name: '重试' }).click()
      await recordRows.first().waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px 页面脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }

    const teacher = await browser.newContext({ viewport: { width, height: 900 } })
    await teacher.addInitScript(() => {
      localStorage.setItem('access_token', 'teacher-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u2', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
    })
    let handoverReads = 0
    await teacher.route('**/edusystem/api/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('/handovers')) handoverReads++
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    try {
      const page = await teacher.newPage()
      await page.goto('http://127.0.0.1:4174/handovers', { waitUntil: 'domcontentloaded' })
      await page.waitForURL('http://127.0.0.1:4174/')
      if (handoverReads) throw new Error(`${width}px 教师越权读取了交接记录`)
    } finally {
      await teacher.close()
    }
  }
  console.log('交接记录 PC/iPad 表格与 390/320px 手机卡片：六字段、错误重试、教师无权入口通过')
} finally {
  await browser.close()
}
