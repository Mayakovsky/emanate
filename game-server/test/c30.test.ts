// c30 (Directive V): the new game sequence on the server: PP1, blast, Glimpse Signal, round changes (Strike, Aurora), the ending (PP2, Storm) and the replay portals.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { CONFIG } from '../src/config.ts'
import { HaloControl } from '../src/halocontrol.ts'

function mk(extra: Partial<typeof CONFIG> = {}, rngSeed = 3) {
  let t = 1_000_000
  const clock = { now: () => t, adv: (s: number) => (t += s * 1000) }
  let seed = rngSeed
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const m = new Match({ now: clock.now, rng, cfg: { ...CONFIG, lobbyEnabled: true, lobbySeconds: 30, cinematics: true, cineFx: true, ...extra } })
  m.setSynth({ x: 100, y: 0, z: 100 })
  return { m, clock }
}
const at = (x: number, z: number) => ({ x, y: 0, z })
/** advance time in 1 s steps; every listed player keeps reporting from `pos` (so nobody times out), and the match is advanced */
function run(m: Match, clock: { adv: (s: number) => number }, seconds: number, pos: Record<string, { x: number; z: number }>) {
  for (let s = 0; s < seconds; s++) { clock.adv(1); for (const [id, p] of Object.entries(pos)) m.upsertPlayer(id, { pos: at(p.x, p.z) }); m.advance() }
}
const evs = (m: Match, id: string) => (m.players.get(id)?.queue ?? []).map((e) => e.ev)
const drain = (m: Match, id: string) => (m.players.get(id) ?? m.waiting.get(id))!.queue.splice(0)
/** a solo game started through the lobby: player 'a' inside the bubble; runs to the end of the PP1 phase and the blast */
function started(extra: Partial<typeof CONFIG> = {}, rngSeed = 3) {
  const { m, clock } = mk(extra, rngSeed)
  m.upsertPlayer('a', { pos: at(103, 100) })
  run(m, clock, 30, { a: { x: 103, z: 100 } })
  return { m, clock }
}

test('game start: the lobby bubble stays while PP1 stands in it; the blast, the Glimpse Signal at the NEW spot, the drops and round 1 follow', () => {
  const { m, clock } = started()
  assert.equal(m.state, 'playing')
  assert.ok(m.bubble, 'the bubble stays while PP1 stands')
  const q = drain(m, 'a')
  assert.ok(q.some((e) => e.ev === 'portal' && e.v === 1), 'PP1')
  assert.ok(!q.some((e) => e.ev === 'blast'), 'no blast yet')
  const old = { ...m.synth }
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  assert.equal(m.bubble, null)
  const q2 = drain(m, 'a'), names = q2.map((e) => e.ev)
  assert.ok(names.indexOf('blast') >= 0 && names.indexOf('glimpse-signal') > names.indexOf('blast') && names.indexOf('round-start') > names.indexOf('glimpse-signal'), names.join())
  const g = q2.find((e) => e.ev === 'glimpse-signal') as any
  assert.deepEqual([g.x, g.z], [m.synth.x, m.synth.z]) // the signal marks the NEW spot
  assert.notDeepEqual([g.x, g.z], [old.x, old.z])
  assert.equal(g.seconds, 7)
  assert.equal(m.drops.length, 6) // all of the round's drops exist from the start: 6 upgrades ...
  assert.equal(m.traps.length, 6) // ... and beside them 6 armed world traps (roundTraps 6, Forces 24 Nov)
})

test('the drops of a round never exceed maxDrops, and the timed spawning is off', () => {
  const { m, clock } = started({ maxDrops: 4, roundTraps: 0 })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  assert.equal(m.drops.length, 4)
  run(m, clock, 120, { a: { x: 103, z: 100 } })
  assert.ok(m.drops.length <= 4)
  assert.equal(m.dropsMade, 4)
})

