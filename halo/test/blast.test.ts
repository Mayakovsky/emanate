import test from 'node:test'
import assert from 'node:assert/strict'
import { planBlast } from '../src/blastplan.ts'
import { BLAST } from '../src/settings.ts'

test('every planned landing is inside the radius of the centre (and the map), for many seeds and starts', () => {
  const centre = { x: 100, y: 0, z: -50 }
  for (let s = 1; s <= 2000; s++) {
    const from = { x: (s % 7) * 90 - 300, y: 10, z: (s % 11) * 60 - 300 }
    const p = planBlast(from, centre, 500, s)
    assert.ok(Math.hypot(p.land.x - centre.x, p.land.z - centre.z) <= 500 + 1e-6, 'inside 500 m of the centre')
    assert.ok(Math.abs(p.land.x) <= BLAST.bounds && Math.abs(p.land.z) <= BLAST.bounds)
    assert.ok(p.vh <= BLAST.vMax + 1e-9 && p.vUp > 0 && Number.isFinite(p.flight))
  }
})
test('the same seed gives the same plan, different seeds differ (it is different every time)', () => {
  const a = planBlast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 500, 7), b = planBlast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 500, 7), c = planBlast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 500, 8)
  assert.deepEqual(a, b); assert.notDeepEqual(a.land, c.land)
})
test('a far landing raises the apex so the flight time fits the speed ceiling', () => {
  const p = planBlast({ x: -400, y: 0, z: 0 }, { x: 400, y: 0, z: 0 }, 1, 3)
  assert.ok(p.dist > 700 && p.vh <= BLAST.vMax + 1e-9 && p.apex > 0)
})

import { bubbleScale } from '../src/blastplan.ts'
test('the bubble timeline: grows with an ease, holds at about full size for the hold time, implodes to zero and ends gone', () => {
  const E = 2.5, H = 3, I = 1
  assert.equal(bubbleScale(0, E, H, I), 0)
  assert.ok(bubbleScale(0.5, E, H, I) > 0.4 && bubbleScale(0.5, E, H, I) < 1) // fast start
  assert.ok(Math.abs(bubbleScale(E, E, H, I) - 1) < 1e-9) // max at the end of the expansion
  for (let t = E; t < E + H; t += 0.1) assert.ok(Math.abs(bubbleScale(t, E, H, I) - 1) <= 0.031)
  assert.ok(Math.abs(bubbleScale(E + H, E, H, I) - 1) < 1e-9) // the hold ends at full size, so the implosion starts from it
  assert.ok(bubbleScale(E + H + 0.5, E, H, I) < 0.9 && bubbleScale(E + H + 0.99, E, H, I) < 0.05)
  assert.equal(bubbleScale(E + H + I + 0.01, E, H, I), 0)
})
