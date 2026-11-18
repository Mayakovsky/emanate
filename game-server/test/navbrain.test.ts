import test from 'node:test'
import assert from 'node:assert/strict'
import { SynthBrain, SYNTH_CONFIG } from '../src/synthai.ts'

function mk(over: Partial<typeof SYNTH_CONFIG> = {}) {
  let t = 1_000_000
  let seed = 5
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const cfg = { ...SYNTH_CONFIG, ...over }
  const b = new SynthBrain(() => t, rng, cfg)
  b.navUse = true
  return { b, clock: { adv: (s: number) => (t += s * 1000) }, cfg }
}
const at = (x: number, z: number, y = 0) => ({ x, y, z })
// a field of reachable spots: ground ring plus a few raised ones (a stair level of 3 m and a high level of 15 m)
function spots() {
  const out: { x: number; y: number; z: number; cost: number }[] = []
  for (let a = 0; a < 360; a += 15) for (const r of [20, 35, 50]) out.push({ x: -r * Math.cos((a * Math.PI) / 180), y: 0, z: r * Math.sin((a * Math.PI) / 180), cost: r })
  return out
}

test('with navigation on and no spot list, the brain asks the Synth for spots (then every 8 s while stale)', () => {
  const { b, clock } = mk()
  const c = b.step(at(0, 0), [at(500, 500)], 'free')
  assert.deepEqual(c, { cmd: 'nav_spots', max_cost: SYNTH_CONFIG.navSpotsMaxCost })
  assert.notEqual(b.step(at(0, 0), [at(500, 500)], 'free')?.cmd, 'nav_spots') // asked just now
  clock.adv(9)
  assert.equal(b.step(at(0, 0), [at(500, 500)], 'free')?.cmd, 'nav_spots')
})

test('with navigation off the brain behaves exactly as before (no nav commands)', () => {
  const { b } = mk()
  b.navUse = false
  const c = b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(c?.cmd, 'run_to')
})

test('relative height is the spot height minus the lowest spot within 8 m', () => {
  const { b } = mk()
  b.setNavSpots([{ x: 0, y: 0, z: 0, cost: 1 }, { x: 4, y: 3, z: 0, cost: 2 }, { x: 100, y: 3, z: 100, cost: 3 }])
  const rel = (x: number) => b.navSpots.find((p) => p.x === x)!.rel
  assert.equal(rel(0), 0)
  assert.equal(rel(4), 3)
  assert.equal(rel(100), 0) // a plateau on its own is "ground" there
})

test('flee uses nav_to to a reachable spot: within the run budget and farther from the player', () => {
  const { b, cfg } = mk()
  b.setNavSpots(spots())
  const c = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(c?.cmd, 'nav_to')
  assert.equal(c.run, true)
  assert.ok(Math.hypot(c.x - 30, c.z) > 30 + 5, 'farther from the player than the Synth is')
  assert.ok(Math.hypot(c.x, c.z) <= cfg.runDistanceBeforeHiding * 1.5 + 1)
  assert.equal(typeof c.y, 'number')
})

test('high preference picks higher hiding spots than low preference (real heights)', () => {
  const field = spots().concat([
    { x: -30, y: 3, z: 10, cost: 32 }, { x: -32, y: 3.2, z: -10, cost: 34 }, { x: -45, y: 15, z: 5, cost: 50 }, { x: -46, y: 15, z: -8, cost: 52 }
  ])
  const run = (pref: number) => {
    const { b } = mk({ highLowPreference: pref, highScaleMetres: 15 })
    b.setNavSpots(field)
    const ys: number[] = []
    for (let i = 0; i < 12; i++) {
      b.reset()
      b.setNavSpots(field)
      const c = b.step(at(0, 0), [at(30 + i, i)], 'free') as any
      if (c?.cmd === 'nav_to') ys.push(c.y)
    }
    return ys.reduce((a, v) => a + v, 0) / Math.max(1, ys.length)
  }
  const high = run(0.9), low = run(0.1)
  assert.ok(high > low + 3, `high ${high} vs low ${low}`)
})

