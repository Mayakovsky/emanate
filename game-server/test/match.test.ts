import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { CONFIG } from '../src/config.ts'
import { ParcelSet, warnDistance, nearestEmptyParcel } from '../src/geo.ts'

function mk(mode: 'solo' | 'coop' | 'multiplayer' = 'solo', extra: Partial<typeof CONFIG> = {}) {
  let t = 1_000_000
  const clock = { now: () => t, adv: (s: number) => (t += s * 1000) }
  let seed = 7
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const m = new Match({ now: clock.now, rng, cfg: { ...CONFIG, ...extra } })
  m.setMode(mode)
  return { m, clock }
}
const at = (x: number, z: number, y = 0) => ({ x, y, z })
// keep players alive and place the synth far away so nothing triggers by accident
function join(m: Match, id: string, side: 'hunters' | 'helpers' = 'hunters', pos = at(1000, 1000)) {
  return m.upsertPlayer(id, { side, pos })
}
function near(m: Match, id: string) {
  const p = m.players.get(id)!
  m.upsertPlayer(id, { pos: { x: m.synth.x + 1, y: m.synth.y, z: m.synth.z } })
  return p
}
function away(m: Match, id: string) {
  m.upsertPlayer(id, { pos: at(5000, 5000) })
}

test('solo: the Synth starts 100 m from the player', () => {
  const { m } = mk()
  join(m, 'a', 'hunters', at(10, 20))
  const d = Math.hypot(m.synth.x - 10, m.synth.z - 20)
  assert.ok(Math.abs(d - 100) < 1e-6)
})

test('round clock: 20 minutes, a 5-minute warning once, timeout teleports within 100 m and restarts', () => {
  const { m, clock } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  clock.adv(14 * 60 + 59)
  join(m, 'a')
  assert.equal(m.warnSent, false)
  clock.adv(2)
  join(m, 'a')
  assert.equal(m.warnSent, true)
  assert.equal(m.players.get('a')!.queue.filter((e) => e.ev === 'warn5').length, 1)
  clock.adv(5 * 60 - 3)
  join(m, 'a')
  assert.equal(m.warnSent, true) // still within the round
  const before = { ...m.synth }
  clock.adv(5)
  join(m, 'a')
  assert.ok(m.timeoutAt > 0) // timeout: a glimpse of the hiding spot first
  clock.adv(8.2)
  join(m, 'a')
  assert.equal(m.round, 1) // timeout resets the round, it does not advance it
  assert.ok(m.timeLeft() > 1195)
  assert.equal(m.warnSent, false)
  assert.ok(Math.hypot(m.synth.x - before.x, m.synth.z - before.z) <= 100 + 1e-6)
})

test('solo: contact within 5 m completes the round; round 3 ends the game', () => {
  const { m, clock } = mk()
  join(m, 'a')
  for (let r = 1; r <= 3; r++) {
    m.setSynth(at(0, 0))
    away(m, 'a')
    clock.adv(1)
    near(m, 'a')
    if (r < 3) assert.equal(m.round, r + 1)
  }
  assert.equal(m.state, 'ended')
  assert.ok(m.endgame)
})

test('5 m is the radius: 5.1 m does not charge', () => {
  const { m } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  m.upsertPlayer('a', { pos: at(5.1, 0) })
  assert.equal(m.charge.stage, 'free')
  m.upsertPlayer('a', { pos: at(4.9, 0) })
  assert.equal(m.round, 2)
})

test('coop with 3: Reset -> Repair -> complete, each within 10 s', () => {
  const { m, clock } = mk('coop')
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.setSynth(at(0, 0))
  near(m, 'a')
  assert.equal(m.charge.stage, 'reset')
  clock.adv(9)
  near(m, 'b')
  assert.equal(m.charge.stage, 'repair')
  for (const id of ['a', 'b', 'c']) m.upsertPlayer(id, { pos: id === 'c' ? at(5000, 5000) : at(0, 0) })
  clock.adv(9)
  near(m, 'c')
  assert.equal(m.round, 2)
  assert.equal(m.charge.stage, 'free')
})

