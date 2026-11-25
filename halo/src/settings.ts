// Round 23: every tunable of the halo lives here with a built-in DEFAULT (today's value). The server may override any of them (reply field `settings`);
// the halo keeps the defaults only for when the server cannot be reached. This file is pure data and logic (no SDK import) so the server's tests can load it.
//
// The halo is meant to be a THIN CLIENT: a frozen halo keeps working while the game changes, because the numbers, texts, sound mapping, effect parameters
// and feature switches all come from the server. See docs\EMANATE-HALO-PROTOCOL.md.
import { RULES } from './logic'

export const PROTOCOL_VERSION = 1 // the command vocabulary and settings schema this halo understands
export const BUILD_ID = 'c31f' // the halo build (set at release; the server logs it and may refuse an old one)

// ---- the powers (index.ts) ----
export const POWER = {
  walkSpeed: 5, jogSpeed: 11.7, runSpeed: 16.2, // tier 1 sprint
  jumpHeight: 1.6, runJumpHeight: 2.2, doubleJumpHeight: 9, // tier 2
  flySink: 0.3, // tier 3 glide sink, m/s
  fyHold: 7.0, fyRising: 27.0, fyEase: 24.0, climbForce: 30, climbMax: 14.5, diveForce: 25, diveMax: 16.2, diveSink: 20.3, fwdForce: 22,
  ceiling: 200, speedCap: 24.3, brake: 40, hMax: 19.2, diveBrakeStart: 17.8, diveBrake: 16, ceilingTaper: 45,
  landCooldown: 0.25, jumpBonus: 0.25, airImpulse: 0.3, airCarryK: 0.55
}
// ---- effects (fx.ts) ----
export const FXS = {
  chevrons: 6, chevronSpacing: 2.4, chevronStart: 1.8, // the tracking arrows
  plumePuffs: 40, plumeHeight: 100, plumeRise: 6, plumeBase: 3.0, plumeGrow: 6.0, plumeSway: 2.5, // the plume (smoke that rises and fades)
  plumeRed: 1, plumeOrange: 1, plumeSmoke: 0.35, // relative number of red, orange and smoke puffs
  riftSeconds: 3, riftRadius: 14, // the Rift opening effect at the lobby end
  liftAltitudes: 4, // how many lift targets (informational)
  particleTexture: 1, arrowGround: 0, cueSeconds: 9, // c24f candidate: particles use images/puff.png when 1 (default 1: textured); chevrons follow the ground by raycast when 1 (default 0: flat)
}
// ---- c27: the blast (game start). The server sends the command; these are the Halo's defaults, all server-settable ----
// radius: the planned landing is inside this many metres of the centre; gravity: the Halo's model of the fall (calibrated on the client); apexMin/apexMax: launch height range (m); maxFy/maxFh: force ceilings; vMax: highest horizontal speed planned; bounds: the map half-size the plan stays inside
export const BLAST = { radius: 500, gravity: 10, riseGravity: 40, apexMin: 80, apexMax: 240, maxFy: 60, maxFh: 60, kv: 6, vMax: 110, bounds: 2400, scale: 1, hold: 1, flashSeconds: 0.25, flashStrength: 0.7, bubbleRadius: 110, bubbleSeconds: 2.5, bubbleHold: 3, bubbleImplode: 1, bubbleAlpha: 0.75, rethrowCooldown: 6, callCooldown: 120, callRange: 800, cannon: 1, steer: 60, steerK: 4, steerEase: 60, vyMax: 150, gain: 1, burst: 0.15, speed: 110, rangeA: 400, rangeK: 1, elevMin: 40, elevMax: 89 }
// ---- features: 1 on, 0 off ----
export const FEATURES = { calls: 1, arrows: 0 /* c30f (Directive X item 4): arrows off by default, the code stays; the server can switch them back on */, plumes: 1, trap: 1, deadzoneWarn: 1, cinematics: 1, bubbleFx: 1, sounds: 1, debugPanel: 1, powers: 1, notes: 1, activeLine: 1, particles: 1, cues: 1, callNear: 0, blastBurst: 1 }
// ---- text (HUD notes and the always-on line) ----
export const TEXT: Record<string, string> = {
  activeLine: 'GHOSTCODE halo active: sends your position to emanate.hiddenforces.net (see /privacy)',
  joinPrompt: 'Pack your bags!'+String.fromCharCode(10)+'This could hurt a little.'+String.fromCharCode(10)+'Hold E for 1.5 seconds to join.',
  idle: '',
  refused: 'This Ghostcode halo is out of date.',
  roundStart: 'round {round} started',
  trapPlaced: 'Discharge Trap placed',
  trapDenied: 'you already have a trap down',
  plumeSent: 'plume sent',
  noPlumes: 'no plumes left this round',
  lobbyCall: 'The Synth: everyone into the bubble!',
  lobbyEnd: 'the bubble blows: {mode} with {count}',
  // c24i: stage cues, one or two short plain lines each; the server may change or blank any of them (blank = no cue for that stage)
  cueLobby: 'Step into the glowing bubble around the Synth to join.',
  cueRound: 'Chase the Synth and run into it.' + String.fromCharCode(10) + 'Press 4 for a smoke plume. Press E to set a trap.', // c30f: no arrow keys (arrows off)
  callPrompt: 'The Synth is calling.'+String.fromCharCode(10)+'Step into the red portal and hold E to join.',
  cueEnding: 'Walk into a portal to pick your side.' + String.fromCharCode(10) + 'The game starts again when the countdown ends.'
}
// ---- which sound an event plays: event slot id -> another slot id, or "lib:<name>" for a tone of the library inside the zip; "" = silent ----
export const SOUNDS: Record<string, string> = {}
// ---- the channel ----
// c26: ONE build flag. OFF while the Halo is still tested (the server-unreachable test mode keeps its Tier 1 and the test keys); it MUST be ON in the published build (blocking step on the final-build readiness list).
/** c29 (Plan v2): the effect recipe overrides from the server: flat keys such as `E13.smoke.size` (see look.ts tweakFor); free-form like text/sounds, key under 40 chars, value under 200 */
export const LOOK: Record<string, number | string> = {}
export const FINAL_NO_TEST_POWERS = false
export const TICK = { everySec: 0.25, idlePollSec: 60 }

