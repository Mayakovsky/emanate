// Match state and rules. Pure logic with an injected clock and RNG, so every timer and rule is unit-testable.
import { CONFIG, type Mode, type Side } from './config.ts'
import { dist2d, dist3d, ParcelSet, type Vec } from './geo.ts'

export type Stage = 'free' | 'reset' | 'repair' | 'upgrade'
export type DropKind = 'boost' | 'plume'

export interface Player {
  id: string
  name: string
  side: Side
  pos: Vec
  speed: number
  lastSeen: number
  plumesLeft: number
  boostUntil: number // ms: a Halo boost is active until then (applied on pickup)
  trapUntil: number // ms: a Discharge Trap hit keeps the player one level down until then
  queue: { ev: string; [k: string]: unknown }[]
}
export interface Plume { id: number; owner: string; pos: Vec; born: number; expires: number }
export interface Trap { id: number; owner: string; pos: Vec; born: number; expires: number; exempt: Set<string> }
export interface Drop { id: number; kind: DropKind; pos: Vec; expires: number }

export interface MatchDeps {
  now: () => number
  rng: () => number
  cfg?: typeof CONFIG
  deadZones?: ParcelSet
  emptyParcelFinder?: (x: number, z: number) => { x: number; z: number } | null
}

export class Match {
  mode: Mode = 'solo'
  round = 1
  state: 'lobby' | 'playing' | 'ended' | 'final' | 'ending' | 'replay' = 'playing' // c30: 'ending' = the winner's portal and the Storm; 'replay' = the two replay portals and their countdown
  // ---- round 12: the lobby ----
  lobbyEndsAt = 0
  bubble: { x: number; y: number; z: number; radius: number } | null = null
  waiting = new Map<string, Player>() // arrived after the join timer ended: they wait for the next lobby
  synthSays: string[] = [] // lines for the Synth to say in chat (the server drains them)
  roundStart: number
  warnSent = false
  wins: Record<Side, number> = { hunters: 0, helpers: 0 }
  synthLevel = 1 // the Synth's own level (0 normal, 1 Speed, 2 Jump, 3 Fly); a trap hit lowers it for a while on top of this: synthLevelNow()
  synthTrapUntil = 0
  traps: Trap[] = []
  pendingAdvance: { at: number; side: Side } | null = null
  synth: Vec = { x: 0, y: 0, z: 100 }
  synthSeenAt = 0
  charge = { stage: 'free' as Stage, side: 'hunters' as Side, contributors: new Set<string>(), windowEnd: 0 }
  players = new Map<string, Player>()
  // ---- round 8: the choice dialogue, the round timeout glimpse, the replay menu, and the reload ledger ----
  choices = new Map<string, { step: 'pitch' | 'doubts' | 'done'; real: Side | null; secretA: Side }>()
  choicesFinal = false
  timeoutAt = 0
  timeoutSpot: Vec | null = null
  replayCount = 0
  replaying = false
  singleRound: number | null = null
  finalDone = false
  ledger = new Map<string, { plumesLeft: number; boostUntil: number; side: Side; savedAt: number; round: number }>()
  plumes: Plume[] = []
  drops: Drop[] = []
  endgame: { kind: 'escape' | 'containment'; x: number; z: number; winner: Side | 'players'; firstArrival: number | null; resolved: boolean } | null = null
  log: { t: number; ev: string; [k: string]: unknown }[] = []
  // ---- c30 (Directive V): timed steps of the game sequences, and the replay portals ----
  script: { at: number; run: () => void }[] = []
  replayPortals: { endsAt: number; centre: Vec; hunters: Vec; helpers: Vec; sorted: boolean } | null = null
  dropsMade = 0 // upgrade drops created in the current round (never above cfg.maxDrops in the c30 sequence)
  private inRange = new Set<string>()
  private nextId = 1
  private nextDropAt = 0
  readonly cfg: typeof CONFIG
  private d: MatchDeps
  constructor(d: MatchDeps) {
    this.d = d
    this.cfg = d.cfg ?? CONFIG
    this.synthLevel = this.cfg.synthStartLevel
    this.roundStart = d.now()
    this.nextDropAt = d.now() + this.cfg.dropSpawnEverySeconds * 1000
    if (this.cfg.lobbyEnabled) this.startLobby()
  }

  note(ev: string, data: Record<string, unknown> = {}) {
    this.log.push({ t: this.d.now(), ev, ...data })
    if (this.log.length > 500) this.log.shift()
  }

