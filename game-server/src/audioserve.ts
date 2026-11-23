// Serves the audio manifest and the recordings in game-server\audio (GET /audio/manifest.json, GET /audio/files/<name>).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SLOTS, fileFor } from './audioManifest.ts'

const TYPES: Record<string, string> = { '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' }

// a slot is recorded as <id with dots as underscores>.wav (or .ogg / .mp3, in that order of preference)
export function resolveFile(dir: string, id: string): string | null {
  const base = fileFor(id).replace(/\.wav$/, '')
  for (const ext of ['.wav', '.ogg', '.mp3']) if (fs.existsSync(path.join(dir, base + ext))) return base + ext
  return null
}

export function buildManifest(dir: string, baseUrl: string) {
  const slots = SLOTS.map((s) => {
    const f = resolveFile(dir, s.id)
    let sha: string | null = null
    let bytes = 0
    if (f) {
      const b = fs.readFileSync(path.join(dir, f))
      bytes = b.length
      sha = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16)
    }
    return { id: s.id, file: fileFor(s.id), loop: !!s.loop, available: !!f, recorded: f, bytes, sha, url: f ? `${baseUrl}/audio/files/${f}?v=${sha}` : null } // c30d: ?v=<sha>: a replaced file gets a new address, so no Halo plays a stale cached clip
  })
  return { version: 1, generatedAt: Date.now(), slots, recorded: slots.filter((s) => s.available).length, total: slots.length }
}

// returns {type, body} for a file request or null (never leaves the audio directory)
export function readAudioFile(dir: string, name: string): { type: string; body: Buffer } | null {
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.includes('..')) return null
  const ext = path.extname(name).toLowerCase()
  if (!TYPES[ext]) return null
  const p = path.join(dir, name)
  if (!fs.existsSync(p)) return null
  return { type: TYPES[ext], body: fs.readFileSync(p) }
}
