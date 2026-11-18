import test from 'node:test'
import assert from 'node:assert/strict'
import { ParcelSet } from '../src/geo.ts'
import { density, inDeadZone, scoreCandidate, pickHidingSpot, sampleCandidates, mustMoveOn, shouldGlideEscape, exposureFactor, redArrowTarget } from '../src/hiding.ts'
import { SynthBrain, SYNTH_CONFIG, type World } from '../src/synthai.ts'

const cfg = { highLowPreference: 0.3, terrainPreference: 0.6, gliderEscapeHeight: 12, hideLimitInsideOwnedParcelsSeconds: 25, exposureBoostInsideParcels: 1.5 }
const at = (x: number, z: number, y = 0) => ({ x, y, z })

test('density counts built parcels in the 3x3 block', () => {
  const b = new ParcelSet([[0, 0], [1, 0], [0, 1], [5, 5]])
  assert.equal(density(b, 0, 0), 3)
  assert.equal(density(b, 5, 5), 1)
  assert.equal(density(b, 20, 20), 0)
})

test('terrain preference: a dense-leaning Synth picks the dense candidate, an open-leaning one the sparse candidate', () => {
  const built = new ParcelSet([[10, 10], [11, 10], [10, 11], [11, 11], [9, 10], [9, 9], [10, 9], [11, 9], [9, 11]]) // a dense block at 9..11
  const dense = { x: 10.5 * 16, z: 10.5 * 16, y: 0 }
  const open = { x: 30 * 16, z: 30 * 16, y: 0 }
  const from = at(20 * 16, 20 * 16)
  const player = at(25 * 16, 25 * 16)
  assert.deepEqual(pickHidingSpot([dense, open], from, player, built, { ...cfg, terrainPreference: 1 }), dense)
  assert.deepEqual(pickHidingSpot([dense, open], from, player, built, { ...cfg, terrainPreference: 0 }), open)
})

test('high/low preference scores a rooftop candidate higher for a high-leaning Synth and lower for a low-leaning one', () => {
  const built = new ParcelSet([])
  const from = at(0, 0), player = at(100, 0)
  const roof = { x: -60, z: 0, y: 40 }, ground = { x: -60, z: 0, y: 0 }
  assert.ok(scoreCandidate(roof, from, player, built, { ...cfg, highLowPreference: 1 }) > scoreCandidate(ground, from, player, built, { ...cfg, highLowPreference: 1 }))
  assert.ok(scoreCandidate(roof, from, player, built, { ...cfg, highLowPreference: 0 }) < scoreCandidate(ground, from, player, built, { ...cfg, highLowPreference: 0 }))
})

test('a candidate farther from the player scores higher (hiding AWAY from the hunter)', () => {
  const built = new ParcelSet([])
  const from = at(0, 0), player = at(40, 0)
  assert.ok(scoreCandidate({ x: -50, z: 0, y: 0 }, from, player, built, cfg) > scoreCandidate({ x: 30, z: 0, y: 0 }, from, player, built, cfg))
})

test('sampleCandidates is deterministic with a fixed rng and stays within the ring', () => {
  let seed = 5
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const c = sampleCandidates(at(100, 100), 20, 50, rng, () => 0)
  assert.equal(c.length, 20)
  for (const p of c) { const d = Math.hypot(p.x - 100, p.z - 100); assert.ok(d >= 19.9 && d <= 50.1, String(d)) }
})

test('hide limit: it must move on only after the cap, and only inside a built parcel', () => {
  assert.equal(mustMoveOn(24, true, cfg), false)
  assert.equal(mustMoveOn(25, true, cfg), true)
  assert.equal(mustMoveOn(500, false, cfg), false)
})

test('glider escape: needs a high enough build and a close player', () => {
  assert.equal(shouldGlideEscape(20, 10, cfg), true)
  assert.equal(shouldGlideEscape(8, 10, cfg), false)
  assert.equal(shouldGlideEscape(20, 60, cfg), false)
})

