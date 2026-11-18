// Emanate local game server. Bound to 127.0.0.1 ONLY. No dependencies (Node 24 runs the TypeScript directly).
//   POST /tick       a halo reports {pid,name,pos,speed,side,events,log}; the reply is that halo's game state
//   POST /telemetry  (kept from Part 1) plain event batches, logged
//   GET  /state      the whole match (debug)
//   POST /admin      {cmd:'mode'|'reset'|'synth'|'drop'|'teleport-synth'|'sim', ...} (local test control)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Match } from './match.ts'
import { CONFIG, UNCONFIRMED, type Mode } from './config.ts'
import { ParcelSet, nearestEmptyParcel } from './geo.ts'
import { simSynth, tailWslSynth, sendSynthCommand, setSynthTransport } from './synthfeed.ts'
import { BridgeHub, parseSync } from './bridge.ts'
import { RateLimiter, clientIp, safeEqual, cleanTick, BODY_CAP, DEFAULT_BODY_CAP, routePath, decodeSegment, publicBase } from './security.ts'
import { planRift } from './rift.ts'
import { SynthBrain, lookForRound, noWorld, type World } from './synthai.ts'
import { exposureFactor } from './hiding.ts'
import { buildManifest, readAudioFile } from './audioserve.ts'
import { RoamBrain, type Spot, type Person, type LiveEvent, type ChatMsg } from './roaming.ts'
import { Memory } from './memory.ts'
import { purgeProbes, forgetInProbes } from './retention.ts'
import { HaloControl } from './halocontrol.ts'
import { PRIVACY_NOTICE } from './privacy.ts'
import { PulseCheck, type Row as PulseRow } from './pulsecheck.ts'
import { parseStats, parseEvents, fetchJson } from './publicdata.ts'

const PORT = Number(process.env.EMANATE_PORT ?? 8787)
const HOST = process.env.EMANATE_HOST ?? '127.0.0.1' // behind Caddy keep 127.0.0.1
// Public-exposure switches (docs/EMANATE-SERVER-SECURITY-REVIEW.md). EMANATE_DEV=on is the local test mode: admin routes open on loopback, telemetry log and the
// WebSocket probe on. Without it the admin routes exist ONLY when a separate EMANATE_ADMIN_TOKEN is set, unknown paths are 404, and nothing logs request bodies.
// read when the server starts (not at import) so tests can set them
const ADMIN_ROUTES = new Set(['/state', '/admin', '/roam', '/synthbrain', '/pulsecheck'])
const ROOT = path.join(import.meta.dirname, '..')
const LOGDIR = path.join(ROOT, 'logs')
const AUDIO_DIR = path.join(ROOT, 'audio')
fs.mkdirSync(LOGDIR, { recursive: true })
const LOGFILE = path.join(LOGDIR, 'telemetry.jsonl')

function loadWorld(): World {
  const w = noWorld()
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'built-parcels.json'), 'utf8'))
    const built: [number, number][] = []
    for (const [x, z, h] of j.parcels as [number, number, number][]) { built.push([x, z]); w.heights.set(x + ',' + z, h) }
    w.built = new ParcelSet(built)
  } catch {}
  w.dead = loadSet('deadzones.json')
  return w
}
function loadSet(file: string): ParcelSet {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'))
    return new ParcelSet(j.parcels)
  } catch {
    return new ParcelSet([])
  }
}

export function makeMatch(mode: Mode = 'solo') {
  const deadZones = loadSet('deadzones.json')
  const empty = loadSet('empty-parcels.json')
  const m = new Match({
    now: Date.now,
    rng: Math.random,
    deadZones,
    cfg: { ...CONFIG, completeFreezeSeconds: Number(process.env.EMANATE_FREEZE ?? 2), teleportStart: process.env.EMANATE_TELEPORT_START === 'on', lobbyEnabled: process.env.EMANATE_LOBBY === 'on', lobbySeconds: Number(process.env.EMANATE_LOBBY_SECONDS ?? CONFIG.lobbySeconds), tossStartRounds: (process.env.EMANATE_TOSS_ROUNDS ?? '').split(',').map(Number).filter((n) => n === 1 || n === 2) }, // the Synth freezes for a moment after a completed Charge, then is teleported
    emptyParcelFinder: (x, z) => nearestEmptyParcel(empty, x, z)?.center ?? null
  })
  m.setMode(mode)
  return m
}

