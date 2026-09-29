import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 1024, height: 768 },
  { name: '手机', width: 390, height: 844 },
  { name: '窄屏手机', width: 320, height: 700 }
]

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-create-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    const created = []
    let failWeekAfterCreate = false
    let teachers = [{ id: 't1', name: '林老师', status: 'active' }]
    let students = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = teachers
      if (url.pathname.endsWith('/students')) payload = students
      if (url.pathname.endsWith('/courses/occurrences') && failWeekAfterCreate) {
        failWeekAfterCreate = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '写入后课表读取失败' }) })
      }
      if (url.pathname.endsWith('/courses') && request.method() === 'POST') {
        created.push(request.postDataJSON())
        payload = { id: 'new-course' }
        failWeekAfterCreate = true
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      await page.clock.install({ time: new Date('2026-09-29T08:00:00+08:00') })
      await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
      const compact = size.width < 600
      if (!compact) {
        await page.getByRole('button', { name: '上两周' }).click()
        await page.getByRole('button', { name: '下两周' }).click()
        await page.locator('.combined-week-head > span').first().getByRole('button', { name: '在本周创建课程' }).click()
      } else {
        await page.getByRole('button', { name: '在 2026-09-29 创建课程' }).click()
      }
      const currentModal = page.locator('.detail-modal').filter({ hasText: '开始排课' })
      await currentModal.waitFor({ state: 'visible' })
      if (!(await currentModal.locator('.create-form .n-select').nth(2).textContent()).includes('星期二')) {
        throw new Error(`${size.name} 当前周建课默认到了已过去的星期`)
      }
      await currentModal.getByRole('button', { name: '取消' }).click()
      const second = page.locator(compact ? '.mobile-week-block' : '.combined-week-head > span').nth(1)
      await second.waitFor({ state: 'visible' })
      const secondStart = (await (compact ? second.locator('.mobile-week-head strong') : second).textContent()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
      if (!secondStart) throw new Error(`${size.name} 未显示第二周开始日期`)
      await second.locator(compact ? '.mobile-day-head button' : 'button').first().click()
      const modal = page.locator('.detail-modal').filter({ hasText: '开始排课' })
      await modal.waitFor({ state: 'visible' })
      await modal.locator('.create-form input[type="text"]').first().fill('第二周阅读课')
      await modal.locator('.create-form .n-select').last().click()
      await page.locator('.n-base-select-option').filter({ hasText: '安安' }).click()
      await modal.getByRole('button', { name: '创建课程' }).click()
      await page.locator('.toast.warning').getByText('课程已创建，课表刷新失败，请重试').waitFor({ state: 'visible' })
      await page.getByText('周排课加载失败，请重试').waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden' })
      if (created.length !== 1 || created[0].effectiveStartDate !== secondStart || created[0].studentIds?.[0] !== 's1') {
        throw new Error(`${size.name} 第二周课程提交内容错误：${JSON.stringify(created)}`)
      }
      await page.getByRole('button', { name: '重试' }).click()
      students = [{ ...students[0], enrollmentStage: 'pending' }]
      await page.reload()
      await page.getByText('创建课程前，请先录入已报名且在读的学生。').waitFor({ state: 'visible' })
      if (await page.locator('.head-actions').getByRole('button', { name: '创建课程' }).isEnabled()) throw new Error(`${size.name} 只有待报名学生仍可从页头创建课程`)
      const firstDayCreate = page.locator(compact ? '.mobile-day-head button[aria-label*="创建课程"]' : '.combined-week-head button').first()
      if (await firstDayCreate.isEnabled()) throw new Error(`${size.name} 只有待报名学生仍可从课表创建课程`)
      if (compact) {
        const disabledStyle = await firstDayCreate.evaluate(element => ({ opacity: getComputedStyle(element).opacity, cursor: getComputedStyle(element).cursor }))
        if (Number(disabledStyle.opacity) > 0.7 || disabledStyle.cursor !== 'not-allowed') throw new Error('手机禁用的逐日建课入口缺少明确视觉状态')
      }
      students = [{ ...students[0], enrollmentStage: 'enrolled' }]
      teachers = [{ ...teachers[0], status: 'deleted' }]
      await page.reload()
      await page.getByText('创建课程前，请先添加或恢复教师。').waitFor({ state: 'visible' })
      if (await page.locator('.head-actions').getByRole('button', { name: '创建课程' }).isEnabled() || await firstDayCreate.isEnabled()) {
        throw new Error(`${size.name} 教师已停用仍可创建课程`)
      }
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、390/320px 手机：当前周与第二周建课日期正确，缺少合格教师或学生时入口及手机禁用视觉状态正确')
} finally {
  await browser.close()
}