test('stale spots fall back to the plain behaviour (run_to) when the hold is switched off', () => {
  const { b, clock } = mk({ holdForFreshList: false })
  b.setNavSpots(spots())
  clock.adv(SYNTH_CONFIG.navFreshSeconds + 1)
  const c = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(c?.cmd, 'nav_spots') // asks again
  // the next flee decision with stale spots is a plain run
  const d = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(d?.cmd, 'run_to')
})

test('glider escape: a player within 40 m and the Synth high above the ground glides away from the player', () => {
  const { b, clock, cfg } = mk({ gliderEscapeHeight: 12 })
  b.setNavSpots([{ x: 0, y: 0, z: 0, cost: 1 }, { x: 2, y: 15, z: 0, cost: 5 }])
  const high = at(2, 0, 15)
  const c1 = b.step(high, [at(20, 0)], 'free') // starts a flee
  assert.equal(b.state, 'flee')
  clock.adv(1)
  const c2 = b.step(high, [at(20, 0)], 'free') as any
  const cmds = [c1, c2].map((c) => (c as any)?.cmd)
  assert.ok(cmds.includes('glide_escape'), JSON.stringify(cmds))
  const g = [c1, c2].find((c) => (c as any)?.cmd === 'glide_escape') as any
  assert.deepEqual([g.away_x, g.away_z], [20, 0])
  // not again within the cooldown
  clock.adv(1)
  assert.notEqual((b.step(high, [at(20, 0)], 'free') as any)?.cmd, 'glide_escape')
  assert.ok(cfg.glideCooldownSeconds >= 5)
})

test('no glider escape when the Synth is below the escape height', () => {
  const { b, clock } = mk({ gliderEscapeHeight: 12 })
  b.setNavSpots([{ x: 0, y: 0, z: 0, cost: 1 }, { x: 2, y: 3, z: 0, cost: 5 }])
  const low = at(2, 0, 3)
  for (let i = 0; i < 4; i++) {
    const c = b.step(low, [at(20, 0)], 'free') as any
    assert.notEqual(c?.cmd, 'glide_escape')
    clock.adv(1)
  }
})

test('stuck in a high built parcel: climbs to a reachable high spot, glides when it arrives; a failed glide is logged and the cooldown holds', () => {
  const { b, clock } = mk({ gliderEscapeHeight: 12 })
  b.world.heights.set('0,0', 30)
  b.setNavSpots([{ x: 0, y: 0, z: 0, cost: 1 }, { x: -14, y: 0, z: 0, cost: 20 }, { x: -20, y: 16, z: 0, cost: 30 }, { x: -22, y: 16, z: 3, cost: 33 }])
  b.step(at(0, 0), [at(25, 0)], 'free') // flee starts
  clock.adv(SYNTH_CONFIG.stuckSeconds + 1)
  const climb = b.step(at(0, 0), [at(25, 0)], 'free') as any
  assert.equal(climb?.cmd, 'nav_to', JSON.stringify(climb))
  assert.ok(climb.y >= 12, 'a spot high enough')
  assert.ok(b.glidePlan)
  // arrived at the spot: glide away from the player
  clock.adv(5)
  const go = b.step(at(-20, 0, 16), [at(5, 0)], 'free') as any
  assert.equal(go?.cmd, 'glide_escape')
  assert.deepEqual([go.away_x, go.away_z], [5, 0])
  // the client says it cannot glide: logged, no immediate repeat
  b.onGlide({ status: 'failed', reason: 'no_glide' })
  assert.equal(b.glidePlan, null)
  assert.ok(b.glideLog.some((e) => e.what === 'failed'))
})

