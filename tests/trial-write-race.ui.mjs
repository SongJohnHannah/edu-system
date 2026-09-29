import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const booking = (id, note) => ({ id, studentId: 'student-1', studentName: id, teacherId: 'teacher-1', teacherName: '林老师', date: '2099-01-05', startTime: '16:00', endTime: '17:00', note, status: 'active', courseId: null, occurrenceDate: null })
const browser = await chromium.launch({ headless: true })
try {
  for (const [device, viewport] of [['PC', { width: 1440, height: 900 }], ['iPad', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-race-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '测试管理员' }))
    })
    const rows = [booking('booking-a', '预约 A'), booking('booking-b', '预约 B')]
    let releaseEdit, releaseCancel
    const editHeld = new Promise(resolve => { releaseEdit = resolve })
    const cancelHeld = new Promise(resolve => { releaseCancel = resolve })
    let editStarted, cancelStarted
    const editStart = new Promise(resolve => { editStarted = resolve })
    const cancelStart = new Promise(resolve => { cancelStarted = resolve })
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let data
      if (path.endsWith('/students')) data = [{ id: 'student-1', name: '试听学生', status: 'active', enrollmentStage: 'pending' }]
      else if (path.endsWith('/teachers')) data = [{ id: 'teacher-1', name: '林老师', status: 'active' }]
      else if (path.endsWith('/courses/occurrences')) data = []
      else if (path.endsWith('/trial-bookings') && request.method() === 'GET') data = rows
      else if (path.endsWith('/trial-bookings/booking-a') && request.method() === 'PUT') {
        editStarted()
        await editHeld
        rows[0].note = request.postDataJSON().note
        data = rows[0]
      } else if (path.endsWith('/trial-bookings/booking-a/cancel') && request.method() === 'POST') {
        cancelStarted()
        await cancelHeld
        rows[0].status = 'cancelled'
        data = { success: true }
      } else throw new Error(`unexpected API: ${request.method()} ${path}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    const cardA = page.locator('.booking-card').filter({ hasText: 'booking-a' })
    const cardB = page.locator('.booking-card').filter({ hasText: 'booking-b' })
    await cardA.waitFor({ state: 'visible' })
    await cardA.getByRole('button', { name: '编辑' }).click()
    const editor = page.locator('.editor-modal')
    await editor.waitFor({ state: 'visible' })
    await editor.locator('textarea').fill('A 已保存')
    await editor.getByRole('button', { name: '保存预约' }).click()
    await editStart
    await editor.getByRole('button', { name: '返回' }).click()
    await cardB.getByRole('button', { name: '编辑' }).click()
    await editor.locator('textarea').waitFor({ state: 'visible' })
    releaseEdit()
    await cardA.getByText('备注：A 已保存').waitFor({ state: 'attached' })
    assert.equal(await editor.isVisible(), true, `${device}: old save closed newer editor`)
    assert.equal(await editor.locator('textarea').inputValue(), '预约 B', `${device}: old save changed newer form`)
    await editor.getByRole('button', { name: '返回' }).click()

    await cardA.getByRole('button', { name: '取消预约' }).click()
    const dialog = page.locator('.n-dialog').filter({ hasText: '取消试听预约' })
    await dialog.getByRole('button', { name: '确认取消' }).click()
    await cancelStart
    await dialog.getByRole('button', { name: '保留预约' }).click()
    await cardB.getByRole('button', { name: '取消预约' }).click()
    await dialog.getByText('booking-b · 2099-01-05 16:00').waitFor({ state: 'visible' })
    releaseCancel()
    await cardA.getByText('已取消', { exact: true }).waitFor({ state: 'attached' })
    assert.equal(await dialog.isVisible(), true, `${device}: old cancel closed newer dialog`)
    assert.deepEqual(errors, [], `${device}: page errors`)
    await context.close()
    console.log(`${device}: stale trial save and cancel keep newer dialogs`)
  }
} finally {
  await browser.close()
}
