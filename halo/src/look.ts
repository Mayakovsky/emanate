// c29 (Directive U2, docs\EMANATE-FX-PLAN-V2.md): ONE fire-and-smoke look for every effect except the arrows.
// This file is PURE (no SDK import) so the tests can load it. It holds: the five materials, the base-shape emitter placements, the
// recipes for effects E1..E14 as DATA, the caps, a fixed random sequence (no Math.random in effects) and the server `look` overrides.
// A recipe + a place + a time gives a LookPlan: a list of emitter specs. lookfx.ts turns the specs into ParticleSystem entities.

export const LCAP = {
  emitters: 160, // c30b (Directive W): live emitters, whole Halo (more volume: stacked smoke, burning-house portals); the oldest effect is dropped first. Server-settable: look key `cap.emitters` (8..240)
  particles: 30000, // c30b: live particles, whole Halo (sum of rate x lifetime, capped by each emitter's maxParticles). Server-settable: look key `cap.particles` (500..40000)
  effectEmitters: 48, // c30b: the most emitters ONE effect may ask for (no server value can make one effect stall the scene: a 5000 m bubble once asked for ~6000)
  effectParticles: 9000, // c30b: the most live particles ONE effect may hold; above it every rate is scaled down
  bigSize: 40, // c30b: the particle size cap of the two exempt looks (E13 the blast, E12 the Glimpse: both locked by Forces)
  bubbleRadius: 15, // c30b: the lobby bubble (E5) and the burst (E6) are drawn with a radius of at most 15 m (30 m across), whatever the server sends
  drops: 6, // c30: upgrade drops drawn at once (3 emitters each = 18, RESERVED: never removed to make room). Server-settable: look key `cap.drops`
  rate: 400, // particles a second, one emitter
  maxParticles: 1000, // alive, one emitter (the SDK default)
  lifetime: 14, // seconds a particle lives
  size: 8, // c30b: metres, one particle at its largest (start AND end of its life); use more particles and emitters, not bigger ones
  seconds: 60, // how long an effect runs
  reach: 200 // metres of reach (smoke to the sky top)
}

// ---------------------------------------------------------------- the fixed random sequence
/** a small seeded generator (mulberry32): the same seed gives the same numbers, so an effect looks the same every time it plays */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// ---------------------------------------------------------------- types
export type RGBA = [number, number, number, number]
export type V3 = [number, number, number]
export type MaterialName = 'fire' | 'smoke' | 'embers' | 'glow' | 'crackle' | 'ash' | 'flame' // 'flame' = the ORIGINAL c29b fire, used by the archetypes // c30b: 'ash' = the c30a smoke, kept for the two locked looks (E13 blast, E12 Glimpse)
export type ShapeSpec = { kind: 'point' } | { kind: 'cone'; angle: number; radius: number } | { kind: 'box'; x: number; y: number; z: number } | { kind: 'sphere'; radius: number }
/** one particle emitter, everything the SDK component needs (no SDK types) */
export interface EmitterSpec {
  pos: V3 // offset from the effect's place (m)
  up: boolean // cone and box shapes emit along the entity's forward axis: turn -90 degrees about X so it points UP
  shape: ShapeSpec
  tex: string // images/<tex>.png in the zip
  flip?: { x: number; y: number; fps: number } // sprite sheet (the flame flipbook)
  rate: number; maxParticles: number; lifetime: number; gravity: number
  sizeMin: number; sizeMax: number; sizeStart: number; sizeEnd: number // size lerp over the particle's life
  speedMin: number; speedMax: number
  c0: RGBA; c1: RGBA // initial colour range
  from: RGBA; to: RGBA // colour over life
  group?: number // which part of the effect (a lookfx timeline moves one group)
  at?: number; dur?: number // c30: a window in the effect's time: the emitter is on from `at` for `dur` seconds (the Storm's sixteen bursts, one after another)
}
export interface LookPlan { id: string; seconds: number; emitters: EmitterSpec[]; follow?: boolean; reserved?: boolean; big?: boolean } // big: the size cap is LCAP.bigSize (the locked looks) // follow: the effect's emitters move with the wearer (the Aurora); reserved: never removed to make room (upgrade drops)

// ---------------------------------------------------------------- the five materials (plan section 2)
export interface MaterialDef {
  tex: string; flip?: { x: number; y: number; fps: number }
  rate: number; lifetime: number; gravity: number
  size: [number, number]; sizeOver: [number, number]; speed: [number, number]
  from: RGBA; to: RGBA // colour ramp, start to end (alpha fades out)
  spread: number // cone half-angle (deg) for column-style bases
}
export const MATERIALS: Record<MaterialName, MaterialDef> = {
  // c30b (Directive W): fire is less see-through (start 0.9, still 0.35 when it dies) and bigger; smoke is near-black and dense (0.95, still 0.55 at the end) and never grows past 8 m
  fire: { tex: 'flipbook', flip: { x: 4, y: 4, fps: 12 }, rate: 80, lifetime: 1.8, gravity: -0.1, size: [4, 7], sizeOver: [1, 0.45], speed: [3, 6], from: [1, 0.85, 0.3, 0.9], to: [0.95, 0.15, 0, 0.35], spread: 18 },
  smoke: { tex: 'wisp', rate: 60, lifetime: 9, gravity: 0, size: [4.5, 6], sizeOver: [1, 1.3], speed: [4, 10], from: [0.05, 0.04, 0.04, 0.95], to: [0.02, 0.02, 0.02, 0.55], spread: 6 },
  flame: { tex: 'flipbook', flip: { x: 4, y: 4, fps: 12 }, rate: 60, lifetime: 1.8, gravity: -0.1, size: [3, 5], sizeOver: [1, 0.2], speed: [3, 6], from: [1, 0.85, 0.3, 0.95], to: [0.95, 0.15, 0, 0], spread: 18 },
  ash: { tex: 'wisp', rate: 40, lifetime: 9, gravity: 0, size: [4, 7], sizeOver: [1, 3.5], speed: [4, 10], from: [0.95, 0.1, 0.03, 0.95], to: [0.3, 0.02, 0.02, 0], spread: 6 },
  embers: { tex: 'spark', rate: 40, lifetime: 1.6, gravity: 0.4, size: [0.4, 0.9], sizeOver: [1, 0.3], speed: [3, 9], from: [1, 0.8, 0.25, 1], to: [1, 0.3, 0.05, 0], spread: 50 },
  glow: { tex: 'glow', rate: 10, lifetime: 2.5, gravity: 0, size: [8, 14], sizeOver: [1, 1.6], speed: [0, 0.4], from: [1, 0.3, 0.1, 0.35], to: [1, 0.2, 0.05, 0], spread: 180 },
  crackle: { tex: 'crackle', rate: 90, lifetime: 0.35, gravity: 0, size: [0.3, 0.7], sizeOver: [1, 0.4], speed: [0.5, 3], from: [0.8, 0.95, 1, 1], to: [0.8, 0.95, 1, 0], spread: 180 }
}

