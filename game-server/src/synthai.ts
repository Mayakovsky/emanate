// A basic Synth brain for a playable solo loop (Build 04b item 5). Pure logic with an injected clock and RNG, so it is unit-tested.
// It moves like a normal player (controls v1 only: walk and run, no halo powers). Real obstacle handling is the Bevy client's collisions;
// the brain only picks waypoints and notices when it is stuck. The hiding sliders come from design v3 ("Hiding metrics"); the ones
// marked NOT USED YET are declared so they can be tuned later but do nothing in this build.
import { ParcelSet, PARCEL, type Vec } from './geo.ts'
import { canFly, pickFlightTarget, type FlightTarget } from './flybrain.ts'
import { StyleTracker, styleOverrides, type HunterStyle } from './style.ts'
import { pickHidingSpot, scoreCandidate, sampleCandidates, mustMoveOn, shouldGlideEscape, type HideCfg } from './hiding.ts'

export const SYNTH_CONFIG = {
  nearRadius: 45, // m: a player this close makes the Synth run ("run when the player is near")
  runDistanceBeforeHiding: 60, // m (slider "Run distance before hiding"): how far it flees before ducking in
  hideDurationSeconds: 20, // s (slider "Hide duration"): how long it waits before moving openly again
  keepRunningSeconds: 25, // s (slider "Keep-running duration"): the longest it runs without hiding
  // round 13: a flee toward a chosen spot at least 3 m above the ground may run longer (the route up is the point), ground flees keep the slider's meaning
  highSpotFlee: true, // (a) on
  highSpotMinRel: 3, // m above the ground that makes a chosen spot a high spot
  highSpotBudgetFactor: 2, // the run may reach this multiple of the budget (ground spots: 1.5)
  highSpotKeepRunningSeconds: 40, // and the keep-running cap for that case
  holdForFreshList: true, // (b) hold a flee until a fresh spot list exists (or keep the old list when the Synth is still in the same place): no flee with no chosen spot
  holdForFreshListSeconds: 10, // the longest it waits for that list
  pattern: 'run-hide-run' as 'short-run-long-hide' | 'long-run-short-hide' | 'run-hide-run', // slider "Run and hide pattern"
  discoveredRadius: 8, // m: a player this close while it hides makes it break cover and run
  wanderStepMetres: 25, // m: how far a wander waypoint is
  wanderPauseSeconds: [4, 9] as [number, number],
  stuckSeconds: 4, // s without moving 2 m while running: pick a new waypoint
  // the rest of the v3 "Hiding metrics" sliders (see hiding.ts)
  gliderEscapeHeight: 12, // m: a build this high nearby (from the content map's height estimate) lets it glide away instead of running
  highLowPreference: 0.3, // 0 ground / basements .. 1 rooftops / upper floors (scored; the Synth cannot climb under controls v1, so this only biases the choice of building)
  highLowWeight: 5, // the weight of the high/low term in a candidate's score (the report's 1.5 was too weak against the run-fit term; 5 with runFitWeight 2.5 makes the slider real)
  terrainPreference: 0.6, // 0 open, sparse areas .. 1 dense urban blocks
  hideLimitInsideOwnedParcelsSeconds: 25, // energy cap: it may stay hidden inside a built parcel only this long
  exposureBoostInsideParcels: 1.5, // the halo effects on it get this much brighter while it hides inside a built parcel
  // navigation (round 9): the brain asks the Synth client for reachable spots and uses their real heights
  highScaleMetres: 40, // m of height that count as "1.0" in the high/low preference (40 = tall city buildings; tests on low ground use less)
  navSpotsMaxCost: 140, // m of walking the spot list covers
  navFreshSeconds: 30, // how long a spot list is trusted
  glideCooldownSeconds: 12,
  runFitWeight: 2.5, // weight of how well a chosen spot's distance fits the run budget (best at 95% of it) against the other terms of its score
  holdUntilChaserWithin: 0, // TEST MODE (m): 0 = off. Above 0 the brain stands still while it wanders until a player is this close, so tests start every flee from the same place
  // round 18: the Synth plays by what players can do. With fairSpots on, a flee never targets a spot that a player at the same power level cannot reach by that level's own
  // moves: walking and stairs at any level, a jump up to a double jump (about 10 m, so 12 m with margin) at level 2, flight at level 3
  fairSpots: true,
  fairLevel2MaxRel: 12, // m above the local ground (double jump about 10 m plus a margin)
  rememberFailedSpots: true, // round 15: a goal the client failed to reach is not offered again for failedSpotMemorySeconds (survives a reset)
  failedSpotMemorySeconds: 900,
  // round 16: Fly at level 3 (default OFF): escape or hide by flying to a roof, or hovering over a standable spot and landing on it later
  flyEnabled: false,
  flyCooldownSeconds: 20,
  flyMaxAltitude: 120, // m (absolute y); the world ceiling is 200 and the planner stops 20 m under it
  flyPreference: 0.6, // how often a flight is chosen over running when one is possible
  flyMaxSeconds: 25, // the keep-running cap for a flight
  flyRange: 110,
  flyMinRange: 30,
  flyTriggerDistance: 45,
  flyRoofMinRel: 5,
  flySkyHeight: 40,
  flyRoofShare: 1.0, // roofs first (hover targets are only valid where the air above the spot is clear; the client refuses a blocked column and the brain runs instead)
  adaptToPlayerStyle: false // round 14: when on, it reads the chaser's path (style.ts) and switches terrain, height and run/hide pattern for a methodical or a chaotic hunter. Default off
}

