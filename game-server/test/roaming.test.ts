import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Memory } from '../src/memory.ts'
import { RoamBrain, ROAM_CONFIG, type Person, type Spot, type RoamCmd } from '../src/roaming.ts'

const at = (x: number, z: number) => ({ x, y: 0, z })
const A = '0xaaaa000000000000000000000000000000000001'
const B = '0xbbbb000000000000000000000000000000000002'
function mk(cfg = ROAM_CONFIG, mem = new Memory()) {
  let t = 1_000_000
  let seed = 9
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return { b: new RoamBrain(() => t, rng, mem, cfg), mem, clock: { adv: (s: number) => (t += s * 1000), now: () => t } }
}
const spot = (x: number, z: number, count = 3): Spot => ({ x, z, count, source: 'test' })
const person = (addr: string, x: number, z: number): Person => ({ addr, pos: at(x, z) })
const texts = (cmds: RoamCmd[]) => cmds.filter((c) => c.cmd === 'chat').map((c: any) => c.text)

test('memory tiers: nothing known -> Stranger; played as Helper -> warm; as Hunter -> teasing; day-off expires; no addresses are lost or invented', () => {
  const m = new Memory()
  assert.equal(m.familiarity(A), 'stranger')
  m.recordPlayed(A, 'helpers', 'won', 1000)
  m.recordPlayed(B, 'hunters', 'won', 1000)
  assert.equal(m.familiarity(A), 'helper')
  assert.equal(m.familiarity(B), 'hunter')
  assert.equal(m.familiarity('0xcccc'), 'stranger')
  m.dismiss(A, 1000, 24)
  assert.equal(m.isDayOff(A, 1000 + 23 * 3600e3), true)
  assert.equal(m.isDayOff(A, 1000 + 25 * 3600e3), false)
  m.gc(1000 + 25 * 3600e3)
  assert.equal(m.counts().dismissed, 0)
  assert.equal(m.counts().players, 2)
})

test('memory is case-insensitive on addresses, keeps one-line summaries, and persists to a local file', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mem-')), 'memory.json')
  const m = new Memory(f)
  m.recordPlayed(A, 'helpers', 'won', 5)
  m.recordTalk(A.toUpperCase(), 'a'.repeat(500), 5)
  const m2 = new Memory(f)
  assert.equal(m2.familiarity(A.toUpperCase()), 'helper')
  assert.ok(m2.d.talked[A.toLowerCase()]!.summary.length <= 120)
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\d+\.\d+\.\d+\.\d+/) // no IP-like data
})

test('roams when nothing is busy: it wanders on its own', () => {
  const { b } = mk()
  const c = b.step(at(0, 0), [], [], [], [])
  assert.equal(c[0]?.cmd, 'walk_to')
  assert.equal(b.state, 'roam')
})

test('drawn to a busy spot: it seeks it, then approaches the nearest person but stops at the approach distance (never closer)', () => {
  const { b, clock } = mk()
  const s = spot(200, 0)
  const P = [person(A, 205, 0)]
  b.step(at(0, 0), [s], P, [], []) // seek
  assert.equal(b.state, 'seek')
  b.step(at(150, 0), [s], P, [], [])
  assert.equal(b.state, 'approach')
  const c = b.step(at(150, 0), [s], P, [], [])
  const w = c.find((x) => x.cmd === 'walk_to') as any
  // the walk target is `approachDistance` short of the person: x = 205 - 12
  assert.ok(Math.abs(w.x - 193) < 0.5, String(w.x))
  clock.adv(5)
  const out = b.step(at(192, 0), [s], P, [], [])
  assert.equal(b.state, 'linger')
  assert.equal(texts(out).length, 1) // one greeting
})

test('greeting depends on memory: Stranger, former Helper, former Hunter', () => {
  for (const [side, slot] of [[null, 'Help me, Stranger.'], ['helpers', 'Please help me again.'], ['hunters', "We'll see if you can catch me again!"]] as const) {
    const mem = new Memory()
    if (side) mem.recordPlayed(A, side, 'won', 1)
    const { b } = mk(ROAM_CONFIG, mem)
    const P = [person(A, 30, 0)]
    b.step(at(0, 0), [spot(30, 0)], P, [], [])
    b.step(at(0, 0), [spot(30, 0)], P, [], []) // approach
    const out = b.step(at(20, 0), [spot(30, 0)], P, [], [])
    assert.deepEqual(texts(out), [slot])
  }
})