// ---------------------------------------------------------------- base shapes: where the emitters sit (plan section 3)
const PHI = (1 + Math.sqrt(5)) / 2
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
/** corner tables of the solids, unit radius */
export const SOLIDS: Record<string, V3[]> = {
  tetrahedron: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => norm(v as V3)),
  octahedron: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3[],
  cube: [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map((v) => norm(v as V3)),
  icosahedron: [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map((v) => norm(v as V3)),
  dodecahedron: [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1], [0, 1 / PHI, PHI], [0, 1 / PHI, -PHI], [0, -1 / PHI, PHI], [0, -1 / PHI, -PHI], [1 / PHI, PHI, 0], [1 / PHI, -PHI, 0], [-1 / PHI, PHI, 0], [-1 / PHI, -PHI, 0], [PHI, 0, 1 / PHI], [PHI, 0, -1 / PHI], [-PHI, 0, 1 / PHI], [-PHI, 0, -1 / PHI]].map((v) => norm(v as V3))
}
// the 20 faces of the icosahedron (triangles of corner indexes), so the face centres can be used too: 12 corners + 20 face centres = 32 even points on a sphere
const ICO_FACES: [number, number, number][] = (() => {
  const V = SOLIDS.icosahedron!, out: [number, number, number][] = [], e = Math.hypot(V[0]![0] - V[1]![0], V[0]![1] - V[1]![1], V[0]![2] - V[1]![2]) * 1.01
  const d = (a: number, b: number) => Math.hypot(V[a]![0] - V[b]![0], V[a]![1] - V[b]![1], V[a]![2] - V[b]![2])
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) if (d(a, b) < e && d(b, c) < e && d(a, c) < e) out.push([a, b, c])
  return out
})()
/** n even points on a unit sphere: 12 icosahedron corners, then 20 face centres, then (beyond 32) the 30 edge midpoints; n clamped to 1..62 */
export function spherePoints(n: number): V3[] {
  const V = SOLIDS.icosahedron!, pts: V3[] = [...V]
  for (const [a, b, c] of ICO_FACES) pts.push(norm([V[a]![0] + V[b]![0] + V[c]![0], V[a]![1] + V[b]![1] + V[c]![1], V[a]![2] + V[b]![2] + V[c]![2]]))
  const seen = new Set<string>()
  for (const [a, b, c] of ICO_FACES) for (const [p, q] of [[a, b], [b, c], [a, c]] as [number, number][]) { const k = Math.min(p, q) + '_' + Math.max(p, q); if (!seen.has(k)) { seen.add(k); pts.push(norm([V[p]![0] + V[q]![0], V[p]![1] + V[q]![1], V[p]![2] + V[q]![2]])) } }
  return pts.slice(0, Math.max(1, Math.min(62, Math.round(n))))
}
export const column = (height: number, n: number): V3[] => Array.from({ length: Math.max(1, n) }, (_, i) => [0, n === 1 ? 0 : (i / (n - 1)) * height, 0] as V3)
export const ringPts = (radius: number, n: number, y = 0): V3[] => Array.from({ length: Math.max(1, n) }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * radius, y, Math.sin(a) * radius] as V3 })
/** a vertical oval in the x/y plane: width w, height h, centre at height h/2 */
export const ovalPts = (w: number, h: number, n: number): V3[] => Array.from({ length: Math.max(1, n) }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2, 0] as V3 })
/** a line from a to b with n emitters and a jagged sideways offset taken from the fixed sequence */
export function linePts(a: V3, b: V3, n: number, jag: number, r: () => number): V3[] {
  return Array.from({ length: Math.max(2, n) }, (_, i) => { const t = i / (Math.max(2, n) - 1), end = i === 0 || i === Math.max(2, n) - 1; return [a[0] + (b[0] - a[0]) * t + (end ? 0 : (r() - 0.5) * jag), a[1] + (b[1] - a[1]) * t + (end ? 0 : (r() - 0.5) * jag * 0.4), a[2] + (b[2] - a[2]) * t + (end ? 0 : (r() - 0.5) * jag)] as V3 })
}
/** a standing figure h tall: head, chest, hips, feet */
export const figurePts = (h: number): V3[] => [[0, h * 0.92, 0], [0, h * 0.7, 0], [0, h * 0.45, 0], [0, h * 0.05, 0]]

