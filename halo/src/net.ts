// Telemetry + game sync with the local Emanate game server (127.0.0.1:8787). Build 04.
// The halo's console.log never reaches Player.log, so every event goes to the server. Plain `fetch` over http to
// 127.0.0.1 works from a wearable (needs USE_FETCH in requiredPermissions). signedFetch is NOT available here.
import { Vec } from './logic'

export const SERVER = 'http://127.0.0.1:8787'
const TICK_EVERY = 0.25 // s

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
export function netUpdate(dt: number, info: TickInfo) {
  clock += dt
  acc += dt
  if (acc < TICK_EVERY || inFlight) return
  acc = 0
  inFlight = true
  const batchLog = log
  const batchOut = out
  log = []
  out = []
  const body = JSON.stringify({ ...info, events: batchOut, log: batchLog, n: tickCount++ })
  fetch(SERVER + '/tick', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((r) => {
      if (!r.ok) throw new Error('http ' + r.status)
      return r.json()
    })
    .then((j: any) => {
      inFlight = false
      lastOk = clock
      failCount = 0
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

export function probeWebSocket() {} // removed: the halo is fetch-only (it polls /tick); kept as a no-op for callers

// Equipped-wearable diagnostics: which local transports a portable experience may use, shown on the HUD.
export let probeText = 'probe: pending'
const probeRes: Record<string, string> = {}
const showProbe = () => (probeText = 'probe: ' + Object.entries(probeRes).map(([k, v]) => k + '=' + v).join(' '))
export function probeAll() {
  const targets: [string, string][] = [
    ['f127', 'http://127.0.0.1:8787/probe/f127'],
    ['flocal', 'http://localhost:8787/probe/flocal']
  ]
  for (const [k, url] of targets) {
    probeRes[k] = '...'
    fetch(url, { method: 'POST', body: '{}' }).then(
      (r) => { probeRes[k] = 'ok' + r.status; showProbe() },
      (e) => { probeRes[k] = 'ERR:' + String(e).slice(0, 40); showProbe() }
    )
  }
  showProbe()
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
