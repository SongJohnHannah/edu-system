import { createLibraryActors } from './libraryActors.js'
import { BEAR_SCALE, WORLD_SIZE, WORLD_SCENES, getScenePose, getWorldProjection, projectHotspot } from './libraryWorld.js'

export function createLibraryScene(context, backdrop, theme = 'night') {
  const actors = createLibraryActors(context)
  const { rect, block, star } = actors
  const world = WORLD_SCENES[theme] || WORLD_SCENES.night

  function draw(width, height, time) {
    rect(0, 0, width, height, theme === 'day' ? '#48a4ed' : '#171c23')
    let hotspot = null
    if (backdrop.complete && backdrop.naturalWidth) {
      const actor = getScenePose(theme, time)
      const projection = getWorldProjection(width, height, actor, theme)
      context.save()
      context.translate(projection.x, projection.y)
      context.scale(projection.scaleX, projection.scaleY)
      // Art, feet and the clickable map use exactly the same world transform.
      context.drawImage(backdrop, 0, 0, WORLD_SIZE.width, WORLD_SIZE.height)
      world.flames.forEach(([x, y], i) => {
        const flicker = Math.floor(Math.sin(time * 7 + i) * 2)
        rect(x - 1, y - 8 + flicker, 3, 5, '#ffbc3766')
        rect(x, y - 6 + flicker, 1, 3, '#fff3bb99')
      })
      // Sprite painting accepts a left edge; the route stores a foot centre.
      actors.drawBear(actor.x - 40 * BEAR_SCALE, actor.y, BEAR_SCALE, time, actor.direction, !!actor.cheer)
      if (actor.cheer) {
        const x = actor.x - 54, y = actor.y - 93
        block(x - 1, y - 1, 110, 29, theme === 'day' ? '#5b98cb' : '#d6b367', 3)
        block(x, y, 108, 27, theme === 'day' ? '#f1faff' : '#182635', 3)
        rect(x + 9, y + 8, 5, 4, '#f89a8d')
        rect(x + 17, y + 8, 5, 4, '#f89a8d')
        rect(x + 9, y + 12, 13, 4, '#f89a8d')
        rect(x + 12, y + 16, 7, 3, '#f89a8d')
        rect(x + 15, y + 19, 1, 1, '#f89a8d')
        context.font = '500 13px "Microsoft YaHei",sans-serif'
        context.fillStyle = theme === 'day' ? '#285579' : '#f5deb0'
        context.textAlign = 'left'
        context.fillText({ reader: '阅读 +1', writer: '写作 +1', painter: '绘画 +1' }[actor.cheer], x + 29, y + 18)
        star(x + 94, y - 6, '#eac371', 1)
      }
      context.restore()
      hotspot = projectHotspot(theme, projection)
    }
    // In short landscape screens the daytime sun occupies the logo's space.
    if (height >= 380 && (theme !== 'day' || height >= 500)) {
      actors.drawLogo(width / 2, height < 500 ? 230 : height / 2, time)
    }
    return hotspot
  }

  return { draw, dispose: actors.dispose }
}
