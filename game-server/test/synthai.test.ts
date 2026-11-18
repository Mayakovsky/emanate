import test from 'node:test'
import assert from 'node:assert/strict'
import { SynthBrain, SYNTH_CONFIG } from '../src/synthai.ts'

function mk(cfg = SYNTH_CONFIG) {
  let t = 1_000_000
  let seed = 3
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const clock = { adv: (s: number) => (t += s * 1000) }
  return { b: new SynthBrain(() => t, rng, cfg), clock }
}
const at = (x: number, z: number) => ({ x, y: 0, z })

test('wanders when no player is near: walk_to, with a pause between waypoints', () => {
  const { b, clock } = mk()
  const c1 = b.step(at(0, 0), [at(500, 500)], 'free')
  assert.equal(c1?.cmd, 'walk_to')
  assert.equal(b.step(at(0, 0), [at(500, 500)], 'free'), null) // paused
  clock.adv(10)
  assert.equal(b.step(at(0, 0), [at(500, 500)], 'free')?.cmd, 'walk_to')
})

test('runs away when a player comes within the near radius, away from the player', () => {
  const { b } = mk()
  const c = b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(c?.cmd, 'run_to')
  assert.equal(b.state, 'flee')
  assert.ok((c as any).x < 0) // player is at +x: the target is on the -x side (within the jitter)
})

test('does not run for a player outside the near radius', () => {
  const { b } = mk()
  b.step(at(0, 0), [at(46, 0)], 'free')
  assert.equal(b.state, 'wander')
})

test('after running the slider distance it ducks in (stop) and hides for the hide duration, then wanders', () => {
  const { b, clock } = mk()
  b.step(at(0, 0), [at(30, 0)], 'free')
  clock.adv(5)
  const cmd = b.step(at(-61, 0), [at(30, 0)], 'free') // 61 m from where it started fleeing
  assert.equal(cmd?.cmd, 'stop')
  assert.equal(b.state, 'hide')
  clock.adv(19)
  b.step(at(-61, 0), [at(-300, 0)], 'free')
  assert.equal(b.state, 'hide')
  clock.adv(2)
  b.step(at(-61, 0), [at(-300, 0)], 'free')
  assert.equal(b.state, 'wander')
})

test('a player right on top of it while it hides breaks its cover', () => {
  const { b, clock } = mk()
  b.step(at(0, 0), [at(30, 0)], 'free')
  clock.adv(5)
  b.step(at(-61, 0), [at(30, 0)], 'free')
  assert.equal(b.state, 'hide')
  clock.adv(3)
  const c = b.step(at(-61, 0), [at(-55, 0)], 'free') // 6 m: discovered
  assert.equal(c?.cmd, 'run_to')
  assert.equal(b.state, 'flee')
})

test('keep-running duration caps a run even if it did not cover the distance', () => {
  const { b, clock } = mk()
  b.step(at(0, 0), [at(30, 0)], 'free')
  clock.adv(26)
  const c = b.step(at(-5, 0), [at(30, 0)], 'free')
  assert.equal(c?.cmd, 'stop')
  assert.equal(b.state, 'hide')
})

test('frozen (stop) in Repair and Upgrade Mode; Reset Mode slows it to a walk', () => {
  const { b } = mk()
  assert.equal(b.step(at(0, 0), [at(30, 0)], 'repair')?.cmd, 'stop')
  const b2 = mk().b
  assert.equal(b2.step(at(0, 0), [at(30, 0)], 'upgrade')?.cmd, 'stop')
  const m = mk()
  const c = m.b.step(at(0, 0), [at(30, 0)], 'reset')
  assert.equal(c?.cmd, 'walk_to')
})

test('stuck while running: a new waypoint after the stuck time', () => {
  const { b, clock } = mk()
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any
  clock.adv(5)
  const again = b.step(at(0, 0), [at(30, 0)], 'free') as any // not moved for 5 s
  assert.equal(again?.cmd, 'run_to')
  assert.notDeepEqual([first.x, first.z], [again.x, again.z])
})

test('patterns change the run and hide lengths', () => {
  const sr = mk({ ...SYNTH_CONFIG, pattern: 'short-run-long-hide' })
  sr.b.step(at(0, 0), [at(30, 0)], 'free')
  sr.clock.adv(3)
  assert.equal(sr.b.step(at(-31, 0), [at(30, 0)], 'free')?.cmd, 'stop') // short: 30 m
  const lr = mk({ ...SYNTH_CONFIG, pattern: 'long-run-short-hide' })
  lr.b.step(at(0, 0), [at(30, 0)], 'free')
  lr.clock.adv(3)
  assert.equal(lr.b.step(at(-70, 0), [at(30, 0)], 'free'), null) // long: needs 96 m
})

test('reset() returns to wandering (used after a teleport)', () => {
  const { b } = mk()
  b.step(at(0, 0), [at(30, 0)], 'free')
  b.reset()
  assert.equal(b.state, 'wander')
})