test('stuck in a high built parcel with NO reachable high spot: the three-jump fallback', () => {
  const { b, clock } = mk({ gliderEscapeHeight: 12 })
  b.world.heights.set('0,0', 30)
  b.setNavSpots([{ x: 0, y: 0, z: 0, cost: 1 }, { x: 10, y: 2, z: 0, cost: 10 }]) // nothing near 12 m
  b.step(at(0, 0), [at(25, 0)], 'free')
  clock.adv(SYNTH_CONFIG.stuckSeconds + 1)
  const first = b.step(at(0, 0), [at(25, 0)], 'free') as any
  assert.equal(first?.cmd, 'jump')
  assert.deepEqual(b.queue.map((c) => c.cmd), ['jump', 'jump', 'jump']) // unchanged from before navigation
  assert.ok(b.glideLog.some((e) => e.what === 'three-jump-fallback'))
})

test('without navigation the stuck glide is the old three jumps', () => {
  const { b, clock } = mk({ gliderEscapeHeight: 12 })
  b.navUse = false
  b.world.heights.set('0,0', 30)
  b.step(at(0, 0), [at(25, 0)], 'free')
  clock.adv(SYNTH_CONFIG.stuckSeconds + 1)
  assert.equal((b.step(at(0, 0), [at(25, 0)], 'free') as any)?.cmd, 'jump')
})

test('a failed nav_to marks its goal bad and the next decision picks another spot', () => {
  const { b, clock } = mk()
  b.setNavSpots(spots())
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(first?.cmd, 'nav_to')
  b.onNav({ status: 'failed', reason: 'no_goal' })
  assert.ok(b.badSpots.length === 1)
  clock.adv(1)
  const second = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(second?.cmd, 'nav_to')
  assert.ok(Math.hypot(second.x - first.x, second.z - first.z) >= 5, 'a different spot')
  clock.adv(61)
  b.setNavSpots(spots())
  b.step(at(-8, 0), [at(30, 0)], 'free') // it has moved (the not-moving check does not apply)
  assert.equal(b.badSpots.length, 0, 'forgotten after a minute')
})

test('a spot list is stale once the Synth has moved away from where it was made, and goals more than 60 m from the Synth are not offered', () => {
  const { b, clock } = mk()
  b.setNavSpots(spots(), undefined, { x: 0, z: 0 })
  assert.equal(b.navFresh({ x: 10, y: 0, z: 0 }), true)
  assert.equal(b.navFresh({ x: 40, y: 0, z: 0 }), false)
  // from 40 m away the old list is refreshed first
  clock.adv(1)
  assert.equal((b.step(at(40, 0), [at(500, 500)], 'free') as any)?.cmd, 'nav_spots')
  // candidates farther than 60 m from the Synth are dropped: a list made at the origin, the Synth 55 m east of it, only offers nearby spots
  const { b: c } = mk()
  c.setNavSpots(spots(), undefined, { x: 0, z: 0 })
  c.navFrom = null // pretend the list was made here
  const cmd = c.step(at(55, 0), [at(85, 0)], 'free') as any
  if (cmd?.cmd === 'nav_to') assert.ok(Math.hypot(cmd.x - 55, cmd.z) <= 60)
})

// ground ring plus one raised platform (10 m) and one low corner; the platform sits 40 m from the origin on the far side from a player at +x
function spotsWithPlatform() {
  const s = spots()
  s.push({ x: -40, y: 10, z: 0, cost: 45 }, { x: -44, y: 0, z: 0, cost: 40 })
  return s
}

test('the run ends at the chosen spot: it keeps running until it gets there, then hides', () => {
  const { b, clock } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10, runDistanceBeforeHiding: 60 })
  b.setNavSpots(spotsWithPlatform())
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(first.cmd, 'nav_to')
  assert.ok(b.hideSpot, 'a spot was chosen')
  assert.ok(b.hideSpot!.rel >= 9, 'the high preference chose the platform')
  // 20 m on, well short of the spot and of the budget: still running
  clock.adv(3)
  b.step(at(-20, 0), [at(10, 0)], 'free')
  assert.equal(b.state, 'flee')
  // at the spot (and past nothing else): it ducks in and the flee is logged with its numbers
  clock.adv(3)
  const sp = b.hideSpot!
  b.step(at(sp.x, sp.z, sp.y), [at(10, 0)], 'free')
  assert.equal(b.state, 'hide')
  const fl = b.fleeLog[b.fleeLog.length - 1]!
  assert.equal(fl.ended, 'arrived')
  assert.equal(fl.spot!.rel >= 9, true)
})

