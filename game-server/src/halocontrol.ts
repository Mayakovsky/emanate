// Round 23: the server side of the thin halo. Settings overrides, commands, the kill switch and the version policy.
// With nothing set (the default) the halo behaves exactly as its built-in defaults: a halo already in testers' hands keeps working.
//   settings  overrides of the halo's tunables ({power:{runSpeed:18}, rules:{...}, fx:{...}, features:{...}, text:{...}, sounds:{...}, tick:{...}}); `sv` counts the changes
//   commands  { c: 'hud' | 'sound' | 'fx' | 'push' | 'lift' | 'teleport' | 'tick' | 'feature' | 'idle' | 'settings', ... } queued per wearer or for everyone
//   idle      the kill switch: the halo stops sending about the player and shows nothing; it polls GET /halo/state to learn when to wake
//   policy    refuse (or serve older behaviour to) a halo whose protocol version is below minPv
export const SERVER_PROTOCOL = 1
const SECTIONS = new Set(['power', 'rules', 'fx', 'blast', 'features', 'text', 'sounds', 'tick', 'look']) // c29: `look` = the recipe numbers of the effects (flat keys such as E13.smoke.size; key under 40 chars, value under 200)
const COMMANDS = new Set(['hud', 'sound', 'fx', 'push', 'lift', 'teleport', 'blast', 'tick', 'feature', 'idle', 'settings', 'particles', 'look', 'clear'])
const MAX_QUEUE = 40

export interface HaloPolicy { minPv: number; message: string }

export class HaloControl {
  overrides: Record<string, Record<string, string | number>> = {}
  sv = 0
  idle = false
  policy: HaloPolicy = { minPv: 0, message: 'This Emanate halo is out of date.' }
  private queues = new Map<string, Record<string, unknown>[]>()
  versions = new Map<string, number>() // "build/pv" -> number of ticks seen (no addresses)
  sawPlayers = new Set<string>() // for the broadcast: who is connected
  /** Set overrides (validated: known sections, simple values). Returns how many values were accepted. */
  set(patch: any): number {
    if (!patch || typeof patch !== 'object') return 0
    let n = 0
    for (const sec of Object.keys(patch)) {
      if (!SECTIONS.has(sec) || !patch[sec] || typeof patch[sec] !== 'object') continue
      for (const k of Object.keys(patch[sec])) {
        const v = patch[sec][k]
        if (k.length > 40 || !/^[A-Za-z0-9_.:-]+$/.test(k)) continue
        if (typeof v === 'number' && Number.isFinite(v)) { (this.overrides[sec] ??= {})[k] = v; n++ }
        else if (typeof v === 'string' && v.length <= 200) { (this.overrides[sec] ??= {})[k] = v; n++ }
      }
    }
    if (n) this.sv++
    return n
  }
  reset() { this.overrides = {}; this.sv++ }
  /** c29e (the real STOP): drop every queued command for everyone (the queues hold up to 40 per wearer); returns how many were dropped */
  clearQueues(): number { let n = 0; for (const q of this.queues.values()) n += q.length; this.queues.clear(); return n }
  /** Validate and queue a command for one wearer (an address) or everyone ('all'). */
  command(to: string, cmd: any): boolean {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.c !== 'string' || !COMMANDS.has(cmd.c)) return false
    const clean = JSON.parse(JSON.stringify(cmd))
    if (cmd.c === 'particles') { // c24f candidate: refuse what the halo would only ignore (an unknown kind, a non-numeric number); the halo clamps the rest
      if (!['fire', 'smoke', 'sparks'].includes(cmd.kind)) return false
      for (const k of ['x', 'y', 'z', 'size', 'seconds', 'height', 'n', 'width']) if (cmd[k] !== undefined && !(typeof cmd[k] === 'number' && Number.isFinite(cmd[k]))) return false
    }
    if (cmd.c === 'look') { // c29 (Plan v2): { c:'look', id:'E1'..'E14', x,y,z (world) | at:'me', seconds, seed, color:[r,g,b], r }: one effect from the recipe table; the halo validates and caps it
      if (typeof cmd.id !== 'string' || !/^(E(1[0-4]|[1-9])|PLUME|PORTAL)$/.test(cmd.id)) return false // c30c: the two archetypes too
      for (const k of ['x', 'y', 'z', 'seconds', 'seed', 'r', 'scale', 'v', 'far']) if (cmd[k] !== undefined && !(typeof cmd[k] === 'number' && Number.isFinite(cmd[k]))) return false
      if (cmd.winner !== undefined && cmd.winner !== 'hunters' && cmd.winner !== 'helpers') return false // c30: PP2's colour
    }
    if (JSON.stringify(clean).length > 600) return false
    const targets = to === 'all' ? [...this.sawPlayers] : [to.toLowerCase()]
    for (const id of targets) {
      const q = this.queues.get(id) ?? []
      q.push(clean)
      if (q.length > MAX_QUEUE) q.shift()
      this.queues.set(id, q)
    }
    return targets.length > 0
  }
  /** What to add to a tick reply for this wearer. */
  forTick(pid: string, haloSv: number | undefined): Record<string, unknown> {
    const id = pid.toLowerCase()
    this.sawPlayers.add(id)
    const out: Record<string, unknown> = { sv: this.sv }
    if (haloSv !== this.sv && Object.keys(this.overrides).length) out.settings = this.overrides
    else if (haloSv !== this.sv && haloSv !== undefined && haloSv !== 0) out.settings = {} // the halo held overrides that are gone: tell it to fall back to its defaults
    const q = this.queues.get(id)
    if (q && q.length) { out.cmds = q.splice(0, 20) }
    return out
  }
  /** Count the build a tick came from (build id and protocol only). */
  seen(v: string | undefined, pv: number | undefined) {
    const k = (v ?? 'none') + '/' + (pv ?? 0)
    this.versions.set(k, (this.versions.get(k) ?? 0) + 1)
    if (this.versions.size > 200) this.versions.clear()
  }
  /** null = serve it; otherwise the refusal text. A halo that sends no protocol version (an older build) counts as protocol 0. */
  refusal(pv: number | undefined): string | null {
    return (pv ?? 0) < this.policy.minPv ? this.policy.message : null
  }
  /** The public state a sleeping halo asks for (no player data either way). */
  publicState(pv: number | undefined): Record<string, unknown> {
    const r = this.refusal(pv)
    return r ? { refuse: true, message: r, sv: this.sv } : { idle: this.idle, sv: this.sv, settings: this.overrides } // c31c fix: the overrides travel WITH sv. A Halo polls this before it joins and takes sv from it; without the settings it then believed it was current and its ticks never asked for them (the server's text and look overrides never reached it). No player data: the same overrides every Halo gets
  }
  /** Remove a wearer's queue (the forget tool). */
  forget(pid: string) { this.queues.delete(pid.toLowerCase()); this.sawPlayers.delete(pid.toLowerCase()) }
}