test('coop: the same player cannot be two contributors', () => {
  const { m, clock } = mk('coop')
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.setSynth(at(0, 0))
  near(m, 'a')
  away(m, 'a')
  clock.adv(2)
  near(m, 'a')
  assert.equal(m.charge.stage, 'reset')
  assert.equal(m.charge.contributors.size, 1)
})

test('coop: missing the 10 s window teleports the Synth within 100 m and resets the charge (round clock keeps running)', () => {
  const { m, clock } = mk('coop')
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.setSynth(at(0, 0))
  near(m, 'a')
  const left = m.timeLeft()
  clock.adv(5)
  for (const id of ['a', 'b', 'c']) join(m, id)
  clock.adv(5.5)
  for (const id of ['a', 'b', 'c']) join(m, id)
  assert.equal(m.charge.stage, 'free')
  assert.ok(Math.hypot(m.synth.x, m.synth.z) <= 100 + 1e-6)
  assert.ok(m.timeLeft() < left)
  assert.equal(m.players.get('a')!.queue.some((e) => e.ev === 'charge-failed'), true)
})

test('coop with 2 players needs min(3, 2) = 2 contributors', () => {
  const { m } = mk('coop')
  join(m, 'a')
  join(m, 'b')
  m.setSynth(at(0, 0))
  near(m, 'a')
  assert.equal(m.round, 1)
  near(m, 'b')
  assert.equal(m.round, 2)
})

test('multiplayer hunters: first contact Reset, second Repair, third completes; the Synth DROPS a level (floor 0)', () => {
  const { m, clock } = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(m, id, 'helpers')
  m.setSynth(at(0, 0))
  near(m, 'h1'); assert.equal(m.charge.stage, 'reset')
  clock.adv(1); near(m, 'h2'); assert.equal(m.charge.stage, 'repair')
  clock.adv(1); near(m, 'h3')
  assert.equal(m.round, 2)
  assert.equal(m.wins.hunters, 1)
  assert.equal(m.synthLevel, 0) // 1 -> 0 (normal speed)
})

test('multiplayer helpers: Reset, Upgrade, finish; the Synth gains a level', () => {
  const { m, clock } = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(m, id, 'helpers')
  m.setSynth(at(0, 0))
  near(m, 'p1'); assert.equal(m.charge.stage, 'reset')
  clock.adv(1); near(m, 'p2'); assert.equal(m.charge.stage, 'upgrade')
  clock.adv(1); near(m, 'p3')
  assert.equal(m.synthLevel, 2)
  assert.equal(m.wins.helpers, 1)
})

test('multiplayer break: opposing arrival during Reset breaks the Synth free (teleport 100 m, charge reset)', () => {
  const { m, clock } = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(m, id, 'helpers')
  m.setSynth(at(0, 0))
  near(m, 'h1')
  clock.adv(2)
  near(m, 'p1')
  assert.equal(m.charge.stage, 'free')
  assert.ok(Math.hypot(m.synth.x, m.synth.z) <= 100 + 1e-6)
  assert.equal(m.round, 1)
})

test('multiplayer break: opposing arrival during Repair sends it back to Reset; a second opposing arrival breaks it free', () => {
  const { m, clock } = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(m, id, 'helpers')
  m.setSynth(at(0, 0))
  near(m, 'h1'); clock.adv(1); near(m, 'h2')
  assert.equal(m.charge.stage, 'repair')
  clock.adv(1); near(m, 'p1')
  assert.equal(m.charge.stage, 'reset')
  assert.equal(m.charge.side, 'hunters')
  assert.equal(m.charge.contributors.size, 1)
  clock.adv(1); near(m, 'p2')
  assert.equal(m.charge.stage, 'free')
})

