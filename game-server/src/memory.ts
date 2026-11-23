// The Synth's memory, in tiers (design v3, "Memory (tiered, small footprint)"). Local file only; no internet (IP) addresses are tracked.
//   players               whether and when they played, how it went, and which side they played last round
//   talked                a player (joined through the Halo) who talked to the Synth: a timestamp and a one-line summary
//   dismissed             a player who dismissed it: a day-off timer
//   everyone else         nothing is stored (c31): it may answer in the moment; treated as a Stranger
import fs from 'node:fs'
import path from 'node:path'

export type Side = 'hunters' | 'helpers'
export type Familiarity = 'stranger' | 'helper' | 'hunter'
interface Data {
  players: Record<string, { lastPlayed: number; lastSide: Side | null; outcome: string }>
  talked: Record<string, { ts: number; summary: string }>
  dismissed: Record<string, { until: number }>
}

export class Memory {
  d: Data = { players: {}, talked: {}, dismissed: {} }
  private file: string | null
  constructor(file: string | null = null) {
    this.file = file
    if (file && fs.existsSync(file)) {
      try {
        this.d = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch {}
    }
  }
  private key = (addr: string) => addr.toLowerCase()
  save() {
    if (!this.file) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(this.d))
  }
  recordPlayed(addr: string, side: Side, outcome: string, now: number) {
    this.d.players[this.key(addr)] = { lastPlayed: now, lastSide: side, outcome }
    this.save()
  }
  // c31 (privacy): the Synth keeps memory ONLY for players who joined through the Halo (they have a `players` entry). For anyone else it may
  // answer in the moment, but nothing about them is stored (no talk line, no day-off on disk); the in-RAM cooldown in roaming.ts still lets it back off.
  isJoined(addr: string): boolean { return this.key(addr) in this.d.players }
  recordTalk(addr: string, summary: string, now: number): boolean {
    if (!this.isJoined(addr)) return false
    this.d.talked[this.key(addr)] = { ts: now, summary: summary.slice(0, 120) } // one line
    this.save()
    return true
  }
  dismiss(addr: string, now: number, hours: number): boolean {
    if (!this.isJoined(addr)) return false
    this.d.dismissed[this.key(addr)] = { until: now + hours * 3600 * 1000 }
    this.save()
    return true
  }
  isDayOff(addr: string, now: number): boolean {
    const x = this.d.dismissed[this.key(addr)]
    return !!x && now < x.until
  }
  // c31: deletes every stored record (talk, day-off) of an address that never joined; returns how many it removed. The caller makes the rollback copy first.
  dropNonJoined(): number {
    let n = 0
    for (const k of Object.keys(this.d.talked)) if (!(k in this.d.players)) { delete this.d.talked[k]; n++ }
    for (const k of Object.keys(this.d.dismissed)) if (!(k in this.d.players)) { delete this.d.dismissed[k]; n++ }
    if (n) this.save()
    return n
  }
  // a Former Helper gets a warm greeting, a former Hunter a teasing one; everyone else is a Stranger
  familiarity(addr: string): Familiarity {
    const p = this.d.players[this.key(addr)]
    if (!p || !p.lastSide) return 'stranger'
    return p.lastSide === 'helpers' ? 'helper' : 'hunter'
  }
  // drop expired day-offs (the only tier that expires)
  gc(now: number) {
    for (const [k, v] of Object.entries(this.d.dismissed)) if (now >= v.until) delete this.d.dismissed[k]
    this.save()
  }
  // round 22: entries with no play for `days` are dropped (the notice promises 90 days); talks older than that go too
  purge(now: number, days = 90) {
    const cut = now - days * 86_400_000
    let n = 0
    for (const [k, v] of Object.entries(this.d.players)) if (v.lastPlayed < cut) { delete this.d.players[k]; n++ }
    for (const [k, v] of Object.entries(this.d.talked)) if (v.ts < cut) { delete this.d.talked[k]; n++ }
    for (const [k, v] of Object.entries(this.d.dismissed)) if (now >= v.until) { delete this.d.dismissed[k]; n++ }
    if (n) this.save()
    return n
  }
  // round 22: removes one address from every tier; returns what it removed
  forget(addr: string) {
    const k = this.key(addr)
    const r = { players: k in this.d.players ? 1 : 0, talked: k in this.d.talked ? 1 : 0, dismissed: k in this.d.dismissed ? 1 : 0 }
    delete this.d.players[k]; delete this.d.talked[k]; delete this.d.dismissed[k]
    if (r.players + r.talked + r.dismissed) this.save()
    return r
  }
  counts() {
    return { players: Object.keys(this.d.players).length, talked: Object.keys(this.d.talked).length, dismissed: Object.keys(this.d.dismissed).length }
  }
}
