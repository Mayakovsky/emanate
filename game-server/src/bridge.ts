// The Synth bridge: lets the game server run on another machine (the VPS) while the real Synth (a Bevy headless client) stays on this PC.
//
// The bridge process on the PC (tools/synth-bridge.ts) tails the Synth's log and POSTs `/bridge/sync` to the server over HTTPS every 250 ms with the
// latest position and the Synth's other events (players seen, chat heard); the reply carries the commands the server has queued for the Synth, which the
// bridge writes to the local FIFO. The server only ever answers: the PC connects OUT, so no inbound port on the PC. A shared token (a long random
// secret, `x-emanate-bridge` header) is the only credential. Local mode (log tail + FIFO on one machine) is unchanged and remains the fallback.
import crypto from 'node:crypto'
import type { Vec } from './geo.ts'

export interface QueuedCommand {
  cmd: object
  at: number
}

export class BridgeHub {
  private queue: QueuedCommand[] = []
  lastSeen = 0
  lastSeq = 0
  syncs = 0
  rejected = 0
  private token: string
  private now: () => number
  readonly maxQueue: number
  readonly ttlMs: number
  constructor(token: string, now: () => number = Date.now, maxQueue = 100, ttlMs = 10_000) {
    this.token = token
    this.now = now
    this.maxQueue = maxQueue
    this.ttlMs = ttlMs
  }

  // constant-time token check; an empty configured token never matches
  authorized(header: string | undefined): boolean {
    if (!this.token || typeof header !== 'string') return false
    const a = crypto.createHash('sha256').update(header).digest()
    const b = crypto.createHash('sha256').update(this.token).digest()
    return crypto.timingSafeEqual(a, b)
  }

  push(cmd: object) {
    this.queue.push({ cmd, at: this.now() })
    while (this.queue.length > this.maxQueue) this.queue.shift()
  }

  // the commands for the bridge to run now: stale ones (a move or walk that nobody fetched for ttl) are dropped, they would send the Synth somewhere old
  drain(): object[] {
    const t = this.now()
    const out = this.queue.filter((q) => t - q.at <= this.ttlMs).map((q) => q.cmd)
    this.queue = []
    this.lastSeen = t
    this.syncs++
    return out
  }

  pending() {
    return this.queue.length
  }
}

export interface Sync {
  pos: Vec | null
  events: any[]
  seq: number | null
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// validate what a bridge sends: a position (3 finite numbers) and up to 200 small event objects
export function parseSync(j: any): Sync | null {
  if (!j || typeof j !== 'object') return null
  let pos: Vec | null = null
  if (j.pos != null) {
    if (!finite(j.pos.x) || !finite(j.pos.y) || !finite(j.pos.z)) return null
    pos = { x: j.pos.x, y: j.pos.y, z: j.pos.z }
  }
  const events: any[] = []
  if (j.events != null) {
    if (!Array.isArray(j.events) || j.events.length > 200) return null
    for (const e of j.events) {
      if (!e || typeof e !== 'object' || typeof e.event !== 'string') return null
      // an oversize event (a diagnostic such as nav_probe is tens of KB) is DROPPED, not the whole sync: one big event must never block the Synth's position and commands (found 18 Nov: a probe made every sync fail with 400)
      if (JSON.stringify(e).length > (e.event === 'nav_spots' ? 262_144 : 8192)) continue // the reachable-spot list is the one big event the server uses (about 100 KB)
      events.push(e)
    }
  }
  let seq: number | null = null
  if (j.seq != null) {
    if (!finite(j.seq) || j.seq < 0) return null
    seq = j.seq
  }
  return { pos, events, seq }
}
