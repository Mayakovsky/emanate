import test from 'node:test'
import assert from 'node:assert/strict'
import { netUpdate, consent, optOut, paused, setPaused, leaseValid, grantConsent, doOptOut, bare, emit, sendGameEvent, cmdQueue, LEASE_MAX } from '../src/net.ts'

// c26 gate B: consent, lease and opt-out (net.ts), with a fake fetch and a fake clock (netUpdate's dt)
type Call = { url: string; method: string; body?: string }
const calls: Call[] = []
let reply: any = { ok: true, idle: false, sv: 0 }
;(globalThis as any).fetch = (url: string, init?: any) => {
  calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
  return Promise.resolve({ ok: true, json: () => Promise.resolve(reply) })
}
const info = { pid: '0xabc', name: 'T', pos: { x: 1, y: 2, z: 3 }, local: { x: 1, y: 2, z: 3 }, speed: 4, tier: 1 }
const flush = () => new Promise((r) => setTimeout(r, 5))
const run = async (secs: number, step = 0.25) => { for (let t = 0; t < secs; t += step) { netUpdate(step, info); await flush() } }

test('before consent: only the bare check is made, with no player data, and events are not kept', async () => {
  reply = { ok: true, idle: false, sv: 0, lobby: true, bubble: { x: 10, y: 0, z: 20, radius: 10 } }
  emit('key', { key: 'E' }); sendGameEvent({ ev: 'plume' })
  await run(8)
  assert.ok(calls.length > 0)
  for (const c of calls) { assert.equal(c.method, 'GET'); assert.ok(c.url.includes('/halo/state')); assert.ok(!c.url.includes('0xabc') && !c.url.includes('pos')) }
  assert.deepEqual(bare.bubble, { x: 10, y: 0, z: 20, radius: 10 }); assert.equal(bare.lobby, true)
  assert.equal(consent, false)
})

test('a lease in a reply is ignored without consent; after consent it is taken, capped at 20 s, and lapses by itself', async () => {
  reply = { ok: true, idle: false, sv: 0, lease: 99, lobby: false, bubble: null }
  await run(4)
  assert.equal(leaseValid(), false) // no consent: the grant is not taken
  grantConsent(); assert.equal(consent, true)
  calls.length = 0
  await run(1)
  const tick = calls.find((c) => c.method === 'POST')
  assert.ok(tick && tick.url.endsWith('/tick'), 'after consent the tick (with player data) is sent')
  assert.ok(tick!.body!.includes('0xabc'))
  assert.equal(leaseValid(), true)
  reply = { ok: true, idle: false, sv: 0 } // the server stops granting
  await run(LEASE_MAX - 3) // still inside the 20 s cap
  assert.equal(leaseValid(), true)
  await run(5) // past 20 s since the last grant (99 s was capped at 20)
  assert.equal(leaseValid(), false)
  reply = { ok: true, idle: false, sv: 0, lease: 20 }
  await run(1)
  assert.equal(leaseValid(), true) // a renewed grant restores it
})

test('the held chord pauses at once (nothing sent, nothing kept), releasing resumes, no server value or command cancels the pause', async () => {
  // the previous tests left consent given and a lease granted
  assert.equal(consent, true)
  reply = { ok: true, idle: false, sv: 0, lease: 20 }
  await run(1)
  assert.equal(leaseValid(), true)
  setPaused(true); assert.equal(paused, true)
  calls.length = 0
  emit('key', { key: 'x' }); sendGameEvent({ ev: 'plume' })
  reply = { ok: true, idle: false, sv: 0, lease: 20, paused: false, cmds: [{ c: 'idle', on: false }, { c: 'feature', name: 'powers', on: 1 }, { c: 'settings' }] }
  await run(3)
  assert.equal(calls.length, 0, 'while paused nothing is sent, not even the bare check')
  assert.equal(paused, true, 'no server value or command cancels the pause')
  setPaused(false); assert.equal(paused, false) // released before 3 s
  await run(1)
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/tick')), 'after release sending resumes (consent still holds)')
  assert.equal(consent, true)
})

test('a command or a server value cannot set consent or clear the opt-out', async () => {
  reply = { ok: true, idle: false, sv: 0, consent: true, optOut: false, cmds: [{ c: 'feature', name: 'consent', on: 1 }, { c: 'settings' }, { c: 'idle', on: false }] }
  await run(2)
  cmdQueue.length = 0
  doOptOut()
  assert.equal(optOut, true); assert.equal(consent, false); assert.equal(leaseValid(), false)
  setPaused(true); assert.equal(paused, false, 'after the permanent opt-out the pause state cannot be set again either')
  grantConsent(); assert.equal(consent, false, 'consent cannot be granted after an opt-out')
  reply = { ok: true, idle: false, sv: 0, lease: 20, optOut: false }
  calls.length = 0
  await run(4)
  assert.equal(calls.length, 0, 'after the opt-out nothing is sent, not even the bare check')
  assert.equal(leaseValid(), false)
})
