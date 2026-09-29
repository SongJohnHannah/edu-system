import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) {
    for (const role of ['admin', 'teacher']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addInitScript(role => {
        localStorage.setItem('access_token', 'teacher-create-test-only')
        localStorage.setItem('user', JSON.stringify({ id: 'u1', role, teacherId: role === 'teacher' ? 't1' : null, displayName: role }))
      }, role)
      let teachers = [
        { id: 't1', name: '林老师', status: 'active', userId: 'u1' },
        ...(role === 'teacher' ? [{ id: 't2', name: '陈老师', status: 'active', userId: 'u2' }] : [])
      ]
      const posts = []
      let failNextTeacherRead = false
      await context.route('**/edusystem/api/**', async route => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
        let payload = []
        if (pathname.endsWith('/teachers') && request.method() === 'GET') {
          if (failNextTeacherRead) {
            failNextTeacherRead = false
            return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '列表临时不可用' }) })
          }
          payload = teachers
        }
        if (pathname.endsWith('/courses') && request.method() === 'GET') payload = []
        if (pathname.endsWith('/teachers') && request.method() === 'POST') {
          posts.push(request.postDataJSON())
          const index = posts.length + 1
          const created = { id: `t${index}`, name: posts.at(-1).name, phone: posts.at(-1).phone, subject: posts.at(-1).subject, status: 'active', userId: `u${index}` }
          teachers = [...teachers, created]
          payload = { ...created, username: `test-teacher-${index}`, defaultPassword: posts.length === 1 ? 'OneTime123' : 'SecondOneTime' }
          if (posts.length === 2) failNextTeacherRead = true
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/teachers')
      await page.locator('.teacher-card').first().waitFor()
      if (role === 'teacher') {
        if (await page.getByRole('button', { name: /添加教师/ }).count()) throw new Error(`${width}px: 普通教师看到了创建入口`)
        if (await page.getByRole('button', { name: '编辑' }).count()) throw new Error(`${width}px: 普通教师看到了编辑入口`)
        if (await page.locator('.teacher-card').count() !== 2) throw new Error(`${width}px: 全部教师列表未共享`)
        await page.getByRole('button', { name: '我的信息' }).click()
        if (await page.locator('.teacher-card').count() !== 1 || !await page.locator('.teacher-card').getByText('林老师').isVisible()) throw new Error(`${width}px: 我的信息筛选错误`)
        await page.getByPlaceholder('搜索教师姓名...').fill('陈')
        if (await page.locator('.teacher-card').count()) throw new Error(`${width}px: 姓名搜索未与我的信息筛选合并`)
        if (!await page.getByText('没有符合条件的教师').isVisible()) throw new Error(`${width}px: 筛选无结果误报教师库为空`)
        await page.getByPlaceholder('搜索教师姓名...').fill('')
        await page.getByRole('button', { name: '全部教师' }).click()
        if (await page.locator('.teacher-card').count() !== 2) throw new Error(`${width}px: 返回全部教师失败`)
      } else {
        if (await page.getByRole('button', { name: '我的信息' }).count()) throw new Error(`${width}px: 管理员误显示教师专用筛选`)
        await page.getByRole('button', { name: /添加教师/ }).first().click()
        for (const [placeholder, limit] of [['请输入教师姓名', '100'], ['请输入联系电话', '20'], ['如：数学、英语', '100']]) {
          if (await page.getByPlaceholder(placeholder).getAttribute('maxlength') !== limit) {
            throw new Error(`${width}px: ${placeholder} 缺少 ${limit} 字符输入上限`)
          }
        }
        await page.getByPlaceholder('请输入教师姓名').fill('   ')
        await page.getByRole('button', { name: '保存' }).click()
        await page.locator('.toast.error').filter({ hasText: '请输入教师姓名' }).waitFor({ state: 'visible' })
        if (posts.length) throw new Error(`${width}px: 空白教师姓名触发了写入`)
        await page.getByPlaceholder('请输入教师姓名').fill('  陈老师  ')
        await page.getByPlaceholder('请输入联系电话').fill('13800138000')
        await page.getByPlaceholder('如：数学、英语').fill('数学')
        await page.getByRole('button', { name: '保存' }).click()
        await page.getByText('教师创建成功').waitFor()
        if (posts.length !== 1 || posts[0].name !== '陈老师' || posts[0].subject !== '数学') throw new Error(`${width}px: 创建教师请求错误`)
        if (!await page.getByText('test-teacher-2').isVisible() || !await page.getByText('OneTime123').isVisible()) throw new Error(`${width}px: 成功弹窗未显示初始凭据`)
        await page.getByRole('button', { name: '知道了' }).click()
        await page.getByRole('button', { name: /添加教师/ }).first().click()
        await page.getByPlaceholder('请输入教师姓名').fill('第二位老师')
        await page.getByRole('button', { name: '保存' }).click()
        await page.getByText('教师创建成功').waitFor()
        if (posts.length !== 2 || !await page.getByText('SecondOneTime').isVisible()) {
          throw new Error(`${width}px: 创建已提交但列表读取失败后丢失一次性密码`)
        }
        await page.locator('.toast').getByText('教师已创建，列表刷新失败，请稍后重试').waitFor()
        await page.getByRole('button', { name: '知道了' }).click()
        if (!await page.locator('.teacher-card').filter({ hasText: '第二位老师' }).isVisible()) {
          throw new Error(`${width}px: 列表读取失败后未暂时展示已创建的教师`)
        }
      }
      if (errors.length) throw new Error(`${width}px ${role}: ${errors.join('; ')}`)
      await context.close()
    }
  }
  console.log('teacher creation, blank-name rejection, shared/mine filtering and role visibility passed: PC, iPad, phone')
} finally {
  await browser.close()
}
