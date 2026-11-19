// Public-exposure hardening for the game server: rate limits, strict input schemas, constant-time token checks and client-IP handling.
// Pure functions and small classes (no I/O) so they can be unit-tested; server.ts wires them in. See docs/EMANATE-SERVER-SECURITY-REVIEW.md.
import crypto from 'node:crypto'
import type { Vec } from './geo.ts'

// ---------------- rate limiting ----------------
// A token bucket per key: `rate` tokens per second up to `burst`. Idle keys are forgotten so a flood of random keys cannot grow memory without bound.
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>()
  private lastSweep = 0
  rate: number
  burst: number
  maxKeys: number
  private now: () => number
  constructor(rate: number, burst: number, now: () => number = Date.now, maxKeys = 20_000) {
    this.rate = rate
    this.burst = burst
    this.now = now
    this.maxKeys = maxKeys
  }
  // true = allowed (and one token spent), false = limited
  take(key: string, cost = 1): boolean {
    const t = this.now()
    this.sweep(t)
    let b = this.buckets.get(key)
    if (!b) {
      if (this.buckets.size >= this.maxKeys) return false // table full: refuse new keys rather than grow
      b = { tokens: this.burst, at: t }
      this.buckets.set(key, b)
    }
    b.tokens = Math.min(this.burst, b.tokens + ((t - b.at) / 1000) * this.rate)
    b.at = t
    if (b.tokens < cost) return false
    b.tokens -= cost
    return true
  }
  // is the key currently out of tokens (without spending)?
  limited(key: string): boolean {
    const b = this.buckets.get(key)
    if (!b) return false
    const tokens = Math.min(this.burst, b.tokens + ((this.now() - b.at) / 1000) * this.rate)
    return tokens < 1
  }
  size() {
    return this.buckets.size
  }
  private sweep(t: number) {
    if (t - this.lastSweep < 5000) return
    this.lastSweep = t
    const idle = (this.burst / Math.max(this.rate, 1e-9)) * 1000 * 2 // a bucket idle for two refill times is full again: drop it
    for (const [k, b] of this.buckets) if (t - b.at > idle) this.buckets.delete(k)
  }
}

// ---------------- client identity ----------------
// Behind Caddy the real client is the LAST address in X-Forwarded-For (Caddy appends the peer it saw; earlier entries are client-supplied and not trusted).
// Without EMANATE_TRUST_PROXY the socket address is used and the header is ignored (so a direct client cannot pick its own key).
export function clientIp(socketAddr: string | undefined, xff: string | string[] | undefined, trustProxy: boolean): string {
  if (trustProxy && xff) {
    const raw = Array.isArray(xff) ? xff.join(',') : xff
    const last = raw.split(',').pop()?.trim()
    if (last && last.length <= 64 && /^[0-9a-fA-F:.]+$/.test(last)) return last
  }
  return socketAddr ?? 'unknown'
}

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false
  const x = crypto.createHash('sha256').update(a).digest()
  const y = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(x, y)
}

// ---------------- schemas ----------------
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const WORLD_LIMIT = 100_000 // metres from the origin: Genesis is about +-2,400, worlds and far land stay well inside
const PID = /^[A-Za-z0-9_.:@-]{1,64}$/

// drop control, zero-width and bidi-override characters (a name is shown to other players), trim, cap at 32 characters
function printable(code: number): boolean {
  if (code < 32 || (code >= 127 && code <= 159)) return false
  if (code >= 0x200b && code <= 0x200f) return false
  if (code >= 0x2028 && code <= 0x202f) return false
  if (code >= 0x2066 && code <= 0x2069) return false
  return true
}
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  let out = ''
  for (const ch of v.slice(0, 200)) if (printable(ch.codePointAt(0)!)) out += ch
  out = out.trim().slice(0, 32)
  return out || undefined
}

export function cleanPos(v: any): Vec | null {
  if (!v || typeof v !== 'object' || !finite(v.x) || !finite(v.y) || !finite(v.z)) return null
  if (Math.abs(v.x) > WORLD_LIMIT || Math.abs(v.z) > WORLD_LIMIT || v.y < -1000 || v.y > 20_000) return null
  return { x: v.x, y: v.y, z: v.z }
}

