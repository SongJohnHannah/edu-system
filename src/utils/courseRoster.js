export function courseStudentLabel(student) {
  if (!student) return '已不存在的学生'
  const reason = student.status === 'deleted' ? '已归档'
    : student.status === 'quit' ? '已退学'
      : student.enrollmentStage === 'pending' ? '待报名' : ''
  return reason ? `${student.name}（${reason}）` : student.name
}

export function prepareCourseRoster(studentIds, students) {
  const byId = new Map(students.map(student => [student.id, student]))
  const valid = []
  const excluded = []
  for (const id of new Set(studentIds || [])) {
    const student = byId.get(id)
    if (student?.status === 'active' && student.enrollmentStage !== 'pending') valid.push(id)
    else excluded.push(courseStudentLabel(student))
  }
  return { studentIds: valid, excluded }
}