export type Cmd =
  | { cmd: 'run_to' | 'walk_to'; x: number; z: number }
  | { cmd: 'stop' }
  | { cmd: 'jump' }
  | { cmd: 'glide'; on: boolean }
  | { cmd: 'nav_to'; x: number; z: number; y?: number; run: boolean }
  | { cmd: 'nav_spots'; max_cost: number }
  | { cmd: 'glide_escape'; away_x: number; away_z: number }
  | { cmd: 'glide_to'; x: number; z: number; y?: number }
  | { cmd: 'fly_plan'; x: number; y: number; z: number; hover?: boolean }

// a reachable spot from the Synth client (nav_spots): world position, walking cost, and the height above the local ground (computed here)
export interface NavSpot { x: number; y: number; z: number; cost: number; rel: number }

// World knowledge for hiding choices (from the content maps): built parcels with a height estimate, and dead-zone parcels
export interface World { built: ParcelSet; heights: Map<string, number>; dead: ParcelSet }
export const noWorld = (): World => ({ built: new ParcelSet([]), heights: new Map(), dead: new ParcelSet([]) })
export type BrainState = 'wander' | 'flee' | 'hide'

export class SynthBrain {
  state: BrainState = 'wander'
  target: { x: number; z: number } | null = null
  fledFrom: { x: number; z: number } | null = null
  fledMetres = 0
  stateSince = 0
  hideUntil = 0
  nextWanderAt = 0
  lastPos: Vec | null = null
  lastMoveAt = 0
  lastCmdKey = ''
  lastCmdAt = 0
  runsSinceHide = 0
  private now: () => number
  private rng: () => number
  cfg: typeof SYNTH_CONFIG
  world: World
  queue: Cmd[] = []
  hiddenSince = 0
  insideBuilt = false
  // navigation (only used when the server has the Synth navigation on)
  navUse = false
  navSpots: NavSpot[] = []
  navAt = 0
  navAsked = 0
  targetY: number | undefined = undefined
  lastGlideAt = 0
  glidePlan: { x: number; z: number; y: number; since: number } | null = null
  // round 15: goals the client could not walk to (a stair the planner thinks is open and the engine blocks): remembered for a long while and NOT cleared by a reset, so the same trap is not chosen again flee after flee
  unreachable: { x: number; z: number; until: number }[] = []
  badSpots: { x: number; z: number; until: number }[] = [] // goals the planner could not use: not offered again for a minute
  lastNavGoal: { x: number; z: number } | null = null
  glideLog: { t: number; what: string; detail?: unknown }[] = []
  // the chosen hiding spot of the current flee (real reachable spot from nav_spots): the run ends there. null = no spot, the run ends where the budget does
  hideSpot: { x: number; z: number; y: number; rel: number } | null = null
  navArrived = false
  fleeHigh = false // round 22: a high spot was chosen in this flee. A replan of the same goal is not a new goal: the doubled budget stays for the whole flee
  lastSynthPos: { x: number; y: number; z: number } | null = null
  repick = false // round 24: a route failed or got stuck during a flee: the next step picks another goal AT ONCE (the old code waited for the stuck timer and, with no goal, let the run budget end the flee mid-route)
  noMoveChecks = 0 // round 22: flee started but the Synth has not moved 3 m after 5 s: the goal is failed and another is chosen (at most 2 times per flee)
  spotRetries = 0 // wrong-height arrivals in the current flee; after 3 the run falls back to ending where the budget does
  fleeLog: { t: number; start: Vec; player: Vec; spot: { x: number; z: number; y: number; rel: number } | null; ended?: string; arrival?: Vec; runMetres?: number; hideSeconds?: number; flight?: { kind: string; target: { x: number; y: number; z: number } }; retries?: number }[] = []
  constructor(now: () => number, rng: () => number, cfg = SYNTH_CONFIG, world: World = noWorld()) {
    this.now = now
    this.rng = rng
    this.cfg = cfg
    this.world = world
  }
  private heightAt(x: number, z: number) {
    return this.world.heights.get(Math.floor(x / PARCEL) + ',' + Math.floor(z / PARCEL)) ?? 0
  }
  private builtAt(p: Vec) {
    return this.world.built.has(Math.floor(p.x / PARCEL), Math.floor(p.z / PARCEL))
  }

