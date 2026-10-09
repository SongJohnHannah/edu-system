import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 1024, height: 768 },
  { name: '手机', width: 390, height: 844 },
  { name: '小屏手机', width: 320, height: 700 }
]

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'past-move-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    const moveRequests = []
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
      if (url.pathname.endsWith('/adjustments')) payload = { once: [], future: [] }
      if (url.pathname.endsWith('/courses/occurrences')) payload = [{
        id: 'c1:2026-09-29', courseId: 'c1', originalDate: '2026-09-29', date: '2026-09-29',
        name: '阅读与表达', teacherId: 't1', teacherName: '林老师', startTime: '13:00', endTime: '14:00',
        studentIds: ['s1'], trialCount: 0, hoursPerClass: 1
      }]
      if (url.pathname.endsWith('/courses/c1/reschedule')) moveRequests.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      await page.clock.install({ time: new Date('2026-09-28T20:00:00+08:00') })
      await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
      const card = page.locator(size.width < 600 ? '.agenda-card' : '.combined-board .course-bar').first()
      await card.waitFor({ state: 'visible' })
      await card.click()
      await page.getByRole('button', { name: '修改日期与时间' }).click()
      if (size.width === 320) {
        const modal = page.locator('.move-modal')
        const box = await modal.boundingBox()
        if (!box || box.x < 0 || box.x + box.width > size.width ||
            await modal.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 调课弹窗横向裁切')
        if (process.env.MODAL_SCREENSHOTS === '1') await page.screenshot({ path: '.qa/modal-320-weekly.png', animations: 'disabled' })
      }
      const targetDate = page.locator('.move-modal .office-date-picker input')
      await targetDate.fill('2026-10-06')
      await targetDate.press('Enter')
      if (await page.getByRole('button', { name: '确认调课' }).isEnabled()) throw new Error(`${size.name} 未明确选择范围就可保存`)
      await page.getByText('仅这一次，之后仍按原星期上课', { exact: true }).click()
      await page.getByRole('button', { name: '确认调课' }).click()
      await page.locator('.move-modal').waitFor({ state: 'hidden' })
      if (moveRequests.length !== 1 || moveRequests[0].targetDate !== '2026-10-06' || moveRequests[0].scope !== 'once') throw new Error(`${size.name} 跨周单次调课未提交`)
      await card.click()
      await page.getByRole('button', { name: '修改日期与时间' }).click()
      await targetDate.fill('2026-09-28')
      await targetDate.press('Enter')
      await page.getByText('仅这一次，之后仍按原星期上课', { exact: true }).click()
      await page.getByRole('button', { name: '确认调课' }).click()
      if (moveRequests.length !== 1) throw new Error(`${size.name} 向后端提交了今天已过去的时段`)
      await page.getByText('不能把课程调到过去的时段').waitFor({ state: 'visible' })
      await targetDate.fill('2026-09-30')
      await targetDate.press('Enter')
      await page.getByRole('button', { name: '确认调课' }).click()
      await page.locator('.move-modal').waitFor({ state: 'hidden' })
      if (moveRequests.length !== 2 || moveRequests[1].scope !== 'once') throw new Error(`${size.name} 单次调课未正确提交`)
      await card.click()
      await page.getByRole('button', { name: '修改日期与时间' }).click()
      await targetDate.fill('2026-10-01')
      await targetDate.press('Enter')
      await page.getByText('从这次起改为每周目标星期', { exact: true }).click()
      await page.getByRole('button', { name: '确认调课' }).click()
      await page.locator('.move-modal').waitFor({ state: 'hidden' })
      if (moveRequests.length !== 3 || moveRequests[2].scope !== 'future') throw new Error(`${size.name} 后续每周调课未正确提交`)
      await card.click()
      await page.getByRole('button', { name: '修改日期与时间' }).click()
      await page.getByText('从这次起改为每周目标星期', { exact: true }).click()
      await page.getByRole('button', { name: '确认调课' }).click()
      if (moveRequests.length !== 3) throw new Error(`${size.name} 提交了未改变日期或时间的永久调课`)
      await page.getByText('调课日期和时间未改变').waitFor({ state: 'visible' })
      await page.locator('.move-modal .move-times .n-select').first().click()
      await page.getByText('13:30', { exact: true }).last().click()
      if (!(await page.locator('.move-modal .move-note').first().textContent()).includes('每周二调整为 13:30—14:30')) throw new Error(`${size.name} 同星期调时预览不准确`)
      await page.getByRole('button', { name: '确认调课' }).click()
      await page.locator('.move-modal').waitFor({ state: 'hidden' })
      if (moveRequests.length !== 4 || moveRequests[3].targetDate !== '2026-09-29' || moveRequests[3].startTime !== '13:30' || moveRequests[3].endTime !== '14:30' || moveRequests[3].scope !== 'future') throw new Error(`${size.name} 同星期永久调时未正确提交`)
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、手机：跨周单次、过去时段拦截、永久同星期调时与无变化提交拦截通过')
} finally {
  await browser.close()
}
