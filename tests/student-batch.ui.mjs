import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'student-batch-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'teacher', teacherId: 't1', displayName: '林老师' }))
    })
    let posted = null
    let postCount = 0
    let statusWrites = 0
    let courseRosterPending = true
    let futureTrialPending = true
    let failedInitialLoad = false
    let failStudentReadAfterBatch = false
    let students = [
      { id: 's1', name: '已存在', status: 'active', createdBy: 'admin', creatorId: null, enrollmentStage: 'enrolled', totalHours: 0, usedHours: 0 },
      { id: 's3', name: '很长很长的学生姓名', status: 'active', createdBy: 'admin', creatorId: null, enrollmentStage: 'enrolled', totalHours: 0, usedHours: 0 },
      { id: 's4', name: '已归档样本', status: 'deleted', createdBy: 'teacher', creatorId: 't1', enrollmentStage: 'enrolled', totalHours: 2, usedHours: 1 }
    ]
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      let payload = []
      if (pathname.endsWith('/students') && request.method() === 'GET' && !failedInitialLoad) {
        failedInitialLoad = true
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '临时不可用' }) })
      }
      if (pathname.endsWith('/students') && request.method() === 'GET' && failStudentReadAfterBatch) {
        failStudentReadAfterBatch = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '列表刷新失败' }) })
      }
      if (pathname.endsWith('/students') && request.method() === 'GET') payload = students
      if (pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
      if (pathname.endsWith('/students/batch') && request.method() === 'POST') {
        postCount += 1
        posted = request.postDataJSON()
        await new Promise(resolve => setTimeout(resolve, 120))
        if (postCount === 1) {
          students = [...students, { id: 's2', name: '新生', status: 'active', createdBy: 'teacher', creatorId: 't1', enrollmentStage: 'enrolled', totalHours: 1.5, usedHours: 0 }]
          payload = { addedCount: 1, skipped: ['已存在'] }
        } else {
          students = [...students, { id: 's5', name: '稍后刷新', status: 'active', createdBy: 'teacher', creatorId: 't1', enrollmentStage: 'enrolled', totalHours: 1, usedHours: 0 }]
          failStudentReadAfterBatch = true
          payload = { addedCount: 1, skipped: [] }
        }
      }
      if (pathname.endsWith('/students/s1/status') && request.method() === 'PUT') {
        statusWrites++
        if (courseRosterPending) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '请先从正式课程名单移除该学生，再办理退学' }) })
        if (futureTrialPending) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '请先处理该学生未来的试听预约，再办理退学' }) })
        students = students.map(student => student.id === 's1' ? { ...student, status: 'quit' } : student)
        payload = students[0]
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/students')
    await page.locator('.students [role="alert"]').getByText('学生资料加载失败，请重试').waitFor()
    if (await page.getByText('暂无学生数据').count()) throw new Error(`${width}px: 加载失败误报为空学生库`)
    if (await page.getByRole('button', { name: '添加学生' }).isEnabled()) throw new Error(`${width}px: 基础数据失败仍允许录入`)
    await page.locator('.students [role="alert"]').getByRole('button', { name: '重试' }).click()
    await page.locator('.students .search-bar').waitFor()
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    const visibleRows = page.locator(width <= 390 ? '.mobile-card:visible' : '.table tbody tr:visible')
    if (await visibleRows.filter({ hasText: '已归档样本' }).count()) throw new Error(`${width}px: 默认在册列表混入归档学生`)
    await page.getByRole('button', { name: '查看归档' }).click()
    if (!await visibleRows.filter({ hasText: '已归档样本' }).count() || await visibleRows.filter({ hasText: '已存在' }).count()) {
      throw new Error(`${width}px: 归档筛选未只显示归档学生`)
    }
    await page.getByRole('button', { name: '隐藏归档' }).click()
    if (await visibleRows.filter({ hasText: '已归档样本' }).count() || !await visibleRows.filter({ hasText: '已存在' }).count()) {
      throw new Error(`${width}px: 退出归档筛选后未恢复在册学生`)
    }
    if (width <= 390) {
      const longName = page.locator('.mobile-name').filter({ hasText: '很长很长的学生姓名' })
      await longName.click()
      if (!await page.locator('.name-tip').getByText('很长很长的学生姓名').isVisible()) throw new Error('手机长姓名没有显示完整提示')
      if (await page.getByText('学生详情', { exact: true }).isVisible()) throw new Error('长姓名第一次点击误开详情')
      await longName.click()
      await page.getByText('学生详情', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await page.locator('.mobile-name').filter({ hasText: '已存在' }).click()
      await page.getByText('学生详情', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '关闭', exact: true }).click()
    }
    await page.getByRole('button', { name: '批量添加' }).first().click()
    if (await page.getByPlaceholder('学生姓名', { exact: true }).first().getAttribute('maxlength') !== '100') {
      throw new Error(`${width}px: 批量学生姓名缺少长度限制`)
    }
    await page.getByPlaceholder('学生姓名', { exact: true }).first().fill('已存在')
    await page.getByRole('button', { name: '+ 添加一行' }).click()
    await page.getByPlaceholder('学生姓名', { exact: true }).nth(1).fill('新生')
    await page.getByPlaceholder('默认0课时').fill('1.5')
    await page.getByRole('button', { name: '确认添加' }).evaluate(button => { button.click(); button.click() })
    await page.getByText('批量添加结果').waitFor()
    if (!posted || posted.students.length !== 2 || posted.defaultHours !== 1.5) throw new Error(`${width}px: 未按原始输入提交整批及默认课时`)
    if (postCount !== 1) throw new Error(`${width}px: 连续提交导致 ${postCount} 次批量写入`)
    if (!await page.getByText('成功添加').isVisible()) throw new Error(`${width}px: 缺少部分成功结果`)
    if (!await page.getByText('以下姓名已存在，已自动跳过：').isVisible()) throw new Error(`${width}px: 缺少跳过重复姓名的反馈`)
    await page.getByRole('button', { name: '确定', exact: true }).click()
    await page.getByRole('button', { name: '添加学生' }).first().click()
    if (await page.getByPlaceholder('请输入学生姓名').getAttribute('maxlength') !== '100' ||
        await page.getByPlaceholder('请输入家长联系电话').getAttribute('maxlength') !== '20') {
      throw new Error(`${width}px: 学生资料输入框长度与数据库字段不一致`)
    }
    await page.locator('.modal').filter({ hasText: '添加学生' }).getByRole('button', { name: '取消' }).click()
    if (width <= 390) {
      const ownCard = page.locator('.mobile-card').filter({ hasText: '新生' })
      await ownCard.waitFor({ state: 'visible' })
      const actionLayout = await ownCard.evaluate(card => {
        const bounds = card.getBoundingClientRect()
        const buttons = [...card.querySelectorAll('.mobile-card-actions button')]
        return {
          cardScrolls: card.scrollWidth > card.clientWidth + 2,
          labels: buttons.map(button => button.textContent.trim()),
          clipped: buttons.some(button => {
            const box = button.getBoundingClientRect()
            return box.left < bounds.left - 2 || box.right > bounds.right + 2
          })
        }
      })
      if (actionLayout.cardScrolls || actionLayout.clipped || actionLayout.labels.join(',') !== '加减课,历史,编辑,归档') {
        throw new Error(`手机学生操作未完整展示：${JSON.stringify(actionLayout)}`)
      }
    }
    const row = width <= 390 ? page.locator('.mobile-card').filter({ hasText: '已存在' }) : page.locator('tbody tr').filter({ hasText: '已存在' })
    await row.locator('.badge').first().click()
    const statusModal = page.locator('.modal').filter({ hasText: '修改学生状态' })
    await statusModal.getByRole('button', { name: /退学/ }).click()
    await statusModal.getByRole('button', { name: '确认修改' }).click()
    await page.locator('.toast.error').getByText('请先从正式课程名单移除该学生，再办理退学').waitFor({ state: 'visible' })
    if (!await statusModal.isVisible() || !await row.getByText('正常', { exact: true }).first().isVisible() || statusWrites !== 1) {
      throw new Error(`${width}px: 正式课程名单冲突后弹窗或学生状态被错误改变`)
    }
    courseRosterPending = false
    await statusModal.getByRole('button', { name: '确认修改' }).click()
    await page.locator('.toast.error').getByText('请先处理该学生未来的试听预约，再办理退学').waitFor({ state: 'visible' })
    if (!await statusModal.isVisible() || !await row.getByText('正常', { exact: true }).first().isVisible() || statusWrites !== 2) {
      throw new Error(`${width}px: 退学被拒后弹窗或学生状态被错误改变`)
    }
    futureTrialPending = false
    await statusModal.getByRole('button', { name: '确认修改' }).click()
    await row.getByText('退学', { exact: true }).waitFor({ state: 'visible' })
    for (const action of ['加减课', '历史', '编辑']) {
      if (!await row.getByRole('button', { name: action }).isVisible()) throw new Error(`${width}px: 退学学生缺少${action}入口`)
    }
    if (await row.getByRole('button', { name: '归档' }).count()) throw new Error(`${width}px: 教师可归档管理员录入的退学学生`)
    await page.locator('.toast.success').getByText('学生状态已更新').waitFor({ state: 'visible' })
    if (await page.locator('.toast.error').isVisible() || statusWrites !== 3) throw new Error(`${width}px: 预约处理后重试仍显示旧错误`)
    await page.getByRole('button', { name: '批量添加' }).first().click()
    await page.getByPlaceholder('学生姓名', { exact: true }).first().fill('稍后刷新')
    await page.getByRole('button', { name: '确认添加' }).click()
    await page.locator('.toast.warning').getByText('学生已添加，列表刷新失败，请稍后重试').waitFor()
    await page.getByRole('heading', { name: '批量添加学生' }).waitFor({ state: 'hidden' })
    if (postCount !== 2) throw new Error(`${width}px: 批量写入成功后读取失败被误判为添加失败`)
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    await context.close()
  }
  console.log('student load retry, batch partial success and withdrawal conflict retry passed: PC, iPad, phone')
} finally {
  await browser.close()
}
