import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { teacherColor } from '../src/utils/teacherColors.js'

test('weekly schedule gives each teacher a distinct translucent color that stays stable when list order changes', () => {
  const teachers = Array.from({ length: 16 }, (_, index) => ({ id: `teacher-${index}`, createdAt: `2026-01-${String(index + 1).padStart(2, '0')}` }))
  const first = teachers.map(teacher => teacherColor(teacher.id, teachers))
  assert.equal(new Set(first.map(color => color.bg)).size, teachers.length)
  assert.ok(first.every(color => color.bg.startsWith('rgba(') || color.bg.startsWith('hsla(')))
  assert.deepEqual(teachers.map(teacher => teacherColor(teacher.id, [...teachers].reverse())), first)
})

function hslToRgb(hue, saturation, lightness) {
  const s = saturation / 100
  const l = lightness / 100
  const k = n => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map(n => (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255)
}

function cssColor(value) {
  if (value.startsWith('#')) return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16))
  const numbers = value.match(/[\d.]+/g).map(Number)
  if (value.startsWith('hsla(') || value.startsWith('hsl(')) return hslToRgb(...numbers)
  return numbers.slice(0, 3)
}

function contrast(first, second) {
  const luminance = color => {
    const [red, green, blue] = color.map(value => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('teacher card text stays readable against translucent macaron colors', () => {
  const teachers = Array.from({ length: 64 }, (_, index) => ({ id: `teacher-${index}`, createdAt: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}` }))
  for (const teacher of teachers) {
    const color = teacherColor(teacher.id, teachers)
    const alpha = Number(color.bg.match(/([\d.]+)\)$/)[1])
    const background = cssColor(color.bg).map(channel => channel * alpha + 255 * (1 - alpha))
    assert.ok(contrast(cssColor(color.fg), background) >= 4.5, `${teacher.id} text contrast below 4.5:1`)
  }
})

test('selected navigation text stays readable on the selected background', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  const color = name => {
    const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))
    assert.ok(match, `missing ${name} theme color`)
    return cssColor(match[1])
  }
  assert.ok(contrast(color('color-primary-text'), color('color-selected')) >= 4.5)
  assert.ok(contrast(color('color-primary'), [255, 255, 255]) >= 4.5)
})
