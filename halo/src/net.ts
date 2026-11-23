// Telemetry + game sync with the Emanate game server (the address is in server-url.ts). Build 04.
// The halo's console.log never reaches Player.log, so every event goes to the server. Plain `fetch` over http to
// A wearable may fetch https addresses only (needs USE_FETCH in requiredPermissions). signedFetch is NOT available here.
import type { Vec } from './logic'

import { SERVER_URL } from './server-url'
import { applyRemote, resetToDefaults, TICK, TEXT, PROTOCOL_VERSION, BUILD_ID } from './settings'
export const SERVER = SERVER_URL // the committed default is the local dev server; halo-tools/build_halo.py swaps it for the real address at build time only

let seq = 0
let log: Record<string, unknown>[] = []
let out: Record<string, unknown>[] = [] // game events for the server (plume, use)
let acc = 0
let inFlight = false
let lastOk = -1e9
let clock = 0
export let serverState: any = null
export let lastErr = ''
let tickCount = 0
let failCount = 0
// ---- round 23: the thin-client channel ----
// settings version the halo holds (0 = built-in defaults); the server sends its overrides when this differs from its own
let sv = 0
// ---- c26 (gate B): consent, lease and opt-out live ONLY here and in the Halo's own key handling; no server value, setting or command can set them ----
export let consent = false // set by the wearer: inside the bubble, hold E for 1.5 s (game.ts). Until then NOTHING about the player is sent.
export let optOut = false // set by the wearer: hold Ctrl+Shift+E for 1 s. Wins over everything; nothing is sent; resets only when the Halo is worn again.
export let paused = false // set while the wearer HOLDS Ctrl+Shift+E (game.ts): forces and sending pause at once; releasing before 3 s resumes; 3 s makes optOut permanent
export function setPaused(v: boolean) { if (optOut) return; paused = v }
let leaseUntil = -1 // Halo clock: the server's grant on a valid tick reply (20 s at most) lets powers run until then
export const LEASE_MAX = 20
export const leaseValid = () => clock < leaseUntil
export interface BareFx { trails: { x: number; y: number; z: number }[]; blasts: { x: number; y: number; z: number; age: number }[]; call: { seq: number; x: number; y: number; z: number; radius: number; left: number; far: number } | null; replay: { left: number; radius: number; hunters: { x: number; y: number; z: number }; helpers: { x: number; y: number; z: number } } | null }
export const bareFx: BareFx = { trails: [], blasts: [], call: null, replay: null } // c27: what the server shows every Halo without any player data: recent launches and the call
export const bare: { lobby: boolean; bubble: { x: number; y: number; z: number; radius: number } | null } = { lobby: false, bubble: null }
export function grantConsent() { if (optOut) return; consent = true; log = []; out = [] }
export function doOptOut() { optOut = true; consent = false; leaseUntil = -1; log = []; out = []; serverState = null }
export let idle = false // the server's kill switch: send nothing about the player, show nothing
export let refusedNote = '' // set when the server refuses this build
export const cmdQueue: Record<string, unknown>[] = [] // commands from the server, handled by game.ts (unknown ones are ignored there)
let settingsApplied = 0
export const settingsInfo = () => `sv ${sv}, ${settingsApplied} values from the server, build ${BUILD_ID}, protocol ${PROTOCOL_VERSION}`
export function setIdle(v: boolean) { idle = v; if (!v) refusedNote = '' }
export function refetchSettings() { sv = -1 } // the next tick asks for the server's settings again
let idleAcc = 0
let idleBusy = false

export let lastGameError = ''
export function emit(ev: string, data: Record<string, unknown> = {}) {
  if (!consent || optOut || paused) { if (ev === 'error') lastGameError = String(data.where ?? '') + ': ' + String(data.msg ?? '').slice(0, 110); return } // c26: nothing is kept for sending before consent
  if (ev === 'error') lastGameError = String(data.where ?? '') + ': ' + String(data.msg ?? '').slice(0, 110)
  log.push({ ev, seq: seq++, ...data })
  if (log.length > 300) log = log.slice(-300)
}
export function sendGameEvent(e: Record<string, unknown>) {
  if (!consent || optOut || paused) return
  out.push(e)
}
// c27: before consent the halo only makes the bare check every 3 s, so 'up' must last longer than that (c26 judged 'no server' between checks and showed TEST MODE with Tier 1 sprint outside the game)
export const serverUp = () => clock - lastOk < (consent ? 3 : 10)

