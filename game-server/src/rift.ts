// Round 24: the Rift at the Synth's trigger. Forces's spec: an irregular vertical oval of fire and light, 6 m tall, standing on a column of smoke that
// reaches the top of the sky, with lightning around it; the Synth walks (or is pulled) into it and is gone.
//   every mode        : at the Synth's position and height when the Rift is triggered (the lobby's end)
//   Helper ending     : 20 m below the top of the max sky height (the halo's power.ceiling)
//   Hunter ending     : at ground level
// Pure: it returns the halo commands and the Synth's steps; the server queues them. The halo needs no change (the `portal` and `smoke` library effects take any position).
import type { Vec } from './geo.ts'

export type RiftKind = 'trigger' | 'helper-ending' | 'hunter-ending'
export interface RiftTrigger { kind: RiftKind; at: Vec }
export interface RiftPlan {
  halo: Record<string, unknown>[]
  /** the Synth's steps: after `afterMs`, a raw Synth command */
  synth: { afterMs: number; cmd: Record<string, unknown> }[]
  centre: Vec
  /** when the last Synth step is due (ms): the match's own placement of the Synth waits until after this */
  endMs: number
}
export const RIFT_HEIGHT = 6
export const RIFT_HALF_WIDTH = 2
export const RIFT_SECONDS = 14
export const RIFT_STEP_MS = 4500 // the Synth's walk into the Rift takes about 3.5 s; the match's own placement of the Synth waits this long
export const PARK: Vec = { x: 0, y: 0, z: -124 } // where an ending's Synth waits: the spot it has sat at safely for hours
export const SMOKE_CAP = 200 // the halo's cap for a smoke column

export interface RiftOpts { walkMs?: number; offset?: number } // walkMs: how long the Synth's walk to the oval takes (a test can slow it); offset: metres between the Synth and the oval at a lobby end
export const RIFT_DEFAULTS = { walkMs: 1600, offset: 6 }
export function planRift(t: RiftTrigger, ceiling = 200, opts: RiftOpts = {}): RiftPlan {
  const walkMs = Math.max(300, Math.min(20_000, opts.walkMs ?? RIFT_DEFAULTS.walkMs))
  const off = t.kind === 'trigger' ? Math.max(0, Math.min(30, opts.offset ?? RIFT_DEFAULTS.offset)) : 0
  if (off > 0) t = { ...t, at: { x: t.at.x + off, y: t.at.y, z: t.at.z } } // the oval stands `off` m from where the Synth is, so the Synth is seen WALKING INTO it
  let base = t.at.y // the Synth's own height at the trigger (a stand-on-ground y is the ground there)
  if (t.kind === 'helper-ending') base = ceiling - 20 - RIFT_HEIGHT / 2 // the oval's CENTRE is 20 m below the top of the max sky height
  else if (t.kind === 'hunter-ending') base = 0 // ground level (the ending's spot is an empty parcel)
  base = Math.max(0, base)
  const centre = { x: t.at.x, y: base + RIFT_HEIGHT / 2, z: t.at.z }
  const halo: Record<string, unknown>[] = [
    // the smoke column: from the ground to the top of the sky, behind the oval
    { c: 'fx', kind: 'smoke', x: t.at.x, y: 0, z: t.at.z + 3, size: 7, seconds: RIFT_SECONDS, height: Math.min(SMOKE_CAP, Math.max(20, ceiling)), n: 40 },
    { c: 'fx', kind: 'portal', x: t.at.x, y: base, z: t.at.z, size: RIFT_HALF_WIDTH, height: RIFT_HEIGHT, seconds: RIFT_SECONDS, color: 'red' },
    { c: 'sound', id: 'lib:cue_rift' }
  ]
  const synth: RiftPlan['synth'] = t.kind === 'trigger' && off > 0 ? [
    // the lobby end: the Synth stands `off` m from the oval; it WALKS to the middle (walk_to), is moved out of sight when it arrives, and the match's own placement follows
    { afterMs: 400, cmd: { cmd: 'walk_to', x: t.at.x, z: t.at.z } },
    { afterMs: 400 + walkMs, cmd: { cmd: 'move', x: t.at.x + 600, y: 0, z: t.at.z + 600 } }
  ] : [
    // an ending: to the oval's edge, into its middle, then away
    { afterMs: 0, cmd: { cmd: 'move', x: t.at.x - 3, y: base, z: t.at.z - 1 } },
    { afterMs: 2500, cmd: { cmd: 'move', x: t.at.x, y: base, z: t.at.z } },
    { afterMs: 3300, cmd: { cmd: 'move', x: t.at.x + 600, y: 0, z: t.at.z + 600 } }
  ]
  // an ending: park the Synth at the safe spot (it is 600 m away only for about 2 s: the scene runtime loads what is around it); a lobby end needs no step, the match's placement follows
  if (t.kind !== 'trigger') synth.push({ afterMs: 5500, cmd: { cmd: 'move', x: PARK.x, y: PARK.y, z: PARK.z } })
  return { halo, synth, centre, endMs: synth[synth.length - 1]!.afterMs }
}
