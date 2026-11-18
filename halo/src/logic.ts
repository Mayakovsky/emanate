// EMANATE Build 04: pure game logic for the halo (no engine imports, so it is unit-tested with node --test).
export type Vec = { x: number; y: number; z: number }
export type ArrowKind = 'red' | 'pink' | 'white' | 'purple' | 'yellow'

export const RULES = {
  arrowOnSec: 4, // arrows play for 4 s ...
  arrowCooldownSec: 7, // ... then a 7 s cooldown (key-triggered)
  warnCooldownSec: 5, // a warning's arrow is followed by a 5 s cooldown
  overloadRadius: 100, // key 1 inside 100 m: the halo is "overloaded"
  trapRadius: 5, // m: a Discharge Trap goes off when the Synth or any player comes this close
  trapSeconds: 10, // a trap hit keeps its victims one level down this long
  upgradeRadius: 80, // key 2 works within 80 m of a drop; the "upgrade available" warning fires at 80 m
  deadZoneBaseMetres: 10, // dead-zone warning: 10 m from the boundary ...
  deadZoneSeconds: 2, // ... or 2 s of travel at the current speed, whichever is further
  plumeSeconds: 14,
  plumesPerRound: 3,
  chargeRadius: 5,
  pickupRadius: 2,
  boostSeconds: 30,
  arrowSpeedMin: 0.8, // chevron cycles per second when the target is far ...
  arrowSpeedMax: 4.5, // ... and close
  arrowSpeedFarMetres: 300,
  airborneMetres: 3 // more than a few metres up: the arrows are drawn flat at foot level, pointing level
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export const dist2 = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)

// The arrow animation runs faster as the target gets closer.
export function arrowSpeed(distance: number): number {
  const k = Math.max(0, Math.min(1, 1 - distance / RULES.arrowSpeedFarMetres))
  return RULES.arrowSpeedMin + (RULES.arrowSpeedMax - RULES.arrowSpeedMin) * k
}

// Dead-zone warning distance: 10 m from the boundary or 2 s of travel at the current speed, whichever is further.
export function deadZoneTriggerDistance(speed: number): number {
  return Math.max(RULES.deadZoneBaseMetres, speed * RULES.deadZoneSeconds)
}

// One arrow channel per colour: 4 s on, then a cooldown (7 s from a key, 5 s from a warning).
export type ArrowStart = 'started' | 'busy' | 'cooldown'
export class ArrowChannel {
  onUntil = 0
  coolUntil = 0
  source: 'key' | 'warning' = 'key'
  start(now: number, source: 'key' | 'warning'): ArrowStart {
    if (now < this.onUntil) return 'busy'
    if (now < this.coolUntil) return 'cooldown'
    this.source = source
    this.onUntil = now + RULES.arrowOnSec
    this.coolUntil = this.onUntil + (source === 'key' ? RULES.arrowCooldownSec : RULES.warnCooldownSec)
    return 'started'
  }
  active(now: number) {
    return now < this.onUntil
  }
  cooldownLeft(now: number) {
    return Math.max(0, this.coolUntil - Math.max(now, this.onUntil))
  }
  // 0..1 of the 4 s that has played
  progress(now: number) {
    return Math.max(0, Math.min(1, 1 - (this.onUntil - now) / RULES.arrowOnSec))
  }
}

export interface Target {
  pos: Vec
  id?: number | string
}
export function nearest(from: Vec, list: Target[]): { target: Target; d: number } | null {
  let best: { target: Target; d: number } | null = null
  for (const t of list) {
    const d = dist(from, t.pos)
    if (!best || d < best.d) best = { target: t, d }
  }
  return best
}

// ---- key 1: the Synth ----
export type RedResult = { kind: 'arrow'; target: Vec; d: number } | { kind: 'overloaded'; d: number } | { kind: 'none' } | { kind: 'cooldown' }
export function pressRed(ch: ArrowChannel, now: number, me: Vec, synth: Vec | null): RedResult {
  if (!synth) return { kind: 'none' }
  const d = dist(me, synth)
  const s = ch.start(now, 'key')
  if (s !== 'started') return { kind: 'cooldown' }
  if (d < RULES.overloadRadius) return { kind: 'overloaded', d }
  return { kind: 'arrow', target: synth, d }
}

