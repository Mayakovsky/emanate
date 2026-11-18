import test from 'node:test'
import assert from 'node:assert/strict'
import { SynthBrain, SYNTH_CONFIG } from '../src/synthai.ts'
import { canFly, pickFlightTarget } from '../src/flybrain.ts'

const at = (x: number, z: number, y = 0) => ({ x, y, z })
const cfg = { ...SYNTH_CONFIG, flyEnabled: true }
const spot = (x: number, y: number, z: number, rel: number, cost = 50) => ({ x, y, z, cost, rel })

function mk(over: Partial<typeof SYNTH_CONFIG> = {}, rngv = 0.1) {
  let t = 1_000_000
  const b = new SynthBrain(() => t, () => rngv, { ...SYNTH_CONFIG, flyEnabled: true, holdForFreshList: false, ...over })
  b.navUse = true
  b.level = 3
  return { b, adv: (s: number) => (t += s * 1000) }
}
const field = () => [
  spot(-80, 0, 12, 0), spot(70, 0, 3, 0), // ground beside the two roofs, so their height above the local ground is real inside the brain
  spot(-60, 0, 0, 0), spot(-80, 30, 10, 30), spot(70, 25, 0, 25), spot(0, 90, 20, 5), spot(-50, 130, 0, 60), // the last one is above the altitude limit
]

test('flight needs the setting, level 3, the cooldown and a player close; the preference gates it', () => {
  const r = () => 0.1
  assert.equal(canFly({ ...cfg, flyEnabled: false }, 3, 1e6, 0, 20, r), false)
  assert.equal(canFly(cfg, 2, 1e6, 0, 20, r), false)
  assert.equal(canFly(cfg, 3, 1e6, 1e6 - 5000, 20, r), false) // cooldown
  assert.equal(canFly(cfg, 3, 1e6, 0, 80, r), false) // nobody close
  assert.equal(canFly(cfg, 3, 1e6, 0, null, r), false)
  assert.equal(canFly(cfg, 3, 1e6, 0, 20, () => 0.9), false) // preference 0.6
  assert.equal(canFly(cfg, 3, 1e6, 0, 20, r), true)
})

test('targets are farther from the chaser than the Synth is, within range, and under the altitude limit', () => {
  const synth = at(0, 0), from = at(30, 0)
  for (const rv of [0.05, 0.4, 0.9]) {
    const t = pickFlightTarget(synth, from, field(), cfg, () => rv)
    assert.ok(t)
    assert.ok(t.y <= cfg.flyMaxAltitude)
    assert.ok(Math.hypot(t.x, t.z) <= cfg.flyRange && Math.hypot(t.x, t.z) >= cfg.flyMinRange)
    assert.ok(Math.hypot(t.x - from.x, t.z - from.z) > 30 + 15)
  }
})

test('a roof target is a roof (rel at least 5 m) and ends there; a sky target hovers over a spot and remembers it to land on', () => {
  const synth = at(0, 0), from = at(30, 0)
  const roof = pickFlightTarget(synth, from, field(), { ...cfg, flyRoofShare: 1 }, () => 0.01)!
  assert.equal(roof.kind, 'roof'); assert.equal(roof.landing, null)
  assert.ok([30, 25].includes(roof.y))
  const sky = pickFlightTarget(synth, from, field(), { ...cfg, flyRoofShare: 0 }, () => 0.5)!
  assert.equal(sky.kind, 'sky')
  assert.ok(sky.landing && sky.y === Math.min(cfg.flyMaxAltitude, sky.landing.y + cfg.flySkyHeight))
})

test('no usable spot means no flight (the brain runs as before)', () => {
  assert.equal(pickFlightTarget(at(0, 0), at(30, 0), [spot(5, 0, 5, 0)], cfg, () => 0.1), null)
  assert.equal(pickFlightTarget(at(0, 0), at(30, 0), [spot(-300, 0, 0, 0)], cfg, () => 0.1), null)
})

