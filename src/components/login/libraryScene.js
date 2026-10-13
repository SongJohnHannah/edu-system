import { createLibraryActors } from './libraryActors.js'

// Coordinates belong to the 1672 × 941 background. Only the world follows the bear;
// the form and brand remain anchored to the viewport by the login component.
const path = [
  [145, 795], [303, 744], [250, 681], [295, 622], [346, 560], [397, 498],
  [452, 422], [448, 305], [570, 244], [675, 120], [830, 115], [980, 130],
  [1100, 250], [1120, 250], [1255, 305], [1290, 410], [1294, 485],
  [1260, 599], [1299, 686], [1430, 795], [145, 795]
]
const journey = []
for (let i = 0; i < path.length - 1; i++) {
  journey.push({ a: path[i], b: path[i + 1], duration: i === 19 ? 4.8 : 1.15, jump: i !== 19 && i > 6, index: i + 1 })
  if (i === 0 || i === 12) journey.push({
    a: path[i + 1], b: path[i + 1], duration: i === 0 ? 1.7 : 3,
    cheer: i === 0 ? 'reader' : 'writer', index: i + 1
  })
}
const duration = journey.reduce((sum, segment) => sum + segment.duration, 0)
const ledges = [8, 9, 10, 11, 14, 15, 16, 17, 18]
const flames = [[125, 378], [427, 378], [522, 375], [834, 281], [1146, 377], [1244, 377], [1375, 391], [1546, 380], [609, 584], [1064, 584]]

function actorAt(time) {
  const reverse = Math.floor(time / duration) % 2 === 1
  let cursor = reverse ? duration - time % duration : time % duration
  let segment = journey[journey.length - 1]
  for (const item of journey) {
    segment = item
    if (cursor <= item.duration) break
    cursor -= item.duration
  }
  const u = Math.min(1, cursor / segment.duration)
  const x = segment.a[0] + (segment.b[0] - segment.a[0]) * u
  const y = segment.a[1] + (segment.b[1] - segment.a[1]) * u - (segment.jump ? Math.sin(u * Math.PI) * 30 : 0)
  const direction = segment.cheer
    ? (segment.cheer === 'reader' ? -1 : 1)
    : (segment.b[0] >= segment.a[0] ? 1 : -1) * (reverse ? -1 : 1)
  return { x, y, direction, cheer: segment.cheer, index: segment.index, u }
}

export function createLibraryScene(context, backdrop) {
  const actors = createLibraryActors(context)
  const { rect, block, star } = actors

  function draw(width, height, time) {
    rect(0, 0, width, height, '#171c23')
    if (backdrop.complete && backdrop.naturalWidth) {
      const actor = actorAt(time)
      const scale = Math.max(width / 1672, height / 941) * 1.04
      const worldWidth = 1672 * scale, worldHeight = 941 * scale
      let ox = (width - worldWidth) / 2, oy = (height - worldHeight) / 2
      if (width < 700) ox = Math.max(width - worldWidth, Math.min(0, width * (actor.x < 836 ? .24 : .76) - actor.x * scale))
      else ox += Math.max(-12, Math.min(12, (836 - actor.x) * scale * .026))
      oy += Math.max(-6, Math.min(6, (470 - actor.y) * scale * .025))
      context.drawImage(backdrop, Math.round(ox), Math.round(oy), Math.round(worldWidth), Math.round(worldHeight))
      context.save()
      context.translate(Math.round(ox), Math.round(oy))
      context.scale(scale, scale)
      for (const i of ledges) {
        const [x, y] = path[i]
        rect(x - 9, y, 52, 3, '#9b6835')
        rect(x - 8, y, 50, 1, '#dbac65')
        rect(x - 7, y + 3, 46, 3, '#442d1c')
        for (let k = 0; k < 45; k += 9) rect(x + k, y + 1, 1, 2, '#53371f')
        if (i === actor.index && actor.u > .7) rect(x - 7, y - 1, 46, 1, '#ffdd85')
      }
      flames.forEach(([x, y], i) => {
        const flicker = Math.floor(Math.sin(time * 7 + i) * 2)
        rect(x - 1, y - 8 + flicker, 3, 5, '#ffbc3766')
        rect(x, y - 6 + flicker, 1, 3, '#fff3bb99')
      })
      actors.drawBear(actor.x, actor.y, .44, time, actor.direction, !!actor.cheer)
      if (actor.cheer) {
        const x = actor.x - 30, y = actor.y - 93
        block(x - 1, y - 1, 110, 29, '#d6b367', 3)
        block(x, y, 108, 27, '#182635', 3)
        rect(x + 9, y + 8, 5, 4, '#f89a8d')
        rect(x + 17, y + 8, 5, 4, '#f89a8d')
        rect(x + 9, y + 12, 13, 4, '#f89a8d')
        rect(x + 12, y + 16, 7, 3, '#f89a8d')
        rect(x + 15, y + 19, 1, 1, '#f89a8d')
        context.font = '500 13px "Microsoft YaHei",sans-serif'
        context.fillStyle = '#f5deb0'
        context.textAlign = 'left'
        context.fillText(actor.cheer === 'reader' ? '阅读 +1' : '创作 +1', x + 29, y + 18)
        star(x + 94, y - 6, '#eac371', 1)
      }
      context.restore()
    }
    if (height >= 380) actors.drawLogo(width / 2, height < 500 ? 230 : height / 2, time)
  }

  return { draw, dispose: actors.dispose }
}