// ---- key 2: nearest upgrade drop, only within 80 m ----
export type PinkResult = { kind: 'arrow'; target: Vec; d: number; id: number | string | undefined } | { kind: 'none' } | { kind: 'cooldown' }
export function pressPink(ch: ArrowChannel, now: number, me: Vec, drops: Target[]): PinkResult {
  const n = nearest(me, drops)
  if (!n || n.d > RULES.upgradeRadius) return { kind: 'none' }
  const s = ch.start(now, 'key')
  if (s !== 'started') return { kind: 'cooldown' }
  return { kind: 'arrow', target: n.target.pos, d: n.d, id: n.target.id }
}

// ---- warnings ----
export class Warnings {
  deadZoneEnabled = true
  announced = new Set<number | string>()
  toggleDeadZone() {
    this.deadZoneEnabled = !this.deadZoneEnabled
    return this.deadZoneEnabled
  }
  // returns the boundary point to point the white arrow at when the dead-zone warning fires, else null.
  // dzDist: metres from the player to the boundary (null = no dead zone nearby); inside = already in one.
  deadZone(ch: ArrowChannel, now: number, speed: number, dzDist: number | null): boolean {
    if (!this.deadZoneEnabled || dzDist === null || dzDist <= 0) return false
    if (dzDist > deadZoneTriggerDistance(speed)) return false
    return ch.start(now, 'warning') === 'started'
  }
  // "upgrade available": when a drop first comes within 80 m and the pink arrow is free. Returns that drop or null.
  upgradeNearby(ch: ArrowChannel, now: number, me: Vec, drops: Target[]): Target | null {
    for (const d of [...this.announced]) if (!drops.some((x) => x.id === d)) this.announced.delete(d) // gone: forget
    const n = nearest(me, drops.filter((x) => x.id === undefined || !this.announced.has(x.id)))
    if (!n || n.d > RULES.upgradeRadius) return null
    if (ch.start(now, 'warning') !== 'started') return null // keep it unannounced until the channel is free
    if (n.target.id !== undefined) this.announced.add(n.target.id)
    return n.target
  }
}

// ---- plumes (key 4) ----
export class PlumeBudget {
  left = RULES.plumesPerRound
  use(): boolean {
    if (this.left <= 0) return false
    this.left--
    return true
  }
  refill() {
    this.left = RULES.plumesPerRound
  }
}

// ---- arrow geometry: points along the ground from the player toward the target ----
// Returns the heading (degrees, 0 = +z) and the chevron distances along the path for a phase 0..1.
export function arrowHeadingDeg(from: Vec, to: Vec): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI
}
export function chevronOffsets(count: number, spacing: number, phase: number, start: number, maxLen: number): { s: number; fade: number }[] {
  const out: { s: number; fade: number }[] = []
  for (let i = 0; i < count; i++) {
    const f = (i + (phase % 1) + 1) % count // advancing marches the chevrons forward
    const s = start + f * spacing
    if (s > maxLen) {
      out.push({ s, fade: 0 })
      continue
    }
    const u = f / count
    out.push({ s, fade: Math.sin(Math.PI * u) }) // fade in and out along the run
  }
  return out
}

// ---- test mode: fixed set of targets around the spawn (scene coordinates; the preview scene covers parcels 0,0..9,9) ----
export const TEST_TARGETS = {
  synthFixed: { x: 120, y: 0, z: 100 },
  synthMovingCentre: { x: 80, y: 0, z: 80 },
  synthMovingRadius: 45,
  synthMovingSpeed: 6, // m/s
  drops: [
    { id: 'td1', pos: { x: 40, y: 0, z: 40 } },
    { id: 'td2', pos: { x: 110, y: 0, z: 25 } }
  ],
  deadZoneX: 144 // everything with x >= 144 is a dead zone (the fake boundary is the plane x = 144)
}
export function testMovingSynth(t: number): Vec {
  const T = TEST_TARGETS
  const a = (T.synthMovingSpeed / T.synthMovingRadius) * t
  return { x: T.synthMovingCentre.x + Math.cos(a) * T.synthMovingRadius, y: 0, z: T.synthMovingCentre.z + Math.sin(a) * T.synthMovingRadius }
}
export function testDeadZoneDistance(p: Vec): { dist: number; at: Vec } | null {
  const d = TEST_TARGETS.deadZoneX - p.x
  return d > 0 ? { dist: d, at: { x: TEST_TARGETS.deadZoneX, y: p.y, z: p.z } } : null
}
