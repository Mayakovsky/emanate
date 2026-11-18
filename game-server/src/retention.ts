// Round 22 (addendum 2): the retention rules the privacy notice promises, and the deletion of one address.
//   probe file (halo-probes.jsonl): entries older than 30 days are dropped (at start and daily)
//   memory.json: a player or talk entry with no play for 90 days is dropped
//   forget(address): removes the address from memory.json, the probe file and the live match
import fs from 'node:fs'

export const PROBE_DAYS = 30
export const MEMORY_DAYS = 90
const DAY = 86_400_000

/** Drops probe lines older than `days`; lines that cannot be read as JSON with a time are kept. Returns how many were removed. */
export function purgeProbes(file: string, now: number, days = PROBE_DAYS): number {
  if (!fs.existsSync(file)) return 0
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const keep: string[] = []
  for (const l of lines) {
    let t = NaN
    try { t = Date.parse(JSON.parse(l).t) } catch {}
    if (Number.isFinite(t) && now - t > days * DAY) continue
    keep.push(l)
  }
  if (keep.length !== lines.length) fs.writeFileSync(file, keep.length ? keep.join('\n') + '\n' : '')
  return lines.length - keep.length
}

/** Removes the probe lines of one address (the file stores only the first 10 characters of an address: every line with that prefix goes). */
export function forgetInProbes(file: string, addr: string): number {
  if (!fs.existsSync(file)) return 0
  const pre = addr.toLowerCase().slice(0, 10)
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const keep = lines.filter((l) => { try { return String(JSON.parse(l).pid ?? '').toLowerCase() !== pre } catch { return true } })
  if (keep.length !== lines.length) fs.writeFileSync(file, keep.length ? keep.join('\n') + '\n' : '')
  return lines.length - keep.length
}
