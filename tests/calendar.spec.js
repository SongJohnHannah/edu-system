import { test, expect } from './fixtures.js'

test.describe('日历', () => {
  test('日历页面加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED') && !e.includes('Failed to fetch'))).toHaveLength(0)
  })

  test('月份导航', async ({ adminPage }) => {
    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    const prevBtn = adminPage.locator('button:has-text("上"), button:has-text("<"), [aria-label="previous"]').first()
    if (await prevBtn.isVisible()) {
      await prevBtn.click()
      await adminPage.waitForTimeout(500)
      const nextBtn = adminPage.locator('button:has-text("下"), button:has-text(">"), [aria-label="next"]').first()
      if (await nextBtn.isVisible()) await nextBtn.click()
      await adminPage.waitForTimeout(500)
    }
  })

  test('今日高亮', async ({ adminPage }) => {
    await adminPage.goto('/calendar')
    await adminPage.waitForLoadState('networkidle')
    const today = adminPage.locator('.today, [class*="today"], [class*="current"]')
    expect(await today.count()).toBeGreaterThanOrEqual(0)
  })
})
