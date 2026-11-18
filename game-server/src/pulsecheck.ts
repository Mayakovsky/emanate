// Pulse cross-check (identity b), LOG ONLY: the halo reports where a player says they are (a claim); the Synth's own client sees the same player over Pulse.
// The two are compared and the gap is logged. Nothing here blocks, kicks or changes server behaviour; it only counts, so the false-positive rate of any
// future rule can be measured first. Pure logic with an injected clock, unit-tested.
import type { Vec } from './geo.ts'

export interface PulseCfg {
  viewRadius: number // m: how far the Synth sees other players (measured by tools/pulse-radius-test.py)
  baseTolerance: number // m of gap always allowed (the two positions are read at different moments)
  speedFactor: number // the allowance grows with the claimed speed times the age of the claim
  claimMaxAgeSeconds: number // an older claim is not compared (the halo stopped reporting)
  unseenGraceSeconds: number // a claimed player inside the view radius that the Synth has not seen for this long is flagged
}
export const PULSE_CFG: PulseCfg = { viewRadius: 150, baseTolerance: 4, speedFactor: 1.5, claimMaxAgeSeconds: 5, unseenGraceSeconds: 6 }

interface Claim { pos: Vec; t: number; speed: number }
interface Seen { pos: Vec; t: number }
export interface Row { t: number; id: string; kind: 'gap' | 'unseen'; gap?: number; allowed?: number; flagged: boolean; claim: Vec; seen?: Vec; claimAge?: number; distanceToSynth?: number }

export class PulseCheck {
  cfg: PulseCfg
  private now: () => number
  claims = new Map<string, Claim>()
  seenAt = new Map<string, Seen>()
  rows: Row[] = []
  gaps: number[] = []
  comparisons = 0
  flaggedGap = 0
  unseenChecks = 0
  flaggedUnseen = 0
  unclaimedSeen = new Set<string>()
  private lastUnseenFlag = new Map<string, number>()
  private firstClaim = new Map<string, number>()
  perId = new Map<string, { comparisons: number; flagged: number; gapSum: number; gapMax: number; unseenFlags: number }>()
  private idStat(id: string) {
    let r = this.perId.get(id)
    if (!r) { r = { comparisons: 0, flagged: 0, gapSum: 0, gapMax: 0, unseenFlags: 0 }; this.perId.set(id, r) }
    return r
  }
  onRow: ((r: Row) => void) | null = null
  constructor(now: () => number, cfg: PulseCfg = PULSE_CFG) {
    this.now = now
    this.cfg = { ...cfg }
  }
  private id(a: string) {
    return String(a).toLowerCase()
  }
  private push(r: Row) {
    this.rows.push(r)
    if (this.rows.length > 2000) this.rows.shift()
    if (this.onRow) this.onRow(r)
  }
  // a halo's report of where the player is (the id is the halo's stable id, the wallet address)
  claim(id: string, pos: Vec, speed = 0, t = this.now()) {
    const k = this.id(id)
    if (!this.firstClaim.has(k)) this.firstClaim.set(k, t)
    this.claims.set(k, { pos: { ...pos }, t, speed })
  }
  // the Synth's Pulse view of a player (address, position)
  seen(address: string, pos: Vec, t = this.now()) {
    const id = this.id(address)
    this.seenAt.set(id, { pos: { ...pos }, t })
    const c = this.claims.get(id)
    if (!c) { this.unclaimedSeen.add(id); return null }
    const age = (t - c.t) / 1000
    if (age > this.cfg.claimMaxAgeSeconds) return null
    const gap = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z)
    const allowed = this.cfg.baseTolerance + this.cfg.speedFactor * c.speed * age
    const flagged = gap > allowed
    this.comparisons++
    this.gaps.push(gap)
    if (this.gaps.length > 20000) this.gaps.shift()
    if (flagged) this.flaggedGap++
    const ps = this.idStat(id)
    ps.comparisons++
    ps.gapSum += gap
    ps.gapMax = Math.max(ps.gapMax, gap)
    if (flagged) ps.flagged++
    const row: Row = { t, id, kind: 'gap', gap: Math.round(gap * 100) / 100, allowed: Math.round(allowed * 100) / 100, flagged, claim: c.pos, seen: pos, claimAge: Math.round(age * 100) / 100 }
    this.push(row)
    return row
  }
  // claimed players inside the view radius that the Synth does not see (called every second or two with the Synth's own position)
  sweep(synth: Vec, t = this.now()) {
    const out: Row[] = []
    for (const [id, c] of this.claims) {
      if ((t - c.t) / 1000 > this.cfg.claimMaxAgeSeconds) continue
      const d = Math.hypot(c.pos.x - synth.x, c.pos.z - synth.z)
      if (d > this.cfg.viewRadius * 0.9) continue // well inside the radius only: the edge is fuzzy
      this.unseenChecks++
      const s = this.seenAt.get(id)
      const unseenFor = (t - (s ? Math.max(s.t, this.firstClaim.get(id) ?? 0) : this.firstClaim.get(id) ?? t)) / 1000 // never seen: counted from the first claim, so a new arrival gets the grace period too
      if (unseenFor <= this.cfg.unseenGraceSeconds) continue
      if ((this.lastUnseenFlag.get(id) ?? 0) > t - 5000) continue // one row per player per 5 s
      this.lastUnseenFlag.set(id, t)
      this.flaggedUnseen++
      this.idStat(id).unseenFlags++
      const row: Row = { t, id, kind: 'unseen', flagged: true, claim: c.pos, distanceToSynth: Math.round(d) }
      this.push(row)
      out.push(row)
    }
    return out
  }
  stats() {
    const g = [...this.gaps].sort((a, b) => a - b)
    const pct = (p: number) => (g.length ? g[Math.min(g.length - 1, Math.floor(p * g.length))]! : null)
    const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
    return {
      comparisons: this.comparisons,
      flaggedGap: this.flaggedGap,
      gapFalsePositiveRate: this.comparisons ? Math.round((this.flaggedGap / this.comparisons) * 10000) / 10000 : null,
      gapMean: round(g.length ? g.reduce((a, b) => a + b, 0) / g.length : null),
      gapMedian: round(pct(0.5)),
      gapP95: round(pct(0.95)),
      gapMax: round(g.length ? g[g.length - 1]! : null),
      unseenChecks: this.unseenChecks,
      flaggedUnseen: this.flaggedUnseen,
      unseenFalsePositiveRate: this.unseenChecks ? Math.round((this.flaggedUnseen / this.unseenChecks) * 10000) / 10000 : null,
      seenWithoutClaim: this.unclaimedSeen.size,
      byId: Object.fromEntries([...this.perId].map(([k, v]) => [k.slice(0, 10), { comparisons: v.comparisons, flagged: v.flagged, flaggedRate: v.comparisons ? Math.round((v.flagged / v.comparisons) * 10000) / 10000 : null, gapMean: v.comparisons ? Math.round((v.gapSum / v.comparisons) * 100) / 100 : null, gapMax: Math.round(v.gapMax * 100) / 100, unseenFlags: v.unseenFlags }])),
      claims: this.claims.size
    }
  }
}
