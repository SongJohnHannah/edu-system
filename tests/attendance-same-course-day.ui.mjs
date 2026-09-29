import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const date = '2026-09-28'
const movedOriginal = '2026-09-21'
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'same-course-day-test')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    const students = [
      { id: 's1', name: '上午学生', status: 'active', totalHours: 10, usedHours: 0 },
      { id: 's2', name: '下午学生', status: 'active', totalHours: 10, usedHours: 0 }
    ]
    const occurrences = [
      { id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读课', teacherId: 't1', startTime: '09:00', endTime: '10:00', studentIds: ['s1'], hoursPerClass: 1 },
      { id: `c1:${movedOriginal}`, courseId: 'c1', originalDate: movedOriginal, date, name: '阅读课', teacherId: 't1', startTime: '11:00', endTime: '12:00', studentIds: ['s2'], hoursPerClass: 1 }
    ]
    let submitted
    let savedRecord
    const lookups = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      let result = []
      let status = 200
      if (url.pathname.endsWith('/students')) result = students
      else if (url.pathname.endsWith('/teachers')) result = [{ id: 't1', name: '林老师' }]
      else if (url.pathname.endsWith('/courses')) result = [{ id: 'c1', name: '阅读课', teacherId: 't1', archivedAt: null }]
      else if (url.pathname.endsWith('/courses/occurrences')) result = occurrences
      else if (url.pathname.endsWith('/attendance') && request.method() === 'GET') {
        if (url.searchParams.has('originalDate')) lookups.push(Object.fromEntries(url.searchParams))
        result = { data: savedRecord && !url.searchParams.has('originalDate') ? [savedRecord] : [], hasMore: false }
      } else if (url.pathname.endsWith('/attendance') && request.method() === 'POST') {
        submitted = request.postDataJSON()
        savedRecord = { id: 'a1', ...submitted, courseName: '阅读课', teacherName: '林老师', startTime: '11:00', endTime: '12:00',
          originalStudentIds: ['s2'], studentNamesSnapshot: { s2: '下午学生' }, hoursDeducted: 1, createdAt: `${date} 12:30:00` }
        result = savedRecord
        students[1].usedHours++
        status = 201
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      await page.clock.install({ time: new Date('2026-09-28T12:00:00+08:00') })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
      const picker = page.locator('.select-course .search-select')
      await picker.waitFor({ state: 'visible' })
      await picker.click()
      const choices = page.locator('.n-base-select-option')
      if (await choices.count() !== 2) throw new Error(`${width}px 同日两节课被合并`)
      await choices.filter({ hasText: '11:00—12:00' }).click()
      const form = page.locator('.attendance-form')
      await form.getByText('下午学生').waitFor({ state: 'visible' })
      if (await form.getByText('上午学生').count()) throw new Error(`${width}px 选择第二节却显示第一节名单`)
      if (!await form.getByText(`${date} 11:00—12:00`).isVisible()) throw new Error(`${width}px 课次时间未显示`)
      await form.getByRole('button', { name: /确认点名/ }).click()
      const confirm = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '确认点名' }) })
      await confirm.getByRole('button', { name: '确认点名' }).click()
      await page.locator('.history-item').getByText('11:00—12:00').waitFor({ state: 'visible' })
      if (lookups.length !== 1 || lookups[0].courseId !== 'c1' || lookups[0].originalDate !== movedOriginal ||
          submitted?.courseId !== 'c1' || submitted.originalDate !== movedOriginal || submitted.studentIds.join() !== 's2') {
        throw new Error(`${width}px 点名未关联第二节实际课次`)
      }
      if (errors.length) throw new Error(`${width}px 页面脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('PC、iPad、手机：同日同课程两节可区分，第二节名单与点名课次一致')
} finally {
  await browser.close()
}
