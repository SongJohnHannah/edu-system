import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) {
    for (const role of ['admin', 'teacher']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addInitScript(role => {
        localStorage.setItem('access_token', 'course-scope-test-only')
        localStorage.setItem('user', JSON.stringify({ id: 'u1', role, teacherId: role === 'teacher' ? 't1' : null, displayName: role }))
      }, role)
      await context.route('**/edusystem/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        let payload = []
        if (pathname.endsWith('/courses')) payload = [
          { id: 'c1', name: '林老师的课程', teacherId: 't1', weekday: 1, startTime: '09:00', endTime: '10:00', studentIds: ['s1'], hoursPerClass: 1 },
          { id: 'c2', name: '陈老师的课程', teacherId: 't2', weekday: 2, startTime: '10:00', endTime: '11:00', studentIds: ['s2'], hoursPerClass: 1 }
        ]
        if (pathname.endsWith('/teachers')) payload = [
          { id: 't1', name: '林老师', status: 'active' }, { id: 't2', name: '陈老师', status: 'active' }
        ]
        if (pathname.endsWith('/students')) payload = [
          { id: 's1', name: '学生甲', status: 'active' }, { id: 's2', name: '学生乙', status: 'active' }
        ]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/courses')
      await page.locator('.course-card').first().waitFor()
      if (await page.locator('.course-card').count() !== 2) throw new Error(`${width}px ${role}: 全部课程未显示两位教师`)
      if (role === 'admin') {
        if (await page.getByRole('button', { name: '我的课程' }).count()) throw new Error(`${width}px: 管理员出现没有意义的“我的课程”`)
      } else {
        const cards = page.locator('.course-card')
        if (!await cards.nth(1).getByText('只读').isVisible()) throw new Error(`${width}px: 其他教师课程没有只读标示`)
        await page.getByRole('button', { name: '我的课程' }).click()
        if (await cards.count() !== 1 || !await cards.first().getByText('林老师的课程').isVisible()) throw new Error(`${width}px: 我的课程筛选结果错误`)
        await page.getByRole('button', { name: '全部课程' }).click()
        if (await cards.count() !== 2) throw new Error(`${width}px: 无法恢复全部课程`)
      }
      if (errors.length) throw new Error(`${width}px ${role}: ${errors.join('; ')}`)
      await context.close()
    }
  }
  console.log('course all/mine roles passed: admin and teacher on PC, iPad, phone')
} finally {
  await browser.close()
}