test('at level 3 with the setting on, a flee starts with a fly_plan; at level 2 or with it off, it runs', () => {
  const { b } = mk()
  b.setNavSpots(field())
  const c = b.step(at(0, 0), [at(20, 0)], 'free')
  assert.equal(c?.cmd, 'fly_plan')
  const off = mk({ flyEnabled: false }); off.b.setNavSpots(field())
  assert.notEqual(off.b.step(at(0, 0), [at(20, 0)], 'free')?.cmd, 'fly_plan')
  const l2 = mk(); l2.b.level = 2; l2.b.setNavSpots(field())
  assert.notEqual(l2.b.step(at(0, 0), [at(20, 0)], 'free')?.cmd, 'fly_plan')
})

test('while flying the brain sends nothing else; arrival ends the flee and hides; the cooldown blocks the next flight', () => {
  const { b, adv } = mk()
  b.setNavSpots(field())
  assert.equal(b.step(at(0, 0), [at(20, 0)], 'free')?.cmd, 'fly_plan')
  adv(2)
  assert.equal(b.step(at(0, 0, 10), [at(20, 0)], 'free'), null)
  b.onFly({ status: 'arrived' })
  b.step(at(-80, 30, 10), [at(20, 0)], 'free')
  assert.equal(b.state, 'hide')
  assert.equal(b.fleeLog[b.fleeLog.length - 1].ended, 'flight-arrived')
  assert.equal(b.flightLog[0].result, 'arrived')
  // a new sighting right away: cooldown 20 s, so it runs
  adv(1)
  b.state = 'wander'
  const c = b.step(at(-80, 30, 10), [at(-60, 30)], 'free')
  assert.notEqual(c?.cmd, 'fly_plan')
})

test('a sky hover lands on its spot after the hide', () => {
  const { b, adv } = mk({ flyRoofShare: 0 })
  b.setNavSpots(field())
  const c = b.step(at(0, 0), [at(20, 0)], 'free') as any
  assert.equal(c.cmd, 'fly_plan')
  b.onFly({ status: 'arrived' })
  b.step(at(c.x, c.y, c.z), [at(500, 500)], 'free')
  assert.ok(b.pendingLanding)
  adv(60)
  b.setNavSpots(field())
  const land = b.step(at(c.x, c.y, c.z), [at(500, 500)], 'free') as any
  assert.equal(land?.cmd, 'fly_plan')
  assert.ok(land.y < c.y)
  b.onFly({ status: 'landed' })
  b.step(at(land.x, land.y, land.z), [at(500, 500)], 'free')
  assert.equal(b.flight, null)
})

test('a failed flight falls back: no hide, the next sighting runs; the time cap ends a flight too', () => {
  const a = mk(); a.b.setNavSpots(field())
  a.b.step(at(0, 0), [at(20, 0)], 'free')
  a.b.onFly({ status: 'failed' })
  const after = a.b.step(at(0, 0), [at(20, 0)], 'free') // the failed flight is dropped and the same sighting starts an ordinary flee (the cooldown blocks another flight)
  assert.equal(a.b.flight, null); assert.notEqual(after?.cmd, 'fly_plan'); assert.equal(a.b.fleeLog[0].ended, 'flight-failed')
  const c = mk(); c.b.setNavSpots(field())
  c.b.step(at(0, 0), [at(20, 0)], 'free')
  c.adv(SYNTH_CONFIG.flyMaxSeconds + 1)
  c.b.step(at(0, 0, 40), [at(20, 0)], 'free')
  assert.equal(c.b.flightLog[0].result, 'cap')
})

test('the flight settings default to off', () => { assert.equal(SYNTH_CONFIG.flyEnabled, false) })

test('round 17: a hover plan asks the client to check the column; a roof plan does not; roofs are the default', () => {
  assert.equal(SYNTH_CONFIG.flyRoofShare, 1.0)
  const { b } = mk({ flyRoofShare: 0 }); b.setNavSpots(field())
  const c = b.step(at(0, 0), [at(20, 0)], 'free') as any
  assert.equal(c.hover, true)
  const r = mk({ flyRoofShare: 1 }); r.b.setNavSpots(field())
  const rc = r.b.step(at(0, 0), [at(20, 0)], 'free') as any
  assert.equal(rc.hover, undefined)
})
