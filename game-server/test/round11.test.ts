import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { CONFIG } from '../src/config.ts'

function mk(mode: 'solo' | 'coop' | 'multiplayer', extra: Partial<typeof CONFIG> = {}) {
  let t = 1_000_000
  const clock = { now: () => t, adv: (s: number) => (t += s * 1000) }
  let seed = 11
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const m = new Match({ now: clock.now, rng, cfg: { ...CONFIG, ...extra } })
  m.setMode(mode)
  return { m, clock }
}
const at = (x: number, z: number, y = 0) => ({ x, y, z })
const join = (m: Match, id: string, side: 'hunters' | 'helpers', pos = at(1000, 1000)) => m.upsertPlayer(id, { side, pos })
const away = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(5000, 5000) })
const near = (m: Match, id: string) => m.upsertPlayer(id, { pos: { x: m.synth.x + 1, y: m.synth.y, z: m.synth.z } })
function charge(m: Match, clock: { adv: (s: number) => number }, ids: string[], everyone: string[]) {
  for (const id of everyone) away(m, id)
  m.setSynth(at(0, 0))
  clock.adv(1)
  for (const id of ids) { near(m, id); clock.adv(1) }
}

// ---- Addendum 1: the Synth's level rules ----
test('the Synth starts at level 1 (Speed)', () => {
  assert.equal(mk('solo').m.synthLevel, 1)
  assert.equal(mk('solo', { synthStartLevel: 2 }).m.synthLevel, 2)
})
for (const side of ['helpers', 'hunters'] as const) {
  test(`solo ${side}: a completed Charge raises the Synth one level`, () => {
    const { m, clock } = mk('solo')
    join(m, 'a', side)
    charge(m, clock, ['a'], ['a'])
    assert.equal(m.synthLevel, 2)
    assert.equal(m.round, 2)
  })
  test(`coop ${side}: three contacts complete the Charge and the Synth gains a level`, () => {
    const { m, clock } = mk('coop')
    for (const id of ['a', 'b', 'c']) join(m, id, side)
    charge(m, clock, ['a', 'b', 'c'], ['a', 'b', 'c'])
    assert.equal(m.synthLevel, 2)
    assert.equal(m.wins[side], 1)
  })
}
test('the Synth never goes above level 3', () => {
  const { m, clock } = mk('solo', { synthStartLevel: 3 })
  join(m, 'a', 'helpers')
  charge(m, clock, ['a'], ['a'])
  assert.equal(m.synthLevel, 3)
})
function mp(extra: Partial<typeof CONFIG> = {}) {
  const r = mk('multiplayer', extra)
  for (const id of ['h1', 'h2', 'h3']) join(r.m, id, 'hunters')
  for (const id of ['p1', 'p2', 'p3']) join(r.m, id, 'helpers')
  return r
}
const ALL = ['h1', 'h2', 'h3', 'p1', 'p2', 'p3']
test('multiplayer: a Helper win raises the Synth a level', () => {
  const { m, clock } = mp()
  charge(m, clock, ['p1', 'p2', 'p3'], ALL)
  assert.equal(m.synthLevel, 2)
})
test('multiplayer: a Hunter win drops the Synth a level, floor 0, and a Helper Charge brings it back up', () => {
  const { m, clock } = mp()
  charge(m, clock, ['h1', 'h2', 'h3'], ALL)
  assert.equal(m.synthLevel, 0) // 1 -> 0, normal speed
  charge(m, clock, ['h1', 'h2', 'h3'], ALL)
  assert.equal(m.synthLevel, 0) // stays at the floor
  assert.equal(m.synthLevelNow(), 0)
  charge(m, clock, ['p1', 'p2', 'p3'], ALL)
  assert.equal(m.synthLevel, 1) // recovers after a Helper Charge
})
test('the level deltas are settings (Forces can flip them)', () => {
  const { m, clock } = mp({ multiHunterChargeDelta: 0 })
  charge(m, clock, ['h1', 'h2', 'h3'], ALL)
  assert.equal(m.synthLevel, 1)
})
test('replay from the start resets the Synth to its start level', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a', 'helpers')
  for (let i = 0; i < 3; i++) charge(m, clock, ['a'], ['a'])
  assert.equal(m.state, 'ended')
  m.replay('again')
  assert.equal(m.synthLevel, 1)
})

// ---- the freeze after a completed Charge ----
test('v3 Solo: a completed Charge freezes the Synth for a moment, then teleports it and starts the next round', () => {
  const { m, clock } = mk('solo', { completeFreezeSeconds: 5 })
  join(m, 'a', 'helpers')
  charge(m, clock, ['a'], ['a'])
  assert.equal(m.round, 1) // still the same round: the Synth is frozen
  assert.equal(m.synthStage(), 'upgrade') // the brain freezes it (as in Upgrade Mode)
  assert.equal(m.synthLevel, 2) // the level is already counted
  const tp0 = m.synthTeleports.length
  clock.adv(1); away(m, 'a')
  assert.equal(m.round, 1)
  clock.adv(4); away(m, 'a')
  assert.equal(m.round, 2)
  assert.ok(m.synthTeleports.length > tp0)
  assert.equal(m.synthStage(), 'free')
})
test('no contact counts while the Synth is frozen after a Charge', () => {
  const { m, clock } = mk('coop', { completeFreezeSeconds: 2 })
  for (const id of ['a', 'b', 'c']) join(m, id, 'helpers')
  charge(m, clock, ['a', 'b', 'c'], ['a', 'b', 'c'])
  assert.equal(m.charge.stage, 'free')
  away(m, 'a'); near(m, 'a')
  assert.equal(m.charge.stage, 'free')
})