test('multiplayer: after a downgrade the hunters can still finish (window restarts)', () => {
  const { m, clock } = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(m, id, 'helpers')
  m.setSynth(at(0, 0))
  near(m, 'h1'); clock.adv(1); near(m, 'h2'); clock.adv(1); near(m, 'p1')
  assert.equal(m.charge.stage, 'reset')
  clock.adv(5); near(m, 'h3')
  assert.equal(m.charge.stage, 'repair') // h1 + h3
  away(m, 'h2')
})

function mpWin(m: Match, clock: { adv: (s: number) => number }, side: 'hunters' | 'helpers') {
  const ids = side === 'hunters' ? ['h1', 'h2', 'h3'] : ['p1', 'p2', 'p3']
  for (const id of ['h1', 'h2', 'h3', 'p1', 'p2', 'p3']) away(m, id) // everyone far away first, so moving the Synth does not trigger a contact
  m.setSynth(at(0, 0))
  clock.adv(1)
  for (const id of ids) { near(m, id); clock.adv(1) }
}
function mp() {
  const r = mk('multiplayer')
  for (const id of ['h1', 'h2', 'h3']) join(r.m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(r.m, id, 'helpers')
  return r
}

test('multiplayer: the first side to win three rounds wins; two wins are not enough', () => {
  const { m, clock } = mp()
  mpWin(m, clock, 'hunters'); mpWin(m, clock, 'hunters')
  assert.equal(m.wins.hunters, 2)
  assert.equal(m.state, 'playing')
  assert.equal(m.round, 3)
  mpWin(m, clock, 'hunters')
  assert.equal(m.wins.hunters, 3)
  assert.equal(m.state, 'ended')
  assert.equal(m.endgame!.kind, 'containment') // Hunters win: Containment
})

test('multiplayer: Helpers winning three plays the Escape ending; rounds can run to five', () => {
  const { m, clock } = mp()
  mpWin(m, clock, 'helpers'); mpWin(m, clock, 'hunters'); mpWin(m, clock, 'helpers'); mpWin(m, clock, 'hunters')
  assert.equal(m.round, 5) // 2-2 after four rounds: a fifth is played
  assert.equal(m.state, 'playing')
  assert.equal(m.snapshot('p1').match.skyRound, 3) // rounds 4 and 5 replay the round-three sky
  assert.equal(m.snapshot('p1').you!.tier, 3) // and keep the full Fly kit
  mpWin(m, clock, 'helpers')
  assert.equal(m.state, 'ended')
  assert.equal(m.endgame!.kind, 'escape')
})

test('multiplayer: a round that times out does not count and does not advance the round', () => {
  const { m, clock } = mp()
  m.setSynth(at(0, 0))
  for (const id of ['h1', 'h2', 'h3', 'p1', 'p2', 'p3']) away(m, id)
  clock.adv(20 * 60 + 1)
  for (const id of ['h1', 'h2', 'h3', 'p1', 'p2', 'p3']) away(m, id)
  clock.adv(9)
  for (const id of ['h1', 'h2', 'h3', 'p1', 'p2', 'p3']) away(m, id)
  assert.deepEqual(m.wins, { hunters: 0, helpers: 0 })
  assert.equal(m.round, 1)
})

test('coop stays three completed rounds', () => {
  const { m, clock } = mk('coop')
  for (const id of ['a', 'b', 'c']) join(m, id, 'hunters')
  for (let r = 0; r < 3; r++) {
    m.setSynth(at(0, 0))
    for (const id of ['a', 'b', 'c']) away(m, id)
    clock.adv(1)
    for (const id of ['a', 'b', 'c']) { near(m, id); clock.adv(1) }
  }
  assert.equal(m.state, 'ended')
})

test('multiplayer: auto-balance moves a player and tells them (double agent)', () => {
  const { m } = mk('multiplayer')
  for (const id of ['a', 'b', 'c', 'd']) join(m, id, 'hunters')
  join(m, 'e', 'helpers')
  m.balanceSides()
  const sides = [...m.players.values()].map((p) => p.side)
  assert.ok(Math.abs(sides.filter((s) => s === 'hunters').length - sides.filter((s) => s === 'helpers').length) <= 1)
  assert.ok([...m.players.values()].some((p) => p.queue.some((e) => e.ev === 'double-agent')))
})

test('coop side: the majority decides', () => {
  const { m } = mk('coop')
  assert.equal(m.coopSide(['hunters', 'helpers', 'helpers']), 'helpers')
  assert.equal(m.coopSide(['hunters', 'hunters', 'helpers']), 'hunters')
})

test('plumes: 3 per round, last 14 s, visible to everyone in the match, refill each round', () => {
  const { m, clock } = mk('coop')
  join(m, 'a'); join(m, 'b')
  assert.equal(m.plume('a', at(1, 2, 3)), true)
  assert.equal(m.plume('a', at(1, 2, 3)), true)
  assert.equal(m.plume('a', at(1, 2, 3)), true)
  assert.equal(m.plume('a', at(1, 2, 3)), false)
  assert.equal(m.snapshot('b').plumes.length, 3)
  clock.adv(13.9); join(m, 'a'); join(m, 'b')
  assert.equal(m.snapshot('b').plumes.length, 3)
  clock.adv(0.2); join(m, 'a'); join(m, 'b')
  assert.equal(m.snapshot('b').plumes.length, 0)
})

test('plumes refill when a new round starts', () => {
  const { m } = mk()
  join(m, 'a')
  m.plume('a', at(0, 0)); m.plume('a', at(0, 0))
  m.setSynth(at(0, 0)); near(m, 'a')
  assert.equal(m.round, 2)
  assert.equal(m.players.get('a')!.plumesLeft, 3)
})

test('upgrade drops: placed near the Synth, expire, picked up within 2 m', () => {
  const { m, clock } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  clock.adv(26); join(m, 'a')
  assert.equal(m.drops.length, 1)
  const d = m.drops[0]
  const dd = Math.hypot(d.pos.x, d.pos.z)
  assert.ok(dd >= 40 && dd <= 120)
  clock.adv(91); join(m, 'a')
  assert.ok(!m.drops.find((x) => x.id === d.id))
})

test('pickup: within 2 m takes it, 2.5 m does not; extra plume adds one, a boost applies at once', () => {
  const { m } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  const b = m.addDrop('boost', at(500, 500))
  const p = m.addDrop('plume', at(600, 600))
  m.upsertPlayer('a', { pos: at(502.5, 500) })
  assert.equal(m.drops.length, 2)
  m.upsertPlayer('a', { pos: at(501.9, 500) })
  assert.ok(m.players.get('a')!.boostUntil > 0)
  assert.equal(m.snapshot('a').you!.tier, 2) // the boost is active the moment it is picked up
  m.upsertPlayer('a', { pos: at(600, 600) })
  assert.equal(m.players.get('a')!.plumesLeft, 4)
  assert.ok(b && p)
})

test('Halo boost on pickup: the next power level for 30 s in rounds 1-2, then it ends; no held upgrades', () => {
  const { m, clock } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  m.addDrop('boost', at(500, 500))
  m.upsertPlayer('a', { pos: at(500, 500) })
  assert.equal(m.snapshot('a').you!.tier, 2) // round 1 + boost
  assert.equal(m.snapshot('a').you!.boostLeft > 29, true)
  clock.adv(31); join(m, 'a')
  assert.equal(m.snapshot('a').you!.tier, 1)
  assert.equal((m as any).useUpgrade, undefined) // the held-boost step and its key are gone
})

test('tier never exceeds 3 (boost in round 2 -> 3)', () => {
  const { m } = mk()
  join(m, 'a')
  m.round = 2
  m.setSynth(at(0, 0))
  m.addDrop('boost', at(500, 500))
  m.upsertPlayer('a', { pos: at(500, 500) })
  assert.equal(m.snapshot('a').you!.tier, 3)
  m.round = 3
  assert.equal(m.snapshot('a').you!.tier, 3)
})

test('players that stop reporting are dropped after the timeout', () => {
  const { m, clock } = mk('coop')
  join(m, 'a'); join(m, 'b')
  clock.adv(11)
  join(m, 'a')
  assert.equal(m.players.size, 1)
})

test('endgame: finds the nearest empty parcel; majority arrival resolves, else anyone after 30 s', () => {
  const { m, clock } = mk('coop')
  const empty = new ParcelSet([[10, 10]])
  ;(m as any).d.emptyParcelFinder = (x: number, z: number) => nearestEmptyParcel(empty, x, z)?.center ?? null
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.round = 3
  m.setSynth(at(0, 0))
  for (const id of ['a', 'b', 'c']) { near(m, id); clock.adv(1) }
  assert.equal(m.state, 'ended')
  assert.deepEqual([m.endgame!.x, m.endgame!.z], [168, 168])
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.upsertPlayer('a', { pos: at(168, 168) })
  assert.equal(m.endgame!.resolved, false) // 1 of 3 present
  clock.adv(31); join(m, 'b'); join(m, 'c'); m.upsertPlayer('a', { pos: at(168, 168) })
  assert.equal(m.endgame!.resolved, true) // someone present after 30 s
})

test('endgame: a majority present resolves at once', () => {
  const { m, clock } = mk('coop')
  m.setMode('coop')
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.round = 3
  m.setSynth(at(0, 0))
  for (const id of ['a', 'b', 'c']) { near(m, id); clock.adv(1) }
  const e = m.endgame!
  m.upsertPlayer('a', { pos: at(e.x, e.z) }); m.upsertPlayer('b', { pos: at(e.x, e.z) })
  assert.equal(e.resolved, true)
})

test('dead zone: nearest distance and direction are in the snapshot; warn distance = max(10 m, 2 s of travel)', () => {
  const dz = new ParcelSet([[10, 0]])
  const { m } = mk()
  ;(m as any).d.deadZones = dz
  join(m, 'a', 'hunters', at(100, 8)) // parcel 6; dead parcel starts x=160
  const s = m.snapshot('a')
  assert.ok(Math.abs(s.deadzone!.dist - 60) < 1e-6)
  assert.equal(warnDistance(5), 10)
  assert.equal(warnDistance(24.3), 48.6)
})

test('snapshot events are delivered once', () => {
  const { m } = mk()
  join(m, 'a')
  m.broadcast({ ev: 'x' })
  assert.equal(m.snapshot('a').events.length, 1)
  assert.equal(m.snapshot('a').events.length, 0)
})

test('after a teleport the stale feed position is ignored until the Synth catches up (or 3 s pass)', () => {
  const { m, clock } = mk()
  join(m, 'a')
  m.setSynth(at(0, 0))
  near(m, 'a') // round 1 complete -> Synth teleported within 100 m
  assert.equal(m.round, 2)
  const moved = { ...m.synth }
  m.feedSynth(at(0, 0)) // the real Synth has not moved yet: still reports the old spot
  assert.deepEqual(m.synth, moved)
  assert.equal(m.round, 2) // no instant second contact
  m.feedSynth({ x: moved.x + 1, y: 0, z: moved.z }) // caught up
  assert.equal(m.synth.x, moved.x + 1)
  m.teleportSynthWithin(100)
  const again = { ...m.synth }
  clock.adv(3.1)
  m.feedSynth(at(7, 7)) // held position expired: the feed wins again
  assert.deepEqual([m.synth.x, m.synth.z], [7, 7])
  assert.ok(again)
})

test('every teleport is queued for the real Synth', () => {
  const { m } = mk()
  join(m, 'a')
  const n0 = m.synthTeleports.length
  m.teleportSynthWithin(100)
  assert.equal(m.synthTeleports.length, n0 + 1)
})
