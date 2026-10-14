import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { serveLoginBuild } from './login-load-server.mjs'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}

const runs = Number(option('--runs', '3'))
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 10, '--runs must be between 1 and 10')
const remote = option('--url')
const server = remote ? null : await serveLoginBuild(option('--dist', 'dist'))
const target = remote || server.url
const results = []
let browser
// Run alone: concurrent browser suites distort CPU timing despite fixed throttling.
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM_PATH })
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    try {
      const page = await context.newPage()
      const session = await context.newCDPSession(page)
      await session.send('Network.enable')
      await session.send('Network.setCacheDisabled', { cacheDisabled: true })
      await session.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024
      })
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      const errors = []
      const failedRequests = []
      const requests = []
      const headers = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => requests.push(request.url()))
      page.on('requestfailed', request => failedRequests.push(request.url()))
      page.on('response', response => {
        if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
        if (/\.(webp|png)(?:\?|$)/.test(response.url())) {
          headers.push({ url: response.url(), cache: response.headers()['cache-control'] || '' })
        }
      })
      await page.addInitScript(() => {
        window.__loginLoad = { lcp: 0, longTasks: [] }
        new PerformanceObserver(list => {
          window.__loginLoad.lcp = list.getEntries().at(-1).startTime
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver(list => {
          window.__loginLoad.longTasks.push(...list.getEntries().map(entry => ({
            start: entry.startTime, duration: entry.duration
          })))
        }).observe({ type: 'longtask', buffered: true })
      })
      const start = performance.now()
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.locator('.login-card').waitFor()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const formMs = Math.round(performance.now() - start)
      await page.locator('.library-canvas.is-ready').waitFor()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const sceneMs = Math.round(performance.now() - start)
      await page.waitForLoadState('load')
      const metrics = await page.evaluate(() => ({
        ...window.__loginLoad,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
        resources: performance.getEntriesByType('resource').map(entry => ({
          url: entry.name, bytes: entry.encodedBodySize, duration: Math.round(entry.duration)
        }))
      }))
      const bytes = metrics.resources.reduce((sum, entry) => sum + entry.bytes, 0)
      const unwantedLogo = requests.some(url => /\/brand\/duqitongqu-jiayansiting\.png/.test(url))
      const apiRequests = requests.filter(url => url.includes('/edusystem/api/'))
      results.push({ run, formMs, sceneMs, bytes, unwantedLogo, apiRequests, errors, failedRequests, headers, ...metrics })
      console.log(JSON.stringify({ run, formMs, sceneMs, kilobytes: Math.round(bytes / 1024),
        fcpMs: Math.round(metrics.fcp), longestTaskMs: Math.max(0, ...metrics.longTasks.map(task => task.duration)) }))
    } finally {
      await context.close()
    }
  }
  if (option('--report')) await writeFile(option('--report'), JSON.stringify({ target, results }, null, 2))
  if (!process.argv.includes('--measure-only')) {
    for (const result of results) {
      assert.ok(result.formMs <= 3500, `run ${result.run}: form took ${result.formMs} ms (budget 3500)`)
      assert.ok(result.sceneMs <= 4500, `run ${result.run}: scene took ${result.sceneMs} ms (budget 4500)`)
      assert.ok(result.bytes <= 500 * 1024, `run ${result.run}: first-load resources exceed 500 KiB`)
      assert.equal(result.unwantedLogo, false, 'login downloaded the full-size navigation logo')
      assert.deepEqual(result.apiRequests, [], 'login unexpectedly requested business data')
      assert.deepEqual(result.errors, [], 'browser errors during login loading')
      assert.deepEqual(result.failedRequests, [], 'failed resource requests during login loading')
      for (const header of result.headers.filter(entry => entry.url.includes('/assets/'))) {
        assert.match(header.cache, /max-age=31536000/, 'hashed image lacks long-term caching')
        assert.match(header.cache, /immutable/, 'hashed image cache is not immutable')
        assert.doesNotMatch(header.cache, /no-store|no-cache/, 'hashed image caching was disabled')
      }
    }
    console.log('Login performance budgets passed (1.6 Mbps, 150 ms latency, CPU ×4).')
  }
} finally {
  await browser?.close()
  await server?.close()
}
