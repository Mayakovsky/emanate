import test from 'node:test'
import assert from 'node:assert/strict'
import { planParticles, dropOldest, PCAP, PARTICLE_KINDS, PARTICLE_TEXTURES } from '../src/particleplan.ts'
import { existsSync, statSync } from 'node:fs'
import { chevronY, followY, RAY_UP, RAY_MAX, LIFT } from '../src/groundplan.ts'
import { applyRemote, resetToDefaults, FXS, FEATURES, feature } from '../src/settings.ts'

test('unknown kinds and non-objects are refused or defaulted, never an error', () => {
  assert.equal(planParticles('lava', {}, false), null); assert.equal(planParticles(5, {}, false), null); assert.equal(planParticles(undefined, {}, false), null)
  for (const k of PARTICLE_KINDS) assert.ok(planParticles(k, null, false)); assert.ok(planParticles('fire', 'text' as any, false))
})
test('every number is clamped to the caps whatever is sent (garbage, huge, negative, NaN, infinity)', () => {
  const bad = { size: 1e30, seconds: 1e9, height: 1e9, n: 1e9, color: [9, -3, 'x'], width: -5 }
  for (const k of PARTICLE_KINDS) {
    const p = planParticles(k, bad, true)!
    assert.ok(p.seconds <= PCAP.seconds); assert.ok(p.emitters.length >= 1 && p.emitters.length <= PCAP.emittersPerCommand)
    for (const e of p.emitters) {
      assert.ok(e.rate <= PCAP.rate && e.rate >= 1); assert.ok(e.maxParticles <= PCAP.maxParticles); assert.ok(e.lifetime <= PCAP.lifetime)
      assert.ok(e.sizeMax <= PCAP.size && e.sizeMin <= e.sizeMax); assert.ok(e.speedMax <= PCAP.speed && e.speedMin <= e.speedMax)
      for (const c of [e.colorMin, e.colorMax, e.fadeStart, e.fadeEnd]) for (const v of c) assert.ok(v >= 0 && v <= 1)
      if (e.shape.kind === 'cone') assert.ok(e.shape.angle <= PCAP.spread)
    }
  }
  const nan = planParticles('smoke', { size: NaN, seconds: Infinity, height: -Infinity, n: NaN }, false)!
  assert.ok(Number.isFinite(nan.seconds) && nan.emitters.every((e) => Number.isFinite(e.rate) && Number.isFinite(e.speedMax)))
})
test('smoke reach = speed x lifetime: about 150 m needs speed 14 to 16 at lifetime 10; 200 m is the top; tall columns stack two emitters', () => {
  const t = planParticles('smoke', { height: 150 }, false)!
  const e = t.emitters[0]!
  assert.equal(e.lifetime, 10); assert.ok(e.speedMax >= 14 && e.speedMax <= 16.6); assert.equal(e.gravity, 0)
  assert.ok(Math.abs((e.speedMin + e.speedMax) / 2 * e.lifetime - 150) < 1) // the mean reach is the requested height
  const top = planParticles('smoke', { height: 200 }, false)!.emitters[0]!
  assert.ok(Math.abs((top.speedMin + top.speedMax) / 2 * top.lifetime - 200) < 1)
  assert.equal(planParticles('smoke', { height: 150 }, false)!.emitters.length, 2); assert.equal(planParticles('smoke', { height: 50 }, false)!.emitters.length, 1)
})
test('every kind is alpha blended (c24g: additive fire and sparks vanished against a daylight sky); the texture flag only sets `textured`', () => {
  assert.equal(planParticles('sparks', {}, false)!.emitters[0]!.blend, 'alpha'); assert.equal(planParticles('fire', {}, false)!.emitters[0]!.blend, 'alpha'); assert.equal(planParticles('smoke', {}, false)!.emitters[0]!.blend, 'alpha')
  for (const k of PARTICLE_KINDS) { assert.equal(planParticles(k, {}, false)!.emitters[0]!.textured, false); assert.equal(planParticles(k, {}, true)!.emitters[0]!.textured, true) }
})
test('the live-emitter cap drops the oldest effects first', () => {
  assert.equal(dropOldest([], 3), 0); assert.equal(dropOldest([3, 3], 3), 1); assert.equal(dropOldest([2, 2, 2], 1), 1); assert.equal(dropOldest([3, 3], 6), 2); assert.equal(dropOldest([1], 1), 0)
  assert.equal(PCAP.liveEmitters, 6)
})
test('the kill switch and the texture flag come from the server and default to: particles ON, texture OFF', () => {
  resetToDefaults()
  assert.equal(feature('particles'), true); assert.equal(FXS.particleTexture, 1); assert.equal(FXS.arrowGround, 0)
  applyRemote({ features: { particles: 0 }, fx: { particleTexture: 1, arrowGround: 1 } })
  assert.equal(feature('particles'), false); assert.equal(FXS.particleTexture, 1); assert.equal(FXS.arrowGround, 1)
  applyRemote({ fx: { particleTexture: 7, arrowGround: -2 } }); assert.equal(FXS.particleTexture, 1); assert.equal(FXS.arrowGround, 0) // clamped to [0, 1]
  resetToDefaults(); assert.equal(feature('particles'), true); assert.equal(FEATURES.particles, 1)
})
test('arrow ground following: the ray result sets the chevron height, no hit or garbage falls back to flat, smoothing never jumps', () => {
  assert.ok(Math.abs(chevronY(10, RAY_UP) - (10 + LIFT)) < 1e-9) // ground at the foot level
  assert.ok(Math.abs(chevronY(10, RAY_UP - 1) - (11 + LIFT)) < 1e-9) // ground 1 m above the feet (a slope up)
  assert.ok(Math.abs(chevronY(10, RAY_UP + 1.2) - (8.8 + LIFT)) < 1e-9) // ground 1.2 m below
  for (const bad of [null, undefined, NaN, -1, RAY_MAX + 0.01, Infinity]) assert.equal(chevronY(10, bad as any), 10 + LIFT)
  assert.equal(followY(null, 5, 0.016), 5); assert.equal(followY(5, 5.1, 0.016), 5.1); assert.ok(Math.abs(followY(5, 9, 0.016) - (5 + 12 * 0.016)) < 1e-9); assert.equal(followY(5, 9, 0), 5)
  assert.equal(followY(NaN, 3, 0.1), 3)
})

