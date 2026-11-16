import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ArrowChannel, arrowSpeed, deadZoneTriggerDistance, pressRed, pressPink, Warnings, PlumeBudget, RULES, chevronOffsets,
  arrowHeadingDeg, testMovingSynth, testDeadZoneDistance, TEST_TARGETS, type Vec
} from '../src/logic.ts'

const v = (x: number, z: number, y = 0): Vec => ({ x, y, z })

test('arrow channel: 4 s on, then a 7 s cooldown, then it can start again', () => {
  const c = new ArrowChannel()
  assert.equal(c.start(0, 'key'), 'started')
  assert.equal(c.start(1, 'key'), 'busy')
  assert.equal(c.active(3.9), true)
  assert.equal(c.active(4.0), false)
  assert.equal(c.start(10.9, 'key'), 'cooldown') // 4 + 7 = 11
  assert.equal(c.start(11, 'key'), 'started')
})

test('a warning arrow is followed by a 5 s cooldown', () => {
  const c = new ArrowChannel()
  assert.equal(c.start(0, 'warning'), 'started')
  assert.equal(c.start(8.9, 'warning'), 'cooldown')
  assert.equal(c.start(9, 'warning'), 'started')
})

test('cooldown left reports the time after the arrow', () => {
  const c = new ArrowChannel()
  c.start(0, 'key')
  assert.equal(c.cooldownLeft(2), 7)
  assert.equal(c.cooldownLeft(6), 5)
  assert.equal(c.cooldownLeft(12), 0)
})

test('animation speed rises as the target gets closer', () => {
  assert.ok(arrowSpeed(10) > arrowSpeed(100))
  assert.ok(arrowSpeed(100) > arrowSpeed(250))
  assert.equal(arrowSpeed(1000), RULES.arrowSpeedMin)
  assert.ok(arrowSpeed(0) <= RULES.arrowSpeedMax)
})

test('key 1: arrow outside 100 m, overloaded inside; the cooldown applies to both', () => {
  const c = new ArrowChannel()
  const far = pressRed(c, 0, v(0, 0), v(150, 0))
  assert.equal(far.kind, 'arrow')
  assert.equal(pressRed(c, 2, v(0, 0), v(150, 0)).kind, 'cooldown')
  const c2 = new ArrowChannel()
  assert.equal(pressRed(c2, 0, v(0, 0), v(60, 0)).kind, 'overloaded')
  assert.equal(pressRed(new ArrowChannel(), 0, v(0, 0), v(99.9, 0)).kind, 'overloaded')
  assert.equal(pressRed(new ArrowChannel(), 0, v(0, 0), v(100.1, 0)).kind, 'arrow')
  assert.equal(pressRed(new ArrowChannel(), 0, v(0, 0), null).kind, 'none')
})

test('key 2: works only within 80 m of a drop; picks the nearest; does not use up the cooldown when nothing is near', () => {
  const c = new ArrowChannel()
  assert.equal(pressPink(c, 0, v(0, 0), [{ id: 1, pos: v(90, 0) }]).kind, 'none')
  assert.equal(c.start(0, 'key'), 'started') // untouched by the failed press
  const c2 = new ArrowChannel()
  const r = pressPink(c2, 0, v(0, 0), [{ id: 1, pos: v(79, 0) }, { id: 2, pos: v(30, 0) }])
  assert.equal(r.kind === 'arrow' && r.id, 2)
  assert.equal(pressPink(c2, 1, v(0, 0), [{ id: 2, pos: v(30, 0) }]).kind, 'cooldown')
})

test('dead-zone trigger distance: 10 m or 2 s of travel, whichever is further', () => {
  assert.equal(deadZoneTriggerDistance(3), 10)
  assert.equal(deadZoneTriggerDistance(5), 10)
  assert.equal(deadZoneTriggerDistance(24.3), 48.6)
  assert.equal(deadZoneTriggerDistance(19.2), 38.4)
})

