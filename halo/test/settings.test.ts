import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRemote, resetToDefaults, POWER, FXS, FEATURES, TEXT, SOUNDS, TICK, say, feature, snapshotDefaults } from '../src/settings.ts'
import { RULES } from '../src/logic.ts'

test('defaults are today\'s values', () => {
  assert.equal(POWER.runSpeed, 16.2); assert.equal(POWER.doubleJumpHeight, 9); assert.equal(POWER.speedCap, 24.3)
  assert.equal(RULES.plumeSeconds, 14); assert.equal(RULES.arrowOnSec, 4); assert.equal(TICK.everySec, 0.25)
  assert.equal(FEATURES.arrows, 1)
})
test('the server overrides numbers, strings and features; unknown keys and wrong types are ignored', () => {
  resetToDefaults()
  const n = applyRemote({ power: { runSpeed: 20, nope: 5, walkSpeed: 'fast' }, rules: { plumeSeconds: 10 }, features: { arrows: 0 }, text: { plumeSent: 'plume away', newKey: 'x' }, bogus: { a: 1 } })
  assert.equal(n, 5) // runSpeed, plumeSeconds, arrows, plumeSent, newKey
  assert.equal(POWER.runSpeed, 20); assert.equal(POWER.walkSpeed, 5); assert.equal(RULES.plumeSeconds, 10)
  assert.equal(feature('arrows'), false); assert.equal(feature('plumes'), true)
  assert.equal(say('plumeSent'), 'plume away'); assert.equal(say('roundStart', { round: 2 }), 'round 2 started')
  resetToDefaults()
  assert.equal(POWER.runSpeed, 16.2); assert.equal(feature('arrows'), true); assert.equal(say('plumeSent'), 'plume sent')
})
test('hard limits keep the halo inside what Decentraland allows whatever the server says', () => {
  resetToDefaults()
  applyRemote({ power: { speedCap: 500, runSpeed: -3, hMax: 1000, ceiling: 9999 }, tick: { everySec: 0 } })
  assert.equal(POWER.speedCap, 30); assert.equal(POWER.runSpeed, 1); assert.equal(POWER.hMax, 26); assert.equal(POWER.ceiling, 220); assert.equal(TICK.everySec, 0.1)
  applyRemote({ power: { runSpeed: NaN, jogSpeed: Infinity } })
  assert.equal(POWER.runSpeed, 1); assert.equal(POWER.jogSpeed, 11.7) // not finite: ignored
  resetToDefaults()
})
test('a sound mapping and a long string are bounded', () => {
  resetToDefaults()
  applyRemote({ sounds: { 'halo.plume': 'lib:cue_plume', ['x'.repeat(41)]: 'a' }, text: { gliderPrompt: 'y'.repeat(500) } })
  assert.equal(SOUNDS['halo.plume'], 'lib:cue_plume'); assert.equal(Object.keys(SOUNDS).length, 1)
  assert.equal(TEXT.gliderPrompt, 'HOLD JUMP to open the glider')
  resetToDefaults()
  assert.deepEqual(snapshotDefaults().sounds, {})
})
test('applyRemote tolerates garbage', () => {
  for (const g of [null, undefined, 5, 'x', [], { power: null }, { power: 5 }]) assert.equal(applyRemote(g as any), 0)
})
test('a new set of overrides replaces the old one: a removed override falls back to its default', () => {
  resetToDefaults()
  applyRemote({ power: { runSpeed: 20 }, text: { plumeSent: 'a' } })
  // what net.ts does with a settings reply:
  resetToDefaults(); applyRemote({ power: { walkSpeed: 7 } })
  assert.equal(POWER.runSpeed, 16.2); assert.equal(POWER.walkSpeed, 7); assert.equal(say('plumeSent'), 'plume sent')
  resetToDefaults(); applyRemote({}); assert.equal(POWER.walkSpeed, 5)
})
