const PALETTE = [
  { bg: 'rgba(151, 196, 233, .72)', fg: '#264d6c', border: '#78acd3' },
  { bg: 'rgba(160, 216, 188, .72)', fg: '#285744', border: '#80c39f' },
  { bg: 'rgba(245, 192, 169, .72)', fg: '#75432f', border: '#e5a78a' },
  { bg: 'rgba(198, 184, 231, .72)', fg: '#53456f', border: '#ad9bd4' },
  { bg: 'rgba(245, 219, 155, .72)', fg: '#6c552d', border: '#d9bc6e' },
  { bg: 'rgba(237, 185, 207, .72)', fg: '#74465b', border: '#d796b2' },
  { bg: 'rgba(166, 219, 224, .72)', fg: '#2e6068', border: '#82c5cc' },
  { bg: 'rgba(198, 219, 174, .72)', fg: '#4c6035', border: '#aac887' }
]
export function teacherColor(id, teachers) {
  const ids = [...teachers].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id))).map(t => t.id)
  const index = ids.indexOf(id)
  if (index >= 0 && index < PALETTE.length) return PALETTE[index]
  let hash = 0
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const hue = ((index >= 0 ? index * 137.508 : hash) % 360).toFixed(2)
  return { bg: `hsla(${hue}, 48%, 79%, .72)`, fg: `hsl(${hue}, 31%, 28%)`, border: `hsl(${hue}, 45%, 65%)` }
}
export function teacherStyle(id, teachers) {
  const color = teacherColor(id, teachers)
  return { '--c-bg': color.bg, '--c-fg': color.fg, '--c-border': color.border }
}