  // ---- c30: the timed steps ----
  private after(ms: number, run: () => void) {
    this.script.push({ at: this.d.now() + ms, run })
    this.script.sort((a, b) => a.at - b.at) // stable: steps due at the same moment keep the order they were added
  }
  private runScript(now: number) {
    while (this.script.length && this.script[0]!.at <= now) this.script.shift()!.run()
  }
  /** a Plasma Portal appears where the Synth is: the halos draw it, the Synth walks in (server.ts, rift 'trigger') */
  private portalAtSynth(v: 1 | 2, extra: Record<string, unknown> = {}) {
    const at = { ...this.synth }
    this.broadcast({ ev: 'portal', v, x: at.x, y: at.y, z: at.z, seconds: this.cfg.portalSeconds, ...extra })
    this.rifts.push({ kind: v === 1 ? 'trigger' : 'ending', at })
    this.note('portal', { v, x: Math.round(at.x), z: Math.round(at.z) })
    return at
  }
  /**
   * The blast step (game start, every round change, the replay start): the Synth's NEW starting position is set FIRST (so the Glimpse Signal marks the new spot,
   * not the old one), then every player is blasted into the sky, the Glimpse Signal fires at the new spot, and the round starts.
   */
  private blastStep(place: () => void) {
    this.bubble = null
    this.state = 'playing'
    this.script = []
    this.charge = { stage: 'free', side: 'hunters', contributors: new Set(), windowEnd: 0 }
    this.inRange.clear()
    this.pendingAdvance = null
    place() // 1. the new start position (also bumps the round when this is a round change)
    this.broadcast({ ev: 'blast', centre: this.cfg.blastCentre, cx: this.synth.x, cz: this.synth.z, radius: this.cfg.blastRadius, seed: Math.floor(this.d.rng() * 4294967295) }) // 2. the blast: every halo throws its wearer up
    this.broadcast({ ev: 'glimpse-signal', x: this.synth.x, y: this.synth.y, z: this.synth.z, seconds: this.round >= 3 ? this.cfg.glimpseSecondsLast : this.cfg.glimpseSeconds }) // 3. the signal at the new spot
    this.startRound(true) // 4. the round
  }
  /** the Synth's start position for a round: solo = near the player, otherwise around the group */
  private placeForRound() {
    const ps = [...this.players.values()]
    if (this.mode === 'solo' && ps.length) this.placeSynthNear(ps[0]!.pos, this.cfg.synthStartDistance)
    else this.placeSynthAroundGroup()
  }
  /** after a round other than the last: PP1 where the Synth is, the Synth goes into it, then the blast with the burst, the Glimpse Signal and the next round (c30b: the Strike after round 1 and the Aurora after round 2 only when cfg.cineFx is on) */
  private roundChange() {
    const finished = this.round
    const at = this.portalAtSynth(1)
    this.after(this.cfg.portalSeconds * 1000, () => {
      // Directive Y fix: around the PP1 spot `at`, not this.synth: by now the Rift has parked the real Synth 850 m away and the bridge has reported that spot
      const go = () => this.blastStep(() => { this.round++; if (this.mode === 'solo') this.teleportSynthWithin(this.cfg.teleportOnFailRadius, at); else this.placeSynthAroundGroup() })
      // c30b (Directive W): the Strike (E8) and the Aurora (E9) are switched off by default (cfg.cineFx); their recipes stay in the Halo for a later redesign
      if (finished === 1 && this.cfg.cineFx) {
        this.broadcast({ ev: 'strike', x: at.x, y: at.y, z: at.z, seconds: this.cfg.strikeSeconds })
        this.after(this.cfg.strikeSeconds * 1000, go)
      } else {
        if (finished === 2 && this.cfg.cineFx) this.broadcast({ ev: 'aurora', seconds: this.cfg.auroraSeconds })
        go()
      }
    })
  }
  /** the ending: PP2 in the winner's colour, the Synth goes in, the Storm plays, then the two replay portals */
  private endingSequence(winner: Side) {
    this.state = 'ending'
    this.endgame = null
    const storm = this.cfg.cineFx ? this.cfg.stormSeconds : 0 // c30b (Directive W): the Storm (E10) is off by default: PP2, the Synth goes in, then straight to the replay portals
    const delay = Math.max(0, Math.min(10, Number(this.cfg.replayOpenDelay) || 0)) // c30d: the replay portals wait this long after PP2
    const total = this.cfg.portalSeconds + storm + delay + 1 // PP2 stands until the replay portals open
    const at = this.portalAtSynth(2, { side: winner, seconds: total })
    this.note('ending', { winner })
    this.after(this.cfg.portalSeconds * 1000, () => {
      if (!storm) { this.after(delay * 1000, () => this.openReplay(at)); return }
      this.broadcast({ ev: 'storm', seconds: this.cfg.stormSeconds })
      this.after((this.cfg.stormSeconds + delay) * 1000, () => this.openReplay(at))
    })
  }
  private openReplay(at: Vec) {
    const off = this.cfg.portalOffset, now = this.d.now()
    this.state = 'replay'
    this.replayPortals = { endsAt: now + this.cfg.replaySeconds * 1000, centre: { ...at }, hunters: { x: at.x - off, y: at.y, z: at.z }, helpers: { x: at.x + off, y: at.y, z: at.z }, sorted: false }
    this.note('replay-open', { seconds: this.cfg.replaySeconds })
  }
  /** what every halo may see without any player data while the replay portals stand (net: bare state) */
  replayPublic(): { left: number; radius: number; hunters: Vec; helpers: Vec } | null {
    const R = this.replayPortals
    if (this.state !== 'replay' || !R) return null
    return { left: Math.max(0, Math.round((R.endsAt - this.d.now()) / 100) / 10), radius: this.cfg.portalJoinRadius, hunters: R.hunters, helpers: R.helpers }
  }
  private replayStep(now: number) {
    const R = this.replayPortals
    if (!R) return
    const cand = [...this.players.values(), ...this.waiting.values()] // a wearer who never joined and holds E in a portal ticks in as `waiting`: standing in a portal is the wearer's own choice
    const rad = this.cfg.portalJoinRadius
    const inPortal = new Set<string>()
    for (const p of cand) {
      if (dist2d(p.pos, R.hunters) <= rad) { p.side = 'hunters'; inPortal.add(p.id) }
      else if (dist2d(p.pos, R.helpers) <= rad) { p.side = 'helpers'; inPortal.add(p.id) }
    }
    if (!R.sorted && now >= R.endsAt - this.cfg.autosortSeconds * 1000) {
      R.sorted = true
      const near = cand.filter((p) => dist2d(p.pos, R.centre) <= this.cfg.replayRange)
      let h = near.filter((p) => inPortal.has(p.id) && p.side === 'hunters').length, g = near.filter((p) => inPortal.has(p.id) && p.side === 'helpers').length
      for (const p of near) {
        if (inPortal.has(p.id)) continue
        p.side = h <= g ? 'hunters' : 'helpers'
        if (p.side === 'hunters') h++; else g++
      }
      this.note('autosort', { hunters: h, helpers: g })
    }
    if (now >= R.endsAt) this.endReplay()
  }
  private endReplay() {
    const R = this.replayPortals!
    this.replayPortals = null
    const cand = [...this.players.values(), ...this.waiting.values()]
    const inRange = cand.filter((p) => dist2d(p.pos, R.centre) <= this.cfg.replayRange)
    // nobody in range: the portals close and the game goes back to waiting for a lobby
    if (inRange.length === 0) {
      for (const p of [...this.players.values()]) { this.players.delete(p.id); this.waiting.set(p.id, p) }
      this.note('replay-closed')
      this.synth = { ...R.centre }
      this.synthTeleports.push({ x: this.synth.x, z: this.synth.z })
      this.held = { pos: { ...this.synth }, until: this.d.now() + 3000 }
      if (this.cfg.lobbyEnabled) this.startLobby(this.synth)
      else this.state = 'ended'
      return
    }
    const hunters = inRange.filter((p) => p.side === 'hunters').length, helpers = inRange.length - hunters
    const need = (m: Mode) => (this.cfg.replayMin > 0 ? this.cfg.replayMin : m === 'multiplayer' ? 6 : m === 'coop' ? 3 : 1)
    // too few for the mode: fall back one mode (multiplayer -> coop -> solo)
    let mode: Mode = 'solo'
    if (inRange.length >= need('multiplayer') && Math.min(hunters, helpers) >= 3) mode = 'multiplayer'
    else if (inRange.length >= need('coop')) mode = 'coop'
    for (const p of cand) {
      if (inRange.includes(p)) { this.waiting.delete(p.id); this.players.set(p.id, p); p.lastSeen = this.d.now() }
      else if (this.players.delete(p.id)) { this.waiting.set(p.id, p); p.queue.push({ ev: 'lobby-wait' }) }
    }
    this.setMode(mode)
    this.round = 1
    this.wins = { hunters: 0, helpers: 0 }
    this.synthLevel = this.cfg.synthStartLevel
    this.synthTrapUntil = 0
    this.replaying = false; this.replayCount = 0; this.finalDone = false; this.singleRound = null; this.endgame = null
    if (mode === 'multiplayer') this.balanceSides()
    this.note('replay-start', { mode, count: inRange.length, hunters, helpers })
    this.blastStep(() => this.placeForRound())
  }

