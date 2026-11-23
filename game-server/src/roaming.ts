// The entry-portal Synth, stage 1 (no AI): it roams, is drawn to busy spots, approaches but never chases, lingers with scripted lines,
// backs off when told no (a day-off per address), stays quiet at events, and remembers (memory.ts). All sliders are server-side config.
// Design v3: "The Game's Entry Portal: the roaming Synth". Pure logic with an injected clock and RNG, unit-tested.
import type { Vec } from './geo.ts'
import { Memory, type Familiarity } from './memory.ts'
import { SLOTS } from './audioManifest.ts'

export const ROAM_CONFIG = {
  eagerness: 0.5, // 0 brief pass-by .. 1 lingers (scales the linger time)
  lingerMinSeconds: 40, // at eagerness 0
  lingerMaxSeconds: 240, // at eagerness 1 ("whispers at short intervals for a few minutes")
  whisperRate: 0.5, // 0 rare .. 1 constant (scales the whisper interval)
  whisperIntervalMaxSeconds: 30,
  whisperIntervalMinSeconds: 6,
  baselineWhisper: 0.2, // 0 near-silent .. 1 audible: the volume the halo plays whispers at (sent in the state)
  skittishness: 0.5, // 0 stands its ground .. 1 flees at the first move: how close a person may get before it steps back (metres = 4 + 10 x skittishness)
  revisitCooldownPersonMinutes: 20,
  revisitCooldownGatheringMinutes: 15,
  crowdDraw: 0.6, // 0 ignores a crowd .. 1 strong pull (spot weight = count ^ (0.2 + 1.3 x crowdDraw))
  dismissalHours: 24,
  crowdSizePreference: 0.5, // 0 flat .. 1 favours crowds (blended with crowd draw)
  questionLimitBeforeTrust: 3, // NOT USED: an AI conversation slider (stage 2)
  approachDistance: 12, // m: where it stops near the nearest person (never closer: it approaches, never chases)
  edgeDistanceAtEvents: 45, // m: at a live event it hangs at the edges and never talks over a stage
  eventRadius: 48, // m around a live event's coordinates
  giveUpDistance: 100, // m: if the person it approached moves farther than this (it starts approaching within 90 m), it gives up (never chases)
  roamStepMetres: 60,
  roamPauseSeconds: [6, 14] as [number, number],
  dismissPattern: /\b(no|nope|go away|leave me alone|stop|not interested|get lost|shoo|piss off|back off)\b/i
}

export interface Person { addr: string; pos: Vec }
export interface Spot { x: number; z: number; count: number; source: string }
export interface LiveEvent { x: number; z: number }
export interface ChatMsg { from: string; text: string }
export type RoamCmd = { cmd: 'walk_to' | 'run_to'; x: number; z: number } | { cmd: 'chat'; text: string } | { cmd: 'stop' }
export type RoamState = 'roam' | 'seek' | 'approach' | 'linger' | 'leave' | 'backoff'

const lineOf = (id: string) => SLOTS.find((s) => s.id === id)?.line ?? ''
export const GREETING_SLOT: Record<Familiarity, string> = { stranger: 'synth.greet.stranger', helper: 'synth.greet.helper', hunter: 'synth.greet.hunter' }

const gatheringKey = (x: number, z: number) => Math.round(x / 64) + ',' + Math.round(z / 64)

