import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(currentRole => {
      localStorage.setItem('access_token', 'teacher-stats-test')
      localStorage.setItem('user', JSON.stringify({
        id: currentRole === 'teacher' ? 'u2' : 'u1', role: currentRole,
        teacherId: currentRole === 'teacher' ? 't1' : null,
        displayName: currentRole === 'teacher' ? '林老师' : '测试管理员'
      }))
    }, role)
    let fail = true
    const requests = []
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      const endpoint = url.pathname.split('/').at(-1)
      let status = 200
      let payload = []
      if (['teachers', 'overall', 'weekday-distribution'].includes(endpoint) && url.pathname.includes('/stats/')) {
        requests.push({ endpoint, start: url.searchParams.get('start'), end: url.searchParams.get('end'), scope: url.searchParams.get('scope') })
        const mine = url.searchParams.get('scope') === 'mine'
        const historical = url.searchParams.get('start') === '2026-08-01'
        if (fail) { status = 500; payload = { error: '网络临时故障' } }
        else if (endpoint === 'teachers') payload = [
          { id: 't1', name: '林老师', subject: '语文', courseCount: 2, studentCount: 3, attendanceCount: 2, consumedHours: 3 },
          ...mine ? [] : [{ id: 't2', name: '陈老师', subject: '数学', courseCount: 1, studentCount: 2, attendanceCount: 1, consumedHours: 1.5 }],
          ...historical && !mine ? [{ id: 't3', name: '历史教师', subject: '音乐', status: 'deleted', courseCount: 0, studentCount: 0, attendanceCount: 1, consumedHours: 1 }] : []
        ]
        else if (endpoint === 'overall') payload = { activeTeachers: mine ? 1 : historical ? 3 : 2, totalTeachers: mine ? 1 : historical ? 3 : 2, totalAttendance: mine ? 2 : historical ? 4 : 3, totalConsumedHours: mine ? 3 : historical ? 5.5 : 4.5 }
        else payload = mine ? [0, 1, 0, 0, 0, 0, 0] : [0, 2, 0, 0, 0, 0, 0]
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      await page.clock.install({ time: new Date('2026-09-28T12:00:00+08:00') })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/teacher-stats', { waitUntil: 'domcontentloaded' })
      await page.getByText('统计加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.locator('.stats-grid').count()) throw new Error(`${width}px ${role} 请求失败误显示零统计`)
      fail = false
      await page.getByRole('button', { name: '重试' }).click()
      const rows = page.locator('.table-container tbody tr')
      await rows.first().waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      if (await rows.count() !== 2 || !await rows.first().getByText('林老师').isVisible()) throw new Error(`${width}px ${role} 教师明细错误`)
      const summary = await page.locator('.stats-grid .stat-value').allTextContents()
      if (summary.map(text => text.trim()).join(',') !== '2 / 2,3,4.5') throw new Error(`${width}px ${role} 汇总错误：${summary}`)
      const tuesday = page.locator('.bar-item').nth(1)
      if (!await tuesday.getByText('2 课次').isVisible()) throw new Error(`${width}px ${role} 星期分布错误`)
      if (role === 'teacher') {
        await page.getByRole('button', { name: '我的统计' }).click()
        await page.getByText('1 课次').waitFor({ state: 'visible' })
        if (await rows.count() !== 1 || !await rows.first().getByText('林老师').isVisible()) throw new Error(`${width}px 我的统计未按教师过滤`)
        if (!requests.slice(-3).every(request => request.scope === 'mine')) throw new Error(`${width}px 我的范围未送达三个统计接口`)
      } else if (await page.getByRole('button', { name: '我的统计' }).count()) throw new Error(`${width}px 管理员出现无效的我的统计入口`)

      await page.getByRole('button', { name: '自定义' }).click()
      const dates = page.locator('.custom-range input[type="date"]')
      await dates.nth(0).fill('2026-09-20')
      await dates.nth(1).fill('2026-09-10')
      const beforeInvalid = requests.length
      await page.getByRole('button', { name: '应用' }).click()
      if (requests.length !== beforeInvalid) throw new Error(`${width}px ${role} 反向日期仍发出查询`)
      await dates.nth(0).fill('2026-08-01')
      await dates.nth(1).fill('2026-08-15')
      await page.getByRole('button', { name: '应用' }).click()
      await page.getByText('2026-08-01 至 2026-08-15').waitFor({ state: 'visible' })
      await page.waitForFunction(() => ['3 / 3', '1 / 1'].includes(document.querySelector('.stats-grid .stat-value')?.textContent?.trim()))
      if (role === 'admin' && (!await rows.filter({ hasText: '历史教师' }).getByText('已停用').isVisible() || await rows.count() !== 3)) throw new Error(`${width}px 历史教师未在明细中标注停用`)
      if (!requests.slice(-3).every(request => request.start === '2026-08-01' && request.end === '2026-08-15' && request.scope === (role === 'teacher' ? 'mine' : 'all'))) throw new Error(`${width}px ${role} 自定义日期或范围未传至三个接口`)
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px ${role} 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px ${role} 脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('教师统计三端两角色：范围、三接口参数、汇总、明细、图表和自定义日期通过')
} finally {
  await browser.close()
}
