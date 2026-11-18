// Hiding behaviour (design v3 "Hiding metrics"): the pieces the Synth brain uses to choose WHERE to run and WHERE to hide.
// Pure functions, unit-tested. The world data (dead-zone parcels, owned or built parcels, building heights) comes from the content maps.
import { ParcelSet, PARCEL, type Vec } from './geo.ts'

export interface HideCfg {
  highLowPreference: number // 0 = ground level and basements .. 1 = rooftops and upper floors
  highLowWeight?: number // how much the high/low match counts in a candidate's score (default 1.5, as in the report)
  terrainPreference: number // 0 = open, sparse areas .. 1 = dense urban blocks
  gliderEscapeHeight: number // m: a building (or a drop) at least this high nearby triggers a glide escape
  hideLimitInsideOwnedParcelsSeconds: number // energy cap: how long it may stay hidden in a built parcel before it must move on
  exposureBoostInsideParcels: number // how much brighter the halo effects on it get while it hides inside parcels (a multiplier for the halo)
}

// A parcel's "density": the number of built parcels in the 3x3 block around it (0..9), from the covered-parcel map
export function density(built: ParcelSet, px: number, pz: number): number {
  let n = 0
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (built.has(px + dx, pz + dz)) n++
  return n
}

export const inDeadZone = (dead: ParcelSet, p: Vec) => dead.has(Math.floor(p.x / PARCEL), Math.floor(p.z / PARCEL))

// A hiding candidate: where to duck in. Chooses among sampled points around the Synth, scoring by terrain preference (dense vs open),
// the high/low preference (rooftop vs ground: a candidate carries an altitude offset), and distance from the player.
export interface Candidate { x: number; z: number; y: number }
export function scoreCandidate(c: Candidate, from: Vec, player: Vec, built: ParcelSet, cfg: HideCfg): number {
  const d = density(built, Math.floor(c.x / PARCEL), Math.floor(c.z / PARCEL)) / 9 // 0 open .. 1 dense
  const terrain = 1 - Math.abs(cfg.terrainPreference - d) // best when the density matches the preference
  const high = Math.max(0, Math.min(1, c.y / 40)) // 0 ground .. 1 at 40 m
  const level = 1 - Math.abs(cfg.highLowPreference - high)
  const away = Math.min(1, Math.hypot(c.x - player.x, c.z - player.z) / 120) // farther from the player is better, capped
  const travel = 1 - Math.min(1, Math.hypot(c.x - from.x, c.z - from.z) / 90) // but close enough to reach
  return terrain * 2 + level * (cfg.highLowWeight ?? 1.5) + away * 2 + travel
}

export function pickHidingSpot(candidates: Candidate[], from: Vec, player: Vec, built: ParcelSet, cfg: HideCfg): Candidate | null {
  let best: Candidate | null = null
  let bs = -Infinity
  for (const c of candidates) {
    const s = scoreCandidate(c, from, player, built, cfg)
    if (s > bs) { bs = s; best = c }
  }
  return best
}

// Sample candidate points on a ring around the Synth (rng is injected for tests); y is 0 or a rooftop altitude when a building is known.
export function sampleCandidates(from: Vec, count: number, radius: number, rng: () => number, rooftopY: (x: number, z: number) => number): Candidate[] {
  const out: Candidate[] = []
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const r = radius * (0.4 + 0.6 * rng())
    const x = from.x + Math.cos(a) * r
    const z = from.z + Math.sin(a) * r
    out.push({ x, z, y: rooftopY(x, z) })
  }
  return out
}

// Hide-limit: it may stay hidden inside a built (owned/deployed) parcel only so long; then it must move on to seek energy.
export function mustMoveOn(hiddenSeconds: number, insideBuiltParcel: boolean, cfg: HideCfg): boolean {
  return insideBuiltParcel && hiddenSeconds >= cfg.hideLimitInsideOwnedParcelsSeconds
}

// Glider escape: when the player is close and a high point (>= gliderEscapeHeight) is near, glide down from it instead of running on the ground.
export function shouldGlideEscape(nearestHighPointHeight: number, playerDistance: number, cfg: HideCfg): boolean {
  return nearestHighPointHeight >= cfg.gliderEscapeHeight && playerDistance < 40
}

// Exposure: while it hides inside a built parcel its effects get brighter for halo wearers (a multiplier the halo reads from the state).
export function exposureFactor(insideBuiltParcel: boolean, cfg: HideCfg): number {
  return insideBuiltParcel ? cfg.exposureBoostInsideParcels : 1
}

// The red arrow has no target while the Synth is inside a mapped dead zone (design v3).
export function redArrowTarget(synth: Vec, dead: ParcelSet): Vec | null {
  return inDeadZone(dead, synth) ? null : synth
}
