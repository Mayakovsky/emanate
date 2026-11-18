import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { CONFIG } from '../src/config.ts'

function mk(mode: 'solo' | 'coop' | 'multiplayer' = 'solo', extra: Partial<typeof CONFIG> = {}, seed = 7) {
  let t = 1_000_000
  const clock = { now: () => t, adv: (s: number) => (t += s * 1000) }
  let sd = seed
  const rng = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  const m = new Match({ now: clock.now, rng, cfg: { ...CONFIG, choiceDialogue: true, ...extra } })
  m.setMode(mode)
  return { m, clock }
}
const at = (x: number, z: number) => ({ x, y: 0, z })
const join = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(1000, 1000) })
const near = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(m.synth.x + 1, m.synth.z) })
const away = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(5000, 5000) })

// ================= item 1: the choice dialogue =================
test('dialogue: every new player starts at the pitch; the snapshot shows the step but never the side', () => {
  const { m } = mk()
  join(m, 'a')
  const s = m.snapshot('a') as any
  assert.equal(s.you.dialog, 'pitch')
  assert.equal('side' in s.you, false)
})

test("'I'll Help' makes the player a Helper at once", () => {
  const { m } = mk()
  join(m, 'a')
  assert.equal(m.choose('a', 'help'), 'done')
  assert.equal(m.players.get('a')!.side, 'helpers')
  assert.equal((m.snapshot('a') as any).you.dialog, 'done')
})

test("'I'm Having Doubts' goes to the Dev Team message; the two identical buttons map to opposite sides, secretly", () => {
  const { m } = mk()
  join(m, 'a'); join(m, 'b')
  assert.equal(m.choose('a', 'doubts'), 'doubts')
  assert.equal(m.choose('b', 'doubts'), 'doubts')
  assert.equal(m.choose('a', 'A'), 'done')
  assert.equal(m.choose('b', 'B'), 'done')
  const sa = m.players.get('a')!.side, sb = m.players.get('b')!.side
  assert.ok(sa === 'hunters' || sa === 'helpers')
  // A and B are opposite for each player, whatever the secret mapping: the side tells A from B only to the server
  const { m: m2 } = mk('solo', {}, 7)
  join(m2, 'x'); m2.choose('x', 'doubts'); m2.choose('x', 'A')
  const { m: m3 } = mk('solo', {}, 7)
  join(m3, 'x'); m3.choose('x', 'doubts'); m3.choose('x', 'B')
  assert.notEqual(m2.players.get('x')!.side, m3.players.get('x')!.side)
  assert.ok(sb)
})

test('the secret mapping varies between players (not always A = hunters)', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 12; seed++) {
    const { m } = mk('solo', {}, seed)
    for (let w = 0; w < 3; w++) m['d'].rng()
    join(m, 'p'); m.choose('p', 'doubts'); m.choose('p', 'A')
    seen.add(m.players.get('p')!.side)
  }
  assert.equal(seen.size, 2)
})

test('choices out of order are ignored (a side button before the pitch is answered does nothing)', () => {
  const { m } = mk()
  join(m, 'a')
  assert.equal(m.choose('a', 'A'), 'pitch')
  assert.equal((m.snapshot('a') as any).you.dialog, 'pitch')
})

test('coop: the majority\'s choice sets the group\'s side, for everyone', () => {
  const { m } = mk('coop')
  for (const id of ['a', 'b', 'c']) join(m, id)
  m.choose('a', 'help'); m.choose('b', 'help')
  assert.equal(m.choicesFinal, false) // c has not chosen yet
  m.choose('c', 'doubts'); m.choose('c', 'A')
  assert.equal(m.choicesFinal, true)
  for (const id of ['a', 'b', 'c']) assert.equal(m.players.get(id)!.side, 'helpers') // 2 of 3 chose Helper
})

test('multiplayer: teams are auto-balanced and anyone moved off their choice is told they were recruited as a double agent', () => {
  const { m } = mk('multiplayer')
  for (const id of ['a', 'b', 'c', 'd']) join(m, id)
  for (const id of ['a', 'b', 'c', 'd']) m.choose(id, 'help') // all four choose Helper
  const sides = [...m.players.values()].map((p) => p.side)
  assert.equal(sides.filter((s) => s === 'helpers').length, 2)
  assert.equal(sides.filter((s) => s === 'hunters').length, 2)
  const told = [...m.players.values()].filter((p) => p.queue.some((e) => e.ev === 'double-agent'))
  assert.equal(told.length, 2)
  assert.ok(told.every((p) => p.side === 'hunters'))
})

