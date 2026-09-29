import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'student-postcommit-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    let studentReads = 0
    const checkedNames = []
    const writes = []
    let students = [{ id: 's1', name: '原有学生', phone: '', age: 8, status: 'active', createdBy: 'admin', creatorId: null,
      enrollmentStage: 'enrolled', totalHours: 2, usedHours: 0, remark: '' }]
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      if (path.endsWith('/students') && method === 'GET') {
        studentReads++
        if (studentReads > 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '写入后列表临时不可用' }) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(students) })
      }
      if (path.endsWith('/students/check-name')) {
        checkedNames.push(new URL(request.url()).searchParams.get('name'))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false }) })
      }
      if (path.endsWith('/teachers')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
      let result = { success: true }
      if (method !== 'GET') {
        writes.push({ method, path, body: request.postDataJSON?.() })
        if (path.endsWith('/students') && method === 'POST') {
          result = { ...students[0], ...request.postDataJSON(), id: 's2', usedHours: 0, status: 'active' }
          students.push(result)
        } else if (path.endsWith('/students/s2') && method === 'PUT') {
          result = { ...students[1], ...request.postDataJSON() }
          students[1] = result
        } else if (path.endsWith('/students/s2/add-hours')) {
          result = { ...students[1], totalHours: Number(students[1].totalHours) + Number(request.postDataJSON().hours) }
          students[1] = result
        } else if (path.endsWith('/students/s2/subtract-hours')) {
          result = { ...students[1], totalHours: Number(students[1].totalHours) - Number(request.postDataJSON().hours) }
          students[1] = result
        } else if (path.endsWith('/students/s2/status')) {
          result = { ...students[1], status: request.postDataJSON().status }
          students[1] = result
        } else if (path.endsWith('/students/s2') && method === 'DELETE') {
          students[1] = { ...students[1], status: 'deleted' }
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/students')
      await page.getByRole('button', { name: '添加学生' }).first().click()
      const form = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '添加学生' }) })
      await form.getByPlaceholder('请输入学生姓名').fill(' 新增学生 ')
      await form.getByPlaceholder('请输入购买课时数').fill('2')
      await form.getByRole('button', { name: '保存', exact: true }).click()
      const row = page.locator(width <= 390 ? '.mobile-card' : 'tbody tr').filter({ hasText: '新增学生' })
      await row.waitFor({ state: 'visible' })
      if (checkedNames[0] !== '新增学生' || writes[0]?.body?.name !== '新增学生') {
        throw new Error(`${width}px: 预检查和保存未使用同一规范化姓名`)
      }
      await row.getByRole('button', { name: '编辑' }).click()
      const edit = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑学生' }) })
      await edit.getByPlaceholder('请输入家长联系电话').fill('13900000000')
      await edit.getByRole('button', { name: '保存', exact: true }).click()
      await row.getByRole('button', { name: '加减课' }).click()
      const hours = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '加减课时' }) })
      await hours.locator('.hours-amount input').fill('1.5')
      await hours.getByRole('button', { name: '确认', exact: true }).click()
      await row.locator(width <= 390 ? '.mobile-remaining' : 'td:nth-child(8)').filter({ hasText: '3.5' }).waitFor({ state: 'visible' })
      await row.getByRole('button', { name: '加减课' }).click()
      await hours.getByRole('button', { name: /减课时/ }).click()
      await hours.locator('.hours-amount input').fill('0.5')
      await hours.getByRole('button', { name: '确认', exact: true }).click()
      await row.locator(width <= 390 ? '.mobile-remaining' : 'td:nth-child(8)').filter({ hasText: '3' }).waitFor({ state: 'visible' })
      await row.locator('.badge').first().click()
      const status = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '修改学生状态' }) })
      await status.getByRole('button', { name: /退学/ }).click()
      await status.getByRole('button', { name: '确认修改' }).click()
      await row.getByText('退学', { exact: true }).waitFor({ state: 'visible' })
      await row.getByRole('button', { name: '归档' }).click()
      const archive = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '归档学生' }) })
      await archive.getByRole('button', { name: '确认', exact: true }).evaluate(button => { button.click(); button.click() })
      await archive.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: '查看归档' }).click()
      await row.getByText('已归档', { exact: true }).waitFor({ state: 'visible' })
      if (studentReads !== 1 || writes.length !== 6 || writes.filter(write => write.method === 'DELETE').length !== 1) {
        throw new Error(`${width}px 学生写入后仍依赖列表读取或重复归档：${JSON.stringify({ studentReads, writes })}`)
      }
      if (await page.locator('.toast.error').isVisible() || errors.length) throw new Error(`${width}px 学生保存反馈错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('学生新增、编辑、加减课时、退学和归档使用写入响应更新页面，四种视口通过')
} finally {
  await browser.close()
}