test('c31: world traps sit BESIDE the upgrade drops: armed, no player’s, one use, a hit costs one level for exactly trapSeconds', () => {
  const { m, clock } = started({ maxDrops: 6, roundTraps: 6 })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  assert.equal(m.drops.length, 6)
  assert.equal(m.dropsMade, 6)
  const world = m.traps.filter((t) => t.owner === 'server')
  assert.equal(world.length, 6)
  assert.ok(world.every((t) => t.exempt.size === 0)) // armed for everyone
  run(m, clock, 200, { a: { x: 103, z: 100 } })
  assert.equal(m.traps.filter((t) => t.owner === 'server').length, 6) // still there long after a placed trap would have expired
  assert.ok(m.placeTrap('a', { x: 103, y: 0, z: 100 })) // the player can still place one of their own
  const t = m.traps.find((x) => x.owner === 'server')!
  const before = m.tierOf(m.players.get('a')!, clock.now())
  m.upsertPlayer('a', { pos: { ...t.pos } }); m.advance()
  const hitAt = clock.now()
  assert.ok(!m.traps.some((x) => x.id === t.id)) // used up
  assert.equal(m.players.get('a')!.trapUntil - hitAt, CONFIG.trapSeconds * 1000) // exactly trapSeconds
  assert.equal(CONFIG.trapSeconds, 10); assert.equal(CONFIG.trapDelta, -1); assert.equal(CONFIG.trapRadius, 5)
  assert.equal(m.tierOf(m.players.get('a')!, hitAt), Math.max(0, before - 1))
  assert.equal(m.tierOf(m.players.get('a')!, hitAt + 10001), before) // back after 10 s
})

test('c31: world traps are spread: never near the Synth’s start, the lobby bubble, an upgrade drop or each other', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { m, clock } = started({ maxDrops: 6, roundTraps: 6 }, seed)
    run(m, clock, 5, { a: { x: 103, z: 100 } })
    const world = m.traps.filter((t) => t.owner === 'server'), R = CONFIG.trapRadius, [lo, hi] = CONFIG.dropSpawnMinMax
    assert.equal(world.length, 6, 'seed ' + seed)
    for (const t of world) {
      const ds = Math.hypot(t.pos.x - m.synth.x, t.pos.z - m.synth.z)
      assert.ok(ds >= lo - 0.01 && ds <= hi + 0.01 && ds > R + 10, 'on the ring, off the start: ' + ds)
      for (const d of m.drops) assert.ok(Math.hypot(t.pos.x - d.pos.x, t.pos.z - d.pos.z) >= 2 * R + 2, 'off the drops')
      for (const u of world) if (u !== t) assert.ok(Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) >= 2 * R + 2, 'apart')
      if (m.bubble) assert.ok(Math.hypot(t.pos.x - m.bubble.x, t.pos.z - m.bubble.z) >= m.bubble.radius + R + 2, 'off the bubble')
    }
  }
})

test('c31: world traps are removed when the ending starts (none on PP2 or the replay portals) and at a lobby; a player’s own trap is not touched by the placing', () => {
  const { m, clock } = started({ maxDrops: 6, roundTraps: 6 })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  assert.equal(m.traps.filter((t) => t.owner === 'server').length, 6)
  ;(m as any).finish('hunters')
  assert.equal(m.state, 'ending')
  assert.equal(m.traps.filter((t) => t.owner === 'server').length, 0)
  const { m: m2, clock: c2 } = started({ maxDrops: 6, roundTraps: 6 })
  run(m2, c2, 5, { a: { x: 103, z: 100 } })
  m2.startLobby()
  assert.equal(m2.traps.filter((t) => t.owner === 'server').length, 0)
})

test('c31: roundTraps is clamped to 0..12 and never takes an upgrade drop’s place; junk gives none', () => {
  for (const [rt, traps] of [[20, 12], [-2, 0], [Number.NaN, 0], [0, 0]] as [number, number][]) {
    const { m, clock } = started({ maxDrops: 6, roundTraps: rt })
    run(m, clock, 5, { a: { x: 103, z: 100 } })
    assert.equal(m.drops.length, 6); assert.ok(m.traps.filter((t) => t.owner === 'server').length <= traps)
    if (traps === 0) assert.equal(m.traps.length, 0)
  }
})

function complete(m: Match, clock: { adv: (s: number) => number }) { // the solo player runs into the Synth
  m.upsertPlayer('a', { pos: { ...m.synth } }); m.advance()
}

