import { test as base, expect } from '@playwright/test'

const API = '/edusystem/api'

class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL
    this.token = null
  }

  async login(username, password) {
    const res = await fetch(`${this.baseURL}${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (data.accessToken) this.token = data.accessToken
    return data
  }

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    const opts = { method, headers }
    if (body) {
      // 自动标记所有测试数据
      const taggedBody = typeof body === 'object' ? { ...body, isTest: true } : body
      opts.body = JSON.stringify(taggedBody)
    }
    const res = await fetch(`${this.baseURL}${API}${path}`, opts)
    return res
  }

  async get(path) { return this.request('GET', path) }
  async post(path, data) { return this.request('POST', path, data) }
  async put(path, data) { return this.request('PUT', path, data) }
  async del(path) { return this.request('DELETE', path) }
}

export const test = base.extend({
  consoleErrors: [async ({ page }, use) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', err => errors.push(err.message))
    await use(errors)
  }, { scope: 'test' }],

  adminPage: async ({ page }, use) => {
    const api = new ApiClient('http://localhost:3001')
    const loginData = await api.login('admin', 'admin123')
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.evaluate((tokens) => {
      localStorage.setItem('access_token', tokens.accessToken)
      localStorage.setItem('refresh_token', tokens.refreshToken || '')
      localStorage.setItem('user', JSON.stringify(tokens.user || { username: 'admin', role: 'admin' }))
    }, loginData)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await use(page)
  },

  teacherPage: async ({ page }, use) => {
    const adminApi = new ApiClient('http://localhost:3001')
    await adminApi.login('admin', 'admin123')
    const phone = '13900' + Date.now().toString().slice(-6)
    const createRes = await adminApi.post('/teachers', { name: '测试教师_' + Date.now(), phone, subject: '数学' })
    const teacher = await createRes.json()

    const teacherApi = new ApiClient('http://localhost:3001')
    const loginData = await teacherApi.login(phone, '123456')

    if (loginData.accessToken) {
      await page.goto('/login', { waitUntil: 'domcontentloaded' })
      await page.evaluate((tokens) => {
        localStorage.setItem('access_token', tokens.accessToken)
        localStorage.setItem('refresh_token', tokens.refreshToken || '')
        localStorage.setItem('user', JSON.stringify(tokens.user || {}))
      }, loginData)
      await page.goto('/', { waitUntil: 'domcontentloaded' })
    }
    await use(page)
    try {
      const cleanupApi = new ApiClient('http://localhost:3001')
      await cleanupApi.login('admin', 'admin123')
      await cleanupApi.del(`/teachers/${teacher.id}`)
    } catch {}
  },
})

export { expect, ApiClient }
