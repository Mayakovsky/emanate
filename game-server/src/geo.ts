// Geometry helpers: distances, parcels, dead-zone map, nearest empty parcel.
export type Vec = { x: number; y: number; z: number }
export const PARCEL = 16

export function dist2d(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
export function dist3d(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
export const parcelOf = (x: number, z: number): [number, number] => [Math.floor(x / PARCEL), Math.floor(z / PARCEL)]
const key = (px: number, pz: number) => px + ',' + pz

// Distance (m) from a point to the nearest dead parcel rectangle; 0 if inside one. Also returns the nearest boundary point.
export class ParcelSet {
  private set = new Set<string>()
  constructor(parcels: [number, number][] = []) {
    for (const [x, z] of parcels) this.set.add(key(x, z))
  }
  has(px: number, pz: number) {
    return this.set.has(key(px, pz))
  }
  get size() {
    return this.set.size
  }
  // search a window of parcels around the point
  nearest(x: number, z: number, maxMetres = 400): { dist: number; px: number; pz: number; at: { x: number; z: number } } | null {
    const [cx, cz] = parcelOf(x, z)
    const r = Math.ceil(maxMetres / PARCEL) + 1
    let best: { dist: number; px: number; pz: number; at: { x: number; z: number } } | null = null
    for (let px = cx - r; px <= cx + r; px++) {
      for (let pz = cz - r; pz <= cz + r; pz++) {
        if (!this.set.has(key(px, pz))) continue
        const nx = Math.max(px * PARCEL, Math.min(x, (px + 1) * PARCEL))
        const nz = Math.max(pz * PARCEL, Math.min(z, (pz + 1) * PARCEL))
        const d = Math.hypot(x - nx, z - nz)
        if (!best || d < best.dist) best = { dist: d, px, pz, at: { x: nx, z: nz } }
      }
    }
    return best && best.dist <= maxMetres ? best : null
  }
}

// Nearest parcel with no scene (and not a road/plaza, which the map builder already excludes) to a point.
export function nearestEmptyParcel(empty: ParcelSet, x: number, z: number, maxMetres = 5000) {
  const found = empty.nearest(x, z, maxMetres)
  if (!found) return null
  return { px: found.px, pz: found.pz, center: { x: found.px * PARCEL + PARCEL / 2, z: found.pz * PARCEL + PARCEL / 2 }, dist: found.dist }
}

// The warning rule: triggers at 10 m from the boundary or 2 s of travel at the current speed, whichever is further.
export function warnDistance(speed: number, base = 10, seconds = 2) {
  return Math.max(base, speed * seconds)
}
