import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const sizes = [
  { name: 'PC', width: 1440, height: 900 },
  { name: 'iPad', width: 1024, height: 768, hasTouch: true },
  { name: 'iPad 竖屏', width: 768, height: 1024, hasTouch: true },
  { name: 'iPad 短窗口', width: 1024, height: 500, hasTouch: true, screen: { width: 1024, height: 768 } },
  { name: 'iPad 分屏', width: 500, height: 900, hasTouch: true, screen: { width: 768, height: 1024 } },
  { name: '手机', width: 390, height: 844 },
  { name: '窄屏手机', width: 320, height: 700, hasTouch: true },
  { name: '手机横屏', width: 844, height: 390, hasTouch: true },
  { name: '宽屏手机横屏', width: 956, height: 440, hasTouch: true }
]

function plusDays(date, count) {
  const day = new Date(`${date}T12:00:00`)
  day.setDate(day.getDate() + count)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

function course(id, date, teacherId, startTime, endTime) {
  const teacherName = teacherId === 't1' ? '林老师' : '陈老师'
  return {
    id: `${id}:${date}`, courseId: id, originalDate: date, date,
    name: `课程${id}`, teacherId, teacherName, startTime, endTime,
    studentIds: [teacherId === 't1' ? 's1' : 's2'], trialCount: 0,
    hoursPerClass: 1
  }
}

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, screen: size.screen,
      hasTouch: size.hasTouch || size.name.startsWith('手机') })
    let failWeekOnce = true
    let failTeachersOnce = size.name === 'PC'
    let occurrenceReads = 0
    let delayedStart = ''
    let releaseDelayedWeek
    const delayedWeek = new Promise(resolve => { releaseDelayedWeek = resolve })
    await context.addInitScript(() => {
      localStorage.setItem('access_token', 'weekly-two-weeks-test')
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', displayName: '测试管理员' }))
    })
    await context.route('**/edusystem/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = []
      let status = 200
      if (url.pathname.endsWith('/teachers')) payload = [
        { id: 't1', name: '林老师', status: 'active', createdAt: '2026-01-01' },
        { id: 't2', name: '陈老师', status: 'active', createdAt: '2026-01-02' }
      ]
      if (url.pathname.endsWith('/teachers') && failTeachersOnce) {
        failTeachersOnce = false; status = 503; payload = { error: '教师资料临时不可用' }
      }
      if (url.pathname.endsWith('/students')) payload = [
        { id: 's1', name: '安安', status: 'active', enrollmentStage: 'enrolled' },
        { id: 's2', name: '乐乐', status: 'active', enrollmentStage: 'enrolled' }
      ]
      if (url.pathname.endsWith('/adjustments')) payload = { once: [], future: [] }
      if (url.pathname.endsWith('/courses/occurrences')) {
        occurrenceReads++
        const start = url.searchParams.get('start')
        const first = plusDays(start, 2)
        const second = plusDays(start, 9)
        payload = [
          course('overlap-a', first, 't1', '09:00', '10:00'),
          course('overlap-b', first, 't2', '09:30', '10:30'),
          course('separate', first, 't2', '11:00', '12:00'),
          course('next-a', second, 't1', '09:00', '10:00'),
          course('next-b', second, 't2', '10:00', '11:00')
        ]
        if (failWeekOnce) { failWeekOnce = false; status = 503; payload = { error: '周排课临时不可用' } }
        if (start === delayedStart) {
          await delayedWeek
          status = 503
          payload = { error: '过期周加载失败' }
        }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4174/weekly-schedule', { waitUntil: 'domcontentloaded' })
    await page.getByText('周排课加载失败，请重试').waitFor({ state: 'visible' })
    if (occurrenceReads !== 1) throw new Error(`${size.name} 初次进入重复加载周课表`)
    if (await page.getByText('这两周暂无课程或试听安排').count()) throw new Error(`${size.name} 加载失败误报无安排`)
    await page.getByRole('button', { name: '重试' }).click()

    const compact = size.name.includes('手机')
    const block = page.locator(compact ? '.mobile-week-block' : '.combined-board')
    const cards = page.locator(compact ? '.agenda-card' : '.combined-board .course-bar')
    await cards.first().waitFor({ state: 'visible' })
    await page.locator('.toast.error').waitFor({ state: 'hidden', timeout: 1500 })
    if (await block.count() !== (compact ? 2 : 1) || await cards.count() !== 5) throw new Error(`${size.name} 未同时加载两周的五节课`)
    const positions = await (compact ? block : page.locator('.combined-week-head > span')).evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width }
    }))
    if (compact) {
      if (Math.abs(positions[0].x - positions[1].x) > 3 || positions[1].y <= positions[0].y) throw new Error('手机两周没有上下排列')
      for (const control of [page.locator('.mobile-day-head .day-move-button').first(), page.locator('.mobile-day-head button').last()]) {
        const box = await control.boundingBox()
        if (!box || box.width < 34 || box.height < 34) throw new Error(`${size.name} 逐日调课或建课入口过小`)
      }
    } else if (positions[1].x <= positions[0].x + positions[0].width - 3) throw new Error(`${size.name} 两周没有左右分栏`)
    if (size.name === 'iPad 分屏') {
      const headings = await page.locator('.combined-week-head > span').evaluateAll(elements => elements.map(element => {
        const label = element.querySelector('.combined-week-label')
        const button = element.querySelector('button')
        const labelBox = label.getBoundingClientRect()
        return { labelHeight: labelBox.height, clipped: label.scrollWidth > label.clientWidth + 1,
          buttonBelow: button.getBoundingClientRect().top >= labelBox.bottom }
      }))
      if (headings.some(heading => heading.labelHeight > 18 || heading.clipped || !heading.buttonBelow)) {
        throw new Error('iPad 分屏两周日期被创建按钮挤压或截断')
      }
    }
    if (!compact && await page.locator('.combined-grid .day-head').count() !== 14) throw new Error(`${size.name} 未在一张网格展示连续 14 天`)
    if (await page.locator(compact ? '.mobile-two-weeks' : '.combined-board').isHidden()) throw new Error(`${size.name} 对应课表未显示`)
    if (await page.locator(compact ? '.combined-board' : '.mobile-two-weeks').isVisible()) throw new Error(`${size.name} 显示了其他尺寸的课表`)
    if (compact && await page.locator('.mobile-two-weeks .drag-handle').count()) throw new Error('手机出现拖动手柄')
    if (await page.locator(compact ? '.phone-hint' : '.desktop-hint').isHidden()) throw new Error(`${size.name} 调课提示与布局不符`)
    if (!compact) {
      const fullCard = cards.filter({ hasText: '课程separate' })
      if (await fullCard.locator('.bar-meta').isHidden() || await fullCard.locator('.bar-bottom').isHidden()) throw new Error(`${size.name} 隐藏了 PC 课程卡上的时间或教师信息`)
      const nameWhiteSpace = await fullCard.locator('.bar-name').evaluate(element => getComputedStyle(element).whiteSpace)
      if (nameWhiteSpace !== 'nowrap') throw new Error(`${size.name} 课程名样式与 PC 单行课卡不一致`)
    }

    const markings = await cards.evaluateAll(elements => elements.map(element => ({
      name: element.querySelector('strong')?.textContent,
      overlap: element.classList.contains('has-overlap'),
      outline: element.closest('.overlap-region') ? getComputedStyle(element.closest('.overlap-region')).borderStyle : getComputedStyle(element).outlineStyle,
      teacher: element.style.getPropertyValue('--c-bg')
    })))
    const byName = Object.fromEntries(markings.map(marking => [marking.name, marking]))
    for (const id of ['overlap-a', 'overlap-b']) {
      const card = byName[`课程${id}`]
      if (!card?.overlap || card.outline !== 'dashed') throw new Error(`${size.name} 重叠课程未显示红色虚线：${id}`)
    }
    for (const id of ['separate', 'next-a', 'next-b']) {
      const card = byName[`课程${id}`]
      if (!card || card.overlap || card.outline === 'dashed') throw new Error(`${size.name} 非重叠课程误显示虚线：${id}`)
    }
    if (byName['课程overlap-a'].teacher === byName['课程overlap-b'].teacher) throw new Error(`${size.name} 两位教师课程颜色相同`)
    if (byName['课程overlap-a'].teacher !== byName['课程next-a'].teacher) throw new Error(`${size.name} 同一教师跨周颜色不一致`)
    if (byName['课程overlap-b'].teacher !== byName['课程next-b'].teacher) throw new Error(`${size.name} 同一教师跨周颜色不一致`)
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${size.name} 出现整页横向溢出`)
    if (errors.length) throw new Error(`${size.name} 页面脚本错误：${errors.join('; ')}`)
    if (process.env.WEEKLY_SCREENSHOTS === '1') await page.screenshot({ path: `.qa/weekly-${size.name}.png`, animations: 'disabled', timeout: 15000 })
    if (process.env.WEEKLY_SCREENSHOTS === '1' && size.name === '窄屏手机') {
      await page.locator('.mobile-day-head .day-move-button').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: '.qa/weekly-窄屏手机-controls.png', animations: 'disabled' })
    }
    if (compact) {
      await cards.first().scrollIntoViewIfNeeded()
      const box = await cards.first().boundingBox()
      const cdp = await context.newCDPSession(page)
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      await page.waitForTimeout(350)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 40, id: 1 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      if (await page.locator('.move-modal').isVisible() || await page.locator('.drag-ghost').count()) throw new Error(`${size.name} 长按滑动触发了拖动调课`)
    }
    const initialStart = (await page.locator('.weekly-head p').textContent()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
    delayedStart = plusDays(initialStart, 14)
    const latestStart = plusDays(initialStart, 28)
    const delayedRequest = page.waitForRequest(request => request.url().includes('/courses/occurrences?') && request.url().includes(`start=${delayedStart}`))
    await page.getByRole('button', { name: '下两周' }).click()
    await delayedRequest
    await page.getByRole('button', { name: '下两周' }).click()
    await page.waitForFunction(start => document.querySelector('.weekly-head p')?.textContent?.startsWith(start) && !!document.querySelector('.combined-board .course-bar, .mobile-two-weeks .agenda-card'), latestStart)
    const staleResponse = page.waitForResponse(response => response.url().includes('/courses/occurrences?') && response.url().includes(`start=${delayedStart}`) && response.status() === 503)
    releaseDelayedWeek()
    await staleResponse
    await page.waitForTimeout(50)
    if (!(await page.locator('.weekly-head p').textContent()).startsWith(latestStart)) throw new Error(`${size.name} 旧周请求覆盖了最后选择的两周`)
    if (await cards.count() !== 5 || await page.getByText('周排课加载失败，请重试').count()) throw new Error(`${size.name} 过期周的错误清空了新周课次`)
    const linkedDate = plusDays(initialStart, 28)
    await page.evaluate(date => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ path: '/weekly-schedule', query: { date } }), linkedDate)
    await page.waitForFunction(date => document.querySelector('.weekly-head p')?.textContent?.includes(date), linkedDate, { timeout: 5000 })
    await cards.first().waitFor({ state: 'visible' })
    await cards.filter({ hasText: '课程next-a' }).click()
    await page.locator('.detail-modal h2').getByText('课程next-a').waitFor({ state: 'visible' })
    await context.close()
  }
  console.log('两周布局、教师区分色、实际时间重叠红色虚线、PC/iPad/含宽屏的手机竖横屏均通过')
} finally {
  await browser.close()
}
