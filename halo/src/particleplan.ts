// Round 24 (candidate c24f, NOT FINAL): the `particles` command. This file is PURE (no SDK import) so the tests can load it: it turns a server command into a validated plan of emitters with hard caps.
// kinds: fire (flames), smoke (a rising column), sparks (a short additive burst). The recipes are the drafts in docs\EMANATE-VISUAL-GAP-SHEET.md, to be tuned on the held screen test.
// Without a texture a particle is a flat coloured square (render.wgsl draws one quad per particle): that is the default; `textured` (the server setting fx.particleTexture) switches every emitter to images/puff.png.

export const PARTICLE_KINDS = ['fire', 'smoke', 'sparks'] as const
export type ParticleKind = (typeof PARTICLE_KINDS)[number]

/** the hard caps: whatever the server sends, the halo stays inside them */
export const PCAP = {
  emittersPerCommand: 3, // stacked emitters of one command
  liveEmitters: 6, // alive at once, across all commands (the oldest effect is dropped first)
  rate: 120, // particles a second, one emitter
  maxParticles: 600, // alive, one emitter
  lifetime: 12, // seconds a particle lives
  size: 8, // metres, one particle, at its largest
  seconds: 60, // how long an effect runs
  height: 200, // metres of reach (the same cap as the library smoke)
  speed: 40, // m/s
  spread: 60 // cone half-angle, degrees
}
export type RGBA = [number, number, number, number]
export interface Emitter {
  dx: number; dy: number; dz: number // offset from the command's position
  rate: number; maxParticles: number; lifetime: number; gravity: number
  sizeMin: number; sizeMax: number; sizeOverStart: number; sizeOverEnd: number
  speedMin: number; speedMax: number
  shape: { kind: 'point' } | { kind: 'cone'; angle: number; radius: number } | { kind: 'box'; x: number; y: number; z: number }
  colorMin: RGBA; colorMax: RGBA; fadeStart: RGBA; fadeEnd: RGBA
  blend: 'alpha' | 'add'
  textured: boolean
}
export interface ParticlePlan { kind: ParticleKind; seconds: number; emitters: Emitter[] }

const COLORS: Record<string, [number, number, number]> = {
  red: [1, 0.12, 0.08], orange: [1, 0.5, 0.1], yellow: [1, 0.9, 0.15], green: [0.2, 0.9, 0.3], blue: [0.2, 0.5, 1], cyan: [0.2, 0.9, 1],
  purple: [0.62, 0.2, 1], pink: [1, 0.35, 0.75], white: [1, 1, 1], black: [0.05, 0.05, 0.07], grey: [0.4, 0.4, 0.44]
}
const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const c01 = (v: unknown) => clamp(fin(v, 0), 0, 1)
export function colorOf(c: unknown, dflt: [number, number, number]): [number, number, number] {
  if (typeof c === 'string' && COLORS[c]) return COLORS[c]!
  if (Array.isArray(c) && c.length >= 3) return [c01(c[0]), c01(c[1]), c01(c[2])]
  return dflt
}