  // ---- the lobby: the Synth calls everyone into a bubble, a join timer runs, the equipped players inside when it ends are the game ----
  startLobby(at: Vec = this.synth) {
    const now = this.d.now()
    this.state = 'lobby'
    this.lobbyEndsAt = now + this.cfg.lobbySeconds * 1000
    this.bubble = { x: at.x, y: at.y, z: at.z, radius: this.cfg.bubbleRadius }
    this.called.clear()
    this.synthSays.push('Everyone into the bubble!')
    this.note('lobby-start', { seconds: this.cfg.lobbySeconds })
    this.broadcast({ ev: 'lobby', seconds: this.cfg.lobbySeconds, x: at.x, y: at.y, z: at.z, radius: this.cfg.bubbleRadius })
  }
  called = new Set<string>() // c27: wearers who joined through the call portal (they count as inside the bubble when the timer ends)
  callJoin(pid: string) { if (this.state === 'lobby') this.called.add(pid) }
  insideBubble(p: Player): boolean {
    const b = this.bubble
    if (b && this.called.has(p.id)) return true
    return !!b && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) <= b.radius && Math.abs(p.pos.y - b.y) <= b.radius + 4
  }
  // the mode from the head count: 1 = Solo, 2 to 5 = Coop (a Charge needs min(3, group) transfers), 6 or more = Multiplayer (auto-balanced, at least 3 a side)
  modeForCount(n: number): Mode {
    return n <= 1 ? 'solo' : n <= 5 ? 'coop' : 'multiplayer'
  }
  private lobbyStep(now: number) {
    if (this.bubble) { this.bubble.x = this.synth.x; this.bubble.y = this.synth.y; this.bubble.z = this.synth.z } // the bubble stays around the Synth (which stands still during the lobby)
    if (now < this.lobbyEndsAt) return
    const inside = [...this.players.values()].filter((p) => this.insideBubble(p))
    if (inside.length === 0) {
      // nobody made it: another round of waiting
      this.lobbyEndsAt = now + this.cfg.lobbySeconds * 1000
      this.broadcast({ ev: 'lobby', seconds: this.cfg.lobbySeconds, x: this.bubble!.x, y: this.bubble!.y, z: this.bubble!.z, radius: this.bubble!.radius, again: true })
      this.note('lobby-extended')
      return
    }
    // players outside the bubble wait for the next lobby
    for (const p of [...this.players.values()]) {
      if (!inside.includes(p)) {
        this.players.delete(p.id)
        this.inRange.delete(p.id)
        this.waiting.set(p.id, p)
        p.queue.push({ ev: 'lobby-wait' })
      }
    }
    const mode = this.modeForCount(inside.length)
    this.setMode(mode)
    this.state = 'playing'
    this.roundStart = now
    this.note('lobby-end', { count: inside.length, mode })
    if (this.cfg.cinematics) { // c30: the lobby bubble stays while PP1 stands in it; the Synth goes into PP1; then the blast, the Glimpse Signal, round 1
      this.finishChoices()
      if (mode === 'multiplayer') this.balanceSides()
      for (const p of inside) p.queue.push({ ev: 'lobby-end', mode, count: inside.length })
      this.portalAtSynth(1)
      this.after(this.cfg.portalSeconds * 1000, () => this.blastStep(() => { if (!this.cfg.teleportStart || mode === 'solo') this.placeForRound(); else { this.teleportGroup([...this.players.values()]); this.placeSynthAroundGroup() } }))
      return
    }
    this.bubble = null
    this.rifts.push({ kind: 'trigger', at: { ...this.synth } }) // the Rift opens where the Synth stands, in every mode
    for (const p of inside) p.queue.push({ ev: 'lobby-end', mode, count: inside.length })
    this.finishChoices()
    if (mode === 'multiplayer') this.balanceSides() // auto-balanced, at least 3 per side (6 or more players)
    if (mode === 'solo') this.placeSynthNear(inside[0]!.pos, this.cfg.synthStartDistance)
    else {
      if (this.cfg.teleportStart) this.teleportGroup(inside)
      this.placeSynthAroundGroup()
    }
    this.startRound(true)
  }
  /** round 18: the group start. One start point for everyone, teleportMinMetres to teleportMaxMetres from where they stood, on open land when the server knows some; each
   * player gets a teleport event with a destination in a small ring around it (the halo calls movePlayerTo) and is placed there in the server's own view at once. */
  teleportGroup(group: Player[]) {
    const c = { x: group.reduce((a, p) => a + p.pos.x, 0) / group.length, y: group[0]!.pos.y, z: group.reduce((a, p) => a + p.pos.z, 0) / group.length }
    const a = this.d.rng() * Math.PI * 2
    const r = this.cfg.teleportMinMetres + this.d.rng() * (this.cfg.teleportMaxMetres - this.cfg.teleportMinMetres)
    let start = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }
    const open = this.d.emptyParcelFinder?.(start.x, start.z)
    if (open) start = { x: open.x, z: open.z }
    const ring = this.cfg.teleportRingMetres
    group.forEach((p, i) => {
      const k = (i / group.length) * Math.PI * 2
      const dest = { x: start.x + Math.cos(k) * ring, y: this.cfg.teleportDropMetres, z: start.z + Math.sin(k) * ring }
      if (this.teleportPlayer(p.id, dest, 'start')) p.pos = { x: dest.x, y: dest.y, z: dest.z }
    })
    this.note('teleport-start', { count: group.length, metres: Math.round(Math.hypot(start.x - c.x, start.z - c.z)) })
  }
  // Coop and Multiplayer: players start where they stand in every round; the Synth is placed 100 to 300 m from the group's centre
  placeSynthAroundGroup() {
    const ps = [...this.players.values()]
    if (ps.length === 0) return
    const c = { x: ps.reduce((a, p) => a + p.pos.x, 0) / ps.length, y: ps[0]!.pos.y, z: ps.reduce((a, p) => a + p.pos.z, 0) / ps.length }
    const a = this.d.rng() * Math.PI * 2
    const r = this.cfg.coopSynthMin + this.d.rng() * (this.cfg.coopSynthMax - this.cfg.coopSynthMin)
    this.synth = { x: c.x + Math.cos(a) * r, y: c.y, z: c.z + Math.sin(a) * r }
    this.synthSeenAt = this.d.now()
    this.synthTeleports.push({ x: this.synth.x, z: this.synth.z })
    this.held = { pos: { ...this.synth }, until: this.d.now() + 3000 }
    this.note('synth-placed-around-group', { r: Math.round(r) })
  }

  setMode(mode: Mode) {
    this.mode = mode
    this.note('mode', { mode })
  }

  // ---- players ----
  upsertPlayer(id: string, data: { name?: string; side?: Side; pos: Vec; speed?: number }) {
    const now = this.d.now()
    let p = this.players.get(id)
    if (!p && this.cfg.lobbyEnabled && this.state !== 'lobby' && !this.ledger.has(id)) {
      // a player who was not in the bubble when the timer ended, or who arrives mid-game, waits for the next lobby
      let w = this.waiting.get(id)
      if (!w) { w = { id, name: data.name ?? id.slice(0, 6), side: data.side ?? 'hunters', pos: data.pos, speed: 0, lastSeen: now, plumesLeft: 0, boostUntil: 0, trapUntil: 0, queue: [{ ev: 'lobby-wait' }] }; this.waiting.set(id, w) }
      w.pos = data.pos
      w.lastSeen = now
      return w
    }
    if (!p) {
      p = { id, name: data.name ?? id.slice(0, 6), side: data.side ?? 'hunters', pos: data.pos, speed: 0, lastSeen: now, plumesLeft: this.cfg.plumesPerRound, boostUntil: 0, trapUntil: 0, queue: [] }
      const saved = this.ledger.get(id)
      if (saved && now - saved.savedAt < this.cfg.ledgerSeconds * 1000) {
        // a returning player (a halo unload and reload): the round state comes back from the server
        p.side = saved.side
        if (saved.round === this.round) { p.plumesLeft = saved.plumesLeft; p.boostUntil = saved.boostUntil }
        p.queue.push({ ev: 'restored', round: this.round, plumesLeft: p.plumesLeft })
        this.note('restore', { id, plumesLeft: p.plumesLeft })
      }
      this.ledger.delete(id)
      this.players.set(id, p)
      if (this.cfg.choiceDialogue && !this.choices.has(id) && !saved) this.choices.set(id, { step: 'pitch', real: null, secretA: this.d.rng() < 0.5 ? 'hunters' : 'helpers' })
      this.note('join', { id, side: p.side })
      if (this.players.size === 1 && this.synthSeenAt === 0) this.placeSynthNear(data.pos, this.cfg.synthStartDistance)
    }
    p.pos = data.pos
    p.speed = data.speed ?? p.speed
    p.lastSeen = now
    if (data.name) p.name = data.name
    if (data.side && this.mode === 'multiplayer') p.side = data.side
    this.advance()
    return p
  }

  // The Synth's pitch: "I'll Help" or "I'm Having Doubts". Doubts goes to "a message from the Dev Team" with two buttons that both
  // read "Sure, I'll help!": one makes the player a Hunter, the other a Helper, and the player is not told which. The REAL side is kept secret.
  choose(id: string, pick: string): 'pitch' | 'doubts' | 'done' | null {
    const c = this.choices.get(id)
    const p = this.players.get(id)
    if (!c || !p) return null
    if (c.step === 'pitch') {
      if (pick === 'help') { c.real = 'helpers'; c.step = 'done' }
      else if (pick === 'doubts') c.step = 'doubts'
    } else if (c.step === 'doubts' && (pick === 'A' || pick === 'B')) {
      const other: Side = c.secretA === 'hunters' ? 'helpers' : 'hunters'
      c.real = pick === 'A' ? c.secretA : other
      c.step = 'done'
    }
    if (c.step === 'done' && c.real) {
      p.side = c.real
      this.note('choice', { id, secret: true }) // the side itself is not logged to anyone's view
    }
    this.finishChoices()
    return c.step
  }
  // when everyone present has chosen: coop: the majority's choice sets the group's side; multiplayer: teams are auto-balanced
  finishChoices() {
    if (this.players.size === 0) return
    const all = [...this.players.values()]
    if (!all.every((p) => this.choices.get(p.id)?.step === 'done')) return
    // re-evaluated each time everyone present has chosen, so players who arrive later are counted
    this.choicesFinal = true
    if (this.mode === 'coop') {
      const group = this.coopSide(all.map((p) => this.choices.get(p.id)!.real ?? p.side))
      for (const p of all) p.side = group
      this.note('group-side', { side: group })
    } else if (this.mode === 'multiplayer') {
      for (const p of all) p.side = this.choices.get(p.id)!.real ?? p.side // everyone back to their own choice, then balance
      this.balanceSides()
    }
    this.broadcast({ ev: 'choices-final' })
  }

  // multiplayer: auto-balance sides (bigger side loses a player to the smaller one: "double agent")
  balanceSides() {
    const by: Record<Side, Player[]> = { hunters: [], helpers: [] }
    for (const p of this.players.values()) by[p.side].push(p)
    while (Math.abs(by.hunters.length - by.helpers.length) > 1) {
      const from: Side = by.hunters.length > by.helpers.length ? 'hunters' : 'helpers'
      const to: Side = from === 'hunters' ? 'helpers' : 'hunters'
      const moved = by[from].pop()!
      moved.side = to
      by[to].push(moved)
      moved.queue.push({ ev: 'double-agent', to })
      this.note('double-agent', { id: moved.id, to })
    }
  }

  // coop: the majority's choice decides the faction
  coopSide(votes: Side[]): Side {
    const h = votes.filter((v) => v === 'hunters').length
    return h * 2 >= votes.length ? 'hunters' : 'helpers'
  }

  // ---- the Synth ----
  // the live feed (the real or simulated Synth): positions that have not caught up with a teleport are ignored
  feedSynth(pos: Vec) {
    if (this.held) {
      const caughtUp = Math.hypot(pos.x - this.held.pos.x, pos.z - this.held.pos.z) < 5
      if (caughtUp || this.d.now() >= this.held.until) this.held = null
      else return
    }
    this.setSynth(pos)
  }
  // forced placement (tests, admin)
  setSynth(pos: Vec) {
    this.held = null
    this.synth = pos
    this.synthSeenAt = this.d.now()
    this.advance()
  }
  teleportSynthWithin(radius: number, around: Vec = this.synth) {
    const a = this.d.rng() * Math.PI * 2
    const r = radius * Math.sqrt(this.d.rng())
    this.synth = { x: around.x + Math.cos(a) * r, y: around.y, z: around.z + Math.sin(a) * r }
    this.synthSeenAt = this.d.now()
    this.note('synth-teleport', { x: this.synth.x, z: this.synth.z })
    // the Synth process is told by the server's feed layer via this event
    this.synthTeleports.push({ x: this.synth.x, z: this.synth.z })
    this.held = { pos: { ...this.synth }, until: this.d.now() + 3000 }
  }
  synthTeleports: { x: number; z: number }[] = []
  rifts: { kind: 'trigger' | 'helper-ending' | 'hunter-ending' | 'ending'; at: Vec }[] = [] // round 24: Rift triggers for the server to draw (the Synth's position and height at that moment)
  synthExposure = 1 // set by the Synth brain: how much brighter its effects are for halo wearers (v3: stronger while it hides inside built parcels)
  // after a teleport, feed positions that have not caught up (still near the old spot) are ignored for a moment
  held: { pos: Vec; until: number } | null = null
  placeSynthNear(pos: Vec, dist: number) {
    const a = this.d.rng() * Math.PI * 2
    this.synth = { x: pos.x + Math.cos(a) * dist, y: pos.y, z: pos.z + Math.sin(a) * dist }
    this.synthSeenAt = this.d.now()
    this.synthTeleports.push({ x: this.synth.x, z: this.synth.z })
    this.held = { pos: { ...this.synth }, until: this.d.now() + 3000 }
  }
  private farthestFromPlaza(): Player | undefined {
    let best: Player | undefined
    for (const p of this.players.values()) if (!best || dist2d(p.pos, this.cfg.genPlaza) > dist2d(best.pos, this.cfg.genPlaza)) best = p
    return best
  }
  // coop start: the Synth within 300 m of the player farthest from Gen Plaza
  startCoopSynth() {
    const f = this.farthestFromPlaza()
    if (f) this.teleportSynthWithin(this.cfg.coopSynthMaxFromFarthest, f.pos)
  }

  // ---- timers and rules; call often ----
  advance() {
    const now = this.d.now()
    // drop players not heard from
    for (const [id, p] of this.players) {
      if (now - p.lastSeen > this.cfg.playerTimeoutSeconds * 1000) {
        this.ledger.set(id, { plumesLeft: p.plumesLeft, boostUntil: p.boostUntil, side: p.side, savedAt: now, round: this.round })
        this.players.delete(id)
        this.inRange.delete(id)
        this.charge.contributors.delete(id)
        this.note('leave', { id })
      }
    }
    for (const [id, w] of this.waiting) if (now - w.lastSeen > this.cfg.playerTimeoutSeconds * 1000) this.waiting.delete(id)
    // a player leaving can make the charge complete: the group shrank, so fewer contributors are needed
    if (this.state === 'playing' && this.charge.stage !== 'free' && this.charge.contributors.size >= this.neededPlayersFor(this.charge.side) && this.players.size > 0) {
      this.note('charge-completed-by-leave')
      this.complete(this.charge.side)
      return
    }
    this.plumes = this.plumes.filter((p) => now < p.expires)
    this.traps = this.traps.filter((t) => now < t.expires)
    if (this.script.length) this.runScript(now) // c30: the timed steps of the sequences
    if (this.state === 'lobby') {
      this.lobbyStep(now)
      return
    }
    this.drops = this.drops.filter((p) => now < p.expires)
    if (this.state === 'replay') { this.replayStep(now); return }
    if (this.state === 'ending') return // the winner's portal and the Storm: the script moves it on
    if (this.state !== 'playing') {
      this.endgameStep(now)
      return
    }
    if (this.script.length) return // a cinematic is running (PP1, the Strike): the round is frozen until the blast step
    // a completed Charge: the Synth stays frozen for a moment, then the round moves on (teleport, next round or the Ending)
    if (this.pendingAdvance) {
      if (now >= this.pendingAdvance.at) {
        const side = this.pendingAdvance.side
        this.pendingAdvance = null
        this.afterComplete(side)
      }
      return
    }
    this.checkTraps(now)
    // round clock
    const left = this.timeLeft()
    if (!this.warnSent && left <= this.cfg.warnSecondsLeft && left > 0) {
      this.warnSent = true
      this.broadcast({ ev: 'warn5' })
      this.note('warn5')
    }
    if (left <= 0 || this.timeoutAt) {
      // timeout: first a short glimpse of where the Synth is hiding (the halo's third-person camera), then it moves within 100 m of that spot
      if (!this.timeoutAt) {
        this.timeoutAt = now
        this.timeoutSpot = { ...this.synth }
        this.note('round-timeout', { x: this.synth.x, z: this.synth.z })
        this.broadcast({ ev: 'round-timeout', x: this.synth.x, y: this.synth.y, z: this.synth.z, glimpseSeconds: this.cfg.timeoutGlimpseSeconds })
      }
      if (now - this.timeoutAt >= this.cfg.timeoutGlimpseSeconds * 1000) {
        this.teleportSynthWithin(this.cfg.teleportOnFailRadius, this.timeoutSpot ?? this.synth)
        this.resetCharge()
        this.timeoutAt = 0
        this.timeoutSpot = null
        this.startRound(false)
      }
      return
    }
    // charge window
    if (this.charge.stage !== 'free' && now >= this.charge.windowEnd) {
      this.note('charge-failed')
      this.broadcast({ ev: 'charge-failed' })
      this.failCharge()
    }
    // contacts
    for (const p of this.players.values()) {
      const near = dist3d(p.pos, this.synth) <= this.cfg.chargeRadius
      const was = this.inRange.has(p.id)
      if (near && !was) {
        this.inRange.add(p.id)
        this.contact(p, now)
        if (this.state !== 'playing') return
      } else if (!near && was) this.inRange.delete(p.id)
    }
    // drops
    this.spawnDrops(now)
    for (const p of this.players.values()) {
      for (const dr of [...this.drops]) {
        if (Math.hypot(p.pos.x - dr.pos.x, p.pos.z - dr.pos.z) <= this.cfg.pickupRadius && Math.abs(p.pos.y - dr.pos.y) <= 4) this.pickup(p, dr)
      }
    }
  }

  timeLeft() {
    return this.cfg.roundSeconds - (this.d.now() - this.roundStart) / 1000
  }

  private neededPlayers(): number {
    if (this.mode === 'solo') return 1
    const side = this.charge.stage === 'free' ? undefined : this.charge.side
    let group = this.players.size
    if (this.mode === 'multiplayer' && side) group = [...this.players.values()].filter((p) => p.side === side).length
    return this.cfg.playersNeededCoop(Math.max(1, group))
  }

  private resetCharge() {
    this.charge = { stage: 'free', side: 'hunters', contributors: new Set(), windowEnd: 0 }
  }
  private failCharge() {
    this.teleportSynthWithin(this.cfg.teleportOnFailRadius)
    this.resetCharge()
    this.inRange.clear()
    if (this.cfg.roundFailResetsRoundTimer) this.startRound(false)
  }

  private contact(p: Player, now: number) {
    if (this.pendingAdvance) return // the Synth is frozen after a completed Charge
    const c = this.charge
    this.note('contact', { id: p.id, stage: c.stage })
    // the contacting halo plays its charging effect at the Synth's spot even if this contact ends the round and the Synth is moved
    p.queue.push({ ev: 'contact', stage: c.stage, x: this.synth.x, y: this.synth.y, z: this.synth.z })
    if (c.stage === 'free') {
      this.charge = { stage: 'reset', side: p.side, contributors: new Set([p.id]), windowEnd: now + this.cfg.chargeWindowSeconds * 1000 }
      this.broadcast({ ev: 'stage', stage: 'reset', side: p.side })
      if (this.neededPlayersFor(p.side) <= 1) this.complete(p.side)
      return
    }
    if (this.mode === 'multiplayer' && p.side !== c.side) {
      // breaking the charge: the opposing side absorbs one level
      if (c.stage === 'reset') {
        this.note('charge-broken', { by: p.id })
        this.broadcast({ ev: 'charge-broken', by: p.side })
        this.failCharge()
      } else {
        c.stage = 'reset'
        c.windowEnd = now + this.cfg.chargeWindowSeconds * 1000
        const first = [...c.contributors][0]
        c.contributors = new Set(first ? [first] : [])
        this.note('charge-downgraded', { by: p.id })
        this.broadcast({ ev: 'stage', stage: 'reset', side: c.side, downgraded: true })
      }
      return
    }
    if (c.contributors.has(p.id)) return
    c.contributors.add(p.id)
    if (c.contributors.size >= this.neededPlayersFor(c.side)) {
      this.complete(c.side)
      return
    }
    if (c.stage === 'reset') {
      c.stage = c.side === 'hunters' ? 'repair' : 'upgrade'
      c.windowEnd = now + this.cfg.chargeWindowSeconds * 1000
      this.broadcast({ ev: 'stage', stage: c.stage, side: c.side })
    }
  }
  private neededPlayersFor(side: Side): number {
    if (this.mode === 'solo') return 1
    const group = this.mode === 'multiplayer' ? [...this.players.values()].filter((p) => p.side === side).length : this.players.size
    return this.cfg.playersNeededCoop(Math.max(1, group))
  }

  // the Synth's level after a completed Charge (Addendum 1): Solo and Coop (either path) always raise it; Multiplayer: the winning side decides
  private levelDelta(side: Side): number {
    if (this.mode !== 'multiplayer') return this.cfg.soloCoopChargeDelta
    return side === 'helpers' ? this.cfg.multiHelperChargeDelta : this.cfg.multiHunterChargeDelta
  }
  // the Synth's level right now: its own level, one lower (min 0) while a Discharge Trap hit lasts
  synthLevelNow(now = this.d.now()): number {
    const lv = this.synthLevel + (now < this.synthTrapUntil ? this.cfg.trapDelta : 0)
    return Math.max(this.cfg.synthMinLevel, Math.min(this.cfg.synthMaxLevel, lv))
  }
  // what the Synth brain sees as the charge stage: frozen (as in Upgrade Mode) for the moment after a completed Charge
  synthStage(): Stage {
    return this.pendingAdvance || this.state === 'lobby' ? 'upgrade' : this.charge.stage
  }

  private complete(side: Side) {
    this.wins[side]++
    this.synthLevel = Math.max(this.cfg.synthMinLevel, Math.min(this.cfg.synthMaxLevel, this.synthLevel + this.levelDelta(side)))
    this.note('round-complete', { round: this.round, side, synthLevel: this.synthLevel })
    this.broadcast({ ev: 'round-complete', round: this.round, side })
    this.resetCharge()
    this.inRange.clear()
    if (this.cfg.completeFreezeSeconds > 0) {
      this.pendingAdvance = { at: this.d.now() + this.cfg.completeFreezeSeconds * 1000, side }
      return
    }
    this.afterComplete(side)
  }

  private afterComplete(side: Side) {
    if (this.replaying) {
      this.replayCount++
      this.note('replay-round-complete', { count: this.replayCount })
      if (this.replayCount >= this.cfg.finalCinematicAfterReplays && !this.finalDone) {
        this.finalDone = true
        this.state = 'final'
        this.broadcast({ ev: 'final-cinematic', plays: this.replayCount })
        this.note('final-cinematic', { plays: this.replayCount })
        return
      }
      if (this.singleRound !== null) {
        // a single Power Round replay: back to the replay menu
        this.state = 'ended'
        this.endgame = null
        this.broadcast({ ev: 'replay-menu', replayCount: this.replayCount })
        return
      }
    }
    // Multiplayer: the first side to win three rounds wins (up to five rounds; a timed-out round does not count); Solo and Coop: three completed rounds
    const decided = this.mode === 'multiplayer' ? this.wins.hunters >= this.cfg.multiplayerWinsNeeded || this.wins.helpers >= this.cfg.multiplayerWinsNeeded : false
    const lastRound = this.mode === 'multiplayer' ? this.cfg.multiplayerMaxRounds : this.cfg.rounds
    if (this.round >= lastRound || decided) {
      this.finish(side)
    } else if (this.cfg.cinematics) {
      this.roundChange() // c30: PP1, Strike or Aurora, blast, Glimpse Signal, then the next round
    } else {
      this.round++
      if (this.mode === 'solo' || !this.cfg.lobbyEnabled) this.teleportSynthWithin(this.cfg.teleportOnFailRadius)
      else this.placeSynthAroundGroup()
      this.startRound(true)
    }
  }

  // the replay menu after the Ending: play again from the start, or replay one Power Round. Every completed round played from here counts
  // toward the final cinematic (UNCONFIRMED: finalCinematicAfterReplays, in any combination).
  replay(kind: 'again' | 'round', round = 1): boolean {
    if (this.state !== 'ended') return false
    this.replaying = true
    this.endgame = null
    this.state = 'playing'
    this.resetCharge()
    this.inRange.clear()
    this.teleportSynthWithin(this.cfg.teleportOnFailRadius)
    if (kind === 'again') {
      this.round = 1
      this.wins = { hunters: 0, helpers: 0 }
      this.synthLevel = this.cfg.synthStartLevel
      this.synthTrapUntil = 0
      this.singleRound = null
    } else {
      this.round = Math.max(1, Math.min(this.mode === 'multiplayer' ? this.cfg.multiplayerMaxRounds : this.cfg.rounds, round))
      this.singleRound = this.round
    }
    this.startRound(true)
    this.note('replay', { kind, round: this.round })
    return true
  }

  private startRound(newRound: boolean) {
    this.roundStart = this.d.now()
    this.warnSent = false
    this.nextDropAt = this.d.now() + this.cfg.dropSpawnEverySeconds * 1000
    for (const p of this.players.values()) {
      p.plumesLeft = this.cfg.plumesPerRound
      if (newRound) p.boostUntil = 0
    }
    this.plumes = []
    this.traps = []
    for (const p of this.players.values()) p.trapUntil = 0
    this.synthTrapUntil = 0
    if (this.cfg.cinematics) this.makeRoundDrops() // c30: every drop of the round exists from the start and is shown (from the blast on) until a player collects it
    this.broadcast({ ev: 'round-start', round: this.round })
    if (this.cfg.tossStartRounds.includes(this.round) && this.round <= 2) this.broadcast({ ev: 'toss', round: this.round, altitude: this.cfg.tossAltitude })
    if (this.cfg.blastStart && !this.cfg.cinematics && newRound && this.round === 1) this.broadcast({ ev: 'blast', centre: this.cfg.blastCentre, cx: this.synth.x, cz: this.synth.z, radius: this.cfg.blastRadius, seed: Math.floor(Math.random() * 4294967295) })
    this.note('round-start', { round: this.round })
  }

  private finish(winner: Side) {
    if (this.cfg.cinematics) { this.endingSequence(winner); return } // c30: PP2 in the winner's colour, the Storm, the two replay portals (no marked spot, no level choice)
    this.state = 'ended'
    const nearest = this.d.emptyParcelFinder?.(this.synth.x, this.synth.z) ?? { x: this.synth.x, z: this.synth.z }
    // Ending 1 Escape (players helping the Synth) / Ending 2 Containment (players capturing it)
    const kind = winner === 'helpers' ? 'escape' : 'containment'
    this.endgame = { kind, x: nearest.x, z: nearest.z, winner: this.mode === 'multiplayer' ? winner : 'players', firstArrival: null, resolved: false }
    this.broadcast({ ev: 'endgame', kind, x: nearest.x, z: nearest.z })
    this.note('endgame', { kind, x: nearest.x, z: nearest.z })
    this.rifts.push({ kind: kind === 'escape' ? 'helper-ending' : 'hunter-ending', at: { x: nearest.x, y: 0, z: nearest.z } })
  }

  // endgame arrival rule (UNCONFIRMED): majority of the side present, or anyone present once 30 s have passed since the first arrival
  private endgameStep(now: number) {
    const e = this.endgame
    if (!e || e.resolved) return
    const R = 15
    const side = e.winner === 'players' ? null : e.winner
    const eligible = [...this.players.values()].filter((p) => !side || p.side === side)
    const present = eligible.filter((p) => Math.hypot(p.pos.x - e.x, p.pos.z - e.z) <= R)
    if (present.length > 0 && e.firstArrival === null) e.firstArrival = now
    const majority = eligible.length > 0 && present.length * 2 > eligible.length
    const timed = e.firstArrival !== null && present.length > 0 && now - e.firstArrival >= this.cfg.endgameArrival.allAfterSeconds * 1000
    if (majority || timed) {
      e.resolved = true
      this.broadcast({ ev: 'endgame-go', kind: e.kind })
      this.note('endgame-go', { present: present.length, of: eligible.length })
    }
  }

  // ---- plumes ----
  plume(id: string, pos: Vec): boolean {
    const p = this.players.get(id)
    if (!p || p.plumesLeft <= 0 || this.state !== 'playing') return false
    p.plumesLeft--
    const now = this.d.now()
    const pl: Plume = { id: this.nextId++, owner: id, pos, born: now, expires: now + this.cfg.plumeSeconds * 1000 }
    this.plumes.push(pl)
    this.note('plume', { id, plumesLeft: p.plumesLeft })
    return true
  }

  // ---- upgrades ----
  /** c30: all of the round's drops at once, around the Synth's new start, never more than cfg.maxDrops; they stay until collected (or the round's clock runs out) */
  private makeRoundDrops() {
    this.drops = []
    this.dropsMade = 0
    const [lo, hi] = this.cfg.dropSpawnMinMax, now = this.d.now()
    for (let i = 0; i < Math.max(0, Math.floor(this.cfg.maxDrops)); i++) {
      const a = this.d.rng() * Math.PI * 2, r = lo + this.d.rng() * (hi - lo)
      const kind: DropKind = this.round <= this.cfg.haloBoostMaxRound && this.d.rng() < 0.6 ? 'boost' : 'plume'
      this.drops.push({ id: this.nextId++, kind, pos: { x: this.synth.x + Math.cos(a) * r, y: this.synth.y, z: this.synth.z + Math.sin(a) * r }, expires: now + (this.cfg.roundSeconds + 60) * 1000 })
      this.dropsMade++
    }
    this.note('drops-made', { n: this.dropsMade })
  }
  private spawnDrops(now: number) {
    if (this.cfg.cinematics) return // c30: the drops are made once, at the round start
    if (now < this.nextDropAt || this.drops.length >= this.cfg.dropMax) return
    this.nextDropAt = now + this.cfg.dropSpawnEverySeconds * 1000
    // near the action: around the Synth
    const [lo, hi] = this.cfg.dropSpawnMinMax
    const a = this.d.rng() * Math.PI * 2
    const r = lo + this.d.rng() * (hi - lo)
    const kind: DropKind = this.round <= this.cfg.haloBoostMaxRound && this.d.rng() < 0.6 ? 'boost' : 'plume'
    this.drops.push({ id: this.nextId++, kind, pos: { x: this.synth.x + Math.cos(a) * r, y: this.synth.y, z: this.synth.z + Math.sin(a) * r }, expires: now + this.cfg.dropExpirySeconds * 1000 })
    this.note('drop', { kind })
  }
  addDrop(kind: DropKind, pos: Vec) {
    const d: Drop = { id: this.nextId++, kind, pos, expires: this.d.now() + this.cfg.dropExpirySeconds * 1000 }
    this.drops.push(d)
    return d
  }
  private pickup(p: Player, d: Drop) {
    this.drops = this.drops.filter((x) => x.id !== d.id)
    if (d.kind === 'plume') p.plumesLeft++
    else if (this.round <= this.cfg.haloBoostMaxRound) p.boostUntil = this.d.now() + this.cfg.haloBoostSeconds * 1000 // a Halo boost applies the moment it is picked up (rounds 1-2)
    p.queue.push({ ev: 'pickup', kind: d.kind })
    this.note('pickup', { id: p.id, kind: d.kind })
  }
  // ---- Discharge Trap (E): placed where the player stands, one at a time per player, drawn by every Halo ----
  /** ask a player's halo to teleport (movePlayerTo): the destination is a world position; `tag` names the call in the probe log. Returns false for an unknown player. */
  teleportPlayer(id: string, dest: Vec, tag: string): boolean {
    const p = this.players.get(id) ?? this.waiting.get(id)
    if (!p || ![dest.x, dest.y, dest.z].every((v) => Number.isFinite(v))) return false
    p.queue.push({ ev: 'teleport', id: tag, x: dest.x, y: dest.y, z: dest.z })
    this.note('teleport-asked', { id: p.id, tag, x: Math.round(dest.x), z: Math.round(dest.z) })
    return true
  }

  placeTrap(id: string, pos: Vec): boolean {
    const p = this.players.get(id)
    if (!p || this.state !== 'playing' || this.traps.some((t) => t.owner === id)) return false
    const now = this.d.now()
    // players already standing in range when it is placed (the placer first) do not set it off until they have stepped out once
    const exempt = new Set([...this.players.values()].filter((q) => dist3d(q.pos, pos) <= this.cfg.trapRadius).map((q) => q.id))
    this.traps.push({ id: this.nextId++, owner: id, pos: { ...pos }, born: now, expires: now + this.cfg.trapLifeSeconds * 1000, exempt })
    this.note('trap-placed', { id })
    return true
  }
  // a trap triggers when the Synth or any player (the placer and teammates too) comes within its radius: everyone in range drops one level for trapSeconds, and the trap is used up
  private checkTraps(now: number) {
    for (const t of [...this.traps]) {
      for (const id of [...t.exempt]) { const q = this.players.get(id); if (!q || dist3d(q.pos, t.pos) > this.cfg.trapRadius) t.exempt.delete(id) }
      const hit = [...this.players.values()].filter((p) => dist3d(p.pos, t.pos) <= this.cfg.trapRadius && !t.exempt.has(p.id))
      const synthHit = dist3d(this.synth, t.pos) <= this.cfg.trapRadius
      if (hit.length === 0 && !synthHit) continue
      for (const p of hit) p.trapUntil = now + this.cfg.trapSeconds * 1000
      if (synthHit) this.synthTrapUntil = now + this.cfg.trapSeconds * 1000
      this.traps = this.traps.filter((x) => x.id !== t.id)
      this.note('trap-hit', { owner: t.owner, players: hit.map((p) => p.id), synth: synthHit })
      this.broadcast({ ev: 'trap-hit', x: t.pos.x, y: t.pos.y, z: t.pos.z, synth: synthHit, players: hit.map((p) => p.id) })
    }
  }
  // a player's power tier: the round's level (max 3; rounds 4 and 5 of Multiplayer keep the full Fly kit), plus a Halo boost, minus a Discharge Trap hit (min 0 = normal)
  tierOf(p: Player, now = this.d.now()): number {
    const base = Math.min(3, this.round + (now < p.boostUntil ? 1 : 0))
    return Math.max(0, now < p.trapUntil ? base + this.cfg.trapDelta : base)
  }

  broadcast(ev: { ev: string; [k: string]: unknown }) {
    for (const p of this.players.values()) p.queue.push(ev)
  }

  // ---- what a halo receives ----
  snapshot(id: string) {
    this.advance()
    const now = this.d.now()
    const me = this.players.get(id) ?? this.waiting.get(id)
    const visible = this.cfg.plumeVisibleTo === 'everyone-in-match' ? this.plumes : this.plumes.filter((pl) => this.players.get(pl.owner)?.side === me?.side)
    let dz: { dist: number; dx: number; dz: number } | null = null
    if (me && this.d.deadZones) {
      const n = this.d.deadZones.nearest(me.pos.x, me.pos.z, 400)
      if (n) dz = { dist: n.dist, dx: n.at.x - me.pos.x, dz: n.at.z - me.pos.z }
    }
    const events = me ? me.queue.splice(0) : []
    return {
      t: now,
      match: { mode: this.mode, round: this.round, state: this.state, replayCount: this.replayCount, timeLeft: Math.max(0, this.timeLeft()), wins: this.wins, synthLevel: this.synthLevelNow(now), synthLevelBase: this.synthLevel, skyRound: Math.min(3, this.round) },
      you: me && { waiting: !this.players.has(id), dialog: this.choices.get(me.id)?.step ?? 'none', plumesLeft: me.plumesLeft, boostLeft: Math.max(0, (me.boostUntil - now) / 1000), trapLeft: Math.max(0, (me.trapUntil - now) / 1000), tier: this.tierOf(me, now), hasTrap: this.traps.some((t) => t.owner === me.id) },
      synth: { x: this.synth.x, y: this.synth.y, z: this.synth.z, deadZone: this.d.deadZones ? this.d.deadZones.has(Math.floor(this.synth.x / 16), Math.floor(this.synth.z / 16)) : false, exposure: this.synthExposure, stage: this.synthStage(), side: this.charge.stage === 'free' ? null : this.charge.side, ageMs: now - this.synthSeenAt },
      plumes: visible.map((pl) => ({ id: pl.id, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, leftMs: pl.expires - now })),
      bubble: this.bubble && { x: this.bubble.x, y: this.bubble.y, z: this.bubble.z, radius: this.bubble.radius, leftMs: Math.max(0, this.lobbyEndsAt - now), inside: [...this.players.values()].filter((q) => this.insideBubble(q)).length, you: me ? this.insideBubble(me) : false },
      traps: this.traps.map((t) => ({ id: t.id, x: t.pos.x, y: t.pos.y, z: t.pos.z, leftMs: t.expires - now, mine: t.owner === id })),
      drops: this.drops.map((dr) => ({ id: dr.id, kind: dr.kind, x: dr.pos.x, y: dr.pos.y, z: dr.pos.z, leftMs: dr.expires - now })),
      endgame: this.endgame && { kind: this.endgame.kind, x: this.endgame.x, z: this.endgame.z, resolved: this.endgame.resolved },
      deadzone: dz,
      events
    }
  }
}
