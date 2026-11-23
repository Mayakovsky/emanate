// EMANATE Build 04: visuals and sounds (placeholders). Everything here is drawn by the wearer's own client, so arrows are
// wearer-only by construction; plumes are drawn for every player from the server's list.
import { engine, Transform, MeshRenderer, Material, AudioSource, MaterialTransparencyMode, ParticleSystem, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, type Entity } from '@dcl/sdk/ecs'
import { type ParticlePlan, type Emitter, dropOldest } from './particleplan'
import { RAY_UP, RAY_MAX, chevronY, followY } from './groundplan'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { SLOT_TABLE, SLOT_LOOP } from './audioSlots'
import { PACKED } from './audioPacked'
import { FXS, FEATURES, SOUNDS } from './settings'
import { ArrowChannel, arrowHeadingDeg, arrowSpeed, chevronOffsets, RULES, type ArrowKind, type Vec } from './logic'

export const COLORS: Record<ArrowKind, Color4> = {
  red: Color4.create(1, 0.12, 0.12, 1),
  pink: Color4.create(1, 0.35, 0.75, 1),
  white: Color4.create(1, 1, 1, 1),
  purple: Color4.create(0.62, 0.2, 1, 1),
  yellow: Color4.create(1, 0.9, 0.1, 1)
}
const HIDDEN = Vector3.create(0, 0, 0)

// ---------------- sounds: audio slots (see EMANATE-AUDIO-LIST.md) ----------------
// A slot plays, in order: (1) the server's recording, if the manifest lists one and the halo can reach the server;
// (2) a recording packed into the zip (audioPacked.ts); (3) a generated placeholder tone. No downloaded audio.
const TONE_NAMES = ['deadzone', 'upgrade', 'overload', 'plume', 'warn5', 'charge', 'nokey', 'escape', 'contain', 'crackle'] as const
export type SoundName = (typeof TONE_NAMES)[number]
const toneEntities = new Map<string, Entity>()
const slotEntities = new Map<string, Entity>() // one AudioSource per slot that has a recording
const armed = new Set<string>()
const toneOf = new Map<string, string | null>(SLOT_TABLE)
export const remoteAudio: Record<string, string> = {} // slot id -> url from the server manifest
export const audioStats = { slots: SLOT_TABLE.length, remote: 0, packed: Object.keys(PACKED).length, played: 0, lastSlot: '', lastSource: '' }

// ---- the sound library in the zip (round 23): original generated tones, selectable by name from the server ----
export const LIB_TONES = ['cue_event', 'cue_good', 'cue_bad', 'cue_warn', 'cue_alert', 'cue_round_start', 'cue_round_end', 'cue_charge_a', 'cue_charge_b', 'cue_charge_c', 'cue_lobby', 'cue_burst',
  'cue_rift', 'cue_plume', 'cue_trap', 'cue_pickup', 'cue_power_up', 'cue_power_down', 'cue_glide', 'cue_lift', 'cue_teleport', 'cue_tick', 'cue_low', 'cue_high',
  'spare_01', 'spare_02', 'spare_03', 'spare_04', 'spare_05', 'spare_06', 'spare_07', 'spare_08'] as const
