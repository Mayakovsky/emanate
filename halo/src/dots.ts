// EMANATE Build 03 prototype: the tracking-dot ring (the Halo's HUD), drawn for the wearer only.
//
// Design (Emanate-Game-Design.md, "The Halo"): small dots of light orbit the wearer's head, each
// pointing toward what it tracks. Size and brightness show distance. Six dot types, each with its
// colour AND a second signal so colourblind players can tell them apart:
//   red    The Synth                        heartbeat (lub-dub)
//   pink   An upgrade drop in range         double pulse
//   yellow A player on your side            flicker
//   cyan   Other side / not yet aligned     constant (slow) pulse
//   purple Endgame point (portal/contain.)  electricity (jitter + spikes)
//   white  Dead zone ahead                  fast strobe
// The band is flat by default (bearing only, no height). Local entities render only on the local
// client, so each player sees only their own dots, which is exactly "drawn for the wearer only".
//
// This prototype is fed fake targets (see FAKE_TARGETS in index.ts); the server feed comes later.
import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'

export type DotKind = 'red' | 'pink' | 'yellow' | 'cyan' | 'purple' | 'white'
export interface DotTarget {
  kind: DotKind
  position: Vector3 // world position of the thing tracked
}

export const DOT_COLORS: Record<DotKind, Color3> = {
  red: Color3.create(1.0, 0.1, 0.1),
  pink: Color3.create(1.0, 0.4, 0.8),
  yellow: Color3.create(1.0, 0.9, 0.1),
  cyan: Color3.create(0.1, 0.9, 1.0),
  purple: Color3.create(0.6, 0.2, 1.0),
  white: Color3.create(1.0, 1.0, 1.0)
}
export const DOT_SIGNALS: Record<DotKind, string> = {
  red: 'heartbeat',
  pink: 'double pulse',
  yellow: 'flicker',
  cyan: 'constant pulse',
  purple: 'electricity',
  white: 'fast strobe'
}

// ---- tunables ----
export const RING_RADIUS = 0.6 // m from the head axis; read in third and first person (tune on Zone)
export const HEAD_HEIGHT = 1.75 // m above the player's feet
export const RANGE = 300 // m: beyond this a dot is at its smallest and dimmest
export const SIZE_NEAR = 0.14 // m dot diameter when the target is right here
export const SIZE_FAR = 0.04 // m dot diameter at RANGE or beyond
export const BRIGHT_NEAR = 1.0
export const BRIGHT_FAR = 0.35

// ---- pure helpers (unit-tested in halo-tools) ----
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const bump = (t: number, c: number, w: number) => Math.exp(-((t - c) * (t - c)) / (2 * w * w)) // a smooth pulse

/** Size shrinks and brightness dims with distance (nearer = bigger and brighter). */
export function dotSize(dist: number): number {
  const f = Math.sqrt(clamp(dist / RANGE, 0, 1))
  return SIZE_NEAR + (SIZE_FAR - SIZE_NEAR) * f
}
export function distanceBrightness(dist: number): number {
  const f = clamp(dist / RANGE, 0, 1)
  return BRIGHT_NEAR + (BRIGHT_FAR - BRIGHT_NEAR) * f
}

/** A cheap deterministic pseudo-random in [0,1) from a number (for flicker and electricity). */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** The second signal: a 0..1 intensity multiplier over time t (seconds). */
export function signal(kind: DotKind, t: number): number {
  switch (kind) {
    case 'red': {
      // heartbeat: "lub-dub" once a second
      const p = t % 1.0
      return clamp(bump(p, 0.1, 0.05) + 0.7 * bump(p, 0.32, 0.05), 0.08, 1)
    }
    case 'pink': {
      // double pulse: two equal quick pulses, then rest, every 1.4 s
      const p = t % 1.4
      return clamp(bump(p, 0.1, 0.05) + bump(p, 0.4, 0.05), 0.08, 1)
    }
    case 'yellow': {
      // flicker: random on/off about 12 times a second
      return hash01(Math.floor(t * 12)) > 0.45 ? 1 : 0.12
    }
    case 'cyan':
      // constant pulse: a slow even sine
      return 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 1.6)
    case 'purple': {
      // electricity: unsteady base with random spikes
      const spike = hash01(Math.floor(t * 30)) > 0.8 ? 1 : 0
      return clamp(0.45 + 0.25 * hash01(Math.floor(t * 20) + 7) + 0.5 * spike, 0, 1)
    }
    case 'white':
      // fast strobe: square wave, 8 Hz
      return Math.floor(t * 16) % 2 === 0 ? 1 : 0.05
  }
}

/** Where on the ring a dot sits: toward the target, on a flat horizontal band at head height. */
export function ringPosition(head: Vector3, target: Vector3, radius = RING_RADIUS): Vector3 {
  const dx = target.x - head.x
  const dz = target.z - head.z
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len < 1e-4) return Vector3.create(head.x, head.y, head.z + radius) // straight overhead/under: any bearing
  return Vector3.create(head.x + (dx / len) * radius, head.y, head.z + (dz / len) * radius)
}

/** Purple electricity also jitters in position a little. */
export function electricityJitter(t: number): Vector3 {
  const k = Math.floor(t * 30)
  return Vector3.create((hash01(k) - 0.5) * 0.06, (hash01(k + 11) - 0.5) * 0.06, (hash01(k + 23) - 0.5) * 0.06)
}

// ---- the system ----
const entities: Entity[] = []
let clock = 0

export function setupDots(getTargets: () => DotTarget[]) {
  engine.addSystem((dt: number) => {
    clock += dt
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (!player) return
    const head = Vector3.create(player.position.x, player.position.y + HEAD_HEIGHT, player.position.z)
    const targets = getTargets()
    // grow/shrink the pool of dot entities to match the targets
    while (entities.length < targets.length) {
      const e = engine.addEntity()
      MeshRenderer.setSphere(e)
      entities.push(e)
    }
    while (entities.length > targets.length) {
      engine.removeEntity(entities.pop() as Entity)
    }
    for (let i = 0; i < targets.length; i++) {
      const tg = targets[i]
      const e = entities[i]
      const dist = Vector3.distance(player.position, tg.position)
      let pos = ringPosition(head, tg.position)
      if (tg.kind === 'purple') pos = Vector3.add(pos, electricityJitter(clock))
      const size = dotSize(dist)
      const level = distanceBrightness(dist) * signal(tg.kind, clock)
      Transform.createOrReplace(e, { position: pos, scale: Vector3.create(size, size, size) })
      const c = DOT_COLORS[tg.kind]
      Material.setPbrMaterial(e, {
        albedoColor: Color4.create(c.r, c.g, c.b, 1),
        emissiveColor: c,
        emissiveIntensity: 6 * level,
        metallic: 0,
        roughness: 1
      })
    }
  }, 0, 'emanate-halo-dots')
}