// ---------------------------------------------------------------- emitter builders
const f = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const col = (c: RGBA | undefined, d: RGBA): RGBA => (c ? c : d)
export interface Tweak { // per-layer overrides, all optional (the server `look` section writes these)
  rate?: number; size?: number; life?: number; speed?: number; alpha?: number; color?: RGBA; colorEnd?: RGBA; spread?: number; count?: number
}
/** one emitter of material `m` at `pos`, with the shape/direction a base wants, then the tweak */
export function emit(m: MaterialName, pos: V3, shape: ShapeSpec, up: boolean, t: Tweak = {}, group = 0): EmitterSpec {
  const d = MATERIALS[m], size = f(t.size, 1)
  const from = t.color ? ([t.color[0], t.color[1], t.color[2], d.from[3] * f(t.alpha, 1)] as RGBA) : ([d.from[0], d.from[1], d.from[2], d.from[3] * f(t.alpha, 1)] as RGBA)
  const to = t.colorEnd ? t.colorEnd : t.color ? ([t.color[0] * 0.3, t.color[1] * 0.3, t.color[2] * 0.3, 0] as RGBA) : d.to
  const life = d.lifetime * f(t.life, 1), spd = f(t.speed, 1)
  return {
    pos, up, shape, tex: d.tex, flip: d.flip, rate: d.rate * f(t.rate, 1), maxParticles: 1000, lifetime: life, gravity: d.gravity,
    sizeMin: d.size[0] * size, sizeMax: d.size[1] * size, sizeStart: d.sizeOver[0], sizeEnd: d.sizeOver[1],
    speedMin: d.speed[0] * spd, speedMax: d.speed[1] * spd,
    c0: from, c1: from, from, to, group
  }
}
export const coneUp = (m: MaterialName, radius: number, t?: Tweak): ShapeSpec => ({ kind: 'cone', angle: f(t?.spread, MATERIALS[m].spread), radius })
export const pointShape: ShapeSpec = { kind: 'point' }

// ---------------------------------------------------------------- the final clamp: nothing above the caps leaves this function
export function clampEmitter(e: EmitterSpec, big = false): EmitterSpec {
  e.rate = cl(f(e.rate, 1), 0.5, LCAP.rate); e.maxParticles = cl(Math.round(f(e.maxParticles, 100)), 1, LCAP.maxParticles); e.lifetime = cl(f(e.lifetime, 1), 0.1, LCAP.lifetime)
  e.sizeStart = cl(f(e.sizeStart, 1), 0.01, 8); e.sizeEnd = cl(f(e.sizeEnd, 1), 0.01, 8)
  const cap = (big ? LCAP.bigSize : LCAP.size) / (big ? 1 : Math.max(1, e.sizeStart, e.sizeEnd)) // c30b: the size at its largest moment of life stays under the cap
  e.sizeMax = cl(f(e.sizeMax, 1), 0.05, cap); e.sizeMin = cl(f(e.sizeMin, 1), 0.05, e.sizeMax)
  for (let i = 0; i < 3; i++) e.pos[i] = cl(f(e.pos[i], 0), -2000, 2000)
  if (e.shape.kind === 'box') { e.shape.x = cl(f(e.shape.x, 1), 0.01, 400); e.shape.y = cl(f(e.shape.y, 1), 0.01, 400); e.shape.z = cl(f(e.shape.z, 1), 0.01, 400) }
  e.speedMax = cl(f(e.speedMax, 0), 0, 60); e.speedMin = cl(f(e.speedMin, 0), 0, e.speedMax)
  if (e.shape.kind === 'cone') e.shape.angle = cl(e.shape.angle, 0, 180)
  if (e.shape.kind === 'sphere') e.shape.radius = cl(f(e.shape.radius, 1), 0.01, 400)
  if (e.shape.kind === 'cone') e.shape.radius = cl(f(e.shape.radius, 0.1), 0.01, 400)
  return e
}
/** c30b: ONE effect never asks for more than LCAP.effectEmitters emitters or LCAP.effectParticles live particles (the rates are scaled down to fit), whatever the server sends */
export function capPlan(em: EmitterSpec[], big = false): EmitterSpec[] {
  const out = em.slice(0, LCAP.effectEmitters).map((e) => clampEmitter(e, big))
  const total = out.reduce((a, e) => a + liveParticles(e), 0)
  if (total > LCAP.effectParticles) { const k = LCAP.effectParticles / total; for (const e of out) { e.rate = Math.max(0.5, e.rate * k); e.maxParticles = Math.max(1, Math.floor(e.maxParticles * k)) } }
  return out
}
/** live particles an emitter holds at steady state (rate x lifetime, capped by maxParticles) */
export const liveParticles = (e: EmitterSpec) => Math.min(e.maxParticles, Math.ceil(e.rate * e.lifetime))

/** which effects to drop (oldest first) so that neither the emitter nor the particle cap is exceeded after adding `add` (emitters, particles).
 *  `reserved` effects (upgrade drops) are counted but never chosen. `extra` = emitters that live outside the list (the blast bubbles and trails). Returns how many of the NON-reserved effects to drop, oldest first. */
export function dropCount(live: { emitters: number; particles: number; reserved?: boolean }[], add: { emitters: number; particles: number }, caps: { emitters: number; particles: number } = LCAP, extra = 0): number {
  let em = live.reduce((a, b) => a + b.emitters, 0) + add.emitters + extra, pa = live.reduce((a, b) => a + b.particles, 0) + add.particles, n = 0
  for (const l of live) {
    if (!(em > caps.emitters || pa > caps.particles)) break
    if (l.reserved) continue
    em -= l.emitters; pa -= l.particles; n++
  }
  return n
}
/** the live caps with the server's overrides (look keys cap.emitters, cap.particles, cap.drops), each clamped */
export function capsOf(look: LookData | undefined): { emitters: number; particles: number; drops: number } {
  const g = (k: string, d: number, lo: number, hi: number) => { const v = Number(look?.['cap.' + k]); return look && look['cap.' + k] !== undefined && Number.isFinite(v) ? cl(v, lo, hi) : d }
  return { emitters: g('emitters', LCAP.emitters, 8, 240), particles: g('particles', LCAP.particles, 500, 40000), drops: g('drops', LCAP.drops, 0, 12) }
}

