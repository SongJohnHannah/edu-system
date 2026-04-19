import { test, expect } from './fixtures.js'

test.describe('个人资料', () => {
  test('查看个人信息', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/profile')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
    await expect(adminPage.locator('text=admin')).toBeVisible()
  })

  test('修改密码 - 错误旧密码', async ({ adminPage }) => {
    await adminPage.goto('/profile')
    await adminPage.waitForLoadState('networkidle')
    const oldPw = adminPage.locator('input[placeholder*="旧密码"], input[placeholder*="当前密码"]')
    const newPw = adminPage.locator('input[placeholder*="新密码"]')
    const confirmPw = adminPage.locator('input[placeholder*="确认"]')
    if (await oldPw.count() > 0) {
      await oldPw.fill('wrongpassword')
      await newPw.fill('654321')
      if (await confirmPw.count() > 0) await confirmPw.fill('654321')
      await adminPage.click('button:has-text("修改"), button:has-text("保存")')
      await adminPage.waitForTimeout(1000)
    }
  })
})