test('the server picks the texture by name per emitter; unknown names fall back to the kind default (c24g)', () => {
  assert.equal(planParticles('smoke', {}, true)!.emitters[0]!.tex, 'wisp'); assert.equal(planParticles('fire', {}, true)!.emitters[0]!.tex, 'flame'); assert.equal(planParticles('sparks', {}, true)!.emitters[0]!.tex, 'spark')
  assert.equal(planParticles('smoke', { texture: 'puff' }, true)!.emitters[0]!.tex, 'puff'); assert.equal(planParticles('fire', { texture: 'flipbook' }, true)!.emitters[0]!.tex, 'flipbook')
  for (const bad of ['../etc/passwd', 'images/puff.png', 5, null, {}, 'PUFF']) assert.equal(planParticles('smoke', { texture: bad }, true)!.emitters[0]!.tex, 'wisp')
})
test('c24g smoke is bigger and denser than c24f: start size 1.6x to 2.4x the size parameter, 60 particles a second', () => {
  const e = planParticles('smoke', { size: 2 }, false)!.emitters[0]!
  assert.ok(Math.abs(e.sizeMin - 3.2) < 1e-9 && Math.abs(e.sizeMax - 4.8) < 1e-9); assert.equal(e.rate, 60)
})

test('smoke and fire emitters point up (turned -90 degrees about X), sparks are omnidirectional (c24g, found in the real client)', () => {
  assert.equal(planParticles('smoke', {}, false)!.emitters[0]!.up, true); assert.equal(planParticles('fire', {}, false)!.emitters[0]!.up, true); assert.equal(planParticles('sparks', {}, false)!.emitters[0]!.up, false)
})

import { cueKeyFor, CUE_BY_EVENT } from '../src/uiplan.ts'
import { TEXT, say } from '../src/settings.ts'
test('c24i: every stage has a cue text (plain English, one or two short lines, under 160 characters), the server can blank or change it, and unknown events have none', () => {
  resetToDefaults()
  for (const [ev, key] of Object.entries(CUE_BY_EVENT)) { assert.equal(cueKeyFor(ev), key); const t = say(key); assert.ok(t.length > 0 && t.length <= 160, key); assert.ok(t.split('\n').length <= 2, key) }
  assert.equal(cueKeyFor('contact'), null); assert.equal(cueKeyFor('plume'), null)
  assert.ok(!say('cueRound').includes('Press 1') && say('cueRound').includes('Press 4') && say('cueRound').includes('Press E to set a trap')) // c30f: arrows off, no arrow key in the cue
  applyRemote({ text: { cueRound: '' } }); assert.equal(say('cueRound'), ''); resetToDefaults(); assert.ok(say('cueRound').length > 0)
  applyRemote({ features: { cues: 0 } }); assert.equal(feature('cues'), false); resetToDefaults(); assert.equal(feature('cues'), true)
  applyRemote({ fx: { cueSeconds: 999 } }); assert.equal(FXS.cueSeconds, 30); resetToDefaults(); assert.equal(FXS.cueSeconds, 9)
})

test('c25: every named particle texture has its file in images/ (the zip is locked after the Mint Lock, so a missing one could never be added)', () => {
  for (const t of PARTICLE_TEXTURES) { const f = new URL('../images/' + t + '.png', import.meta.url); assert.ok(existsSync(f), 'missing images/' + t + '.png'); assert.ok(statSync(f).size > 0 && statSync(f).size < 8192, t) }
})
