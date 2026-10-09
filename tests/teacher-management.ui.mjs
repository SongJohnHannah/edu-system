import { chromium } from '@playwright/test'

const origin = 'http://127.0.0.1:4174'
const browser = await chromium.launch({ headless: true })

try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'teacher-management-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
    })
    let teachers = [
      { id: 't1', name: '林老师', phone: '13800138001', subject: '语文', status: 'active', userId: 'u1' },
      { id: 't2', name: '陈老师', phone: '13800138002', subject: '数学', status: 'active', userId: 'u2' }
    ]
    let courses = [{ id: 'c1', name: '阅读课', teacherId: 't1', weekday: 2, startTime: '10:00', endTime: '11:00' }]
    const writes = []
    let failedInitialLoad = false
    let failTeacherReadAfterWrite = false
    let failCourseReadAfterHandover = false
    let failPasswordOnce = false
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname.replace('/edusystem/api', '')
      const method = request.method()
      const body = ['POST', 'PUT', 'DELETE'].includes(method) ? request.postDataJSON() : undefined
      let payload = []
      let status = 200
      if (method !== 'GET') writes.push({ method, pathname, body })
      if (pathname === '/teachers' && method === 'GET' && !failedInitialLoad) {
        failedInitialLoad = true
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '临时不可用' }) })
      }
      if (pathname === '/teachers' && method === 'GET' && failTeacherReadAfterWrite) {
        failTeacherReadAfterWrite = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '教师列表刷新失败' }) })
      }
      if (pathname === '/courses' && method === 'GET' && failCourseReadAfterHandover) {
        failCourseReadAfterHandover = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '课程列表刷新失败' }) })
      }
      if (pathname === '/teachers' && method === 'GET') payload = teachers
      else if (pathname === '/courses' && method === 'GET') payload = courses
      else if (pathname === '/teachers/t1' && method === 'PUT') {
        teachers = teachers.map(t => t.id === 't1' ? { ...t, ...body } : t)
        payload = teachers[0]
        failTeacherReadAfterWrite = true
      } else if (pathname === '/teachers/t1/status' && method === 'PUT') {
        if (body.status === 'deleted' && courses.some(c => c.teacherId === 't1')) {
          status = 409
          payload = { error: '该教师仍有课程，请先交接或归档课程' }
        } else {
          teachers = teachers.map(t => t.id === 't1' ? { ...t, status: body.status } : t)
          payload = teachers[0]
          failTeacherReadAfterWrite = true
        }
      } else if (pathname === '/handovers' && method === 'POST') {
        courses = courses.map(c => c.id === body.courseId ? { ...c, teacherId: body.newTeacherId } : c)
        payload = { id: 'h1', courseId: body.courseId }
        failCourseReadAfterHandover = true
      } else if (pathname === '/auth/users/u1' && method === 'PUT') {
        teachers = teachers.map(t => t.id === 't1' ? { ...t, name: body.displayName.trim(), phone: body.phone.trim() } : t)
        payload = { id: 'u1', displayName: body.displayName.trim(), teacher: { name: body.displayName.trim(), phone: body.phone.trim() } }
      } else if (pathname === '/auth/users/u1/password' && method === 'PUT') {
        if (failPasswordOnce) {
          failPasswordOnce = false
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '密码服务暂不可用' }) })
        }
        payload = { success: true }
        failTeacherReadAfterWrite = true
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/teachers`)
    await page.locator('.teachers [role="alert"]').getByText('教师资料加载失败，请重试').waitFor()
    if (await page.getByText('暂无教师数据').count()) throw new Error(`${width}px: 加载失败误报为空教师库`)
    if (await page.getByRole('button', { name: '添加教师' }).isEnabled()) throw new Error(`${width}px: 加载失败仍可新增教师`)
    await page.locator('.teachers [role="alert"]').getByRole('button', { name: '重试' }).click()
    const card = page.locator('.teacher-card').filter({ hasText: '林老师' })
    await card.waitFor()
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    if (width === 320) {
      const boxes = await card.locator('.teacher-actions button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect()
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
      }))
      if (boxes.length !== 4 || Math.abs(boxes[0].y - boxes[1].y) > 2 ||
          Math.abs(boxes[2].y - boxes[3].y) > 2 || boxes[2].y <= boxes[0].y ||
          boxes.some(box => box.right > width || box.x < 0)) throw new Error('320px 教师操作未整齐排成两行')
    }

    await card.getByRole('button', { name: '编辑' }).click()
    await page.getByPlaceholder('如：数学、英语').fill('书法')
    await page.getByRole('button', { name: '保存' }).click()
    await page.getByText('书法').waitFor()
    if (!writes.some(w => w.pathname === '/teachers/t1' && w.body.subject === '书法')) throw new Error(`${width}px: 教师编辑未提交`)
    failTeacherReadAfterWrite = false

    await card.getByRole('button', { name: '停用' }).click()
    await page.getByText('停用教师', { exact: true }).waitFor()
    if (writes.some(w => w.pathname === '/teachers/t1/status')) throw new Error(`${width}px: 确认前就提交了停用`)
    await page.getByRole('button', { name: '确认停用' }).click()
    await page.getByText('该教师仍有课程，请先交接或归档课程').waitFor()
    if (!await card.getByRole('button', { name: '交接课程' }).isVisible()) throw new Error(`${width}px: 拒绝停用后教师状态错误`)
    await page.getByRole('button', { name: '取消' }).click()

    await card.getByRole('button', { name: '交接课程' }).click()
    await page.getByText('课程交接', { exact: true }).waitFor()
    await page.locator('.search-select').click()
    await page.getByText('陈老师', { exact: true }).last().click()
    await page.getByPlaceholder('如：教师离职、课程调整等').fill('工作安排')
    await page.getByRole('button', { name: '确认交接' }).click()
    await page.getByText('已成功交接 1 门课程').waitFor()
    await page.locator('.toast.warning').getByText('课程已交接，列表刷新失败，请稍后重试').waitFor()
    if (!writes.some(w => w.pathname === '/handovers' && w.body.courseId === 'c1' && w.body.newTeacherId === 't2' && w.body.reason === '工作安排')) {
      throw new Error(`${width}px: 交接请求不完整`)
    }
    if (!await card.getByText('0 门课程').isVisible()) throw new Error(`${width}px: 交接后课程数量未刷新`)

    await card.getByRole('button', { name: '停用' }).click()
    await page.getByRole('button', { name: '确认停用' }).click()
    await card.getByText('已停用').waitFor()
    failTeacherReadAfterWrite = false
    if (!await card.getByRole('button', { name: '恢复' }).isVisible()) throw new Error(`${width}px: 停用后无恢复入口`)
    await card.getByRole('button', { name: '恢复' }).click()
    await card.getByRole('button', { name: '编辑' }).waitFor()
    failTeacherReadAfterWrite = false
    const statuses = writes.filter(w => w.pathname === '/teachers/t1/status').map(w => w.body.status)
    if (statuses.join(',') !== 'deleted,deleted,active') throw new Error(`${width}px: 停用与恢复请求错误: ${statuses}`)

    await card.getByRole('button', { name: '账户' }).click()
    const accountModal = page.locator('.modal').filter({ hasText: '教师账户管理' })
    if (await accountModal.locator('input[type="text"]').first().getAttribute('maxlength') !== '100' ||
        await accountModal.locator('input[type="tel"]').getAttribute('maxlength') !== '20') {
      throw new Error(`${width}px: 账户姓名或手机号缺少数据库长度上限`)
    }
    await accountModal.locator('input[type="text"]').first().fill('林青老师')
    await accountModal.locator('input[type="tel"]').fill(' 13800138009 ')
    await accountModal.locator('input[type="password"]').fill('DemoOnly123')
    await accountModal.getByRole('button', { name: '保存' }).click()
    await page.getByText('林青老师').waitFor()
    await page.locator('.toast.warning').getByText('教师账户已保存，列表刷新失败，请稍后重试').waitFor()
    if (!writes.some(w => w.pathname === '/auth/users/u1' && w.body.displayName === '林青老师' && w.body.phone === ' 13800138009 ')) {
      throw new Error(`${width}px: 账户资料未正确提交`)
    }
    if (!await page.locator('.teacher-card').filter({ hasText: '林青老师' }).getByText('13800138009', { exact: true }).isVisible()) {
      throw new Error(`${width}px: 账户保存后电话未按服务端规范化结果显示`)
    }
    if (!writes.some(w => w.pathname === '/auth/users/u1/password' && w.body.newPassword === 'DemoOnly123')) {
      throw new Error(`${width}px: 重置密码未正确提交`)
    }
    await page.locator('.teacher-card').filter({ hasText: '林青老师' }).getByRole('button', { name: '账户' }).click()
    const retryAccount = page.locator('.modal').filter({ hasText: '教师账户管理' })
    await retryAccount.locator('input[type="text"]').first().fill('林青二老师')
    await retryAccount.locator('input[type="password"]').fill('RetryDemo123')
    failPasswordOnce = true
    await retryAccount.getByRole('button', { name: '保存' }).click()
    await page.locator('.toast.warning').getByText('教师资料已保存，但密码重置失败：密码服务暂不可用').waitFor()
    if (!await retryAccount.isVisible() || !await page.getByText('林青二老师').isVisible()) throw new Error(`${width}px: 资料成功但改密失败时丢失进度`)
    await retryAccount.getByRole('button', { name: '保存' }).click()
    await retryAccount.waitFor({ state: 'hidden' })
    if (writes.filter(w => w.pathname === '/auth/users/u1/password' && w.body.newPassword === 'RetryDemo123').length !== 2) {
      throw new Error(`${width}px: 改密失败后不能单独重试`)
    }
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    await context.close()
  }
  console.log('teacher load retry, edit, guarded stop, handover, restore and account passed: PC, iPad, phone')
} finally {
  await browser.close()
}
