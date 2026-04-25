import { test, expect, ApiClient } from './fixtures.js'

test.describe('点名移除学生', () => {
  let api, teacherId, studentIds = [], courseId, attendanceId

  test.beforeAll(async () => {
    api = new ApiClient('http://localhost:3001')
    await api.login('admin', 'admin123')

    const tRes = await api.post('/teachers', { name: '移除教师_' + Date.now(), phone: '13650' + Date.now().toString().slice(-6) })
    teacherId = (await tRes.json()).id

    for (let i = 0; i < 3; i++) {
      const sRes = await api.post('/students', { name: '移除学生_' + i + '_' + Date.now(), totalHours: 20 })
      studentIds.push((await sRes.json()).id)
    }

    const cRes = await api.post('/courses', {
      name: '移除课程_' + Date.now(),
      teacherId,
      weekday: new Date().getDay() || 7,
      startTime: '09:00',
      endTime: '10:00',
      hoursPerClass: 1,
      studentIds,
    })
    courseId = (await cRes.json()).id
  })

  test.afterAll(async () => {
    if (attendanceId) { try { await api.del(`/attendance/${attendanceId}`) } catch {} }
    if (courseId) { try { await api.del(`/courses/${courseId}`) } catch {} }
    for (const id of studentIds) { try { await api.del(`/students/${id}`) } catch {} }
    if (teacherId) { try { await api.del(`/teachers/${teacherId}`) } catch {} }
  })

  test('创建点名记录', async () => {
    const res = await api.post('/attendance', {
      courseId,
      date: new Date().toISOString().slice(0, 10),
      studentIds,
      hoursDeducted: 1,
    })
    expect(res.status).toBe(201)
    attendanceId = (await res.json()).id
  })

  test('从点名记录中移除部分学生，课时还原', async () => {
    // 记录当前 usedHours
    const beforeRes = await api.get('/students')
    const beforeStudents = await beforeRes.json()
    const s0 = beforeStudents.find(s => s.id === studentIds[0])
    const s1 = beforeStudents.find(s => s.id === studentIds[1])
    const usedBefore0 = s0.usedHours
    const usedBefore1 = s1.usedHours

    // 移除前两个学生
    const res = await api.post(`/attendance/${attendanceId}/remove-students`, {
      studentIds: [studentIds[0], studentIds[1]],
    })
    expect(res.status).toBe(200)

    // 验证课时还原
    const afterRes = await api.get('/students')
    const afterStudents = await afterRes.json()
    const afterS0 = afterStudents.find(s => s.id === studentIds[0])
    const afterS1 = afterStudents.find(s => s.id === studentIds[1])
    expect(afterS0.usedHours).toBe(usedBefore0 - 1)
    expect(afterS1.usedHours).toBe(usedBefore1 - 1)

    // 记录还应存在，只剩第三个学生
    const attRes = await api.get('/attendance?limit=5')
    const attBody = await attRes.json()
    const records = Array.isArray(attBody) ? attBody : attBody.data
    const record = records.find(r => r.id === attendanceId)
    expect(record).toBeTruthy()
    expect(record.studentIds).toHaveLength(1)
    expect(record.studentIds[0]).toBe(studentIds[2])
  })

  test('移除所有学生后点名记录被删除', async () => {
    // 移除剩余的学生
    const res = await api.post(`/attendance/${attendanceId}/remove-students`, {
      studentIds: [studentIds[2]],
    })
    expect(res.status).toBe(200)

    // 记录应被删除
    const attRes = await api.get('/attendance?limit=100')
    const attBody = await attRes.json()
    const records = Array.isArray(attBody) ? attBody : attBody.data
    const record = records.find(r => r.id === attendanceId)
    expect(record).toBeFalsy()
    attendanceId = null
  })
})
