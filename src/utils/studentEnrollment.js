// 按自然月份计算，不折算为天数：9 月 30 日到 10 月 1 日为 1 个月。
export function getEnrollmentMonths(enrollmentDate, currentDate = new Date()) {
  if (typeof enrollmentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(enrollmentDate)) return null
  if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) return null

  const [year, month, day] = enrollmentDate.split('-').map(Number)
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null

  const months = (currentDate.getFullYear() - year) * 12 + currentDate.getMonth() + 1 - month
  return Math.max(0, months)
}
