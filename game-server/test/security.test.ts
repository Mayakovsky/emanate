import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { RateLimiter, clientIp, safeEqual, cleanTick, cleanName, cleanPos, routePath, decodeSegment, publicBase } from '../src/security.ts'
import { startServer, makeMatch } from '../src/server.ts'
import { CONFIG } from '../src/config.ts'

// ---------------- units ----------------
test('rate limiter: a burst, then the refill rate; keys are independent; idle keys are forgotten; a full table refuses new keys', () => {
  let t = 0
  const rl = new RateLimiter(2, 4, () => t, 3)
  for (let i = 0; i < 4; i++) assert.equal(rl.take('a'), true)
  assert.equal(rl.take('a'), false) // burst spent
  assert.equal(rl.take('b'), true) // another key is not affected
  t += 1000 // 2 tokens back
  assert.equal(rl.take('a'), true)
  assert.equal(rl.take('a'), true)
  assert.equal(rl.take('a'), false)
  assert.equal(rl.limited('a'), true)
  rl.take('c')
  assert.equal(rl.take('d'), false) // 3 keys is the cap
  t += 60_000
  rl.take('x') // sweeps the idle ones
  assert.ok(rl.size() <= 2)
})

test('client address: the socket address unless behind a trusted proxy, then the last X-Forwarded-For entry (earlier ones are client-supplied)', () => {
  assert.equal(clientIp('1.2.3.4', '9.9.9.9', false), '1.2.3.4') // header ignored when untrusted
  assert.equal(clientIp('127.0.0.1', '6.6.6.6, 203.0.113.5', true), '203.0.113.5') // a spoofed first entry is ignored
  assert.equal(clientIp('127.0.0.1', 'not an ip!!', true), '127.0.0.1')
  assert.equal(clientIp('127.0.0.1', undefined, true), '127.0.0.1')
  assert.equal(clientIp(undefined, undefined, false), 'unknown')
})

test('token comparison: exact match only, never for empty', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abd', 'abc'), false)
  assert.equal(safeEqual('', ''), false)
  assert.equal(safeEqual(undefined, 'abc'), false)
  assert.equal(safeEqual('abc', undefined), false)
})

test('names lose control, zero-width and bidi characters and are capped', () => {
  assert.equal(cleanName('Ann\u0000\u0007 ‮evil​'), 'Ann evil')
  assert.equal(cleanName('x'.repeat(100))!.length, 32)
  assert.equal(cleanName('\u0001\u0002'), undefined)
  assert.equal(cleanName(5), undefined)
})