if (process.env.EMANATE_CHOICE === 'on') CONFIG.choiceDialogue = true

export function startServer(port = PORT, match: Match = makeMatch((process.env.EMANATE_MODE as Mode) ?? 'solo')) {
  const DEV = process.env.EMANATE_DEV === 'on'
  const ADMIN_TOKEN = process.env.EMANATE_ADMIN_TOKEN ?? ''
  const TRUST_PROXY = process.env.EMANATE_TRUST_PROXY === '1' // behind Caddy: the client address is the last X-Forwarded-For entry
  const MAX_PLAYERS = Number(process.env.EMANATE_MAX_PLAYERS ?? 64)
  const MAX_PIDS_PER_IP = Number(process.env.EMANATE_MAX_PIDS_PER_IP ?? 8) // distinct players one address may hold in the match (a household or an event, not a bot)
  const pidIp = new Map<string, string>() // player id -> the address that registered it (only for players currently in the match)
  if (!DEV && !['127.0.0.1', '::1', 'localhost'].includes(HOST)) throw new Error('refusing to listen on ' + HOST + ' without EMANATE_DEV=on: bind 127.0.0.1 and put Caddy in front')
  if (ADMIN_TOKEN && ADMIN_TOKEN === process.env.EMANATE_BRIDGE_TOKEN) throw new Error('EMANATE_ADMIN_TOKEN and EMANATE_BRIDGE_TOKEN must be different secrets')
  if (ADMIN_TOKEN && ADMIN_TOKEN.length < 16) throw new Error('EMANATE_ADMIN_TOKEN is too short (use at least 16 random characters)')
  if (process.env.EMANATE_BRIDGE_TOKEN && process.env.EMANATE_BRIDGE_TOKEN.length < 16) throw new Error('EMANATE_BRIDGE_TOKEN is too short (use at least 16 random characters)')
  let m = match
  let synthSource = 'none'
  const realSynth = () => synthSource === 'wsl' || synthSource === 'bridge' // a real Synth is driven: local log/FIFO or through the bridge
  const bridge = process.env.EMANATE_SYNTH === 'bridge' && process.env.EMANATE_BRIDGE_TOKEN ? new BridgeHub(process.env.EMANATE_BRIDGE_TOKEN) : null
  const navLog: any[] = []
  const brainTrace: { t: number; state: string; x: number; z: number; insideBuilt: boolean }[] = []
  let sim: NodeJS.Timeout | null = null
  const log = (rec: object) => !DEV || process.env.EMANATE_LOG === 'off' ? undefined : fs.appendFileSync(LOGFILE, JSON.stringify({ t: Date.now(), ...rec }) + '\n')

  const ipLimit = new RateLimiter(Number(process.env.EMANATE_IP_RATE ?? 40), Number(process.env.EMANATE_IP_BURST ?? 80)) // every request, per client address (testers may share a NAT: a group behind one address needs about 4 requests a second per player)
  const tickLimit = new RateLimiter(8, 16) // per player id: a halo ticks 4 times a second
  const bridgeLimit = new RateLimiter(10, 20) // the bridge syncs 4 times a second
  const authFail = new RateLimiter(10 / 600, 10) // failed token checks: 10 per address, then 1 more per minute
  const reject = (res: http.ServerResponse, code: number, error: string, extra: Record<string, string> = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', ...extra })
    res.end(JSON.stringify({ ok: false, error }))
  }

  const server = http.createServer((req, res) => {
    const ip = clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], TRUST_PROXY)
    const route = routePath(req.url)
    // one line per refused request, never headers, bodies or tokens
    res.on('finish', () => { if (res.statusCode >= 400) console.log(JSON.stringify({ t: Date.now(), method: req.method, route: route.slice(0, 80), status: res.statusCode })) })
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    // CORS only where the wearable needs it: its /tick and the audio files. Admin and bridge routes answer no cross-origin request.
    if (route === '/privacy' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' }); return void res.end(PRIVACY_NOTICE) }
    const publicRoute = route === '/tick' || route === '/halo/state' || route.startsWith('/audio/')
    if (publicRoute) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    }
    if (!ipLimit.take(ip)) return reject(res, 429, 'rate limited', { 'Retry-After': '2' })
    if (req.method === 'OPTIONS') return void (res.writeHead(publicRoute ? 204 : 405), res.end())
    const cap = BODY_CAP[route] ?? DEFAULT_BODY_CAP
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > cap) return reject(res, 413, 'too large')
    let body = ''
    let tooBig = false
    req.on('data', (c) => {
      if (tooBig) return
      body += c
      if (body.length > cap) {
        tooBig = true
        reject(res, 413, 'too large')
        req.destroy()
      }
    })
    req.on('error', () => {})
    req.on('end', () => {
     if (tooBig) return
     try {
      const j = safeJson(body) as any
      const reply = (obj: unknown, code = 200) => {
        res.writeHead(code, { 'content-type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      const url = route
      if (url === '/tick' && req.method === 'POST') {
        const t = cleanTick(j)
        if (!t) return reply({ ok: false, error: 'bad tick' }, 400)
        halo.seen(t.v, t.pv)
        const refusal = halo.refusal(t.pv)
        if (refusal) return reply({ ok: true, refuse: true, message: refusal, sv: halo.sv }) // an out-of-date halo: nothing about it is processed
        if (halo.idle) return reply({ ok: true, idle: true, sv: halo.sv }) // the kill switch: the tick is not processed
        if (!tickLimit.take(t.pid)) return reply({ ok: false, error: 'rate limited' }, 429)
        if (!m.players.has(t.pid)) {
          if (m.players.size >= MAX_PLAYERS) return reply({ ok: false, error: 'match full' }, 429)
          let mine = 0
          for (const id of m.players.keys()) if (pidIp.get(id) === ip) mine++
          if (mine >= MAX_PIDS_PER_IP) return reply({ ok: false, error: 'too many players from this address' }, 429)
        }
        pidIp.set(t.pid, ip)
        log({ url, ua: 'halo', pid: t.pid, pos: t.pos, events: t.events })
        // the side is the server's to decide once the choice dialogue is on: a client-supplied side is only honoured in the old test mode
        pulse.claim(t.pid, t.pos, t.speed) // log-only cross-check against what the Synth sees over Pulse
        const p = m.upsertPlayer(t.pid, { name: t.name, side: CONFIG.choiceDialogue ? undefined : t.side, pos: t.pos, speed: t.speed })
        for (const e of t.events) {
          if (e.ev === 'plume') m.plume(t.pid, t.pos)
          if (e.ev === 'probe') { try { fs.appendFileSync(path.join(LOGDIR, 'halo-probes.jsonl'), JSON.stringify({ t: new Date().toISOString(), pid: t.pid.slice(0, 10), what: e.what, text: e.text }) + String.fromCharCode(10)) } catch {} }
          if (e.ev === 'trap') m.placeTrap(t.pid, t.pos) // E: the Discharge Trap, placed where the player stands
          if (e.ev === 'choice') m.choose(t.pid, String(e.pick))
          if (e.ev === 'replay') m.replay(e.kind === 'round' ? 'round' : 'again', Number(e.round ?? 1))
        }
        return reply({ ok: true, state: m.snapshot(p.id), idle: false, ...halo.forTick(t.pid, t.sv) })
      }
      if (url === '/halo/state' && req.method === 'GET') {
        const pvq = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('pv'))
        return reply({ ok: true, ...halo.publicState(Number.isFinite(pvq) ? pvq : undefined) }) // no player data either way
      }
      // Admin and debug routes: only when a separate admin token is set (or the local DEV mode on loopback); a wrong token counts against the address.
      if (ADMIN_ROUTES.has(url)) {
        if (!DEV && !ADMIN_TOKEN) return reply({ ok: false, error: 'not found' }, 404)
        if (ADMIN_TOKEN) {
          if (authFail.limited(ip)) return reply({ ok: false, error: 'rate limited' }, 429)
          if (!safeEqual(req.headers['x-emanate-admin'] as string | undefined, ADMIN_TOKEN)) { authFail.take(ip); return reply({ ok: false, error: 'forbidden' }, 403) }
        }
      }
      if (url === '/bridge/sync' && req.method === 'POST') {
        // the PC's Synth bridge: position and events in, queued Synth commands out (token required; off unless EMANATE_SYNTH=bridge and a token is set)
        if (!bridge) return reply({ ok: false, error: 'bridge not enabled' }, 404)
        if (authFail.limited(ip)) return reply({ ok: false, error: 'rate limited' }, 429)
        if (!bridge.authorized(req.headers['x-emanate-bridge'] as string | undefined)) { bridge.rejected++; authFail.take(ip); return reply({ ok: false, error: 'forbidden' }, 403) }
        if (!bridgeLimit.take('bridge')) return reply({ ok: false, error: 'rate limited' }, 429)
        const sync = parseSync(j)
        if (!sync) return reply({ ok: false, error: 'bad sync' }, 400)
        // replay protection: a sync whose sequence number does not increase is refused (the bridge counts up from the clock)
        if (sync.seq !== null) {
          if (sync.seq <= bridge.lastSeq) return reply({ ok: false, error: 'stale sequence' }, 409)
          bridge.lastSeq = sync.seq
        }
        if (sync.pos) m.feedSynth(sync.pos)
        for (const ev of sync.events) onSynthEvent(ev)
        return reply({ ok: true, commands: bridge.drain(), t: Date.now() })
      }
      if (url.startsWith('/audio/') && req.method === 'GET') {
        if (url === '/audio/manifest.json') return reply(buildManifest(AUDIO_DIR, publicBase(process.env.EMANATE_PUBLIC_URL, req.headers.host, port)))
        const seg = url.startsWith('/audio/files/') ? decodeSegment(url.slice('/audio/files/'.length)) : null
        const f = seg ? readAudioFile(AUDIO_DIR, seg) : null
        if (!f) return reply({ ok: false, error: 'not found' }, 404)
        res.writeHead(200, { 'content-type': f.type, 'cache-control': 'public, max-age=300' })
        return void res.end(f.body)
      }
      if (url === '/pulsecheck') return reply({ on: pulseOn, cfg: pulse.cfg, stats: pulse.stats(), flagged: pulse.rows.filter((r) => r.flagged).slice(-40), recent: pulse.rows.slice(-20) })
      if (url === '/synthbrain') return reply({ flights: brain.flightLog.slice(-30), state: brain.state, insideBuilt: brain.insideBuilt, exposure: m.synthExposure, cfg: brain.cfg, trace: brainTrace.slice(-200), nav: navLog.slice(-300), glideLog: brain.glideLog.slice(-100), fleeLog: brain.fleeLog.slice(-60), navSpots: brain.navSpots.length, navAgeMs: Date.now() - brain.navAt, navFrom: brain.navFrom, navUse: brain.navUse })
      if (url === '/roam') return reply({ on: roamOn, state: roam.state, target: roam.target?.addr ?? null, whispers: roam.whispers, chats: roam.chats, memory: memory.counts(), spots: [...spots, ...injectedSpots], events, people, log: roam.log.slice(-40) })
      if (url === '/state') return reply({ match: { mode: m.mode, synthLevel: m.synthLevel, round: m.round, state: m.state, wins: m.wins, timeLeft: m.timeLeft(), synth: m.synth, charge: { stage: m.charge.stage }, players: [...m.players.values()].map((p) => ({ id: p.id, side: p.side, pos: p.pos, plumesLeft: p.plumesLeft })), drops: m.drops, plumes: m.plumes, endgame: m.endgame }, synthSource, bridge: bridge ? { lastSeenMsAgo: bridge.lastSeen ? Date.now() - bridge.lastSeen : null, syncs: bridge.syncs, rejected: bridge.rejected, pending: bridge.pending() } : null, unconfirmed: UNCONFIRMED, log: m.log.slice(-40) })
      if (url === '/admin' && req.method === 'POST') {
        switch (j?.cmd) {
          case 'mode': m.setMode(j.mode); break
          case 'reset': m = makeMatch(j.mode ?? m.mode); break
          case 'synth-level': m.synthLevel = Math.max(0, Math.min(3, Number(j.level) || 0)); brain.invalidateNav(); break // test control: the Synth's own power level
          case 'synth': m.setSynth({ x: j.x, y: j.y ?? 0, z: j.z }); break
          case 'deadzones': (m as any).d.deadZones = new ParcelSet(j.parcels ?? []); break // test: Zone has none deployed
          case 'spots': injectedSpots = (j.spots ?? []).map((x: any) => ({ x: x.x, z: x.z, count: x.count ?? 3, source: 'admin' })); break // test: Zone's stats service has nobody on it
          case 'events': injectedEvents = (j.events ?? []).length ? (j.events as any[]).map((x: any) => ({ x: x.x, z: x.z })) : null; break
          case 'brain-config': Object.assign(brain.cfg, j.config ?? {}); brain.reset(); break
          case 'forget': { // round 22: delete one address everywhere the server keeps it (memory, probe file, the live match); the answer says what was removed
            const a = String(j.addr ?? '').toLowerCase()
            if (!/^0x[0-9a-f]{40}$/.test(a)) return reply({ ok: false, error: 'address' }, 400)
            const live = m.players.delete(a) ? 1 : 0
            halo.forget(a)
            return reply({ ok: true, removed: { live, ...memory.forget(a), probeLines: forgetInProbes(path.join(LOGDIR, 'halo-probes.jsonl'), a) } })
          }
          case 'synth-cmd': sendSynthCommand(j.command ?? {}); break // test control: a raw command for the real Synth (through the bridge queue when the Synth is remote)
          case 'halo-settings': { // round 23: override the halo's tunables ({set:{power:{runSpeed:18}}}), or {reset:true}
            if (j.reset) halo.reset()
            return reply({ ok: true, accepted: halo.set(j.set), sv: halo.sv, overrides: halo.overrides })
          }
          case 'halo-cmd': return reply({ ok: halo.command(String(j.to ?? 'all'), j.command), queued: true }) // a command for one wearer's address or 'all'
          case 'halo-idle': halo.idle = j.on !== false; return reply({ ok: true, idle: halo.idle })
          case 'halo-policy': halo.policy = { minPv: Math.max(0, Math.min(99, Number(j.minPv) || 0)), message: typeof j.message === 'string' ? j.message.slice(0, 160) : halo.policy.message }; return reply({ ok: true, policy: halo.policy })
          case 'halo-versions': return reply({ ok: true, versions: Object.fromEntries(halo.versions), sv: halo.sv, idle: halo.idle, policy: halo.policy })
          case 'memory-played': memory.recordPlayed(j.addr, j.side, j.outcome ?? 'test', Date.now()); break
          case 'roam-reset': roam.state = 'roam'; roam.target = null; roam.spot = null; roam.greeted.clear(); roam.personCooldown.clear(); roam.gatheringCooldown.clear(); roam.log.length = 0; roam.whispers = 0; roam.chats = 0; break
          case 'round-config': Object.assign(CONFIG, j.config ?? {}); break // shorten the round clock etc. for tests
          case 'end-match': (m as any).finish(j.winner ?? 'hunters'); break // test: jump to the Ending so the replay menu can be reached
          case 'roam-config': Object.assign(roam.cfg, j.config ?? {}); break
          case 'teleport': for (const p of [...m.players.values()]) if (!j.pid || p.id === j.pid) m.teleportPlayer(p.id, { x: j.x, y: j.y ?? 0, z: j.z }, String(j.tag ?? 'admin')); break // test: ask the halo for one movePlayerTo
          case 'drop': m.addDrop(j.kind ?? 'plume', { x: j.x, y: j.y ?? 0, z: j.z }); break
          case 'sim':
            if (sim) clearInterval(sim)
            sim = simSynth((p) => m.feedSynth(p), { x: j.x ?? 0, y: j.y ?? 0, z: j.z ?? 0 }, j.r ?? 60)
            synthSource = 'sim'
            break
          case 'wsl-synth':
            tailWslSynth((p) => m.feedSynth(p), undefined, onSynthEvent)
            synthSource = 'wsl'
            break
        }
        return reply({ ok: true })
      }
      // Part 1 telemetry log (kept for local testing only): on a public server an unknown path is a plain 404
      if (!DEV) return reply({ ok: false, error: 'not found' }, 404)
      log({ method: req.method, url, ua: req.headers['user-agent'], origin: req.headers.origin, body: j })
      reply({ ok: true, t: Date.now() })
     } catch (e) {
      // never a stack trace or message to the client
      console.error('[error]', route.slice(0, 80), String((e as Error)?.message ?? e).slice(0, 200))
      if (!res.headersSent) reject(res, 500, 'internal error')
      else res.end()
     }
    })
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 10_000
  server.keepAliveTimeout = 5_000
  server.maxConnections = 500
  // minimal WebSocket handshake: only used to test whether a wearable may open a WebSocket
  server.on('upgrade', (req, socket) => {
    if (!DEV) return void socket.destroy() // the halo is fetch-only: no WebSocket on a public server
    const key = String(req.headers['sec-websocket-key'] ?? '')
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + accept, '', ''].join('\r\n'))
    log({ method: 'WS-UPGRADE', url: req.url, origin: req.headers.origin })
    socket.on('data', (d) => log({ method: 'WS-DATA', bytes: d.length }))
    socket.on('error', () => {})
  })
  server.listen(port, HOST)
  if (process.env.EMANATE_SYNTH === 'wsl') {
    tailWslSynth((p) => m.feedSynth(p), undefined, onSynthEvent)
    synthSource = 'wsl'
  } else if (process.env.EMANATE_SYNTH === 'bridge') {
    if (bridge) {
      setSynthTransport((cmd) => bridge.push(cmd))
      synthSource = 'bridge'
    } else console.error('EMANATE_SYNTH=bridge needs EMANATE_BRIDGE_TOKEN: the bridge is NOT enabled')
  }
  // ---- the roaming Synth (entry portal, stage 1, no AI). EMANATE_SYNTH_ROAM=on; it runs while no match has players ----
  const roamOn = process.env.EMANATE_SYNTH_ROAM === 'on'
  const memory = new Memory(path.join(ROOT, 'data', 'memory.json'))
  const halo = new HaloControl()
  // round 24: standing halo settings from the environment (a JSON object, for example {"fx":{"plumePuffs":48}}): they survive a restart; admin halo-settings changes them live
  try { if (process.env.EMANATE_HALO_SETTINGS) halo.set(JSON.parse(process.env.EMANATE_HALO_SETTINGS)) } catch (e) { console.error('[halo settings] ignored: not valid JSON') }
  // round 22: the retention the privacy notice promises (probe file 30 days, play records 90 days): at start and then daily
  const PROBE_FILE = path.join(LOGDIR, 'halo-probes.jsonl')
  const purgeAll = () => { try { const r = { probeLines: purgeProbes(PROBE_FILE, Date.now()), memory: memory.purge(Date.now()) }; if (r.probeLines || r.memory) console.log(JSON.stringify({ t: Date.now(), purged: r })) } catch (e) { console.error('[purge]', String((e as Error)?.message ?? e)) } }
  purgeAll()
  setInterval(purgeAll, 86_400_000).unref()
  const roam = new RoamBrain(Date.now, Math.random, memory)
  let spots: Spot[] = []
  let injectedSpots: Spot[] = []
  let events: LiveEvent[] = []
  let injectedEvents: LiveEvent[] | null = null // test: admin-set events that the 30 s public refresh must not overwrite
  let people: Person[] = []
  let chats: ChatMsg[] = []
  const STATS = process.env.EMANATE_STATS_URL ?? 'https://peer.decentraland.zone/stats/parcels'
  const EVENTS = process.env.EMANATE_EVENTS_URL ?? 'https://events.decentraland.zone/api/events?limit=50'
  const refreshPublic = () => {
    fetchJson(STATS).then((j) => (spots = parseStats(j))).catch(() => {})
    fetchJson(EVENTS).then((j) => (events = parseEvents(j))).catch(() => {})
  }
  if (roamOn) {
    refreshPublic()
    setInterval(refreshPublic, 30000).unref()
    setInterval(() => {
      if (!realSynth() || m.players.size > 0) return
      sendSynthCommand({ cmd: 'players' })
      const cmds = roam.step(m.synth, [...spots, ...injectedSpots], people, chats.splice(0), injectedEvents ?? events)
      for (const c of cmds) sendSynthCommand(c.cmd === 'chat' ? { cmd: 'chat', text: c.text } : c)
    }, 3000).unref()
  }
  function onSynthEvent(ev: any) {
    if (ev.event === 'players') people = (ev.players ?? []).filter((p: any) => p.address && p.position).map((p: any) => ({ addr: p.address, pos: { x: p.position[0], y: p.position[1], z: p.position[2] } }))
    if (ev.event === 'track' && ev.address && Array.isArray(ev.position)) pulse.seen(String(ev.address), { x: ev.position[0], y: ev.position[1], z: ev.position[2] })
    if (ev.event === 'chat') chats.push({ from: ev.from, text: ev.text })
    // Synth navigation: the reachable-spot list feeds the brain's hiding choices; glide answers drive its fallbacks; every nav/glide event is kept for the route log
    if (ev.event === 'nav_spots' && Array.isArray(ev.spots)) brain.setNavSpots(ev.spots, Date.now(), Array.isArray(ev.from) ? { x: ev.from[0], z: ev.from[2] } : null)
    if (ev.event === 'glide') brain.onGlide(ev)
    if (ev.event === 'nav') brain.onNav(ev)
    if (ev.event === 'fly') brain.onFly(ev)
    if (ev.event === 'nav' || ev.event === 'fly' || ev.event === 'glide' || ev.event === 'blocked' || ev.event === 'arrived') {
      navLog.push({ t: Date.now(), ...ev })
      if (navLog.length > 600) navLog.splice(0, navLog.length - 600)
    }
  }
  // Pulse cross-check (identity b): LOG ONLY. The Synth streams every player it sees over Pulse (`track`); each is compared with the position that player's halo claims.
  // EMANATE_PULSECHECK=on switches the stream and the log file on. Nothing here blocks, kicks or changes the game.
  const pulse = new PulseCheck(Date.now)
  const pulseOn = process.env.EMANATE_PULSECHECK === 'on'
  const pulseLog = process.env.EMANATE_PULSELOG ?? path.join(ROOT, '..', 'docs', 'records', 'b04-pulse-crosscheck.log')
  if (pulseOn) {
    if (process.env.EMANATE_PULSE_RADIUS) pulse.cfg.viewRadius = Number(process.env.EMANATE_PULSE_RADIUS)
    const w = (line: string) => { try { fs.appendFileSync(pulseLog, line + String.fromCharCode(10)) } catch {} }
    w(`# pulse cross-check started ${new Date().toISOString()} (log only; view radius ${pulse.cfg.viewRadius} m, base tolerance ${pulse.cfg.baseTolerance} m, speed factor ${pulse.cfg.speedFactor})`)
    pulse.onRow = (r: PulseRow) => { if (r.flagged) w(JSON.stringify(r)) }
    setInterval(() => { if (realSynth()) sendSynthCommand({ cmd: 'track', on: true }) }, 30_000).unref()
    setTimeout(() => { if (realSynth()) sendSynthCommand({ cmd: 'track', on: true }) }, 2000).unref()
    setInterval(() => { pulse.sweep(m.synth) }, 1000).unref()
    setInterval(() => w('# stats ' + new Date().toISOString() + ' ' + JSON.stringify(pulse.stats())), 30_000).unref()
  }
  let lastStage = 'free'
  let lastSynthLevel = -1
  let lastLevelSent = 0
  let lastRound = 0
  const brain = new SynthBrain(Date.now, Math.random, undefined, loadWorld())
  let lastBrainState = ''
  setInterval(() => {
    if (brain.state !== lastBrainState) {
      lastBrainState = brain.state
      brainTrace.push({ t: Date.now(), state: brain.state, x: Math.round(m.synth.x), z: Math.round(m.synth.z), insideBuilt: brain.insideBuilt })
    }
  }, 200).unref()
  brain.navUse = process.env.EMANATE_SYNTH_NAV === 'on' // the Synth client's nav_to / nav_spots / glide commands (needs the Bevy Synth built with them)
  const aiOn = process.env.EMANATE_SYNTH_AI === 'on'
  let aiTick = 0
  setInterval(() => {
    for (const id of pidIp.keys()) if (!m.players.has(id)) pidIp.delete(id) // forget players who left
    m.advance()
    // the basic Synth brain (opt-in): run, hide, wander, frozen when charged
    if (aiOn && realSynth() && m.state === 'playing' && ++aiTick % 2 === 0) {
      brain.level = m.synthLevelNow()
      const cmd = brain.step(m.synth, [...m.players.values()].map((p) => p.pos), m.synthStage())
      m.synthExposure = exposureFactor(brain.state === 'hide' && brain.insideBuilt, brain.cfg as any)
      if (cmd) sendSynthCommand({ ...cmd, ...('x' in cmd && !('y' in cmd && (cmd as any).y !== undefined) ? { y: m.synth.y } : {}) }) // a goal's own height (a rooftop, a platform) must survive: it used to be overwritten with the Synth's current height
      if (aiOn && !cmd && brain.queue.length === 0) { /* nothing to send */ }
    }
    // tell the real Synth where it was moved to, and freeze it in Repair/Upgrade Mode
    // a new look for the Synth each round (needs the Bevy Synth built with the `wear` command)
    if (m.round !== lastRound && realSynth() && process.env.EMANATE_SYNTH_LOOKS !== 'off') {
      lastRound = m.round
      sendSynthCommand({ cmd: 'wear', items: lookForRound(m.round) })
    } else if (m.round !== lastRound) lastRound = m.round
    for (const t of m.synthTeleports.splice(0)) {
      brain.reset()
      if (realSynth()) sendSynthCommand({ cmd: 'move', x: t.x, y: m.synth.y, z: t.z })
    }
    for (const r of m.rifts.splice(0)) {
      // round 24: the Rift at the trigger (see rift.ts): the halo draws the portal and the smoke column; the Synth steps into it and is gone
      const plan = planRift(r, Number(halo.overrides.power?.ceiling ?? 200))
      for (const c of plan.halo) halo.command('all', c)
      m.note('rift', { kind: r.kind, x: Math.round(plan.centre.x), y: Math.round(plan.centre.y), z: Math.round(plan.centre.z) })
      if (realSynth()) for (const st of plan.synth) setTimeout(() => sendSynthCommand(st.cmd as any), st.afterMs).unref()
    }
    for (const line of m.synthSays.splice(0)) if (realSynth()) sendSynthCommand({ cmd: 'chat', text: line }) // the Synth speaks (the lobby call)
    const stageNow = m.synthStage()
    if (stageNow !== lastStage) {
      if (realSynth() && (stageNow === 'repair' || stageNow === 'upgrade')) sendSynthCommand({ cmd: 'stop' })
      lastStage = stageNow
    }
    // the Synth's power level (0 normal, 1 Speed, 2 Jump, 3 Fly; a trap hit lowers it for a while): sent when it changes and now and then
    const lvNow = m.synthLevelNow()
    if (realSynth() && (lvNow !== lastSynthLevel || Date.now() - lastLevelSent > 20_000)) {
      sendSynthCommand({ cmd: 'level', level: lvNow })
      if (lvNow !== lastSynthLevel) brain.invalidateNav()
      lastSynthLevel = lvNow
      lastLevelSent = Date.now()
    }
  }, 250).unref()
  return server
}

function safeJson(s: string): unknown {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return s.slice(0, 500)
  }
}

if (import.meta.main) {
  startServer()
  console.log(`emanate game server on http://${HOST}:${PORT}  (mode ${process.env.EMANATE_MODE ?? 'solo'}, synth ${process.env.EMANATE_SYNTH ?? 'none'})`)
}
