// EMANATE Build 04: visuals and sounds (placeholders). Everything here is drawn by the wearer's own client, so arrows are
// wearer-only by construction; plumes are drawn for every player from the server's list.
import { engine, Transform, MeshRenderer, Material, AudioSource, MaterialTransparencyMode, MainCamera, VirtualCamera, ParticleSystem, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, type Entity } from '@dcl/sdk/ecs'
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

// ---------------- plumes: a column of smoke that rises and fades, 14 s (round 23: all sizes and counts come from the settings) ----------------
interface PlumeVis { id: number | string; base: Vec; born: number; puffs: Entity[] }
const CORE_COLORS = [Color4.create(1, 0.14, 0.02, 1), Color4.create(1, 0.5, 0.04, 1), Color4.create(0.42, 0.07, 0.03, 1)]
const PUFF_COLORS = [Color4.create(1, 0.1, 0.03, 1), Color4.create(1, 0.4, 0.06, 1), Color4.create(0.32, 0.05, 0.03, 1)]
/** soft translucent fiery material: a see-through body with a warm glow of its own, so overlapping puffs blend into smoke and still read red in daylight */
let SOFT_VARIANT = -1 // test hook (round 24): -1 = the chosen recipe; 0..3 = candidate recipes for one look test
export const setSoftVariant = (v: number) => { SOFT_VARIANT = v }
export function softMat(e: Entity, c: Color4, alpha: number, glow: number, variant = SOFT_VARIANT) {
  const v = variant < 0 ? 0 : variant
  if (v === 0) Material.setPbrMaterial(e, { albedoColor: Color4.create(0, 0, 0, alpha), emissiveColor: Color4.create(c.r, c.g, c.b, 1), emissiveIntensity: glow, directIntensity: 0, specularIntensity: 0, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
  else if (v === 1) Material.setPbrMaterial(e, { albedoColor: Color4.create(c.r, c.g, c.b, alpha), emissiveColor: Color4.create(c.r, c.g, c.b, 1), emissiveIntensity: glow * 2, directIntensity: 0, specularIntensity: 0, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
  else if (v === 2) Material.setBasicMaterial(e, { diffuseColor: Color4.create(c.r, c.g, c.b, alpha) })
  else Material.setPbrMaterial(e, { albedoColor: Color4.create(c.r, c.g, c.b, Math.min(1, alpha * 1.5)), emissiveColor: Color4.create(c.r, c.g, c.b, 1), emissiveIntensity: 0.6, directIntensity: 0, specularIntensity: 0, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
}
// the colour kind of puff i: red, orange and smoke in the proportions the settings give
function puffKind(i: number): number {
  const w = [Math.max(0, FXS.plumeRed), Math.max(0, FXS.plumeOrange), Math.max(0, FXS.plumeSmoke)]
  const sum = w[0]! + w[1]! + w[2]! || 1
  const f = ((i * 0.618034) % 1) * sum // a low-discrepancy spread, so the kinds mix along the column
  return f < w[0]! ? 0 : f < w[0]! + w[1]! ? 1 : 2
}
export class Plumes {
  list = new Map<number | string, PlumeVis>()
  spawn(id: number | string, base: Vec, ageSec: number, now: number) {
    if (this.list.has(id)) return
    const puffs: Entity[] = []
    const n = Math.round(Math.max(4, Math.min(48, FXS.plumePuffs)))
    // round 24: ONE look for day and night: a saturated, self-lit core (opaque, unlit) inside a larger translucent shell. The core keeps the fire colour in bright daylight and in the dark; the shell makes the edge soft.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const e = engine.addEntity()
        Transform.create(e, { position: Vector3.create(base.x, base.y, base.z), scale: HIDDEN })
        MeshRenderer.setSphere(e)
        const k = puffKind(i)
        if (pass === 0) softMat(e, PUFF_COLORS[k]!, 0.5, 1.5)
        else Material.setBasicMaterial(e, { diffuseColor: CORE_COLORS[k]! })
        puffs.push(e)
      }
    }
    this.list.set(id, { id, base, born: now - ageSec, puffs })
  }
  keepOnly(ids: Set<number | string>) {
    for (const [id, p] of this.list) if (!ids.has(id)) this.remove(id, p)
  }
  private remove(id: number | string, p: PlumeVis) {
    for (const e of p.puffs) engine.removeEntity(e)
    this.list.delete(id)
  }
  update(now: number) {
    const H = FXS.plumeHeight
    for (const [id, p] of this.list) {
      const age = now - p.born
      const left = RULES.plumeSeconds - age
      if (left <= 0) {
        this.remove(id, p)
        continue
      }
      const n = p.puffs.length / 2
      const grow = Math.min(1, age / 0.6) // swells in
      const fadeEnd = Math.min(1, left / 2) // shrinks away over the last 2 s
      for (let i = 0; i < n; i++) {
        const y = (age * FXS.plumeRise + (i * H) / n) % H
        const h = y / H
        // a puff rises, swells, then dwindles toward the top: smoke that thins out (shrinking is the fade; no transparency is needed)
        const thin = 1 - 0.9 * h * h
        const r = (FXS.plumeBase + FXS.plumeGrow * h) * grow * fadeEnd * thin
        const pos = Vector3.create(p.base.x + Math.sin(age * 0.7 + i * 1.3) * (0.6 + FXS.plumeSway * h), p.base.y + y, p.base.z + Math.cos(age * 0.6 + i * 1.7) * (0.6 + FXS.plumeSway * h))
        const t = Transform.getMutable(p.puffs[i])
        t.position = pos
        t.scale = Vector3.create(r, r, r)
        const c = Transform.getMutable(p.puffs[i + n]!) // the core
        c.position = pos
        c.scale = Vector3.create(r * 0.55, r * 0.55, r * 0.55)
      }
    }
  }
}

// ---------------- charging placeholder: energy arcs from the halo to the Synth within 5 m ----------------
const ARC_SEGS = 7
export class ChargeArcs {
  segs: Entity[] = []
  tick = 0
  jitter: number[] = []
  stageColor: Record<string, Color4> = {
    free: Color4.create(0.5, 0.8, 1, 1),
    reset: Color4.create(1, 0.95, 0.3, 1),
    repair: Color4.create(1, 0.55, 0.15, 1),
    upgrade: Color4.create(0.4, 1, 0.5, 1)
  }
  private ensure() {
    if (this.segs.length) return
    for (let i = 0; i < ARC_SEGS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      Material.setBasicMaterial(e, { diffuseColor: this.stageColor.free })
      this.segs.push(e)
    }
  }
  hide() {
    for (const e of this.segs) Transform.getMutable(e).scale = HIDDEN
  }
  update(dt: number, me: Vec, synth: Vec | null, stage: string) {
    if (!synth || Math.hypot(me.x - synth.x, me.y - synth.y, me.z - synth.z) > RULES.chargeRadius) return this.hide()
    this.ensure()
    this.tick += dt
    if (this.tick > 0.05 || this.jitter.length === 0) {
      this.tick = 0
      this.jitter = Array.from({ length: ARC_SEGS + 1 }, () => (Math.random() - 0.5) * 0.9)
    }
    const col = this.stageColor[stage] ?? this.stageColor.free
    const a = Vector3.create(me.x, me.y + 1.9, me.z) // the halo
    const b = Vector3.create(synth.x, synth.y + 1, synth.z)
    const pts: Vector3[] = []
    for (let i = 0; i <= ARC_SEGS; i++) {
      const f = i / ARC_SEGS
      const j = i === 0 || i === ARC_SEGS ? 0 : this.jitter[i]
      pts.push(Vector3.create(a.x + (b.x - a.x) * f + j, a.y + (b.y - a.y) * f + this.jitter[(i + 3) % (ARC_SEGS + 1)] * 0.6 * (i === 0 || i === ARC_SEGS ? 0 : 1), a.z + (b.z - a.z) * f - j))
    }
    for (let i = 0; i < ARC_SEGS; i++) {
      const p = pts[i]
      const q = pts[i + 1]
      const mid = Vector3.create((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2)
      const dir = Vector3.subtract(q, p)
      const len = Vector3.length(dir)
      const t = Transform.getMutable(this.segs[i])
      t.position = mid
      t.rotation = Quaternion.lookRotation(Vector3.normalize(dir))
      t.scale = Vector3.create(0.07, 0.07, Math.max(0.05, len))
      Material.setBasicMaterial(this.segs[i], { diffuseColor: col })
    }
  }
}

// ---------------- upgrade drop markers (pink columns, shown inside the 80 m discovery radius) ----------------
export class DropMarkers {
  list = new Map<number | string, Entity>()
  update(now: number, me: Vec, drops: { id: number | string; pos: Vec }[]) {
    const ids = new Set(drops.map((d) => d.id))
    for (const [id, e] of this.list) if (!ids.has(id)) (engine.removeEntity(e), this.list.delete(id))
    for (const d of drops) {
      let e = this.list.get(d.id)
      if (!e) {
        e = engine.addEntity()
        Transform.create(e, { position: HIDDEN, scale: HIDDEN })
        MeshRenderer.setCylinder(e, 0.5, 0.5)
        Material.setPbrMaterial(e, { albedoColor: Color4.create(1, 0.35, 0.75, 0.55), emissiveColor: Color4.create(1, 0.3, 0.7, 1), emissiveIntensity: 2, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
        this.list.set(d.id, e)
      }
      const near = Math.hypot(me.x - d.pos.x, me.z - d.pos.z) <= RULES.upgradeRadius
      const t = Transform.getMutable(e)
      if (near) {
        const pulse = 1 + 0.15 * Math.sin(now * 4)
        t.position = Vector3.create(d.pos.x, d.pos.y + 3, d.pos.z)
        t.scale = Vector3.create(0.9 * pulse, 6, 0.9 * pulse)
      } else t.scale = HIDDEN
    }
  }
}

// ---------------- the lobby bubble: a translucent dome around the Synth, drawn for every equipped player; it blows when the timer ends ----------------
export class BubbleFx {
  dome: Entity | null = null
  ring: Entity | null = null
  burstAt = -1 // clock time the burst started (-1 = none)
  private build() {
    const d = engine.addEntity()
    Transform.create(d, { position: HIDDEN, scale: HIDDEN })
    MeshRenderer.setSphere(d)
    Material.setPbrMaterial(d, { albedoColor: Color4.create(0.4, 0.8, 1, 0.22), emissiveColor: Color4.create(0.3, 0.7, 1, 1), emissiveIntensity: 0.8, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
    this.dome = d
    const r = engine.addEntity()
    Transform.create(r, { position: HIDDEN, scale: HIDDEN })
    MeshRenderer.setCylinder(r, 0.5, 0.5)
    Material.setPbrMaterial(r, { albedoColor: Color4.create(0.6, 0.9, 1, 0.5), emissiveColor: Color4.create(0.5, 0.9, 1, 1), emissiveIntensity: 2, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
    this.ring = r
  }
  // at = the dome's centre (scene-local), radius in metres; inside = the wearer stands in it (the ring brightens)
  show(now: number, at: Vec, radius: number, inside: boolean) {
    if (!this.dome) this.build()
    const pulse = 1 + 0.03 * Math.sin(now * 3)
    const d = Transform.getMutable(this.dome!)
    d.position = Vector3.create(at.x, at.y + 0.5, at.z)
    d.scale = Vector3.create(radius * 2 * pulse, radius * 2 * pulse, radius * 2 * pulse)
    const r = Transform.getMutable(this.ring!)
    r.position = Vector3.create(at.x, at.y + 0.08, at.z)
    const w = radius * 2 * (inside ? 1.0 : 0.96)
    r.scale = Vector3.create(w, 0.06, w)
  }
  hide() {
    if (!this.dome) return
    Transform.getMutable(this.dome).scale = HIDDEN
    Transform.getMutable(this.ring!).scale = HIDDEN
  }
  // the burst: the dome swells and thins for 1.5 s (the caller also plays the Rift lightning at the centre)
  burst(now: number, t: number, at: Vec, radius: number) {
    if (!this.dome) this.build()
    const k = Math.min(1, t / 1.5)
    const s = radius * 2 * (1 + 2.5 * k)
    const d = Transform.getMutable(this.dome!)
    d.position = Vector3.create(at.x, at.y + 0.5, at.z)
    d.scale = k >= 1 ? HIDDEN : Vector3.create(s, s, s)
    Material.setPbrMaterial(this.dome!, { albedoColor: Color4.create(0.9, 0.9, 1, 0.22 * (1 - k)), emissiveColor: Color4.create(1, 1, 1, 1), emissiveIntensity: 2 * (1 - k), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
    if (k >= 1) this.hide()
  }
}

// ---------------- Discharge Trap markers (E): a pulsing glowing disc on the ground where a trap was placed, drawn for every player ----------------
export class TrapMarkers {
  list = new Map<number | string, Entity[]>()
  update(now: number, traps: { id: number | string; pos: Vec; mine: boolean }[]) {
    const ids = new Set(traps.map((t) => t.id))
    for (const [id, es] of this.list) if (!ids.has(id)) { for (const e of es) engine.removeEntity(e); this.list.delete(id) }
    for (const t of traps) {
      let es = this.list.get(t.id)
      if (!es) {
        const disc = engine.addEntity()
        Transform.create(disc, { position: HIDDEN, scale: HIDDEN })
        MeshRenderer.setCylinder(disc, 0.5, 0.5)
        Material.setPbrMaterial(disc, { albedoColor: Color4.create(0.7, 0.1, 1, 0.6), emissiveColor: Color4.create(0.7, 0.15, 1, 1), emissiveIntensity: 2.2, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
        const core = engine.addEntity()
        Transform.create(core, { position: HIDDEN, scale: HIDDEN })
        MeshRenderer.setSphere(core)
        Material.setPbrMaterial(core, { albedoColor: Color4.create(1, 0.9, 1, 0.9), emissiveColor: Color4.create(1, 0.6, 1, 1), emissiveIntensity: 3 })
        es = [disc, core]
        this.list.set(t.id, es)
      }
      const pulse = 1 + 0.12 * Math.sin(now * 5)
      const d = Transform.getMutable(es[0])
      d.position = Vector3.create(t.pos.x, t.pos.y + 0.06, t.pos.z)
      d.scale = Vector3.create(2.2 * pulse, 0.08, 2.2 * pulse)
      const c = Transform.getMutable(es[1])
      c.position = Vector3.create(t.pos.x, t.pos.y + 0.55 + 0.1 * Math.sin(now * 3), t.pos.z)
      c.scale = Vector3.create(0.5, 0.5, 0.5)
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

// ---------------- the endgame (v3 "The Ending"): the plume, the portals, and a sky-dome prototype ----------------
const EG_PUFFS = 30
const EG_SPARKS = 16
const EG_CEILING = 200
const PORTAL_SEGS = 24
export class EndgameFx {
  puffs: Entity[] = []
  sparks: Entity[] = []
  ring: Entity[] = []
  disc: Entity | null = null
  built = false
  sparkT = 0
  private build(color: Color4) {
    for (let i = 0; i < EG_PUFFS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setSphere(e)
      Material.setPbrMaterial(e, { albedoColor: Color4.create(0.1, 0.1, 0.12, 0.8), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
      this.puffs.push(e)
    }
    for (let i = 0; i < EG_SPARKS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      Material.setBasicMaterial(e, { diffuseColor: Color4.create(0.7, 0.85, 1, 1) })
      this.sparks.push(e)
    }
    for (let i = 0; i < PORTAL_SEGS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      Material.setPbrMaterial(e, { albedoColor: color, emissiveColor: color, emissiveIntensity: 3 })
      this.ring.push(e)
    }
    const d = engine.addEntity()
    Transform.create(d, { position: HIDDEN, scale: HIDDEN })
    MeshRenderer.setCylinder(d, 1, 1)
    Material.setPbrMaterial(d, { albedoColor: Color4.create(color.r, color.g, color.b, 0.35), emissiveColor: color, emissiveIntensity: 2, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
    this.disc = d
    this.built = true
  }
  private colorKind: string | null = null
  hide() {
    for (const e of [...this.puffs, ...this.sparks, ...this.ring]) Transform.getMutable(e).scale = HIDDEN
    if (this.disc) Transform.getMutable(this.disc).scale = HIDDEN
  }
  // kind: containment = purple portal at ground level; escape = yellow portal about 30 m below the ceiling
  update(dt: number, now: number, kind: 'escape' | 'containment', at: Vec) {
    const color = kind === 'escape' ? Color4.create(1, 0.85, 0.1, 1) : Color4.create(0.6, 0.15, 1, 1)
    if (!this.built) this.build(color)
    if (this.colorKind !== kind) {
      this.colorKind = kind
      for (const e of this.ring) Material.setPbrMaterial(e, { albedoColor: color, emissiveColor: color, emissiveIntensity: 3 })
      if (this.disc) Material.setPbrMaterial(this.disc, { albedoColor: Color4.create(color.r, color.g, color.b, 0.35), emissiveColor: color, emissiveIntensity: 2, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
    }
    // the plume: a dark grey column of smoke from the ground to the altitude ceiling
    for (let i = 0; i < EG_PUFFS; i++) {
      const y = (now * 22 + (i * EG_CEILING) / EG_PUFFS) % EG_CEILING
      const h = y / EG_CEILING
      const r = 4 + 9 * h
      const t = Transform.getMutable(this.puffs[i])
      t.position = Vector3.create(at.x + Math.sin(now * 0.4 + i * 1.7) * (1 + 4 * h), at.y + y, at.z + Math.cos(now * 0.35 + i * 2.1) * (1 + 4 * h))
      t.scale = Vector3.create(r, r, r)
    }
    // crackling energy: thin bright bars flickering at random places along the column
    this.sparkT += dt
    const re = this.sparkT > 0.08
    if (re) this.sparkT = 0
    for (let i = 0; i < EG_SPARKS; i++) {
      const t = Transform.getMutable(this.sparks[i])
      if (re) {
        const y = Math.random() * EG_CEILING
        const h = y / EG_CEILING
        const a = Math.random() * Math.PI * 2
        const rr = (2 + 8 * h) * Math.random()
        t.position = Vector3.create(at.x + Math.cos(a) * rr, at.y + y, at.z + Math.sin(a) * rr)
        t.rotation = Quaternion.fromEulerDegrees(Math.random() * 90, Math.random() * 360, Math.random() * 90)
        const on = Math.random() > 0.35
        t.scale = on ? Vector3.create(0.15, 0.15, 2 + Math.random() * 6) : HIDDEN
      }
    }
    // the portal: a glowing ring and disc. Escape hangs about 30 m below the ceiling; containment sits at ground level.
    const cy = kind === 'escape' ? EG_CEILING - 30 : 6
    const R = 6
    const pulse = 1 + 0.06 * Math.sin(now * 5)
    for (let i = 0; i < PORTAL_SEGS; i++) {
      const a = (i / PORTAL_SEGS) * Math.PI * 2
      const t = Transform.getMutable(this.ring[i])
      t.position = Vector3.create(at.x + 12 + Math.cos(a) * R * pulse, at.y + cy + Math.sin(a) * R * pulse, at.z)
      t.rotation = Quaternion.fromEulerDegrees(0, 0, (a * 180) / Math.PI)
      t.scale = Vector3.create(0.5, 2.4, 0.5)
    }
    if (this.disc) {
      const t = Transform.getMutable(this.disc)
      t.position = Vector3.create(at.x + 12, at.y + cy, at.z)
      t.rotation = Quaternion.fromEulerDegrees(90, 0, 0)
      t.scale = Vector3.create(2 * R * pulse, 0.1, 2 * R * pulse)
    }
  }
}

// A cheap sky-darkening prototype (night): two big translucent dark planes (one facing down, one up, so it is seen from either side) at 180 m
// that follow the player. The client forces backface culling on all scene materials (ConfigureSceneMaterial.cs, forceBackfaceCullingEnabled),
// so an inside-out sphere (the first attempt) is culled when seen from inside. A wearable cannot change the real sky
// (SceneSkyboxPlugin.cs skips portable experiences), so night effects must be drawn objects.
export class SkyDome {
  planes: Entity[] = []
  on = false
  flashLevel = 0
  setFlash(level: number) {
    const q = Math.round(level * 4) / 4
    if (q === this.flashLevel || this.planes.length === 0) return
    this.flashLevel = q
    for (const e of this.planes) Material.setPbrMaterial(e, { albedoColor: Color4.create(0.02 + 0.88 * q, 0.03 + 0.92 * q, 0.12 + 0.88 * q, 0.6 + 0.25 * q), emissiveColor: Color4.create(q, q, q, 1), emissiveIntensity: q * 4, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
  }
  toggle() {
    this.on = !this.on
    return this.on
  }
  update(me: Vec) {
    if (!this.on) {
      for (const e of this.planes) Transform.getMutable(e).scale = HIDDEN
      return
    }
    if (this.planes.length === 0) {
      for (const flip of [90, -90]) {
        const e = engine.addEntity()
        Transform.create(e, { position: HIDDEN, scale: HIDDEN, rotation: Quaternion.fromEulerDegrees(flip, 0, 0) })
        MeshRenderer.setPlane(e)
        Material.setPbrMaterial(e, { albedoColor: Color4.create(0.02, 0.03, 0.12, 0.6), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
        this.planes.push(e)
      }
    }
    this.planes.forEach((e, i) => {
      const t = Transform.getMutable(e)
      t.position = Vector3.create(me.x, 180 + i * 0.05, me.z)
      t.scale = Vector3.create(900, 900, 1)
    })
  }
}

// ---------------- distance render test (hold F + press 1): markers at 10..600 m in four directions ----------------
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

// ---------------- camera tests (hold F + press E): bird's-eye, then a glimpse behind a moving point, then off ----------------
export class CameraTests {
  vcam: Entity | null = null
  target: Entity | null = null
  mode = 0 // 0 off, 1 bird's-eye, 2 behind the moving test Synth
  prevTarget: Vec | null = null
  at: Vec = { x: 0, y: 0, z: 0 }
  setMode(m: number, at?: Vec) {
    this.mode = m
    if (at) this.at = at
    if (!this.vcam) {
      this.vcam = engine.addEntity()
      Transform.create(this.vcam, { position: Vector3.create(0, 0, 0) })
      this.target = engine.addEntity()
      Transform.create(this.target, { position: Vector3.create(0, 0, 0) })
    }
    if (m === 0) {
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
      return
    }
    VirtualCamera.createOrReplace(this.vcam, {
      defaultTransition: { transitionMode: { $case: 'time', time: 1.5 } },
      lookAtEntity: m === 1 ? (engine.PlayerEntity as number) : (this.target as number),
      fov: m === 1 ? 70 : 60
    })
    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: this.vcam as number })
  }
  // me: the wearer (scene-local); synth: the moving test point (scene-local)
  update(me: Vec, synth: Vec, riftAt: Vec = synth) {
    if (this.mode === 0 || !this.vcam || !this.target) return
    if (this.mode === 5) {
      // far view: camera at 180 m looking level-ish at a point 1000 m north, so markers out to 1000 m are in frame
      Transform.getMutable(this.target).position = Vector3.create(me.x, me.y + 90, me.z + 1000)
      Transform.getMutable(this.vcam).position = Vector3.create(me.x, me.y + 180, me.z)
      return
    }
    if (this.mode === 3) {
      Transform.getMutable(this.target).position = Vector3.create(riftAt.x, riftAt.y + 6, riftAt.z)
      Transform.getMutable(this.vcam).position = Vector3.create(riftAt.x, riftAt.y + 120, riftAt.z - 25)
      return
    }
    if (this.mode === 4) {
      Transform.getMutable(this.target).position = Vector3.create(riftAt.x, riftAt.y + 6, riftAt.z)
      Transform.getMutable(this.vcam).position = Vector3.create(riftAt.x - 3, riftAt.y + 6, riftAt.z - 14)
      return
    }
    if (this.mode === 1) {
      Transform.getMutable(this.vcam).position = Vector3.create(me.x, me.y + 250, me.z - 40)
    } else {
      Transform.getMutable(this.target).position = Vector3.create(synth.x, synth.y + 1.2, synth.z)
      const p = this.prevTarget ?? synth
      let dx = synth.x - p.x
      let dz = synth.z - p.z
      const l = Math.hypot(dx, dz) || 1
      dx /= l
      dz /= l
      this.prevTarget = { x: synth.x, y: synth.y, z: synth.z }
      Transform.getMutable(this.vcam).position = Vector3.create(synth.x - dx * 8, synth.y + 3.5, synth.z - dz * 8)
    }
  }
}

// ---------------- Cinematic 1, The Rift (prototype): a lightning strike and a rift drawn at a point (drawn objects only) ----------------
const BOLT_SEGS = 14
export class RiftFx {
  bolt: Entity[] = []
  rift: Entity[] = []
  glow: Entity | null = null
  built = false
  jitter: number[] = []
  jt = 0
  private build() {
    for (let i = 0; i < BOLT_SEGS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      Material.setBasicMaterial(e, { diffuseColor: Color4.create(0.85, 0.92, 1, 1) })
      this.bolt.push(e)
    }
    for (let i = 0; i < 20; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      Material.setPbrMaterial(e, { albedoColor: Color4.create(0.7, 0.3, 1, 1), emissiveColor: Color4.create(0.7, 0.3, 1, 1), emissiveIntensity: 3 })
      this.rift.push(e)
    }
    const g = engine.addEntity()
    Transform.create(g, { position: HIDDEN, scale: HIDDEN })
    MeshRenderer.setSphere(g)
    Material.setPbrMaterial(g, { albedoColor: Color4.create(0.9, 0.9, 1, 0.5), emissiveColor: Color4.create(0.9, 0.9, 1, 1), emissiveIntensity: 3, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
    this.glow = g
    this.built = true
  }
  hide() {
    for (const e of [...this.bolt, ...this.rift]) Transform.getMutable(e).scale = HIDDEN
    if (this.glow) Transform.getMutable(this.glow).scale = HIDDEN
  }
  // t = seconds since the trigger; at = the point. 0-2 s: the strike. 1.5 s on: the rift opens and stays.
  update(dt: number, t: number, at: Vec) {
    if (!this.built) this.build()
    this.jt += dt
    if (this.jt > 0.06 || this.jitter.length === 0) {
      this.jt = 0
      this.jitter = Array.from({ length: BOLT_SEGS + 1 }, () => (Math.random() - 0.5) * 6)
    }
    const strike = t < 2
    // the bolt: a zigzag from 120 m down to the point, flickering for 2 s
    for (let i = 0; i < BOLT_SEGS; i++) {
      const tr = Transform.getMutable(this.bolt[i])
      if (!strike || Math.random() < 0.15) {
        tr.scale = HIDDEN
        continue
      }
      const y0 = 120 * (1 - i / BOLT_SEGS)
      const y1 = 120 * (1 - (i + 1) / BOLT_SEGS)
      const x0 = at.x + this.jitter[i] * (i === 0 ? 0.3 : 1)
      const x1 = at.x + this.jitter[i + 1] * (i === BOLT_SEGS - 1 ? 0 : 1)
      const z0 = at.z + this.jitter[(i + 5) % (BOLT_SEGS + 1)] * 0.5
      const z1 = at.z + this.jitter[(i + 6) % (BOLT_SEGS + 1)] * 0.5
      const a = Vector3.create(x0, at.y + y0, z0)
      const b = Vector3.create(x1, at.y + y1, z1)
      const d = Vector3.subtract(b, a)
      tr.position = Vector3.create((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      tr.rotation = Quaternion.lookRotation(Vector3.normalize(d))
      tr.scale = Vector3.create(0.5, 0.5, Math.max(0.1, Vector3.length(d)))
    }
    // the flash at the strike point
    if (this.glow) {
      const g = Transform.getMutable(this.glow)
      const s = strike ? 8 + Math.random() * 6 : t < 3 ? Math.max(0, 8 - (t - 2) * 8) : 0
      g.position = Vector3.create(at.x, at.y + 3, at.z)
      g.scale = s > 0.2 ? Vector3.create(s, s, s) : HIDDEN
    }
    // the rift: a tall vertical slit of bars that opens (1.5 s on) and writhes
    const open = Math.max(0, Math.min(1, (t - 1.5) / 1.5))
    for (let i = 0; i < this.rift.length; i++) {
      const tr = Transform.getMutable(this.rift[i])
      if (open <= 0) {
        tr.scale = HIDDEN
        continue
      }
      const f = i / (this.rift.length - 1)
      const y = 1 + f * 14
      const w = Math.sin(f * Math.PI) * 2.2 * open
      tr.position = Vector3.create(at.x + Math.sin(t * 3 + i) * 0.5, at.y + y, at.z)
      tr.rotation = Quaternion.fromEulerDegrees(0, 0, Math.sin(t * 2 + i * 0.7) * 25)
      tr.scale = Vector3.create(Math.max(0.1, w), 1.0, 0.4)
    }
  }
}

// ---------------- Cinematic 2 (prototype): night planes plus a rippling aurora band of cheap animated boxes ----------------
const AURORA_COLS = 24
export class AuroraFx {
  cols: Entity[] = []
  on = false
  private build() {
    for (let i = 0; i < AURORA_COLS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      MeshRenderer.setBox(e)
      const f = i / (AURORA_COLS - 1)
      const c = Color4.create(0.1 + 0.5 * f, 1 - 0.4 * f, 0.5 + 0.4 * f, 0.4)
      Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: Color4.create(c.r, c.g, c.b, 1), emissiveIntensity: 1.8, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
      this.cols.push(e)
    }
  }
  hide() {
    for (const e of this.cols) Transform.getMutable(e).scale = HIDDEN
  }
  // an arc of curtains 450 m north of the player at about 120-170 m up, rippling
  update(now: number, me: Vec) {
    if (this.cols.length === 0) this.build()
    for (let i = 0; i < AURORA_COLS; i++) {
      const f = i / (AURORA_COLS - 1)
      const x = me.x + (f - 0.5) * 700
      const z = me.z + 450 - Math.pow(f - 0.5, 2) * 500
      const ripple = Math.sin(now * 0.8 + i * 0.55)
      const h = 70 + 30 * Math.sin(now * 0.5 + i * 0.9)
      const t = Transform.getMutable(this.cols[i])
      t.position = Vector3.create(x, 130 + h / 2 + ripple * 8, z)
      t.rotation = Quaternion.fromEulerDegrees(0, 90 + Math.sin(now * 0.3 + i) * 10, ripple * 6)
      t.scale = Vector3.create(28, h, 1.5)
    }
  }
}


// A glowing stand-in figure at a point: the Synth may be too far for the app to draw, so the glimpse shot always has a subject (design v3).
export class StandIn {
  body: Entity | null = null
  head: Entity | null = null
  halo: Entity | null = null
  private build() {
    const mk = (mesh: 'cyl' | 'sph', color: Color4, a = 1) => {
      const e = engine.addEntity()
      Transform.create(e, { position: HIDDEN, scale: HIDDEN })
      if (mesh === 'cyl') MeshRenderer.setCylinder(e, 1, 1)
      else MeshRenderer.setSphere(e)
      Material.setPbrMaterial(e, { albedoColor: Color4.create(color.r, color.g, color.b, a), emissiveColor: color, emissiveIntensity: 2.5, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND })
      return e
    }
    this.body = mk('cyl', Color4.create(1, 0.75, 0.2, 1), 0.7)
    this.head = mk('sph', Color4.create(1, 0.85, 0.4, 1), 0.8)
    this.halo = mk('cyl', Color4.create(1, 1, 0.6, 1), 0.5)
  }
  hide() {
    for (const e of [this.body, this.head, this.halo]) if (e) Transform.getMutable(e).scale = HIDDEN
  }
  update(at: Vec, now: number) {
    if (!this.body) this.build()
    const pulse = 1 + 0.08 * Math.sin(now * 4)
    const b = Transform.getMutable(this.body!)
    b.position = Vector3.create(at.x, at.y + 0.9, at.z)
    b.scale = Vector3.create(0.6 * pulse, 1.8, 0.6 * pulse)
    const h = Transform.getMutable(this.head!)
    h.position = Vector3.create(at.x, at.y + 2.1, at.z)
    h.scale = Vector3.create(0.45, 0.45, 0.45)
    const r = Transform.getMutable(this.halo!)
    r.position = Vector3.create(at.x, at.y + 2.5, at.z)
    r.scale = Vector3.create(0.7, 0.04, 0.7)
  }
}

// ---------------- the effect library (round 23): primitives the server can spawn by id with parameters ----------------
// sphere, ring, column, pulse, spark, smoke, arrow: each is drawn from plain meshes with unlit colour; shrinking is the fade (no transparency needed).
export const FX_KINDS = ['sphere', 'ring', 'column', 'pulse', 'spark', 'smoke', 'arrow', 'rift', 'portal'] as const
export const FX_COLORS: Record<string, Color4> = {
  red: Color4.create(1, 0.12, 0.08, 1), orange: Color4.create(1, 0.5, 0.1, 1), yellow: Color4.create(1, 0.9, 0.15, 1), green: Color4.create(0.2, 0.9, 0.3, 1),
  blue: Color4.create(0.2, 0.5, 1, 1), cyan: Color4.create(0.2, 0.9, 1, 1), purple: Color4.create(0.62, 0.2, 1, 1), pink: Color4.create(1, 0.35, 0.75, 1),
  white: Color4.create(1, 1, 1, 1), black: Color4.create(0.05, 0.05, 0.07, 1), grey: Color4.create(0.4, 0.4, 0.44, 1), smoke: Color4.create(0.12, 0.1, 0.1, 1)
}
interface FxPart { e: Entity; kind: 'sphere' | 'cyl' | 'box'; ox: number; oy: number; oz: number; vx: number; vy: number; vz: number; s0: number; ph: number }
interface FxItem { born: number; seconds: number; kind: string; at: Vec; size: number; parts: FxPart[]; height: number; heading: number; jt?: number; jit?: number[] }
const FX_MAX_ITEMS = 24
const FX_MAX_PARTS = 160
export class FxLib {
  items: FxItem[] = []
  private parts = 0
  private mk(color: Color4, cyl = false, topR = 1, soft = 0, box = false): Entity {
    const e = engine.addEntity()
    Transform.create(e, { position: HIDDEN, scale: HIDDEN })
    if (box) MeshRenderer.setBox(e)
    else if (cyl) MeshRenderer.setCylinder(e, 0.5, topR * 0.5)
    else MeshRenderer.setSphere(e)
    if (soft > 0) softMat(e, color, soft, 1.5)
    else Material.setBasicMaterial(e, { diffuseColor: color })
    this.parts++
    return e
  }
  /** at: scene-local position. p: size (m), seconds, color (name or [r,g,b]), n (count), height, heading (deg, for arrow). Unknown kinds are ignored. */
  spawn(kind: string, at: Vec, now: number, p: { size?: number; seconds?: number; color?: unknown; n?: number; height?: number; heading?: number } = {}): boolean {
    if (!(FX_KINDS as readonly string[]).includes(kind)) return false
    if (this.items.length >= FX_MAX_ITEMS) this.remove(this.items[0]!)
    const size = Math.max(0.2, Math.min(60, Number(p.size ?? 3)))
    const seconds = Math.max(0.3, Math.min(60, Number(p.seconds ?? 3)))
    const n = Math.round(Math.max(1, Math.min(40, Number(p.n ?? 12))))
    const height = Math.max(0.5, Math.min(200, Number(p.height ?? 20)))
    let color = FX_COLORS.white!
    if (typeof p.color === 'string' && FX_COLORS[p.color]) color = FX_COLORS[p.color]!
    else if (Array.isArray(p.color) && p.color.length >= 3) color = Color4.create(clamp01(+p.color[0]), clamp01(+p.color[1]), clamp01(+p.color[2]), 1)
    const parts: FxPart[] = []
    const add = (e: Entity, kind2: 'sphere' | 'cyl' | 'box', ox = 0, oy = 0, oz = 0, vx = 0, vy = 0, vz = 0, s0 = 1, ph = 0) => { if (this.parts <= FX_MAX_PARTS) parts.push({ e, kind: kind2, ox, oy, oz, vx, vy, vz, s0, ph }) }
    if (kind === 'sphere') add(this.mk(color), 'sphere')
    else if (kind === 'ring' || kind === 'pulse') for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; add(this.mk(color), 'sphere', Math.cos(a), 0, Math.sin(a), 0, 0, 0, 0.35) }
    else if (kind === 'column') add(this.mk(color, true), 'cyl')
    else if (kind === 'spark') for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, up = 0.4 + Math.random(); add(this.mk(color), 'sphere', 0, 0, 0, Math.cos(a) * size, up * size * 1.5, Math.sin(a) * size, 0.3 + Math.random() * 0.3) }
    else if (kind === 'smoke') for (let i = 0; i < n; i++) { add(this.mk(i % 3 === 0 ? FX_COLORS.red! : i % 3 === 1 ? FX_COLORS.orange! : PUFF_COLORS[2]!, false, 1, 0.5), 'sphere', 0, 0, 0, 0, 0, 0, 1, i / n); add(this.mk(CORE_COLORS[i % 3]!), 'sphere', 0, 0, 0, 0, 0, 0, 0.55, i / n) }
    else if (kind === 'arrow') { add(this.mk(color, true), 'cyl', 0, 0, 0, 0, 0, 0, 0.4); add(this.mk(color, true, 0), 'cyl', 0, 0, 0, 0, 0, 0, 1) }
    else if (kind === 'portal') {
      // round 24: a vertical oval of fire and light with an irregular flickering edge and lightning bars around it. size = half the width (m), height = the full height (m)
      // layers, outermost first: a translucent glow, then three SATURATED self-lit (opaque, unlit) ellipsoids, each thicker in depth than the one outside it so the bright centre shows from both sides (one look for day and night)
      add(this.mk(color, false, 1, 0.45), 'sphere', 0, 0, 0, 0, 0, 0, 1, 30)
      add(this.mk(Color4.create(1, 0.2, 0.02, 1)), 'sphere', 0, 0, 0, 0, 0, 0, 1, 31)
      add(this.mk(Color4.create(1, 0.55, 0.05, 1)), 'sphere', 0, 0, 0, 0, 0, 0, 1, 32)
      add(this.mk(Color4.create(1, 0.93, 0.5, 1)), 'sphere', 0, 0, 0, 0, 0, 0, 1, 33)
      for (let i = 0; i < 24; i++) add(this.mk(i % 3 === 0 ? FX_COLORS.red! : i % 3 === 1 ? FX_COLORS.orange! : FX_COLORS.yellow!), 'sphere', 0, 0, 0, 0, 0, 0, i, 40)
      for (let b = 0; b < 3; b++) for (let sg = 0; sg < 6; sg++) add(this.mk(b === 1 ? FX_COLORS.white! : FX_COLORS.cyan!, false, 1, 0, true), 'box', 0, 0, 0, 0, 0, 0, sg, 50 + b)
    }
    else if (kind === 'rift') {
      // the Rift opening: a dark column splits upward, three rings roll out along the ground, sparks burst from the base
      add(this.mk(FX_COLORS.black!, true), 'cyl', 0, 0, 0, 0, 0, 0, 1, 0)
      add(this.mk(color, true), 'cyl', 0, 0, 0, 0, 0, 0, 0.4, 1)
      for (let r = 0; r < 3; r++) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; add(this.mk(color), 'sphere', Math.cos(a), 0, Math.sin(a), 0, 0, 0, 0.5, 10 + r) }
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2; add(this.mk(FX_COLORS.yellow!), 'sphere', 0, 0, 0, Math.cos(a) * size * 0.5, size * (1 + Math.random()), Math.sin(a) * size * 0.5, 0.3, 20) }
    }
    this.items.push({ born: now, seconds, kind, at: { ...at }, size, parts, height, heading: Number(p.heading ?? 0) })
    return true
  }
  private remove(it: FxItem) {
    for (const q of it.parts) { engine.removeEntity(q.e); this.parts-- }
    this.items.splice(this.items.indexOf(it), 1)
  }
  clear() { for (const it of [...this.items]) this.remove(it) }
  update(now: number) {
    for (const it of [...this.items]) {
      const age = now - it.born
      if (age >= it.seconds) { this.remove(it); continue }
      const u = age / it.seconds // 0..1
      const fade = u > 0.7 ? Math.max(0, (1 - u) / 0.3) : 1 // shrink away over the last 30 %
      const grow = Math.min(1, age / 0.25)
      for (const q of it.parts) {
        const t = Transform.getMutable(q.e)
        const size = it.size
        if (it.kind === 'sphere') { const r = size * (0.85 + 0.15 * Math.sin(age * 6)) * grow * fade; t.position = Vector3.create(it.at.x, it.at.y + r * 0.5, it.at.z); t.scale = Vector3.create(r, r, r) }
        else if (it.kind === 'ring') { const sc = size * 0.18 * fade; t.position = Vector3.create(it.at.x + q.ox * size, it.at.y + 0.3, it.at.z + q.oz * size); t.scale = Vector3.create(sc, sc, sc) }
        else if (it.kind === 'pulse') { const rad = size * u; const sc = size * 0.2 * fade; t.position = Vector3.create(it.at.x + q.ox * rad, it.at.y + 0.3, it.at.z + q.oz * rad); t.scale = Vector3.create(sc, sc, sc) }
        else if (it.kind === 'column') { const h = it.height * grow; t.position = Vector3.create(it.at.x, it.at.y + h / 2, it.at.z); t.scale = Vector3.create(size * fade, h, size * fade) }
        else if (it.kind === 'spark') { const g = 14; const x = it.at.x + q.vx * age, z = it.at.z + q.vz * age, y = it.at.y + q.vy * age - 0.5 * g * age * age; const sc = q.s0 * fade * (it.size * 0.2); t.position = Vector3.create(x, Math.max(it.at.y, y), z); t.scale = y < it.at.y - 0.2 ? HIDDEN : Vector3.create(sc, sc, sc) }
        else if (it.kind === 'smoke') { const rise = 8 + size; const y = ((age * rise + q.ph * it.height) % it.height); const h = y / it.height; const r = size * (0.4 + 0.9 * h) * grow * fade * (1 - 0.8 * h * h); t.position = Vector3.create(it.at.x + Math.sin(age * 0.8 + q.ph * 9) * (0.4 + h * size * 0.6), it.at.y + y, it.at.z + Math.cos(age * 0.7 + q.ph * 7) * (0.4 + h * size * 0.6)); t.scale = Vector3.create(r * q.s0, r * q.s0, r * q.s0) }
        else if (it.kind === 'arrow') {
          const rot = Quaternion.fromEulerDegrees(90, it.heading, 0)
          const dir = { x: Math.sin((it.heading * Math.PI) / 180), z: Math.cos((it.heading * Math.PI) / 180) }
          const isHead = q.s0 === 1
          const off = isHead ? size * 1.0 : size * 0.4
          t.position = Vector3.create(it.at.x + dir.x * off, it.at.y + 0.5, it.at.z + dir.z * off); t.rotation = rot
          const w = (isHead ? size * 0.5 : size * 0.18) * fade; t.scale = Vector3.create(w, isHead ? size * 0.6 : size * 0.8, w)
        } else if (it.kind === 'portal') {
          const H = it.height, A = size, cy = it.at.y + H / 2
          const open = Math.min(1, age / 0.8) * fade
          if (q.ph >= 30 && q.ph <= 33) {
            const f = q.ph === 30 ? [1.12, 1.08, 0.3] : q.ph === 31 ? [0.96, 0.94, 0.4] : q.ph === 32 ? [0.74, 0.76, 0.55] : [0.46, 0.55, 0.7]
            const br = 1 + 0.04 * Math.sin(age * 9 + q.ph)
            t.position = Vector3.create(it.at.x, cy, it.at.z); t.scale = Vector3.create(2 * A * f[0]! * open * br, H * f[1]! * open * br, A * f[2]! * open)
          } else if (q.ph === 40) {
            const i = q.s0, a = (i / 24) * Math.PI * 2
            const r = 1.02 + 0.09 * Math.sin(age * 5 + i * 2.1) + 0.06 * Math.sin(age * 11 + i) + ((i * 37) % 7) / 70
            const sc = size * (0.36 + 0.16 * Math.sin(age * 8 + i)) * open
            t.position = Vector3.create(it.at.x + A * r * Math.cos(a), cy + (H / 2) * r * Math.sin(a), it.at.z); t.scale = Vector3.create(sc, sc * 1.7, sc)
          } else if (q.ph >= 50) {
            if (!it.jit || age - (it.jt ?? -1) > 0.1) { it.jt = age; it.jit = Array.from({ length: 24 }, () => (Math.random() - 0.5) * 3) }
            const b = q.ph - 50, side = b % 2 === 0 ? -1 : 1, y0 = cy + (b - 1) * H * 0.25
            const pt = (k: number) => Vector3.create(it.at.x + side * (A * 0.95 + (k / 6) * (A * 0.8 + 5)) + it.jit![(b * 7 + k) % 24]! * (k === 0 ? 0 : 1), y0 + (k / 6) * H * 0.35 + it.jit![(b * 7 + k + 12) % 24]! * 0.6, it.at.z + (it.jit![(b * 5 + k + 6) % 24]! * 0.5))
            const p0 = pt(q.s0), p1 = pt(q.s0 + 1), d = Vector3.subtract(p1, p0), len = Math.max(0.1, Vector3.length(d))
            if (Math.random() < 0.12 || open < 0.5) t.scale = HIDDEN
            else { t.position = Vector3.create((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); t.rotation = Quaternion.lookRotation(Vector3.normalize(d)); t.scale = Vector3.create(0.22, 0.22, len) }
          }
        } else if (it.kind === 'rift') {
          const dur = it.seconds
          if (q.ph === 0) { const h = Math.min(1, age / (dur * 0.25)) * it.height; t.position = Vector3.create(it.at.x, it.at.y + h / 2, it.at.z); t.scale = Vector3.create(size * 0.5 * fade, h, size * 0.5 * fade) } // the dark column
          else if (q.ph === 1) { const h = Math.min(1, age / (dur * 0.25)) * it.height; t.position = Vector3.create(it.at.x, it.at.y + h / 2, it.at.z); t.scale = Vector3.create(size * 0.12 * fade, h * 1.01, size * 0.12 * fade) } // the bright core
          else if (q.ph >= 10 && q.ph < 20) { const k = q.ph - 10; const t0 = 0.15 + k * 0.2; const v = Math.max(0, (age / dur - t0) / (1 - t0)); const rad = size * v * 1.6; const sc = size * 0.14 * fade * (v > 0 ? 1 : 0); t.position = Vector3.create(it.at.x + q.ox * rad, it.at.y + 0.3, it.at.z + q.oz * rad); t.scale = Vector3.create(sc, sc, sc) }
          else { const g = 12; const a2 = Math.max(0, age - dur * 0.2); const y = it.at.y + q.vy * a2 - 0.5 * g * a2 * a2; const sc = 0.5 * fade; t.position = Vector3.create(it.at.x + q.vx * a2, Math.max(it.at.y, y), it.at.z + q.vz * a2); t.scale = age < dur * 0.2 || y < it.at.y ? HIDDEN : Vector3.create(sc, sc, sc) }
        }
      }
    }
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
      Transform.create(e, { position: Vector3.create(at.x + em.dx, at.y + em.dy, at.z + em.dz) })
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
    if (em.textured) out.texture = { tex: { $case: 'texture', texture: { src: 'images/puff.png' } } } // inside the zip: the only place a wearable's texture can come from
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