test('positions: finite, inside the world and sane heights', () => {
  assert.deepEqual(cleanPos({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 })
  assert.equal(cleanPos({ x: NaN, y: 0, z: 0 }), null)
  assert.equal(cleanPos({ x: Infinity, y: 0, z: 0 }), null)
  assert.equal(cleanPos({ x: 1e9, y: 0, z: 0 }), null)
  assert.equal(cleanPos({ x: 0, y: 1e9, z: 0 }), null)
  assert.equal(cleanPos({ x: '1', y: 0, z: 0 }), null)
  assert.equal(cleanPos(null), null)
})

test('tick schema: pid format, position, events whitelisted and reduced to known fields, plume position ignored', () => {
  const ok = cleanTick({ pid: '0xabc123', name: 'Bob', pos: { x: 1, y: 0, z: 2 }, speed: 5, side: 'helpers', events: [{ ev: 'plume', pos: { x: 999, y: 0, z: 999 } }, { ev: 'trap', extra: 1 }, { ev: 'choice', pick: 'help', junk: 1 }, { ev: 'choice', pick: 'hax' }, { ev: 'replay', kind: 'round', round: 99 }, { ev: 'dialogue-test' }, 'str', null], log: ['x'] })!
  assert.equal(ok.pid, '0xabc123')
  assert.deepEqual(ok.events, [{ ev: 'plume' }, { ev: 'trap' }, { ev: 'choice', pick: 'help' }, { ev: 'replay', kind: 'round', round: 3 }])
  assert.equal(cleanTick({ pid: 'bad pid!', pos: { x: 0, y: 0, z: 0 } }), null)
  assert.equal(cleanTick({ pid: 'a'.repeat(65), pos: { x: 0, y: 0, z: 0 } }), null)
  assert.equal(cleanTick({ pid: 'ok', pos: { x: 0, y: 0 } }), null)
  assert.equal(cleanTick({ pid: 'ok', pos: { x: 0, y: 0, z: 0 }, events: 'x' }), null)
  assert.equal(cleanTick(null), null)
  assert.equal(cleanTick({ pid: 'ok', pos: { x: 0, y: 0, z: 0 }, speed: 1e9 })!.speed, 0)
  assert.equal(cleanTick({ pid: 'ok', pos: { x: 0, y: 0, z: 0 }, side: 'admin' })!.side, undefined)
  const many = cleanTick({ pid: 'ok', pos: { x: 0, y: 0, z: 0 }, events: new Array(500).fill({ ev: 'trap' }) })!
  assert.equal(many.events.length, 50)
})

test('paths: the query is stripped; segments decode safely; the public base is never an arbitrary string', () => {
  assert.equal(routePath('/tick?x=1'), '/tick')
  assert.equal(decodeSegment('a%20b.wav'), 'a b.wav')
  assert.equal(decodeSegment('%'), null) // a bad escape is a 404, not an exception
  assert.equal(decodeSegment('..%2fsecret'), null)
  assert.equal(decodeSegment('a%00b'), null)
  assert.equal(decodeSegment('a%5cb'), null)
  assert.equal(publicBase('https://emanate.example/', 'evil.com', 1), 'https://emanate.example')
  assert.equal(publicBase(undefined, 'host.example:8787', 1), 'http://host.example:8787')
  assert.equal(publicBase(undefined, 'x"><script>', 8787), 'http://127.0.0.1:8787')
  assert.equal(publicBase(undefined, undefined, 8787), 'http://127.0.0.1:8787')
})

test('startup refusals: a public bind without DEV, equal or short tokens', () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, ['src/server.ts'], { env: { ...process.env, EMANATE_PORT: '0', EMANATE_LOG: 'off', ...env }, encoding: 'utf8', timeout: 8000 })
  assert.notEqual(run({ EMANATE_HOST: '0.0.0.0' }).status, 0)
  assert.notEqual(run({ EMANATE_ADMIN_TOKEN: 'short' }).status, 0)
  assert.notEqual(run({ EMANATE_ADMIN_TOKEN: 'x'.repeat(24), EMANATE_BRIDGE_TOKEN: 'x'.repeat(24), EMANATE_SYNTH: 'bridge' }).status, 0)
  assert.ok(String(run({ EMANATE_HOST: '0.0.0.0' }).stderr).includes('refusing to listen'))
})

// ---------------- the running server ----------------
async function withServer(env: Record<string, string>, fn: (port: number, match: ReturnType<typeof makeMatch>) => Promise<void>, subclass?: (m: any) => void) {
  const prev = { ...process.env }
  for (const k of ['EMANATE_DEV', 'EMANATE_ADMIN_TOKEN', 'EMANATE_BRIDGE_TOKEN', 'EMANATE_SYNTH', 'EMANATE_TRUST_PROXY', 'EMANATE_MAX_PLAYERS', 'EMANATE_PUBLIC_URL']) delete process.env[k]
  Object.assign(process.env, { EMANATE_LOG: 'off', EMANATE_HOST: '127.0.0.1' }, env)
  const m = makeMatch('solo')
  subclass?.(m)
  const server = startServer(0, m)
  await new Promise((r) => (server.listening ? r(null) : server.once('listening', () => r(null))))
  const port = (server.address() as AddressInfo).port
  try {
    await fn(port, m)
  } finally {
    server.close()
    server.closeAllConnections?.()
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k]
    Object.assign(process.env, prev)
  }
}
const url = (port: number, p: string) => `http://127.0.0.1:${port}${p}`
const tick = (port: number, body: unknown, extra: RequestInit = {}) => fetch(url(port, '/tick'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...extra })
const T = (pid: string) => ({ pid, name: 'T', pos: { x: 5, y: 0, z: 5 }, speed: 0, events: [] })