// ---------------------------------------------------------------- the server `look` section: flat keys, key < 40 chars, value < 200 chars
/** `look` keys are `<effect>.<layer>.<field>` (for example `E13.smoke.size` = 1.2) or `<effect>.color` (a list "r,g,b"). Unknown keys are ignored; every number is clamped. */
export type LookData = Record<string, number | string>
export function tweakFor(look: LookData | undefined, effect: string, layer: string): Tweak {
  const g = (k: string) => look?.[`${effect}.${layer}.${k}`]
  const num = (k: string, lo: number, hi: number) => { const v = Number(g(k)); return Number.isFinite(v) && g(k) !== undefined ? cl(v, lo, hi) : undefined }
  const rgb = (k: string) => { const s = g(k); if (typeof s !== 'string') return undefined; const p = s.split(',').map(Number); return p.length >= 3 && p.every(Number.isFinite) ? ([cl(p[0]!, 0, 1), cl(p[1]!, 0, 1), cl(p[2]!, 0, 1), 1] as RGBA) : undefined }
  return { rate: num('rate', 0, 4), size: num('size', 0.1, 4), life: num('life', 0.1, 4), speed: num('speed', 0, 4), alpha: num('alpha', 0, 1), spread: num('spread', 0, 180), count: num('count', 1, 62), color: rgb('color'), colorEnd: rgb('colorEnd') }
}
/** drop undefined keys so a tweak never overrides a default with undefined */
export const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
export const lookOn = (look: LookData | undefined, effect: string) => look?.[`${effect}.on`] !== 0

// ---------------------------------------------------------------- the recipes E1..E14 (Directive V, c30), as data + small planners
export const OPACITY = 0.75 // c30: the blast bubble (E13, kept as it is) is 75 % opaque
export const BUBBLE_OPACITY = 0.8 // c30b (Directive W): the lobby bubble (E5) is 80 % opaque
const SHELL_ALPHA = OPACITY / MATERIALS.ash.from[3] // the multiplier that makes the blast smoke's start alpha exactly OPACITY
const BUBBLE_ALPHA = BUBBLE_OPACITY / MATERIALS.smoke.from[3]
/** c30b (Directive W): a column from y0 to y1, `w` wide, made of `n` stacked box emitters so it stays dense the whole way up (one tall emitter thins out) */
export function stack(m: MaterialName, w: number, y0: number, y1: number, n: number, t: Tweak = {}, group = 0): EmitterSpec[] {
  const h = (y1 - y0) / Math.max(1, n)
  return Array.from({ length: Math.max(1, n) }, (_, i) => emit(m, [0, y0 + h * (i + 0.5), 0], { kind: 'box', x: w, y: w, z: h }, true, t, group))
}
export const SKY_TOP = 200 // m: "max height" for every column (the halo's ceiling)
const RED: RGBA = [0.95, 0.1, 0.03, 1], GOLD: RGBA = [1, 0.8, 0.25, 1]
const WHITE_CYAN: RGBA = [0.8, 0.95, 1, 1]
export const COLORS_NEW = { trap: [0.6, 0.85, 1, 1] as RGBA, auroraGreen: [0.2, 1, 0.6, 1] as RGBA, auroraViolet: [0.6, 0.3, 1, 1] as RGBA, ghost: [0.6, 0.95, 1, 1] as RGBA, pink: [1, 0.35, 0.75, 1] as RGBA, purple: [0.62, 0.2, 1, 1] as RGBA, gold: [1, 0.9, 0.15, 1] as RGBA, green: [0.15, 1, 0.25, 1] as RGBA, grey: [0.5, 0.5, 0.52, 1] as RGBA, amber: [1, 0.75, 0, 1] as RGBA, orange: [1, 0.4, 0, 1] as RGBA }
export const EFFECT_IDS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14'] as const
export type EffectId = (typeof EFFECT_IDS)[number]
export interface PlanParams { r?: number; full?: number; scale?: number; seed?: number; seconds?: number; to?: V3; color?: RGBA; winner?: 'hunters' | 'helpers'; stage?: string; far?: number; alpha?: number; v?: number }
const col2 = (c: RGBA, a = 1): RGBA => [c[0], c[1], c[2], a]
/** a vertical column of height h and width w: an emitter box that emits along its (rotated) forward axis = up, so `speed` makes particles drift upward. Local box size is (w, w, h) because the emitter is turned to point up. */
const colBox = (w: number, h: number): ShapeSpec => ({ kind: 'box', x: w, y: w, z: h })
/** the call portal's colour cycle (E14): the rainbow plus white and black, no brown. Each colour is held for `period` seconds; hues blend into the next hue in the last 30 % of their turn, white and black are plain steps (a blend through black would be brown). */
export const PORTAL_CYCLE: RGBA[] = [[1, 0.05, 0.05, 1], [1, 0.95, 0.1, 1], [0.1, 1, 0.2, 1], [0.1, 0.95, 1, 1], [0.15, 0.25, 1, 1], [0.7, 0.2, 1, 1], [1, 0.25, 0.8, 1], [1, 1, 1, 1], [0.02, 0.02, 0.03, 1]]
export function cycleColor(t: number, period = 1.2): RGBA {
  const n = PORTAL_CYCLE.length, k = Math.floor(t / period), a = PORTAL_CYCLE[((k % n) + n) % n]!, b = PORTAL_CYCLE[(((k + 1) % n) + n) % n]!
  const frac = t / period - k
  const hue = (i: number) => i < 7 // the first seven are hues: red .. pink; white (7) and black (8) are steps
  if (hue(((k % n) + n) % n) && hue((((k + 1) % n) + n) % n) && frac > 0.7) { const f = (frac - 0.7) / 0.3; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 1] }
  return a
}
/** Plasma Portal (E7 = PP1, E11 = PP2, E14 = PP3): ONE recipe, three versions that differ only in colour (c30b, Directive W): a three-storey house on fire.
 *  A fire about 10 m across whose flames reach 12 to 15 m (more than six avatars stacked), crackle through it, and black dense smoke stacked from the fire to the sky top.
 *  `c` = the fire / crackle colour; `embers` = gold embers (PP3). 16 emitters (PP3 17). */
