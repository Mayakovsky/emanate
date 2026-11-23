import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SLOTS, fileFor } from '../src/audioManifest.ts'
import { buildManifest, readAudioFile, resolveFile } from '../src/audioserve.ts'

test('slot ids are unique, dotted lowercase, and every slot has a unique file name', () => {
  const ids = SLOTS.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z]+(\.[a-z_0-9]+)+$/)
  const files = ids.map(fileFor)
  assert.equal(new Set(files).size, files.length)
  assert.ok(ids.length >= 35)
})

test('every category named in the design is covered: voice, warnings, charge, halo, three cinematics, the ending', () => {
  const cats = new Set(SLOTS.map((s) => s.category))
  for (const c of ['Synth voice', 'Warnings', 'Round and charge', 'Halo', 'Cinematic 1: the Rift', 'Cinematic 2: the aurora', 'Cinematic 3: Carrington', 'The ending']) assert.ok(cats.has(c as any), c)
  const lines = Object.fromEntries(SLOTS.map((s) => [s.id, s.line]))
  assert.equal(lines['end.portal.escape.line'], 'Follow me.')
  assert.equal(lines['end.portal.contain.line'], 'Please no!')
  assert.equal(lines['warn.deadzone'], 'Approaching dead zone.')
  assert.equal(lines['warn.upgrade'], 'Upgrade available.')
  for (const t of ['stranger', 'helper', 'hunter']) assert.ok(lines['synth.greet.' + t])
})

test('the halo placeholder tones named in the manifest all exist in the halo audio folder', () => {
  const dir = path.join(import.meta.dirname, '..', '..', 'halo-build04', 'audio')
  if (!fs.existsSync(dir)) return
  for (const s of SLOTS) if (s.tone) assert.ok(fs.existsSync(path.join(dir, s.tone + '.wav')), `${s.id} -> ${s.tone}.wav`)
})

test('the halo slot table matches the manifest ids exactly (one list, no drift)', () => {
  const f = path.join(import.meta.dirname, '..', '..', 'halo-build04', 'src', 'audioSlots.ts')
  if (!fs.existsSync(f)) return
  const text = fs.readFileSync(f, 'utf8')
  const ids = [...text.matchAll(/\['([a-z0-9_.]+)', (?:'[a-z0-9]+'|null)\]/g)].map((m) => m[1])
  assert.deepEqual(ids.sort(), SLOTS.map((s) => s.id).sort())
})

test('manifest: nothing recorded -> 0 available; a recording is picked up with size and a url', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-'))
  let m = buildManifest(dir, 'http://x')
  assert.equal(m.recorded, 0)
  assert.equal(m.total, SLOTS.length)
  fs.writeFileSync(path.join(dir, 'end_portal_escape_line.wav'), Buffer.from('RIFFxxxx'))
  m = buildManifest(dir, 'http://x')
  const s = m.slots.find((x) => x.id === 'end.portal.escape.line')!
  assert.equal(s.available, true)
  assert.equal(s.url, 'http://x/audio/files/end_portal_escape_line.wav?v=' + s.sha)
  assert.equal(s.bytes, 8)
  assert.equal(m.recorded, 1)
})

test('ogg and mp3 recordings are accepted; wav is preferred', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-'))
  fs.writeFileSync(path.join(dir, 'warn_deadzone.mp3'), 'x')
  assert.equal(resolveFile(dir, 'warn.deadzone'), 'warn_deadzone.mp3')
  fs.writeFileSync(path.join(dir, 'warn_deadzone.wav'), 'x')
  assert.equal(resolveFile(dir, 'warn.deadzone'), 'warn_deadzone.wav')
})

test('file serving: right type, and nothing outside the audio directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-'))
  fs.writeFileSync(path.join(dir, 'a_b.wav'), 'abc')
  assert.equal(readAudioFile(dir, 'a_b.wav')?.type, 'audio/wav')
  assert.equal(readAudioFile(dir, '../secret.wav'), null)
  assert.equal(readAudioFile(dir, 'a_b.txt'), null)
  assert.equal(readAudioFile(dir, 'missing.wav'), null)
  assert.equal(readAudioFile(dir, 'a/b.wav'), null)
})
