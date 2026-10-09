import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const date = '2026-09-28'
try {
  for (const width of [1440, 1024, 390, 320]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(currentRole => {
      localStorage.setItem('access_token', 'attendance-test')
      localStorage.setItem('user', JSON.stringify({
        id: currentRole === 'admin' ? 'admin-1' : 'teacher-1', role: currentRole,
        teacherId: currentRole === 'teacher' ? 't1' : null,
        displayName: currentRole === 'admin' ? '测试管理员' : '林老师'
      }))
    }, role)
    const students = [
      { id: 's1', name: '学生甲', status: 'active', enrollmentStage: 'enrolled', totalHours: 2, usedHours: 1 },
      { id: 's2', name: '学生乙', status: 'active', enrollmentStage: 'enrolled', totalHours: 10, usedHours: 0 }
    ]
    const courses = [{ id: 'c1', name: '阅读课', teacherId: 't1', studentIds: ['s1', 's2'], hoursPerClass: 1.5, archivedAt: null }]
    const occurrences = [{ id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读课', teacherId: 't1',
      startTime: '09:00', endTime: '10:00', studentIds: ['s1', 's2'], hoursPerClass: 1.5 }]
    const records = []
    const writes = []
    let failDataOnce = true
    let failHistoryOnce = true
    let failStudentReadAfterCreate = false
    let failStudentReadAfterReverse = false
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname
      let status = 200
      let result = []
      if (path.endsWith('/students')) {
        if (failStudentReadAfterCreate || failStudentReadAfterReverse) {
          failStudentReadAfterCreate = false
          failStudentReadAfterReverse = false
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '学生列表临时不可用' }) })
        }
        result = students
      }
      else if (path.endsWith('/teachers')) result = [{ id: 't1', name: '林老师' }]
      else if (path.endsWith('/courses')) {
        if (failDataOnce) { failDataOnce = false; status = 500; result = { error: '网络临时故障' } }
        else result = courses
      }
      else if (path.endsWith('/courses/occurrences')) result = occurrences
      else if (path.endsWith('/attendance') && request.method() === 'GET') {
        if (failHistoryOnce) {
          failHistoryOnce = false
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '历史读取失败' }) })
        }
        const filtered = records.filter(record =>
          (url.searchParams.get('scope') !== 'mine' || record.recordedBy === 't1') &&
          (!url.searchParams.get('courseId') || record.courseId === url.searchParams.get('courseId')) &&
          (!url.searchParams.get('date') || record.date === url.searchParams.get('date')) &&
          (!url.searchParams.get('month') || record.date.startsWith(url.searchParams.get('month'))) &&
          (url.searchParams.get('includeVoided') === '1' || !record.voidedAt))
        const offset = Number(url.searchParams.get('offset') || 0)
        const limit = Number(url.searchParams.get('limit') || 50)
        result = { data: filtered.slice(offset, offset + limit), hasMore: filtered.length > offset + limit }
      } else if (path.endsWith('/attendance') && request.method() === 'POST') {
        const body = request.postDataJSON()
        writes.push({ kind: 'create', body })
        const record = {
          id: 'a1', courseId: body.courseId, date: body.date, originalDate: body.originalDate,
          startTime: '09:00', endTime: '10:00', studentIds: [...body.studentIds], originalStudentIds: [...body.studentIds],
          hoursDeducted: 1.5, recordedBy: role === 'teacher' ? 't1' : null,
          courseName: '阅读课', teacherName: '林老师', createdAt: `${date} 12:00:00`, voidedAt: null,
          studentNamesSnapshot: { s1: '学生甲', s2: '学生乙' }
        }
        records.push(record)
        for (const student of students.filter(item => body.studentIds.includes(item.id))) student.usedHours += 1.5
        failStudentReadAfterCreate = true
        result = record
        status = 201
      } else if (path.endsWith('/remove-students') && request.method() === 'POST') {
        const body = request.postDataJSON()
        writes.push({ kind: 'reverse', body })
        const record = records[0]
        record.studentIds = record.studentIds.filter(id => !body.studentIds.includes(id))
        if (!record.studentIds.length) record.voidedAt = `${date} 13:00:00`
        for (const student of students.filter(item => body.studentIds.includes(item.id))) student.usedHours -= 1.5
        if (writes.filter(write => write.kind === 'reverse').length === 1) failStudentReadAfterReverse = true
        result = { success: true }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      await page.clock.install({ time: new Date('2026-09-28T12:00:00+08:00') })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/attendance', { waitUntil: 'domcontentloaded' })
      await page.getByText('点名数据加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.getByText('请先创建课程后再进行点名').count()) throw new Error(`${width}px ${role} 加载失败误报无课程`)
      await page.locator('.tip').getByRole('button', { name: '重试' }).click()
      await page.getByText('点名记录加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.getByText('暂无点名记录').count()) throw new Error(`${width}px ${role} 历史失败误报空记录`)
      await page.locator('.history').getByRole('button', { name: '重试' }).click()
      await page.locator('.select-course .search-select').waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      await page.locator('.select-course .search-select').click()
      await page.locator('.n-base-select-option').filter({ hasText: '阅读课' }).click()
      await page.getByText('学生甲').first().waitFor({ state: 'visible' })
      const form = page.locator('.attendance-form')
      if (!await form.getByText('共 3 课时').isVisible()) throw new Error(`${width}px ${role} 总扣课时错误`)
      await form.getByRole('button', { name: /确认点名/ }).click()
      const confirm = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '确认点名' }) })
      await confirm.getByText('以下学生课时不足').waitFor({ state: 'visible' })
      if (width === 320) {
        const box = await confirm.boundingBox()
        if (!box || box.x < 0 || box.x + box.width > width ||
            await confirm.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 点名确认弹窗横向裁切')
        if (process.env.MODAL_SCREENSHOTS === '1' && role === 'admin') await page.screenshot({ path: '.qa/modal-320-attendance.png', animations: 'disabled' })
      }
      if (!await confirm.getByText('学生甲').first().isVisible()) throw new Error(`${width}px ${role} 课时不足名单错误`)
      await confirm.getByRole('button', { name: '取消' }).click()
      if (writes.length) throw new Error(`${width}px ${role} 取消点名仍发送写请求`)
      await form.getByRole('button', { name: /确认点名/ }).click()
      await confirm.getByRole('button', { name: '确认点名' }).click()
      await page.locator('.history-item').first().getByText('阅读课').waitFor({ state: 'visible' })
      await page.locator('.toast.warning').getByText('点名已成功，学生资料刷新失败，请稍后重试').waitFor()
      await confirm.waitFor({ state: 'hidden' })
      if (writes.length !== 1 || writes[0].body.studentIds.join(',') !== 's1,s2') throw new Error(`${width}px ${role} 点名写入请求错误`)
      if (role === 'teacher') {
        records.push({ ...records[0], id: 'a2', courseId: 'c2', courseName: '他人课程', recordedBy: 't2' })
        await page.getByRole('button', { name: '我记录的' }).click()
        await page.locator('.history-item').getByText('阅读课').waitFor({ state: 'visible' })
        if (await page.locator('.history-item').count() !== 1) throw new Error(`${width}px 教师“我记录的”包含其他老师的记录`)
        await page.getByRole('button', { name: '全部记录' }).click()
        await page.locator('.history-item').getByText('他人课程').waitFor({ state: 'visible' })
        if (await page.locator('.history-item').count() !== 2) throw new Error(`${width}px 教师未看到全部点名记录`)
        records.pop()
        await page.getByRole('button', { name: '我记录的' }).click()
        await page.locator('.history-item').getByText('阅读课').waitFor({ state: 'visible' })
      } else if (await page.getByRole('button', { name: '我记录的' }).count()) {
        throw new Error(`${width}px 管理员误显示教师专用点名筛选`)
      }
      if (await form.getByRole('button', { name: /确认点名/ }).isEnabled()) throw new Error(`${width}px ${role} 点名成功后仍默认选中学生`)
      await form.getByRole('button', { name: '全选', exact: true }).click()
      await form.getByRole('button', { name: /确认点名/ }).click()
      await page.getByText('该课次已经点名').first().waitFor({ state: 'visible' })
      if (writes.length !== 1) throw new Error(`${width}px ${role} 重复点名仍发送写请求`)
      students[0].name = '改名学生甲'
      await page.reload()
      await page.locator('.history-item').getByText('出勤: 学生甲、学生乙').waitFor({ state: 'visible' })
      await page.locator('.history-item').getByRole('button', { name: '撤销' }).click()
      const reverse = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '撤销点名记录' }) })
      if (width === 320) {
        const box = await reverse.boundingBox()
        if (!box || box.x < 0 || box.x + box.width > width ||
            await reverse.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 撤销点名弹窗横向裁切')
      }
      if (!await reverse.locator('.delete-student-item').filter({ hasText: '学生甲' }).isVisible()) throw new Error(`${width}px ${role} 撤销弹窗未沿用点名时姓名`)
      if (await reverse.getByText('改名学生甲').count()) throw new Error(`${width}px ${role} 撤销弹窗误显示改名后的姓名`)
      await reverse.locator('.delete-student-item').filter({ hasText: '学生甲' }).locator('input').check()
      await reverse.getByRole('button', { name: /确认撤销/ }).click()
      await page.locator('.history-item').getByText('出勤: 学生乙').waitFor({ state: 'visible' })
      await page.locator('.toast.warning').getByText('撤销已成功，学生资料刷新失败，请稍后重试').waitFor()
      await reverse.waitFor({ state: 'hidden' })
      if (writes.length !== 2 || writes[1].body.studentIds.join(',') !== 's1' || students[0].usedHours !== 1) throw new Error(`${width}px ${role} 部分撤销错误`)
      await page.locator('.history-item').getByRole('button', { name: '撤销' }).click()
      await reverse.locator('.delete-student-item').filter({ hasText: '学生乙' }).locator('input').check()
      await reverse.getByRole('button', { name: /确认撤销/ }).click()
      await page.getByText('暂无点名记录').waitFor({ state: 'visible' })
      if (writes.length !== 3 || students[1].usedHours !== 0) throw new Error(`${width}px ${role} 整条撤销错误`)
      await page.getByRole('button', { name: '查看已撤销' }).click()
      await page.locator('.history-item').getByText('原出勤: 学生甲、学生乙').waitFor({ state: 'visible' })
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px ${role} 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px ${role} 脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('点名三端两角色：确认、课时预警、重复拦截、部分/全部撤销及历史显示通过')
} finally {
  await browser.close()
}
