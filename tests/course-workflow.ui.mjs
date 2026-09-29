import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'course-workflow-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
    })
    let courses = [
      { id: 'c1', name: '阅读课', teacherId: 't1', weekday: 1, startTime: '09:00', endTime: '10:00', hoursPerClass: 1, studentIds: ['s1'] },
      { id: 'c2', name: '数学课', teacherId: 't2', weekday: 2, startTime: '10:00', endTime: '11:00', hoursPerClass: 1, studentIds: ['s2'] }
    ]
    let students = [
      { id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled', creatorId: 't1' },
      { id: 's2', name: '学生乙', status: 'active', enrollmentStage: 'enrolled', creatorId: 't2' },
      { id: 's3', name: '待报名学生', status: 'active', enrollmentStage: 'pending', creatorId: 't2' }
    ]
    let teachers = [{ id: 't1', name: '林老师', status: 'active' }, { id: 't2', name: '陈老师', status: 'active' }]
    const writes = []
    let failedInitialLoad = false
    let failPostwriteRead = false
    let holdCourseRead = false
    let releaseCourseRead
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname.replace('/edusystem/api', '')
      const method = request.method()
      let payload = []
      if (pathname === '/courses' && method === 'GET' && !failedInitialLoad) {
        failedInitialLoad = true
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '临时不可用' }) })
      }
      if (pathname === '/courses' && method === 'GET' && failPostwriteRead) {
        failPostwriteRead = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '写入后列表读取失败' }) })
      }
      if (pathname === '/courses' && method === 'GET') {
        if (holdCourseRead) {
          holdCourseRead = false
          await new Promise(resolve => { releaseCourseRead = resolve })
        }
        payload = courses
      }
      else if (pathname === '/teachers') payload = teachers
      else if (pathname === '/students') payload = students
      else if (pathname === '/courses/c1' && method === 'PUT') {
        const body = request.postDataJSON()
        writes.push({ method, body })
        courses = courses.map(course => course.id === 'c1' ? { ...course, ...body } : course)
        payload = courses[0]
        failPostwriteRead = true
      } else if (pathname === '/courses/c1' && method === 'DELETE') {
        writes.push({ method })
        courses = courses.filter(course => course.id !== 'c1')
        payload = { success: true }
        failPostwriteRead = true
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/courses')
    await page.locator('.courses [role="alert"]').getByText('课程资料加载失败，请重试').waitFor()
    if (await page.getByText('暂无课程安排').count()) throw new Error(`${width}px: 加载失败误报为空课表`)
    if (await page.getByRole('button', { name: '创建课程' }).isEnabled()) throw new Error(`${width}px: 资料加载失败仍允许创建课程`)
    await page.locator('.courses [role="alert"]').getByRole('button', { name: '重试' }).click()
    await page.locator('.course-card').first().waitFor()
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })

    await page.locator('.search-row .search-select').click()
    await page.getByText('学生名称', { exact: true }).last().click()
    await page.getByPlaceholder('搜索学生名称...').fill('学生乙')
    if (await page.locator('.course-card').count() !== 1 || !await page.getByText('数学课').isVisible()) throw new Error(`${width}px: 学生搜索结果错误`)
    await page.getByPlaceholder('搜索学生名称...').fill('')
    await page.locator('.search-row .search-select').click()
    await page.getByText('教师名称', { exact: true }).last().click()
    await page.getByPlaceholder('搜索教师名称...').fill('林老师')
    if (await page.locator('.course-card').count() !== 1 || !await page.getByText('阅读课').isVisible()) throw new Error(`${width}px: 教师搜索结果错误`)
    await page.getByPlaceholder('搜索教师名称...').fill('')

    const ownCard = page.locator('.course-card').filter({ hasText: '阅读课' })
    const otherCard = page.locator('.course-card').filter({ hasText: '数学课' })
    if (await otherCard.getByRole('button', { name: '编辑' }).count()) throw new Error(`${width}px: 其他教师的课程出现编辑入口`)
    await ownCard.getByRole('button', { name: '编辑' }).click()
    const modal = page.locator('.modal').filter({ hasText: '编辑课程' })
    if (width === 320) {
      const box = await modal.boundingBox()
      if (!box || box.x < 0 || box.x + box.width > width ||
          await modal.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 课程编辑弹窗横向裁切')
      if (process.env.MODAL_SCREENSHOTS === '1') await page.screenshot({ path: '.qa/modal-320-course.png', animations: 'disabled' })
    }
    if (await modal.getByRole('button', { name: '待报名学生' }).count()) throw new Error(`${width}px: 待报名学生出现正式课程候选项`)
    await modal.getByRole('button', { name: '学生甲' }).click()
    await modal.getByRole('button', { name: '学生乙' }).click()
    await modal.getByRole('button', { name: '保存' }).click()
    await ownCard.getByText('学生乙').waitFor()
    if (writes.length !== 1 || writes[0].method !== 'PUT' || writes[0].body.studentIds.join(',') !== 's2') {
      throw new Error(`${width}px: 跨教师已报名学生名单未正确提交`)
    }
    failPostwriteRead = false

    await ownCard.getByRole('button', { name: '编辑' }).click()
    courses = courses.map(course => course.id === 'c1' ? { ...course, teacherId: 't2' } : course)
    await modal.getByRole('button', { name: '保存' }).click()
    await page.locator('.toast.error').getByText('该课程已移交，无法编辑').waitFor()
    if (writes.length !== 1 || await modal.isVisible() || await ownCard.getByRole('button', { name: '编辑' }).count()) {
      throw new Error(`${width}px: 打开编辑后课程已移交，仍发出旧教师的修改请求`)
    }
    courses = courses.map(course => course.id === 'c1' ? { ...course, teacherId: 't1' } : course)
    await page.reload()
    await ownCard.getByRole('button', { name: '归档' }).waitFor()

    await ownCard.getByRole('button', { name: '编辑' }).click()
    courses = courses.map(course => course.id === 'c1' ? { ...course, teacherId: 't2' } : course)
    holdCourseRead = true
    const oldRead = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/courses') && request.method() === 'GET')
    await modal.getByRole('button', { name: '保存' }).click()
    await oldRead
    await modal.getByRole('button', { name: '取消' }).click()
    await page.locator('.page-header').getByRole('button', { name: '创建课程' }).click()
    releaseCourseRead()
    await ownCard.getByText('陈老师').waitFor()
    if (!await page.getByText('创建课程', { exact: true }).isVisible() || writes.length !== 1) {
      throw new Error(`${width}px: 旧编辑请求关闭了后来打开的建课弹窗或提交越权修改`)
    }
    await page.locator('.modal').filter({ hasText: '创建课程' }).getByRole('button', { name: '取消' }).click()
    courses = courses.map(course => course.id === 'c1' ? { ...course, teacherId: 't1' } : course)
    await page.reload()
    await ownCard.getByRole('button', { name: '归档' }).waitFor()

    await ownCard.getByRole('button', { name: '归档' }).click()
    await page.getByText('归档课程', { exact: true }).waitFor()
    if (writes.length !== 1) throw new Error(`${width}px: 确认前就归档了课程`)
    await page.getByRole('button', { name: '确认归档' }).click()
    await ownCard.waitFor({ state: 'detached' })
    if (writes.length !== 2 || writes[1].method !== 'DELETE' || await otherCard.count() !== 1) throw new Error(`${width}px: 课程归档流程错误`)
    failPostwriteRead = false
    students = [students[2]]
    await page.reload()
    await page.locator('.course-card').first().waitFor()
    if (await page.locator('.page-header').getByRole('button', { name: '创建课程' }).isEnabled()) throw new Error(`${width}px: 只有待报名学生仍可创建课程`)
    await page.getByText('请先录入已报名且在读的学生').waitFor({ state: 'visible' })
    students = [{ id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled', creatorId: 't1' }]
    teachers = teachers.map(teacher => ({ ...teacher, status: 'deleted' }))
    await page.reload()
    await page.locator('.course-card').first().waitFor()
    if (await page.locator('.page-header').getByRole('button', { name: '创建课程' }).isEnabled()) throw new Error(`${width}px: 教师都已停用仍可创建课程`)
    await page.getByText('请先添加或恢复教师').waitFor({ state: 'visible' })
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    if (overflow) throw new Error(`${width}px: 页面横向溢出`)
    await context.close()
  }
  console.log('course load retry, search, roster, archive and creation prerequisites passed: PC, iPad, phone')
} finally {
  await browser.close()
}