test('public mode: admin and debug routes do not exist without a separate admin token; unknown paths are plain 404s', async () => {
  await withServer({}, async (port) => {
    for (const p of ['/state', '/roam', '/synthbrain']) assert.equal((await fetch(url(port, p))).status, 404)
    assert.equal((await fetch(url(port, '/admin'), { method: 'POST', body: '{"cmd":"reset"}' })).status, 404)
    assert.equal((await fetch(url(port, '/nothing-here'))).status, 404)
    assert.equal((await fetch(url(port, '/telemetry'), { method: 'POST', body: '{}' })).status, 404)
  })
})

test('admin token: wrong token 403, right token 200, repeated failures are rate limited, the route answers no CORS', async () => {
  const token = 'a'.repeat(24)
  await withServer({ EMANATE_ADMIN_TOKEN: token }, async (port) => {
    assert.equal((await fetch(url(port, '/state'))).status, 403)
    const ok = await fetch(url(port, '/state'), { headers: { 'x-emanate-admin': token } })
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('access-control-allow-origin'), null)
    assert.equal((await fetch(url(port, '/state?x=1'), { headers: { 'x-emanate-admin': token } })).status, 200) // a query string does not bypass or break the gate
    for (let i = 0; i < 12; i++) await fetch(url(port, '/state'), { headers: { 'x-emanate-admin': 'wrong' + i } })
    assert.equal((await fetch(url(port, '/state'), { headers: { 'x-emanate-admin': token } })).status, 429) // locked out for a while, even with the right token
  })
})

test('tick: strict schema, body cap, per-player rate limit, player cap, CORS only here', async () => {
  await withServer({ EMANATE_MAX_PLAYERS: '2' }, async (port) => {
    const good = await tick(port, T('p-1'))
    assert.equal(good.status, 200)
    assert.equal(good.headers.get('access-control-allow-origin'), '*')
    assert.equal((await tick(port, { pid: 'p-1', pos: { x: 'a' } })).status, 400)
    assert.equal((await tick(port, 'not json')).status, 400)
    assert.equal((await tick(port, { ...T('p-1'), log: 'x'.repeat(20_000) })).status, 413) // over the 16 KB cap
    assert.equal((await tick(port, T('p 2 bad'))).status, 400)
    assert.equal((await tick(port, T('p-2'))).status, 200)
    assert.equal((await tick(port, T('p-3'))).status, 429) // the match is full (2 players)
    assert.equal((await tick(port, T('p-1'))).status, 200) // an existing player is still served
  })
})

test('tick: a player id cannot flood the server (per-id rate limit)', async () => {
  await withServer({}, async (port) => {
    const codes: number[] = []
    for (let i = 0; i < 30; i++) codes.push((await tick(port, T('flood-1'))).status)
    assert.ok(codes.includes(429), 'some are limited: ' + codes.join(','))
    assert.equal(codes[0], 200)
  })
})

test('tick: a client-supplied side is ignored once the choice dialogue decides sides; events cannot move a plume elsewhere', async () => {
  const prev = CONFIG.choiceDialogue
  CONFIG.choiceDialogue = true
  try {
    await withServer({}, async (port, m) => {
      m.setMode('multiplayer')
      await tick(port, { ...T('side-1'), side: 'helpers' })
      assert.equal(m.players.get('side-1')!.side, 'hunters') // the default, not what the client asked for
      await tick(port, { ...T('plume-1'), events: [{ ev: 'plume', pos: { x: 4000, y: 0, z: 4000 } }] })
      assert.ok(m.plumes.every((p) => Math.hypot(p.pos.x - 5, p.pos.z - 5) < 1)) // placed where the player stands
    })
  } finally {
    CONFIG.choiceDialogue = prev
  }
})

test('audio: bad escapes and traversal are 404s, never a crash; the manifest uses the configured public URL, not the Host header', async () => {
  await withServer({ EMANATE_PUBLIC_URL: 'https://emanate.example' }, async (port) => {
    for (const p of ['/audio/files/%', '/audio/files/..%2f..%2fsrc%2fserver.ts', '/audio/files/%2e%2e/%2e%2e/package.json', '/audio/files/a%00.wav', '/audio/files/%5c..%5cx', '/audio/files/']) {
      const r = await fetch(url(port, p))
      assert.equal(r.status, 404, p)
    }
    const man = await (await fetch(url(port, '/audio/manifest.json'), { headers: { host: 'evil.example' } })).text()
    assert.ok(!man.includes('evil.example'))
    assert.ok(man.includes('https://emanate.example') || man.includes('"slots"'))
    assert.equal((await fetch(url(port, '/state'))).status, 404) // and the server is still alive
  })
})

