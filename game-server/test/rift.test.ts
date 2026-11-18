import test from 'node:test'
import assert from 'node:assert/strict'
import { planRift, RIFT_HEIGHT, RIFT_STEP_MS } from '../src/rift.ts'

test('trigger: the portal stands at the Synth height, 6 m tall, on a smoke column to the sky top', () => {
  const p = planRift({ kind: 'trigger', at: { x: 10, y: 37, z: 20 } }, 200)
  const portal = p.halo.find((c) => c.kind === 'portal') as any
  const smoke = p.halo.find((c) => c.kind === 'smoke') as any
  assert.equal(portal.y, 37); assert.equal(portal.height, RIFT_HEIGHT); assert.equal(smoke.y, 0); assert.equal(smoke.height, 200)
  assert.equal(p.centre.y, 40)
})
test('helper ending: the oval is 20 m below the top of the max sky height', () => {
  const p = planRift({ kind: 'helper-ending', at: { x: 0, y: 0, z: 0 } }, 200)
  assert.equal(p.centre.y, 180)
  assert.equal((p.halo.find((c) => c.kind === 'portal') as any).y, 177)
  assert.equal(planRift({ kind: 'helper-ending', at: { x: 0, y: 0, z: 0 } }, 150).centre.y, 130) // follows the ceiling setting
})
test('hunter ending: at ground level', () => {
  const p = planRift({ kind: 'hunter-ending', at: { x: 5, y: 12, z: 5 } }, 200)
  assert.equal((p.halo.find((c) => c.kind === 'portal') as any).y, 0)
})
test('smoke height never exceeds the halo cap and every halo command is a valid size', () => {
  const p = planRift({ kind: 'trigger', at: { x: 0, y: 0, z: 0 } }, 220)
  assert.equal((p.halo.find((c) => c.kind === 'smoke') as any).height, 200)
  for (const c of p.halo) assert.ok(JSON.stringify(c).length < 600)
})
test('the Synth ends far away after stepping in', () => {
  const p = planRift({ kind: 'trigger', at: { x: 0, y: 5, z: 0 } })
  const last = p.synth[p.synth.length - 1]!.cmd as any
  assert.ok(Math.abs(last.x) > 300)
  assert.ok(p.synth.every((s, i) => i === 0 || s.afterMs > p.synth[i - 1]!.afterMs))
})

test('the Synth is never left far away: an ending parks it, a trigger leaves it to the match placement that follows', () => {
  const end = planRift({ kind: 'hunter-ending', at: { x: 5, y: 0, z: 5 } })
  const last = end.synth[end.synth.length - 1]!
  assert.deepEqual([(last.cmd as any).x, (last.cmd as any).z], [0, -124]); assert.ok(last.afterMs <= RIFT_STEP_MS + 2000)
  const trig = planRift({ kind: 'trigger', at: { x: 5, y: 2, z: 5 } })
  assert.ok(trig.synth.every((s) => s.afterMs < RIFT_STEP_MS)); assert.ok(RIFT_STEP_MS >= 4000)
})
