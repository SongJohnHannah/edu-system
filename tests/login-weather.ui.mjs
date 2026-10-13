import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const url = 'http://127.0.0.1:4174/login'
const pictureName = '点击桌上的小画，前往白天云上世界'
const sunName = '点击太阳，返回黑夜图书馆'

async function ready(page, theme) {
  await page.locator(`.library-scene[data-theme="${theme}"] .library-canvas.is-ready`).waitFor()
  await page.getByRole('button', { name: theme === 'day' ? sunName : pictureName }).waitFor()
}

async function verifyImageHotspot(page, theme) {
  const box = await page.locator('.library-weather').boundingBox()
  const source = theme === 'day' ? { x: 786, y: 16, w: 128, h: 128 } : { x: 803, y: 694, w: 65, h: 54 }
  const frame = await page.evaluate(() => window.__worldFrame)
  assert.ok(frame, 'background drawing was not recorded')
  assert.ok(Math.abs(box.x - (frame.x + source.x * frame.sx)) <= 1.1, 'hotspot detached from image horizontally')
  assert.ok(Math.abs(box.y - (frame.y + source.y * frame.sy)) <= 1.1, 'hotspot detached from image vertically')
  assert.ok(Math.abs(box.width - source.w * frame.sx) <= 1.1)
  assert.ok(Math.abs(box.height - source.h * frame.sy) <= 1.1)
}

try {
  for (const [width, height] of [[1920, 869], [1440, 900], [390, 844], [320, 900], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 1440 ? 2 : 1 })
    await context.addInitScript(() => {
      const paint = CanvasRenderingContext2D.prototype.drawImage
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (args[0] instanceof HTMLImageElement && args[0].naturalWidth === 1672) {
          const m = this.getTransform(), sx = this.canvas.width / this.canvas.clientWidth, sy = this.canvas.height / this.canvas.clientHeight
          window.__worldFrame = { x: m.e / sx, y: m.f / sy, sx: m.a / sx, sy: m.d / sy }
        }
        return paint.apply(this, args)
      }
    })
    const page = await context.newPage()
    const errors = [], assets = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/login-(library|clouds)-.*\.webp/.test(request.url())) assets.push(request.url()) })
    await page.goto(url)
    await ready(page, 'night')
    assert.ok(assets.some(asset => asset.includes('login-library-')))
    assert.ok(!assets.some(asset => asset.includes('login-clouds-')), 'unused day asset loaded on first visit')
    const initialCard = await page.locator('.login-card').boundingBox()
    await page.getByLabel('用户名', { exact: true }).fill('天气切换测试')
    await page.getByLabel('密码', { exact: true }).fill('unsent-test-value')
    await page.getByRole('button', { name: '暂停动画' }).click()
    await verifyImageHotspot(page, 'night')
    await page.getByRole('button', { name: pictureName }).click()
    await ready(page, 'day')
    await verifyImageHotspot(page, 'day')
    assert.equal(await page.evaluate(() => localStorage.getItem('edu.login.scene')), 'day')
    const dayCard = await page.locator('.login-card').boundingBox()
    assert.deepEqual(dayCard, initialCard, 'changing weather moved the login frame')
    assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), '天气切换测试')
    assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), 'unsent-test-value')
    await page.getByLabel('用户名', { exact: true }).fill('')
    await page.getByLabel('密码', { exact: true }).fill('')
    await page.getByLabel('密码', { exact: true }).evaluate(input => input.blur())
    if (process.env.LOGIN_SCREENSHOTS === '1') await page.screenshot({ path: `.qa/login-day-${width}x${height}.png` })
    await page.reload()
    await ready(page, 'day')
    await page.getByRole('button', { name: '暂停动画' }).click()
    await verifyImageHotspot(page, 'day')
    await page.getByRole('button', { name: sunName }).click()
    await ready(page, 'night')
    assert.equal(await page.evaluate(() => localStorage.getItem('edu.login.scene')), 'night')
    await page.reload()
    await ready(page, 'night')
    assert.deepEqual(errors, [], 'weather switching raised browser errors')
    await context.close()
  }

  const saved = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await saved.addInitScript(() => localStorage.setItem('edu.login.scene', 'day'))
  const savedPage = await saved.newPage()
  const savedAssets = []
  savedPage.on('request', request => { if (/login-.*\.webp/.test(request.url())) savedAssets.push(request.url()) })
  await savedPage.goto(url)
  await ready(savedPage, 'day')
  assert.ok(!savedAssets.some(asset => asset.includes('login-library-')), 'saved day visit still fetched night art')
  await saved.close()

  const denied = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await denied.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) { if (key === 'edu.login.scene') throw new DOMException('denied', 'SecurityError'); return get.call(this, key) }
    Storage.prototype.setItem = function (key, value) { if (key === 'edu.login.scene') throw new DOMException('denied', 'SecurityError'); return set.call(this, key, value) }
  })
  const deniedPage = await denied.newPage()
  await deniedPage.goto(url)
  await ready(deniedPage, 'night')
  await deniedPage.getByRole('button', { name: pictureName }).click()
  await ready(deniedPage, 'day')
  await deniedPage.reload()
  await ready(deniedPage, 'night')
  await denied.close()
  console.log('weather hotspots, image-coordinate alignment, lazy assets, theme persistence and fixed login position passed')
} finally { await browser.close() }
