import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'course-hours-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    let courses = [{ id: 'c1', name: '阅读课', teacherId: 't1', weekday: 1, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, classroom: '', studentIds: ['s1'] }]
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname.replace('/edusystem/api', '')
      let payload = []
      if (pathname === '/courses' && request.method() === 'GET') payload = courses
      else if (pathname === '/courses/c1' && request.method() === 'PUT') {
        const body = request.postDataJSON()
        writes.push({ method: 'PUT', body })
        courses = courses.map(c => c.id === 'c1' ? { ...c, ...body } : c)
        payload = courses[0]
      } else if (pathname === '/courses' && request.method() === 'POST') {
        const body = request.postDataJSON()
        writes.push({ method: 'POST', body })
        courses = [...courses, { ...body, id: 'c2' }]
        payload = courses[1]
      } else if (pathname === '/teachers') payload = [{ id: 't1', name: '林老师', status: 'active' }]
      else if (pathname === '/students') payload = [{ id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled' }]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/courses')
    await page.locator('.course-card').first().waitFor()

    await page.locator('.course-card').first().getByRole('button', { name: '编辑' }).click()
    let modal = page.locator('.modal').filter({ hasText: '编辑课程' })
    if (await modal.getByPlaceholder('如：三年级数学提高班').getAttribute('maxlength') !== '200' ||
        await modal.getByPlaceholder('如：A101').getAttribute('maxlength') !== '100') {
      throw new Error(`${width}px: 课程字段输入边界与数据库不一致`)
    }
    await modal.locator('.hours-amount input').fill('0.3')
    await modal.getByRole('button', { name: '保存' }).click()
    await page.getByText('每次课时须为 0.5 至 999.5 的半课时倍数').waitFor()
    if (writes.length) throw new Error(`${width}px: 编辑课程时非法课时仍提交了请求`)
    await modal.locator('.hours-amount input').fill('1000')
    await modal.getByRole('button', { name: '保存' }).click()
    if (writes.length) throw new Error(`${width}px: 超出数据库范围的课时仍提交了请求`)
    await modal.locator('.hours-amount input').fill('1.5')
    await modal.getByRole('button', { name: '保存' }).click()
    await page.locator('.course-card').first().getByText('1.5 课时').waitFor()
    if (writes.length !== 1 || writes[0].method !== 'PUT' || writes[0].body.hoursPerClass !== 1.5) throw new Error(`${width}px: 编辑课程课时提交错误`)

    for (const close of await page.locator('.toast .toast-close').all()) await close.click()
    await page.getByRole('button', { name: '创建课程' }).click()
    modal = page.locator('.modal').filter({ hasText: '创建课程' })
    await modal.getByPlaceholder('如：三年级数学提高班').fill('书法课')
    await modal.getByRole('button', { name: '学生甲' }).click()
    await modal.locator('.hours-amount input').fill('0.3')
    await modal.getByRole('button', { name: '保存' }).click()
    if (writes.length !== 1) throw new Error(`${width}px: 新建课程时非法课时仍提交了请求`)
    await modal.locator('.hours-amount input').fill('2.5')
    await modal.getByRole('button', { name: '保存' }).click()
    await page.getByText('书法课').waitFor()
    if (writes.length !== 2 || writes[1].method !== 'POST' || writes[1].body.hoursPerClass !== 2.5) throw new Error(`${width}px: 新建课程课时提交错误`)
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    await context.close()
  }
  console.log('course hours reject invalid values and preserve valid values: PC, iPad, phone')
} finally {
  await browser.close()
}
