import test from 'node:test'
import assert from 'node:assert/strict'
import { planBubble, spherePoints, LCAP, liveParticles } from '../src/look.ts'
test('E13 plan: fixed particle size, emitters grow with the radius', () => {
  const small = planBubble([0, 0, 0], 11, 110), big = planBubble([0, 0, 0], 110, 110)
  assert.ok(big.emitters.length > small.emitters.length)
  assert.equal(new Set(big.emitters.map((e) => e.sizeMax)).size, 1) // every particle the same size
  assert.equal(small.emitters[0]!.sizeMax, big.emitters[0]!.sizeMax) // not bigger in a bigger bubble
  assert.equal(spherePoints(32).length, 32)
  assert.ok(big.emitters.reduce((a, e) => a + liveParticles(e), 0) <= LCAP.particles * 2)
})
import { planEffect, EFFECT_IDS, tweakFor, rng } from '../src/look.ts'
test('every effect E1..E14 plans within the caps and is repeatable', () => {
  for (const id of EFFECT_IDS) {
    const a = planEffect(id, { r: id === 'E5' ? 10 : undefined })!, b = planEffect(id, { r: id === 'E5' ? 10 : undefined })!
    assert.ok(a.emitters.length > 0 && a.emitters.length <= LCAP.emitters + 12, id + ' emitters ' + a.emitters.length)
    assert.deepEqual(a, b) // the fixed random sequence: the same every time
    const parts = a.emitters.reduce((n, e) => n + Math.min(e.maxParticles, Math.ceil(e.rate * e.lifetime)), 0)
    assert.ok(parts <= LCAP.particles * 2, id + ' particles ' + parts)
    for (const e of a.emitters) assert.ok(e.rate <= LCAP.rate && e.sizeMax <= (a.big ? LCAP.bigSize : LCAP.size) && e.lifetime <= LCAP.lifetime)
  }
})
test('the look overrides change an effect and an effect can be switched off', () => {
  const base = planEffect('E1')!, big = planEffect('E1', {}, { 'E1.smoke.size': 2 })!
  assert.ok(big.emitters.find((e) => e.tex === 'wisp')!.sizeMax > base.emitters.find((e) => e.tex === 'wisp')!.sizeMax)
  assert.equal(planEffect('E1', {}, { 'E1.on': 0 })!.emitters.length, 0)
  assert.equal(planEffect('E99'), null)
  assert.ok(tweakFor({ 'E1.fire.color': '1,0,0' }, 'E1', 'fire').color)
})
test('the fixed random sequence is repeatable', () => { const a = rng(5), b = rng(5); assert.deepEqual([a(), a(), a()], [b(), b(), b()]) })
