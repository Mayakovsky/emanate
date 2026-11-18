// Round 16: when the Synth (level 3 only) flies to escape or hide. Pure choices, unit tested; the brain (synthai.ts) owns the timing.
// A flight ends either ON a roof (a standable spot a player can also reach by flying) or HOVERING above a standable spot, and from the hover it later lands on
// that spot: so a flight always ends where a flying player can follow.
import type { Vec } from './geo.ts'
import type { NavSpot } from './synthai.ts'

export interface FlyCfg {
  flyEnabled: boolean
  flyCooldownSeconds: number // between flights
  flyMaxAltitude: number // m: the highest y the brain asks for (the world ceiling is 200)
  flyPreference: number // 0..1: how often a flight is preferred to running when one is possible
  flyMaxSeconds: number // the keep-running cap for a flight
  flyRange: number // m: the farthest target from where it stands
  flyMinRange: number // m: the nearest
  flyTriggerDistance: number // m: a player this close
  flyRoofMinRel: number // m above the local ground that counts as a roof
  flySkyHeight: number // m above the landing spot for a hover
  flyRoofShare: number // 0..1: how often a roof is chosen over a sky hover when both exist
}

export interface FlightTarget {
  kind: 'roof' | 'sky'
  x: number
  y: number
  z: number
  /** the spot it lands on afterwards (a roof lands where it already is) */
  landing: { x: number; y: number; z: number } | null
}

export function canFly(cfg: FlyCfg, level: number, now: number, lastFlightAt: number, playerDist: number | null, rng: () => number): boolean {
  if (!cfg.flyEnabled || level < 3) return false
  if (now - lastFlightAt < cfg.flyCooldownSeconds * 1000) return false
  if (playerDist === null || playerDist > cfg.flyTriggerDistance) return false
  return rng() < cfg.flyPreference
}

/** Choose where to fly: from the reachable standable spots (which a flying player can reach too), far from the chaser, within range and under the altitude limit. */
export function pickFlightTarget(synth: Vec, from: Vec, spots: NavSpot[], cfg: FlyCfg, rng: () => number, avoid: { x: number; z: number }[] = []): FlightTarget | null {
  const here = Math.hypot(synth.x - from.x, synth.z - from.z)
  const dS = (p: { x: number; z: number }) => Math.hypot(p.x - synth.x, p.z - synth.z)
  const dP = (p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z)
  const usable = spots.filter((p) => dS(p) >= cfg.flyMinRange && dS(p) <= cfg.flyRange && dP(p) > here + 15 && !avoid.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 5))
  const score = (p: NavSpot) => Math.min(dP(p), 150) + p.rel * 0.5 - 0.2 * dS(p)
  const roofs = usable.filter((p) => p.rel >= cfg.flyRoofMinRel && p.y <= cfg.flyMaxAltitude).sort((a, b) => score(b) - score(a))
  const grounds = usable.filter((p) => p.y + cfg.flySkyHeight <= cfg.flyMaxAltitude).sort((a, b) => score(b) - score(a))
  const wantRoof = roofs.length > 0 && (grounds.length === 0 || rng() < cfg.flyRoofShare)
  if (wantRoof) {
    const p = roofs[Math.min(roofs.length - 1, Math.floor(rng() * Math.min(3, roofs.length)))]
    return { kind: 'roof', x: p.x, y: p.y, z: p.z, landing: null }
  }
  if (grounds.length) {
    const p = grounds[Math.min(grounds.length - 1, Math.floor(rng() * Math.min(3, grounds.length)))]
    return { kind: 'sky', x: p.x, y: Math.min(cfg.flyMaxAltitude, p.y + cfg.flySkyHeight), z: p.z, landing: { x: p.x, y: p.y, z: p.z } }
  }
  return null
}