// ---- the Discharge Trap ----
test('trap: placed where the player stands, one at a time per player, drawn for everyone', () => {
  const { m } = mk('coop')
  join(m, 'a', 'hunters'); join(m, 'b', 'helpers')
  m.setSynth(at(0, 0))
  assert.equal(m.placeTrap('a', at(1000, 1000)), true)
  assert.equal(m.placeTrap('a', at(1010, 1000)), false) // only one at a time
  assert.equal(m.placeTrap('b', at(1010, 1000)), true)
  const s = m.snapshot('b') as any
  assert.equal(s.traps.length, 2) // everyone sees every trap
  assert.equal(s.traps.filter((t: any) => t.mine).length, 1)
})
test('trap: the Synth within 5 m drops a level for 10 s, then recovers; the trap is used up', () => {
  const { m, clock } = mk('solo', { synthStartLevel: 2 })
  join(m, 'a', 'hunters')
  m.setSynth(at(0, 0))
  m.placeTrap('a', at(300, 300))
  m.setSynth(at(303, 300))
  assert.equal(m.synthLevelNow(), 1)
  assert.equal(m.traps.length, 0)
  assert.equal(m.synthLevel, 2) // its own level is untouched
  clock.adv(9); m.advance()
  assert.equal(m.synthLevelNow(), 1)
  clock.adv(2); m.advance()
  assert.equal(m.synthLevelNow(), 2)
})
test('trap: a Synth at level 0 stays at 0 (min 0)', () => {
  const { m } = mk('solo', { synthStartLevel: 0 })
  join(m, 'a', 'hunters')
  m.placeTrap('a', at(300, 300))
  m.setSynth(at(302, 300))
  assert.equal(m.synthLevelNow(), 0)
})
test('trap: any player in range drops a level for 10 s, the placer and teammates too, everyone in range at once', () => {
  const { m, clock } = mk('multiplayer')
  join(m, 'h1', 'hunters', at(0, 0)); join(m, 'h2', 'hunters', at(1000, 1000)); join(m, 'p1', 'helpers', at(2000, 2000)); join(m, 'p2', 'helpers', at(3000, 3000))
  m.setSynth(at(-500, -500))
  m.placeTrap('h1', at(0, 0))
  const s = (id: string) => m.snapshot(id).you!
  assert.equal(s('h1').tier, 1) // the placer stands on it: it does not go off until they step out and come back
  m.upsertPlayer('h1', { pos: at(30, 0) }) // the placer steps out
  // the placer, a teammate (h2) and an opponent (p1) all end up in range before the next check; p2 stays away
  m.players.get('h1')!.pos = at(1, 1); m.players.get('h2')!.pos = at(2, 0); m.players.get('p1')!.pos = at(0, 3)
  m.advance()
  assert.equal(s('h1').tier, 0) // round 1 tier 1, one down: 0 (normal)
  assert.equal(s('h2').tier, 0)
  assert.equal(s('p1').tier, 0)
  assert.equal(s('p2').tier, 1) // not in range
  assert.equal(m.traps.length, 0)
  clock.adv(5); for (const id of ['h1', 'h2', 'p1', 'p2']) m.upsertPlayer(id, { pos: at(900 + id.length, 900) })
  assert.equal(s('h1').tier, 0)
  clock.adv(6); for (const id of ['h1', 'h2', 'p1', 'p2']) m.upsertPlayer(id, { pos: at(900 + id.length, 900) })
  assert.equal(s('h1').tier, 1) // 10 s are over
})
test('trap: a player standing in range when it is placed (the placer) is exempt until they step out once', () => {
  const { m } = mk('coop')
  join(m, 'a', 'hunters', at(10, 10))
  m.setSynth(at(-500, -500))
  m.placeTrap('a', at(10, 10))
  m.upsertPlayer('a', { pos: at(12, 10) })
  assert.equal(m.traps.length, 1)
  m.upsertPlayer('a', { pos: at(40, 10) }) // steps out
  m.upsertPlayer('a', { pos: at(12, 10) }) // and back
  assert.equal(m.traps.length, 0)
})
test('trap: a hit lowers a boosted player one level (min 0), and a trap not triggered expires on its own', () => {
  const { m, clock } = mk('solo', { trapLifeSeconds: 30 })
  join(m, 'a', 'hunters')
  m.setSynth(at(0, 0))
  m.placeTrap('a', at(500, 500))
  clock.adv(31); join(m, 'a', 'hunters')
  assert.equal(m.traps.length, 0)
  assert.equal(m.placeTrap('a', at(500, 500)), true) // free to place another
})
test('trap: a new round clears traps and trap effects', () => {
  const { m, clock } = mk('solo')
  join(m, 'a', 'hunters')
  m.placeTrap('a', at(500, 500))
  charge(m, clock, ['a'], ['a'])
  assert.equal(m.traps.length, 0)
})
test('trap hit tells every halo (an event with the position and who was hit)', () => {
  const { m } = mk('coop')
  join(m, 'a', 'hunters'); join(m, 'b', 'hunters')
  m.setSynth(at(-500, -500))
  m.placeTrap('a', at(0, 0))
  m.upsertPlayer('a', { pos: at(1, 1) })
  const ev = (m.snapshot('b') as any).events.find((e: any) => e.ev === 'trap-hit')
  assert.ok(ev && ev.players.includes('a') && ev.synth === false)
})
