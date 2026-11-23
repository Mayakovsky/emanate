// c29 (Plan v2): turns LookPlans (look.ts) into ParticleSystem entities, keeps the live caps (oldest effect dropped first), and is the one kill switch.
// Also holds the thin classes game.ts uses for every effect (plume, charge arcs, drop, trap, lobby bubble, burst, rift strike, aurora, endgame,
// glimpse, blast bubble, trail): each one only decides WHEN and WHERE; WHAT it looks like is in look.ts (recipes as data).
import { engine, Transform, ParticleSystem, type Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { type EmitterSpec, type LookPlan, type LookData, type RGBA, LCAP, liveParticles, dropCount, capsOf, planEffect, planBubble, spherePoints, emit, clampEmitter, defined, tweakFor, bubbleEmitterCount, BLAST_LOOK, COLORS_NEW, cycleColor } from './look'
import { type Vec } from './logic'

/** emitters that live outside the list (the blast bubbles and the trails): they count against the same cap. Set by game.ts. */
export const outside: { emitters: () => number } = { emitters: () => 0 }

/** the server `look` section (flat keys), set by game.ts when settings arrive */
export const lookData: { v: LookData } = { v: {} }

interface Item { id: string; key?: string; born: number; end: number; entities: Entity[]; specs: EmitterSpec[]; particles: number; reserved: boolean; follow: boolean; at: Vec }
const c4 = (c: number[]) => Color4.create(c[0]!, c[1]!, c[2]!, c[3]!)
export function emitterComponent(em: EmitterSpec): any {
  const shape = em.shape.kind === 'cone' ? { $case: 'cone', cone: { angle: em.shape.angle, radius: em.shape.radius } }
    : em.shape.kind === 'box' ? { $case: 'box', box: { size: Vector3.create(em.shape.x, em.shape.y, em.shape.z) } }
    : em.shape.kind === 'sphere' ? { $case: 'sphere', sphere: { radius: em.shape.radius } } : { $case: 'point', point: {} }
  const out: any = {
    active: true, rate: em.rate, maxParticles: em.maxParticles, lifetime: em.lifetime, gravity: em.gravity,
    initialSize: { start: em.sizeMin, end: em.sizeMax }, sizeOverTime: { start: em.sizeStart, end: em.sizeEnd },
    initialColor: { start: c4(em.c0), end: c4(em.c1) }, colorOverTime: { start: c4(em.from), end: c4(em.to) },
    initialVelocitySpeed: { start: em.speedMin, end: em.speedMax }, blendMode: 0, billboard: true, shape, simulationSpace: 1,
    texture: { src: 'images/' + em.tex + '.png' }
  }
  if (em.flip) out.spriteSheet = { tilesX: em.flip.x, tilesY: em.flip.y, framesPerSecond: em.flip.fps }
  return out
}
const placeOf = (at: Vec, em: EmitterSpec) => Vector3.create(at.x + em.pos[0], at.y + em.pos[1], at.z + em.pos[2])
const rotOf = (em: EmitterSpec) => (em.up ? Quaternion.fromEulerDegrees(-90, 0, 0) : Quaternion.Identity())

export class LookFx {
  items: Item[] = []
  get emitterCount() { return this.items.reduce((a, i) => a + i.entities.length, 0) }
  get particleCount() { return this.items.reduce((a, i) => a + i.particles, 0) }
  /** the emitters held by upgrade drops (reserved: never removed to make room) */
  get reservedCount() { return this.items.reduce((a, i) => a + (i.reserved ? i.entities.length : 0), 0) }
  /** how many emitters can still be added before the cap (counting the bubbles and trails) */
  room() { return capsOf(lookData.v).emitters - this.emitterCount - outside.emitters() }
  has(key: string) { return this.items.some((i) => i.key === key) }
  keys(prefix: string) { return this.items.filter((i) => i.key?.startsWith(prefix)).map((i) => i.key!) }
  /** place one effect at `at` (scene-local) for plan.seconds; a `key` makes it replaceable/removable */
  spawn(plan: LookPlan, at: Vec, now: number, key?: string): boolean {
    if (key) this.remove(key)
    if (!plan.emitters.length) return false
    const caps = capsOf(lookData.v)
    const add = { emitters: plan.emitters.length, particles: plan.emitters.reduce((a, e) => a + liveParticles(e), 0) }
    const live = this.items.map((i) => ({ emitters: i.entities.length, particles: i.particles, reserved: i.reserved }))
    const drop = dropCount(live, add, caps, outside.emitters())
    const victims = this.items.filter((i) => !i.reserved).slice(0, drop) // the oldest first; reserved effects (upgrade drops) are never chosen
    for (const v of victims) this.removeItem(v)
    const entities: Entity[] = []
    for (const em of plan.emitters) {
      const e = engine.addEntity()
      Transform.create(e, { position: placeOf(at, em), rotation: rotOf(em) })
      const comp = emitterComponent(em)
      if (em.at !== undefined) comp.active = false // a windowed emitter starts off (the Storm's bursts)
      ParticleSystem.create(e, comp)
      entities.push(e)
    }
    this.items.push({ id: plan.id, key, born: now, end: plan.reserved ? Infinity : now + Math.min(LCAP.seconds * 3, plan.seconds), entities, specs: plan.emitters, particles: add.particles, reserved: !!plan.reserved, follow: !!plan.follow, at: { ...at } })
    return true
  }
  /** effect `id` by name (look.ts recipe + the server look overrides) */
  effect(id: string, at: Vec, now: number, p: Parameters<typeof planEffect>[1] = {}, key?: string): boolean {
    const plan = planEffect(id, p, lookData.v)
    return plan ? this.spawn(plan, at, now, key) : false
  }
  private warmed = false
  /** load every particle texture once, out of sight (an emitter far below the ground for 4 s): the first real use of a texture otherwise shows flat squares until it has loaded */
  warm(now: number) {
    if (this.warmed) return
    this.warmed = true
    const em: EmitterSpec[] = (['puff', 'wisp', 'flipbook', 'spark', 'glow', 'crackle'] as const).map((tex) => ({
      pos: [0, -300, 0] as [number, number, number], up: false, shape: { kind: 'point' as const }, tex, flip: tex === 'flipbook' ? { x: 4, y: 4, fps: 12 } : undefined,
      rate: 4, maxParticles: 8, lifetime: 1, gravity: 0, sizeMin: 0.2, sizeMax: 0.2, sizeStart: 1, sizeEnd: 1, speedMin: 0, speedMax: 0,
      c0: [1, 1, 1, 1] as RGBA, c1: [1, 1, 1, 1] as RGBA, from: [1, 1, 1, 1] as RGBA, to: [1, 1, 1, 0] as RGBA
    }))
    this.spawn({ id: 'warm', seconds: 4, emitters: em }, { x: 0, y: 0, z: 0 }, now, 'warm')
  }
  remove(key: string) { for (const it of this.items.filter((i) => i.key === key)) this.removeItem(it) }
  /** keep only the keyed effects of this prefix whose key is in `keep` */
  keepOnly(prefix: string, keep: Set<string>) { for (const it of [...this.items]) if (it.key?.startsWith(prefix) && !keep.has(it.key)) this.removeItem(it) }
  private removeItem(it: Item) { for (const e of it.entities) engine.removeEntity(e); const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1) }
  /** per frame: ends finished effects, switches the windowed emitters on and off, moves the following effects with the wearer, runs the colour cycle of the call portal */
  update(now: number, me?: Vec) {
    for (const it of [...this.items]) {
      if (now >= it.end) { this.removeItem(it); continue }
      const age = now - it.born
      for (let i = 0; i < it.specs.length; i++) {
        const sp = it.specs[i]!, e = it.entities[i]!
        if (sp.at !== undefined) { const on = age >= sp.at && age < sp.at + (sp.dur ?? 1); const ps = ParticleSystem.getMutableOrNull(e); if (ps && ps.active !== on) ps.active = on }
        if (it.follow && me) { const t = Transform.getMutableOrNull(e); if (t) t.position = Vector3.create(me.x + sp.pos[0], me.y + sp.pos[1], me.z + sp.pos[2]) }
      }
      if (it.id === 'E14' && !lookData.v['E14.as'] && now - this.lastCycle > 0.1) { this.lastCycle = now; this.cycle(it, now) } // c30c: an archetype assigned to E14 keeps its own colours
    }
  }
  private lastCycle = 0
  /** PP3: the portal's colour runs through the rainbow plus white and black (look.ts cycleColor); the gold embers stay gold */
  private cycle(it: Item, now: number) {
    const c = cycleColor(now)
    for (let i = 0; i < it.specs.length; i++) {
      const g = it.specs[i]!.group
      if (g !== 2 && g !== 3 && g !== 4) continue
      const ps = ParticleSystem.getMutableOrNull(it.entities[i]!)
      if (!ps) continue
      const a = it.specs[i]!.from[3]
      ps.initialColor = { start: c4([c[0], c[1], c[2], a]), end: c4([c[0], c[1], c[2], a]) }
      ps.colorOverTime = { start: c4([c[0], c[1], c[2], a]), end: c4([c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0]) }
    }
  }
  /** the kill switch: everything off at once */
  clear() { for (const it of [...this.items]) this.removeItem(it) }
}
export const lookFx = new LookFx()