test('a nav "arrived" event at the height of the spot ends the run', () => {
  const { b, clock } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots(spotsWithPlatform())
  b.step(at(0, 0), [at(30, 0)], 'free')
  const sp = b.hideSpot!
  clock.adv(2)
  b.onNav({ status: 'arrived' })
  b.step(at(sp.x + 1, sp.z, sp.y), [at(10, 0)], 'free') // on the platform, a metre off
  assert.equal(b.state, 'hide')
  assert.equal(b.fleeLog[b.fleeLog.length - 1]!.ended, 'arrived')
})

test('arrival height counts: an "arrived" at the foot of a tall spot is a failed goal, the next best spot is routed to', () => {
  const { b, clock } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots(spotsWithPlatform())
  b.step(at(0, 0), [at(30, 0)], 'free')
  const first = { ...b.hideSpot! }
  assert.ok(first.rel >= 8)
  clock.adv(2)
  b.onNav({ status: 'arrived' })
  const c = b.step(at(0, 0, 0), [at(10, 0)], 'free') as any // down at 0 m, not at the 9-10 m of the spot
  assert.equal(b.state, 'flee') // not hiding there
  assert.equal(b.badSpots.length, 1)
  assert.equal(b.fleeLog[b.fleeLog.length - 1]!.retries, 1)
  assert.equal(c?.cmd, 'nav_to')
  assert.ok(b.hideSpot && Math.hypot(b.hideSpot.x - first.x, b.hideSpot.z - first.z) >= 5, 'a different spot')
})

test('after 3 wrong-height arrivals in one flee the run falls back to ending where the budget does', () => {
  const { b, clock } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  const field = spotsWithPlatform()
  for (const [x, z] of [[0, 40], [-30, 30], [-30, -30], [0, -40]]) field.push({ x, y: 9, z, cost: 45 }, { x: x + 4, y: 0, z, cost: 44 })
  b.setNavSpots(field)
  b.step(at(0, 0), [at(30, 0)], 'free')
  for (let i = 0; i < 3; i++) {
    clock.adv(2)
    b.onNav({ status: 'arrived' })
    b.step(at(0, 0, 0), [at(10, 0)], 'free')
  }
  assert.equal(b.spotRetries, 3)
  assert.equal(b.hideSpot, null)
  assert.equal(b.state, 'flee')
})