export interface CleanTick {
  pid: string
  name?: string
  pos: Vec
  speed: number
  side?: 'hunters' | 'helpers'
  events: { ev: string; [k: string]: unknown }[]
  v?: string // the halo's build id (round 23)
  pv?: number // its protocol version
  sv?: number // the settings version it holds
}

const CHOICES = new Set(['help', 'doubts', 'A', 'B'])
// Only events the server acts on are kept, each reduced to its known fields; everything else a client sends (the halo's own telemetry events, its log) is dropped.
export function cleanTick(j: any): CleanTick | null {
  if (!j || typeof j !== 'object' || typeof j.pid !== 'string' || !PID.test(j.pid)) return null
  const pos = cleanPos(j.pos)
  if (!pos) return null
  const speed = finite(j.speed) && j.speed >= 0 && j.speed <= 200 ? j.speed : 0
  const side = j.side === 'hunters' || j.side === 'helpers' ? j.side : undefined
  const events: CleanTick['events'] = []
  if (j.events != null) {
    if (!Array.isArray(j.events)) return null
    for (const e of j.events.slice(0, 50)) {
      if (!e || typeof e !== 'object') continue
      if (e.ev === 'plume' || e.ev === 'trap') events.push({ ev: e.ev }) // a plume is placed where the player stands: the position in the event is ignored
      else if ((e.ev === 'trace' || e.ev === 'probe') && typeof e.what === 'string' && typeof e.text === 'string') events.push({ ev: 'trace', what: e.what.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40), text: e.text.slice(0, 400) }) // the test build's probe results (round 12): kept in the server's probe log
      else if (e.ev === 'choice' && typeof e.pick === 'string' && CHOICES.has(e.pick)) events.push({ ev: 'choice', pick: e.pick })
      else if (e.ev === 'replay') {
        const kind = e.kind === 'round' ? 'round' : 'again'
        const round = finite(e.round) ? Math.max(1, Math.min(3, Math.round(e.round))) : 1
        events.push({ ev: 'replay', kind, round })
      }
    }
  }
  const v = typeof j.v === 'string' && /^[A-Za-z0-9._-]{1,16}$/.test(j.v) ? j.v : undefined
  const pv = finite(j.pv) && j.pv >= 0 && j.pv <= 99 ? Math.round(j.pv) : undefined
  const sv = finite(j.sv) && j.sv >= -1 && j.sv <= 1e9 ? Math.round(j.sv) : undefined
  return { pid: j.pid, name: cleanName(j.name), pos, speed, side, events, v, pv, sv }
}

// Request body caps per endpoint (bytes). A halo tick carries a position, a few events and its log lines.
// the bridge route is bigger: the Synth's reachable-spot list alone is about 100 KB; it needs the bridge token and takes at most 200 events
export const BODY_CAP: Record<string, number> = { '/tick': 16_384, '/bridge/sync': 524_288, '/admin': 8_192 }
export const DEFAULT_BODY_CAP = 4_096

// Parse the path without the query; only exact known paths are routed.
export function routePath(url: string | undefined): string {
  const u = url ?? '/'
  const q = u.indexOf('?')
  return q >= 0 ? u.slice(0, q) : u
}

// Decode an /audio/files/<name> segment: a bad percent escape must be a 404, not an exception.
export function decodeSegment(s: string): string | null {
  try {
    const d = decodeURIComponent(s)
    return d.includes('\u0000') || d.includes('/') || d.includes('\\') ? null : d
  } catch {
    return null
  }
}

// The public URL the audio manifest points at: configured, else a validated Host header (never an arbitrary string).
export function publicBase(configured: string | undefined, host: string | undefined, port: number): string {
  if (configured) return configured.replace(/\/+$/, '')
  if (host && /^[A-Za-z0-9.\-:\[\]]{1,100}$/.test(host)) return 'http://' + host
  return 'http://127.0.0.1:' + port
}