export class RoamBrain {
  state: RoamState = 'roam'
  target: Person | null = null
  spot: Spot | null = null
  stateSince = 0
  lingerFor = 0
  nextWhisperAt = 0
  nextRoamAt = 0
  greeted = new Set<string>()
  personCooldown = new Map<string, number>() // addr -> until
  gatheringCooldown = new Map<string, number>() // gathering key -> until
  log: { t: number; ev: string; [k: string]: unknown }[] = []
  whispers = 0
  chats = 0
  private lastKey = ''
  private lastKeyAt = 0
  private now: () => number
  private rng: () => number
  cfg: typeof ROAM_CONFIG
  mem: Memory
  constructor(now: () => number, rng: () => number, mem: Memory, cfg = ROAM_CONFIG) {
    this.now = now
    this.rng = rng
    this.mem = mem
    this.cfg = cfg
  }
  // c31: an address goes into the log only for a player who joined through the Halo
  private who(addr: string | undefined): string | undefined { return addr && this.mem.isJoined(addr) ? addr : undefined }
  private note(ev: string, data: Record<string, unknown> = {}) {
    this.log.push({ t: this.now(), ev, ...data })
    if (this.log.length > 400) this.log.shift()
  }
  private send(cmd: RoamCmd, key: string, force = false): RoamCmd | null {
    const now = this.now()
    if (!force && key === this.lastKey && now - this.lastKeyAt < 4000) return null
    this.lastKey = key
    this.lastKeyAt = now
    return cmd
  }
  private atEvent(p: Vec, events: LiveEvent[]) {
    return events.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < this.cfg.eventRadius)
  }
  private eligible(p: Person, now: number) {
    return !this.mem.isDayOff(p.addr, now) && now >= (this.personCooldown.get(p.addr) ?? 0)
  }
  private lingerSeconds() {
    return this.cfg.lingerMinSeconds + (this.cfg.lingerMaxSeconds - this.cfg.lingerMinSeconds) * this.cfg.eagerness
  }
  private whisperGap() {
    const c = this.cfg
    return (c.whisperIntervalMaxSeconds - (c.whisperIntervalMaxSeconds - c.whisperIntervalMinSeconds) * c.whisperRate) * 1000
  }
  // the weight of a busy spot: crowd draw x crowd-size preference; spots that are day-off, in cooldown or empty are skipped
  pickSpot(spots: Spot[], people: Person[], now: number): Spot | null {
    const c = this.cfg
    const exp = 0.2 + 1.3 * c.crowdDraw
    let total = 0
    const w: [Spot, number][] = []
    for (const s of spots) {
      if (now < (this.gatheringCooldown.get(gatheringKey(s.x, s.z)) ?? 0)) continue
      // skip a spot whose every known person is on a day-off
      const near = people.filter((p) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 40)
      if (near.length > 0 && near.every((p) => !this.eligible(p, now))) continue
      const weight = Math.pow(Math.max(1, s.count), exp * (0.5 + c.crowdSizePreference)) // a bigger crowd, a stronger pull
      w.push([s, weight])
      total += weight
    }
    if (!w.length) return null
    let r = this.rng() * total
    for (const [s, x] of w) { r -= x; if (r <= 0) return s }
    return w[w.length - 1]![0]
  }
  // synth: its position. spots: busy spots (stats). people: who is visible. chats: new nearby-chat lines since the last step. events: live events
  step(synth: Vec, spots: Spot[], people: Person[], chats: ChatMsg[], events: LiveEvent[]): RoamCmd[] {
    const now = this.now()
    const c = this.cfg
    const out: RoamCmd[] = []
    this.mem.gc(now)

    // ---- dismissal: "no" from anyone near it, in any form, in any state (a day off for that address) ----
    for (const m of chats) {
      const who = people.find((p) => p.addr.toLowerCase() === m.from.toLowerCase())
      if (!who || Math.hypot(who.pos.x - synth.x, who.pos.z - synth.z) > 60) continue
      const joined = this.mem.recordTalk(m.from, m.text, now) // c31: stored only for players who joined through the Halo
      if (c.dismissPattern.test(m.text)) {
        this.mem.dismiss(m.from, now, c.dismissalHours)
        this.personCooldown.set(m.from, now + c.dismissalHours * 3600 * 1000) // RAM only, lost on restart
        this.note('dismissed', joined ? { addr: m.from, text: m.text } : {}) // c31: nothing identifying logged for a non-joined person
        this.state = 'backoff'
        this.stateSince = now
        this.target = null
        // step away 30 m from them, quietly, and say one back-off line
        const dx = synth.x - who.pos.x, dz = synth.z - who.pos.z
        const l = Math.hypot(dx, dz) || 1
        out.push({ cmd: 'chat', text: lineOf('synth.backoff') })
        out.push({ cmd: 'walk_to', x: synth.x + (dx / l) * 30, z: synth.z + (dz / l) * 30 })
        this.chats++
        return out
      }
    }

    // ---- skittishness: someone closer than its comfort distance makes it step back (never lets itself be cornered or grabbed) ----
    const comfort = 4 + 10 * c.skittishness
    const tooClose = people.find((p) => Math.hypot(p.pos.x - synth.x, p.pos.z - synth.z) < comfort * 0.6)
    if (tooClose && (this.state === 'approach' || this.state === 'linger')) {
      const dx = synth.x - tooClose.pos.x, dz = synth.z - tooClose.pos.z
      const l = Math.hypot(dx, dz) || 1
      const cmd = this.send({ cmd: 'walk_to', x: synth.x + (dx / l) * 8, z: synth.z + (dz / l) * 8 }, 'step-back')
      if (cmd) { this.note('step-back', { addr: this.who(tooClose.addr) }); out.push(cmd) }
      return out
    }

    switch (this.state) {
      case 'roam': {
        const spot = now >= this.nextRoamAt ? this.pickSpot(spots, people, now) : null
        if (spot) {
          this.spot = spot
          this.state = 'seek'
          this.stateSince = now
          this.note('seek', { x: Math.round(spot.x), z: Math.round(spot.z), count: spot.count, source: spot.source })
          out.push({ cmd: 'walk_to', x: spot.x, z: spot.z })
          return out
        }
        if (now >= this.nextRoamAt) {
          const a = this.rng() * Math.PI * 2
          const cmd = this.send({ cmd: 'walk_to', x: synth.x + Math.cos(a) * c.roamStepMetres, z: synth.z + Math.sin(a) * c.roamStepMetres }, 'roam:' + Math.round(a * 10), true)
          this.nextRoamAt = now + (c.roamPauseSeconds[0] + this.rng() * (c.roamPauseSeconds[1] - c.roamPauseSeconds[0])) * 1000
          if (cmd) out.push(cmd)
        }
        return out
      }
      case 'seek': {
        const sp = this.spot
        if (!sp) { this.state = 'roam'; return out }
        // visible people near the spot who are eligible
        const cands = people.filter((p) => Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z) < 60 && this.eligible(p, now))
        const atSpot = Math.hypot(synth.x - sp.x, synth.z - sp.z) < 40
        const near = cands.sort((a, b) => Math.hypot(a.pos.x - synth.x, a.pos.z - synth.z) - Math.hypot(b.pos.x - synth.x, b.pos.z - synth.z))[0]
        if (near && Math.hypot(near.pos.x - synth.x, near.pos.z - synth.z) < 90) {
          this.target = near
          this.state = 'approach'
          this.stateSince = now
          this.note('approach', { addr: this.who(near.addr) })
          return out
        }
        if (atSpot || now - this.stateSince > 180_000) {
          // nobody eligible there: leave it and look elsewhere
          this.gatheringCooldown.set(gatheringKey(sp.x, sp.z), now + c.revisitCooldownGatheringMinutes * 60_000)
          this.state = 'roam'; this.nextRoamAt = now + 5000; this.spot = null
          this.note('seek-empty')
        }
        return out
      }
      case 'approach': {
        const t = people.find((p) => p.addr === this.target?.addr)
        if (!t || Math.hypot(t.pos.x - synth.x, t.pos.z - synth.z) > c.giveUpDistance) {
          // approach, never chase: if they move away it lets them go
          this.state = 'leave'; this.stateSince = now
          this.note('gave-up', { addr: this.who(this.target?.addr) })
          return out
        }
        const quiet = this.atEvent(t.pos, events) || this.atEvent(synth, events)
        const hold = quiet ? c.edgeDistanceAtEvents : c.approachDistance
        const d = Math.hypot(t.pos.x - synth.x, t.pos.z - synth.z)
        if (d <= hold + 2) {
          this.state = 'linger'; this.stateSince = now
          this.lingerFor = this.lingerSeconds() * 1000
          this.nextWhisperAt = now + 1500
          this.note('linger', this.mem.isJoined(t.addr) ? { addr: t.addr, quiet } : { quiet })
          if (!quiet && !this.greeted.has(t.addr)) {
            this.greeted.add(t.addr)
            const fam = this.mem.familiarity(t.addr)
            out.push({ cmd: 'chat', text: lineOf(GREETING_SLOT[fam]) })
            this.chats++
            this.note('greet', this.mem.isJoined(t.addr) ? { addr: t.addr, tone: fam } : { tone: fam })
          }
          return out
        }
        // drift toward a point `hold` metres from them (not onto them)
        const dx = t.pos.x - synth.x, dz = t.pos.z - synth.z
        const l = Math.hypot(dx, dz) || 1
        const cmd = this.send({ cmd: 'walk_to', x: t.pos.x - (dx / l) * hold, z: t.pos.z - (dz / l) * hold }, 'approach:' + t.addr)
        if (cmd) out.push(cmd)
        return out
      }
      case 'linger': {
        const t = people.find((p) => p.addr === this.target?.addr)
        const quiet = this.atEvent(synth, events) || (t ? this.atEvent(t.pos, events) : false) // the person it lingers near is at the event too
        if (!t || Math.hypot(t.pos.x - synth.x, t.pos.z - synth.z) > c.giveUpDistance) { this.state = 'leave'; this.stateSince = now; return out }
        if (now - this.stateSince > this.lingerFor) {
          this.state = 'leave'; this.stateSince = now
          this.note('leave', { reason: 'nobody engaged', addr: this.who(t.addr) })
          return out
        }
        if (!quiet && now >= this.nextWhisperAt) {
          const n = 1 + Math.floor(this.rng() * 3)
          this.whispers++
          this.note('whisper', { slot: 'synth.whisper.' + n, volume: c.baselineWhisper })
          this.nextWhisperAt = now + this.whisperGap() * (0.7 + 0.6 * this.rng())
        }
        return out
      }
      case 'leave': {
        // wander off; the person and the gathering get a revisit cooldown (re-approaching later is allowed: no cap)
        if (this.target) this.personCooldown.set(this.target.addr, now + c.revisitCooldownPersonMinutes * 60_000)
        if (this.target) this.greeted.delete(this.target.addr) // after the cooldown a returning person is greeted again (by what the Synth now knows of them)
        if (this.spot) this.gatheringCooldown.set(gatheringKey(this.spot.x, this.spot.z), now + c.revisitCooldownGatheringMinutes * 60_000)
        const a = this.rng() * Math.PI * 2
        out.push({ cmd: 'walk_to', x: synth.x + Math.cos(a) * 90, z: synth.z + Math.sin(a) * 90 })
        this.state = 'roam'; this.stateSince = now; this.target = null; this.spot = null
        this.nextRoamAt = now + 8000
        return out
      }
      case 'backoff': {
        if (now - this.stateSince > 6000) { this.state = 'roam'; this.nextRoamAt = now + 10_000 }
        return out
      }
    }
  }
}
