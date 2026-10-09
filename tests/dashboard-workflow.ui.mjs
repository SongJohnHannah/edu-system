import { chromium } from '@playwright/test'

const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
const nextDay = new Date(`${date}T12:00:00+08:00`)
nextDay.setDate(nextDay.getDate() + 1)
const tomorrow = nextDay.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
nextDay.setDate(nextDay.getDate() + 1)
const dayAfterTomorrow = nextDay.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(currentRole => {
      localStorage.setItem('access_token', 'dashboard-test-only')
      localStorage.setItem('user', JSON.stringify({ id: currentRole === 'admin' ? 'u1' : 'u2', role: currentRole, teacherId: currentRole === 'teacher' ? 't1' : null, displayName: currentRole }))
    }, role)
    let failedInitialLoad = false
    let activeDate = date
    await context.route('**/edusystem/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      let payload = []
      if (pathname.endsWith('/students') && !failedInitialLoad) {
        failedInitialLoad = true
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '临时不可用' }) })
      }
      if (pathname.endsWith('/students')) payload = [
        { id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled', totalHours: 2, usedHours: 0 },
        { id: 's2', name: '试听学生', status: 'active', enrollmentStage: 'pending', totalHours: 0, usedHours: 0 },
        { id: 's3', name: '学生丙', status: 'active', enrollmentStage: 'enrolled', totalHours: 10, usedHours: 0 }
      ]
      if (pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师' }, { id: 't2', name: '陈老师' }]
      if (pathname.endsWith('/courses/occurrences')) payload = [
        { id: `c1:${activeDate}`, courseId: 'c1', date: activeDate, name: activeDate === date ? '阅读课' : activeDate === tomorrow ? '新一天课程' : '再下一天课程', teacherId: 't1', teacherName: '林老师', startTime: '09:00', endTime: '10:00', studentIds: ['s1', 's3'], trialCount: 1 },
        { id: `c2:${activeDate}`, courseId: 'c2', date: activeDate, name: '数学课', teacherId: 't2', teacherName: '陈老师', startTime: '11:00', endTime: '12:00', studentIds: ['s3'], trialCount: 0 }
      ]
      if (pathname.endsWith('/attendance')) payload = { data: [
        { id: 'a1', date: activeDate, courseId: 'c1', studentIds: ['s1', 's3'], hoursDeducted: 1.5 }
      ], hasMore: false }
      if (pathname.endsWith('/trial-bookings')) payload = [
        { id: 'b1', date: activeDate, status: 'active', studentName: '试听学生', teacherName: '林老师', startTime: '09:00', endTime: '10:00', courseName: '阅读课' }
      ]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      await page.clock.install({ time: new Date(`${date}T08:00:00+08:00`) })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' })
      await page.locator('.dashboard [role="alert"]').getByText('工作台数据加载失败，请重试').waitFor()
      if (await page.getByText('今天没有正式课程').count() || await page.locator('.stats-grid').count()) throw new Error(`${width}px ${role}: 加载失败误报零数据`)
      await page.locator('.dashboard [role="alert"]').getByRole('button', { name: '重试' }).click()
      await page.getByText('阅读课 · 林老师').waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      if (!await page.getByText('试听学生 · 林老师').isVisible()) throw new Error(`${width}px ${role}: 今日试听遗漏`)
      const trialLink = await page.locator('.trial-today-item').filter({ hasText: '试听学生 · 林老师' }).getAttribute('href')
      if (trialLink !== `/trial-bookings?date=${date}&booking=b1`) throw new Error(`${width}px ${role}: 今日试听不能定位预约`)
      const expected = [['今日上课学生', '2'], ['今日上课教师', '2'], ['今日课程', '2'], ['今日消耗课时', '3'], ['今日点名', '1'], ['本月点名', '1']]
      for (const [label, value] of expected) {
        const actual = (await page.locator('.stat-card').filter({ hasText: label }).locator('.stat-value').textContent()).trim()
        if (actual !== value) throw new Error(`${width}px ${role}: ${label} 应为 ${value}，实际 ${actual}`)
      }
      if (!await page.locator('.warning-list').getByText('学生甲').isVisible()) throw new Error(`${width}px ${role}: 课时预警遗漏`)
      if (await page.locator('.warning-list').getByText('试听学生').count()) throw new Error(`${width}px ${role}: 待报名学生误入课时预警`)
      const addTeacher = page.locator('.action-card').filter({ hasText: '添加教师' })
      if (role === 'admin' ? !await addTeacher.count() : await addTeacher.count()) throw new Error(`${width}px ${role}: 教师快捷入口权限错误`)
      activeDate = tomorrow
      const midnightRefresh = page.waitForRequest(request => request.url().includes('/courses/occurrences?') && request.url().includes(`start=${tomorrow}`), { timeout: 3000 })
      await page.clock.fastForward(16 * 60 * 60 * 1000 + 1000)
      await midnightRefresh
      await page.getByText('新一天课程 · 林老师').waitFor({ state: 'visible' })
      activeDate = dayAfterTomorrow
      await page.clock.setFixedTime(new Date(`${dayAfterTomorrow}T08:00:00+08:00`))
      const refreshed = page.waitForRequest(request => request.url().includes('/courses/occurrences?') && request.url().includes(`start=${dayAfterTomorrow}`), { timeout: 3000 })
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await refreshed
      await page.getByText('再下一天课程 · 林老师').waitFor({ state: 'visible' })
      if (await page.getByText('阅读课 · 林老师').count()) throw new Error(`${width}px ${role}: 跨天后仍显示昨天课程`)
      const nextLink = await page.locator('.trial-today-item').filter({ hasText: '试听学生 · 林老师' }).getAttribute('href')
      if (nextLink !== `/trial-bookings?date=${dayAfterTomorrow}&booking=b1`) throw new Error(`${width}px ${role}: 跨天后试听仍链接到昨天`)
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px ${role}: 横向溢出`)
      if (errors.length) throw new Error(`${width}px ${role}: ${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('dashboard retry, daily courses/trials, statistics, low hours and role actions passed: PC, iPad, phone')
} finally {
  await browser.close()
}
