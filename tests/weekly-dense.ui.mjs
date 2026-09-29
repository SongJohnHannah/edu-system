import { chromium } from '@playwright/test'

const names = ['林老师', '陈老师', '周老师', '吴老师', '何老师', '许老师', '郑老师', '唐老师', '孙老师', '赵老师', '刘老师', '马老师']
const slots = [
  ['08:00', '09:00'], ['10:00', '11:00'], ['13:00', '14:00'],
  ['16:00', '16:30'], ['19:00', '20:00']
]
const sizes = [
  { name: 'pc', width: 1440, height: 900 },
  { name: 'ipad', width: 1024, height: 768 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 }
]

function plusDays(date, count) {
  const day = new Date(`${date}T12:00:00`)
  day.setDate(day.getDate() + count)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

function fixture(start) {
  const rows = []
  for (let day = 0; day < 14; day++) {
    const date = plusDays(start, day)
    for (let slot = 0; slot < slots.length; slot++) {
      const teacher = (day + slot) % names.length
      const id = `d${day}-s${slot}`
      rows.push({
        id: `${id}:${date}`, courseId: id, originalDate: date, date,
        name: slot === 3 ? '书法' : ['阅读写作进阶', '数学思维训练', '英语口语表达', '', '科学探索实验'][slot],
        teacherId: `t${teacher}`, teacherName: names[teacher],
        startTime: slots[slot][0], endTime: slots[slot][1],
        studentIds: [`student-${day}-${slot}`], trialCount: slot === 2 && day % 3 === 0 ? 1 : 0,
        hoursPerClass: slot === 3 ? 0.5 : 1
      })
    }
    if (day === 3 || day === 10) {
      const teacher = (day + 6) % names.length
      const id = `overlap-${day}`
      rows.push({
        id: `${id}:${date}`, courseId: id, originalDate: date, date,
        name: '演讲训练', teacherId: `t${teacher}`, teacherName: names[teacher],
        startTime: '10:30', endTime: '11:30', studentIds: [`overlap-${day}`],
        trialCount: 0, hoursPerClass: 1
      })
    }
  }
  return rows
}

const browser = await chromium.launch({ headless: true })
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, timezoneId: 'Asia/Shanghai' })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-dense-test-only')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      if (url.pathname.endsWith('/teachers')) payload = names.map((name, index) => ({
        id: `t${index}`, name, status: 'active', createdAt: `2026-01-${String(index + 1).padStart(2, '0')}`
      }))
      if (url.pathname.endsWith('/students')) payload = []
      if (url.pathname.endsWith('/courses/occurrences')) payload = fixture(url.searchParams.get('start'))
      if (url.pathname.endsWith('/adjustments')) payload = { once: [], future: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/weekly-schedule')
    const cards = page.locator(size.width >= 600 ? '.combined-board .course-bar' : '.mobile-two-weeks .agenda-card')
    await cards.first().waitFor({ state: 'visible' })
    await page.waitForTimeout(1100)
    if (await cards.count() !== 72) throw new Error(`${size.name}: 预期两周 72 节课`)
    if (size.name === 'pc') {
      const paint = await cards.first().evaluate(element => {
        const box = element.getBoundingClientRect()
        const parent = element.parentElement.getBoundingClientRect()
        const style = getComputedStyle(element)
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return { box: { x: box.x, y: box.y, width: box.width, height: box.height },
          parent: { x: parent.x, y: parent.y, width: parent.width, height: parent.height },
          opacity: style.opacity, background: style.backgroundColor, display: style.display,
          hitCard: element.contains(top), topElement: top?.className || top?.tagName }
      })
      if (Number(paint.opacity) < 0.9 || paint.box.width < 10 || paint.box.height < 10 || !paint.hitCard) {
        throw new Error(`PC: 课卡未正常绘制 ${JSON.stringify(paint)}`)
      }
      if (process.env.WEEKLY_DENSE_SCREENSHOTS === '1') console.log(`PC first card paint: ${JSON.stringify(paint)}`)
    }
    const colors = await cards.evaluateAll(elements => [...new Set(elements.map(el => el.style.getPropertyValue('--c-bg')))])
    if (colors.length !== names.length) throw new Error(`${size.name}: ${names.length} 位教师仅有 ${colors.length} 种颜色`)
    if (await cards.filter({ has: page.locator('.trial-count') }).count() < 4) throw new Error(`${size.name}: 试听标记丢失`)
    const overlap = await cards.evaluateAll(elements => elements.filter(el => el.classList.contains('has-overlap')).length)
    if (overlap !== 4) throw new Error(`${size.name}: 只有两组真正重叠的四张课卡应有红色虚线，实得 ${overlap}`)
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) throw new Error(`${size.name}: 页面横向溢出`)
    const weeks = await page.locator(size.width >= 600 ? '.combined-week-head > span' : '.mobile-week-block').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width }
    }))
    if (weeks.length !== 2) throw new Error(`${size.name}: 缺少两周`)
    if (size.name === 'phone' ? weeks[1].y <= weeks[0].y : weeks[1].x <= weeks[0].x + weeks[0].width - 3) {
      throw new Error(`${size.name}: 两周排列方向错误`)
    }
    if (process.env.WEEKLY_DENSE_SCREENSHOTS === '1') {
      await page.screenshot({ path: `.qa/weekly-dense-${size.name}.png` })
      if (size.name === 'phone') {
        await page.locator('.mobile-week-block').nth(1).scrollIntoViewIfNeeded()
        await page.screenshot({ path: '.qa/weekly-dense-phone-week2.png' })
      }
    }
    await cards.first().click()
    await page.locator('.detail-modal').waitFor({ state: 'visible' })
    if (size.name === 'ipad-portrait') {
      await page.keyboard.press('Escape')
      await cards.filter({ hasText: '演讲训练' }).first().click()
      await page.locator('.detail-modal').getByText('演讲训练').first().waitFor({ state: 'visible' })
    }
    if (errors.length) throw new Error(`${size.name}: ${errors.join('; ')}`)
    await context.close()
  }
  console.log('dense 72-class two-week layout, 12 teacher colors, trial markers and overlap outlines passed: PC, iPad landscape/portrait, phone')
} finally {
  await browser.close()
}
