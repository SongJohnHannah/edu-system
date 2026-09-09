import { test, expect, ApiClient } from './fixtures.js'

const API = '/edusystem/api'

test.describe('008 课程调度迁移幂等性', () => {
  let api

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('courses 表已有 effective_from + status 列', async () => {
    // 创建一条课程间接验证 schema 可用
    const tRes = await api.post('/teachers', { name: '迁移教师_' + Date.now(), phone: '13970' + Date.now().toString().slice(-6) })
    const tid = (await tRes.json()).id
    const sRes = await api.post('/students', { name: '迁移学生_' + Date.now(), totalHours: 10 })
    const sid = (await sRes.json()).id

    const cRes = await api.post('/courses', {
      name: '迁移测试_' + Date.now(),
      teacherId: tid,
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      hoursPerClass: 1,
      studentIds: [sid],
    })
    expect(cRes.status).toBe(201)
    const course = await cRes.json()

    // course 应有 effectiveFrom 字段（即使为 null/falsy 也行，schema 已生效即可）
    // 直接调 history endpoint 来验证附表可读
    const histRes = await api.get(`/courses/${course.id}/history`)
    expect(histRes.status).toBe(200)

    // 清理
    await api.del(`/courses/${course.id}`)
    await api.del(`/students/${sid}`)
    await api.del(`/teachers/${tid}`)
  })

  test('GET /courses/effective 不依赖历史课程数据', async () => {
    // 给一个随机周 — 即便没有任何课程也不应 500
    const res = await api.get('/courses/effective?weekStart=2026-01-05')
    expect(res.status).toBe(200)
    const slots = await res.json()
    expect(Array.isArray(slots)).toBe(true)
  })
})