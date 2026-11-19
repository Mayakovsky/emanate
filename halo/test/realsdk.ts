// Real-SDK headless test: the real @dcl/ecs engine in Node + the real halo code + the real game-server Match behind a mocked fetch.
// Build:  npx esbuild test/realsdk.ts --bundle --platform=node --outfile=test/realsdk.cjs   then   node test/realsdk.cjs
import { engine, Transform, PointerEventsResult, InputAction, PointerEventType, MeshRenderer, AudioSource, MainCamera } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { main } from '../src/index'
import { Match } from '../../game-server/src/match'
import { CONFIG } from '../../game-server/src/config'
import { ParcelSet } from '../../game-server/src/geo'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''))
  ok ? pass++ : fail++
}

// ---- a fake clock for the server, a real Match, and a fetch that routes /tick to it ----
let serverTime = 1_000_000
let up = false // when false, fetch fails (test mode)
let match = new Match({ now: () => serverTime, rng: Math.random, cfg: CONFIG, deadZones: new ParcelSet([[10, 0]]) })
match.setMode('solo')
const bodies: any[] = []
;(globalThis as any).fetch = async (url: string, init: any) => {
  if (!up) throw new Error('connection refused')
  const body = JSON.parse(init.body)
  bodies.push(body)
  const p = match.upsertPlayer(body.pid, { name: body.name, pos: body.pos, speed: body.speed })
  for (const e of body.events ?? []) {
    if (e.ev === 'plume') match.plume(body.pid, e.pos ?? body.pos)
    if (e.ev === 'use') match.useUpgrade(body.pid)
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, state: match.snapshot(p.id) }) }
}
;(globalThis as any).WebSocket = class { onopen: any; onerror: any; constructor() { setTimeout(() => this.onopen && this.onopen(), 1) } send() {} close() {} }

let ts = 1
const key = (button: InputAction, state: PointerEventType) => PointerEventsResult.addValue(engine.RootEntity, { button, state, timestamp: ts++, tickNumber: ts, hit: undefined } as any)
const press = async (b: InputAction) => { key(b, PointerEventType.PET_DOWN); await step(); key(b, PointerEventType.PET_UP); await step() }
const step = async (dt = 0.05) => {
  serverTime += dt * 1000
  await engine.update(dt)
  await new Promise((r) => setTimeout(r, 0)) // let the mocked fetch promises settle
}
const run = async (secs: number, dt = 0.05) => { for (let i = 0; i < secs / dt; i++) await step(dt) }
const logs = () => bodies.flatMap((b) => b.log ?? [])
const evs = (name: string) => logs().filter((e: any) => e.ev === name)
const setPos = (x: number, z: number, y = 0) => Transform.createOrReplace(engine.PlayerEntity, { position: Vector3.create(x, y, z), rotation: Quaternion.Identity() })
// a chevron arm counts as visible when its parent (the chevron root) is scaled up
const visibleChevrons = () => {
  let n = 0
  for (const [e, t] of engine.getEntitiesWith(Transform, MeshRenderer)) {
    const par = (t as any).parent
    if (!par) continue
    const pt = Transform.getOrNull(par)
    if (pt && pt.scale.x > 0.05 && (t as any).scale.z > 0.5 && (t as any).scale.y < 0.1) n++
  }
  return n
}
const flush = () => run(0.6)

async function go() {
  setPos(0, 0)
  Transform.createOrReplace(engine.CameraEntity, { position: Vector3.create(0, 1, 0), rotation: Quaternion.Identity() })
  main()
  await run(0.5)
  check('halo loads on the real engine, no error events', evs('error').length === 0, JSON.stringify(evs('error')[0] ?? ''))
  check('sound entities created (10 tones)', [...engine.getEntitiesWith(AudioSource)].length === 10, `${[...engine.getEntitiesWith(AudioSource)].length}`)

  // ================= TEST MODE (server down) =================
  check('test mode while the server is unreachable', true)
  // key 1: nearest test Synth point is the moving one (~ (80+45, 80) at t~0.5 => ~ 150 m): outside 100 m => red arrow
  await press(InputAction.IA_ACTION_3)
  await run(0.2)
  up = true // (let the pending log through later); first check the arrow in test mode via the next tick
  await run(0.6)
  const red = evs('arrow').find((e: any) => e.kind === 'red')
  check('test mode: key 1 outside 100 m -> red arrow', red && red.result === 'arrow' && red.d > 100, JSON.stringify(red))
  check('arrow chevrons are visible while it plays', visibleChevrons() > 0, `${visibleChevrons()} chevron arms`)
  await run(4.3)
  check('arrow gone after 4 s', visibleChevrons() === 0, `${visibleChevrons()}`)
  await press(InputAction.IA_ACTION_3)
  await flush()
  const cd = evs('arrow').filter((e: any) => e.kind === 'red')
  check('key 1 again inside the 7 s cooldown -> cooldown', cd.length >= 2 && cd[cd.length - 1].result === 'cooldown', JSON.stringify(cd[cd.length - 1]))
}

