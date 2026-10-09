// One course hour occupies 60 minutes; half-hour steps match the schedule grid.
export function courseEndTime(startTime, hoursPerClass) {
  if (!/^\d{2}:(00|30)$/.test(startTime || '')) return ''
  const hours = Number(hoursPerClass)
  if (!Number.isFinite(hours) || hours < 0.5 || !Number.isInteger(hours * 2)) return ''
  const [hour, minute] = startTime.split(':').map(Number)
  const start = hour * 60 + minute
  const end = start + hours * 60
  if (start < 450 || end > 1350) return ''
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}