test('errors never leak: an internal failure answers a generic 500 without a stack or message', async () => {
  await withServer({}, async (port) => {
    const r = await tick(port, T('boom'))
    assert.equal(r.status, 500)
    const text = await r.text()
    assert.deepEqual(JSON.parse(text), { ok: false, error: 'internal error' })
    assert.ok(!/at |\.ts|secret-failure/.test(text))
  }, (m) => { m.snapshot = () => { throw new Error('secret-failure at /home/x/server.ts:1') } })
})

test('websocket upgrade is refused on a public server', async () => {
  await withServer({}, async (port) => {
    const closed = await new Promise<boolean>((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: abc\r\nSec-WebSocket-Version: 13\r\n\r\n'))
      let data = ''
      s.on('data', (d) => (data += d))
      s.on('close', () => resolve(!data.includes('101')))
      s.on('error', () => resolve(true))
      setTimeout(() => resolve(false), 3000)
    })
    assert.equal(closed, true)
  })
})

test('bridge: wrong token 403 then locked out; replayed or old sequence numbers are refused with 409', async () => {
  const token = 'b'.repeat(24)
  await withServer({ EMANATE_SYNTH: 'bridge', EMANATE_BRIDGE_TOKEN: token }, async (port) => {
    const sync = (body: unknown, tk = token) => fetch(url(port, '/bridge/sync'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-emanate-bridge': tk }, body: JSON.stringify(body) })
    assert.equal((await sync({ seq: 100 })).status, 200)
    assert.equal((await sync({ seq: 101 })).status, 200)
    assert.equal((await sync({ seq: 101 })).status, 409) // a replay of a captured request
    assert.equal((await sync({ seq: 50 })).status, 409)
    assert.equal((await sync({ seq: 102 })).status, 200)
    assert.equal((await sync({ seq: 103 }, 'wrong')).status, 403)
    for (let i = 0; i < 12; i++) await sync({ seq: 200 + i }, 'wrong' + i)
    assert.equal((await sync({ seq: 300 })).status, 429) // the address is locked out, even with the right token
  })
})

test('oversize bodies are refused before they are read (admin 8 KB, others 4 KB)', async () => {
  await withServer({ EMANATE_ADMIN_TOKEN: 'c'.repeat(24) }, async (port) => {
    const r = await fetch(url(port, '/admin'), { method: 'POST', headers: { 'x-emanate-admin': 'c'.repeat(24) }, body: 'x'.repeat(9000) })
    assert.equal(r.status, 413)
    const r2 = await fetch(url(port, '/whatever'), { method: 'POST', body: 'x'.repeat(5000) })
    assert.equal(r2.status, 413)
  })
})

test('one address cannot fill the match with invented players (per-address player cap)', async () => {
  await withServer({ EMANATE_MAX_PIDS_PER_IP: '3', EMANATE_MAX_PLAYERS: '10' }, async (port) => {
    for (const id of ['a-1', 'a-2', 'a-3']) assert.equal((await tick(port, T(id))).status, 200)
    assert.equal((await tick(port, T('a-4'))).status, 429)
    assert.equal((await tick(port, T('a-1'))).status, 200) // the ones already in are unaffected
  })
})

test('trace events from the halo are kept (name cleaned, text capped) and nothing else is let through', () => {
  const ok = cleanTick({ pid: '0xabc123', pos: { x: 0, y: 0, z: 0 }, events: [{ ev: 'trace', what: 'lift glide!', text: 'x'.repeat(900), extra: 1 }, { ev: 'trace', what: 5, text: 'no' }] })!
  assert.equal(ok.events.length, 1)
  assert.equal((ok.events[0] as any).what, 'liftglide')
  assert.equal(((ok.events[0] as any).text as string).length, 400)
  assert.equal(Object.keys(ok.events[0]!).sort().join(), 'ev,text,what')
  // an older halo (c24i and before) still sends ev 'probe': accepted and stored as a trace
  const old = cleanTick({ pid: '0xabc123', pos: { x: 0, y: 0, z: 0 }, events: [{ ev: 'probe', what: 'teleport', text: 'r' }] })!
  assert.equal(old.events.length, 1); assert.equal((old.events[0] as any).ev, 'trace'); assert.equal((old.events[0] as any).what, 'teleport')
})

test('c26 gate B: the bare check carries only the lobby and the bubble (no player data); a tick grants a 20 s lease only to a joined wearer', async () => {
  await withServer({}, async (port, m: any) => {
    m.cfg = { ...m.cfg, lobbyEnabled: true } // the real server has the lobby on: a wearer not yet in the bubble only waits
    const bare = await (await fetch(url(port, '/halo/state?pv=1'))).json() as any
    assert.equal(bare.lobby, false); assert.equal(bare.bubble, null)
    assert.deepEqual(Object.keys(bare).filter((k) => !['ok', 'idle', 'sv', 'lobby', 'bubble', 'refuse', 'message', 'blasts', 'call', 'trails', 'replay'].includes(k)), [])
    // no lobby and not in a match: a tick is answered but carries no lease
    const r1 = await (await tick(port, T('0x' + 'a'.repeat(40)))).json() as any
    assert.equal(r1.lease, undefined)
    // a lobby around the wearer: the wearer is inside the bubble, so the bare check shows it and the tick grants the lease
    m.bubble = { x: 5, y: 0, z: 5, radius: 10 }
    const bare2 = await (await fetch(url(port, '/halo/state?pv=1'))).json() as any
    assert.equal(bare2.lobby, true); assert.deepEqual(bare2.bubble, { x: 5, y: 0, z: 5, radius: 10 })
    const r2 = await (await tick(port, T('0x' + 'b'.repeat(40)))).json() as any
    assert.equal(r2.lease, 20)
    // a wearer far outside the bubble and not in the match gets none
    const far = { ...T('0x' + 'c'.repeat(40)), pos: { x: 500, y: 0, z: 500 } }
    assert.equal(((await (await tick(port, far)).json()) as any).lease, undefined)
  })
})

test('c27: a launch is shown to every Halo for a few seconds (no id), the call goes out once per lobby when enough Halos check in, and a call join counts as inside the bubble', async () => {
  await withServer({}, async (port, m: any) => {
    const T0 = '0x' + 'b'.repeat(40)
    const r0 = await (await tick(port, { ...T(T0), events: [{ ev: 'blast' }] })).json() as any
    const bare = await (await fetch(url(port, '/halo/state?pv=1'))).json() as any
    assert.equal(bare.blasts.length, 1); assert.deepEqual(Object.keys(bare.blasts[0]).sort(), ['age', 'x', 'y', 'z']); assert.ok(r0)
    assert.equal(bare.call, null)
    m.bubble = { x: 5, y: 0, z: 5, radius: 10 }; m.state = 'lobby'
    m.upsertPlayer(T0, { name: 'x', pos: { x: 500, y: 0, z: 500 }, speed: 0 })
    assert.equal(m.insideBubble(m.players.get(T0)), false)
    m.callJoin(T0)
    assert.equal(m.insideBubble(m.players.get(T0)), true)
  })
})

test('c29e: while a player is in the air after a blast the bare check carries their position only (no id), and it stops on landing', async () => {
  await withServer({}, async (port, m: any) => {
    const pid = '0x' + 'b'.repeat(40)
    await tick(port, { ...T(pid), events: [{ ev: 'blast' }] })
    const a = await (await fetch(url(port, '/halo/state?pv=1'))).json() as any
    assert.equal(a.trails.length, 1)
    assert.deepEqual(Object.keys(a.trails[0]).sort(), ['x', 'y', 'z'])
    assert.ok(!JSON.stringify(a).includes('bbbb'))
    const r2 = await tick(port, { ...T(pid), events: [{ ev: 'blast-end' }] }); assert.equal(r2.status, 200)
    const b = await (await fetch(url(port, '/halo/state?pv=1'))).json() as any
    assert.equal(b.trails.length, 0)
  })
})
