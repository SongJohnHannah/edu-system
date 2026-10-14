import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const origin = 'http://127.0.0.1:4174'
const storageKey = 'edu.app.theme'
const browser = await chromium.launch({ headless: true, channel: process.env.UI_BROWSER_CHANNEL || undefined })
try {
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'theme-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
      if (!localStorage.getItem('edu.app.theme')) localStorage.setItem('edu.app.theme', 'invalid-theme')
    })
    const writes = []
    await context.route('**/edusystem/api/**', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url())
      const profile = { id: 'u1', role: 'admin', username: 'theme-test', displayName: '测试管理员' }
      const payload = new URL(route.request().url()).pathname.endsWith('/auth/profile') ? profile : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${origin}/profile`)
      await page.getByRole('button', { name: '修改密码', exact: true }).waitFor()
      const draft = page.locator('.profile-form input').first()
      await draft.fill('unsaved-theme-test')
      const root = page.locator('html')
      await expect(root).toHaveAttribute('data-app-theme', 'aurora')
      const themeButton = page.locator(width < 600 ? '.mobile-theme-switch' : '.brand-theme-switch')
      if (width < 600) await page.locator('.mobile-tab-bar').getByRole('button', { name: '更多' }).click()
      const initialBackground = await page.locator('.app').evaluate(element => getComputedStyle(element).backgroundImage)
      assert.match(initialBackground, /radial-gradient/)
      for (const [id, color] of [['mint', 'rgb(40, 114, 92)'], ['apricot', 'rgb(166, 91, 50)'], ['classic', 'rgb(65, 120, 185)'], ['aurora', 'rgb(65, 120, 185)']]) {
        await themeButton.click()
        await expect(root).toHaveAttribute('data-app-theme', id)
        assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), id)
        assert.equal(page.url(), `${origin}/profile`)
        await expect(draft).toHaveValue('unsaved-theme-test')
        await expect.poll(() => page.getByRole('button', { name: '修改密码', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe(color)
        if (id === 'classic') assert.equal(await page.locator('.app').evaluate(element => getComputedStyle(element).backgroundImage), 'none')
        if (process.env.APP_THEME_SCREENSHOTS === '1' && width === 1440) {
          await mkdir('.qa', { recursive: true })
          await page.screenshot({ path: `.qa/theme-${id}.png`, animations: 'disabled' })
        }
      }
      if (width >= 600) {
        await themeButton.focus()
        await page.keyboard.press('Enter')
      } else await themeButton.click()
      await expect(root).toHaveAttribute('data-app-theme', 'mint')
      await page.reload()
      await expect(root).toHaveAttribute('data-app-theme', 'mint')
      if (width < 600) await page.locator('.mobile-tab-bar').getByRole('button', { name: '更多' }).click()
      await expect(themeButton).toHaveAttribute('aria-label', /当前薄荷绿/)
      await page.evaluate(key => {
        const originalSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Blocked theme storage', 'SecurityError')
          return originalSetItem.call(this, name, value)
        }
      }, storageKey)
      await themeButton.click()
      await expect(root).toHaveAttribute('data-app-theme', 'apricot')
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'mint')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false)
      if (width >= 600) await page.getByRole('button', { name: '账户', exact: true }).click()
      await page.getByRole('button', { name: '退出登录', exact: true }).click()
      await page.waitForURL(`${origin}/login`)
      await page.locator('.login-card').waitFor()
      assert.equal(await root.getAttribute('data-app-theme'), null)
      assert.equal(await root.evaluate(element => element.style.getPropertyValue('--color-primary')), '')
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'mint')
      await page.goto(`${origin}/profile`)
      await expect(root).toHaveAttribute('data-app-theme', 'mint')
      assert.deepEqual(writes, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }
  console.log('theme cycling, button colors, keyboard access, persistence, storage failures and independent login scene passed: PC, iPad, phone')
} finally { await browser.close() }