// ================= item 2: the round timer =================
test('timer: a shortened round clock, the 5-minute warning only once, then a glimpse of the hiding spot before the Synth is moved and the round resets', () => {
  const { m, clock } = mk('solo', { roundSeconds: 60, warnSecondsLeft: 20, timeoutGlimpseSeconds: 5 })
  join(m, 'a')
  m.setSynth(at(500, 700))
  clock.adv(39); join(m, 'a')
  assert.equal(m.players.get('a')!.queue.filter((e) => e.ev === 'warn5').length, 0)
  clock.adv(2); join(m, 'a')
  assert.equal(m.players.get('a')!.queue.filter((e) => e.ev === 'warn5').length, 1)
  clock.adv(19); join(m, 'a') // 60 s: timeout
  const q = m.players.get('a')!.queue
  const ev = q.find((e) => e.ev === 'round-timeout') as any
  assert.ok(ev, 'a round-timeout event')
  assert.deepEqual([ev.x, ev.z, ev.glimpseSeconds], [500, 700, 5]) // where it is hiding, and how long the glimpse lasts
  assert.deepEqual([m.synth.x, m.synth.z], [500, 700]) // not moved yet
  clock.adv(3); join(m, 'a')
  assert.deepEqual([m.synth.x, m.synth.z], [500, 700]) // still hidden during the glimpse
  clock.adv(2.5); join(m, 'a')
  assert.ok(Math.hypot(m.synth.x - 500, m.synth.z - 700) <= 100 + 1e-6, 'moved within 100 m of its LAST spot')
  assert.ok(m.timeLeft() > 55) // the round restarted
  assert.equal(m.round, 1)
})

test('no contact or charge happens during the timeout glimpse', () => {
  const { m, clock } = mk('solo', { roundSeconds: 30, warnSecondsLeft: 10, timeoutGlimpseSeconds: 6 })
  join(m, 'a'); m.setSynth(at(0, 0))
  clock.adv(31); join(m, 'a')
  near(m, 'a')
  assert.equal(m.round, 1)
  assert.equal(m.charge.stage, 'free')
})

// ================= item 3: the replay menu =================
function hit(m: Match, clock: { adv: (s: number) => number }) {
  away(m, 'a'); m.setSynth(at(0, 0)); clock.adv(1); near(m, 'a')
}
function playFull(m: Match, clock: { adv: (s: number) => number }) {
  for (let r = 0; r < 3; r++) {
    hit(m, clock); clock.adv(1)
  }
}
test('replay menu: only available once the match has ended', () => {
  const { m } = mk('solo', { choiceDialogue: false })
  join(m, 'a')
  assert.equal(m.replay('again'), false)
})

test('replay: play again from the start resets the rounds; every completed round counts; three trigger the final cinematic', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a')
  playFull(m, clock)
  assert.equal(m.state, 'ended')
  assert.equal(m.replayCount, 0) // the first full playthrough does not count
  assert.equal(m.replay('again'), true)
  assert.equal(m.round, 1)
  assert.equal(m.state, 'playing')
  hit(m, clock)
  assert.equal(m.replayCount, 1)
  hit(m, clock)
  assert.equal(m.replayCount, 2)
  hit(m, clock)
  assert.equal(m.replayCount, 3)
  assert.equal(m.state, 'final')
  assert.ok(m.players.get('a')!.queue.some((e) => e.ev === 'final-cinematic'))
})

test('replay: a single Power Round returns to the menu, and any combination of rounds counts toward three', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a')
  playFull(m, clock)
  for (const round of [2, 3, 1]) {
    assert.equal(m.state, 'ended')
    assert.equal(m.replay('round', round), true)
    assert.equal(m.round, round)
    hit(m, clock)
  }
  assert.equal(m.replayCount, 3)
  assert.equal(m.state, 'final')
})

test('after the final cinematic the match does not accept another replay, and the cinematic fires once', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a')
  playFull(m, clock)
  for (const round of [1, 1, 1]) { m.replay('round', round); hit(m, clock) }
  assert.equal(m.replay('again'), false)
  assert.equal(m.players.get('a')!.queue.filter((e) => e.ev === 'final-cinematic').length, 1)
})

