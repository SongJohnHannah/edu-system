import { chromium } from '@playwright/test'

const now = new Date()
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const previousWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
const movedOriginalDate = `${previousWeek.getFullYear()}-${String(previousWeek.getMonth() + 1).padStart(2, '0')}-${String(previousWeek.getDate()).padStart(2, '0')}`
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width !== 1440 })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'calendar-scope-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
    })
    let failedInitialMonth = false
    let initialGridStart = null
    let delayOtherMonth = false
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      const pathname = url.pathname
      let payload = []
      if (pathname.endsWith('/teachers')) payload = [
        { id: 't1', name: '林老师', status: 'active' },
        { id: 't2', name: '陈老师', status: 'active' }
      ]
      if (pathname.endsWith('/students')) payload = [
        { id: 's1', name: '学生甲', status: 'active' },
        { id: 's2', name: '学生乙', status: 'active' },
        { id: 's3', name: '学生丙', status: 'active' }
      ]
      if (pathname.endsWith('/attendance')) payload = { data: [
        { id: 'a1', date, courseId: 'c1', originalDate: date, recordedBy: null, courseName: '林老师的课程', teacherName: '林老师（点名时）', studentIds: ['s1'], studentNamesSnapshot: { s1: '学生甲' }, hoursDeducted: 1 },
        { id: 'a2', date, courseId: 'c2', originalDate: date, recordedBy: 't2', courseName: '陈老师的课程', teacherName: '陈老师（点名时）', studentIds: ['s2'], studentNamesSnapshot: { s2: '学生乙' }, hoursDeducted: 1 },
        { id: 'a3', date, courseId: 'c1', originalDate: movedOriginalDate, recordedBy: null,
          courseName: '林老师的课程', teacherName: '陈老师（交接后）', startTime: '11:00', endTime: '12:00',
          studentIds: ['s3'], studentNamesSnapshot: { s3: '学生丙' }, hoursDeducted: 1 }
      ], hasMore: false }
      if (pathname.endsWith('/courses/occurrences') && initialGridStart === null) initialGridStart = url.searchParams.get('start')
      if (pathname.endsWith('/courses/occurrences') && !failedInitialMonth) {
        failedInitialMonth = true
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '临时不可用' }) })
      }
      if (pathname.endsWith('/courses/occurrences') && delayOtherMonth && url.searchParams.get('start') !== initialGridStart) {
        await new Promise(resolve => setTimeout(resolve, 350))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: `stale:${date}`, courseId: 'stale', date, name: '过期月份课程', teacherId: 't1', teacherName: '林老师', startTime: '09:00', endTime: '10:00', studentIds: [] }
        ]) })
      }
      if (pathname.endsWith('/courses/occurrences')) payload = [
        { id: `c1:${date}`, courseId: 'c1', date, name: '林老师的课程', teacherId: 't1', teacherName: '林老师', startTime: '09:00', endTime: '10:00', studentIds: ['s1'] },
        { id: `c2:${date}`, courseId: 'c2', date, name: '陈老师的课程', teacherId: 't2', teacherName: '陈老师', startTime: '10:00', endTime: '11:00', studentIds: ['s2'] },
        { id: `c1:${movedOriginalDate}`, courseId: 'c1', originalDate: movedOriginalDate, date,
          name: '林老师的课程', teacherId: 't2', teacherName: '陈老师', startTime: '11:00', endTime: '12:00', studentIds: ['s3'] }
      ]
      if (pathname.endsWith('/trial-bookings')) payload = [
        { id: 'b1', date, status: 'active', studentName: '试听甲', teacherId: 't1', teacherName: '林老师', startTime: '13:00', endTime: '14:00' },
        { id: 'b2', date, status: 'active', studentName: '试听乙', teacherId: 't2', teacherName: '陈老师', startTime: '14:00', endTime: '15:00' }
      ]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/calendar')
    await page.locator('.calendar-page [role="alert"]').getByText('日历数据加载失败，请重试').waitFor()
    if (await page.locator('.calendar-body').count()) throw new Error(`${width}px: 加载失败仍显示旧日历`)
    await page.locator('.calendar-page [role="alert"]').getByRole('button', { name: '重试' }).click()
    const detail = page.locator('.attendance-detail')
    await detail.getByText('试听乙').waitFor()
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    if (!await detail.locator('.detail-students').getByText('学生乙').isVisible()) throw new Error(`${width}px: 全部日程缺少其他教师点名`)
    if (!await detail.getByText('林老师（点名时）').isVisible() || !await detail.getByText('陈老师（交接后）').isVisible()) {
      throw new Error(`${width}px: 日历点名详情未保留当时的授课教师姓名`)
    }
    if (!await detail.locator('.detail-students').getByText('学生丙').isVisible()) throw new Error(`${width}px: 同课程第二节课次缺少点名`)
    if (!await detail.locator('.detail-time').getByText('11:00—12:00').isVisible()) throw new Error(`${width}px: 同日第二节点名未显示时间`)
    await page.getByRole('button', { name: '我的日程' }).click()
    if (await detail.getByText('试听乙').count()) throw new Error(`${width}px: 我的日程仍显示其他教师试听`)
    if (await detail.locator('.detail-students').getByText('学生乙').count()) throw new Error(`${width}px: 我的日程仍显示其他教师点名`)
    if (await detail.locator('.detail-students').getByText('学生丙').count()) throw new Error(`${width}px: 同课程另一课次的点名被误归属本人`)
    if (await detail.getByText('陈老师（交接后）').count()) throw new Error(`${width}px: 我的日程仍显示其他教师的历史点名`)
    if (!await detail.locator('.detail-students').getByText('学生甲').isVisible()) throw new Error(`${width}px: 管理员代点名未归属授课教师`)
    if (!await detail.getByText('试听甲').isVisible()) throw new Error(`${width}px: 我的日程隐藏了本人试听`)
    if (!await detail.getByRole('link', { name: '林老师的课程' }).isVisible()) throw new Error(`${width}px: 我的日程隐藏了本人课程`)
    if (await detail.getByText('陈老师的课程').count()) throw new Error(`${width}px: 我的日程仍显示其他教师课程`)
    if (await page.getByRole('button', { name: '我的日程' }).getAttribute('aria-pressed') !== 'true') throw new Error(`${width}px: 筛选状态未标示`)
    await page.getByRole('button', { name: '全部日程' }).click()
    if (!await detail.getByText('试听乙').isVisible()) throw new Error(`${width}px: 恢复全部日程失败`)
    const month = await page.locator('.current-month').textContent()
    await page.getByRole('button', { name: '上月' }).click()
    if (await page.locator('.current-month').textContent() === month) throw new Error(`${width}px: 上月导航无效`)
    await page.getByRole('button', { name: '下月' }).click()
    await page.getByRole('button', { name: '今天', exact: true }).click()
    if (await page.locator('.current-month').textContent() !== month) throw new Error(`${width}px: 今日导航未返回本月`)
    delayOtherMonth = true
    const slowRequest = page.waitForRequest(request => {
      const url = new URL(request.url())
      return url.pathname.endsWith('/courses/occurrences') && url.searchParams.get('start') !== initialGridStart
    })
    await page.getByRole('button', { name: '下月' }).click()
    await slowRequest
    if (!await page.getByRole('button', { name: '上月' }).isDisabled()) throw new Error(`${width}px: 日历加载时仍允许再次翻月`)
    await page.getByRole('button', { name: '上月' }).click()
    await page.getByRole('button', { name: '今天', exact: true }).click()
    await detail.getByText('试听乙').waitFor({ state: 'visible' })
    await page.waitForTimeout(450)
    if (await detail.getByText('过期月份课程').count()) throw new Error(`${width}px: 慢请求覆盖了当前月份课程`)
    if (width === 1440) {
      await page.locator('.calendar-day.today').hover()
      await page.locator('.calendar-tooltip').getByText('今日课程：').waitFor({ state: 'visible' })
    } else {
      await page.locator('.calendar-day.today').tap()
      await detail.getByRole('link', { name: '林老师的课程' }).first().waitFor({ state: 'visible' })
      if (await page.locator('.calendar-tooltip').isVisible()) throw new Error(`${width}px: 触屏点按后留下遮挡详情的悬浮提示`)
    }
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    await context.close()
  }
  console.log('calendar load retry, attribution, scope, month navigation and tooltip passed: PC, iPad, phone')
} finally {
  await browser.close()
}