  // the spot list from the Synth client; the height above the local ground is the spot's y minus the lowest spot within 8 m
  setNavSpots(spots: { x: number; y: number; z: number; cost: number }[], now = this.now(), from: { x: number; z: number } | null = null) {
    const key = (x: number, z: number) => Math.floor(x / 8) + ',' + Math.floor(z / 8)
    const lowest = new Map<string, number>()
    for (const p of spots) { const k = key(p.x, p.z); lowest.set(k, Math.min(lowest.get(k) ?? Infinity, p.y)) }
    const low = (x: number, z: number) => {
      let m = Infinity
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) m = Math.min(m, lowest.get(key(x + dx * 8, z + dz * 8)) ?? Infinity)
      return Number.isFinite(m) ? m : 0
    }
    this.navSpots = spots.map((p) => ({ ...p, rel: Math.max(0, p.y - low(p.x, p.z)) }))
    this.groundLow = low
    this.navAt = now
    this.navFrom = from
    this.navDirty = false
  }
  navFrom: { x: number; z: number } | null = null
  groundLow: (x: number, z: number) => number = () => 0
  // a spot list is only good while it is recent AND the Synth is still near where it was made (the planner window and the loaded colliders move with it)
  navFresh(at: Vec | null = this.lastPos) {
    if (!(this.navUse && this.navSpots.length > 0 && this.now() - this.navAt < this.cfg.navFreshSeconds * 1000)) return false
    const away = at && this.navFrom ? Math.hypot(at.x - this.navFrom.x, at.z - this.navFrom.z) : 0
    if (this.navDirty) return away <= 5 // a list from before a level change: usable only where it was made
    return away <= 22
  }
  // the Synth's power level changed: what it can reach changes (jump range), so the spot list is asked for again
  invalidateNav() {
    // the old list is kept while the Synth is still where it was made (within 5 m); a new one is asked for
    this.navDirty = true
    this.navAsked = 0
  }
  navDirty = false
  holdingFlee = false
  holdSince = 0
  // the client's answer to a nav_to: a failed goal is remembered and the next decision picks another
  onNav(ev: { status: string; reason?: string }) {
    if (ev.status === 'arrived') this.navArrived = true
    // 'stuck' (blocked after the client's replans) is a failed goal too: the next best spot that passes the fairness rule is chosen, instead of wandering on (round 19)
    // round 24: a route that gets stuck or fails within 4 m of its goal, at the goal's height, has ARRIVED for the brain's purposes (the live tests showed the Synth standing on the roof
    // 2 m from the spot while the follower gave up on the last step; the flee then lost its goal and the run budget ended it as `budget`)
    const g = this.hideSpot
    const p = this.lastSynthPos
    if ((ev.status === 'failed' || ev.status === 'stuck') && g && p && Math.hypot(p.x - g.x, p.z - g.z) < 4 && Math.abs(p.y - g.y) < 2) {
      this.navArrived = true
      this.glideLog.push({ t: this.now(), what: 'nav-end-at-goal', detail: { status: ev.status } })
      return
    }
    if ((ev.status === 'failed' || ev.status === 'stuck') && this.lastNavGoal) {
      this.badSpots.push({ ...this.lastNavGoal, until: this.now() + 60_000 })
      if (this.cfg.rememberFailedSpots) this.unreachable = [...this.unreachable.filter((u) => u.until > this.now() && Math.hypot(u.x - this.lastNavGoal!.x, u.z - this.lastNavGoal!.z) > 1), { x: this.lastNavGoal.x, z: this.lastNavGoal.z, until: this.now() + this.cfg.failedSpotMemorySeconds * 1000 }].slice(-60)
      this.glideLog.push({ t: this.now(), what: 'nav-failed', detail: { reason: ev.reason, goal: this.lastNavGoal } })
      this.target = null
      this.targetY = undefined
      this.hideSpot = null
      this.lastCmdKey = ''
      this.lastNavGoal = null
      if (this.state === 'flee') this.repick = true
    }
  }
  // the client's answer to a glide request
  onGlide(ev: { status: string; reason?: string }) {
    this.glideLog.push({ t: this.now(), what: ev.status, detail: ev.reason })
    if (ev.status === 'failed') {
      this.glidePlan = null
      this.lastGlideAt = this.now() // do not hammer: the fallbacks take over for the cooldown
    }
  }

  reset() {
    this.flight = null
    this.pendingLanding = null
    this.glidePlan = null
    this.hideSpot = null
    this.badSpots = [] // a new round or a settings change starts with a clean slate of failed goals
    this.navArrived = false
    this.targetY = undefined
    this.state = 'wander'
    this.target = null
    this.fledFrom = null
    this.fledMetres = 0
    this.hideUntil = 0
    this.nextWanderAt = 0
    this.lastPos = null
    this.lastCmdKey = ''
  }

  private nearest(synth: Vec, players: Vec[]) {
    let best: { p: Vec; d: number } | null = null
    for (const p of players) {
      const d = Math.hypot(p.x - synth.x, p.z - synth.z)
      if (!best || d < best.d) best = { p, d }
    }
    return best
  }

  private fleeTarget(synth: Vec, from: Vec) {
    this.targetY = undefined
    this.hideSpot = null
    this.navArrived = false
    if (this.navFresh(synth) && this.spotRetries < 3) {
      // real reachable spots: reachable within the run budget, farther from the player than we are, scored by the same terms (high/low from the REAL height above ground)
      const budget = this.runBudget() // the run budget is the upper limit on the run
      const here = Math.hypot(synth.x - from.x, synth.z - from.z)
      const nowMs = this.now()
      this.badSpots = this.badSpots.filter((b) => b.until > nowMs)
      // distances are measured from where the Synth stands NOW (a spot list is up to 22 m old, its walking costs count from where it was made)
      const dist = (p: { x: number; z: number }) => Math.hypot(p.x - synth.x, p.z - synth.z)
      const usable = this.navSpots.filter((p) => dist(p) >= 6 && dist(p) <= budget && p.cost <= budget * 1.5 + 25 && Math.hypot(p.x - from.x, p.z - from.z) > here + 5 && !this.badSpots.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 5) && !this.unreachable.some((u) => u.until > nowMs && Math.hypot(u.x - p.x, u.z - p.z) < 3) && this.fairSpot(p))
      // the slider means how far it flees: a spot's fit to the run budget (best near 95% of it) is part of its score, so the run stays near the slider while a much
      // better high/low match can still win from a bit nearer. Nothing above the floor: the run ends where the budget does, as before.
      // a ground spot must be near the top of the run budget (80%); a high spot (3 m or more above the ground) may be nearer (40%), since high spots are few and wanted
      const cands = usable.filter((p) => dist(p) >= budget * (p.rel >= 3 ? 0.4 : 0.8)).map((p) => ({ x: p.x, z: p.z, y: (p.rel / this.cfg.highScaleMetres) * 40, absY: p.y }))
      let best: (typeof cands)[number] | null = null
      let bestScore = -Infinity
      for (const c of cands) {
        const fit = Math.max(0, 1 - Math.abs(Math.hypot(c.x - synth.x, c.z - synth.z) / budget - 0.95) / 0.45)
        const sc = scoreCandidate(c, synth, from, this.world.built, this.eff() as HideCfg) + this.cfg.runFitWeight * fit
        if (sc > bestScore) { bestScore = sc; best = c }
      }
      if (best) {
        this.targetY = best.absY
        this.hideSpot = { x: best.x, z: best.z, y: best.absY, rel: (best.y / 40) * this.cfg.highScaleMetres }
        if (this.cfg.highSpotFlee && this.hideSpot.rel >= this.cfg.highSpotMinRel) this.fleeHigh = true
        const fl = this.fleeLog[this.fleeLog.length - 1]
        if (fl && !fl.ended) fl.spot = this.hideSpot
        this.lastNavGoal = { x: best.x, z: best.z }
        return { x: best.x, z: best.z }
      }
    }
    if (this.world.built.size > 0) {
      // away from the player: candidate hiding spots on a ring, scored by terrain / high-low preference, distance and reach
      const cands = sampleCandidates(synth, 16, 45, this.rng, (x, z) => { const h = this.heightAt(x, z); return h >= this.cfg.gliderEscapeHeight ? h * 0.5 : 0 }).filter((c) => Math.hypot(c.x - from.x, c.z - from.z) > Math.hypot(synth.x - from.x, synth.z - from.z))
      const best = pickHidingSpot(cands.length ? cands : sampleCandidates(synth, 8, 45, this.rng, () => 0), synth, from, this.world.built, this.eff() as HideCfg)
      if (best) return { x: best.x, z: best.z }
    }
    return this.fleeTargetPlain(synth, from)
  }
  private fleeTargetPlain(synth: Vec, from: Vec) {
    // away from the player, with a random sideways jitter of up to +-50 degrees
    let dx = synth.x - from.x
    let dz = synth.z - from.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const a = (this.rng() - 0.5) * 2 * ((50 * Math.PI) / 180)
    const rx = dx * Math.cos(a) - dz * Math.sin(a)
    const rz = dx * Math.sin(a) + dz * Math.cos(a)
    const dist = 30 + this.rng() * 20
    return { x: synth.x + rx * dist, z: synth.z + rz * dist }
  }

  // ---- round 16: flight ----
  level = 1 // the Synth's current power level (the server sets it each step)
  flight: { kind: 'roof' | 'sky' | 'landing'; target: FlightTarget; since: number; arrived: boolean; landed: boolean; failed: boolean } | null = null
  lastFlightAt = -1e9
  pendingLanding: { x: number; y: number; z: number } | null = null
  flightLog: { t: number; kind: string; target: { x: number; y: number; z: number }; result?: string; seconds?: number; endedAt?: Vec }[] = []
  // the client's answer to a fly_plan
  onFly(ev: { status: string; reason?: string }) {
    const f = this.flight
    if (!f) return
    if (ev.status === 'arrived') f.arrived = true
    if (ev.status === 'landed') f.landed = true
    if (ev.status === 'failed') f.failed = true
  }
  private startFlight(t: FlightTarget, now: number, kind: 'roof' | 'sky' | 'landing'): Cmd {
    this.flight = { kind, target: t, since: now, arrived: false, landed: false, failed: false }
    this.lastFlightAt = now
    this.flightLog.push({ t: now, kind, target: { x: t.x, y: t.y, z: t.z } })
    if (this.flightLog.length > 100) this.flightLog.shift()
    return kind === 'sky' ? { cmd: 'fly_plan', x: t.x, y: t.y, z: t.z, hover: true } : { cmd: 'fly_plan', x: t.x, y: t.y, z: t.z }
  }
  /** at the start of a flee: fly instead of run, when the rules allow */
  private tryFlight(synth: Vec, from: Vec, now: number): Cmd | null {
    const near = this.nearest(synth, [from])
    if (!canFly(this.cfg, this.level, now, this.lastFlightAt, near ? near.d : null, this.rng) || !this.navFresh(synth)) return null
    const t = pickFlightTarget(synth, from, this.navSpots, this.cfg, this.rng, this.badSpots)
    if (!t) return null
    const fl = this.fleeLog[this.fleeLog.length - 1]
    if (fl && !fl.ended) { fl.flight = { kind: t.kind, target: { x: t.x, y: t.y, z: t.z } }; fl.spot = { x: t.x, z: t.z, y: t.y, rel: Math.max(0, t.y - this.groundLow(t.x, t.z)) } }
    this.pendingLanding = t.landing
    this.hideSpot = null
    this.target = null
    return this.startFlight(t, now, t.kind)
  }
  /** a flight in progress: returns true while it holds the Synth (no other movement commands) */
  private flightStep(synth: Vec, now: number): boolean {
    const f = this.flight
    if (!f) return false
    const secs = (now - f.since) / 1000
    const done = f.arrived || f.landed || f.failed || secs > this.cfg.flyMaxSeconds
    if (!done) return true
    const result = f.failed ? 'failed' : f.arrived ? 'arrived' : f.landed ? 'landed' : 'cap'
    const rec = this.flightLog[this.flightLog.length - 1]
    if (rec && rec.result === undefined) { rec.result = result; rec.seconds = Math.round(secs * 10) / 10; rec.endedAt = { ...synth } }
    this.flight = null
    if (f.kind === 'landing') { this.state = 'wander'; this.stateSince = now; this.nextWanderAt = now; return false }
    this.endFlee(synth, 'flight-' + result)
    if (result === 'failed') { this.state = 'wander'; this.stateSince = now; this.nextWanderAt = now; this.pendingLanding = null; return false } // the next sighting starts an ordinary flee
    this.state = 'hide'
    this.stateSince = now
    this.hiddenSince = now
    this.hideUntil = now + this.hideSeconds() * 1000
    return false
  }

  /** the fairness rule: could a player at the Synth's own level stand there? (see the fairSpots setting) */
  fairSpot(p: { rel: number }): boolean {
    if (!this.cfg.fairSpots) return true
    if (this.level === 2) return p.rel <= this.cfg.fairLevel2MaxRel
    return true
  }

  tracker = new StyleTracker()
  private lastStyleAt = -1e9
  style: HunterStyle = 'unknown'
  /** the hiding settings after the style overrides (adaptToPlayerStyle on) or the plain settings (off) */
  private eff(): typeof SYNTH_CONFIG {
    return this.cfg.adaptToPlayerStyle ? { ...this.cfg, ...styleOverrides(this.style) } : this.cfg
  }

  private runBudget() {
    const c = this.eff()
    const base = c.runDistanceBeforeHiding
    return c.pattern === 'short-run-long-hide' ? base * 0.5 : c.pattern === 'long-run-short-hide' ? base * 1.6 : base
  }
  private hideSeconds() {
    const c = this.eff()
    return c.pattern === 'short-run-long-hide' ? c.hideDurationSeconds * 1.6 : c.pattern === 'long-run-short-hide' ? c.hideDurationSeconds * 0.5 : c.hideDurationSeconds
  }

  // Called about twice a second. stage: the charge stage ('free' | 'reset' | 'repair' | 'upgrade'). Returns the command to send, or null.
  step(synth: Vec, players: Vec[], stage: string): Cmd | null {
    const now = this.now()
    this.lastSynthPos = { x: synth.x, y: synth.y, z: synth.z }
    const c = this.cfg
    if (c.adaptToPlayerStyle && now - this.lastStyleAt >= 1000) {
      this.lastStyleAt = now
      this.tracker.observe(synth, players, now)
      this.style = this.tracker.style()
    }
    if (this.queue.length) return this.queue.shift()!
    // frozen in Repair / Upgrade Mode
    if (stage === 'repair' || stage === 'upgrade') return this.send({ cmd: 'stop' }, 'stop-frozen', now)
    this.badSpots = this.badSpots.filter((b) => b.until > now)
    // a flight holds the Synth until it arrives, lands, fails or runs out of time (a frozen Charge stage above still stops it in place)
    if (this.flightStep(synth, now)) return null
    // navigation: keep a fresh list of reachable spots (one request every 8 s while it is stale)
    if (this.navUse && !this.navFresh(synth) && now - this.navAsked > 8000) {
      this.navAsked = now
      return { cmd: 'nav_spots', max_cost: c.navSpotsMaxCost }
    }
    const slow = stage === 'reset' // Reset Mode: normal pace instead of a run
    const go = (x: number, z: number): Cmd => (this.targetY !== undefined ? { cmd: 'nav_to', x, z, y: this.targetY, run: !slow } : { cmd: slow ? 'walk_to' : 'run_to', x, z })

    // movement bookkeeping for stuck detection
    if (!this.lastPos || Math.hypot(synth.x - this.lastPos.x, synth.z - this.lastPos.z) > 2) {
      this.lastPos = { ...synth }
      this.lastMoveAt = now
    }
    const near = this.nearest(synth, players)
    // test mode: hold still until a chaser is close, so every flee starts from the same place
    if (c.holdUntilChaserWithin > 0 && this.state === 'wander' && !(near && near.d <= c.holdUntilChaserWithin)) return null

    switch (this.state) {
      case 'wander': {
        if (near && near.d < c.nearRadius) return this.startFlee(synth, near.p, now, go)
        if (now >= this.nextWanderAt) {
          const a = this.rng() * Math.PI * 2
          const x = synth.x + Math.cos(a) * c.wanderStepMetres
          const z = synth.z + Math.sin(a) * c.wanderStepMetres
          this.nextWanderAt = now + (c.wanderPauseSeconds[0] + this.rng() * (c.wanderPauseSeconds[1] - c.wanderPauseSeconds[0])) * 1000
          this.target = { x, z }
          return this.send({ cmd: 'walk_to', x, z }, `wander:${Math.round(x)}:${Math.round(z)}`, now)
        }
        return null
      }
      case 'flee': {
        if (this.holdingFlee) {
          if (this.navFresh(synth) || now - this.holdSince > this.cfg.holdForFreshListSeconds * 1000) {
            this.holdingFlee = false
            this.stateSince = now
            this.fledFrom = { x: synth.x, z: synth.z }
            this.lastMoveAt = now
            const fly = this.tryFlight(synth, near ? near.p : this.fledFrom ?? synth, now)
            if (fly) return fly
            const t = this.fleeTarget(synth, near ? near.p : this.fledFrom ?? synth)
            this.target = t
            return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)
          }
          return null // the Synth stands still until the list arrives (the nav_spots request is sent at the top of this step)
        }
        const ranFor = (now - this.stateSince) / 1000
        if (this.fledFrom) this.fledMetres = Math.hypot(synth.x - this.fledFrom.x, synth.z - this.fledFrom.z)
        // done running: far enough, or the longest run, then duck in (unless the player is still right behind it)
        // with a chosen spot the run ends there: on arrival, or when the budget (with some slack for the path's bends) or the keep-running cap runs out first
        // round 24: a failed route is replaced by the next best goal at once; at most 3 repicks per flee, then the plain run
        if (this.repick) {
          this.repick = false
          if (this.spotRetries < 3 && this.navFresh(synth)) {
            this.spotRetries++
            const t = this.fleeTarget(synth, near ? near.p : this.fledFrom ?? synth)
            this.target = t
            return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)
          }
        }
        const hs = this.hideSpot
        // round 22 (the stood-still approach): a flee that has not moved 3 m after 5 s (no route from where it stands, a blocked start) counts its goal as failed and picks another;
        // with no goal at all it runs plainly away
        if (hs && this.navUse && !this.glidePlan && ranFor >= 5 * (this.noMoveChecks + 1) && this.fledMetres < 3 && this.noMoveChecks < 2) {
          this.noMoveChecks++
          this.badSpots.push({ x: hs.x, z: hs.z, until: now + 60_000 })
          this.spotRetries++
          this.glideLog.push({ t: now, what: 'flee-not-moving', detail: { check: this.noMoveChecks, goal: { x: hs.x, z: hs.z } } })
          this.hideSpot = null
          this.lastCmdKey = ''
          const t = this.noMoveChecks >= 2 ? this.fleeTargetPlain(synth, near ? near.p : this.fledFrom ?? synth) : this.fleeTarget(synth, near ? near.p : this.fledFrom ?? synth)
          this.target = t
          return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)
        }
        // arrived means arrived at the spot's HEIGHT too: within 2 m of the chosen spot's height. A route that ends somewhere else (under a rooftop spot, on the ground
        // beside it) is a failed goal: remembered for a minute, and the next best spot is routed to (up to 3 times per flee, then today's fallback)
        const levelOk = !!hs && Math.abs(synth.y - hs.y) < 2
        if (hs && this.navArrived && !(levelOk && Math.hypot(synth.x - hs.x, synth.z - hs.z) < 5)) {
          const fl = this.fleeLog[this.fleeLog.length - 1]
          if (fl && !fl.ended) fl.retries = (fl.retries ?? 0) + 1
          this.glideLog.push({ t: now, what: 'arrived-at-wrong-height', detail: { spotY: hs.y, y: synth.y } })
          this.badSpots.push({ x: hs.x, z: hs.z, until: now + 60_000 })
          this.spotRetries++
          this.hideSpot = null
          this.navArrived = false
          const t = this.fleeTarget(synth, near ? near.p : this.fledFrom ?? synth)
          this.target = t
          return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)
        }
        const atSpot = !!hs && levelOk && (Math.hypot(synth.x - hs.x, synth.z - hs.z) < 3.5 || (this.navArrived && Math.hypot(synth.x - hs.x, synth.z - hs.z) < 5))
        const highTarget = c.highSpotFlee && !!hs && hs.rel >= c.highSpotMinRel
        const budgetOut = this.fledMetres >= this.runBudget() * (highTarget ? c.highSpotBudgetFactor : hs ? 1.5 : 1)
        const capSeconds = highTarget ? c.highSpotKeepRunningSeconds : c.keepRunningSeconds
        if (atSpot || budgetOut || ranFor >= capSeconds) {
          this.endFlee(synth, atSpot ? 'arrived' : hs ? (budgetOut ? 'budget-before-spot' : 'cap-before-spot') : budgetOut ? 'budget' : 'cap')
          this.state = 'hide'
          this.stateSince = now
          this.hiddenSince = now
          this.hideUntil = now + this.hideSeconds() * 1000
          return this.send({ cmd: 'stop' }, 'hide', now)
        }
        // glider escape: with a player close, standing high enough above the ground, glide off the edge away from them
        if (this.navFresh(synth) && near && near.d < 40 && now - this.lastGlideAt > c.glideCooldownSeconds * 1000) {
          const rel = synth.y - this.groundLow(synth.x, synth.z)
          if (rel >= c.gliderEscapeHeight) {
            this.lastGlideAt = now
            this.glidePlan = null
            this.glideLog.push({ t: now, what: 'escape-from-height', detail: { rel } })
            return { cmd: 'glide_escape', away_x: near.p.x, away_z: near.p.z }
          }
        }
        // stuck with a player within 40 m, in a built parcel at least gliderEscapeHeight high: climb to a reachable high spot, then glide away from it;
        // with no reachable high spot (or no navigation) it falls back to the old takeoff, double jump, glide (three jump commands)
        if (now - this.lastMoveAt > c.stuckSeconds * 1000 && near && near.d < 40 && shouldGlideEscape(this.heightAt(synth.x, synth.z), near.d, c as HideCfg)) {
          this.lastMoveAt = now
          const high = this.navFresh(synth) ? this.navSpots.filter((p) => p.rel >= c.gliderEscapeHeight && p.cost <= c.navSpotsMaxCost && Math.hypot(p.x - near.p.x, p.z - near.p.z) > near.d).sort((a, b) => a.cost - b.cost)[0] : undefined
          if (high) {
            this.glidePlan = { x: high.x, z: high.z, y: high.y, since: now }
            this.glideLog.push({ t: now, what: 'climb-to-high-spot', detail: { x: high.x, z: high.z, y: high.y, rel: high.rel } })
            return this.send({ cmd: 'nav_to', x: high.x, z: high.z, y: high.y, run: true }, 'climb', now, true)
          }
          this.glideLog.push({ t: now, what: 'three-jump-fallback' })
          this.queue = [{ cmd: 'jump' }, { cmd: 'jump' }, { cmd: 'jump' }]
          return this.send({ cmd: 'jump' }, 'glide-escape', now, true)
        }
        // arrived at the high spot it was climbing to: glide away from the player
        if (this.glidePlan && near) {
          const gp = this.glidePlan
          if (Math.hypot(synth.x - gp.x, synth.z - gp.z) < 3 && Math.abs(synth.y - gp.y) < 1.5) {
            this.glidePlan = null
            this.lastGlideAt = now
            this.glideLog.push({ t: now, what: 'glide-from-high-spot' })
            return { cmd: 'glide_escape', away_x: near.p.x, away_z: near.p.z }
          }
          if (now - gp.since > 60_000) this.glidePlan = null
        }
        if (now - this.lastMoveAt > c.stuckSeconds * 1000 && near) {
          this.lastMoveAt = now
          const t = this.fleeTarget(synth, near.p)
          this.target = t
          return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)
        }
        // keep the waypoint fresh: when reached, pick another away from the player
        if (this.hideSpot && this.target && Math.hypot(synth.x - this.target.x, synth.z - this.target.z) < 6) return slow ? this.send(go(this.target.x, this.target.z), `flee:${Math.round(this.target.x)}:${Math.round(this.target.z)}:slow`, now) : null // close to the chosen spot: let the route finish
        if (!this.target || Math.hypot(synth.x - this.target.x, synth.z - this.target.z) < 6) {
          const from = near ? near.p : this.fledFrom ?? synth
          const t = this.fleeTarget(synth, from)
          this.target = t
          return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now)
        }
        return slow ? this.send(go(this.target.x, this.target.z), `flee:${Math.round(this.target.x)}:${Math.round(this.target.z)}:slow`, now) : null
      }
      case 'hide': {
        // discovered: a player right on top of it breaks cover
        if (near && near.d < c.discoveredRadius) return this.startFlee(synth, near.p, now, go)
        this.insideBuilt = this.builtAt(synth)
        // energy limit: it may stay hidden inside a built parcel only so long, then it must move on
        if (mustMoveOn((now - this.hiddenSince) / 1000, this.insideBuilt, c as HideCfg)) this.hideUntil = now
        if (now >= this.hideUntil) {
          const fl = this.fleeLog[this.fleeLog.length - 1]
          if (fl && fl.hideSeconds === undefined) fl.hideSeconds = Math.round((now - this.hiddenSince) / 100) / 10
          if (this.pendingLanding) {
            const l = this.pendingLanding
            this.pendingLanding = null
            this.state = 'wander'
            this.stateSince = now
            return this.startFlight({ kind: 'sky', x: l.x, y: l.y, z: l.z, landing: null }, now, 'landing')
          }
          this.state = 'wander'
          this.stateSince = now
          this.nextWanderAt = now
          this.runsSinceHide = 0
        }
        return null
      }
    }
  }

  private endFlee(synth: Vec, why: string) {
    const fl = this.fleeLog[this.fleeLog.length - 1]
    if (fl && !fl.ended) { fl.ended = why; fl.arrival = { ...synth }; fl.runMetres = Math.round(this.fledMetres * 10) / 10 }
  }

  private startFlee(synth: Vec, from: Vec, now: number, go: (x: number, z: number) => Cmd): Cmd {
    this.state = 'flee'
    this.stateSince = now
    this.fledFrom = { x: synth.x, z: synth.z }
    this.fledMetres = 0
    this.lastMoveAt = now
    this.spotRetries = 0
    this.fleeHigh = false
    this.repick = false
    this.noMoveChecks = 0
    this.fleeLog.push({ t: now, start: { ...synth }, player: { ...from }, spot: null })
    if (this.fleeLog.length > 200) this.fleeLog.shift()
    // (b) no flee with no chosen spot: with navigation on and no usable list, hold still (up to a few seconds) while the Synth asks for one
    if (this.cfg.holdForFreshList && this.navUse && !this.navFresh(synth)) {
      this.holdingFlee = true
      this.holdSince = now
      this.target = null
      const ask = now - this.navAsked > 1500
      if (ask) this.navAsked = now
      return (ask ? { cmd: 'nav_spots', max_cost: this.cfg.navSpotsMaxCost } : { cmd: 'stop' }) as Cmd
    }
    const fly = this.tryFlight(synth, from, now)
    if (fly) return fly
    const t = this.fleeTarget(synth, from)
    this.target = t
    return this.send(go(t.x, t.z), `flee:${Math.round(t.x)}:${Math.round(t.z)}`, now, true)!
  }

  // do not repeat the same command every tick (the Synth keeps walking to its target by itself)
  private send(cmd: Cmd, key: string, now: number, force = false): Cmd | null {
    if (!force && key === this.lastCmdKey && now - this.lastCmdAt < 4000) return null
    this.lastCmdKey = key
    this.lastCmdAt = now
    return cmd
  }
}

// The Synth's look for each round (Build 04b round 5): free base-avatar wearables only (no purchases).
const BA = 'urn:decentraland:off-chain:base-avatars:'
const FACE = ['eyebrows_00', 'eyes_00', 'mouth_00', 'casual_hair_01'].map((x) => BA + x)
export const SYNTH_LOOKS: string[][] = [
  [...FACE, BA + 'black_jacket', BA + 'brown_pants', BA + 'classic_shoes'],
  [...FACE, BA + 'blue_tshirt', BA + 'basketball_shorts', BA + 'comfy_green_sandals', BA + 'aviatorstyle'],
  [...FACE, BA + 'bee_t_shirt', BA + 'cargo_shorts', BA + 'crocs', BA + 'matrix_sunglasses']
]
export const lookForRound = (round: number) => SYNTH_LOOKS[Math.max(0, Math.min(SYNTH_LOOKS.length - 1, round - 1))]!
