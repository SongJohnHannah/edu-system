import { test, expect, ApiClient } from './fixtures.js'

test.describe('数据备份', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('导出备份 SQL', async ({ adminPage }) => {
    await adminPage.goto('/')
    await adminPage.waitForLoadState('networkidle')
    const backupBtn = adminPage.locator('button:has-text("备份"), button:has-text("数据"), [title="数据备份"]').first()
    if (await backupBtn.isVisible()) {
      await backupBtn.click()
      await adminPage.waitForTimeout(500)
      const exportBtn = adminPage.locator('.modal button:has-text("导出"), .modal button:has-text("下载")')
      if (await exportBtn.isVisible()) {
        const [download] = await Promise.all([
          adminPage.waitForEvent('download'),
          exportBtn.click(),
        ])
        expect(download.suggestedFilename()).toContain('.sql')
      }
    }
  })

  test('API 备份数据为 SQL 格式', async () => {
    const res = await api.get('/backup/export')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('INSERT INTO')
  })
})