const SECTIONS: Record<string, Record<string, any>> = { power: POWER, rules: RULES, fx: FXS, blast: BLAST, features: FEATURES, text: TEXT, sounds: SOUNDS, tick: TICK, look: LOOK }
// hard limits that keep the halo inside what Decentraland allows whatever the server says: [min, max]
const LIMITS: Record<string, [number, number]> = {
  'power.walkSpeed': [1, 12], 'power.jogSpeed': [1, 30], 'power.runSpeed': [1, 30], 'power.jumpHeight': [0.2, 6], 'power.runJumpHeight': [0.2, 8], 'power.doubleJumpHeight': [0.2, 14],
  'power.flySink': [0.05, 5], 'power.diveSink': [1, 40], 'power.speedCap': [5, 30], 'power.hMax': [5, 26], 'power.ceiling': [20, 220], 'power.brake': [5, 80], 'power.landCooldown': [0, 2],
  'power.fyHold': [0, 15], 'power.fyRising': [0, 40], 'power.fyEase': [0, 40], 'power.climbForce': [0, 60], 'power.climbMax': [1, 30], 'power.diveForce': [0, 60], 'power.diveMax': [1, 30], 'power.fwdForce': [0, 60],
  'power.ceilingTaper': [5, 100], 'power.diveBrakeStart': [5, 40], 'power.diveBrake': [0, 40], 'power.jumpBonus': [0, 1], 'power.airImpulse': [0, 1], 'power.airCarryK': [0, 2],
  'tick.everySec': [0.1, 5], 'tick.idlePollSec': [10, 3600],
  'fx.particleTexture': [0, 1], 'fx.arrowGround': [0, 1], 'fx.cueSeconds': [2, 30],
  'fx.plumePuffs': [4, 48], 'fx.chevrons': [2, 10], 'fx.plumeHeight': [10, 250], 'fx.plumeRise': [1, 30],
  'rules.plumeSeconds': [1, 60], 'rules.plumesPerRound': [0, 20], 'rules.boostSeconds': [1, 120]
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Merge the server's overrides into the live settings. Only keys that exist, with a value of the same type; numbers are clamped; anything else is ignored. Returns how many values were applied. */
export function applyRemote(o: any): number {
  if (!o || typeof o !== 'object') return 0
  let n = 0
  for (const sec of Object.keys(o)) {
    const target = SECTIONS[sec]
    const src = o[sec]
    if (!target || !src || typeof src !== 'object') continue
    const open = sec === 'text' || sec === 'sounds' || sec === 'look' // free-form maps: any new key may be added
    for (const k of Object.keys(src)) {
      const v = src[k]
      if (!open && !(k in target)) continue
      if (open) {
        if (typeof v === 'string' && v.length <= 200 && k.length <= 40) { target[k] = v; n++ }
        else if (sec === 'look' && typeof v === 'number' && Number.isFinite(v) && k.length <= 40) { target[k] = v; n++ }
        continue
      }
      const cur = target[k]
      if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v)) {
        const lim = LIMITS[sec + '.' + k] ?? (sec === 'features' ? [0, 1] : cur === 0 ? [-10, 10] : cur > 0 ? [0, cur * 10] : [cur * 10, 0])
        target[k] = clamp(v, lim[0], lim[1]); n++
      } else if (typeof cur === 'string' && typeof v === 'string' && v.length <= 200) { target[k] = v; n++ }
    }
  }
  return n
}
/** The built-in defaults, for the server's test and for resetting. */
export function snapshotDefaults() { return JSON.parse(JSON.stringify({ power: POWER, rules: RULES, fx: FXS, blast: BLAST, features: FEATURES, text: TEXT, sounds: SOUNDS, tick: TICK, look: LOOK })) }
const DEFAULTS_AT_LOAD = snapshotDefaults()
export function resetToDefaults() {
  for (const sec of Object.keys(SECTIONS)) {
    const t = SECTIONS[sec]!
    for (const k of Object.keys(t)) delete t[k]
    Object.assign(t, JSON.parse(JSON.stringify(DEFAULTS_AT_LOAD[sec])))
  }
}
export const feature = (name: string) => (FEATURES as Record<string, number>)[name] !== 0
export const say = (key: string, vars: Record<string, string | number> = {}) => (TEXT[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