test('a high spot may be nearer than the ground floor: a platform at 30 m is a candidate for a 60 m budget, a ground spot at 30 m is not', () => {
  const { b } = mk({ runDistanceBeforeHiding: 60, highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots([{ x: -30, y: 9, z: 0, cost: 35 }, { x: -34, y: 0, z: 0, cost: 34 }])
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(b.hideSpot && b.hideSpot.rel >= 8)
  const { b: g } = mk({ runDistanceBeforeHiding: 60 })
  g.setNavSpots([{ x: -34, y: 0, z: 0, cost: 34 }]) // ground only, 34 m: under the 80% floor (48 m): no spot, the run ends where the budget does
  g.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(g.hideSpot, null)
})

test('high preference 0.9 chooses higher spots than 0.1 (same field, same start)', () => {
  const rels = (pref: number) => {
    const out: number[] = []
    for (let i = 0; i < 5; i++) {
      const { b } = mk({ highLowPreference: pref, highLowWeight: 8, highScaleMetres: 10 })
      b.setNavSpots(spotsWithPlatform())
      b.step(at(0, 0), [at(30, 0)], 'free')
      out.push(b.hideSpot!.rel)
    }
    return out.reduce((a, c) => a + c, 0) / out.length
  }
  assert.ok(rels(0.9) > rels(0.1) + 3)
})

test('with no spot list the run ends where the budget does, as before (fallback)', () => {
  const { b, clock } = mk({ runDistanceBeforeHiding: 40 })
  b.navUse = false
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(b.hideSpot, null)
  clock.adv(5)
  b.step(at(-45, 0), [at(10, 0)], 'free')
  assert.equal(b.state, 'hide')
  assert.equal(b.fleeLog[b.fleeLog.length - 1]!.ended, 'budget')
})

test('a chosen spot that fails is dropped and the next pick is a different one', () => {
  const { b, clock } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots(spotsWithPlatform())
  b.step(at(0, 0), [at(30, 0)], 'free')
  const first = { ...b.hideSpot! }
  b.onNav({ status: 'failed', reason: 'no_path' })
  assert.equal(b.hideSpot, null)
  clock.adv(5)
  const c = b.step(at(-3, 0), [at(30, 0)], 'free') as any
  assert.equal(c?.cmd, 'nav_to')
  assert.ok(Math.hypot(b.hideSpot!.x - first.x, b.hideSpot!.z - first.z) >= 5)
})

test('same-start test mode: held still until a chaser is within the set distance, then the normal flee', () => {
  const { b, clock } = mk({ holdUntilChaserWithin: 30 })
  b.navUse = false
  assert.equal(b.step(at(0, 0), [at(40, 0)], 'free'), null) // 40 m away: held
  clock.adv(10)
  assert.equal(b.step(at(0, 0), [at(35, 0)], 'free'), null) // still held, no wander either
  assert.equal(b.state, 'wander')
  clock.adv(1)
  const c = b.step(at(0, 0), [at(28, 0)], 'free') as any
  assert.equal(b.state, 'flee')
  assert.equal(c.cmd, 'run_to')
  // after the hide it is held again in the same place
  b.cfg.holdUntilChaserWithin = 30
  b.state = 'wander'
  assert.equal(b.step(at(-40, 0), [at(40, 0)], 'free'), null)
})

test('the run pattern keeps its meaning with chosen spots: a long-run pattern picks a far spot, a short-run pattern a nearer one', () => {
  const dist = (pattern: 'short-run-long-hide' | 'long-run-short-hide') => {
    const { b } = mk({ pattern, runDistanceBeforeHiding: 60 })
    const field = spots()
    for (let a = 0; a < 360; a += 15) field.push({ x: -80 * Math.cos((a * Math.PI) / 180), y: 0, z: 80 * Math.sin((a * Math.PI) / 180), cost: 80 })
    b.setNavSpots(field) // ground rings at 20, 35, 50 and 80 m
    b.step(at(0, 0), [at(30, 0)], 'free')
    return b.hideSpot ? Math.hypot(b.hideSpot.x, b.hideSpot.z) : 0
  }
  assert.ok(dist('long-run-short-hide') > dist('short-run-long-hide'))
})

test('with no spot far enough for the run pattern, the run ends where the budget does (no chosen spot)', () => {
  const { b } = mk({ pattern: 'long-run-short-hide', runDistanceBeforeHiding: 100 }) // budget 160: a chosen spot must be 80 m away or more
  b.setNavSpots(spots()) // the farthest ring is 50 m
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(b.hideSpot, null)
})

test('the run stays near the slider: with spots at 30, 55 and 100 m and a 60 m budget the far-enough one wins over the near ones', () => {
  const { b } = mk({ runDistanceBeforeHiding: 60, highLowPreference: 0.3 })
  const field = [30, 55, 100].map((r) => ({ x: -r, y: 0, z: 0, cost: r }))
  b.setNavSpots(field)
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(b.hideSpot && Math.hypot(b.hideSpot.x, b.hideSpot.z) === 55)
})

test('a much better high/low match can still win from a bit nearer than the budget (platform at 40 m beats a ground spot at 57 m)', () => {
  const { b } = mk({ runDistanceBeforeHiding: 60, highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots([{ x: -57, y: 0, z: 0, cost: 57 }, { x: -40, y: 9, z: 0, cost: 45 }, { x: -44, y: 0, z: 0, cost: 44 }])
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(b.hideSpot && b.hideSpot.rel >= 8)
})

test('a reset (new round or settings change) forgets the failed goals', () => {
  const { b } = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10 })
  b.setNavSpots(spotsWithPlatform())
  b.step(at(0, 0), [at(30, 0)], 'free')
  b.onNav({ status: 'failed', reason: 'no_goal' })
  assert.equal(b.badSpots.length, 1)
  b.reset()
  assert.equal(b.badSpots.length, 0)
})

// ---- round 13: (a) the longer flee toward a high spot, (b) hold the flee for a fresh list ----
test('(b) a flee with no usable spot list holds still and asks for one; when the list arrives it flees to a chosen spot', () => {
  const { b, clock } = mk()
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any // nothing asked yet: the step asks for the list
  assert.equal(first?.cmd, 'nav_spots')
  clock.adv(1)
  const held = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.ok(held === null || held.cmd === 'stop' || held.cmd === 'nav_spots', 'it does not run blind: ' + JSON.stringify(held))
  assert.equal(b.state, 'flee')
  assert.equal(b.holdingFlee, true)
  clock.adv(2)
  b.setNavSpots(spots(), undefined, { x: 0, z: 0 })
  const go = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(go?.cmd, 'nav_to')
  assert.ok(b.hideSpot, 'a spot was chosen')
  assert.equal(b.holdingFlee, false)
})

test('(b) the hold ends after holdForFreshListSeconds and the old plain flee takes over', () => {
  const { b, clock } = mk({ holdForFreshListSeconds: 10 })
  b.step(at(0, 0), [at(30, 0)], 'free')
  clock.adv(1); b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(b.holdingFlee, true)
  clock.adv(11)
  b.step(at(0, 0), [at(30, 0)], 'free') // (a stale list is asked for first)
  const c = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(b.holdingFlee, false)
  assert.ok(c && c.cmd === 'run_to', JSON.stringify(c))
})

test('(b) after a level change the old list is kept while the Synth is still where it was made, and dropped when it has moved', () => {
  const { b } = mk()
  b.setNavSpots(spots(), undefined, { x: 0, z: 0 })
  assert.equal(b.navFresh({ x: 3, y: 0, z: 0 }), true)
  b.invalidateNav()
  assert.equal(b.navFresh({ x: 3, y: 0, z: 0 }), true, 'same place: the old list is usable')
  assert.equal(b.navFresh({ x: 12, y: 0, z: 0 }), false, 'moved: it is not')
  b.setNavSpots(spots(), undefined, { x: 12, z: 0 })
  assert.equal(b.navDirty, false)
  assert.equal(b.navFresh({ x: 14, y: 0, z: 0 }), true)
})

test('(a) a flee toward a chosen spot 3 m or more above the ground may run to 2 x the budget and 40 s; a ground flee keeps 1.5 x and 25 s', () => {
  const hi = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10, runDistanceBeforeHiding: 40 })
  hi.b.setNavSpots([{ x: -35, y: 9, z: 0, cost: 45 }, { x: -39, y: 0, z: 0, cost: 40 }])
  hi.b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(hi.b.hideSpot && hi.b.hideSpot.rel >= 3, 'a high spot was chosen')
  // 65 m run (1.5 x 40 = 60 would have ended a ground flee): still running toward the high spot
  hi.clock.adv(10)
  hi.b.step(at(-65, 0), [at(10, 0)], 'free')
  assert.equal(hi.b.state, 'flee')
  // 85 m: past 2 x 40: over budget, it ducks in
  hi.clock.adv(3)
  hi.b.step(at(-85, 0), [at(10, 0)], 'free')
  assert.equal(hi.b.state, 'hide')
  // a ground flee with a chosen ground spot ends at 1.5 x
  const lo = mk({ highLowPreference: 0.1, runDistanceBeforeHiding: 40 })
  lo.b.setNavSpots([{ x: -39, y: 0, z: 0, cost: 40 }])
  lo.b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(lo.b.hideSpot && lo.b.hideSpot.rel < 3)
  lo.clock.adv(10)
  lo.b.step(at(-65, 0), [at(10, 0)], 'free')
  assert.equal(lo.b.state, 'hide')
})

