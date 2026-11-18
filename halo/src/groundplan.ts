// Round 24 (candidate c24f, NOT FINAL): the arrow chevrons follow the ground (setting fx.arrowGround, default OFF so c24e behaviour is unchanged). PURE maths, tested without the SDK.
// Each chevron casts a ray straight down from RAY_UP m above the foot level; the result gives the ground height under it; with no hit the chevron stays flat at the foot level.
export const RAY_UP = 1.5 // the ray starts this far above the feet (so a step up of up to 1.5 m is found)
export const RAY_MAX = 4.0 // and reaches this far down from its start (a drop of up to 2.5 m below the feet)
export const LIFT = 0.06 // the chevron floats this far above the ground

/** the chevron's height: from the ray's hit distance (metres from the ray start), or flat at the feet when the ray found nothing (or the answer is not a sane number) */
export function chevronY(footY: number, hitLength: number | null | undefined): number {
  if (typeof hitLength !== 'number' || !Number.isFinite(hitLength) || hitLength < 0 || hitLength > RAY_MAX) return footY + LIFT
  return footY + RAY_UP - hitLength + LIFT
}
/** smooth the answer so a chevron does not jump when the ground height changes between frames (rate in metres per second) */
export function followY(prev: number | null, target: number, dt: number, rate = 12): number {
  if (prev === null || !Number.isFinite(prev)) return target
  const step = rate * Math.max(0, dt)
  return Math.abs(target - prev) <= step ? target : prev + Math.sign(target - prev) * step
}