export const PORTAL_LOOK = { base: 10, flame: 15, smokeFrom: 10, smokeSegs: 6, rim: 6 }
function plasmaPortal(id: string, look: LookData | undefined, c: RGBA, embers: boolean): EmitterSpec[] {
  const tw = (l: string) => defined(tweakFor(look, id, l)), em: EmitterSpec[] = [], P = PORTAL_LOOK
  const fireEnd: RGBA = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.35]
  em.push(...stack('smoke', 9, P.smokeFrom, SKY_TOP, P.smokeSegs, { size: 1, rate: 1, speed: 0.12, ...tw('smoke') }, 1)) // black smoke, fire to sky top
  em.push(emit('fire', [0, P.flame * 0.27, 0], colBox(P.base, P.flame * 0.55), true, { size: 1.1, rate: 3, speed: 0.6, color: c, colorEnd: fireEnd, ...tw('fire') }, 2)) // the body of the fire
  em.push(emit('fire', [0, P.flame * 0.72, 0], colBox(P.base * 0.65, P.flame * 0.45), true, { size: 0.9, rate: 2.2, speed: 0.6, color: c, colorEnd: fireEnd, ...tw('fire') }, 2)) // the top: narrower, to 15 m
  em.push(emit('crackle', [0, P.flame / 2, 0], colBox(P.base, P.flame), true, { size: 2.6, rate: 1.5, speed: 0.1, color: c, colorEnd: col2(c, 0), ...tw('crackle') }, 3))
  for (const q of ringPts(P.base * 0.4, P.rim, 0.2)) em.push(emit('fire', q, coneUp('fire', 1.2), true, { size: 1.1, rate: 1.4, speed: 1.4, color: c, colorEnd: fireEnd, ...tw('rim') }, 4)) // flame tongues round the base, licking up to about 15 m
  if (embers) em.push(emit('embers', [0, P.flame, 0], colBox(P.base, P.flame * 2), true, { rate: 1.5, speed: 0.6, color: COLORS_NEW.gold, ...tw('embers') }, 5))
  return em
}
// ---------------------------------------------------------------- c30c (Forces, 2026-11-22): the two ARCHETYPES
// The original Plume (c29b E1) and the original call Portal (c29b E14, the rift oval), with the first palette (the original fire 'flame' and the original smoke 'ash').
// Played on their own with the look command (id 'PLUME' or 'PORTAL'), or assigned to any effect from the server: look key `<effect>.as` = 'PLUME' | 'PORTAL'
// (for example `E7.as` = 'PORTAL'): that effect then draws the archetype at its own place and time, tuned by ITS OWN keys (`E7.fire.size`, `E7.smoke.color`, ...)
// plus two shape keys: `<effect>.scale` (the whole shape, 0.25..4) and `<effect>.height` (the column top in metres, 10..200).
export const ARCHETYPES = ['PLUME', 'PORTAL'] as const
export type ArchetypeId = (typeof ARCHETYPES)[number]
export function archetype(kind: string, key: string, look: LookData | undefined): EmitterSpec[] {
  const tw = (l: string) => defined(tweakFor(look, key, l)), em: EmitterSpec[] = []
  const num = (k: string, d: number, lo: number, hi: number) => { const v = Number(look?.[key + '.' + k]); return look?.[key + '.' + k] !== undefined && Number.isFinite(v) ? cl(v, lo, hi) : d }
  const k = num('scale', 1, 0.25, 4)
  if (kind === 'PLUME') { // the original plume: a column 2.5 m wide, 100 m tall: fire at the base, smoke up the column, a few embers
    const H = num('height', 100, 10, SKY_TOP), n = Math.max(2, Math.ceil(H / 50))
    em.push(emit('flame', [0, 0, 0], coneUp('flame', 1.2 * k), true, { size: 0.8 * k, rate: 1.2, ...tw('fire') }, 1))
    for (let i = 0; i < n; i++) em.push(emit('ash', [0, i * (H * 0.9 / n), 0], coneUp('ash', 1.25 * k), true, { size: 0.9 * k, rate: 1, speed: 2.4, ...tw('smoke') }, 2))
    em.push(emit('embers', [0, 1, 0], coneUp('embers', 1.2 * k), true, { rate: 0.8, ...tw('embers') }, 3))
  } else if (kind === 'PORTAL') { // the original call portal: the rift oval 6 m tall, 3.5 m wide (rim fire, glow heart, crackle) plus a smoke column so it is seen from far; 67 %
    const h = 6 * k, w = 3.5 * k, top = num('height', 100, 10, SKY_TOP), alpha = 0.67
    for (const q of ovalPts(w, h, 12)) em.push(emit('flame', q, coneUp('flame', 0.4 * k), true, { size: 0.55 * k, rate: 0.7, alpha, ...tw('fire') }, 1))
    em.push(emit('glow', [0, h / 2, 0], { kind: 'sphere', radius: Math.min(w, h) / 3 }, false, { size: 0.5 * k, rate: 1.5, alpha: alpha * 1.4, color: [1, 0.93, 0.5, 1], ...tw('glow') }, 2))
    for (const q of ovalPts(w, h, 5)) em.push(emit('crackle', q, { kind: 'sphere', radius: 0.5 * k }, false, { rate: 0.8, ...tw('crackle') }, 3))
    const n = Math.max(1, Math.ceil(top / 100))
    for (let i = 0; i < n; i++) em.push(emit('ash', [0, i * (top / n), 0], coneUp('ash', 1.2 * k), true, { size: 0.8 * k, rate: 0.9, speed: 2.2, alpha, ...tw('smoke') }, 4))
  }
  return em
}

