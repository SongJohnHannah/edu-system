import { test, expect, ApiClient } from './fixtures.js'

test.describe('认证流程', () => {
  test('admin 正确密码登录', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[placeholder*="用户名"]', 'admin')
    await page.fill('input[placeholder*="密码"]', 'admin123')
    await page.click('button:has-text("登录")')
    await page.waitForURL('/')
    const token = await page.evaluate(() => localStorage.getItem('access_token'))
    expect(token).toBeTruthy()
    const user = JSON.parse(await page.evaluate(() => localStorage.getItem('user')))
    expect(user.role).toBe('admin')
  })

  test('错误密码显示提示', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[placeholder*="用户名"]', 'admin')
    await page.fill('input[placeholder*="密码"]', 'wrongpassword')
    await page.click('button:has-text("登录")')
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5000 })
  })

  test('未登录访问首页重定向到登录页', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('登出清除 token 并跳转', async ({ adminPage }) => {
    await adminPage.click('button:has-text("退出登录")')
    await adminPage.waitForURL(/\/login/)
    const token = await adminPage.evaluate(() => localStorage.getItem('access_token'))
    expect(token).toBeNull()
  })

  test('teacher 角色无法访问教师管理页', async ({ page }) => {
    const api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const phone = '13901' + Date.now().toString().slice(-6)
    await api.post('/teachers', { name: '测试教师T', phone, subject: '英语' })
    const loginRes = await api.request('POST', '/auth/login', { username: phone, password: '123456' })
    const loginData = await loginRes.json()

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => {
      localStorage.setItem('access_token', t.accessToken)
      localStorage.setItem('refresh_token', t.refreshToken)
      localStorage.setItem('user', JSON.stringify(t.user))
    }, loginData)
    await page.goto('/teachers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('/teachers')
    try {
      const api2 = new ApiClient('http://localhost:3001')
      await api2.login('admin', 'admin123')
      const tRes = await api2.get('/teachers')
      const ts = await tRes.json()
      const t = ts.find(x => x.phone === phone)
      if (t) await api2.del(`/teachers/${t.id}`)
    } catch {}
  })
})
