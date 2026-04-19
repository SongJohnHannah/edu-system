import { test, expect } from './fixtures.js'

test.describe('教师统计', () => {
  test('统计页面加载', async ({ adminPage, consoleErrors }) => {
    await adminPage.goto('/teacher-stats')
    await adminPage.waitForLoadState('networkidle')
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_CONNECTION_CLOSED'))).toHaveLength(0)
  })

  test('时间范围筛选', async ({ adminPage }) => {
    await adminPage.goto('/teacher-stats')
    await adminPage.waitForLoadState('networkidle')
    const btns = ['今日', '本周', '本月', '本年']
    for (const text of btns) {
      const btn = adminPage.locator(`button:has-text("${text}")`).first()
      if (await btn.isVisible()) {
        await btn.click()
        await adminPage.waitForTimeout(500)
      }
    }
  })
})
