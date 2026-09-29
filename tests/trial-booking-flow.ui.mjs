import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  for (const [device, viewport] of [
    ['PC', { width: 1440, height: 900 }],
    ['iPad', { width: 1024, height: 768 }],
    ['phone', { width: 390, height: 844 }],
    ['phone-small', { width: 320, height: 700 }]
  ]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'trial-flow-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '测试管理员' }))
    })
    const bookings = [{
      id: 'booking-1', studentId: 'student-1', studentName: '试听学生',
      teacherId: 'teacher-1', teacherName: '林老师', date: '2099-01-05',
      startTime: '16:00', endTime: '17:00', note: '初始备注', status: 'active',
      courseId: null, occurrenceDate: null
    }]
    const writes = []
    let students = [{ id: 'student-1', name: '试听学生', status: 'active', enrollmentStage: 'pending' }]
    let teachers = [{ id: 'teacher-1', name: '林老师', status: 'active' }]
    let studentReads = 0
    let bookingReads = 0
    let occurrenceReads = 0
    let failBookingReadAfterWrite = false
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let data = []
      if (path.endsWith('/students')) {
        studentReads++
        if (studentReads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '学生资料暂不可用' }) })
        data = students
      }
      else if (path.endsWith('/teachers')) data = teachers
      else if (path.endsWith('/courses/occurrences')) {
        occurrenceReads++
        if (occurrenceReads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '当日课程暂不可用' }) })
        data = []
      }
      else if (path.endsWith('/trial-bookings') && request.method() === 'GET') {
        bookingReads++
        if (bookingReads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '预约列表暂不可用' }) })
        if (failBookingReadAfterWrite) {
          failBookingReadAfterWrite = false
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '写入后列表读取失败' }) })
        }
        data = bookings
      }
      else if (path.endsWith('/trial-bookings/booking-1') && request.method() === 'PUT') {
        const payload = request.postDataJSON()
        writes.push({ method: 'PUT', payload })
        Object.assign(bookings[0], { note: payload.note })
        data = bookings[0]
        failBookingReadAfterWrite = true
      } else if (path.endsWith('/trial-bookings/booking-1/cancel') && request.method() === 'POST') {
        writes.push({ method: 'CANCEL' })
        bookings[0].status = 'cancelled'
        data = { success: true }
        failBookingReadAfterWrite = true
      } else throw new Error(`unexpected API request: ${request.method()} ${path}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })

    const page = await context.newPage()
    page.setDefaultTimeout(6000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.getByText('学生或教师资料加载失败，请重试').waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await page.getByRole('button', { name: '新增预约' }).isDisabled(), true, `${device}: reference failure still allows creating`)
    await page.getByRole('button', { name: '重试' }).click()
    await page.getByText('预约加载失败，请重试').waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: '新增预约' }).isDisabled(), true, `${device}: booking failure still allows creating`)
    await page.getByRole('button', { name: '重试' }).click()
    const card = page.locator('.booking-card').filter({ hasText: '试听学生' })
    await card.waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    await card.getByRole('button', { name: '编辑', exact: true }).evaluate(button => button.click())
    const editor = page.locator('.editor-modal')
    await editor.waitFor({ state: 'visible', timeout: 10000 })
    if (device === 'phone-small') {
      const box = await editor.boundingBox()
      if (!box || box.x < 0 || box.x + box.width > viewport.width ||
          await editor.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 预约弹窗横向裁切')
      if (process.env.MODAL_SCREENSHOTS === '1') await page.screenshot({ path: '.qa/modal-320-trial.png', animations: 'disabled' })
    }
    await editor.getByText('当日课程加载失败').waitFor({ state: 'visible' })
    assert.equal(await editor.getByRole('button', { name: '保存预约' }).isDisabled(), true, `${device}: occurrence failure still allows saving`)
    await editor.getByRole('button', { name: '重试' }).click()
    await editor.getByText('当日课程加载失败').waitFor({ state: 'hidden' })
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    await editor.locator('textarea').fill('更新后的备注')
    await editor.getByRole('button', { name: '保存预约' }).evaluate(button => button.click())
    await page.locator('.toast.warning').getByText('预约已保存，列表刷新失败，请重试').waitFor({ state: 'visible' })
    await page.getByText('预约加载失败，请重试').waitFor({ state: 'visible' })
    await page.locator('.toast.error').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '重试' }).click()
    await card.getByText('备注：更新后的备注').waitFor({ state: 'attached', timeout: 10000 })
    assert.equal(writes.length, 1, `${device}: edit request count`)
    assert.equal(writes[0].method, 'PUT', `${device}: edit method`)
    assert.equal(writes[0].payload.note, '更新后的备注', `${device}: edited note`)
    assert.equal(writes[0].payload.courseId, null, `${device}: independent trial unexpectedly linked to a course`)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
    await card.getByText('备注：更新后的备注').waitFor({ state: 'visible', timeout: 10000 })

    await card.getByRole('button', { name: '取消预约' }).evaluate(button => button.click())
    const confirm = page.locator('.n-dialog').filter({ hasText: '取消试听预约' })
    await confirm.waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(writes.length, 1, `${device}: cancel wrote before confirmation`)
    await confirm.getByRole('button', { name: '确认取消' }).evaluate(button => button.click())
    await page.locator('.toast.warning').getByText('预约已取消，列表刷新失败，请重试').waitFor({ state: 'visible' })
    await page.getByText('预约加载失败，请重试').waitFor({ state: 'visible' })
    await page.locator('.toast.error').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '重试' }).click()
    await card.getByText('已取消', { exact: true }).waitFor({ state: 'attached', timeout: 10000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
    await card.getByText('已取消', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    assert.deepEqual(writes.map(write => write.method), ['PUT', 'CANCEL'], `${device}: unexpected write sequence`)
    assert.equal(await card.locator('.booking-actions').count(), 0, `${device}: cancelled booking still has actions`)

    bookings.push({
      id: 'booking-2', studentId: 'student-1', studentName: '试听学生',
      teacherId: 'teacher-1', teacherName: '林老师', date: '2099-01-06',
      startTime: '10:00', endTime: '11:00', note: '第二笔预约', status: 'active',
      courseId: null, occurrenceDate: null
    })
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/trial-bookings?date=2099-01-06&booking=booking-2'))
    await editor.waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(await editor.locator('textarea').inputValue(), '第二笔预约', `${device}: same-page booking link did not open its editor`)
    assert.equal(await page.locator('.filters input[type="date"]').inputValue(), '2099-01-06', `${device}: linked date was not applied`)
    assert.deepEqual(writes.map(write => write.method), ['PUT', 'CANCEL'], `${device}: linked booking caused an unexpected write`)

    students = [{ ...students[0], enrollmentStage: 'enrolled' }]
    await page.goto('http://127.0.0.1:4174/trial-bookings', { waitUntil: 'domcontentloaded' })
    await page.locator('.booking-card').first().waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: '新增预约' }).isDisabled(), true, `${device}: no pending student still allows creating`)
    await page.locator('.create-prerequisite').getByRole('link', { name: '学生管理' }).waitFor({ state: 'visible' })
    students = [{ ...students[0], enrollmentStage: 'pending' }]
    teachers = [{ ...teachers[0], status: 'deleted' }]
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.booking-card').first().waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: '新增预约' }).isDisabled(), true, `${device}: stopped teacher still allows creating`)
    await page.locator('.create-prerequisite').getByRole('link', { name: '教师信息' }).waitFor({ state: 'visible' })
    assert.deepEqual(writes.map(write => write.method), ['PUT', 'CANCEL'], `${device}: unavailable references caused an unexpected write`)

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${device}: horizontal overflow`)
    assert.deepEqual(errors, [], `${device}: page errors`)
    await context.close()
    console.log(`${device}: edit, cancel, history, and creation prerequisites passed`)
  }
} finally {
  await browser.close()
}