test('dead-zone warning: fires inside the trigger distance, then the 5 s cooldown; key 3 toggles it', () => {
  const w = new Warnings()
  const c = new ArrowChannel()
  assert.equal(w.deadZone(c, 0, 24.3, 60), false) // 60 m > 48.6 m
  assert.equal(w.deadZone(c, 0, 24.3, 40), true)
  assert.equal(w.deadZone(c, 1, 24.3, 30), false) // arrow still playing
  assert.equal(w.deadZone(c, 8, 24.3, 30), false) // 4 s on + 5 s cooldown = 9
  assert.equal(w.deadZone(c, 9, 24.3, 30), true)
  assert.equal(w.toggleDeadZone(), false)
  assert.equal(w.deadZone(c, 100, 24.3, 5), false) // switched off
  assert.equal(w.toggleDeadZone(), true)
  assert.equal(w.deadZone(c, 200, 24.3, null), false) // no dead zone near
  assert.equal(w.deadZone(c, 300, 24.3, 0), false) // already inside: the halo is off
})

test('dead-zone: a slow walker is warned at 10 m, a flyer at about 40-50 m', () => {
  const w = new Warnings()
  assert.equal(w.deadZone(new ArrowChannel(), 0, 4, 11), false)
  assert.equal(w.deadZone(new ArrowChannel(), 0, 4, 9), true)
  assert.equal(w.deadZone(new ArrowChannel(), 0, 24, 47), true)
})

test('upgrade nearby: announces a drop once when it first comes within 80 m', () => {
  const w = new Warnings()
  const c = new ArrowChannel()
  const drops = [{ id: 'a', pos: v(100, 0) }]
  assert.equal(w.upgradeNearby(c, 0, v(0, 0), drops), null) // 100 m
  assert.equal(w.upgradeNearby(c, 1, v(30, 0), drops)?.id, 'a') // 70 m
  assert.equal(w.upgradeNearby(c, 20, v(40, 0), drops), null) // same drop, already announced
  assert.equal(w.upgradeNearby(c, 40, v(40, 0), [{ id: 'b', pos: v(100, 0) }])?.id, 'b') // a new drop is announced
})

test('upgrade nearby: waits (stays unannounced) while the pink arrow is cooling down', () => {
  const w = new Warnings()
  const c = new ArrowChannel()
  c.start(0, 'key') // key 2 just used: busy until 4, cooling until 11
  const drops = [{ id: 'a', pos: v(10, 0) }]
  assert.equal(w.upgradeNearby(c, 5, v(0, 0), drops), null)
  assert.equal(w.upgradeNearby(c, 12, v(0, 0), drops)?.id, 'a')
})

test('plumes: three per round, then none; refill', () => {
  const p = new PlumeBudget()
  assert.deepEqual([p.use(), p.use(), p.use(), p.use()], [true, true, true, false])
  p.refill()
  assert.equal(p.use(), true)
})

test('arrow heading: 0 deg is +z, 90 is +x', () => {
  assert.equal(Math.round(arrowHeadingDeg(v(0, 0), v(0, 10))), 0)
  assert.equal(Math.round(arrowHeadingDeg(v(0, 0), v(10, 0))), 90)
  assert.equal(Math.round(arrowHeadingDeg(v(0, 0), v(-10, 0))), -90)
})

test('chevrons march forward with the phase and fade at the ends', () => {
  const a = chevronOffsets(6, 2, 0, 1.5, 100)
  const b = chevronOffsets(6, 2, 0.5, 1.5, 100)
  assert.equal(a.length, 6)
  assert.ok(b[0].s > a[0].s)
  assert.ok(a.every((c) => c.fade >= 0 && c.fade <= 1))
  const clipped = chevronOffsets(6, 2, 0, 1.5, 5)
  assert.ok(clipped.some((c) => c.fade === 0))
})

test('test targets: moving Synth circles its centre; the fake dead zone starts at x=144', () => {
  const p0 = testMovingSynth(0)
  const p1 = testMovingSynth(10)
  assert.ok(Math.abs(Math.hypot(p0.x - TEST_TARGETS.synthMovingCentre.x, p0.z - TEST_TARGETS.synthMovingCentre.z) - 45) < 1e-9)
  assert.notDeepEqual(p0, p1)
  assert.equal(testDeadZoneDistance(v(100, 0))!.dist, 44)
  assert.equal(testDeadZoneDistance(v(150, 0)), null)
})
