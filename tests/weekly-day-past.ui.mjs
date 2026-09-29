import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const date = '2026-10-03'
const rows = [
  { id: `early:${date}`, courseId: 'early', originalDate: date, date, name: '上午课程', teacherId: 't1', teacherName: '林老师', startTime: '09:00', endTime: '10:00', studentIds: ['s1'], hoursPerClass: 1 },
  { id: `later:${date}`, courseId: 'later', originalDate: date, date, name: '下午课程', teacherId: 't1', teacherName: '林老师', startTime: '11:00', endTime: '12:00', studentIds: ['s2'], hoursPerClass: 1 }
]

try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-day-past-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '管理员' }))
    })
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
      let result = []
      if (path.endsWith('/teachers')) result = [{ id: 't1', name: '林老师', status: 'active' }]
      else if (path.endsWith('/students')) result = [
        { id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled' },
        { id: 's2', name: '学生乙', status: 'active', enrollmentStage: 'enrolled' }
      ]
      else if (path.endsWith('/courses/occurrences')) result = rows
      else if (path.endsWith('/adjustments')) result = { once: [], future: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2026-10-03T08:30:00+08:00') })
      await page.goto('http://127.0.0.1:4174/weekly-schedule')
      const dayButton = page.getByRole('button', { name: width < 600 ? `整体调整 ${date} 的课程` : `拖动或点击整体调整 ${date} 的课程` })
      await dayButton.waitFor({ state: 'visible' })
      await dayButton.click()
      const modal = page.locator('.move-modal').filter({ hasText: '整天调课确认' })
      await modal.waitFor({ state: 'visible' })
      await modal.locator('.office-date-picker input').fill('2026-10-06')
      await modal.locator('.office-date-picker input').press('Enter')
      await modal.getByText('仅这一次，后续仍按原星期上课').click()
      const confirm = modal.getByRole('button', { name: '确认整体调课' })
      assert.equal(await confirm.isEnabled(), true, `${width}px 课前整天调课不可确认`)
      await page.clock.fastForward(2 * 60 * 60 * 1000)
      await modal.getByText('本日有课程已开始，不能整天调课').waitFor({ state: 'visible' })
      assert.equal(await confirm.isDisabled(), true, `${width}px 课程开始后仍可确认整天调课`)
      assert.equal(await dayButton.count(), 0, `${width}px 课程开始后仍显示整天调课入口`)
      assert.deepEqual(writes, [], `${width}px 课程开始后提交了调课`)
      await modal.getByRole('button', { name: '返回' }).click()
      const cards = page.locator(width < 600 ? '.mobile-two-weeks .agenda-card' : '.combined-board .course-bar')
      await cards.filter({ hasText: '上午课程' }).click()
      await page.locator('.detail-modal').waitFor({ state: 'visible' })
      assert.equal(await page.locator('.detail-modal').getByRole('button', { name: '修改日期与时间' }).count(), 0, `${width}px 已开始课程仍可调课`)
      await page.keyboard.press('Escape')
      await cards.filter({ hasText: '下午课程' }).click()
      await page.locator('.detail-modal').getByRole('button', { name: '修改日期与时间' }).waitFor({ state: 'visible' })

      const singlePage = await context.newPage()
      singlePage.on('pageerror', error => errors.push(error.message))
      await singlePage.clock.install({ time: new Date('2026-10-03T08:30:00+08:00') })
      await singlePage.goto('http://127.0.0.1:4174/weekly-schedule')
      const earlyCard = singlePage.locator(width < 600 ? '.mobile-two-weeks .agenda-card' : '.combined-board .course-bar').filter({ hasText: '上午课程' })
      await earlyCard.click()
      await singlePage.locator('.detail-modal').getByRole('button', { name: '修改日期与时间' }).click()
      const singleModal = singlePage.locator('.move-modal').filter({ hasText: '确认调课' })
      await singleModal.locator('.office-date-picker input').fill('2026-10-06')
      await singleModal.locator('.office-date-picker input').press('Enter')
      await singleModal.getByText('仅这一次，之后仍按原星期上课').click()
      const singleConfirm = singleModal.getByRole('button', { name: '确认调课' })
      assert.equal(await singleConfirm.isEnabled(), true, `${width}px 课前单节调课不可确认`)
      await singlePage.clock.fastForward(31 * 60 * 1000)
      await singleModal.getByText('这节课已开始，不能再调课').waitFor({ state: 'visible' })
      assert.equal(await singleConfirm.isDisabled(), true, `${width}px 课程开始后仍可确认单节调课`)
      assert.deepEqual(writes, [], `${width}px 已开始课程产生调课写请求`)
      assert.deepEqual(errors, [], `${width}px 页面脚本错误`)
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、手机：课次开始后整天入口及已打开的单节／整天确认框失效，后续单节课仍可编辑')
} finally {
  await browser.close()
}
