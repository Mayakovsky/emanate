import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Memory } from '../src/memory.ts'
import { purgeProbes, forgetInProbes } from '../src/retention.ts'
import { PRIVACY_NOTICE } from '../src/privacy.ts'

const DAY = 86_400_000
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'emret-'))
const A = '0x' + 'a'.repeat(40)
const B = '0x' + 'b'.repeat(40)

test('probe lines older than 30 days are dropped, newer and unreadable lines are kept', () => {
  const f = path.join(tmp(), 'p.jsonl'); const now = Date.now()
  fs.writeFileSync(f, [JSON.stringify({ t: new Date(now - 31 * DAY).toISOString(), pid: 'x' }), JSON.stringify({ t: new Date(now - 29 * DAY).toISOString(), pid: 'y' }), 'not json'].join('\n') + '\n')
  assert.equal(purgeProbes(f, now), 1)
  assert.equal(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length, 2)
  assert.equal(purgeProbes(path.join(tmp(), 'missing'), now), 0)
})

test('memory: records with no play for 90 days are dropped; a recent one stays', () => {
  const m = new Memory(null); const now = Date.now()
  m.recordPlayed(A, 'hunters', 'won', now - 91 * DAY); m.recordPlayed(B, 'helpers', 'won', now - 10 * DAY); m.recordTalk(A, 'hi', now - 95 * DAY)
  assert.equal(m.purge(now), 2)
  assert.deepEqual(m.counts(), { players: 1, talked: 0, dismissed: 0 })
})

test('forget removes one address from memory and the probe file and reports it', () => {
  const dir = tmp(); const mf = path.join(dir, 'memory.json'); const pf = path.join(dir, 'p.jsonl'); const now = Date.now()
  const m = new Memory(mf); m.recordPlayed(A, 'hunters', 'won', now); m.recordPlayed(B, 'helpers', 'won', now); m.recordTalk(A, 'hello', now); m.dismiss(A, now, 5)
  fs.writeFileSync(pf, [JSON.stringify({ t: new Date(now).toISOString(), pid: A.slice(0, 10) }), JSON.stringify({ t: new Date(now).toISOString(), pid: B.slice(0, 10) })].join('\n') + '\n')
  assert.deepEqual(m.forget(A), { players: 1, talked: 1, dismissed: 1 })
  assert.equal(forgetInProbes(pf, A), 1)
  const again = new Memory(mf)
  assert.equal(again.familiarity(A), 'stranger'); assert.equal(again.familiarity(B), 'helper')
  assert.deepEqual(m.forget(A), { players: 0, talked: 0, dismissed: 0 })
})

test('the privacy notice names the retention the code enforces', () => {
  assert.match(PRIVACY_NOTICE, /90 days/); assert.match(PRIVACY_NOTICE, /30 days/); assert.match(PRIVACY_NOTICE, /hiddenforces/)
  assert.doesNotMatch(PRIVACY_NOTICE, /@/) // no e-mail address
})