/** plan any effect E1..E14 at its place. `at` is where the effect sits (the emitters' positions are offsets from it, except lines/bubble which carry their own). */
export function planEffect(id: string, p: PlanParams = {}, look?: LookData): LookPlan | null {
  if ((ARCHETYPES as readonly string[]).includes(id)) return { id, seconds: f(p.seconds, id === 'PLUME' ? 14 : 45), emitters: capPlan(archetype(id, id, look), true), big: true } // an archetype on its own
  if (!(EFFECT_IDS as readonly string[]).includes(id)) return null
  if (!lookOn(look, id)) return { id, seconds: 0, emitters: [] }
  const as = typeof look?.[id + '.as'] === 'string' && (ARCHETYPES as readonly string[]).includes(String(look[id + '.as']).toUpperCase()) ? String(look[id + '.as']).toUpperCase() : '' // c30c: this effect is drawn as an archetype
  const r = rng(f(p.seed, 7) + id.length * 131), tw = (l: string) => defined(tweakFor(look, id, l)), em: EmitterSpec[] = []
  let seconds = f(p.seconds, 10)
  let follow = false, reserved = false, big = false
  switch (id) {
    case 'E1': { // Signal Flare (c30b): a big fire at the base, black dense smoke stacked to max height, embers; 14 s
      seconds = 14
      em.push(emit('fire', [0, 0, 0], coneUp('fire', 2.5), true, { size: 1.1, rate: 2.2, speed: 1.1, color: [1, 0.6, 0.12, 1], ...tw('fire') }, 1))
      em.push(emit('fire', [0, 3.5, 0], colBox(3.5, 7), true, { size: 0.9, rate: 1.6, speed: 0.5, color: [1, 0.6, 0.12, 1], ...tw('fire') }, 1))
      em.push(...stack('smoke', 5, 6, SKY_TOP, 6, { size: 0.9, rate: 0.9, speed: 0.15, ...tw('smoke') }, 2))
      em.push(emit('embers', [0, 1, 0], coneUp('embers', 2.5), true, { rate: 1.2, ...tw('embers') }, 3))
      break
    }
    case 'E2': { // Halo Plasma Charge: a thin tube 0.2 m across from the wearer's head to the Synth: fire, crackle, embers in the charge-stage colour (amber, orange)
      seconds = 0.4 // re-planned every few frames while in range
      const to = p.to ?? [0, 0, 8], c = p.color ?? COLORS_NEW.amber, pts = linePts([0, 1.9, 0], to, 5, 0.25, r)
      pts.forEach((q, i) => {
        em.push(emit('crackle', q, { kind: 'sphere', radius: 0.1 }, false, { size: 0.15, rate: 1.4, life: 1, color: c, colorEnd: col2(c, 0), ...tw('crackle') }, 1)) // c30f: a very small skin on the box arcs
        if (i > 0 && i < pts.length - 1) em.push(emit('fire', q, { kind: 'sphere', radius: 0.08 }, false, { size: 0.07, rate: 0.9, speed: 0.2, color: c, colorEnd: [c[0] * 0.5, c[1] * 0.3, 0, 0], ...tw('fire') }, 2))
      })
      em.push(emit('embers', [to[0] / 2, to[1] / 2 + 1.9 / 2, to[2] / 2], { kind: 'sphere', radius: 0.3 }, false, { size: 0.2, rate: 0.5, speed: 0.4, color: c, ...tw('embers') }, 3))
      break
    }
    case 'E3': { // Upgrade Drop: a column 3 m wide, 60 m tall, pink: fire at the foot, rising embers, a glow at the foot (3 emitters: the reserved budget)
      seconds = 60 * 60 * 3 // until a player collects it (the halo removes it when the server's list drops it)
      reserved = true
      // c30b: bigger, fuller pink fire, black smoke stacked up the 60 m column (5 emitters: the reserved budget is 6 x 5 = 30)
      em.push(emit('fire', [0, 0, 0], coneUp('fire', 1.5), true, { size: 0.9, rate: 1.6, speed: 0.9, color: COLORS_NEW.pink, colorEnd: [0.6, 0.1, 0.4, 0.35], ...tw('fire') }, 1))
      em.push(emit('embers', [0, 30, 0], colBox(3, 60), true, { rate: 1.2, speed: 0.6, color: COLORS_NEW.pink, ...tw('embers') }, 2))
      em.push(emit('glow', [0, 0.5, 0], { kind: 'sphere', radius: 0.8 }, false, { size: 0.4, rate: 1.2, color: COLORS_NEW.pink, ...tw('glow') }, 3))
      // c30f (Directive X item 3, baked): the smoke is pink at the base and fades to very pale pink at the top (two layers, same budget as the old 2-box stack)
      const PINK_MID: RGBA = [1, 0.62, 0.86, 0.9], PINK_PALE: RGBA = [1, 0.9, 0.96, 0.55]
      em.push(emit('smoke', [0, 18, 0], colBox(3, 28), true, { size: 0.6, rate: 0.6, speed: 0.15, color: [1, 0.35, 0.75, 0.95], colorEnd: PINK_MID, ...tw('smoke') }, 4))
      em.push(emit('smoke', [0, 46, 0], colBox(3, 28), true, { size: 0.6, rate: 0.6, speed: 0.15, color: PINK_MID, colorEnd: PINK_PALE, ...tw('smoke') }, 4))
      break
    }
    case 'E4': { // Discharge Trap: a small middle-grey box 0.2 m a side, a faint light-blue crackle within 0.5 m (visual only; the trap still triggers at 5 m)
      seconds = 120
      em.push(emit('smoke', [0, 0.1, 0], { kind: 'box', x: 0.2, y: 0.2, z: 0.2 }, false, { size: 0.03, rate: 2.2, life: 0.07, speed: 0, alpha: 1, color: COLORS_NEW.grey, colorEnd: col2(COLORS_NEW.grey, 0.4), ...tw('box') }, 1))
      em.push(emit('crackle', [0, 0.15, 0], { kind: 'sphere', radius: 0.5 }, false, { size: 0.5, rate: 0.35, color: COLORS_NEW.trap, colorEnd: col2(COLORS_NEW.trap, 0), ...tw('crackle') }, 2))
      em.push(emit('glow', [0, 0.15, 0], { kind: 'sphere', radius: 0.3 }, false, { size: 0.05, rate: 0.5, alpha: 0.6, color: COLORS_NEW.trap, ...tw('glow') }, 3))
      break
    }
    case 'E5': { // lobby bubble (c30b): black smoke shell at 80 % on an icosahedron the size of the bubble, fire around the foot ring. The radius is CLAMPED to 15 m (30 m across) whatever the server sends; default 10
      seconds = 120
      const R = cl(f(p.r, 10), 1, LCAP.bubbleRadius), n = cl(Math.round(f(tw('smoke').count, 0)) || 20, 1, 32)
      for (const q of spherePoints(n)) em.push(emit('smoke', [q[0] * R, R * 0.05 + q[1] * R, q[2] * R], { kind: 'sphere', radius: Math.max(1.5, R * 0.22) }, false, { size: Math.max(0.5, R / 10), rate: 0.35, life: 0.6, speed: 0.1, alpha: BUBBLE_ALPHA, ...tw('smoke') }, 1))
      for (const q of ringPts(R, cl(Math.round(R * 1.2), 8, 18), 0.1)) em.push(emit('fire', q, coneUp('fire', 0.3), true, { size: 0.45, rate: 0.5, ...tw('fire') }, 2))
      break
    }
    case 'E6': { // Burst (c30b, Directive W): scaled to the bubble: it grows from the bubble's radius R to 1.5 R over 1.5 s (10 m to 15 m at the default): black smoke and gold embers blown out (2 emitters)
      seconds = 1.6
      const R = cl(f(p.r, 10), 1, LCAP.bubbleRadius), v = (R * 0.5) / 1.5 // 0.5 R in 1.5 s
      const a = emit('embers', [0, 2, 0], { kind: 'sphere', radius: R }, false, { size: 1.2, rate: 3.5, life: 1.5 / MATERIALS.embers.lifetime, ...tw('embers') }, 1)
      const b = emit('smoke', [0, 2, 0], { kind: 'sphere', radius: R }, false, { size: 0.35, rate: 2.5, life: 1.5 / MATERIALS.smoke.lifetime, alpha: BUBBLE_ALPHA, ...tw('smoke') }, 2)
      a.speedMin = a.speedMax = v; b.speedMin = b.speedMax = v
      em.push(a, b)
      break
    }
    case 'E7': { // Plasma Portal 1: electric green; the Synth disappears into it, which triggers the blast
      seconds = f(p.seconds, 6)
      em.push(...plasmaPortal(id, look, COLORS_NEW.green, false))
      break
    }
    case 'E8': { // Cinematic 1, the Strike: a tube 1 m across from 120 m down to the Synth, 2 s, white-cyan: crackle down it, a glow along it, a glow flash at the foot
      seconds = f(p.seconds, 2)
      em.push(emit('crackle', [0, 60, 0], colBox(1, 120), true, { size: 1.4, rate: 4.5, life: 1.4, speed: 0, ...tw('crackle') }, 1))
      em.push(emit('glow', [0, 60, 0], colBox(1, 120), true, { size: 0.25, rate: 3, life: 0.5, speed: 0, color: WHITE_CYAN, alpha: 0.9, ...tw('tube') }, 2))
      em.push(emit('glow', [0, 3, 0], { kind: 'sphere', radius: 2 }, false, { size: 1.6, rate: 3, life: 0.6, color: WHITE_CYAN, ...tw('glow') }, 3))
      break
    }
    case 'E9': { // Cinematic 2, the Aurora: 5 curtains of flowing light from the sky to the ground within 50 m of the wearer, green and violet, a few embers; 20 s; each Halo draws it around its own wearer and it follows them
      seconds = f(p.seconds, 20); follow = true
      for (let k = 0; k < 5; k++) {
        const c = k % 2 ? COLORS_NEW.auroraViolet : COLORS_NEW.auroraGreen
        em.push(emit('glow', [(r() - 0.5) * 10, SKY_TOP * 0.38, -40 + k * 20], { kind: 'box', x: 60, y: SKY_TOP * 0.76, z: 3 }, false, { size: 4, rate: 2.6, life: 1.6, speed: 0.25, color: c, alpha: 0.5, ...tw('glow') }, k + 1))
      }
      em.push(emit('embers', [0, 40, 0], { kind: 'box', x: 90, y: 80, z: 90 }, false, { rate: 0.4, speed: 0.3, color: COLORS_NEW.auroraGreen, ...tw('embers') }, 9))
      break
    }
    case 'E10': { // Cinematic Ending, the Storm: sixteen 30 m bursts across the sky above the wearer at heights 10 to 40 m, one after another over 16 s (a fixed random sequence): crackle bursts and glow flashes, white-cyan with red
      seconds = f(p.seconds, 16)
      for (let k = 0; k < 16; k++) {
        const q: V3 = [(r() - 0.5) * 80, 10 + r() * 30, (r() - 0.5) * 80], t0 = (k * seconds) / 16
        em.push({ ...emit('crackle', q, { kind: 'sphere', radius: 15 }, false, { size: 7, rate: 2.2, life: 1.4, speed: 0.4, ...tw('crackle') }, 1), at: t0, dur: 1.1 })
        em.push({ ...emit('glow', q, { kind: 'sphere', radius: 5 }, false, { size: 1.4, rate: 3, life: 0.35, speed: 0, color: k % 3 === 2 ? [1, 0.25, 0.12, 1] : WHITE_CYAN, alpha: 0.9, ...tw('glow') }, 2), at: t0, dur: 0.7 })
      }
      break
    }
    case 'E11': { // Plasma Portal 2: the winning faction's charge sends the Synth into it (hunters dark purple, helpers golden); the two replay portals (one purple, one golden) are this too
      seconds = f(p.seconds, 60)
      em.push(...plasmaPortal(id, look, p.winner === 'helpers' ? COLORS_NEW.gold : COLORS_NEW.purple, false))
      break
    }
    case 'E12': { // Glimpse Signal: a pale-cyan column 8 m wide from the ground to max height at the Synth's new starting spot (3 emitters), with a sound cue (game.ts). c30a: the c30 glow-only column was too thin to see (a 200 m column of ~200 faint glow particles); it now uses the E1 smoke density (the proven visible column) in pale cyan, plus a bright core
      seconds = f(p.seconds, 7)
      // c30b (Directive W): the look is LOCKED (pastel blue, as in the c30a test); three times as wide (8 -> 24 m) and three times the particles (three stacked smoke emitters at the c30a rate, the core and embers at three times the rate)
      big = true
      em.push(...stack('ash', 24, 0, SKY_TOP, 3, { size: 0.9, rate: 2.2, speed: 0.25, color: COLORS_NEW.ghost, colorEnd: [COLORS_NEW.ghost[0], COLORS_NEW.ghost[1], COLORS_NEW.ghost[2], 0], alpha: 0.9, ...tw('glow') }, 1))
      em.push(emit('glow', [0, SKY_TOP / 2, 0], colBox(7.5, SKY_TOP), true, { size: 0.5, rate: 9, life: 1.6, speed: 0.02, color: [0.85, 1, 1, 1], alpha: 1, ...tw('core') }, 2))
      em.push(emit('embers', [0, SKY_TOP / 2, 0], colBox(24, SKY_TOP), true, { rate: 3.6, speed: 0.5, color: COLORS_NEW.ghost, ...tw('embers') }, 3))
      break
    }
    case 'E13': if (!as) return planBubble([0, 0, 0], f(p.r, BLAST_LOOK.radius), f(p.full, BLAST_LOOK.radius), look, f(p.seed, 13)); seconds = 12; break
    case 'E14': { // Plasma Portal 3, the call portal: the colour cycles through the rainbow plus white and black (no brown) with gold embers (game.ts cycles it)
      seconds = f(p.seconds, 45)
      em.push(...plasmaPortal(id, look, p.color ?? PORTAL_CYCLE[0]!, true))
      break
    }
  }
  if (as) return { id, seconds, emitters: capPlan(archetype(as, id, look), true), follow: false, reserved, big: true } // c30c: the effect keeps its time and place, the look is the archetype's
  return { id, seconds, emitters: capPlan(em, big), follow, reserved, big }
}

