import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathMetrics, classifyPath, StyleTracker, styleOverrides } from '../src/style.ts'
import { SynthBrain, SYNTH_CONFIG } from '../src/synthai.ts'

const line = (n: number, step = 3) => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0, z: 0 }))
const circle = (n: number, r = 6) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos(i / 2), y: 0, z: r * Math.sin(i / 2) }))
const zigzag = (n: number) => Array.from({ length: n }, (_, i) => ({ x: (i % 2) * 8, y: 0, z: (i % 4 < 2 ? 0 : 1) * 8 }))

test('a straight path is straightness 1, repetition 0', () => {
  const m = pathMetrics(line(12))
  assert.ok(m.straightness > 0.99); assert.equal(m.repetition, 0)
})
test('a circle has low straightness', () => { assert.ok(pathMetrics(circle(40)).straightness < 0.4) })
test('going back over the same ground has high repetition', () => {
  const p = [...line(10), ...line(10).reverse()]
  assert.ok(pathMetrics(p).repetition >= 0.35)
})
test('classify: line methodical, circle and doubling back chaotic, too little is unknown', () => {
  assert.equal(classifyPath(line(12)), 'methodical')
  assert.equal(classifyPath(circle(40)), 'chaotic')
  assert.equal(classifyPath([...line(10), ...line(10).reverse()]), 'chaotic')
  assert.equal(classifyPath(zigzag(12)), 'chaotic')
  assert.equal(classifyPath(line(4)), 'unknown')
  assert.equal(classifyPath(line(10, 0.5)), 'unknown') // under 12 m of path
})
test('the tracker reads the nearest chaser inside 60 m and forgets samples older than the window', () => {
  const t = new StyleTracker()
  const synth = { x: 40, y: 0, z: 0 }
  for (let i = 0; i < 12; i++) t.observe(synth, [{ x: i * 3, y: 0, z: 0 }, { x: 900, y: 0, z: 900 }], i * 1000)
  assert.equal(t.style(), 'methodical')
  t.observe(synth, [{ x: 0, y: 0, z: 0 }], 200000)
  assert.equal(t.style(), 'unknown')
})
test('overrides: methodical goes dense, high, long run; chaotic goes open, low, short run; unknown changes nothing', () => {
  assert.deepEqual(styleOverrides('unknown'), {})
  assert.ok(styleOverrides('methodical').terrainPreference! > 0.6 && styleOverrides('methodical').highLowPreference! > 0.3)
  assert.ok(styleOverrides('chaotic').terrainPreference! < 0.6 && styleOverrides('chaotic').highLowPreference! < 0.3)
  assert.equal(styleOverrides('methodical').pattern, 'long-run-short-hide')
})
test('the setting defaults to off and, when off, the brain never reads a style', () => {
  assert.equal(SYNTH_CONFIG.adaptToPlayerStyle, false)
  let t = 0
  const b = new SynthBrain(() => t, () => 0.5)
  const synth = { x: 40, y: 0, z: 0 }
  for (let i = 0; i < 20; i++) { t += 1000; b.step(synth, [{ x: i * 3, y: 0, z: 0 }], 'free') }
  assert.equal(b.style, 'unknown')
})
test('when on, the brain reads the style from the players it is given', () => {
  let t = 0
  const b = new SynthBrain(() => t, () => 0.5, { ...SYNTH_CONFIG, adaptToPlayerStyle: true })
  const synth = { x: 40, y: 0, z: 0 }
  for (let i = 0; i < 20; i++) { t += 1000; b.step(synth, [{ x: i * 3, y: 0, z: 0 }], 'free') }
  assert.equal(b.style, 'methodical')
})
