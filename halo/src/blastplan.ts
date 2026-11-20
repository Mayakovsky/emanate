// c27: the pure blast planner (no SDK): tested on its own
import { BLAST } from './settings'
type V = { x: number; y: number; z: number }
export type BlastCfg = typeof BLAST
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
/** pure planner (tested): from the wearer's world position, a centre, a radius and a seed: the planned landing, the launch speeds. The ballistic model: rise at riseGravity, fall at gravity. */
export function planBlast(from: V, centre: V, radius: number, seed: number, B: BlastCfg = BLAST, scale = 1) {
  const r = rng(seed)
  const d = radius * Math.sqrt(r()), th = r() * Math.PI * 2
  const lim = (v: number) => Math.max(-B.bounds, Math.min(B.bounds, v))
  const land = { x: lim(centre.x + d * Math.cos(th)), y: 0, z: lim(centre.z + d * Math.sin(th)) }
  const dx = land.x - from.x, dz = land.z - from.z
  const dist = Math.hypot(dx, dz)
  let H = (B.apexMin + r() * (B.apexMax - B.apexMin)) * scale
  const up = (h: number) => { const vUp = Math.sqrt(2 * B.riseGravity * h); return { vUp, T: vUp / B.riseGravity + Math.sqrt(2 * h / B.gravity) } }
  let u = up(H)
  if (dist / u.T > B.vMax) { // too far for this height at the speed ceiling: raise the apex until it fits (never beyond 4 x apexMax)
    for (let i = 0; i < 60 && dist / u.T > B.vMax && H < 4 * B.apexMax; i++) { H *= 1.1; u = up(H) }
  }
  const vh = Math.min(B.vMax, dist / u.T)
  const dir = dist > 1e-6 ? { x: dx / dist, y: 0, z: dz / dist } : { x: 1, y: 0, z: 0 }
  return { land, dist, apex: H, vUp: u.vUp, vh, dir, flight: u.T }
}

/** the timeline of the blast bubble as a scale factor (0 = gone) at t seconds: expand, hold (breathing), implode */
export function bubbleScale(t: number, E: number, H: number, I: number): number {
  if (t < 0) return 0
  if (t < E) { const x = t / E; return 1 - Math.pow(1 - x, 3) } // fast start, soft arrival
  if (t < E + H) return 1 + 0.03 * Math.sin(((t - E) / Math.max(0.5, H)) * Math.PI * 2) * Math.sin(((t - E) / Math.max(0.5, H)) * Math.PI) // breathing that is zero at both ends of the hold
  if (t < E + H + I) { const x = (t - E - H) / I; return 1 - x * x * x } // slow start, then in on itself
  return 0
}