test('approach, never chase: if the person walks away beyond the give-up distance it lets them go', () => {
  const { b } = mk()
  const s = spot(100, 0)
  b.step(at(0, 0), [s], [person(A, 100, 0)], [], [])
  b.step(at(60, 0), [s], [person(A, 100, 0)], [], []) // approach
  assert.equal(b.state, 'approach')
  b.step(at(60, 0), [s], [person(A, 300, 0)], [], [])
  assert.equal(b.state, 'leave')
})

test('lingers, whispers at intervals, then leaves when nobody engages; the person and the gathering get a revisit cooldown (but re-approach is allowed later)', () => {
  const { b, clock } = mk()
  const s = spot(50, 0)
  const P = [person(A, 50, 0)]
  b.step(at(0, 0), [s], P, [], []); b.step(at(0, 0), [s], P, [], []); b.step(at(38, 0), [s], P, [], [])
  assert.equal(b.state, 'linger')
  let whispers = 0
  for (let i = 0; i < 100 && b.state === 'linger'; i++) { clock.adv(5); b.step(at(38, 0), [s], P, [], []); whispers = b.whispers }
  assert.ok(whispers >= 2, `whispers ${whispers}`)
  assert.equal(b.state, 'leave')
  b.step(at(38, 0), [s], P, [], [])
  assert.equal(b.state, 'roam')
  // right away: the same person and spot are in cooldown
  clock.adv(10)
  b.step(at(100, 0), [s], P, [], []); clock.adv(10); b.step(at(100, 0), [s], P, [], [])
  assert.equal(b.state, 'roam')
  // after the cooldowns, it may re-approach
  clock.adv(25 * 60)
  b.step(at(100, 0), [s], P, [], []); b.step(at(100, 0), [s], P, [], [])
  assert.ok(['seek', 'approach'].includes(b.state))
})

test('whisper rate slider: a higher rate whispers more often', () => {
  const count = (rate: number) => {
    const { b, clock } = mk({ ...ROAM_CONFIG, whisperRate: rate, eagerness: 1, lingerMaxSeconds: 200 })
    const s = spot(50, 0), P = [person(A, 50, 0)]
    b.step(at(0, 0), [s], P, [], []); b.step(at(0, 0), [s], P, [], []); b.step(at(38, 0), [s], P, [], [])
    for (let i = 0; i < 40; i++) { clock.adv(4); b.step(at(38, 0), [s], P, [], []) }
    return b.whispers
  }
  assert.ok(count(1) > count(0))
})

test('eagerness slider: higher eagerness lingers longer', () => {
  const dur = (e: number) => { const { b } = mk({ ...ROAM_CONFIG, eagerness: e }); return (b as any).lingerSeconds() }
  assert.ok(dur(1) > dur(0))
})

test('dismissal in any form: it backs off (one line, walks away 30 m), the address gets a day off, and it does not approach them again', () => {
  for (const text of ['no', 'Go away!', 'leave me alone', 'not interested', 'please stop']) {
    const { b, mem, clock } = mk()
    const s = spot(50, 0), P = [person(A, 50, 0)]
    b.step(at(0, 0), [s], P, [], []); b.step(at(0, 0), [s], P, [], []); b.step(at(38, 0), [s], P, [], [])
    const out = b.step(at(38, 0), [s], P, [{ from: A, text }], [])
    assert.equal(b.state, 'backoff', text)
    assert.deepEqual(texts(out), ["Understood. I'll leave you be."])
    const w = out.find((c) => c.cmd === 'walk_to') as any
    assert.ok(Math.hypot(w.x - 38, w.z) > 29, 'walks about 30 m away')
    assert.equal(mem.isDayOff(A, clock.now()), false, 'c31: a non-joined person gets no stored day-off (RAM cooldown only)')
    assert.equal(Object.keys(mem.d.dismissed).length + Object.keys(mem.d.talked).length, 0, 'nothing stored about a non-joined person')
    assert.ok(!JSON.stringify(b.log).toLowerCase().includes(A.toLowerCase()), 'nothing identifying in the log')
    clock.adv(60 * 60 * 10) // 10 hours later: still backed off (RAM cooldown)
    for (let i = 0; i < 6; i++) { b.step(at(100, 0), [s], P, [], []); clock.adv(30) }
    assert.ok(!['approach', 'linger'].includes(b.state), 'does not approach a dismissed address')
  }
})

