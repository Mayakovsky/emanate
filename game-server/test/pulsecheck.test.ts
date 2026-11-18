import test from 'node:test'
import assert from 'node:assert/strict'
import { PulseCheck } from '../src/pulsecheck.ts'

const v = (x: number, z: number) => ({ x, y: 0, z })
function mk() {
  let t = 1_000_000
  const pc = new PulseCheck(() => t)
  return { pc, adv: (s: number) => (t += s * 1000), now: () => t }
}

test('an honest claim matches what the Synth sees: small gap, not flagged', () => {
  const { pc, adv } = mk()
  pc.claim('0xABC', v(100, 100), 6)
  adv(0.3)
  const r = pc.seen('0xabc', v(101.2, 100.4))
  assert.equal(r?.flagged, false)
  assert.ok(r!.gap! < 2)
  assert.equal(pc.stats().gapFalsePositiveRate, 0)
})

test('a claim far from what the Synth sees is flagged (log only: nothing else happens)', () => {
  const { pc, adv } = mk()
  pc.claim('0xabc', v(100, 100), 6)
  adv(0.2)
  const r = pc.seen('0xabc', v(160, 100))
  assert.equal(r?.flagged, true)
  assert.equal(pc.stats().flaggedGap, 1)
})

test('the allowance grows with speed and claim age (a fast player and a stale claim differ legitimately)', () => {
  const { pc, adv } = mk()
  pc.claim('0xabc', v(0, 0), 9)
  adv(2)
  const r = pc.seen('0xabc', v(14, 0)) // 14 m in 2 s at 9 m/s: allowed 4 + 1.5*9*2 = 31
  assert.equal(r?.flagged, false)
  pc.claim('0xdef', v(0, 0), 0)
  adv(2)
  assert.equal(pc.seen('0xdef', v(14, 0))?.flagged, true) // a standing claim does not allow 14 m
})

test('a claim older than the max age is not compared; a seen player with no claim is only counted', () => {
  const { pc, adv } = mk()
  pc.claim('0xabc', v(0, 0), 5)
  adv(30)
  assert.equal(pc.seen('0xabc', v(500, 500)), null)
  assert.equal(pc.seen('0xnobody', v(1, 1)), null)
  assert.equal(pc.stats().seenWithoutClaim, 1)
  assert.equal(pc.stats().comparisons, 0)
})

test('sweep: a claimed player well inside the view radius that the Synth has not seen is flagged once per 5 s; one beyond the radius is not', () => {
  const { pc, adv } = mk()
  pc.claim('0xnear', v(40, 0), 0)
  pc.claim('0xfar', v(400, 0), 0)
  adv(1)
  assert.equal(pc.sweep(v(0, 0)).length, 0) // inside the grace period
  adv(6)
  pc.claim('0xnear', v(40, 0), 0)
  pc.claim('0xfar', v(400, 0), 0)
  const out = pc.sweep(v(0, 0))
  assert.deepEqual(out.map((r) => r.id), ['0xnear'])
  adv(1)
  assert.equal(pc.sweep(v(0, 0)).length, 0, 'not repeated within 5 s')
  // seen recently: not flagged
  adv(10)
  pc.claim('0xnear', v(40, 0), 0)
  pc.seen('0xnear', v(40, 0))
  assert.equal(pc.sweep(v(0, 0)).length, 0)
})

test('stats report the gap distribution and both false-positive rates', () => {
  const { pc, adv } = mk()
  for (let i = 0; i < 10; i++) { pc.claim('0xabc', v(0, 0), 0); adv(0.1); pc.seen('0xabc', v(i * 0.3, 0)) }
  const s = pc.stats()
  assert.equal(s.comparisons, 10)
  assert.equal(s.flaggedGap, 0)
  assert.ok(s.gapMax! <= 2.7 + 1e-9)
  assert.ok(s.gapMedian! > 0)
})

test('stats split by player: an honest one and a spoofer are told apart', () => {
  const { pc, adv } = mk()
  for (let i = 0; i < 20; i++) {
    pc.claim('0xhonest0001', v(i, 0), 6); pc.claim('0xspoofer0001', v(i + 40, 0), 6)
    adv(0.2)
    pc.seen('0xhonest0001', v(i + 0.5, 0)); pc.seen('0xspoofer0001', v(i, 0))
  }
  const by = pc.stats().byId as any
  assert.equal(by['0xhonest00'].flagged, 0)
  assert.equal(by['0xspoofer0'].flaggedRate, 1)
})
