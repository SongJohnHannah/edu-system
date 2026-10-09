import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    let loginPosts = 0
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (pathname.endsWith('/auth/login')) {
        loginPosts++
        await new Promise(resolve => setTimeout(resolve, 120))
        const { password } = request.postDataJSON()
        if (password !== 'correct') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: '用户名或密码错误' }) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          accessToken: 'login-ui-test-only', refreshToken: 'login-ui-refresh-only',
          user: { id: 'u1', username: '管理员', role: 'admin', displayName: '管理员' }
        }) })
      }
      const payload = pathname.endsWith('/attendance') ? { data: [], hasMore: false } : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/')
    await page.waitForURL('http://127.0.0.1:4174/login')
    if (await page.evaluate(() => localStorage.getItem('access_token'))) throw new Error(`${width}px: 未登录仍有访问凭证`)
    await page.goto('http://127.0.0.1:4174/login')
    const card = page.locator('.login-card')
    await card.waitFor()
    if (await card.locator('img, svg, h1, h2, label').count()) throw new Error(`${width}px: 登录框内仍有 Logo、标题或外部标签`)
    if (await page.locator('.login-video').evaluate(video => getComputedStyle(video).objectFit) !== 'cover') throw new Error(`${width}px: 视频未按比例铺满`)
    const box = await card.boundingBox()
    if (process.env.LOGIN_SCREENSHOTS === '1') await page.screenshot({ path: `.qa/login-current-${width}.png`, animations: 'disabled' })
    if (!box || box.width > 290 || Math.abs(box.x + box.width / 2 - width / 2) > 2 || Math.abs(box.y + box.height / 2 - 450) > 4) {
      throw new Error(`${width}px: 登录框宽度或居中位置错误：${JSON.stringify(box)}`)
    }
    const placeholderColor = await card.getByLabel('用户名').evaluate(input => getComputedStyle(input, '::placeholder').color)
    if (placeholderColor !== 'rgb(57, 78, 97)') throw new Error(`${width}px: 输入框提示字颜色偏淡：${placeholderColor}`)
    await card.getByLabel('用户名').fill('测试账号')
    await card.getByLabel('密码').fill('wrong')
    await card.getByRole('button', { name: '登录', exact: true }).click()
    await card.getByText('用户名或密码错误').waitFor()
    if (!page.url().endsWith('/login') || loginPosts !== 1) throw new Error(`${width}px: 失败登录请求或反馈错误`)
    await card.getByLabel('密码').fill('correct')
    await card.getByRole('button', { name: '登录', exact: true }).evaluate(button => { button.click(); button.click() })
    await page.waitForURL('http://127.0.0.1:4174/')
    if (loginPosts !== 2) throw new Error(`${width}px: 连续点击额外发送 ${loginPosts - 2} 次认证请求`)
    if (!await page.getByRole('heading', { name: '教师工作台' }).isVisible()) throw new Error(`${width}px: 登录成功未进入工作台`)
    if (width < 600) await page.locator('.mobile-tab-bar').getByRole('button', { name: '更多' }).click()
    else await page.getByRole('button', { name: '账户' }).click()
    await page.getByRole('button', { name: '退出登录' }).click()
    await page.waitForURL('http://127.0.0.1:4174/login')
    const stored = await page.evaluate(() => ({ access: localStorage.getItem('access_token'), refresh: localStorage.getItem('refresh_token'), user: localStorage.getItem('user') }))
    if (stored.access || stored.refresh || stored.user) throw new Error(`${width}px: 登出后仍保留认证信息`)
    if (errors.length) throw new Error(`${width}px: ${errors.join('; ')}`)
    await context.close()
  }
  const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true })
  try {
    const page = await landscape.newPage()
    await page.goto('http://127.0.0.1:4174/login')
    const card = page.locator('.login-card')
    await card.waitFor({ state: 'visible' })
    if (process.env.LOGIN_SCREENSHOTS === '1') await page.screenshot({ path: '.qa/login-current-landscape.png', animations: 'disabled' })
    const box = await card.boundingBox()
    if (!box || Math.abs(box.x + box.width / 2 - 422) > 2 || Math.abs(box.y + box.height / 2 - 195) > 4) {
      throw new Error(`手机横屏登录框未居中：${JSON.stringify(box)}`)
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) throw new Error('手机横屏登录页横向溢出')
  } finally { await landscape.close() }
  console.log('login redirect, failure, duplicate guard, success, logout and compact video layout passed: PC, iPad, phone')
} finally {
  await browser.close()
}
