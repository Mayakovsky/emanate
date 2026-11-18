import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ParcelSet, nearestEmptyParcel, parcelOf, warnDistance, dist2d } from '../src/geo.ts'
import { parseSynthLine } from '../src/synthfeed.ts'

test('parcelOf floors, including negatives', () => {
  assert.deepEqual(parcelOf(0, 0), [0, 0])
  assert.deepEqual(parcelOf(15.99, 16), [0, 1])
  assert.deepEqual(parcelOf(-0.01, -16.01), [-1, -2])
})

test('ParcelSet.nearest: distance to the nearest dead parcel rectangle, 0 inside, boundary point on its edge', () => {
  const s = new ParcelSet([[10, 0]]) // x 160..176, z 0..16
  const a = s.nearest(100, 8)!
  assert.equal(a.dist, 60)
  assert.deepEqual(a.at, { x: 160, z: 8 })
  assert.equal(s.nearest(165, 8)!.dist, 0)
  const diag = s.nearest(150, -10)!
  assert.ok(Math.abs(diag.dist - Math.hypot(10, 10)) < 1e-9)
  assert.equal(s.nearest(1000, 1000, 400), null) // out of range
})

test('nearest empty parcel: returns the closest one and its centre', () => {
  const empty = new ParcelSet([[5, 5], [-20, -20], [6, 5]])
  const r = nearestEmptyParcel(empty, 90, 90)!
  assert.deepEqual([r.px, r.pz], [5, 5])
  assert.deepEqual(r.center, { x: 88, z: 88 })
  assert.equal(nearestEmptyParcel(new ParcelSet([]), 0, 0), null)
})

test('warn distance matches the design (10 m or 2 s of travel)', () => {
  assert.equal(warnDistance(24.3), 48.6)
  assert.equal(warnDistance(1), 10)
  assert.equal(dist2d({ x: 0, z: 0 }, { x: 3, z: 4 }), 5)
})

test('Synth log line parsing: position events only', () => {
  const p = parseSynthLine('@synth {"event":"position","position":[205.3,0.0,383.9],"velocity":[0,0,0]}')
  assert.deepEqual(p, { x: 205.3, y: 0, z: 383.9 })
  assert.equal(parseSynthLine('@synth {"event":"tracking","on":true}'), null)
  assert.equal(parseSynthLine('2026 INFO other engine line'), null)
  assert.equal(parseSynthLine('@synth {not json'), null)
})

test('the built Zone maps are loadable and consistent (when present)', () => {
  const dir = path.join(import.meta.dirname, '..', 'data')
  const ef = path.join(dir, 'empty-parcels.json')
  if (!fs.existsSync(ef)) return
  const empty = JSON.parse(fs.readFileSync(ef, 'utf8'))
  const dead = JSON.parse(fs.readFileSync(path.join(dir, 'deadzones.json'), 'utf8'))
  const e = new ParcelSet(empty.parcels)
  for (const [x, z] of dead.parcels) assert.equal(e.has(x, z), false) // a dead zone is a deployed scene, never an empty parcel
  assert.ok(e.size > 1000)
  assert.ok(nearestEmptyParcel(e, 0, 0))
})