test('exposure boost applies only while hiding inside built parcels', () => {
  assert.equal(exposureFactor(true, cfg), 1.5)
  assert.equal(exposureFactor(false, cfg), 1)
})

test('the red arrow has no target inside a mapped dead zone', () => {
  const dead = new ParcelSet([[10, 10]])
  assert.equal(inDeadZone(dead, at(165, 170)), true)
  assert.equal(redArrowTarget(at(165, 170), dead), null)
  assert.deepEqual(redArrowTarget(at(10, 10), dead), at(10, 10))
})

function brainWith(world: World, cfgOver = {}) {
  let t = 1_000_000
  let seed = 11
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return { b: new SynthBrain(() => t, rng, { ...SYNTH_CONFIG, ...cfgOver }, world), clock: { adv: (s: number) => (t += s * 1000) } }
}
const world = (built: [number, number][], h = 30): World => ({ built: new ParcelSet(built), heights: new Map(built.map(([x, z]) => [x + ',' + z, h] as [string, number])), dead: new ParcelSet([]) })

test('brain with a world: it still flees away from the player (target on the far side)', () => {
  const { b } = brainWith(world([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]))
  const c = b.step(at(8, 8), [at(38, 8)], 'free') as any
  assert.equal(c.cmd, 'run_to')
  assert.ok(Math.hypot(c.x - 38, c.z - 8) > Math.hypot(8 - 38, 8 - 8), 'ends up farther from the player than it started')
})

test('hiding inside a built parcel stops after the hide limit even if the hide duration is longer', () => {
  const { b, clock } = brainWith(world([[0, 0]]), { hideDurationSeconds: 120, hideLimitInsideOwnedParcelsSeconds: 10 })
  b.step(at(8, 8), [at(38, 8)], 'free')
  clock.adv(5)
  b.step(at(8, -70), [at(38, 8)], 'free') // fled far: now hides (stop); the point is not in a built parcel yet
  assert.equal(b.state, 'hide')
  clock.adv(1); b.step(at(8, 8), [at(300, 300)], 'free') // standing inside the built parcel (0,0)
  assert.equal(b.insideBuilt, true)
  clock.adv(12); b.step(at(8, 8), [at(300, 300)], 'free')
  assert.equal(b.state, 'wander') // energy cap reached: it moves on
})

test('hiding outside built parcels is not capped (only the hide duration applies)', () => {
  const { b, clock } = brainWith(world([[0, 0]]), { hideDurationSeconds: 120, hideLimitInsideOwnedParcelsSeconds: 10 })
  b.step(at(500, 500), [at(530, 500)], 'free')
  clock.adv(5)
  b.step(at(440, 500), [at(530, 500)], 'free')
  assert.equal(b.state, 'hide')
  clock.adv(30); b.step(at(440, 500), [at(900, 900)], 'free')
  assert.equal(b.state, 'hide')
})

test('glide escape: stuck while a player is close and the build is high -> takeoff, double jump, glide (three jumps)', () => {
  const { b, clock } = brainWith(world([[0, 0]], 30))
  b.step(at(8, 8), [at(30, 8)], 'free') // flee
  clock.adv(5)
  const c = b.step(at(8, 8), [at(30, 8)], 'free')
  assert.equal(c?.cmd, 'jump')
  assert.equal(b.step(at(8, 8), [at(30, 8)], 'free')?.cmd, 'jump')
  assert.equal(b.step(at(8, 8), [at(30, 8)], 'free')?.cmd, 'jump')
})

test('no world data: the brain behaves as before (no glide, plain flee)', () => {
  const { b, clock } = brainWith({ built: new ParcelSet([]), heights: new Map(), dead: new ParcelSet([]) })
  b.step(at(0, 0), [at(30, 0)], 'free')
  clock.adv(5)
  assert.equal(b.step(at(0, 0), [at(30, 0)], 'free')?.cmd, 'run_to')
})