// ---------------------------------------------------------------- E1 plume
export class Plumes {
  spawn(id: number | string, base: Vec, ageSec: number, now: number) { const k = 'plume:' + id; if (!lookFx.has(k)) lookFx.effect('E1', base, now - ageSec, {}, k) }
  keepOnly(ids: Set<number | string>) { lookFx.keepOnly('plume:', new Set([...ids].map((i) => 'plume:' + i))) }
  update(_now: number) { /* the particle system runs by itself; lookFx.update ends it */ }
}
// ---------------------------------------------------------------- E2 charge arcs: re-planned a few times a second while in range
const STAGE_COLORS: Record<string, RGBA> = { free: COLORS_NEW.amber, reset: COLORS_NEW.amber, repair: COLORS_NEW.orange, upgrade: COLORS_NEW.orange } // c30: the charge-stage colours are amber and orange
export class ChargeArcs {
  private last = -9
  private clk = 0
  hide() { lookFx.remove('arcs') }
  update(dt: number, me: Vec, synth: Vec | null, stage: string) {
    this.clk += dt
    const inRange = !!synth && Math.hypot(me.x - synth.x, me.z - synth.z) <= 5
    if (!inRange) { this.hide(); return }
    if (this.clk - this.last < 0.3) return
    this.last = this.clk
    lookFx.effect('E2', me, this.clk, { to: [synth!.x - me.x, synth!.y - me.y, synth!.z - me.z], color: STAGE_COLORS[stage] ?? STAGE_COLORS.free }, 'arcs')
  }
}
// ---------------------------------------------------------------- E3 upgrade drop
export class DropMarkers {
  update(now: number, _me: Vec, drops: { id: number | string; pos: Vec }[]) {
    const keep = new Set<string>()
    const max = capsOf(lookData.v).drops // c30: at most `cap.drops` (6) drops are drawn at once; the server never creates more than its maxDrops
    for (const d of drops.slice(0, max)) { const k = 'drop:' + d.id; keep.add(k); if (!lookFx.has(k)) lookFx.effect('E3', d.pos, now, {}, k) }
    lookFx.keepOnly('drop:', keep)
  }
}
// ---------------------------------------------------------------- E4 discharge trap
export class TrapMarkers {
  update(now: number, traps: { id: number | string; pos: Vec; mine: boolean }[]) {
    const keep = new Set<string>()
    for (const t of traps) { const k = 'trap:' + t.id; keep.add(k); if (!lookFx.has(k)) lookFx.effect('E4', t.pos, now, {}, k) }
    lookFx.keepOnly('trap:', keep)
  }
}
// ---------------------------------------------------------------- E5 lobby bubble (the E6 burst plays with every blast: game.ts blastLook)
export class BubbleFx {
  private shown = ''
  show(now: number, at: Vec, radius: number, _inside: boolean) {
    const k = `${Math.round(at.x)},${Math.round(at.z)},${Math.round(radius)}`
    if (this.shown === k && lookFx.has('bubble')) return
    this.shown = k
    lookFx.effect('E5', at, now, { r: radius }, 'bubble')
  }
  hide() { this.shown = ''; lookFx.remove('bubble') }
}
// ---------------------------------------------------------------- E13 blast: a bubble of fixed-size particles; more surface emitters as it grows, fewer as it implodes
const BUB_MAX = BLAST_LOOK.surfaceMax
export class BlastBubble {
  ents: Entity[] = []
  centre: Vec = { x: 0, y: 0, z: 0 }
  n = 0
  constructor(public born: number, at: Vec) {
    this.centre = { ...at }
    const plan = planBubble([0, 0, 0], 1, 1, lookData.v) // full set (the radius only moves the positions)
    for (const em of plan.emitters) { const e = engine.addEntity(); Transform.create(e, { position: Vector3.create(at.x, at.y, at.z), rotation: Quaternion.Identity() }); const comp = emitterComponent(em); comp.active = false; ParticleSystem.create(e, comp); this.ents.push(e) }
  }
  /** radius r (m) out of `full`; surface emitters stay on the sphere, the count follows the radius */
  update(r: number, full: number) {
    const n = r <= 0.5 ? 0 : bubbleEmitterCount(r, full, this.ents.length || BUB_MAX), pts = spherePoints(this.ents.length || BUB_MAX)
    for (let i = 0; i < this.ents.length; i++) {
      const t = Transform.getMutable(this.ents[i]!), p = pts[i]!
      t.position = Vector3.create(this.centre.x + p[0] * r, this.centre.y + p[1] * r, this.centre.z + p[2] * r)
      const ps = ParticleSystem.getMutable(this.ents[i]!)
      ps.active = i < n
    }
    this.n = n
  }
  destroy() { for (const e of this.ents) engine.removeEntity(e); this.ents = [] }
  get emitters() { return this.ents.length }
}
// ---------------------------------------------------------------- E13 trail: smoke and embers behind a launched wearer (the wearer's own client)
export class Trail {
  private ents: Entity[] = []
  private on = false
  private build() {
    for (const m of ['ash', 'embers'] as const) { // c30b: the trail belongs to the blast, which is kept as it was (the c30a smoke, 'ash')
      const em = clampEmitter(emit(m, [0, 0, 0], { kind: 'sphere', radius: 0.6 }, false, { size: 0.7, rate: 1, life: 0.7, speed: 0.2, ...defined(tweakFor(lookData.v, 'E13', 'trail')) }, 9), true)
      const e = engine.addEntity(); Transform.create(e, { position: Vector3.create(0, -100, 0), rotation: Quaternion.Identity() }); ParticleSystem.create(e, emitterComponent(em)); this.ents.push(e)
    }
  }
  update(me: Vec, active: boolean) {
    if (active && !this.ents.length) this.build()
    if (!this.ents.length) return
    for (const e of this.ents) { ParticleSystem.getMutable(e).active = active; if (active) Transform.getMutable(e).position = Vector3.create(me.x, me.y + 0.8, me.z) }
    this.on = active
  }
  clear() { for (const e of this.ents) engine.removeEntity(e); this.ents = [] }
  get live() { return this.on }
}
export { COLORS_NEW }
