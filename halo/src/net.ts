// Telemetry + game sync with the local Emanate game server (127.0.0.1:8787). Build 04.
// The halo's console.log never reaches Player.log, so every event goes to the server. Plain `fetch` over http to
// 127.0.0.1 works from a wearable (needs USE_FETCH in requiredPermissions). signedFetch is NOT available here.
import { Vec } from './logic'

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
  if (ev === 'error') lastGameError = String(data.where ?? '') + ': ' + String(data.msg ?? '').slice(0, 110)
  log.push({ ev, seq: seq++, ...data })
  if (log.length > 300) log = log.slice(-300)
}
export function sendGameEvent(e: Record<string, unknown>) {
  out.push(e)
}
export const serverUp = () => clock - lastOk < 3

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
  if (j.settings && typeof j.settings === 'object') { resetToDefaults(); settingsApplied = applyRemote(j.settings) } // the server sends its COMPLETE set of overrides when the halo's sv differs: start from the defaults, so a removed override falls back
  if (Array.isArray(j.cmds)) for (const c of j.cmds.slice(0, 40)) if (c && typeof c === 'object') cmdQueue.push(c)
  if (j.refuse === true) { idle = true; refusedNote = typeof j.message === 'string' ? j.message.slice(0, 160) : TEXT.refused ?? '' }
  else if (j.idle === true) idle = true
  else if (j.idle === false) { idle = false; refusedNote = '' }
}
export function netUpdate(dt: number, info: TickInfo) {
  clock += dt
  if (idle) {
    // IDLE: nothing about the player is sent. A bare GET with no player field asks whether to wake up.
    idleAcc += dt
    if (idleAcc >= TICK.idlePollSec && !idleBusy) {
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
