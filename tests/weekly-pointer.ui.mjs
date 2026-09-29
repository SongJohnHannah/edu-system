import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem('access_token', 'pointer-test-only')
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
    d.setDate(d.getDate() + 2)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    payload = [{ id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读与表达', teacherId: 't1', teacherName: '林老师', startTime: '10:00', endTime: '11:00', studentIds: ['s1'], trialCount: 0, hoursPerClass: 1 }]
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.clock.install({ time: new Date('2026-09-28T08:00:00+08:00') })
await page.goto('http://127.0.0.1:4174/weekly-schedule')
await page.addStyleTag({ content: '*,*::before,*::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
const card = page.locator('.combined-board .course-bar').first()
await card.waitFor()
const point = async () => {
  const box = await card.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
let p = await point()
await page.mouse.click(p.x, p.y)
if (!await page.locator('.detail-modal').isVisible()) throw new Error('短按未打开详情弹窗')
await page.reload()
await card.waitFor()

p = await point()
await page.mouse.move(p.x, p.y)
await page.mouse.down()
await page.mouse.move(p.x + 4, p.y)
await page.mouse.up()
await page.waitForTimeout(150)
if (!await page.locator('.detail-modal').isVisible() || await page.locator('.move-modal').isVisible()) throw new Error('轻微抖动应视为单击详情')
await page.reload()
await card.waitFor()

p = await point()
await page.mouse.move(p.x, p.y)
await page.mouse.down()
await page.mouse.move(p.x, p.y + 25)
await page.mouse.up()
await page.waitForTimeout(150)
if (await page.locator('.move-modal').isVisible()) throw new Error('从课程正文移动鼠标误进入调课')
await page.reload()
await card.waitFor()

const handle = card.locator('.drag-handle')
await handle.waitFor()
const handleBox = await handle.boundingBox()
p = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }
await page.mouse.move(p.x, p.y)
await page.mouse.down()
await page.mouse.move(p.x, p.y + 25)
await page.mouse.up()
await page.waitForTimeout(250)
if (!await page.locator('.move-modal').isVisible()) throw new Error('拖动柄未打开调课确认')
if (await page.locator('.detail-modal').isVisible()) throw new Error('拖动结束误打开详情弹窗')
await page.reload()
await card.waitFor()
const crossHandle = card.locator('.drag-handle')
const crossBox = await crossHandle.boundingBox()
p = { x: crossBox.x + crossBox.width / 2, y: crossBox.y + crossBox.height / 2 }
const otherLane = await page.locator('.combined-grid .day-lane').nth(9).boundingBox()
await page.mouse.move(p.x, p.y)
await page.mouse.down()
await page.mouse.move(otherLane.x + otherLane.width / 2, otherLane.y + 150)
await page.mouse.up()
await page.waitForTimeout(180)
if (!await page.locator('.move-modal').isVisible() || await page.locator('.detail-modal').isVisible()) throw new Error('跨周拖动未进入调课确认')
const targetDate = await page.locator('.move-modal input[type="date"]').inputValue()
if (targetDate !== await page.locator('.combined-grid .day-lane').nth(9).getAttribute('data-date')) throw new Error('跨周拖动目标日期错误')
if (errors.length) throw new Error(errors.join('; '))
console.log(JSON.stringify({ shortClickOpensDetail: true, tinyMovementOpensDetail: true, bodyMovementDoesNotDrag: true, handleDragOpensMove: true, crossWeekDragOpensMove: true, pageErrors: 0 }))
await browser.close()