test('the replay-count threshold is a setting (UNCONFIRMED): 1 triggers it on the first replayed round', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false, finalCinematicAfterReplays: 1 })
  join(m, 'a')
  playFull(m, clock)
  m.replay('round', 2); hit(m, clock)
  assert.equal(m.state, 'final')
})

// ================= item 5: state after an unload =================
test('reload: a player who drops and returns gets plumes left, a running boost and the round back (and is told)', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a')
  m.plume('a', at(1, 1)); m.plume('a', at(1, 1))
  m.players.get('a')!.boostUntil = clock.now() + 60_000
  clock.adv(11) // the halo is unloaded: nothing heard for 11 s
  m.advance()
  assert.equal(m.players.has('a'), false)
  clock.adv(20)
  const p = join(m, 'a')
  assert.equal(p.plumesLeft, 1)
  assert.ok(p.boostUntil > clock.now()) // the running boost comes back
  const s = m.snapshot('a') as any
  assert.equal(s.you.plumesLeft, 1)
  assert.ok(s.events.some((e: any) => e.ev === 'restored'))
})

test('reload: the saved state expires after the ledger time', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false, ledgerSeconds: 30 })
  join(m, 'a'); m.plume('a', at(1, 1))
  clock.adv(11); m.advance()
  clock.adv(60)
  assert.equal(join(m, 'a').plumesLeft, 3)
})

test('reload in a later round: the plumes refill (the round changed) but the side and the player are kept', () => {
  const { m, clock } = mk('solo', { choiceDialogue: false })
  join(m, 'a'); m.plume('a', at(1, 1))
  clock.adv(11); m.advance()
  m.setSynth(at(0, 0)) // someone else completes round 1 is not possible solo with no players; advance the round directly
  m.round = 2
  clock.adv(5)
  assert.equal(join(m, 'a').plumesLeft, 3)
})

test('a returning player is not shown the choice dialogue again', () => {
  const { m, clock } = mk('solo')
  join(m, 'a'); m.choose('a', 'help')
  clock.adv(11); m.advance()
  join(m, 'a')
  assert.equal((m.snapshot('a') as any).you.dialog, 'done')
})

test('coop: players who arrive after the first chooser are still counted in the majority', () => {
  const { m } = mk('coop')
  join(m, 'a'); m.choose('a', 'help')            // alone: all present have chosen
  join(m, 'b'); join(m, 'c')
  m.choose('b', 'doubts'); m.choose('b', 'A'); m.choose('c', 'help')
  const sides = new Set([...m.players.values()].map((p) => p.side))
  assert.equal(sides.size, 1) // one group side for everyone, by the majority of real choices
})

// ================= round 9 item 1: multiplayer edge cases =================
const nearSynth = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(m.synth.x + 1, m.synth.z) })
const farAway = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(5000, 5000) })
// time passes in 5 s steps; only the listed players keep reporting (the others go silent and are dropped after the 10 s timeout)
function pass(m: Match, clock: { adv: (s: number) => number }, seconds: number, keep: string[], where: (id: string) => any = () => at(5000, 5000)) {
  for (let t = 0; t < seconds; t += 5) { clock.adv(Math.min(5, seconds - t)); for (const id of keep) m.upsertPlayer(id, { pos: where(id) }) }
}

test('edge: a contributor leaves mid-charge: the charge keeps the others, and the group needs one fewer', () => {
  const { m, clock } = mk('coop', { choiceDialogue: false, chargeWindowSeconds: 60 })
  for (const id of ['a', 'b', 'c']) farAway(m, id)
  m.setSynth(at(0, 0))
  nearSynth(m, 'a'); clock.adv(1); nearSynth(m, 'b')
  assert.equal(m.charge.stage, 'repair') // two of the three needed contributed (hunters: Repair)
  assert.equal(m.round, 1)
  // b leaves (silent past the timeout) while a and c stay on the map
  pass(m, clock, 12, ['a', 'c'])
  assert.equal(m.players.has('b'), false)
  assert.equal(m.charge.contributors.has('b'), false)
  assert.equal(m.round, 1) // still round 1: contributors {a} vs 2 needed
  nearSynth(m, 'c') // c contacts: {a, c} reaches the shrunken need of 2
  assert.equal(m.round, 2)
})