test('round 1 complete: PP1 where the Synth is, then the Strike, then the blast; the Glimpse Signal marks the new start of round 2', () => {
  const { m, clock } = started()
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  drain(m, 'a')
  const old = { ...m.synth }
  complete(m, clock)
  let q = drain(m, 'a'), names = q.map((e) => e.ev)
  assert.ok(names.includes('round-complete'))
  const pp = q.find((e) => e.ev === 'portal') as any
  assert.ok(pp && pp.v === 1 && pp.x === old.x && pp.z === old.z)
  run(m, clock, 4, { a: { x: old.x, z: old.z } })
  q = drain(m, 'a'); names = q.map((e) => e.ev)
  assert.ok(names.includes('strike') && !names.includes('blast'), names.join()) // the Strike first
  assert.equal(m.round, 1)
  run(m, clock, 3, { a: { x: old.x, z: old.z } })
  q = drain(m, 'a'); names = q.map((e) => e.ev)
  assert.ok(names.indexOf('blast') >= 0 && names.indexOf('glimpse-signal') > names.indexOf('blast'), names.join())
  assert.equal(m.round, 2)
  const g = q.find((e) => e.ev === 'glimpse-signal') as any
  assert.deepEqual([g.x, g.z], [m.synth.x, m.synth.z])
  assert.equal(g.seconds, 7)
  assert.equal(m.drops.length, 6)
})

test('round 2 complete: the Aurora plays at the same moment as the blast; round 3 glimpse lasts 4 s', () => {
  const { m, clock } = started()
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  complete(m, clock); run(m, clock, 8, { a: { x: m.synth.x, z: m.synth.z } }) // round 1 -> 2
  assert.equal(m.round, 2)
  drain(m, 'a')
  complete(m, clock)
  drain(m, 'a')
  run(m, clock, 5, { a: { x: m.synth.x, z: m.synth.z } })
  const q = drain(m, 'a'), names = q.map((e) => e.ev)
  assert.ok(names.includes('aurora') && names.includes('blast'), names.join())
  assert.ok(!names.includes('strike'))
  assert.equal(m.round, 3)
  assert.equal((q.find((e) => e.ev === 'glimpse-signal') as any).seconds, 4)
})

/** play a solo game to its end and return at the moment the ending starts */
function toEnding() {
  const { m, clock } = started()
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  for (let r = 1; r <= 2; r++) { complete(m, clock); run(m, clock, 8, { a: { x: m.synth.x, z: m.synth.z } }) }
  assert.equal(m.round, 3)
  drain(m, 'a')
  complete(m, clock)
  return { m, clock }
}

test('the ending: PP2 in the winner colour, the Storm, then two replay portals side by side for the countdown (no level choice, no marked spot)', () => {
  const { m, clock } = toEnding()
  assert.equal(m.state, 'ending')
  assert.equal(m.endgame, null)
  const sx = m.synth.x, sz = m.synth.z
  let q = drain(m, 'a')
  const pp = q.find((e) => e.ev === 'portal') as any
  assert.ok(pp && pp.v === 2 && (pp.side === 'hunters' || pp.side === 'helpers'))
  run(m, clock, 4, { a: { x: 500, z: 500 } })
  q = drain(m, 'a')
  assert.ok(q.some((e) => e.ev === 'storm' && e.seconds === 16))
  run(m, clock, 16, { a: { x: 500, z: 500 } })
  assert.equal(m.state, 'ending') // c30d: replayOpenDelay (4 s) after the Storm
  run(m, clock, 4, { a: { x: 500, z: 500 } })
  assert.equal(m.state, 'replay')
  const pub = m.replayPublic()!
  assert.ok(pub && pub.left > 0 && pub.left <= 10)
  assert.equal(pub.hunters.z, pub.helpers.z)
  assert.equal(pub.helpers.x - pub.hunters.x, 12) // 6 m either side of the middle
  assert.ok(Math.abs((pub.hunters.x + pub.helpers.x) / 2 - sx) < 1e-6 && pub.hunters.z === sz)
})

function atReplay() {
  const { m, clock } = toEnding()
  run(m, clock, 4 + 16 + 4, { a: { x: 9000, z: 9000 } }) // the player stands far away while the Storm plays
  return { m, clock, pub: m.replayPublic()! }
}

test('replay: a player walking into a portal picks that faction; at the end the game blasts and starts round 1 again (solo with one player in range)', () => {
  const { m, clock, pub } = atReplay()
  const there = { x: pub.helpers.x, z: pub.helpers.z }
  run(m, clock, 5, { a: there })
  assert.equal(m.players.get('a')!.side, 'helpers')
  drain(m, 'a')
  run(m, clock, 6, { a: there })
  assert.equal(m.state, 'playing')
  assert.equal(m.round, 1)
  assert.equal(m.mode, 'solo')
  assert.deepEqual(m.wins, { hunters: 0, helpers: 0 })
  const names = drain(m, 'a').map((e) => e.ev)
  assert.ok(names.indexOf('blast') >= 0 && names.indexOf('glimpse-signal') > names.indexOf('blast') && names.includes('round-start'), names.join())
  assert.equal(m.drops.length, 6)
  assert.equal(m.replayPublic(), null)
})

