import { chromium } from '@playwright/test'

const sourceDate = '2026-10-03'
const targetDate = '2026-10-06'
const nextSaturday = '2026-10-10'
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390, 320]) {
    for (const scope of ['once', 'future']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'weekly-day-test-only')
        localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '管理员' }))
      })
      const makeCourse = (id, date, teacherId, startTime, endTime) => ({
        id: `${id}:${date}`, courseId: id, originalDate: date, date, name: `课程${id}`,
        teacherId, teacherName: teacherId === 't1' ? '林老师' : '陈老师', startTime, endTime,
        studentIds: [teacherId === 't1' ? 's1' : 's2'], trialCount: 0, hoursPerClass: 1
      })
      let rows = [
        makeCourse('a', sourceDate, 't1', '09:00', '10:00'),
        makeCourse('b', sourceDate, 't2', '11:00', '12:00'),
        makeCourse('a', nextSaturday, 't1', '09:00', '10:00'),
        makeCourse('b', nextSaturday, 't2', '11:00', '12:00')
      ]
      const posts = []
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
        let payload = []
        if (pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }, { id: 't2', name: '陈老师', status: 'active' }]
        if (pathname.endsWith('/students')) payload = [{ id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled' }, { id: 's2', name: '学生乙', status: 'active', enrollmentStage: 'enrolled' }]
        if (pathname.endsWith('/courses/occurrences')) payload = rows
        if (pathname.endsWith('/courses/reschedule-day') && request.method() === 'POST') {
          posts.push(request.postDataJSON())
          if (posts.length === 1 && scope === 'once') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '课程b：与已有课程冲突' }) })
          rows = rows.filter(row => row.date !== sourceDate && (scope !== 'future' || row.date !== nextSaturday))
          rows.push(makeCourse('a', targetDate, 't1', '09:00', '10:00'), makeCourse('b', targetDate, 't2', '11:00', '12:00'))
          payload = { count: 2 }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-09-28T08:00:00+08:00') })
      await page.goto('http://127.0.0.1:4174/weekly-schedule')
      if (width >= 600 && scope === 'once') {
        const handle = page.getByRole('button', { name: `拖动或点击整体调整 ${sourceDate} 的课程` })
        await handle.waitFor({ state: 'visible' })
        const from = await handle.boundingBox()
        const to = await page.locator(`.combined-grid .day-lane[data-date="${targetDate}"]`).boundingBox()
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
        await page.mouse.down()
        await page.mouse.move(to.x + to.width / 2, to.y + 150)
        await page.mouse.up()
      } else {
        const buttonName = width >= 600 ? `拖动或点击整体调整 ${sourceDate} 的课程` : `整体调整 ${sourceDate} 的课程`
        await page.getByRole('button', { name: buttonName }).click()
      }
      const modal = page.locator('.move-modal').filter({ hasText: '整天调课确认' })
      await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(async () => {
        throw new Error(`${width}px ${scope}: 整天调课弹窗未打开；当前弹窗：${JSON.stringify(await page.locator('.move-modal').allTextContents())}`)
      })
      if (!await modal.getByText('2 节正式课程').isVisible()) throw new Error(`${width}px ${scope}: 批量预览数量错误`)
      await modal.locator('.office-date-picker input').fill(targetDate)
      await modal.locator('.office-date-picker input').press('Enter')
      const confirm = modal.getByRole('button', { name: '确认整体调课' })
      if (await confirm.isEnabled()) throw new Error(`${width}px ${scope}: 未选择调课范围却可提交`)
      await modal.getByText(scope === 'future' ? '从这次起，每周改到目标星期' : '仅这一次，后续仍按原星期上课').click()
      const expectedExplanation = scope === 'once' ? '下一个原星期照常上课' : '原星期不再上课'
      if (!await modal.getByText(expectedExplanation, { exact: false }).isVisible()) throw new Error(`${width}px ${scope}: 调课范围解释不清楚`)
      const explanation = await modal.locator('.move-note').first().textContent()
      if (!explanation.includes(nextSaturday) || !explanation.includes('2026-10-17') || (scope === 'future' && !explanation.includes('2026-10-13'))) throw new Error(`${width}px ${scope}: 未预览后续课次的准确日期`)
      if (posts.length) throw new Error(`${width}px ${scope}: 确认前已提交`)
      await modal.getByRole('button', { name: '确认整体调课' }).click()
      if (scope === 'once') {
        await page.getByText('课程b：与已有课程冲突').waitFor({ state: 'visible' })
        if (!await modal.isVisible()) throw new Error(`${width}px: 冲突后弹窗意外关闭`)
        await modal.getByRole('button', { name: '确认整体调课' }).click()
      }
      await modal.waitFor({ state: 'hidden' })
      if (posts.length !== (scope === 'once' ? 2 : 1) || posts.at(-1).scope !== scope || posts.at(-1).sourceDate !== sourceDate || posts.at(-1).targetDate !== targetDate) throw new Error(`${width}px ${scope}: 批量请求错误`)
      if (width >= 600) {
        if (await page.locator(`.combined-grid .day-lane[data-date="${sourceDate}"] .course-bar`).count()) throw new Error(`${width}px ${scope}: 原日期仍有课程`)
        if (await page.locator(`.combined-grid .day-lane[data-date="${targetDate}"] .course-bar`).count() !== 2) throw new Error('PC 目标日期未显示两节课')
        const nextCount = await page.locator(`.combined-grid .day-lane[data-date="${nextSaturday}"] .course-bar`).count()
        if (nextCount !== (scope === 'once' ? 2 : 0)) throw new Error(`${width}px ${scope}: 下周六课程与调课范围不符`)
      } else {
        const calendar = page.locator('.mobile-two-weeks')
        if (await calendar.getByText('课程a', { exact: true }).count() < 1 || await calendar.getByText('课程b', { exact: true }).count() < 1) throw new Error(`${width}px ${scope}: 调课后课程未显示`)
      }
      if (errors.length) throw new Error(`${width}px ${scope}: ${errors.join('; ')}`)
      await context.close()
    }
  }
  console.log('bulk day move drag/click, preview, conflict retry, once/future requests passed: PC, iPad, phone')
} finally {
  await browser.close()
}
