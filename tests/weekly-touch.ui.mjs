import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true })
await context.addInitScript(() => {
  localStorage.setItem('access_token', 'touch-test-only')
  localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
})
await context.route('**/edusystem/api/**', async route => {
  const url = new URL(route.request().url())
  let payload = []
  if (url.pathname.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
  if (url.pathname.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
  if (url.pathname.endsWith('/adjustments')) payload = { once: [], future: [] }
  if (url.pathname.endsWith('/courses/occurrences')) {
    const d = new Date(`${url.searchParams.get('start')}T12:00:00`)
    d.setDate(d.getDate() + 8)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    payload = [{ id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读与表达', teacherId: 't1', teacherName: '林老师', startTime: '10:00', endTime: '11:00', studentIds: ['s1'], trialCount: 0, hoursPerClass: 1 }]
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded', timeout: 15000 })
const card = page.locator('.combined-board .course-bar').first()
await card.waitFor({ state: 'visible', timeout: 15000 })
await card.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }))
await page.waitForTimeout(750)
let box = await card.boundingBox()
let x = box.x + box.width / 2
let y = box.y + box.height / 2
await card.evaluate((element, point) => {
  const options = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: point.x, clientY: point.y }
  element.dispatchEvent(new PointerEvent('pointerdown', options))
  window.dispatchEvent(new PointerEvent('pointerup', options))
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}, { x, y })
if (!await page.locator('.detail-modal').isVisible()) throw new Error('iPad 点击课程未打开详情')
await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
await card.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }))
await page.waitForTimeout(200)
box = await card.boundingBox()
x = box.x + box.width / 2
y = box.y + box.height / 2
await card.evaluate((element, point) => {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 2, isPrimary: true, clientX: point.x, clientY: point.y }))
}, { x, y })
await page.waitForTimeout(340)
await page.evaluate(point => {
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 2, isPrimary: true, clientX: point.x, clientY: point.y + 25 }))
}, { x, y })
await page.waitForTimeout(80)
await page.evaluate(point => {
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 2, isPrimary: true, clientX: point.x, clientY: point.y + 25 }))
  document.querySelector('.combined-board .course-bar')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}, { x, y })
await page.waitForTimeout(300)
if (!await page.locator('.move-modal').isVisible()) throw new Error('iPad 模拟长按拖动未打开调课确认')
if (await page.locator('.detail-modal').isVisible()) throw new Error('iPad 长按拖动误开详情')
if (errors.length) throw new Error(errors.join('; '))
console.log(JSON.stringify({ syntheticTouchTapOpensDetail: true, syntheticTouchHoldDragOpensMove: true, pageErrors: 0 }))
await browser.close()
