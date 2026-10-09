import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function verifySubstitutionUI({ base, date, ownerLogin, substituteLogin, api }) {
  const browser = await chromium.launch({ headless: true, channel: process.env.UI_BROWSER_CHANNEL || undefined })
  try {
    for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 700]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1440, timezoneId: 'Asia/Shanghai' })
      try {
        await context.addInitScript(login => {
          localStorage.setItem('access_token', login.accessToken)
          localStorage.setItem('user', JSON.stringify(login.user))
        }, ownerLogin)
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(`${base}/weekly-schedule?date=${date}`)
        if (width < 600) await page.locator('.agenda-card').filter({ hasText: '代课测试课程' }).first().click()
        else await page.locator(`.day-lane[data-date="${date}"] .overlap-region`).click()
        await page.locator('.overlap-options button').filter({ hasText: '代课测试课程' }).click()
        await page.getByRole('button', { name: '安排代课', exact: true }).click()
        const modal = page.locator('.substitution-modal')
        await modal.locator('.n-base-selection').click()
        await page.locator('.n-base-select-option').filter({ hasText: '老师乙' }).click()
        await modal.getByPlaceholder('可选，例如原老师临时有事').fill('原老师临时有事')
        await modal.getByRole('button', { name: '确认代课' }).click()
        await modal.getByRole('alert').getByText('代课老师在此时段已有安排，是否仍安排？').waitFor()
        const unconfirmed = await api('GET', `/courses/occurrences?start=${date}&end=${date}`, ownerLogin, undefined, 200)
        assert.equal(unconfirmed.find(row => row.courseId === 'c1').teacherId, 't1')
        await modal.getByRole('button', { name: '返回修改' }).click()
        await modal.getByRole('button', { name: '确认代课' }).click()
        await modal.getByRole('button', { name: '仍然安排' }).waitFor()
        const box = await modal.boundingBox()
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${width}px 代课弹窗横向溢出`)
        assert.equal(await modal.evaluate(el => el.scrollWidth > el.clientWidth + 2), false)
        if (process.env.SUBSTITUTION_SCREENSHOTS === '1') await page.screenshot({ path: `../.qa/substitution-${width}.png` })
        await modal.getByRole('button', { name: '仍然安排' }).click()
        await modal.waitFor({ state: 'hidden' })
        await page.getByText('已安排本次代课，后续周次照常上课', { exact: true }).waitFor()
        const assigned = await api('GET', `/courses/occurrences?start=${date}&end=${date}`, ownerLogin, undefined, 200)
        assert.equal(assigned.find(row => row.courseId === 'c1').teacherId, 't2')
        await page.getByRole('button', { name: '我的课程', exact: true }).click()
        const ownCard = width < 600 ? page.locator('.agenda-card').filter({ hasText: '代课测试课程' }).first()
          : page.locator(`.day-lane[data-date="${date}"] .course-bar`).filter({ hasText: '代课测试课程' }).first()
        await ownCard.waitFor({ state: 'visible' })
        await api('PUT', '/courses/c1', substituteLogin, { name: '越权修改课程' }, 403)
        await api('DELETE', `/courses/c1/substitution/${date}`, ownerLogin, undefined, 200)
        assert.deepEqual(errors, [])
      } finally { await context.close() }
    }
    const substituteContext = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    try {
      const warning = await api('POST', '/courses/c1/substitution', ownerLogin, { originalDate: date, teacherId: 't2' }, 409)
      await api('POST', '/courses/c1/substitution', ownerLogin, { originalDate: date, teacherId: 't2', acknowledgedConflicts: warning.details.map(row => row.id) }, 200)
      await substituteContext.addInitScript(login => {
        localStorage.setItem('access_token', login.accessToken)
        localStorage.setItem('user', JSON.stringify(login.user))
      }, substituteLogin)
      const page = await substituteContext.newPage()
      await page.goto(`${base}/weekly-schedule?date=${date}`)
      await page.locator(`.day-lane[data-date="${date}"] .overlap-region`).click()
      await page.locator('.overlap-options button').filter({ hasText: '代课测试课程' }).click()
      await page.locator('.substitution-label').filter({ hasText: '临时代课：' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '更换代课老师' }).count(), 0)
      assert.equal(await page.getByRole('button', { name: '保存课程资料与名单' }).count(), 0)
      await api('DELETE', `/courses/c1/substitution/${date}`, ownerLogin, undefined, 200)
    } finally { await substituteContext.close() }
  } finally { await browser.close() }
}
