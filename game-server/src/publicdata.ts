// Public data for the roaming Synth: the busiest spots (DCL's stats service) and live events. Read-only, public, no keys.
import type { Spot, LiveEvent } from './roaming.ts'

// peer /stats/parcels answers {"parcels":[...]}. The element shape is not documented; accept the forms seen in DCL's stats service:
//   {x, z, count} | {parcel:[x,z], peersCount} | {parcel:{x,y}, peersCount} | {coords:[x,z], players}
export function parseStats(j: any): Spot[] {
  const out: Spot[] = []
  for (const e of j?.parcels ?? []) {
    let x: number | undefined, z: number | undefined
    if (Array.isArray(e.parcel)) [x, z] = e.parcel
    else if (e.parcel && typeof e.parcel === 'object') { x = e.parcel.x; z = e.parcel.y ?? e.parcel.z }
    else if (Array.isArray(e.coords)) [x, z] = e.coords
    else { x = e.x; z = e.z ?? e.y }
    const count = Number(e.count ?? e.peersCount ?? e.players ?? e.peers ?? 0)
    if (typeof x === 'number' && typeof z === 'number' && count > 0) out.push({ x: x * 16 + 8, z: z * 16 + 8, count, source: 'stats' })
  }
  // merge neighbouring parcels (within 3 parcels) into one gathering
  const merged: Spot[] = []
  for (const s of out.sort((a, b) => b.count - a.count)) {
    const m = merged.find((g) => Math.hypot(g.x - s.x, g.z - s.z) < 48)
    if (m) m.count += s.count
    else merged.push({ ...s })
  }
  return merged
}

export function parseEvents(j: any): LiveEvent[] {
  const out: LiveEvent[] = []
  for (const e of j?.data ?? []) {
    if (!e.live || !Array.isArray(e.coordinates)) continue
    out.push({ x: e.coordinates[0] * 16 + 8, z: e.coordinates[1] * 16 + 8 })
  }
  return out
}

export async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { 'user-agent': 'emanate-roam/0.1' }, signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error('http ' + r.status)
  return r.json()
}
