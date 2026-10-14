// All positions are foot centres in the source artwork, before viewport scaling.
export const WORLD_SIZE = { width: 1672, height: 941 }
export const BEAR_SCALE = .44

const nightRoute = [
  [300, 777, { cheer: 'reader', facing: -1 }], [175, 777], [138, 795, { jump: 12 }],
  [108, 795], [80, 744, { jump: 12 }], [62, 728, { jump: 6 }], [60, 681, { jump: 16 }],
  [75, 665], [100, 630], [125, 596], [150, 561], [175, 546], [200, 513],
  [225, 479], [250, 445], [275, 426], [300, 393], [325, 365], [350, 339], [364, 321],
  [415, 305, { jump: 18 }], [508, 305], [558, 245, { jump: 24 }], [1055, 245],
  [1145, 305, { jump: 18 }], [1175, 305, { cheer: 'writer', facing: 1 }]
]
const dayRoute = [
  [1333, 727, { cheer: 'painter', facing: 1 }], [1190, 732], [1000, 744], [710, 744],
  [607, 732], [430, 732], [330, 727, { cheer: 'reader', facing: -1 }], [170, 727],
  [108, 727], [77, 695, { jump: 10 }], [68, 663, { jump: 12 }],
  [75, 650], [100, 619], [125, 610], [150, 561], [175, 540], [200, 505],
  [225, 489], [250, 452], [275, 431], [300, 396], [325, 360], [350, 340], [375, 308],
  [404, 306, { jump: 10 }], [710, 306], [958, 306, { jump: 82, seconds: 1.65 }],
  [1275, 306, { cheer: 'writer', facing: 1 }]
]

function createJourney(route) {
  const journey = []
  const pause = point => {
    if (point[2]?.cheer) journey.push({ a: point, b: point, seconds: 2.2, ...point[2] })
  }
  function travel(a, b, options) {
    const stairs = Math.abs(a[1] - b[1]) > 3 && Math.abs(a[0] - b[0]) <= 28
    journey.push({ a, b, seconds: options?.seconds || Math.max(.28, Math.hypot(b[0] - a[0], b[1] - a[1]) / 108),
      jump: options?.jump ?? (stairs ? 4 : 0) })
  }
  pause(route[0])
  for (let i = 1; i < route.length; i++) {
    travel(route[i - 1], route[i], route[i][2])
    pause(route[i])
  }
  // Descend using the same real treads; no imaginary platforms on the right wall.
  for (let i = route.length - 2; i >= 0; i--) {
    travel(route[i + 1], route[i], route[i + 1][2])
    if (i > 0) pause(route[i])
  }
  return { journey, duration: journey.reduce((sum, segment) => sum + segment.seconds, 0) }
}

export const WORLD_SCENES = {
  night: { ...createJourney(nightRoute), hotspot: { x: 803, y: 694, width: 65, height: 54 },
    flames: [[125, 378], [427, 378], [522, 375], [834, 281], [1146, 377], [1244, 377],
      [1375, 391], [1546, 380], [609, 584], [1064, 584]] },
  day: { ...createJourney(dayRoute), hotspot: { x: 786, y: 16, width: 128, height: 128 }, flames: [] }
}

export function getScenePose(theme, time) {
  const { journey, duration } = WORLD_SCENES[theme] || WORLD_SCENES.night
  let cursor = ((time % duration) + duration) % duration
  let segment = journey[journey.length - 1]
  for (const item of journey) {
    segment = item
    if (cursor < item.seconds) break
    cursor -= item.seconds
  }
  const u = Math.min(1, cursor / segment.seconds)
  return {
    x: segment.a[0] + (segment.b[0] - segment.a[0]) * u,
    y: segment.a[1] + (segment.b[1] - segment.a[1]) * u - Math.sin(u * Math.PI) * (segment.jump || 0),
    direction: segment.facing || (segment.b[0] >= segment.a[0] ? 1 : -1),
    cheer: segment.cheer, moving: segment.a !== segment.b
  }
}

export function getWorldProjection(width, height, actor, theme = 'night') {
  const scale = Math.max(width / WORLD_SIZE.width, height / WORLD_SIZE.height) * 1.04
  const drawnWidth = Math.round(WORLD_SIZE.width * scale)
  const drawnHeight = Math.round(WORLD_SIZE.height * scale)
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))
  // Keep the central picture and sun reachable in a narrow portrait crop.
  const panLimit = width < 700 ? 4 : 12
  let y = Math.round((height - drawnHeight) / 2 + clamp((470 - actor.y) * scale * .025, 6))
  if (theme === 'day') {
    // On a wide, short screen the sun would otherwise be cropped above the sky.
    y = Math.min(0, Math.max(y, Math.ceil(6 - WORLD_SCENES.day.hotspot.y * drawnHeight / WORLD_SIZE.height)))
  }
  return {
    x: Math.round((width - drawnWidth) / 2 + clamp((836 - actor.x) * scale * .026, panLimit)),
    y,
    scaleX: drawnWidth / WORLD_SIZE.width, scaleY: drawnHeight / WORLD_SIZE.height
  }
}

export function projectHotspot(theme, projection) {
  const box = (WORLD_SCENES[theme] || WORLD_SCENES.night).hotspot
  return {
    left: Math.round(projection.x + box.x * projection.scaleX),
    top: Math.round(projection.y + box.y * projection.scaleY),
    width: Math.round(box.width * projection.scaleX),
    height: Math.round(box.height * projection.scaleY)
  }
}
