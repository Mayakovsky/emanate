import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStats, parseEvents } from '../src/publicdata.ts'

test('stats: the shapes DCL stats may use, parcels merged into gatherings, empty list ok', () => {
  assert.deepEqual(parseStats({ parcels: [] }), [])
  const s = parseStats({ parcels: [{ parcel: [10, 10], peersCount: 3 }, { x: 11, z: 10, count: 2 }, { coords: [40, 40], players: 1 }, { parcel: { x: -5, y: 7 }, peersCount: 0 }] })
  assert.equal(s.length, 2)
  assert.equal(s[0]!.count, 5)
  assert.equal(s[0]!.x, 10 * 16 + 8)
  assert.equal(s[1]!.count, 1)
})

test('events: only live events with coordinates, in metres', () => {
  const e = parseEvents({ data: [{ live: true, coordinates: [2, 3] }, { live: false, coordinates: [9, 9] }, { live: true }] })
  assert.deepEqual(e, [{ x: 2 * 16 + 8, z: 3 * 16 + 8 }])
})
