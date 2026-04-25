import { test, expect, ApiClient } from './fixtures.js'

test.describe('班级管理', () => {
  let api, classIds = []

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test.afterAll(async () => {
    for (const id of classIds) {
      try { await api.del(`/classes/${id}`) } catch {}
    }
  })

  test('创建班级', async () => {
    const res = await api.post('/classes', { name: '测试班级_' + Date.now() })
    expect(res.status).toBe(201)
    const cls = await res.json()
    expect(cls.name).toContain('测试班级_')
    classIds.push(cls.id)
  })

  test('获取班级列表', async () => {
    const res = await api.get('/classes')
    expect(res.status).toBe(200)
    const classes = await res.json()
    expect(Array.isArray(classes)).toBe(true)
    const created = classes.find(c => classIds.includes(c.id))
    expect(created).toBeTruthy()
  })

  test('更新班级', async () => {
    const createRes = await api.post('/classes', { name: '更新前_' + Date.now() })
    const cls = await createRes.json()
    classIds.push(cls.id)

    const updateRes = await api.put(`/classes/${cls.id}`, { name: '更新后_' + Date.now() })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json()
    expect(updated.name).toContain('更新后_')
  })

  test('删除班级', async () => {
    const createRes = await api.post('/classes', { name: '待删除_' + Date.now() })
    const cls = await createRes.json()

    const delRes = await api.del(`/classes/${cls.id}`)
    expect(delRes.status).toBe(200)

    const listRes = await api.get('/classes')
    const classes = await listRes.json()
    expect(classes.find(c => c.id === cls.id)).toBeFalsy()
  })
})
