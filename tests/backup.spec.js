import { test, expect, ApiClient } from './fixtures.js'

test.describe('数据备份', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('导出备份 JSON', async ({ adminPage }) => {
    await adminPage.goto('/')
    await adminPage.waitForLoadState('networkidle')
    const backupBtn = adminPage.locator('button:has-text("备份"), button:has-text("数据"), [title="备份"]').first()
    if (await backupBtn.isVisible()) {
      await backupBtn.click()
      await adminPage.waitForTimeout(500)
      const exportBtn = adminPage.locator('.modal button:has-text("导出"), .modal button:has-text("下载")')
      if (await exportBtn.isVisible()) {
        const [download] = await Promise.all([
          adminPage.waitForEvent('download'),
          exportBtn.click(),
        ])
        expect(download.suggestedFilename()).toContain('.json')
      }
    }
  })

  test('API 备份数据结构正确', async () => {
    const res = await api.get('/backup/export')
    expect(res.status).toBe(200)
    const body = await res.json()
    const data = body.data || body
    expect(data).toHaveProperty('students')
    expect(data).toHaveProperty('teachers')
    expect(data).toHaveProperty('courses')
    expect(data).toHaveProperty('attendance')
    expect(data).toHaveProperty('hourRecords')
    expect(data).toHaveProperty('classes')
  })
})
