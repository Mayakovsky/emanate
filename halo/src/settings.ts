// Round 23: every tunable of the halo lives here with a built-in DEFAULT (today's value). The server may override any of them (reply field `settings`);
// the halo keeps the defaults only for when the server cannot be reached. This file is pure data and logic (no SDK import) so the server's tests can load it.
//
// The halo is meant to be a THIN CLIENT: a frozen halo keeps working while the game changes, because the numbers, texts, sound mapping, effect parameters
// and feature switches all come from the server. See docs\EMANATE-HALO-PROTOCOL.md.
import { RULES } from './logic'

export const PROTOCOL_VERSION = 1 // the command vocabulary and settings schema this halo understands
export const BUILD_ID = 'c23d' // the halo build (set at release; the server logs it and may refuse an old one)

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
  plumePuffs: 24, plumeHeight: 120, plumeRise: 9, plumeBase: 1.2, plumeGrow: 3.0, plumeSway: 2.5, // the plume (smoke that rises and fades)
  plumeRed: 1, plumeOrange: 1, plumeSmoke: 1, // relative number of red, orange and smoke puffs
  riftSeconds: 3, riftRadius: 14, // the Rift opening effect at the lobby end
  liftAltitudes: 4, // how many lift targets (informational)
  gliderPrompt: 1, gliderPromptSeconds: 4 // show the "hold JUMP to open the glider" line for this long after a tier-3 wearer leaves the ground
}
// ---- features: 1 on, 0 off ----
export const FEATURES = { arrows: 1, plumes: 1, trap: 1, deadzoneWarn: 1, cinematics: 1, bubbleFx: 1, sounds: 1, debugPanel: 1, powers: 1, notes: 1, activeLine: 1 }
// ---- text (HUD notes and the always-on line) ----
export const TEXT: Record<string, string> = {
  activeLine: 'EMANATE halo active: sends your position to emanate.hiddenforces.net (see /privacy)',
  gliderPrompt: 'HOLD JUMP to open the glider',
  idle: '',
  refused: 'This Emanate halo is out of date.',
  roundStart: 'round {round} started',
  trapPlaced: 'Discharge Trap placed',
  trapDenied: 'you already have a trap down',
  plumeSent: 'plume sent',
  noPlumes: 'no plumes left this round',
  lobbyCall: 'The Synth: everyone into the bubble!',
  lobbyEnd: 'the bubble blows: {mode} with {count}'
}
// ---- which sound an event plays: event slot id -> another slot id, or "lib:<name>" for a tone of the library inside the zip; "" = silent ----
export const SOUNDS: Record<string, string> = {}
// ---- the channel ----
export const TICK = { everySec: 0.25, idlePollSec: 60 }

const SECTIONS: Record<string, Record<string, any>> = { power: POWER, rules: RULES, fx: FXS, features: FEATURES, text: TEXT, sounds: SOUNDS, tick: TICK }
// hard limits that keep the halo inside what Decentraland allows whatever the server says: [min, max]
const LIMITS: Record<string, [number, number]> = {
  'power.walkSpeed': [1, 12], 'power.jogSpeed': [1, 30], 'power.runSpeed': [1, 30], 'power.jumpHeight': [0.2, 6], 'power.runJumpHeight': [0.2, 8], 'power.doubleJumpHeight': [0.2, 14],
  'power.flySink': [0.05, 5], 'power.diveSink': [1, 40], 'power.speedCap': [5, 30], 'power.hMax': [5, 26], 'power.ceiling': [20, 220], 'power.brake': [5, 80], 'power.landCooldown': [0, 2],
  'power.fyHold': [0, 15], 'power.fyRising': [0, 40], 'power.fyEase': [0, 40], 'power.climbForce': [0, 60], 'power.climbMax': [1, 30], 'power.diveForce': [0, 60], 'power.diveMax': [1, 30], 'power.fwdForce': [0, 60],
  'power.ceilingTaper': [5, 100], 'power.diveBrakeStart': [5, 40], 'power.diveBrake': [0, 40], 'power.jumpBonus': [0, 1], 'power.airImpulse': [0, 1], 'power.airCarryK': [0, 2],
  'tick.everySec': [0.1, 5], 'tick.idlePollSec': [10, 3600],
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
    const open = sec === 'text' || sec === 'sounds' // free-form maps: any new string key may be added
    for (const k of Object.keys(src)) {
      const v = src[k]
      if (!open && !(k in target)) continue
      if (open) {
        if (typeof v === 'string' && v.length <= 200 && k.length <= 40) { target[k] = v; n++ }
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
export function snapshotDefaults() { return JSON.parse(JSON.stringify({ power: POWER, rules: RULES, fx: FXS, features: FEATURES, text: TEXT, sounds: SOUNDS, tick: TICK })) }
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
