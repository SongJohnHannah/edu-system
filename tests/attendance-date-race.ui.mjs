import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const cases = [
  { oldDate: '2026-10-01', newDate: '2026-10-02', oldName: '旧日期课程甲', newName: '新日期课程甲', oldStatus: 200 },
  { oldDate: '2026-10-03', newDate: '2026-10-04', oldName: '旧日期课程乙', newName: '新日期课程乙', oldStatus: 500 }
]

try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'attendance-race-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const gates = new Map(cases.map(({ oldDate }) => {
      let release
      const waiting = new Promise(resolve => { release = resolve })
      return [oldDate, { waiting, release }]
    }))
    let validationHeld = false
    let releaseValidation
    const validationWaiting = new Promise(resolve => { releaseValidation = resolve })
    const allCourses = cases.flatMap(({ oldDate, newDate, oldName, newName }, index) => [
      { id: `old-${index}`, name: oldName, teacherId: 't1', studentIds: ['s1'], hoursPerClass: 1, archivedAt: null, date: oldDate },
      { id: `new-${index}`, name: newName, teacherId: 't1', studentIds: ['s1'], hoursPerClass: 1, archivedAt: null, date: newDate }
    ])
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      let status = 200
      if (url.pathname.endsWith('/courses')) payload = allCourses
      else if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '学生甲', status: 'active', totalHours: 10, usedHours: 0 }]
      else if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师' }]
      else if (url.pathname.endsWith('/attendance')) {
        if (validationHeld && url.searchParams.get('courseId') === 'new-1') {
          validationHeld = false
          await validationWaiting
        }
        payload = { data: [], hasMore: false }
      }
      else if (url.pathname.endsWith('/courses/occurrences')) {
        const date = url.searchParams.get('start')
        const held = gates.get(date)
        if (held) await held.waiting
        const spec = cases.find(item => item.oldDate === date)
        if (spec?.oldStatus === 500) { status = 500; payload = { error: '旧日期故障' } }
        else payload = allCourses.filter(course => course.date === date).map(course => ({
          id: `${course.id}:${date}`, courseId: course.id, originalDate: date, date,
          name: course.name, teacherId: course.teacherId, studentIds: course.studentIds,
          hoursPerClass: course.hoursPerClass
        }))
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      await page.clock.install({ time: new Date('2026-09-28T12:00:00+08:00') })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
      const picker = page.getByLabel('点名日期')
      await picker.waitFor({ state: 'visible' })
      for (const { oldDate, newDate, oldName, newName } of cases) {
        const oldRequest = page.waitForRequest(request => request.url().includes(`/courses/occurrences?start=${oldDate}`))
        await picker.fill(oldDate)
        await picker.press('Enter')
        await oldRequest
        await page.getByText('正在加载所选日期的课程…').waitFor({ state: 'visible' })
        if (await page.locator('.select-course .search-select').count()) throw new Error(`${width}px: 加载中仍可选择旧日期课程`)
        await picker.fill(newDate)
        await picker.press('Enter')
        await page.locator('.select-course .search-select').waitFor({ state: 'visible' })
        await page.locator('.select-course .search-select').click()
        await page.locator('.n-base-select-option').filter({ hasText: newName }).click()
        await page.locator('.attendance-form').getByRole('heading', { name: newName }).waitFor({ state: 'visible' })
        const oldResponse = page.waitForResponse(response => response.url().includes(`/courses/occurrences?start=${oldDate}`))
        gates.get(oldDate).release()
        await oldResponse
        await page.waitForTimeout(100)
        if (!await page.locator('.attendance-form').getByRole('heading', { name: newName }).isVisible()) throw new Error(`${width}px: 过期请求覆盖了新日期课程`)
        if (await page.getByText('点名数据加载失败，请重试').count()) throw new Error(`${width}px: 过期错误覆盖了新日期`)
        if (await page.getByText('旧日期故障').count()) throw new Error(`${width}px: 过期错误仍弹出提示`)
        if (await page.locator('.n-base-select-option').filter({ hasText: oldName }).count()) throw new Error(`${width}px: 旧日期课程选项残留`)
      }
      validationHeld = true
      const validationRequest = page.waitForRequest(request => request.url().includes('/attendance?') && request.url().includes('courseId=new-1'))
      await page.locator('.attendance-form').getByRole('button', { name: /确认点名/ }).click()
      await validationRequest
      await picker.fill('2026-10-02')
      await picker.press('Enter')
      await page.locator('.select-course .search-select').waitFor({ state: 'visible' })
      await page.locator('.select-course .search-select').click()
      await page.locator('.n-base-select-option').filter({ hasText: '新日期课程甲' }).click()
      const validationResponse = page.waitForResponse(response => response.url().includes('/attendance?') && response.url().includes('courseId=new-1'))
      releaseValidation()
      await validationResponse
      await page.waitForTimeout(100)
      if (await page.getByRole('heading', { name: '确认点名' }).count()) throw new Error(`${width}px: 旧课次检查返回后误打开确认框`)
      if (!await page.locator('.attendance-form').getByRole('heading', { name: '新日期课程甲' }).isVisible()) throw new Error(`${width}px: 新日期课程被旧检查覆盖`)
      if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、手机：快速切换点名日期时，过期成功/失败响应均不能覆盖最新课程')
} finally {
  await browser.close()
}
