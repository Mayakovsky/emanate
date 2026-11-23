import test from 'node:test'
import assert from 'node:assert/strict'
import { HaloControl } from '../src/halocontrol.ts'
import { cleanTick } from '../src/security.ts'

const A = '0x' + 'a'.repeat(40)
test('by default the server changes nothing: no settings, no commands, the halo keeps its defaults', () => {
  const h = new HaloControl()
  assert.deepEqual(h.forTick(A, 0), { sv: 0 })
  assert.equal(h.idle, false); assert.equal(h.refusal(undefined), null)
})
test('overrides are validated, versioned and sent when the halo\'s version differs', () => {
  const h = new HaloControl()
  assert.equal(h.set({ power: { runSpeed: 18 }, text: { plumeSent: 'x' }, bogus: { a: 1 }, rules: { 'bad key!': 1, plumeSeconds: NaN } }), 2)
  assert.equal(h.sv, 1)
  const r = h.forTick(A, 0) as any
  assert.equal(r.sv, 1); assert.deepEqual(r.settings, { power: { runSpeed: 18 }, text: { plumeSent: 'x' } })
  assert.equal((h.forTick(A, 1) as any).settings, undefined) // up to date: nothing re-sent
  h.reset()
  assert.deepEqual((h.forTick(A, 1) as any).settings, {}) // gone: the halo is told to fall back to its defaults
})
test('commands: known names only, queued per wearer or for everyone, drained once', () => {
  const h = new HaloControl()
  h.forTick(A, 0)
  assert.equal(h.command('all', { c: 'hud', text: 'hello', seconds: 5 }), true)
  assert.equal(h.command('all', { c: 'rm -rf' }), false)
  assert.equal(h.command(A, { c: 'fx', kind: 'ring' }), true)
  const r = h.forTick(A, 0) as any
  assert.equal(r.cmds.length, 2)
  assert.equal((h.forTick(A, 0) as any).cmds, undefined)
  assert.equal(h.command(A, { c: 'hud', text: 'x'.repeat(700) }), false) // too large
})
test('the version policy refuses an old halo and serves the rest; a halo with no protocol counts as 0', () => {
  const h = new HaloControl()
  h.policy = { minPv: 1, message: 'update' }
  assert.equal(h.refusal(0), 'update'); assert.equal(h.refusal(undefined), 'update'); assert.equal(h.refusal(1), null)
  assert.deepEqual(h.publicState(0), { refuse: true, message: 'update', sv: 0 })
  h.policy.minPv = 0; h.idle = true
  assert.deepEqual(h.publicState(1), { idle: true, sv: 0 })
})
test('the tick keeps only the new fields in a safe form', () => {
  const t = cleanTick({ pid: A, pos: { x: 1, y: 2, z: 3 }, v: 'c23a', pv: 1, sv: 4, events: [] })!
  assert.equal(t.v, 'c23a'); assert.equal(t.pv, 1); assert.equal(t.sv, 4)
  const u = cleanTick({ pid: A, pos: { x: 1, y: 2, z: 3 }, v: '<script>', pv: 'x', sv: 1e12 })!
  assert.equal(u.v, undefined); assert.equal(u.pv, undefined); assert.equal(u.sv, undefined)
})
test('versions are counted without addresses', () => {
  const h = new HaloControl(); h.seen('c23a', 1); h.seen('c23a', 1); h.seen(undefined, undefined)
  assert.deepEqual(Object.fromEntries(h.versions), { 'c23a/1': 2, 'none/0': 1 })
})

test('c24f candidate: the particles command is accepted for the three kinds and refused for an unknown kind or a non-numeric number', () => {
  const h = new HaloControl(); h.forTick('0xabc', 0)
  assert.equal(h.command('all', { c: 'particles', kind: 'fire', x: 1, y: 2, z: 3, size: 2 }), true)
  assert.equal(h.command('all', { c: 'particles', kind: 'smoke', height: 150, seconds: 10 }), true)
  assert.equal(h.command('all', { c: 'particles', kind: 'sparks' }), true)
  assert.equal(h.command('all', { c: 'particles', kind: 'lava' }), false)
  assert.equal(h.command('all', { c: 'particles', kind: 'fire', size: 'big' }), false)
  assert.equal(h.command('all', { c: 'particles', kind: 'fire', x: NaN }), false)
  assert.equal((h.forTick('0xabc', 0) as any).cmds.length, 3)
})

test('c29: the look section and the look command (Plan v2)', () => {
  const h = new HaloControl()
  assert.equal(h.set({ look: { 'E13.smoke.size': 1.4, 'E1.color': '1,0.1,0.03' } }), 2)
  assert.equal(h.set({ look: { ['x'.repeat(41)]: 1 } }), 0) // key over 40 chars
  assert.equal(h.set({ look: { 'E1.color': 'x'.repeat(201) } }), 0) // value over 200 chars
  h.sawPlayers.add('0xabc')
  assert.equal(h.command('0xabc', { c: 'look', id: 'E13', r: 110 }), true)
  assert.equal(h.command('0xabc', { c: 'look', id: 'E15' }), false)
  assert.equal(h.command('0xabc', { c: 'look', id: 'E1', x: 'a' }), false)
})

test('c29e: clear is a valid command and clearQueues drops everything queued', () => {
  const h = new HaloControl(); h.sawPlayers.add('0xa'); h.sawPlayers.add('0xb')
  for (let i = 0; i < 5; i++) h.command('all', { c: 'hud', text: 'x' })
  assert.equal(h.clearQueues(), 10)
  assert.deepEqual(h.forTick('0xa', 0).cmds, undefined)
  assert.equal(h.command('all', { c: 'clear' }), true)
  assert.equal((h.forTick('0xa', 0).cmds as any[]).length, 1)
})

test('c30c: the look command accepts the two archetypes PLUME and PORTAL, and still refuses other ids', async () => {
  const { HaloControl } = await import('../src/halocontrol.ts')
  const h = new HaloControl()
  assert.ok(h.command('0xabc', { c: 'look', id: 'PLUME' }))
  assert.ok(h.command('0xabc', { c: 'look', id: 'PORTAL' }))
  assert.ok(!h.command('0xabc', { c: 'look', id: 'BOGUS' }))
})