// ---------------------------------------------------------------- E13: the blast (plan section 4): the hard case
export const BLAST_LOOK = { radius: 110, surfaceMax: 32 }
/** how many surface emitters cover a bubble of radius r (fixed particle size: a bigger bubble gets MORE emitters, never bigger particles) */
export function bubbleEmitterCount(r: number, full: number, max: number): number { return cl(Math.ceil((max * r) / Math.max(1, full)), 1, max) }
/** the E13 bubble at one moment: radius r (m) around `centre`. The particle size NEVER depends on r. */
export function planBubble(centre: V3, r: number, full: number, look?: LookData, seed = 13): LookPlan {
  void seed
  r = cl(f(r, 1), 0.05, 400); full = cl(f(full, 1), 0.05, 400) // c30b: no server value may stretch it past 400 m
  const tw = (l: string) => defined(tweakFor(look, 'E13', l))
  const nSurf = Math.round(f(tw('smoke').count, 0)) || BLAST_LOOK.surfaceMax
  const n = bubbleEmitterCount(r, full, nSurf), pts = spherePoints(n), em: EmitterSpec[] = []
  for (const p of pts) {
    const pos: V3 = [centre[0] + p[0] * r, centre[1] + p[1] * r, centre[2] + p[2] * r]
    em.push(emit('ash', pos, { kind: 'sphere', radius: 6 }, false, { size: 2.4, rate: 0.5, life: 0.5, speed: 0.1, alpha: SHELL_ALPHA, ...tw('smoke') }, 1)) // c30b: the blast is kept as it was (the c30a smoke, 'ash')
  }
  return { id: 'E13', seconds: 12, emitters: capPlan(em, true), big: true }
}
/** E13's first quarter second: the white glow flash at the launch point */
export function planFlash(look?: LookData): LookPlan {
  const tw = defined(tweakFor(look, 'E13', 'flash'))
  return { id: 'E13', seconds: 0.4, emitters: [clampEmitter(emit('glow', [0, 1, 0], { kind: 'sphere', radius: 2 }, false, { size: 2.2, rate: 6, life: 0.12, color: [1, 1, 1, 1], alpha: 2, ...tw }, 5), true)] }
}