const libEntities = new Map<string, Entity>()
const libArmed = new Set<string>()
export function playLib(name: string) {
  if ((FEATURES as Record<string, number>).sounds === 0) return
  if (!(LIB_TONES as readonly string[]).includes(name)) return
  let e = libEntities.get(name)
  if (!e) {
    e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, 0, 0) })
    AudioSource.create(e, { audioClipUrl: `audio/${name}.wav`, playing: false, loop: false, volume: 0.6, global: true })
    libEntities.set(name, e)
  }
  AudioSource.getMutable(e).playing = false
  libArmed.add(name)
}
export function initSounds() {
  for (const n of TONE_NAMES) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, 0, 0) })
    AudioSource.create(e, { audioClipUrl: `audio/${n}.wav`, playing: false, loop: false, volume: 0.6, global: true })
    toneEntities.set(n, e)
  }
}
function slotEntity(id: string, url: string): Entity {
  let e = slotEntities.get(id)
  if (!e) {
    e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, 0, 0) })
    AudioSource.create(e, { audioClipUrl: url, playing: false, loop: !!SLOT_LOOP[id], volume: 0.6, global: true })
    slotEntities.set(id, e)
  } else if (AudioSource.get(e).audioClipUrl !== url) AudioSource.getMutable(e).audioClipUrl = url
  return e
}
export function setRemoteAudio(map: Record<string, string>) {
  for (const k of Object.keys(remoteAudio)) delete remoteAudio[k]
  Object.assign(remoteAudio, map)
  audioStats.remote = Object.keys(map).length
}
// which source a slot would use right now
export function slotSource(id: string): 'server' | 'packed' | 'tone' | 'silent' {
  if (remoteAudio[id]) return 'server'
  if (PACKED[id]) return 'packed'
  return toneOf.get(id) ? 'tone' : 'silent'
}
export function playSlot(id0: string) {
  if ((FEATURES as Record<string, number>).sounds === 0) return
  // round 23: the server may remap which sound an event plays ("" = silent, "lib:<name>" = a tone of the library in the zip)
  const id = SOUNDS[id0] ?? id0
  if (id === '') return
  if (id.startsWith('lib:')) return playLib(id.slice(4))
  const src = slotSource(id)
  audioStats.played++
  audioStats.lastSlot = id
  audioStats.lastSource = src
  if (src === 'silent') return
  let key: string
  if (src === 'server') {
    key = 's:' + id
    slotEntity(id, remoteAudio[id]!)
  } else if (src === 'packed') {
    key = 's:' + id
    slotEntity(id, 'audio/' + PACKED[id]!)
  } else key = 't:' + toneOf.get(id)!
  const e = key.startsWith('s:') ? slotEntities.get(id) : toneEntities.get(toneOf.get(id)!)
  if (!e) return
  AudioSource.getMutable(e).playing = false
  armed.add(key + '|' + id)
}
// old call sites: a placeholder tone by name
export function playSound(n: SoundName) {
  const e = toneEntities.get(n)
  if (!e) return
  AudioSource.getMutable(e).playing = false
  armed.add('t:' + n + '|' + n)
}
export function soundsUpdate() {
  for (const n of libArmed) { const e = libEntities.get(n); if (e) AudioSource.getMutable(e).playing = true }
  libArmed.clear()
  if (armed.size === 0) return
  for (const k of armed) {
    const [key, id] = k.split('|')
    const e = key!.startsWith('s:') ? slotEntities.get(id!) : toneEntities.get(key!.slice(2))
    if (e) AudioSource.getMutable(e).playing = true
  }
  armed.clear()
}

// ---------------- tracking arrows >>> ----------------
const CHEV_MAX = 10 // chevrons built per arrow (the settings may use fewer, never more)
const chevN = () => Math.round(Math.max(2, Math.min(CHEV_MAX, FXS.chevrons)))
const maxLen = () => FXS.chevronStart + chevN() * FXS.chevronSpacing
interface Chevron { root: Entity; a: Entity; b: Entity }

function makeChevron(color: Color4): Chevron {
  const root = engine.addEntity()
  Transform.create(root, { position: HIDDEN, scale: HIDDEN })
  const mk = (yaw: number, x: number) => {
    const e = engine.addEntity()
    Transform.create(e, { parent: root, position: Vector3.create(x, 0, 0.1), rotation: Quaternion.fromEulerDegrees(0, yaw, 0), scale: Vector3.create(0.16, 0.05, 1.0) })
    MeshRenderer.setBox(e)
    Material.setBasicMaterial(e, { diffuseColor: color })
    return e
  }
  return { root, a: mk(-135, -0.35), b: mk(135, 0.35) }
}

