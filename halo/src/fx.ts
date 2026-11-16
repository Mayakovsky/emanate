// EMANATE Build 04: visuals and sounds (placeholders). Everything here is drawn by the wearer's own client, so arrows are
// wearer-only by construction; plumes are drawn for every player from the server's list.
import { engine, Transform, MeshRenderer, Material, AudioSource, MaterialTransparencyMode, MainCamera, VirtualCamera, type Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { SLOT_TABLE, SLOT_LOOP } from './audioSlots'
import { PACKED } from './audioPacked'
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
export function playSlot(id: string) {
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
  if (armed.size === 0) return
  for (const k of armed) {
    const [key, id] = k.split('|')
    const e = key!.startsWith('s:') ? slotEntities.get(id!) : toneEntities.get(key!.slice(2))
    if (e) AudioSource.getMutable(e).playing = true
  }
  armed.clear()
}

// ---------------- tracking arrows >>> ----------------
const CHEVRONS = 6
const SPACING = 2.4
const START = 1.8 // first chevron this far ahead of the feet
const MAX_LEN = START + CHEVRONS * SPACING
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
  constructor() {
    const mk = (kind: ArrowKind): ArrowRun => ({ kind, ch: new ArrowChannel(), target: null, phase: 0, mode: 'arrow', sputterUntil: 0, chevrons: null })
    this.runs = { red: mk('red'), pink: mk('pink'), white: mk('white'), purple: mk('purple'), yellow: mk('yellow') }
  }
  private ensure(r: ArrowRun) {
    if (!r.chevrons) r.chevrons = Array.from({ length: CHEVRONS }, () => makeChevron(COLORS[r.kind]))
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
        offs = chevronOffsets(CHEVRONS, SPACING, 0, START, MAX_LEN).map((o, i) => ({
          s: o.s,
          fade: alive && Math.sin(r.phase * (1.7 + i * 0.9) + i * 2.1) > 0.35 ? o.fade * Math.min(1, left / 0.4) * 0.8 : 0
        }))
      } else {
        r.phase += dt * arrowSpeed(d)
        offs = chevronOffsets(CHEVRONS, SPACING, r.phase, START, Math.min(MAX_LEN, Math.max(2.5, d - 0.5)))
      }
      for (let i = 0; i < chevs.length; i++) {
        const t = Transform.getMutable(chevs[i].root)
        const o = offs[i]
        t.position = Vector3.create(me.x + fwd.x * o.s, me.y + 0.06, me.z + fwd.z * o.s) // flat at foot level (no ground following; Forces judges slopes)
        t.rotation = rot
        const sc = 1.3 * o.fade
        t.scale = sc > 0.02 ? Vector3.create(sc, sc, sc) : HIDDEN
      }
    }
  }
}

// ---------------- plumes: a column of smoke rising from the trigger point, 14 s ----------------
const PUFFS = 12
const PLUME_HEIGHT = 120
interface PlumeVis { id: number | string; base: Vec; born: number; puffs: Entity[] }
export class Plumes {
  list = new Map<number | string, PlumeVis>()
  spawn(id: number | string, base: Vec, ageSec: number, now: number) {
    if (this.list.has(id)) return
    const puffs: Entity[] = []
    for (let i = 0; i < PUFFS; i++) {
      const e = engine.addEntity()
      Transform.create(e, { position: Vector3.create(base.x, base.y, base.z), scale: HIDDEN })
      MeshRenderer.setSphere(e)
      // fiery red and smoky (a placeholder until skinned): glowing red-orange puffs alternate with dark smoke
      if (i % 2 === 0) Material.setPbrMaterial(e, { albedoColor: Color4.create(0.95, 0.22, 0.06, 0.7), emissiveColor: Color4.create(1, 0.3, 0.05, 1), emissiveIntensity: 1.6, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
      else Material.setPbrMaterial(e, { albedoColor: Color4.create(0.22, 0.2, 0.2, 0.6), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
      puffs.push(e)
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
    for (const [id, p] of this.list) {
      const age = now - p.born
      const left = RULES.plumeSeconds - age
      if (left <= 0) {
        this.remove(id, p)
        continue
      }
      const grow = Math.min(1, age / 0.6)
      const fade = Math.min(1, left / 2)
      for (let i = 0; i < PUFFS; i++) {
        const y = (age * 9 + (i * PLUME_HEIGHT) / PUFFS) % PLUME_HEIGHT
        const h = y / PLUME_HEIGHT
        const r = (1.6 + 4.5 * h) * grow * fade
        const t = Transform.getMutable(p.puffs[i])
        t.position = Vector3.create(p.base.x + Math.sin(age * 0.7 + i * 1.3) * (0.6 + 2.5 * h), p.base.y + y, p.base.z + Math.cos(age * 0.6 + i * 1.7) * (0.6 + 2.5 * h))
        t.scale = Vector3.create(r, r, r)
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
