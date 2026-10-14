// Connected time ranges share one selectable stack, including chained overlaps.
export function groupScheduleItems(items) {
  const groups = []
  for (const item of [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    let group = groups.at(-1)
    if (!group || item.startTime >= group.endTime) {
      group = { id: item.id, startTime: item.startTime, endTime: item.endTime, items: [] }
      groups.push(group)
    }
    group.items.push(item)
    if (item.endTime > group.endTime) group.endTime = item.endTime
  }
  return groups
}

// Reuse a column only after its previous course ends. Every connected group
// reserves the same number of columns, including contained/chained overlaps.
export function layoutScheduleItems(items) {
  return groupScheduleItems(items).flatMap(group => {
    const columnEnds = []
    const placed = group.items.map(item => {
      let laneIndex = columnEnds.findIndex(end => end <= item.startTime)
      if (laneIndex < 0) laneIndex = columnEnds.length
      columnEnds[laneIndex] = item.endTime
      return { ...item, laneIndex }
    })
    return placed.map(item => ({ ...item, laneCount: columnEnds.length }))
  })
}

// Keep empty time slots short, expanding occupied slots only enough for the
// card's text. All days share these offsets so their time rulers stay aligned.
export function scheduleSlotOffsets(items, startMinute, endMinute, baseHeight) {
  const heights = Array(Math.ceil((endMinute - startMinute) / 30)).fill(baseHeight)
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  for (const item of items) {
    const start = Math.max(startMinute, minutes(item.startTime))
    const end = Math.min(endMinute, minutes(item.endTime))
    if (end <= start) continue
    const first = Math.max(0, Math.floor((start - startMinute) / 30))
    const last = Math.min(heights.length, Math.ceil((end - startMinute) / 30))
    const required = Math.ceil(item.minimumHeight / ((end - start) / 30))
    for (let index = first; index < last; index++) heights[index] = Math.max(heights[index], required)
  }
  return heights.reduce((offsets, height) => [...offsets, offsets.at(-1) + height], [0])
}