export interface TickInfo {
  pid: string
  name: string
  pos: Vec // world
  local: Vec // as the scene sees it (for checking the origin offset)
  speed: number
  tier: number
  side?: string
}
function handleReply(j: any) {
  if (!j || typeof j !== 'object') return
  if (typeof j.sv === 'number') sv = j.sv
  if (typeof j.lease === 'number' && j.lease > 0 && consent && !optOut) leaseUntil = clock + Math.min(LEASE_MAX, j.lease) // c26: the grant is only taken after the wearer's own consent
  if (Array.isArray(j.trails)) bareFx.trails = j.trails.slice(0, 12).filter((b: any) => b && [b.x, b.y, b.z].every((v: unknown) => typeof v === 'number' && Number.isFinite(v))).map((b: any) => ({ x: b.x, y: b.y, z: b.z })) // c29e: positions of players in the air after a blast (no name, no address)
  if (Array.isArray(j.blasts)) bareFx.blasts = j.blasts.slice(0, 30).filter((b: any) => b && [b.x, b.y, b.z, b.age].every((v: unknown) => typeof v === 'number' && Number.isFinite(v))).map((b: any) => ({ x: b.x, y: b.y, z: b.z, age: b.age }))
  if ('call' in j) { const c = j.call; bareFx.call = c && typeof c === 'object' && [c.seq, c.x, c.y, c.z, c.radius, c.left, c.far].every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ? { seq: c.seq, x: c.x, y: c.y, z: c.z, radius: Math.max(2, Math.min(60, c.radius)), left: Math.max(0, Math.min(300, c.left)), far: Math.max(10, Math.min(500, c.far)) } : null }
  if ('replay' in j) { // c30: the two replay portals (hunters purple, helpers gold) while the ending's countdown runs: no player data, so a wearer who never joined sees them too
    const r = j.replay, ok = (v: any) => v && [v.x, v.y, v.z].every((q: unknown) => typeof q === 'number' && Number.isFinite(q))
    bareFx.replay = r && typeof r === 'object' && typeof r.left === 'number' && typeof r.radius === 'number' && ok(r.hunters) && ok(r.helpers) ? { left: Math.max(0, Math.min(120, r.left)), radius: Math.max(1, Math.min(30, r.radius)), hunters: { x: r.hunters.x, y: r.hunters.y, z: r.hunters.z }, helpers: { x: r.helpers.x, y: r.helpers.y, z: r.helpers.z } } : null
  }
  if (typeof j.lobby === 'boolean') { bare.lobby = j.lobby; const b = j.bubble; bare.bubble = b && typeof b === 'object' && [b.x, b.y, b.z, b.radius].every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ? { x: b.x, y: b.y, z: b.z, radius: b.radius } : null }
  if (j.settings && typeof j.settings === 'object') { resetToDefaults(); settingsApplied = applyRemote(j.settings) } // the server sends its COMPLETE set of overrides when the halo's sv differs: start from the defaults, so a removed override falls back
  if (Array.isArray(j.cmds)) for (const c of j.cmds.slice(0, 40)) if (c && typeof c === 'object') cmdQueue.push(c)
  if (j.refuse === true) { idle = true; refusedNote = typeof j.message === 'string' ? j.message.slice(0, 160) : TEXT.refused ?? '' }
  else if (j.idle === true) idle = true
  else if (j.idle === false) { idle = false; refusedNote = '' }
}
export function netUpdate(dt: number, info: TickInfo) {
  clock += dt
  if (optOut || paused) return // c26: the wearer's own off switch (held: paused, 3 s: permanent): nothing is sent, nothing is asked
  if (idle || !consent) {
    // IDLE (the kill switch) or NOT YET JOINED (c26): nothing about the player is sent. A bare GET with no player field asks whether to wake up / where the lobby bubble is.
    idleAcc += dt
    if (idleAcc >= (idle ? TICK.idlePollSec : Math.min(TICK.idlePollSec, 3)) && !idleBusy) {
      idleAcc = 0
      idleBusy = true
      fetch(SERVER + '/halo/state?pv=' + PROTOCOL_VERSION + '&v=' + BUILD_ID)
        .then((r) => r.json())
        .then((j: any) => { idleBusy = false; lastOk = clock; handleReply(j) })
        .catch(() => { idleBusy = false })
    }
    return
  }
  acc += dt
  if (acc < TICK.everySec || inFlight) return
  acc = 0
  inFlight = true
  const batchLog = log
  const batchOut = out
  log = []
  out = []
  const body = JSON.stringify({ ...info, events: batchOut, log: batchLog, n: tickCount++, v: BUILD_ID, pv: PROTOCOL_VERSION, sv })
  fetch(SERVER + '/tick', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((r) => {
      if (!r.ok) throw new Error('http ' + r.status)
      return r.json()
    })
    .then((j: any) => {
      inFlight = false
      lastOk = clock
      failCount = 0
      lastErr = '' // c30d: a good reply clears the last error ("Error: http 502" stayed on the HUD after a server restart)
      handleReply(j)
      if (j && j.state) serverState = j.state
    })
    .catch((e) => {
      inFlight = false
      failCount++
      lastErr = String(e).slice(0, 120)
      log = batchLog.concat(log).slice(-300) // keep the events for the next try
      out = batchOut.concat(out).slice(-50)
    })
}

export function netStatus() {
  return { up: serverUp(), lastErr, failCount }
}

// Audio manifest from the server: which slots have a recording there. Polled every 30 s while the server is up.
// (Whether an equipped wearable may play an audio clip from a web address is untested; the fallback chain covers it.)
let manifestTimer = 0
let manifestBusy = false
export let manifestInfo = 'audio: not fetched'
export function manifestUpdate(dt: number, apply: (m: Record<string, string>) => void) {
  manifestTimer += dt
  if (manifestTimer < 30 || manifestBusy || !serverUp()) return
  manifestTimer = 0
  manifestBusy = true
  fetch(SERVER + '/audio/manifest.json')
    .then((r) => r.json())
    .then((j: any) => {
      manifestBusy = false
      const map: Record<string, string> = {}
      for (const s of j.slots ?? []) if (s.available && s.url) map[s.id] = s.url
      apply(map)
      manifestInfo = `audio: server has ${j.recorded}/${j.total}`
    })
    .catch((e) => {
      manifestBusy = false
      manifestInfo = 'audio: manifest ' + String(e).slice(0, 40)
    })
}
