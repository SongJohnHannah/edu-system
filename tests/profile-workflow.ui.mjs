import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390]) for (const role of ['teacher', 'admin']) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(currentRole => {
      localStorage.setItem('access_token', 'profile-test-token')
      localStorage.setItem('user', JSON.stringify({
        id: currentRole === 'teacher' ? 'u2' : 'u1', role: currentRole,
        teacherId: currentRole === 'teacher' ? 't1' : null,
        displayName: currentRole === 'teacher' ? '林老师' : '测试管理员'
      }))
    }, role)
    let profile = {
      id: role === 'teacher' ? 'u2' : 'u1', role,
      username: role === 'teacher' ? '13800138000' : 'admin',
      displayName: role === 'teacher' ? '林老师' : '测试管理员',
      teacher: role === 'teacher' ? { id: 't1', phone: '13800138000', subject: '语文' } : null
    }
    const nameWrites = []
    const passwordWrites = []
    let failProfile = true
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      let status = 200
      let payload = []
      if (pathname.endsWith('/auth/profile') && request.method() === 'GET') {
        if (failProfile) { status = 500; payload = { error: '网络临时故障' } }
        else payload = profile
      }
      if (pathname.endsWith('/auth/profile') && request.method() === 'PUT') {
        const body = request.postDataJSON()
        nameWrites.push(body)
        profile = { ...profile, displayName: body.displayName }
        payload = profile
      }
      if (pathname.endsWith('/auth/password') && request.method() === 'PUT') {
        const body = request.postDataJSON()
        passwordWrites.push(body)
        if (body.oldPassword === 'wrong') { status = 400; payload = { error: '旧密码错误' } }
        else payload = { success: true }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/profile', { waitUntil: 'domcontentloaded' })
      await page.getByText('账户资料加载失败，请重试').waitFor({ state: 'visible' })
      if (await page.locator('.profile-role').count()) throw new Error(`${width}px ${role} 加载失败误显示身份`)
      failProfile = false
      await page.getByRole('button', { name: '重试' }).click()
      await page.getByText(profile.username, { exact: true }).first().waitFor({ state: 'visible' })
      await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
      if (role === 'teacher') {
        await page.getByText('13800138000', { exact: true }).first().waitFor({ state: 'visible' })
        await page.getByText('语文', { exact: true }).waitFor({ state: 'visible' })
        const nameSection = page.locator('.profile-section').filter({ has: page.getByRole('heading', { name: '修改姓名' }) })
        if (await nameSection.locator('input').getAttribute('maxlength') !== '100') throw new Error(`${width}px 个人姓名缺少长度上限`)
        await nameSection.locator('input').fill('   ')
        await nameSection.getByRole('button', { name: '保存' }).click()
        await page.locator('.toast.error').filter({ hasText: '姓名不能为空' }).waitFor({ state: 'visible' })
        if (nameWrites.length) throw new Error(`${width}px 空白姓名触发了资料写入`)
        await nameSection.locator('input').fill('  新教师姓名  ')
        await nameSection.getByRole('button', { name: '保存' }).click()
        await page.getByRole('heading', { name: '新教师姓名' }).waitFor({ state: 'visible' })
        if (nameWrites.length !== 1 || nameWrites[0].displayName !== '新教师姓名') throw new Error(`${width}px 教师姓名保存请求错误`)
        const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('user'))?.displayName)
        if (cached !== '新教师姓名') throw new Error(`${width}px 修改姓名后登录缓存未同步`)
      } else if (await page.getByRole('heading', { name: '修改姓名' }).count()) throw new Error(`${width}px 管理员误显示教师改名表单`)

      const inputs = page.locator('.profile-section input[type="password"]')
      await inputs.nth(0).fill('oldpass')
      await inputs.nth(1).fill('NextPassword1')
      await inputs.nth(2).fill('DifferentPassword1')
      await page.getByRole('button', { name: '修改密码' }).click()
      await page.getByText('两次输入的新密码不一致').waitFor({ state: 'visible' })
      if (passwordWrites.length) throw new Error(`${width}px ${role} 密码不一致却发出写入`)

      await inputs.nth(0).fill('wrong')
      await inputs.nth(2).fill('NextPassword1')
      await page.getByRole('button', { name: '修改密码' }).click()
      await page.getByText('旧密码错误').waitFor({ state: 'visible' })
      if (passwordWrites.length !== 1 || !await page.evaluate(() => !!localStorage.getItem('access_token'))) throw new Error(`${width}px ${role} 旧密码错误后错误登出`)

      await inputs.nth(0).fill('oldpass')
      await page.getByRole('button', { name: '修改密码' }).click()
      await page.waitForURL('**/login')
      if (passwordWrites.length !== 2 || passwordWrites[1].newPassword !== 'NextPassword1') throw new Error(`${width}px ${role} 改密请求错误`)
      if (await page.evaluate(() => !!localStorage.getItem('access_token'))) throw new Error(`${width}px ${role} 改密成功后未清除旧登录状态`)
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px ${role} 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px ${role} 页面脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('个人账户三端：教师改名、管理员只读资料、错误旧密码和成功改密登出通过')
} finally {
  await browser.close()
}