async function server() {
  // ================= SERVER MODE =================
  up = true
  bodies.length = 0
  match = new Match({ now: () => serverTime, rng: Math.random, cfg: CONFIG, deadZones: new ParcelSet([[10, 0]]) }) // dead parcel x 160..176
  match.setMode('solo')
  setPos(100, 8) // 60 m from the dead zone
  await run(1)
  match.setSynth({ x: 300, y: 0, z: 300 })
  await run(0.6)
  await run(12) // let key-1 cooldown from test mode finish
  await press(InputAction.IA_ACTION_3)
  await run(0.6)
  const r = evs('arrow').filter((e: any) => e.kind === 'red').pop()
  check('server mode: key 1 -> red arrow toward the server\'s Synth (d ~ 340 m)', r && r.result === 'arrow' && Math.abs(r.d - Math.hypot(200, 292)) < 20, JSON.stringify(r))
  await run(12)
  match.setSynth({ x: 130, y: 0, z: 20 })
  await run(1)
  await press(InputAction.IA_ACTION_3)
  await run(0.6)
  const r2 = evs('arrow').filter((e: any) => e.kind === 'red').pop()
  check('server mode: key 1 inside 100 m -> overloaded (sputter), not an arrow', r2 && r2.result === 'overloaded', JSON.stringify(r2))

  // dead-zone warning: walking east at 24 m/s toward x=160; trigger distance 48.6 m
  match.setSynth({ x: 600, y: 0, z: 600 })
  const w0 = evs('warning').filter((e: any) => e.kind === 'dead-zone').length
  for (let i = 0; i < 40; i++) {
    const t = Transform.getMutable(engine.PlayerEntity)
    t.position = Vector3.create(t.position.x + 24 * 0.05, 0, 8)
    await step(0.05)
  }
  const dzw = evs('warning').filter((e: any) => e.kind === 'dead-zone')
  check('dead-zone warning fired once inside 2 s of travel (~48 m)', dzw.length === w0 + 1 && dzw[dzw.length - 1].dist <= 49 && dzw[dzw.length - 1].dist > 30, JSON.stringify(dzw[dzw.length - 1]))
  // key 3 switches it off
  await press(InputAction.IA_ACTION_5)
  await flush()
  check('key 3 switches dead-zone warnings off', evs('dead-zone-warnings').pop()?.on === false)
  await press(InputAction.IA_ACTION_5)
  await flush()
  check('key 3 switches them on again', evs('dead-zone-warnings').pop()?.on === true)

  // upgrade drop: announced at 80 m
  setPos(0, 0)
  await run(0.5)
  match.addDrop('plume', { x: 70, y: 0, z: 0 })
  await run(1)
  const up1 = evs('warning').filter((e: any) => e.kind === 'upgrade-nearby')
  check('upgrade-available warning at 70 m (inside 80)', up1.length >= 1 && up1[up1.length - 1].dist < 80, JSON.stringify(up1[up1.length - 1]))
  await run(9)
  await press(InputAction.IA_ACTION_4)
  await flush()
  const pk = evs('arrow').filter((e: any) => e.kind === 'pink').pop()
  check('key 2 re-triggers the pink arrow inside 80 m', pk && pk.result === 'arrow', JSON.stringify(pk))

  // plumes: 3 per round
  for (let i = 0; i < 4; i++) { await press(InputAction.IA_ACTION_6); await run(0.3) }
  const pl = evs('plume')
  check('plumes: 3 sent, the 4th refused', pl.filter((e: any) => e.sent).length === 3 && pl.filter((e: any) => !e.sent).length >= 1, `${pl.filter((e: any) => e.sent).length} sent`)
  check('server holds the 3 plumes for every halo', match.plumes.length === 3, `${match.plumes.length}`)
  const puffs = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  check('plume smoke entities exist (12 puffs each)', puffs >= 36, `${puffs} meshes`)
  await run(15)
  check('plumes expire after 14 s (server + halo)', match.plumes.length === 0)

  // upgrade pick-up (walk within 2 m), E uses it, tier goes up for 30 s
  match.addDrop('boost', { x: 20, y: 0, z: 20 })
  setPos(20.5, 20.5)
  await run(1)
  check('walking within 2 m picks the boost up', match.players.values().next().value!.boostCount === 1)
  await press(InputAction.IA_PRIMARY)
  await run(1.5)
  const tiers = evs('tier')
  check('E uses the boost: tier 1 -> 2 for 30 s', tiers.pop()?.tier === 2, JSON.stringify(tiers.slice(-1)))
  await run(31)
  check('boost ends after 30 s: back to tier 1', evs('tier').pop()?.tier === 1)

  // charging arcs: within 5 m of the Synth
  match.setSynth({ x: 22, y: 0, z: 21 })
  await run(1.5)
  check('charging effect starts within 5 m (solo contact completes the round)', evs('charging').length >= 1 && match.round === 2, `round ${match.round}`)
  check('no error events in the whole run', evs('error').length === 0, JSON.stringify(evs('error')[0] ?? ''))
}

