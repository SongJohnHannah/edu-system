import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const records = [
  { id: 'a', type: 'add', hours: 4.5, remark: '续费', operator: '管理员', createdAt: '2026-09-27 10:00:00' },
  { id: 's', type: 'subtract', hours: 0.5, remark: '调整', operator: '管理员', createdAt: '2026-09-27 11:00:00' },
  { id: 'd', type: 'deduct', hours: 1.5, remark: '正式课点名', operator: '林老师', createdAt: '2026-09-28 10:00:00' },
  { id: 'r', type: 'restore', hours: 1.5, remark: '撤销点名还原', operator: '林老师', createdAt: '2026-09-28 11:00:00' }
]

try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'hours-history-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    let visibleRecords = records
    let studentStatus = 'active'
    let studentReads = 0
    let recordReads = 0
    let delayS1Records = false
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/students')) {
        studentReads++
        if (studentReads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '学生资料暂不可用' }) })
        payload = [
          { id: 's1', name: '安安', status: studentStatus, enrollmentStage: 'enrolled', totalHours: 10, usedHours: 2 },
          { id: 's2', name: '乐乐', status: 'active', enrollmentStage: 'enrolled', totalHours: 6, usedHours: 1 }
        ]
      }
      if (url.pathname.endsWith('/hour-records')) {
        recordReads++
        if (recordReads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '流水暂不可用' }) })
        if (delayS1Records && url.searchParams.get('studentId') === 's1') await new Promise(resolve => setTimeout(resolve, 350))
        payload = { data: url.searchParams.get('studentId') === 's2'
          ? [{ id: 's2-add', type: 'add', hours: 2, remark: '乐乐续费', operator: '管理员', createdAt: '2026-09-29 10:00:00' }]
          : visibleRecords, hasMore: false }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/hours-history?studentId=s1', { waitUntil: 'domcontentloaded' })
      await page.getByText('课时历史加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.getByText('该学生暂无课时记录').count()) throw new Error(`${width}px 学生资料失败被误报为空流水`)
      await page.getByRole('button', { name: '重试' }).click()
      await page.getByText('课时历史加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.getByText('该学生暂无课时记录').count()) throw new Error(`${width}px 流水失败被误报为空流水`)
      await page.getByRole('button', { name: '重试' }).click()
      const rows = page.locator(width < 600 ? '.history-mobile-card' : '.table-container tbody tr')
      await rows.first().waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      if (await rows.count() !== 4) throw new Error(`${width}px 流水未显示四种类型`)
      const stats = await page.locator('.stat-item').allTextContents()
      for (const expected of ['总课时10', '已用课时2', '剩余课时8', '累计添加+4.5', '累计减少-0.5', '累计扣除-1.5', '累计还原+1.5']) {
        if (!stats.some(value => value.replace(/\s/g, '') === expected)) throw new Error(`${width}px 统计错误：${expected}`)
      }
      const restore = rows.filter({ hasText: '撤销点名还原' })
      if (!await restore.getByText('+1.5').isVisible() || !await restore.getByText('林老师').isVisible()) throw new Error(`${width}px 点名还原流水内容错误`)
      if (width < 600) {
        if (!await page.locator('.history-table').isHidden()) throw new Error(`${width}px 手机仍显示宽表格`)
        const labels = await restore.locator('dt').allTextContents()
        if (labels.join(',') !== '日期,类型,课时,备注,操作人') throw new Error(`${width}px 手机流水字段缺失`)
        if (await restore.evaluate(card => card.scrollWidth > card.clientWidth + 2)) throw new Error(`${width}px 手机流水卡需要横向滚动`)
      } else if (width === 768) {
        const layout = await page.locator('.history-table').evaluate(table => ({
          tableWidth: table.getBoundingClientRect().width,
          containerWidth: table.parentElement.getBoundingClientRect().width,
          scrolls: table.scrollWidth > table.clientWidth + 2
        }))
        if (layout.scrolls || layout.tableWidth < layout.containerWidth - 2) throw new Error(`iPad 课时表未用满可用宽度：${JSON.stringify(layout)}`)
      }
      await page.locator('.filter-bar .n-select').click()
      await page.locator('.n-base-select-option').filter({ hasText: '还原' }).click()
      if (await rows.count() !== 1 || !await rows.first().getByText('撤销点名还原').isVisible()) throw new Error(`${width}px 类型筛选错误`)

      visibleRecords = records.slice(0, 1)
      studentStatus = 'deleted'
      await page.reload({ waitUntil: 'domcontentloaded' })
      await rows.first().waitFor({ state: 'visible' })
      await page.getByRole('heading', { name: '安安 - 课时记录' }).waitFor({ state: 'visible' })
      await page.locator('.filter-bar .n-select').click()
      await page.locator('.n-base-select-option').filter({ hasText: '扣除' }).click()
      await page.getByText('该类型暂无课时记录').waitFor({ state: 'visible' })
      studentStatus = 'active'
      await page.getByRole('button', { name: '返回学生列表' }).click()
      await page.waitForURL('**/students')
      const [historyTab] = await Promise.all([
        context.waitForEvent('page'),
        page.locator('.table tbody tr:visible, .mobile-card:visible').filter({ hasText: '安安' }).getByRole('button', { name: '历史' }).click()
      ])
      await historyTab.waitForURL('**/hours-history?studentId=s1')
      await historyTab.getByRole('heading', { name: '安安 - 课时记录' }).waitFor({ state: 'visible' })
      await historyTab.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/hours-history?studentId=s2'))
      await historyTab.getByRole('heading', { name: '乐乐 - 课时记录' }).waitFor({ state: 'visible' })
      const visibleHistoryRows = historyTab.locator('.history-table tbody tr:visible, .history-mobile-card:visible')
      await visibleHistoryRows.filter({ hasText: '乐乐续费' }).waitFor({ state: 'visible' })
      delayS1Records = true
      const slowRequest = historyTab.waitForRequest(request => request.url().includes('/hour-records?studentId=s1'))
      await historyTab.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/hours-history?studentId=s1'))
      await slowRequest
      await historyTab.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/hours-history?studentId=s2'))
      await visibleHistoryRows.filter({ hasText: '乐乐续费' }).waitFor({ state: 'visible' })
      await historyTab.waitForTimeout(450)
      if (!await historyTab.getByRole('heading', { name: '乐乐 - 课时记录' }).isVisible()) throw new Error(`${width}px 慢请求覆盖了切换后的学生`)
      if (await historyTab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px 脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('课时历史 PC/iPad 与 390/320px 手机：五字段、四类流水、余额、筛选与空状态通过')
} finally {
  await browser.close()
}
