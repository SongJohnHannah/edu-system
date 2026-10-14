import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const portrait = process.env.IPAD_PORTRAIT === '1'
const shortWindow = process.env.IPAD_SHORT_WINDOW === '1'
const splitWindow = process.env.IPAD_SPLIT === '1'
const context = await browser.newContext({ viewport: splitWindow ? { width: 500, height: 900 } : shortWindow ? { width: 1024, height: 500 } : portrait ? { width: 768, height: 1024 } : { width: 1024, height: 768 },
  screen: splitWindow ? { width: 768, height: 1024 } : shortWindow ? { width: 1024, height: 768 } : undefined,
  hasTouch: true, timezoneId: 'Asia/Shanghai' })
try {
  await context.addInitScript(() => {
    localStorage.setItem('access_token', 'native-touch-test')
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'admin', displayName: '管理员' }))
  })
  const date = '2026-09-30'
  await context.route('**/edusystem/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let payload = []
    if (path.endsWith('/teachers')) payload = [{ id: 't1', name: '林老师', status: 'active' }]
    if (path.endsWith('/students')) payload = [{ id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' }]
    if (path.endsWith('/courses/occurrences')) payload = [{
      id: `c1:${date}`, courseId: 'c1', originalDate: date, date, name: '阅读与表达',
      teacherId: 't1', teacherName: '林老师', startTime: '10:00', endTime: '11:00',
      studentIds: ['s1'], trialCount: 0, hoursPerClass: 1
    }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.clock.install({ time: new Date('2026-09-28T08:00:00+08:00') })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
  })
  async function dragToDate(date, y) {
    const board = await page.locator('.board-scroll').boundingBox()
    const target = page.locator(`.combined-grid .day-head[data-date="${date}"]`)
    for (let attempt = 0; attempt < 40; attempt++) {
      const box = await target.boundingBox()
      const x = box.x + box.width / 2
      if (x > board.x + 75 && x < board.x + board.width - 60) {
        await touch('touchMove', x, y)
        return { x, y }
      }
      await touch('touchMove', x > board.x + board.width - 60 ? board.x + board.width - 12 : board.x + 55, y)
      await page.waitForTimeout(100)
    }
    throw new Error('拖动到边缘后，日历没有滚动到目标日期')
  }

  async function openGrid() {
    await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    await page.addStyleTag({ content: '*,*::before,*::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
    const card = page.locator('.combined-board .course-bar').first()
    await card.waitFor({ state: 'visible' })
    await card.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }))
    const box = await card.boundingBox()
    if (!box) throw new Error('iPad 课程卡不可见')
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  let point = await openGrid()
  await touch('touchStart', point.x, point.y)
  await touch('touchEnd', point.x, point.y)
  await page.locator('.detail-modal').waitFor({ state: 'visible' })
  if (await page.locator('.move-modal').isVisible()) throw new Error('原生轻触误进入调课')

  point = await openGrid()
  await touch('touchStart', point.x, point.y)
  await touch('touchMove', point.x, point.y + 35)
  await touch('touchEnd', point.x, point.y + 35)
  await page.waitForTimeout(200)
  if (await page.locator('.move-modal').isVisible()) throw new Error('未长按的滑动误进入调课')

  point = await openGrid()
  await touch('touchStart', point.x, point.y)
  await page.waitForTimeout(350)
  await touch('touchMove', point.x, point.y + 35)
  await page.waitForTimeout(80)
  await touch('touchEnd', point.x, point.y + 35)
  await page.locator('.move-modal').waitFor({ state: 'visible' })
  if (await page.locator('.detail-modal').isVisible()) throw new Error('原生长按拖动误打开详情')
  const targetTime = (await page.locator('.move-modal .end-time-preview').textContent()).trim()
  if (targetTime === '11:00' || !/^\d{2}:(00|30)$/.test(targetTime)) throw new Error(`原生拖动没有进入新的半小时档位：${targetTime}`)

  point = await openGrid()
  await touch('touchStart', point.x, point.y)
  await page.waitForTimeout(350)
  const nextWeekPoint = await dragToDate('2026-10-07', point.y)
  await page.waitForTimeout(80)
  await touch('touchEnd', nextWeekPoint.x, nextWeekPoint.y)
  const crossWeekMove = page.locator('.move-modal').filter({ hasText: '确认调课' })
  await crossWeekMove.waitFor({ state: 'visible' })
  if (await crossWeekMove.locator('.office-date-picker input').inputValue() !== '2026-10-07') {
    throw new Error('iPad 单节跨周触屏拖动没有选中第二周日期')
  }

  await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
  const dayHandle = page.getByRole('button', { name: `拖动或点击整体调整 ${date} 的课程` })
  await dayHandle.waitFor({ state: 'visible' })
  await dayHandle.scrollIntoViewIfNeeded()
  const source = await dayHandle.boundingBox()
  const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 }
  await touch('touchStart', from.x, from.y)
  await page.waitForTimeout(350)
  const to = await dragToDate('2026-10-01', from.y)
  await page.waitForTimeout(80)
  await touch('touchEnd', to.x, to.y)
  const dayModal = page.locator('.move-modal').filter({ hasText: '整天调课确认' })
  await dayModal.waitFor({ state: 'visible' })
  if (await dayModal.locator('.office-date-picker input').inputValue() !== '2026-10-01') throw new Error('iPad 整天触屏拖动没有选中目标日期')
  await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
  const crossWeekDayHandle = page.getByRole('button', { name: `拖动或点击整体调整 ${date} 的课程` })
  await crossWeekDayHandle.waitFor({ state: 'visible' })
  await crossWeekDayHandle.scrollIntoViewIfNeeded()
  const crossWeekSource = await crossWeekDayHandle.boundingBox()
  await touch('touchStart', crossWeekSource.x + crossWeekSource.width / 2, crossWeekSource.y + crossWeekSource.height / 2)
  await page.waitForTimeout(350)
  const crossWeekDestination = await dragToDate('2026-10-07', crossWeekSource.y + crossWeekSource.height / 2)
  await page.waitForTimeout(80)
  await touch('touchEnd', crossWeekDestination.x, crossWeekDestination.y)
  await dayModal.waitFor({ state: 'visible' })
  if (await dayModal.locator('.office-date-picker input').inputValue() !== '2026-10-07') {
    throw new Error('iPad 整天跨周触屏拖动没有选中第二周日期')
  }
  if (errors.length) throw new Error(errors.join('; '))
  console.log(`iPad ${splitWindow ? '分屏' : shortWindow ? '短窗口' : portrait ? '竖屏' : '横屏'} Chromium 原生触控：轻触详情、即时滑动不调课、单节与整天长按跨周拖动均打开目标确认`)
} finally {
  await context.close()
  await browser.close()
}
