import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import * as world from '../src/components/login/libraryWorld.js'
import { SCENE_STORAGE_KEY, readSceneTheme, saveSceneTheme } from '../src/components/login/libraryPreferences.js'

const { WORLD_SCENES, getScenePose, getWorldProjection, projectHotspot } = world

// Record the production renderer's feet without relying on its route definitions.
async function recordFeet(theme = 'night') {
  const source = (await readFile(new URL('../src/components/login/libraryScene.js', import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '')
    .replace('export function createLibraryScene', 'function createLibraryScene')
  const feet = []
  const sandbox = { ...world, theme,
    createLibraryActors: () => ({ rect() {}, block() {}, star() {}, drawLogo() {}, dispose() {},
      drawBear(x, y, scale) { feet.push({ x: x + 40 * scale, y }) } }),
    context: { save() {}, restore() {}, translate() {}, scale() {}, drawImage() {}, fillText() {} },
    backdrop: { complete: true, naturalWidth: 1672 }
  }
  vm.runInNewContext(`${source}\nthis.scene=createLibraryScene(context, backdrop, theme)`, sandbox)
  for (let time = 0; time < 90; time += .025) sandbox.scene.draw(1920, 1080, time)
  return feet
}

test('night runner lands on measured library stair treads, rather than crossing bookcases', async () => {
  const feet = await recordFeet()
  // These anchors are observed from the backdrop, independent of animation timing.
  for (const [x, y] of [[75, 665], [150, 561], [225, 479], [300, 393], [350, 339]]) {
    assert.ok(feet.some(foot => Math.abs(foot.x - x) < 2 && Math.abs(foot.y - y) < 5),
      `runner never lands on the pictured stair tread at (${x}, ${y})`)
  }
})

test('day runner uses the cloud staircase and jumps across the actual upper-deck gap', async () => {
  const feet = await recordFeet('day')
  for (const [x, y] of [[150, 561], [200, 505], [250, 452], [300, 396], [350, 340]]) {
    assert.ok(feet.some(foot => Math.abs(foot.x - x) < 2 && Math.abs(foot.y - y) < 5),
      `runner misses the cloud stair tread at (${x}, ${y})`)
  }
  const crossing = feet.filter(foot => foot.x > 760 && foot.x < 905 && foot.y < 350)
  assert.ok(crossing.length > 0)
  assert.ok(crossing.every(foot => foot.y < 260), 'runner walks through the empty space between upper islands')
})

test('journeys loop without teleporting and include every study station', () => {
  for (const theme of ['night', 'day']) {
    const { duration } = WORLD_SCENES[theme]
    const before = getScenePose(theme, duration - .0001)
    const after = getScenePose(theme, duration + .0001)
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < .1)
    const cheers = new Set()
    for (let time = 0; time < duration; time += .1) {
      const pose = getScenePose(theme, time)
      if (pose.cheer) cheers.add(pose.cheer)
    }
    assert.deepEqual([...cheers].sort(), theme === 'day' ? ['painter', 'reader', 'writer'] : ['reader', 'writer'])
  }
})

test('picture and sun remain reachable across camera positions and screen shapes', () => {
  for (const [width, height] of [[1920, 869], [1440, 900], [390, 844], [320, 900], [844, 390]]) {
    for (const theme of ['night', 'day']) {
      for (let time = 0; time < WORLD_SCENES[theme].duration; time += 1) {
        const projection = getWorldProjection(width, height, getScenePose(theme, time), theme)
        const box = projectHotspot(theme, projection)
        assert.ok(box.left >= 0 && box.left + box.width <= width, `${theme}: hotspot cropped horizontally`)
        assert.ok(box.top >= 0 && box.top + box.height <= height, `${theme}: hotspot cropped vertically`)
      }
    }
  }
})

test('theme storage defaults to night and tolerates denied browser storage', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  assert.equal(readSceneTheme(storage), 'night')
  saveSceneTheme('day', storage)
  assert.equal(values.get(SCENE_STORAGE_KEY), 'day')
  assert.equal(readSceneTheme(storage), 'day')
  saveSceneTheme('night', storage)
  assert.equal(readSceneTheme(storage), 'night')
  values.set(SCENE_STORAGE_KEY, 'invalid')
  assert.equal(readSceneTheme(storage), 'night')
  const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.equal(readSceneTheme(denied), 'night')
  assert.doesNotThrow(() => saveSceneTheme('day', denied))
})