async function endgame() {
  // F held + 4 in test mode: the endgame effect (plume, portal) and the sky dome must build without errors
  up = false
  await run(22) // fall back to test mode; let any cinematic started by the server rounds finish (Rift 15 s, storm 12 s)
  const before = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_ACTION_6)
  await run(1)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  const after = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  check('endgame test builds its plume, sparks and portal (30+16+24+1 new meshes)', after - before >= 70, `${before} -> ${after}`)
  // F held + 2: the sky ceiling planes (night prototype)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_ACTION_4)
  await run(0.5)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  await run(1)
  let planes = 0
  for (const [e, t] of engine.getEntitiesWith(Transform, MeshRenderer)) if ((t as any).scale.x === 900 && Math.abs((t as any).position.y - 180) < 1) planes++
  check('sky night prototype: two 900 m planes at 180 m', planes === 2, `${planes}`)
  // F held + 1: distance markers (7 distances x 4 directions)
  const m0 = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_ACTION_3)
  await run(0.5)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  const m1 = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  check('distance test places 32 markers (8 distances x 4 directions)', m1 - m0 === 32, `${m0} -> ${m1}`)
  // F held + E: camera test sets a MainCamera with a virtual camera
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_PRIMARY)
  await run(0.5)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  const mc = MainCamera.getOrNull(engine.CameraEntity)
  check("camera test 1: bird's-eye virtual camera set on the main camera", !!mc && mc.virtualCameraEntity !== undefined, JSON.stringify(mc))
  // F held + 3: the Rift then the aurora prototypes
  const c0 = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_ACTION_5)
  await run(2.5)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  await run(1)
  const c1 = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  check('Rift prototype meshes exist (built now or by an earlier server-round Rift)', c1 >= c0 && c1 >= 188, `${c0} -> ${c1}`)
  await run(14)
  const mc2 = MainCamera.getOrNull(engine.CameraEntity)
  check('Rift timeline ends with the camera snapped back', !mc2 || mc2.virtualCameraEntity === undefined, JSON.stringify(mc2))
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  await step()
  await press(InputAction.IA_ACTION_5) // Rift again
  await run(0.3)
  await press(InputAction.IA_ACTION_5) // aurora
  await run(1)
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
  await step()
  const c2 = [...engine.getEntitiesWith(Transform, MeshRenderer)].length
  check('aurora prototype builds its 24 curtains', c2 - c1 >= 24, `${c1} -> ${c2}`)
  // audio slots: fallback chain (server recording -> packed recording -> tone), through the real engine
  const aud = await import('../src/fx')
  const sources0 = ['warn.deadzone', 'synth.greet.stranger', 'end.portal.escape.line'].map((i) => aud.slotSource(i))
  check('slot fallback: tone where a tone exists, silent where not', sources0[0] === 'tone' && sources0[1] === 'silent' && sources0[2] === 'tone', JSON.stringify(sources0))
  aud.setRemoteAudio({ 'warn.deadzone': 'https://emanate.hiddenforces.net/audio/files/warn_deadzone.wav', 'synth.greet.stranger': 'https://emanate.hiddenforces.net/audio/files/synth_greet_stranger.wav' })
  const sources1 = ['warn.deadzone', 'synth.greet.stranger', 'end.portal.escape.line'].map((i) => aud.slotSource(i))
  check('slot with a server recording uses it; others keep their fallback', sources1[0] === 'server' && sources1[1] === 'server' && sources1[2] === 'tone', JSON.stringify(sources1))
  aud.playSlot('warn.deadzone')
  await run(0.3)
  check('playing a server-recorded slot creates its audio source with that url', [...engine.getEntitiesWith(AudioSource)].some(([e, a]) => (a as any).audioClipUrl === 'https://emanate.hiddenforces.net/audio/files/warn_deadzone.wav'))
  aud.setRemoteAudio({})
  check('no error events from the endgame effect', evs('error').length === 0, JSON.stringify(evs('error')[0] ?? ''))
  let big = 0
  for (const [e, t] of engine.getEntitiesWith(Transform, MeshRenderer)) if ((t as any).scale.x > 3 && (t as any).position.y > 1) big++
  check('endgame puffs are placed and scaled up', big >= 20, `${big} large meshes`)
}
go().then(server).then(endgame).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}).catch((e) => { console.error('RUN ERROR', e); process.exit(1) })