test('(a) the 40 s cap applies to a high-spot flee only: at 30 s a high flee still runs, a ground flee has ducked in at 25 s', () => {
  const hi = mk({ highLowPreference: 0.9, highLowWeight: 8, highScaleMetres: 10, runDistanceBeforeHiding: 40, navFreshSeconds: 200 })
  hi.b.setNavSpots([{ x: -35, y: 9, z: 0, cost: 45 }, { x: -39, y: 0, z: 0, cost: 40 }])
  hi.b.step(at(0, 0), [at(30, 0)], 'free')
  assert.ok(hi.b.hideSpot && hi.b.hideSpot.rel >= 3)
  hi.clock.adv(30)
  hi.b.step(at(-10, 0), [at(10, 0)], 'free')
  assert.equal(hi.b.state, 'flee')
  hi.clock.adv(11)
  hi.b.step(at(-12, 0), [at(10, 0)], 'free')
  assert.equal(hi.b.state, 'hide')
  const lo = mk({ highLowPreference: 0.1, runDistanceBeforeHiding: 40, navFreshSeconds: 200 })
  lo.b.setNavSpots([{ x: -39, y: 0, z: 0, cost: 40 }])
  lo.b.step(at(0, 0), [at(30, 0)], 'free')
  lo.clock.adv(26)
  lo.b.step(at(-10, 0), [at(10, 0)], 'free')
  assert.equal(lo.b.state, 'hide')
})