/** Validate one command and plan its emitters; null = not a particles command this halo understands (unknown kind). Every number is finite-checked and clamped. */
export function planParticles(kind: unknown, p: any, textured: boolean): ParticlePlan | null {
  if (typeof kind !== 'string' || !(PARTICLE_KINDS as readonly string[]).includes(kind)) return null
  p = p && typeof p === 'object' ? p : {}
  const size = clamp(fin(p.size, 2), 0.2, PCAP.size)
  const seconds = clamp(fin(p.seconds, 6), 0.5, PCAP.seconds)
  const height = clamp(fin(p.height, kind === 'smoke' ? 100 : 6), 0.5, PCAP.height)
  const density = clamp(fin(p.n, 1), 0.1, 2) // 1 = the recipe's own rate
  const k = kind as ParticleKind
  const em: Emitter[] = []
  if (k === 'smoke') {
    // a rising column: reach = speed x lifetime (gravity 0 keeps it exact): about 150 m needs speed 14 to 16 with lifetime 10; 200 m caps at speed 20 with lifetime 10
    const lifetime = height > 60 ? 10 : clamp(height / 3, 2, 10)
    const speed = clamp(height / lifetime, 0.2, PCAP.speed)
    const col = colorOf(p.color, [1, 0.25, 0.05])
    const n = height > 120 ? 2 : 1 // very tall columns: two stacked emitters (the second one starts half way up, so the density holds along the whole height)
    for (let i = 0; i < Math.min(n, PCAP.emittersPerCommand); i++) {
      em.push({
        dx: 0, dy: i * height * 0.5, dz: 0, rate: clamp(30 * density, 1, PCAP.rate), maxParticles: PCAP.maxParticles, lifetime, gravity: 0,
        sizeMin: size * 0.8, sizeMax: size * 1.2, sizeOverStart: 1, sizeOverEnd: 3.5,
        speedMin: speed * 0.9, speedMax: speed * 1.1,
        shape: { kind: 'cone', angle: 6, radius: size * 0.4 },
        colorMin: [col[0], col[1], col[2], 1], colorMax: [col[0], col[1], col[2], 1], fadeStart: [1, 0.3, 0.05, 0.9], fadeEnd: [0.25, 0.04, 0.03, 0],
        blend: 'alpha', textured
      })
    }
  } else if (k === 'fire') {
    const col = colorOf(p.color, [1, 0.45, 0.05])
    const rise = clamp(height, 0.5, 30) // flames reach a few metres: the speed gives the reach over the lifetime
    em.push({
      dx: 0, dy: 0, dz: 0, rate: clamp(60 * density, 1, PCAP.rate), maxParticles: 400, lifetime: 1.6, gravity: -0.1,
      sizeMin: size * 0.6, sizeMax: size, sizeOverStart: 1, sizeOverEnd: 0.2,
      speedMin: rise / 1.6 * 0.7, speedMax: rise / 1.6,
      shape: p.shape === 'box' ? { kind: 'box', x: clamp(fin(p.width, size), 0.1, 20), y: 0.2, z: 0.3 } : { kind: 'cone', angle: 18, radius: size * 0.5 },
      colorMin: [col[0], col[1] * 0.7, col[2], 1], colorMax: [col[0], col[1], col[2], 1], fadeStart: [1, 0.7, 0.2, 1], fadeEnd: [1, 0.1, 0, 0],
      blend: 'add', textured
    })
  } else {
    const col = colorOf(p.color, [1, 0.9, 0.5])
    em.push({
      dx: 0, dy: 0, dz: 0, rate: clamp(200 * density, 1, PCAP.rate), maxParticles: 300, lifetime: 0.6, gravity: 0.5,
      sizeMin: Math.min(size, 0.3) * 0.5, sizeMax: Math.min(size, 0.3), sizeOverStart: 1, sizeOverEnd: 0.3,
      speedMin: 4, speedMax: clamp(6 + size * 2, 6, 14),
      shape: { kind: 'point' },
      colorMin: [col[0], col[1], col[2], 1], colorMax: [1, 1, 1, 1], fadeStart: [1, 1, 1, 1], fadeEnd: [col[0], col[1], col[2], 0],
      blend: 'add', textured // sparks are ADDITIVE with no texture: small squares that read as a spark field
    })
  }
  for (const e of em) { // the final clamp: nothing above the caps leaves this function
    e.rate = clamp(e.rate, 1, PCAP.rate); e.maxParticles = clamp(Math.round(e.maxParticles), 1, PCAP.maxParticles); e.lifetime = clamp(e.lifetime, 0.1, PCAP.lifetime)
    e.sizeMax = clamp(e.sizeMax, 0.05, PCAP.size); e.sizeMin = clamp(e.sizeMin, 0.05, e.sizeMax)
    e.speedMax = clamp(e.speedMax, 0, PCAP.speed); e.speedMin = clamp(e.speedMin, 0, e.speedMax)
    if (e.shape.kind === 'cone') e.shape.angle = clamp(e.shape.angle, 0, PCAP.spread)
  }
  return { kind: k, seconds, emitters: em.slice(0, PCAP.emittersPerCommand) }
}

/** which effects to drop so that no more than PCAP.liveEmitters emitters live: oldest first. counts = emitter counts per live effect, oldest first; `adding` = the new effect's emitters. Returns how many of the OLDEST effects to remove. */
export function dropOldest(counts: number[], adding: number): number {
  let total = counts.reduce((a, b) => a + b, 0) + adding
  let drop = 0
  while (total > PCAP.liveEmitters && drop < counts.length) { total -= counts[drop]!; drop++ }
  return drop
}