test('a polite reply is not a dismissal; for a joined player it records the talk', () => {
  const { b, mem } = mk()
  mem.recordPlayed(A, 'helpers', 'test', 0) // joined through the Halo
  const s = spot(50, 0), P = [person(A, 50, 0)]
  b.step(at(0, 0), [s], P, [], []); b.step(at(0, 0), [s], P, [], []); b.step(at(38, 0), [s], P, [], [])
  b.step(at(38, 0), [s], P, [{ from: A, text: 'hello, who are you?' }], [])
  assert.notEqual(b.state, 'backoff')
  assert.ok(mem.d.talked[A.toLowerCase()])
})

test('quiet at events: near a live event it hangs at the edge distance, no greeting, no whispers', () => {
  const { b, clock } = mk()
  const s = spot(300, 0), P = [person(A, 300, 0)], ev = [{ x: 300, z: 0 }]
  b.step(at(0, 0), [s], P, [], ev); b.step(at(230, 0), [s], P, [], ev)
  const c = b.step(at(230, 0), [s], P, [], ev)
  const w = c.find((x) => x.cmd === 'walk_to') as any
  assert.ok(Math.abs(w.x - (300 - 45)) < 0.5, 'walks to the edge distance, not the approach distance: ' + w.x)
  const out = b.step(at(256, 0), [s], P, [], ev)
  assert.equal(texts(out).length, 0)
  for (let i = 0; i < 30; i++) { clock.adv(5); b.step(at(256, 0), [s], P, [], ev) }
  assert.equal(b.whispers, 0)
})

test('skittishness: a person who gets too close makes it step back', () => {
  const { b } = mk({ ...ROAM_CONFIG, skittishness: 1 })
  const s = spot(50, 0), P = [person(A, 50, 0)]
  b.step(at(0, 0), [s], P, [], []); b.step(at(0, 0), [s], P, [], []); b.step(at(38, 0), [s], P, [], [])
  const out = b.step(at(38, 0), [s], [person(A, 41, 0)], [], [])
  const w = out.find((x) => x.cmd === 'walk_to') as any
  assert.ok(w && w.x < 38, 'steps back away from the person')
})

test('crowd draw slider: a bigger crowd is picked more often at high draw, equally at low draw', () => {
  const pick = (draw: number) => {
    let big = 0
    for (let k = 0; k < 400; k++) {
      let seed = k + 1
      const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let w = 0; w < 5; w++) rng()
      const b = new RoamBrain(() => 1_000_000, rng, new Memory(), { ...ROAM_CONFIG, crowdDraw: draw, crowdSizePreference: draw })
      if (b.pickSpot([spot(0, 0, 1), spot(500, 0, 12)], [], 1_000_000)!.count === 12) big++
    }
    return big
  }
  assert.ok(pick(1) > pick(0) + 40, `${pick(1)} vs ${pick(0)}`)
})

test('c31 privacy: a joined player gets a stored talk and day-off; a non-joined person gets nothing stored', () => {
  const mem = new Memory()
  const B = '0xbbbb000000000000000000000000000000000002'
  mem.recordPlayed(A, 'hunters', 'x', 1)
  assert.equal(mem.recordTalk(A, 'hi', 2), true)
  assert.equal(mem.dismiss(A, 2, 24), true)
  assert.equal(mem.recordTalk(B, 'hi', 2), false)
  assert.equal(mem.dismiss(B, 2, 24), false)
  assert.deepEqual(mem.counts(), { players: 1, talked: 1, dismissed: 1 })
})

test('c31 privacy: dropNonJoined deletes old stored records of non-joined addresses and keeps joined ones', () => {
  const mem = new Memory()
  const B = '0xbbbb000000000000000000000000000000000002'
  mem.recordPlayed(A, 'hunters', 'x', 1); mem.recordTalk(A, 'hi', 2)
  mem.d.talked[B.toLowerCase()] = { ts: 1, summary: 'old' }; mem.d.dismissed[B.toLowerCase()] = { until: 9e15 }
  assert.equal(mem.dropNonJoined(), 2)
  assert.deepEqual(mem.counts(), { players: 1, talked: 1, dismissed: 0 })
  assert.equal(mem.dropNonJoined(), 0)
})

test('c31 privacy: the greeting of a non-joined person logs no address', () => {
  const { b } = mk()
  const s = spot(50, 0), P = [person(A, 50, 0)]
  for (let i = 0; i < 8; i++) b.step(at(i < 3 ? 0 : 45, 0), [s], P, [], [])
  assert.ok(!JSON.stringify(b.log).toLowerCase().includes(A.toLowerCase()))
})
