// Round 14 item 3: reading how a hunter chases, so the Synth can change its hiding (setting `adaptToPlayerStyle`, default OFF).
// A hunter's style is measured from the path of the nearest player around the Synth over a sliding window, from two numbers:
//   straightness = net displacement / path length of the chaser's path (1 = a straight line, near 0 = going in circles)
//   repetition   = the share of the path's 4 m cells that the chaser enters again after leaving them (0 = always new ground, 1 = going over the same ground)
// methodical: straightness >= 0.7 and repetition <= 0.15 (a steady line of pursuit that sweeps new ground)
// chaotic:    straightness <= 0.4 or repetition >= 0.35 (doubling back, circling, lunging around)
// otherwise 'unknown' (also while there are fewer than 8 samples or less than 12 m of path), and the Synth hides as set.
import type { Vec } from './geo.ts'

export type HunterStyle = 'methodical' | 'chaotic' | 'unknown'
export const STYLE_CONFIG = {
  windowSeconds: 30, // how much of the chase is read
  minSamples: 8, // samples before a style is called
  minPathMetres: 12, // path length before a style is called
  watchRadius: 60, // m: only a chaser this close to the Synth is read
  cellMetres: 4,
  methodicalStraightness: 0.7,
  methodicalRepetition: 0.15,
  chaoticStraightness: 0.4,
  chaoticRepetition: 0.35
}

export function pathMetrics(path: Vec[], cell = STYLE_CONFIG.cellMetres): { length: number; straightness: number; repetition: number } {
  let length = 0
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
  const net = path.length > 1 ? Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].z - path[0].z) : 0
  const seen = new Set<string>()
  let last = ''
  let entries = 0
  let reentries = 0
  for (const p of path) {
    const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell)
    if (k === last) continue
    last = k
    entries++
    if (seen.has(k)) reentries++
    seen.add(k)
  }
  return { length, straightness: length > 0 ? net / length : 1, repetition: entries > 0 ? reentries / entries : 0 }
}

export function classifyPath(path: Vec[], cfg = STYLE_CONFIG): HunterStyle {
  if (path.length < cfg.minSamples) return 'unknown'
  const m = pathMetrics(path, cfg.cellMetres)
  if (m.length < cfg.minPathMetres) return 'unknown'
  if (m.straightness <= cfg.chaoticStraightness || m.repetition >= cfg.chaoticRepetition) return 'chaotic'
  if (m.straightness >= cfg.methodicalStraightness && m.repetition <= cfg.methodicalRepetition) return 'methodical'
  return 'unknown'
}

export class StyleTracker {
  private samples: { t: number; p: Vec }[] = []
  cfg: typeof STYLE_CONFIG
  constructor(cfg = STYLE_CONFIG) { this.cfg = cfg }
  /** one reading: the Synth's position, every player's, and the clock in ms. The nearest player inside the watch radius is the chaser. */
  observe(synth: Vec, players: Vec[], nowMs: number) {
    let best: Vec | null = null
    let bd = this.cfg.watchRadius
    for (const p of players) {
      const d = Math.hypot(p.x - synth.x, p.z - synth.z)
      if (d <= bd) { bd = d; best = p }
    }
    if (best) this.samples.push({ t: nowMs, p: { ...best } })
    const from = nowMs - this.cfg.windowSeconds * 1000
    this.samples = this.samples.filter((s) => s.t >= from)
  }
  style(): HunterStyle { return classifyPath(this.samples.map((s) => s.p), this.cfg) }
  reset() { this.samples = [] }
}

/** What the Synth changes for each style. A methodical hunter sweeps new ground in a line, so the Synth breaks the pattern: it goes dense and high and runs further before hiding.
 * A chaotic hunter lunges and circles near the Synth, so the Synth goes for open, low ground with a long clear run-off and short hides. Returns overrides for the hiding settings. */
export function styleOverrides(style: HunterStyle): { terrainPreference?: number; highLowPreference?: number; pattern?: 'long-run-short-hide' | 'short-run-long-hide' } {
  if (style === 'methodical') return { terrainPreference: 0.9, highLowPreference: 0.8, pattern: 'long-run-short-hide' }
  if (style === 'chaotic') return { terrainPreference: 0.3, highLowPreference: 0.1, pattern: 'short-run-long-hide' }
  return {}
}