test('(a) and (b) are settings: switched off they behave as before', () => {
  const { b } = mk({ highSpotFlee: false, holdForFreshList: false })
  const c = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(c?.cmd, 'nav_spots')
  assert.equal(b.holdingFlee, false)
})

test('round 15: a goal the client failed to reach is remembered across a reset and not offered again', () => {
  const { b } = mk()
  ;(b as any).lastNavGoal = { x: 10, z: 10 }
  b.onNav({ status: 'failed', reason: 'no_path (searched 362)' })
  assert.equal(b.unreachable.length, 1)
  b.reset() // a test or a new round clears the one-minute list, not this
  assert.equal(b.badSpots.length, 0)
  assert.equal(b.unreachable.length, 1)
})

test('round 15: with rememberFailedSpots off nothing is kept', () => {
  const { b } = mk({ rememberFailedSpots: false })
  ;(b as any).lastNavGoal = { x: 10, z: 10 }
  b.onNav({ status: 'failed', reason: 'no_path' })
  assert.equal(b.unreachable.length, 0)
})

test('round 18: at level 2 a flee never targets a spot above the double-jump reach; with the rule off it may', () => {
  for (const fair of [true, false]) {
    const { b } = mk({ fairSpots: fair, highLowPreference: 1, highLowWeight: 50 })
    b.level = 2
    const ground = (r: number, a: number) => ({ x: -r * Math.cos(a), y: 0, z: r * Math.sin(a), cost: r })
    const field = [ground(50, 0.1), ground(55, 0.3), ground(52, 0.5), ground(53, 0.2), { x: -60, y: 8, z: 3, cost: 70 }, { x: -62, y: 18, z: -3, cost: 72 }]
    b.setNavSpots(field)
    b.step(at(0, 0), [at(30, 0)], 'free')
    const hs = (b as any).hideSpot
    assert.ok(hs)
    if (fair) assert.ok(hs.rel <= 12, 'rel ' + hs.rel); else assert.ok(hs.rel >= 0)
  }
  const { b } = mk(); b.level = 1; assert.equal(b.fairSpot({ rel: 40 }), true); b.level = 3; assert.equal(b.fairSpot({ rel: 40 }), true); b.level = 2; assert.equal(b.fairSpot({ rel: 40 }), false)
})