export interface ArrowRun {
  kind: ArrowKind
  ch: ArrowChannel
  target: (() => Vec | null) | null
  phase: number
  mode: 'arrow' | 'sputter'
  sputterUntil: number
  chevrons: Chevron[] | null
}
export class Arrows {
  runs: Record<ArrowKind, ArrowRun>
  private rays = new Map<string, { e: Entity; y: number | null }>() // c24f: one downward ray per chevron (created only when fx.arrowGround is on)
  constructor() {
    const mk = (kind: ArrowKind): ArrowRun => ({ kind, ch: new ArrowChannel(), target: null, phase: 0, mode: 'arrow', sputterUntil: 0, chevrons: null })
    this.runs = { red: mk('red'), pink: mk('pink'), white: mk('white'), purple: mk('purple'), yellow: mk('yellow') }
  }
  private ensure(r: ArrowRun) {
    if (!r.chevrons) r.chevrons = Array.from({ length: CHEV_MAX }, () => makeChevron(COLORS[r.kind]))
    return r.chevrons
  }
  // draw every active channel at the wearer's feet; airborne or not, the arrows lie flat at foot level, pointing level
  update(dt: number, now: number, me: Vec) {
    for (const k of Object.keys(this.runs) as ArrowKind[]) {
      const r = this.runs[k]
      const on = r.ch.active(now) && r.target !== null
      if (!on) {
        if (r.chevrons) for (const c of r.chevrons) Transform.getMutable(c.root).scale = HIDDEN
        continue
      }
      const chevs = this.ensure(r)
      const tgt = r.target!()
      if (!tgt) {
        for (const c of chevs) Transform.getMutable(c.root).scale = HIDDEN
        continue
      }
      const d = Math.hypot(tgt.x - me.x, tgt.z - me.z)
      const heading = arrowHeadingDeg(me, tgt)
      const rot = Quaternion.fromEulerDegrees(0, heading, 0)
      const fwd = d > 0.01 ? { x: (tgt.x - me.x) / d, z: (tgt.z - me.z) / d } : { x: 0, z: 1 }
      let offs: { s: number; fade: number }[]
      if (r.mode === 'sputter') {
        // overloaded: a few stuttering flashes that sputter out (placeholder failed animation)
        const left = Math.max(0, r.sputterUntil - now)
        r.phase += dt * 9
        const alive = left > 0
        offs = chevronOffsets(chevN(), FXS.chevronSpacing, 0, FXS.chevronStart, maxLen()).map((o, i) => ({
          s: o.s,
          fade: alive && Math.sin(r.phase * (1.7 + i * 0.9) + i * 2.1) > 0.35 ? o.fade * Math.min(1, left / 0.4) * 0.8 : 0
        }))
      } else {
        r.phase += dt * arrowSpeed(d)
        offs = chevronOffsets(chevN(), FXS.chevronSpacing, r.phase, FXS.chevronStart, Math.min(maxLen(), Math.max(2.5, d - 0.5)))
      }
      for (let i = 0; i < chevs.length; i++) {
        const t = Transform.getMutable(chevs[i].root)
        const o = offs[i] ?? { s: 0, fade: 0 }
        const px = me.x + fwd.x * o.s, pz = me.z + fwd.z * o.s
        let y = me.y + 0.06 // flat at foot level (the c24e behaviour)
        if (FXS.arrowGround > 0) { // c24f candidate: a ray straight down from each chevron gives the ground under it; no hit keeps it flat (groundplan.ts)
          const key = k + i
          let ray = this.rays.get(key)
          if (!ray) { ray = { e: engine.addEntity(), y: null }; this.rays.set(key, ray); Transform.create(ray.e, { position: Vector3.create(px, me.y + RAY_UP, pz) }); Raycast.create(ray.e, { direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) }, maxDistance: RAY_MAX, queryType: RaycastQueryType.RQT_HIT_FIRST, continuous: true, collisionMask: ColliderLayer.CL_PHYSICS }) }
          Transform.getMutable(ray.e).position = Vector3.create(px, me.y + RAY_UP, pz)
          const res = RaycastResult.getOrNull(ray.e)
          const hit = res && res.hits && res.hits.length > 0 ? res.hits[0]!.length : null
          ray.y = followY(ray.y, chevronY(me.y, hit), dt)
          y = ray.y
        }
        t.position = Vector3.create(px, y, pz)
        t.rotation = rot
        const sc = 1.3 * o.fade
        t.scale = sc > 0.02 ? Vector3.create(sc, sc, sc) : HIDDEN
      }
    }
  }
}

// ---------------- test-mode markers (preview review only) ----------------
export class TestMarkers {
  fixed: Entity
  moving: Entity
  wall: Entity
  constructor() {
    const col = (c: Color4, w: number) => {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setCylinder(e, w, w)
      Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.5, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
      return e
    }
    this.fixed = col(Color4.create(0.7, 0.05, 0.05, 0.6), 0.4)
    this.moving = col(Color4.create(1, 0.2, 0.2, 0.6), 0.4)
    this.wall = engine.addEntity()
    Transform.create(this.wall, { position: HIDDEN, scale: HIDDEN })
    MeshRenderer.setBox(this.wall)
    Material.setPbrMaterial(this.wall, { albedoColor: Color4.create(1, 1, 1, 0.25), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
  }
  update(fixed: Vec, moving: Vec, wallX: number, y: number) {
    const f = Transform.getMutable(this.fixed)
    f.position = Vector3.create(fixed.x, y + 4, fixed.z)
    f.scale = Vector3.create(1, 8, 1)
    const m = Transform.getMutable(this.moving)
    m.position = Vector3.create(moving.x, y + 4, moving.z)
    m.scale = Vector3.create(1, 8, 1)
    const w = Transform.getMutable(this.wall)
    w.position = Vector3.create(wallX, y + 10, 80)
    w.scale = Vector3.create(0.3, 20, 160)
  }
}

// ---------------- distance render test (hold F + press 1): markers at 10..600 m in four directions ----------------
export { Plumes, ChargeArcs, DropMarkers, BubbleFx, TrapMarkers } from './lookfx' // c29 (Plan v2): the old sphere/box effect classes are deleted; these are the particle-based ones (look.ts recipes)
export const MARKER_DISTANCES = [10, 20, 35, 60, 120, 300, 600, 1000]
const MARKER_COLORS = [
  Color4.create(1, 0, 0, 1), // 10 red
  Color4.create(1, 0.5, 0, 1), // 20 orange
  Color4.create(1, 1, 0, 1), // 35 yellow
  Color4.create(0, 1, 0, 1), // 60 green
  Color4.create(0, 1, 1, 1), // 120 cyan
  Color4.create(0.2, 0.3, 1, 1), // 300 blue
  Color4.create(1, 0, 1, 1), // 600 magenta
  Color4.create(1, 1, 1, 1) // 1000 white
]
export const MARKER_COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'white']
export class DistanceMarkers {
  ents: Entity[] = []
  placed = false
  // place: columns whose width and height grow with distance so they stay visible; 4 directions (N, E, S, W)
  place(at: Vec) {
    this.clear()
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]
    for (const [dx, dz] of dirs) {
      MARKER_DISTANCES.forEach((d, i) => {
        const e = engine.addEntity()
        const w = 1.5 + d * 0.03
        const h = 30 + d * 0.25
        Transform.create(e, { position: Vector3.create(at.x + dx * d, at.y + h / 2, at.z + dz * d), scale: Vector3.create(w, h, w) })
        MeshRenderer.setCylinder(e, 1, 1)
        Material.setPbrMaterial(e, { albedoColor: MARKER_COLORS[i], emissiveColor: MARKER_COLORS[i], emissiveIntensity: 2 })
        this.ents.push(e)
      })
    }
    this.placed = true
  }
  clear() {
    for (const e of this.ents) engine.removeEntity(e)
    this.ents = []
    this.placed = false
  }
}

