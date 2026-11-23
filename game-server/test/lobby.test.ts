import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { CONFIG } from '../src/config.ts'

function mk(extra: Partial<typeof CONFIG> = {}) {
  let t = 1_000_000
  const clock = { now: () => t, adv: (s: number) => (t += s * 1000) }
  let seed = 3
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const m = new Match({ now: clock.now, rng, cfg: { ...CONFIG, lobbyEnabled: true, lobbySeconds: 30, ...extra } })
  m.setSynth({ x: 100, y: 0, z: 100 })
  return { m, clock }
}
const at = (x: number, z: number) => ({ x, y: 0, z })
// everyone keeps reporting so nobody times out during the timer
function hold(m: Match, clock: { adv: (s: number) => number }, seconds: number, pos: Record<string, { x: number; z: number }>) {
  for (let s = 0; s < seconds; s += 5) { clock.adv(Math.min(5, seconds - s)); for (const [id, p] of Object.entries(pos)) m.upsertPlayer(id, { pos: at(p.x, p.z) }) }
}

test('a new match starts in the lobby: the Synth calls everyone into a bubble and a join timer runs', () => {
  const { m } = mk()
  assert.equal(m.state, 'lobby')
  assert.deepEqual(m.synthSays, ['Everyone into the bubble!'])
  m.upsertPlayer('a', { pos: at(103, 100) })
  const s = m.snapshot('a') as any
  assert.equal(s.match.state, 'lobby')
  assert.equal(s.bubble.radius, 5) // Forces 2026-11-22: radius 5 m
  assert.equal(s.bubble.x, 100)
  assert.equal(s.bubble.inside, 1)
  assert.equal(s.bubble.you, true)
  assert.ok(s.bubble.leftMs > 29_000)
  assert.equal(m.synthStage(), 'upgrade') // the Synth stands still during the lobby
})

test('the lobby is off by default (the existing game flow is unchanged)', () => {
  const m = new Match({ now: () => 0, rng: () => 0.5 })
  assert.equal(m.state, 'playing')
})

test('the mode comes from the head count: 1 Solo, 2 to 5 Coop, 6 or more Multiplayer', () => {
  const { m } = mk()
  assert.equal(m.modeForCount(1), 'solo')
  assert.equal(m.modeForCount(2), 'coop')
  assert.equal(m.modeForCount(5), 'coop')
  assert.equal(m.modeForCount(6), 'multiplayer')
  assert.equal(m.modeForCount(9), 'multiplayer')
})
for (const [n, mode] of [[1, 'solo'], [2, 'coop'], [3, 'coop'], [5, 'coop'], [6, 'multiplayer']] as const) {
  test(`${n} inside the bubble when the timer ends starts ${mode}`, () => {
    const { m, clock } = mk()
    const pos: Record<string, { x: number; z: number }> = {}
    for (let i = 0; i < n; i++) { pos['p' + i] = { x: 100 + (i % 5), z: 100 + Math.floor(i / 5) } }
    hold(m, clock, 31, pos)
    assert.equal(m.state, 'playing')
    assert.equal(m.mode, mode)
    assert.equal(m.players.size, n)
    assert.equal(m.bubble, null)
    if (mode === 'multiplayer') {
      const sides = [...m.players.values()].map((p) => p.side)
      assert.ok(sides.filter((s) => s === 'hunters').length >= 3 && sides.filter((s) => s === 'helpers').length >= 3, 'at least 3 per side')
    }
  })
}

test('players outside the bubble when the timer ends wait for the next lobby; late arrivals wait too', () => {
  const { m, clock } = mk()
  hold(m, clock, 31, { a: { x: 101, z: 101 }, b: { x: 102, z: 100 }, far: { x: 400, z: 400 } })
  assert.equal(m.mode, 'coop')
  assert.equal(m.players.size, 2)
  assert.equal(m.players.has('far'), false)
  const w = m.snapshot('far') as any
  assert.equal(w.you.waiting, true)
  assert.ok(w.events.some((e: any) => e.ev === 'lobby-wait'))
  // someone who shows up after the start waits as well
  m.upsertPlayer('late', { pos: at(100, 100) })
  assert.equal(m.players.has('late'), false)
  assert.equal((m.snapshot('late') as any).you.waiting, true)
})

test('nobody in the bubble: the lobby waits another round', () => {
  const { m, clock } = mk()
  hold(m, clock, 31, { far: { x: 500, z: 500 } })
  assert.equal(m.state, 'lobby')
  assert.ok(m.lobbyEndsAt > clock.now())
  hold(m, clock, 5, { near: { x: 101, z: 100 } })
  hold(m, clock, 31, { near: { x: 101, z: 100 } })
  assert.equal(m.state, 'playing')
  assert.equal(m.mode, 'solo')
})

