import test from 'node:test'
import assert from 'node:assert/strict'
import { BridgeHub, parseSync } from '../src/bridge.ts'
import { startServer, makeMatch } from '../src/server.ts'
import type { AddressInfo } from 'node:net'

test('auth: only the exact token passes, an empty token never does', () => {
  const hub = new BridgeHub('s3cret-token-value')
  assert.equal(hub.authorized('s3cret-token-value'), true)
  assert.equal(hub.authorized('s3cret-token-valuE'), false)
  assert.equal(hub.authorized(''), false)
  assert.equal(hub.authorized(undefined), false)
  assert.equal(new BridgeHub('').authorized(''), false)
})

test('queue: commands come out in order once, stale ones are dropped, the queue is capped', () => {
  let t = 1000
  const hub = new BridgeHub('x', () => t, 3, 5000)
  hub.push({ cmd: 'a' }); t += 1000; hub.push({ cmd: 'b' })
  assert.deepEqual(hub.drain(), [{ cmd: 'a' }, { cmd: 'b' }])
  assert.deepEqual(hub.drain(), [])
  hub.push({ cmd: 'old' }); t += 6000; hub.push({ cmd: 'new' })
  assert.deepEqual(hub.drain(), [{ cmd: 'new' }]) // the old one sat for longer than the ttl
  for (let i = 0; i < 5; i++) hub.push({ cmd: i })
  assert.deepEqual(hub.drain(), [{ cmd: 2 }, { cmd: 3 }, { cmd: 4 }]) // oldest dropped
  assert.equal(hub.lastSeen, t)
})

test('parseSync accepts a position and events and rejects junk', () => {
  assert.deepEqual(parseSync({ pos: { x: 1, y: 2, z: 3 }, events: [{ event: 'players', players: [] }] }), { pos: { x: 1, y: 2, z: 3 }, events: [{ event: 'players', players: [] }], seq: null })
  assert.deepEqual(parseSync({}), { pos: null, events: [], seq: null })
  assert.equal(parseSync({ seq: 'x' }), null)
  assert.equal(parseSync({ seq: -1 }), null)
  assert.equal(parseSync({ seq: 7 })!.seq, 7)
  assert.equal(parseSync({ pos: { x: 1, y: NaN, z: 0 } }), null)
  assert.equal(parseSync({ pos: { x: 'a', y: 0, z: 0 } }), null)
  assert.equal(parseSync({ events: 'no' }), null)
  assert.equal(parseSync({ events: [{ nope: 1 }] }), null)
  assert.equal(parseSync({ events: new Array(201).fill({ event: 'x' }) }), null)
  assert.equal(parseSync(null), null)
  assert.equal(parseSync('x'), null)
})

async function post(port: number, path: string, body: unknown, token?: string) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-emanate-bridge': token } : {}) }, body: JSON.stringify(body) })
  return { status: r.status, json: (await r.json()) as any }
}

test('server: /bridge/sync end to end: auth, position into the match, events into the roam brain, queued commands back', async () => {
  const prev = { ...process.env }
  process.env.EMANATE_SYNTH = 'bridge'
  process.env.EMANATE_BRIDGE_TOKEN = 'tok-for-the-test'
  process.env.EMANATE_SYNTH_ROAM = 'on'
  process.env.EMANATE_LOG = 'off'
  process.env.EMANATE_HOST = '127.0.0.1'
  process.env.EMANATE_DEV = 'on'
  const server = startServer(0, makeMatch('solo'))
  await new Promise((r) => (server.listening ? r(null) : server.once('listening', () => r(null))))
  const port = (server.address() as AddressInfo).port
  try {
    assert.equal((await post(port, '/bridge/sync', { pos: { x: 1, y: 0, z: 1 } })).status, 403) // no token
    assert.equal((await post(port, '/bridge/sync', { pos: { x: 1, y: 0, z: 1 } }, 'wrong')).status, 403)
    assert.equal((await post(port, '/bridge/sync', { pos: { x: 'bad' } }, 'tok-for-the-test')).status, 400)
    const ok = await post(port, '/bridge/sync', { pos: { x: 120, y: 3, z: -45 }, events: [{ event: 'players', players: [{ address: '0xabc', name: 'T', position: [5, 0, 6] }] }] }, 'tok-for-the-test')
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.json.commands, [])
    const st = await (await fetch(`http://127.0.0.1:${port}/state`)).json() as any
    assert.equal(st.synthSource, 'bridge')
    assert.deepEqual([st.match.synth.x, st.match.synth.z], [120, -45]) // the position reached the match
    assert.equal(st.bridge.syncs, 1)
    assert.equal(st.bridge.rejected, 2)
    const roam = await (await fetch(`http://127.0.0.1:${port}/roam`)).json() as any
    assert.equal(roam.people.length, 1) // the Synth's `players` event reached the roaming brain
    // the roaming driver asks the Synth for its player list every 3 s: that command comes back on a later sync
    let cmds: any[] = []
    for (let i = 0; i < 14 && !cmds.some((c) => c.cmd === 'players'); i++) {
      await new Promise((r) => setTimeout(r, 500))
      cmds = cmds.concat((await post(port, '/bridge/sync', {}, 'tok-for-the-test')).json.commands)
    }
    assert.ok(cmds.some((c) => c.cmd === 'players'), 'a queued command comes back: ' + JSON.stringify(cmds))
  } finally {
    server.close()
    server.closeAllConnections?.()
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k]
    Object.assign(process.env, prev)
  }
})

test('server: without a token the bridge is off (404), whatever the mode says', async () => {
  const prev = { ...process.env }
  process.env.EMANATE_SYNTH = 'bridge'
  delete process.env.EMANATE_BRIDGE_TOKEN
  process.env.EMANATE_LOG = 'off'
  process.env.EMANATE_HOST = '127.0.0.1'
  const server = startServer(0, makeMatch('solo'))
  await new Promise((r) => (server.listening ? r(null) : server.once('listening', () => r(null))))
  const port = (server.address() as AddressInfo).port
  try {
    assert.equal((await post(port, '/bridge/sync', {}, 'anything')).status, 404)
  } finally {
    server.close()
    server.closeAllConnections?.()
    Object.assign(process.env, prev)
    if (!('EMANATE_SYNTH' in prev)) delete process.env.EMANATE_SYNTH
  }
})

test('round 19: a reachable-spot list (about 100 KB) passes the bridge schema; any other event is still capped at 8 KB', () => {
  const spots = Array.from({ length: 1800 }, (_, i) => ({ x: i + 0.5, y: 0, z: -i - 0.5, cost: i / 10 }))
  assert.ok(parseSync({ events: [{ event: 'nav_spots', spots }], seq: 1 }))
  assert.equal(parseSync({ events: [{ event: 'chat', text: 'x'.repeat(9000) }], seq: 2 }), null)
})
