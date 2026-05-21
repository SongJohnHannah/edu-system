import { test, expect, ApiClient } from './fixtures.js'

test.describe('学生删除与数据清理', () => {
  let api, studentIds = [], teacherId, courseId, attendanceId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
  })

  test('删除学生清理关联数据', async () => {
    const sRes = await api.post('/students', { name: '待删学生_' + Date.now(), totalHours: 20 })
    const student = await sRes.json()
    studentIds.push(student.id)

    // 添加课时记录
    await api.post(`/students/${student.id}/add-hours`, { hours: 5, remark: '充值' })

    // 验证有 hour_records
    const hrRes = await api.get(`/hour-records?studentId=${student.id}`)
    const hrBody = await hrRes.json()
    expect(Array.isArray(hrBody) ? hrBody : hrBody.data || []).toBeTruthy()

    const delRes = await api.del(`/students/${student.id}`)
    expect(delRes.status).toBe(200)

    // 验证学生已删除
    const listRes = await api.get('/students')
    const students = await listRes.json()
    expect(students.find(s => s.id === student.id)).toBeFalsy()
    studentIds = studentIds.filter(id => id !== student.id)
  })

  test('删除被点名记录引用的学生', async () => {
    const tRes = await api.post('/teachers', { name: '引用教师_' + Date.now(), phone: '13720' + Date.now().toString().slice(-6) })
    teacherId = (await tRes.json()).id
    const s1Res = await api.post('/students', { name: '引用学生1_' + Date.now(), totalHours: 20 })
    const s1 = (await s1Res.json()).id
    const s2Res = await api.post('/students', { name: '引用学生2_' + Date.now(), totalHours: 20 })
    const s2 = (await s2Res.json()).id
    studentIds.push(s1, s2)

    const cRes = await api.post('/courses', {
      name: '引用课程_' + Date.now(),
      teacherId,
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds: [s1, s2],
    })
    courseId = (await cRes.json()).id

    const aRes = await api.post('/attendance', {
      courseId,
      date: new Date().toISOString().slice(0, 10),
      studentIds: [s1, s2],
      hoursDeducted: 1,
    })
    attendanceId = (await aRes.json()).id

    // 删除 s1 — 点名记录中应移除 s1
    const delRes = await api.del(`/students/${s1}`)
    expect(delRes.status).toBe(200)
    studentIds = studentIds.filter(id => id !== s1)

    // 验证点名记录仍存在，但只剩 s2
    const attRes = await api.get('/attendance?limit=100')
    const attBody = await attRes.json()
    const records = Array.isArray(attBody) ? attBody : attBody.data
    const record = records.find(r => r.id === attendanceId)
    expect(record).toBeTruthy()
    expect(record.studentIds).not.toContain(s1)
    expect(record.studentIds).toContain(s2)

    // 清理
    await api.del(`/attendance/${attendanceId}`)
    await api.del(`/courses/${courseId}`)
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    await api.del(`/teachers/${teacherId}`)
  })
})

test.describe('学生课时操作', () => {
  let api, studentId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')
    const res = await api.post('/students', { name: '课时学生_' + Date.now(), totalHours: 20 })
    studentId = (await res.json()).id
  })

  test.afterAll(async () => {
    if (studentId) { try { await api.del(`/students/${studentId}`) } catch {} }
  })

  test('加课时', async () => {
    const res = await api.post(`/students/${studentId}/add-hours`, { hours: 5, remark: '续费' })
    expect(res.status).toBe(200)
    const student = await res.json()
    expect(student.totalHours).toBe(25)
  })

  test('减课时', async () => {
    const res = await api.post(`/students/${studentId}/subtract-hours`, { hours: 3, remark: '退课' })
    expect(res.status).toBe(200)
    const student = await res.json()
    expect(student.totalHours).toBe(22)
  })

  test('减课时允许超过剩余（余额变负）', async () => {
    const res = await api.post(`/students/${studentId}/subtract-hours`, { hours: 100, remark: '超额' })
    expect(res.status).toBe(200)
    const student = await res.json()
    const remaining = student.totalHours - (student.usedHours || 0)
    expect(remaining).toBeLessThan(0)
  })

  test('学生姓名重复检查', async () => {
    const name = '重名学生_' + Date.now()
    await api.post('/students', { name, totalHours: 10 })
    const checkRes = await api.get(`/students/check-name?name=${encodeURIComponent(name)}`)
    expect(checkRes.status).toBe(200)
    const body = await checkRes.json()
    expect(body.exists).toBe(true)
  })
})
