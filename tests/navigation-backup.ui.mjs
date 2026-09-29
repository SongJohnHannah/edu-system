import { chromium } from '@playwright/test'

const desktopRouteOrder = ['/', '/students', '/weekly-schedule', '/trial-bookings', '/attendance', '/courses', '/calendar', '/teachers', '/teacher-stats', '/handovers']
const browser = await chromium.launch({ headless: true })
try {
  for (const [width, height] of [[1440, 900], [1024, 768], [956, 440], [844, 390], [390, 844], [320, 700]]) for (const role of ['admin', 'teacher']) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024, acceptDownloads: true })
    await context.addInitScript(currentRole => {
      localStorage.setItem('access_token', 'navigation-test')
      localStorage.setItem('user', JSON.stringify({
        id: currentRole === 'admin' ? 'admin-1' : 'teacher-1', role: currentRole,
        teacherId: currentRole === 'teacher' ? 't1' : null,
        displayName: currentRole === 'admin' ? '测试管理员' : '林老师'
      }))
    }, role)
    let importCalls = 0
    let exportCalls = 0
    await context.route('**/edusystem/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (pathname.endsWith('/auth/profile')) {
        const profile = { id: role === 'admin' ? 'admin-1' : 'teacher-1', role, username: role, displayName: role === 'admin' ? '测试管理员' : '林老师' }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
      }
      if (pathname.endsWith('/backup/export')) {
        exportCalls++
        return route.fulfill({ status: 200, contentType: 'text/plain', body: '-- 测试备份\nDELETE FROM students;' })
      }
      if (pathname.endsWith('/backup/import-sql')) {
        importCalls++
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '仅支持系统备份中的数据语句' }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4174/profile', { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: '个人账户' }).waitFor({ state: 'visible' })
      if (width < 600) {
        await page.locator('.mobile-tab-bar').getByRole('button', { name: '更多' }).click()
        await page.locator('.mobile-more-menu').getByText('课程安排').waitFor({ state: 'visible' })
        if (await page.locator('.mobile-more-menu .more-item').count() < 6) throw new Error('手机更多菜单缺少入口')
        const mobileLinks = await page.locator('.mobile-tab-bar a, .mobile-more-menu a').evaluateAll(nodes => nodes.map(node => ({
          route: node.getAttribute('href'), icon: !!node.querySelector('svg')
        })))
        const expectedOrder = role === 'admin' ? desktopRouteOrder : desktopRouteOrder.filter(route => route !== '/handovers')
        const actualOrder = mobileLinks.map(item => item.route).filter(route => route !== '/profile')
        if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) throw new Error(`${width}px ${role} 手机导航顺序与 PC/iPad 不一致：${actualOrder.join(', ')}`)
        const missingIcons = mobileLinks.filter(item => !item.icon).map(item => item.route)
        if (missingIcons.length) throw new Error(`${width}px ${role} 手机导航缺少图标：${missingIcons.join(', ')}`)
        const missingActionIcons = await page.locator('.mobile-more-menu button:not(:has(svg))').allTextContents()
        if (missingActionIcons.length) throw new Error(`${width}px ${role} 手机更多操作缺少图标：${missingActionIcons.join(', ')}`)
      } else {
        if (width <= 1240) await page.getByRole('button', { name: '打开导航' }).click()
        const nav = page.locator('.desktop-nav .nav')
        await nav.getByRole('button', { name: '更多' }).click()
        await nav.getByRole('link', { name: '教师统计' }).waitFor({ state: 'visible' })
        if (!await nav.getByRole('link', { name: '课程安排' }).isVisible()) throw new Error('桌面更多菜单缺少课程入口')
        await page.getByRole('button', { name: '账户' }).click()
        const summary = page.locator('.account-summary')
        await summary.waitFor({ state: 'visible' })
        if (role === 'admin' && (await summary.textContent()).trim() !== '测试管理员') throw new Error('管理员角色标签重复')
      }
      const backupButton = width < 600
        ? page.locator('.mobile-more-menu').getByRole('button', { name: '数据备份与恢复' })
        : page.locator('.account-dropdown').getByRole('button', { name: '数据备份与恢复' })
      if (role === 'teacher') {
        if (await backupButton.count()) throw new Error(`${width}px 教师出现管理员备份入口`)
      } else {
        await backupButton.click()
        await page.getByRole('heading', { name: '数据备份与恢复' }).waitFor({ state: 'visible' })
        if (width === 320) {
          const modal = page.locator('.office-modal-shell').filter({ hasText: '数据备份与恢复' })
          const box = await modal.boundingBox()
          if (!box || box.x < 0 || box.x + box.width > width ||
              await modal.evaluate(element => element.scrollWidth > element.clientWidth + 2)) throw new Error('320px 备份弹窗横向裁切')
          if (process.env.MODAL_SCREENSHOTS === '1') await page.screenshot({ path: '.qa/modal-320-backup.png', animations: 'disabled' })
        }
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: '导出备份' }).click()
        if (!(await download).suggestedFilename().endsWith('.sql') || exportCalls !== 1) throw new Error(`${width}px 备份导出失败`)
        const input = page.locator('input[accept=".sql,.json"]')
        if (width === 1440) {
          await page.evaluate(() => {
            const originalText = File.prototype.text
            File.prototype.text = async function () {
              File.prototype.text = originalText
              throw new Error('read failed')
            }
          })
          await input.setInputFiles({ name: 'unreadable.sql', mimeType: 'text/plain', buffer: Buffer.from('DELETE FROM students;') })
          await page.getByText('备份文件读取失败，请重新选择').waitFor({ state: 'visible' })
          if (await page.getByRole('heading', { name: '确认恢复备份' }).isVisible() || importCalls !== 0) {
            throw new Error('读取失败仍打开恢复确认或提交了请求')
          }
        }
        await input.setInputFiles({ name: 'untrusted.sql', mimeType: 'text/plain', buffer: Buffer.from('DROP TABLE students;') })
        await page.getByRole('heading', { name: '确认恢复备份' }).waitFor({ state: 'visible' })
        if (importCalls !== 0) throw new Error(`${width}px 未确认即提交恢复`)
        await page.getByRole('button', { name: '取消', exact: true }).click()
        if (importCalls !== 0) throw new Error(`${width}px 取消恢复仍发送请求`)
        await input.setInputFiles({ name: 'untrusted.sql', mimeType: 'text/plain', buffer: Buffer.from('DROP TABLE students;') })
        await page.getByRole('button', { name: '确认恢复' }).click()
        await page.getByText('仅支持系统备份中的数据语句').first().waitFor({ state: 'visible' })
        if (importCalls !== 1) throw new Error(`${width}px 恢复请求次数错误`)
      }
      if (width === 390 && role === 'admin') {
        await page.goto('http://127.0.0.1:4174/trial-bookings')
        await page.locator('.mobile-tab-bar a[href="/trial-bookings"].tab-active').waitFor({ state: 'visible' })
        if (await page.locator('.mobile-tab-bar button.tab-active').count()) throw new Error('试听预约错误地高亮了更多')
        await page.goto('http://127.0.0.1:4174/courses')
        await page.locator('.mobile-tab-bar button.tab-active').waitFor({ state: 'visible' })
        if (await page.locator('.mobile-tab-bar a[href="/trial-bookings"].tab-active').count()) throw new Error('课程页错误地高亮了试听预约')
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${width}px ${role} 整页横向溢出`)
      if (errors.length) throw new Error(`${width}px ${role} 脚本错误：${errors.join('; ')}`)
    } finally {
      await context.close()
    }
  }
  console.log('全局导航与备份：PC/iPad/含 956px 宽屏的手机竖横屏两角色入口、导出、恢复确认和失败反馈通过')
} finally {
  await browser.close()
}