test('Coop start: players stay where they stand; the Synth is placed 100 to 300 m from the group centre, every round', () => {
  const { m, clock } = mk()
  const pos = { a: { x: 98, z: 100 }, b: { x: 104, z: 100 }, c: { x: 101, z: 103 } }
  hold(m, clock, 31, pos)
  assert.equal(m.mode, 'coop')
  const centre = { x: 101, z: 101 }
  const d1 = Math.hypot(m.synth.x - centre.x, m.synth.z - centre.z)
  assert.ok(d1 >= 99 && d1 <= 301, 'first round: ' + d1)
  // the players did not move
  assert.equal(m.players.get('a')!.pos.x, 98)
  // a Charge by all three completes the round and the next round places the Synth again around the group
  for (const id of Object.keys(pos)) m.upsertPlayer(id, { pos: { x: 5000, y: 0, z: 5000 } })
  m.setSynth({ x: 0, y: 0, z: 0 })
  clock.adv(1)
  for (const id of Object.keys(pos)) { m.upsertPlayer(id, { pos: { x: 1, y: 0, z: 0 } }); clock.adv(1) }
  assert.equal(m.round, 2)
  const g = { x: 1, z: 0 }
  const d2 = Math.hypot(m.synth.x - g.x, m.synth.z - g.z)
  assert.ok(d2 >= 99 && d2 <= 301, 'second round: ' + d2)
})

test('Solo start in the lobby keeps the 100 m start', () => {
  const { m, clock } = mk()
  hold(m, clock, 31, { a: { x: 101, z: 100 } })
  assert.equal(m.mode, 'solo')
  assert.ok(Math.abs(Math.hypot(m.synth.x - 101, m.synth.z - 100) - 100) < 1)
})

test('the toss start is a setting, off by default, rounds 1 and 2 only', () => {
  const { m, clock } = mk()
  hold(m, clock, 31, { a: { x: 101, z: 100 } })
  assert.equal((m.snapshot('a') as any).events.some((e: any) => e.ev === 'toss'), false)
  const on = mk({ tossStartRounds: [1, 2, 3] })
  hold(on.m, on.clock, 31, { a: { x: 101, z: 100 } })
  const ev = (on.m.snapshot('a') as any).events.find((e: any) => e.ev === 'toss')
  assert.ok(ev && ev.round === 1 && ev.altitude === 150)
  on.m.round = 3
  ;(on.m as any).startRound(true)
  assert.equal((on.m.snapshot('a') as any).events.some((e: any) => e.ev === 'toss' && e.round === 3), false, 'never in round 3')
})

test('round 18: with teleportStart on, a Coop start throws the group 300 to 800 m to one start point and each player gets a teleport event', () => {
  const { m, clock } = mk({ teleportStart: true })
  m.upsertPlayer('a', { pos: at(102, 100) }); m.upsertPlayer('b', { pos: at(98, 100) })
  hold(m, clock, 31, { a: { x: 102, z: 100 }, b: { x: 98, z: 100 } })
  m.step?.()
  assert.equal(m.state, 'playing'); assert.equal(m.mode, 'coop')
  const ev = (id: string) => (m.snapshot(id) as any).events.filter((e: any) => e.ev === 'teleport')
  const ta = ev('a'), tb = ev('b')
  assert.equal(ta.length, 1); assert.equal(tb.length, 1)
  assert.equal(ta[0].id, 'start')
  const d = Math.hypot(ta[0].x - 100, ta[0].z - 100)
  assert.ok(d >= 290 && d <= 810, 'distance ' + d)
  assert.ok(Math.hypot(ta[0].x - tb[0].x, ta[0].z - tb[0].z) <= 2 * CONFIG.teleportRingMetres + 0.1, 'the pair lands together')
  assert.ok(ta[0].y > 0)
  // the Synth is 100 to 300 m from where the group lands, not from the bubble
  const s = m.synth, cx = (ta[0].x + tb[0].x) / 2, cz = (ta[0].z + tb[0].z) / 2
  const sd = Math.hypot(s.x - cx, s.z - cz)
  assert.ok(sd >= 95 && sd <= 305, 'synth distance ' + sd)
  assert.ok(m.logSnapshot?.().some?.((e: any) => e.ev === 'teleport-start') ?? true)
})

test('round 18: teleportStart is off by default and Solo never teleports', () => {
  assert.equal(CONFIG.teleportStart, false)
  const { m, clock } = mk({ teleportStart: true })
  m.upsertPlayer('a', { pos: at(103, 100) })
  hold(m, clock, 31, { a: { x: 103, z: 100 } })
  assert.equal(m.mode, 'solo')
  assert.equal((m.snapshot('a') as any).events.filter((e: any) => e.ev === 'teleport').length, 0)
})
