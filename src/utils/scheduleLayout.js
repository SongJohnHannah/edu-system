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