test('replay: nobody in range at the end closes the portals and goes back to waiting for a lobby', () => {
  const { m, clock } = atReplay()
  run(m, clock, 11, { a: { x: 9000, z: 9000 } })
  assert.equal(m.state, 'lobby')
  assert.equal(m.replayPublic(), null)
  assert.ok(m.bubble && m.bubble.x === m.synth.x) // a fresh lobby around the Synth, which is back at the portals' middle
  assert.ok(!m.insideBubble((m.players.get('a') ?? m.waiting.get('a'))!)) // the far player is not inside it
})

function crowd(n: number, sides: ('hunters' | 'helpers')[]) {
  const { m, clock } = toEnding()
  const ids = Array.from({ length: n }, (_, i) => 'p' + i)
  const far: Record<string, { x: number; z: number }> = { a: { x: 9000, z: 9000 } }
  for (const id of ids) { m.upsertPlayer(id, { pos: at(9000, 9000) }); far[id] = { x: 9000, z: 9000 } } // joined waiting (they tick in during the ending)
  run(m, clock, 4 + 16 + 4, far)
  const pub = m.replayPublic()!
  const pos: Record<string, { x: number; z: number }> = { a: { x: 9000, z: 9000 } }
  ids.forEach((id, i) => { const s = sides[i]; pos[id] = s === 'hunters' ? { x: pub.hunters.x, z: pub.hunters.z } : s === 'helpers' ? { x: pub.helpers.x, z: pub.helpers.z } : { x: pub.hunters.x + 6, z: pub.hunters.z + 20 } })
  return { m, clock, pos, ids }
}

test('replay: six players, three in each portal: multiplayer', () => {
  const { m, clock, pos } = crowd(6, ['hunters', 'hunters', 'hunters', 'helpers', 'helpers', 'helpers'])
  run(m, clock, 11, pos)
  assert.equal(m.mode, 'multiplayer')
  assert.equal(m.state, 'playing')
  assert.equal(m.players.size, 6)
})

test('replay: not enough for multiplayer (five, or six but 4 against 2) falls back to coop; fewer than three falls back to solo', () => {
  let r = crowd(5, ['hunters', 'hunters', 'hunters', 'helpers', 'helpers'])
  run(r.m, r.clock, 11, r.pos); assert.equal(r.m.mode, 'coop')
  r = crowd(6, ['hunters', 'hunters', 'hunters', 'hunters', 'helpers', 'helpers'])
  run(r.m, r.clock, 11, r.pos); assert.equal(r.m.mode, 'coop')
  r = crowd(2, ['hunters', 'helpers'])
  run(r.m, r.clock, 11, r.pos); assert.equal(r.m.mode, 'solo')
})

test('replay: in the last 2 seconds the server sorts whoever picked no portal, to balance the teams', () => {
  const { m, clock, pos } = crowd(6, ['hunters', 'hunters', 'hunters', undefined as any, undefined as any, undefined as any])
  run(m, clock, 7, pos)
  assert.ok(m.state === 'replay')
  run(m, clock, 4, pos)
  const sides = [...m.players.values()].map((p) => p.side)
  assert.equal(m.mode, 'multiplayer')
  assert.equal(sides.filter((s) => s === 'hunters').length, 3)
  assert.equal(sides.filter((s) => s === 'helpers').length, 3)
})

test('replayMin overrides the mode rules; a player who never joined does not count until they tick in', () => {
  const { m, clock, pos } = crowd(3, ['hunters', 'helpers', 'helpers'])
  m.cfg.replayMin = 5 // five needed for any mode: three in range is not enough for coop, so solo
  run(m, clock, 11, pos)
  assert.equal(m.mode, 'solo')
})

// ---- c30b (Directive W): the cinematic effects are off by default ----
test('c30b: cineFx off (the default): round 1 -> PP1, the Synth goes in, then straight to the blast and the Glimpse; no Strike', () => {
  const { m, clock } = started({ cineFx: false })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  drain(m, 'a')
  const old = { ...m.synth }
  complete(m, clock)
  run(m, clock, 4, { a: { x: old.x, z: old.z } })
  const names = drain(m, 'a').map((e) => e.ev)
  assert.ok(!names.includes('strike') && !names.includes('aurora'), names.join())
  assert.ok(names.indexOf('blast') >= 0 && names.indexOf('glimpse-signal') > names.indexOf('blast'), names.join())
  assert.equal(m.round, 2)
})