// ---------------- c24f candidate (NOT FINAL): the `particles` command (plans come from particleplan.ts: validated, capped) ----------------
interface PartItem { born: number; end: number; entities: Entity[] }
export class ParticleFx {
  items: PartItem[] = []
  get emitterCount() { return this.items.reduce((a, i) => a + i.entities.length, 0) }
  spawn(plan: ParticlePlan, at: Vec, now: number): boolean {
    const drop = dropOldest(this.items.map((i) => i.entities.length), plan.emitters.length)
    for (let i = 0; i < drop; i++) this.remove(this.items[0]!)
    const entities: Entity[] = []
    for (const em of plan.emitters) {
      const e = engine.addEntity()
      Transform.create(e, { position: Vector3.create(at.x + em.dx, at.y + em.dy, at.z + em.dz), rotation: em.up ? Quaternion.fromEulerDegrees(-90, 0, 0) : Quaternion.Identity() })
      ParticleSystem.create(e, this.component(em))
      entities.push(e)
    }
    this.items.push({ born: now, end: now + plan.seconds, entities })
    return true
  }
  private component(em: Emitter): any {
    const c4 = (c: number[]) => Color4.create(c[0]!, c[1]!, c[2]!, c[3]!)
    const shape = em.shape.kind === 'cone' ? { $case: 'cone', cone: { angle: em.shape.angle, radius: em.shape.radius } } : em.shape.kind === 'box' ? { $case: 'box', box: { size: Vector3.create(em.shape.x, em.shape.y, em.shape.z) } } : { $case: 'point', point: {} }
    const out: any = {
      active: true, rate: em.rate, maxParticles: em.maxParticles, lifetime: em.lifetime, gravity: em.gravity,
      initialSize: { start: em.sizeMin, end: em.sizeMax }, sizeOverTime: { start: em.sizeOverStart, end: em.sizeOverEnd },
      initialColor: { start: c4(em.colorMin), end: c4(em.colorMax) }, colorOverTime: { start: c4(em.fadeStart), end: c4(em.fadeEnd) },
      initialVelocitySpeed: { start: em.speedMin, end: em.speedMax }, blendMode: em.blend === 'add' ? 1 : 0, billboard: true, shape, simulationSpace: 1
    }
    if (em.textured) { out.texture = { src: 'images/' + em.tex + '.png' }; if (em.tex === 'flipbook') out.spriteSheet = { tilesX: 4, tilesY: 4, framesPerSecond: 12 } }
    // (the next line is the old one's comment)
    // // a particle's texture is a plain { src } (NOT the material's union: that shape made the scene's CRDT serializer throw and the scene stalled, found 18 Nov); inside the zip: the only place a wearable's texture can come from
    return out
  }
  private remove(it: PartItem) {
    for (const e of it.entities) engine.removeEntity(e)
    const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1)
  }
  update(now: number) { for (const it of [...this.items]) if (now >= it.end) this.remove(it) }
  clear() { for (const it of [...this.items]) this.remove(it) } // the kill switch (feature particles off, or idle)
}
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)