test('edge: the one player who had not contributed leaves: the charge completes at once (no dead charge)', () => {
  const { m, clock } = mk('coop', { choiceDialogue: false, chargeWindowSeconds: 60 })
  for (const id of ['a', 'b', 'c']) farAway(m, id)
  m.setSynth(at(0, 0))
  nearSynth(m, 'a'); clock.adv(1); nearSynth(m, 'b')
  pass(m, clock, 12, ['a', 'b']) // c stops reporting: it leaves
  assert.equal(m.round, 2) // {a, b} now meet the need of 2 of 2
})

test('edge: everyone leaves mid-charge: nothing completes and the charge is not left half-open for the next player', () => {
  const { m, clock } = mk('coop', { choiceDialogue: false, chargeWindowSeconds: 5 })
  farAway(m, 'a'); farAway(m, 'b'); farAway(m, 'c')
  m.setSynth(at(0, 0)); nearSynth(m, 'a'); clock.adv(1); nearSynth(m, 'b')
  clock.adv(30); m.advance()
  assert.equal(m.players.size, 0)
  assert.equal(m.round, 1)
  farAway(m, 'z')
  assert.equal(m.charge.stage, 'free')
})

function endgameMatch(mode: 'coop' | 'multiplayer', ids: string[]) {
  const { m, clock } = mk(mode, { choiceDialogue: false })
  for (const id of ids) m.upsertPlayer(id, { pos: at(5000, 5000), side: 'helpers' })
  ;(m as any).finish('helpers')
  return { m, clock }
}
const atEnd = (m: Match, id: string) => m.upsertPlayer(id, { pos: at(m.endgame!.x + 2, m.endgame!.z) })
test('endgame arrival: a majority of the side present resolves it at once', () => {
  const { m, clock } = endgameMatch('coop', ['a', 'b', 'c'])
  atEnd(m, 'a'); clock.adv(1); atEnd(m, 'b')
  assert.equal(m.endgame!.resolved, true)
})
test('endgame arrival: one of three present resolves only 30 s after the first arrival (everyone present then)', () => {
  const { m, clock } = endgameMatch('coop', ['a', 'b', 'c'])
  atEnd(m, 'a')
  pass(m, clock, 20, ['a', 'b', 'c'], (id) => (id === 'a' ? at(m.endgame!.x + 2, m.endgame!.z) : at(5000, 5000)))
  assert.equal(m.endgame!.resolved, false)
  pass(m, clock, 11, ['a', 'b', 'c'], (id) => (id === 'a' ? at(m.endgame!.x + 2, m.endgame!.z) : at(5000, 5000)))
  assert.equal(m.endgame!.resolved, true)
})
test('endgame arrival: nobody present never resolves', () => {
  const { m, clock } = endgameMatch('coop', ['a', 'b'])
  pass(m, clock, 120, ['a', 'b'])
  assert.equal(m.endgame!.resolved, false)
})
test('endgame arrival (multiplayer): only the winning side counts, the other side standing there does not', () => {
  const { m, clock } = mk('multiplayer', { choiceDialogue: false })
  m.upsertPlayer('h1', { pos: at(5000, 5000), side: 'helpers' }); m.upsertPlayer('h2', { pos: at(5000, 5000), side: 'helpers' })
  m.upsertPlayer('u1', { pos: at(5000, 5000), side: 'hunters' }); m.upsertPlayer('u2', { pos: at(5000, 5000), side: 'hunters' })
  ;(m as any).finish('helpers')
  atEnd(m, 'u1'); atEnd(m, 'u2'); clock.adv(1); atEnd(m, 'u1')
  assert.equal(m.endgame!.resolved, false)
  atEnd(m, 'h1'); clock.adv(1); atEnd(m, 'h2')
  assert.equal(m.endgame!.resolved, true)
})
test('endgame arrival: a present player leaving the match counts the rest correctly (majority of whoever remains)', () => {
  const { m, clock } = endgameMatch('coop', ['a', 'b', 'c'])
  atEnd(m, 'a')
  pass(m, clock, 12, ['a'], () => at(m.endgame!.x + 2, m.endgame!.z)) // b and c silent: they leave
  assert.equal(m.players.size, 1)
  assert.equal(m.endgame!.resolved, true) // 1 of 1 present is a majority
})