test('c30b: cineFx off: round 2 -> no Aurora; the ending -> PP2 then the replay portals with no Storm', () => {
  const { m, clock } = started({ cineFx: false })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  for (let r = 1; r <= 2; r++) { complete(m, clock); run(m, clock, 8, { a: { x: m.synth.x, z: m.synth.z } }) }
  assert.equal(m.round, 3)
  drain(m, 'a')
  complete(m, clock)
  assert.equal(m.state, 'ending')
  run(m, clock, 5, { a: { x: 500, z: 500 } })
  const names = drain(m, 'a').map((e) => e.ev)
  assert.ok(!names.includes('storm') && !names.includes('aurora'), names.join())
  assert.equal(m.state, 'ending') // c30d: PP2 (4 s) + replayOpenDelay (4 s): not open at 5 s
  run(m, clock, 4, { a: { x: 500, z: 500 } })
  assert.equal(m.state, 'replay') // after PP2 and the 4 s delay, no 16 s Storm
})

test('c30d: replayOpenDelay: PP2 stands until the replay portals open; 0 gives the old timing', () => {
  for (const [delay, openAt] of [[2, 6], [0, 4]] as const) {
    const { m, clock } = started({ cineFx: false, replayOpenDelay: delay })
    run(m, clock, 5, { a: { x: 103, z: 100 } })
    for (let r = 1; r <= 2; r++) { complete(m, clock); run(m, clock, 8, { a: { x: m.synth.x, z: m.synth.z } }) }
    drain(m, 'a')
    complete(m, clock)
    const pp = drain(m, 'a').find((e) => e.ev === 'portal') as any
    assert.equal(pp.seconds, 4 + delay + 1, 'PP2 lasts until the replay portals open')
    run(m, clock, openAt - 1, { a: { x: 500, z: 500 } })
    assert.equal(m.state, 'ending')
    run(m, clock, 1, { a: { x: 500, z: 500 } })
    assert.equal(m.state, 'replay', 'open at ' + openAt + ' s')
  }
})

test('c30b: the shipped default is cineFx off', () => { assert.equal(CONFIG.cineFx, false) })

test('Directive Y: a round change places the next start near the PP1 spot, even after the Rift parked the Synth 850 m away', () => {
  const { m, clock } = started({ cineFx: false })
  run(m, clock, 5, { a: { x: 103, z: 100 } })
  const spot = { ...m.synth }
  m.feedSynth({ ...spot }) // the real Synth has caught up with its placement (the 3 s hold ends)
  complete(m, clock)
  clock.adv(1); m.feedSynth({ x: spot.x + 600, y: 0, z: spot.z + 600 }) // the Rift's last step: the real Synth is parked out of sight and the bridge reports it
  run(m, clock, 4, { a: { x: spot.x, z: spot.z } })
  assert.equal(m.round, 2)
  const d = Math.hypot(m.synth.x - spot.x, m.synth.z - spot.z)
  assert.ok(d <= CONFIG.teleportOnFailRadius + 1, `the round 2 start is ${d.toFixed(0)} m from the PP1 spot`)
})

test('Directive Z fix: the first join in the lobby does not move the Synth (the bubble stands on it), even before the bridge has reported it', () => {
  const { m, clock } = mk()
  m.synthSeenAt = 0 // the server has not heard the real Synth yet (a fresh reset)
  assert.equal(m.state, 'lobby')
  m.upsertPlayer('a', { pos: at(103, 100) })
  assert.deepEqual([m.synth.x, m.synth.z], [100, 100], 'the Synth stays where the bubble is')
  run(m, clock, 30, { a: { x: 103, z: 100 } })
  assert.equal(m.state, 'playing', 'the lobby ends normally with the player inside')
})

test('c31c fix: the bare halo state carries the settings with sv, so a Halo that polled it before joining still gets the overrides', () => {
  const h = new HaloControl()
  assert.deepEqual(h.publicState(1), { idle: false, sv: 0, settings: {} })
  h.set({ text: { cueRound: 'Press 4 for a signal flare.' } })
  const b = h.publicState(1) as any
  assert.equal(b.sv, 1); assert.equal(b.settings.text.cueRound, 'Press 4 for a signal flare.')
  assert.ok(!('players' in b) && !('you' in b))
})