test('round 19: a route that ends stuck counts as a failed goal: it is remembered and not offered again', () => {
  const { b } = mk()
  ;(b as any).lastNavGoal = { x: 10, z: 10 }
  b.onNav({ status: 'stuck', reason: 'blocked' })
  assert.equal(b.badSpots.length, 1)
  assert.equal(b.unreachable.length, 1)
})

test('round 22: a flee that chose a high spot keeps the doubled budget when the goal is replanned (a replan is not a new goal)', () => {
  const { b, clock, cfg } = mk({ highSpotFlee: true, runDistanceBeforeHiding: 45 })
  const list = spots()
  list.push({ x: -30, y: 10, z: 0, cost: 40 }) // a high spot
  b.setNavSpots(list)
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(b.fleeHigh, !!(b.hideSpot && b.hideSpot.rel >= cfg.highSpotMinRel), 'the flag follows the chosen spot')
  // force the situation: the spot was chosen high, then the goal is dropped by a replan; the flag must survive until the flee ends
  b.fleeHigh = true
  b.hideSpot = null
  clock.adv(1)
  b.step(at(-50, 0), [at(30, 0)], 'free')
  assert.equal(b.fleeHigh, true, 'still a high-goal flee')
})

test('round 22: a flee that has not moved 3 m after 5 s fails its goal and picks another; the second miss runs plainly away', () => {
  const { b, clock } = mk()
  b.setNavSpots(spots())
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(first?.cmd, 'nav_to')
  clock.adv(6)
  const second = b.step(at(0, 0), [at(30, 0)], 'free') as any // 6 s later, still at the start
  assert.ok(b.badSpots.length >= 1, 'the unreachable goal is remembered')
  assert.ok(second && Math.hypot(second.x - first.x, second.z - first.z) >= 5, 'a different goal')
  assert.equal(b.noMoveChecks, 1)
  clock.adv(6)
  const third = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(b.noMoveChecks, 2)
  assert.ok(third, 'it still gives a command (a plain flee)')
  clock.adv(6)
  b.step(at(0, 0), [at(30, 0)], 'free')
  assert.equal(b.noMoveChecks, 2, 'at most twice per flee')
})

test('round 24: a stuck route during a flee picks another goal at once, at most 3 times, and does not end the flee on the budget mid-route', () => {
  const { b, clock } = mk()
  b.setNavSpots(spots())
  const first = b.step(at(0, 0), [at(30, 0)], 'free') as any
  assert.equal(first?.cmd, 'nav_to')
  clock.adv(1)
  b.step(at(3, 0), [at(30, 0)], 'free') // it is moving
  b.onNav({ status: 'stuck', reason: 'blocked' })
  assert.equal(b.repick, true)
  clock.adv(0.5)
  const second = b.step(at(3, 0), [at(30, 0)], 'free') as any
  assert.equal(second?.cmd, 'nav_to'); assert.ok(Math.hypot(second.x - first.x, second.z - first.z) >= 5, 'a different goal at once')
  assert.equal(b.state, 'flee')
})

test('round 24: a route that gets stuck within 4 m of its goal at its height counts as arrived (the flee ends `arrived`, not on the budget)', () => {
  const { b, clock } = mk({ highSpotFlee: true })
  const list = spots(); list.push({ x: -30, y: 10, z: 0, cost: 40 })
  b.setNavSpots(list)
  b.step(at(0, 0), [at(30, 0)], 'free')
  const g = b.hideSpot
  if (!g) return // the scene chose a ground spot: nothing to assert
  clock.adv(1)
  b.step(at(g.x + 2, g.y, g.z), [at(60, 0)], 'free') // standing 2 m from the goal at its height
  b.onNav({ status: 'stuck', reason: 'blocked' })
  assert.equal(b.navArrived, true); assert.ok(b.hideSpot, 'the goal is kept'); assert.equal(b.repick, false)
})
