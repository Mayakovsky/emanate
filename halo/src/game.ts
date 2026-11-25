// EMANATE Build 04: the halo's gameplay layer. Keys 1-4 (arrows, plumes), warnings, charging arcs, upgrades.
// With the local game server up, targets come from it. Otherwise TEST MODE: fixed and moving test targets around the spawn.
import { engine, inputSystem, InputAction, PointerEventType, PlayerIdentityData, AvatarBase, Physics, Transform, MeshRenderer, Material, MaterialTransparencyMode, type Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { getUserData } from '~system/UserIdentity'
import { BLAST } from './settings'
import { lookFx, lookData, BlastBubble, Trail, outside } from './lookfx'
import { BLAST_LOOK, planFlash, capsOf } from './look'
import { planBlast, bubbleScale } from './blastplan'
import { skyUpdate, skyText, skyStart } from './sky'
import { openDialog, closeDialog, setDialogClock, dialog } from './dialog'
import { planParticles } from './particleplan'
import { ParticleFx, playLib, Arrows, Plumes, ChargeArcs, DropMarkers, TrapMarkers, BubbleFx, TestMarkers, DistanceMarkers, MARKER_COLOR_NAMES, MARKER_DISTANCES, initSounds, playSlot, playSlotFor, stopSlot, setOnSound, playSound, soundsUpdate, setRemoteAudio, audioStats, slotSource } from './fx'
import { consent, optOut, paused, setPaused, leaseValid, bare, bareFx, grantConsent, doOptOut } from './net'
import { idle, setIdle, refetchSettings, cmdQueue, settingsInfo, refusedNote, emit, netUpdate, sendGameEvent, serverState, serverUp, lastErr, netStatus, lastGameError, manifestUpdate, manifestInfo } from './net'
import { cueKeyFor } from './uiplan'
import { FXS, TICK, LOOK, applyRemote, feature, say, PROTOCOL_VERSION, FINAL_NO_TEST_POWERS } from './settings'
lookData.v = LOOK // c29: the server's `look` section is the effect recipe overrides
import {
  ArrowChannel, PlumeBudget, Warnings, pressRed, pressPink, RULES, TEST_TARGETS, testMovingSynth, testDeadZoneDistance, dist, nearest, type Vec, type Target
} from './logic'

// Scene (local) -> world. The preview scene's base parcel is 0,0, so they are equal there. UNVERIFIED for the equipped wearable:
// the telemetry reports both, and the server compares the halo's position with what the Synth sees.
const ORIGIN = { x: 0, z: 0 }
const toWorld = (p: Vec): Vec => ({ x: p.x + ORIGIN.x, y: p.y, z: p.z + ORIGIN.z })
const toLocal = (p: Vec): Vec => ({ x: p.x - ORIGIN.x, y: p.y, z: p.z - ORIGIN.z })

const arrows = new Arrows()
let hudMsg: { text: string; until: number } | null = null // a HUD line the server asked for
// (c27: the on-screen glider prompt is removed completely)
let wasIdle = false
let pushUntil = 0
let pushForce = { x: 0, y: 0, z: 0 }
const PUSH_SOURCE = engine.addEntity()
const plumes = new Plumes()
const arcs = new ChargeArcs()
const dropMarkers = new DropMarkers()
let markers: TestMarkers | null = null
const trail = new Trail()
const otherTrails: Trail[] = [] // c29e: the trail behind every other launched player (positions from the server, no names)
const markers4 = new DistanceMarkers()
let restoredNote = ''
let restoredUntil = 0
let finalBanner = 0
let idReady = false
const particleFx = new ParticleFx()
let frameMs = 16
let frameMsSum = 0
let frameMsN = 0
let frameMsAvg = 0
const warnings = new Warnings()
const budget = new PlumeBudget()
let clock = 0 // seconds since the halo loaded
let testClock = 0
let myName = 'player'
let myId = 'p-' + Math.random().toString(36).slice(2, 10)
let idTried = false
let posTimer = 0
let testPlumeId = 1
let testBoostUntil = 0 // test mode: a Halo boost applies the moment it is picked up
let testTrap: { pos: Vec; exempt: boolean } | null = null // test mode: the one Discharge Trap this player has down
let testTrapUntil = 0 // test mode: a trap hit keeps the player one level down until then
const trapMarks = new TrapMarkers()
const bubbleFx = new BubbleFx()
let lobbyNote = ''
let testDropsGone = new Map<string, number>() // test drop id -> time it can come back
let testRoundStart = 0
let mode: 'test' | 'server' = 'test'
let lastEventNote = ''
let started = false
const announcedEnd = new Set<string>()

export function gameInit() {
  initSounds()
  started = true
  emit('game-init', { build: '04' })
}

let userDataAsked = false
function identify() {
  if (!userDataAsked) {
    userDataAsked = true
    // the runtime's own identity call: works where getPlayer()/PlayerIdentityData stay empty
    getUserData({})
      .then((r) => {
        if (r && r.data && r.data.userId) {
          myId = r.data.userId
          if (r.data.displayName && myName === 'player') myName = r.data.displayName
          idReady = true
        }
      })
      .catch(() => {})
  }
  if (idReady) return // a stable id was read: nothing more to do (the name can arrive before the address, so keep trying until the address is there)
  idTried = true
  try {
    const p = getPlayer()
    if (p) {
      myId = p.userId || myId
      myName = p.name || myName
      if (p.userId) idReady = true // a stable id (the avatar's address): a reloaded halo is recognised by the server
    }
    if (myName === 'player') {
      const ab = AvatarBase.getOrNull(engine.PlayerEntity)
      if (ab && ab.name) myName = ab.name
    }
    if (!idReady && myName !== 'player' && clock > 3) {
      // no address in this runtime (seen in the local preview): the avatar's name is stable across a reload, so use it (a name is not unique: two
      // unclaimed players with the same name would share a state; the address, when present, always wins)
      myId = 'n:' + myName.replace(/[^A-Za-z0-9_.:@-]/g, '_').slice(0, 40)
      idReady = true
    }
    if (!idReady) {
      // some runtimes fill the identity component before (or without) getPlayer()'s userId
      const ident = PlayerIdentityData.getOrNull(engine.PlayerEntity)
      if (ident && ident.address) {
        myId = ident.address
        idReady = true
      }
    }
  } catch (e) {}
}

// ---- helpers ----
/** c31c: the Synth's place in the scene's local space, for a charge sound (undefined = play it as the player's own) */
function synthLocal(): Vec | undefined { const s = synthPos(); return s ? toLocal(s) : undefined }
function synthPos(): Vec | null {
  if (mode === 'server') {
    const s = serverState?.synth
    if (s?.deadZone) return null // v3: the red arrow has no target while the Synth is inside a mapped dead zone
    return s ? { x: s.x, y: s.y, z: s.z } : null
  }
  return null
}
function testSynths(): Target[] {
  return [
    { id: 'fixed', pos: { ...TEST_TARGETS.synthFixed } },
    { id: 'moving', pos: testMovingSynth(testClock) }
  ]
}
function dropList(): Target[] {
  if (mode === 'server') return (serverState?.drops ?? []).map((d: any) => ({ id: d.id, pos: { x: d.x, y: d.y, z: d.z } }))
  return TEST_TARGETS.drops.filter((d) => (testDropsGone.get(d.id as string) ?? 0) <= testClock).map((d) => ({ id: d.id, pos: { ...d.pos } }))
}

// the power tier: 0 normal, 1 Speed, 2 Jump, 3 Fly. The server decides (round level, a Halo boost, a Discharge Trap hit); offline test mode applies the same rules locally
export function gameTier(base: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  if (mode === 'server' && serverState?.you) return serverState.you.tier as 0 | 1 | 2 | 3
  const boosted = testBoostUntil > testClock ? Math.min(3, base + 1) : base
  return (testTrapUntil > testClock ? Math.max(0, boosted - 1) : boosted) as 0 | 1 | 2 | 3
}
// E: place a Discharge Trap where the player stands (one at a time). The server keeps the trap, every halo draws it; it goes off when the Synth or any
// player (the placer and teammates too) comes within 5 m: everyone in range drops one power level for 10 s.
export function gamePlaceTrap() {
  if (!feature('trap') || !powersAllowed()) return
  if (inputSystem.isPressed(InputAction.IA_WALK)) return // c27: Ctrl+E is the re-throw and Ctrl+Shift+E the pause chord, not a trap
  const world = toWorld(curMe)
  if (mode === 'server') {
    if (serverState?.you?.hasTrap) {
      playSlot('halo.denied')
      note(say('trapDenied'))
      emit('trap', { sent: false, reason: 'one at a time' })
      return
    }
    sendGameEvent({ ev: 'trap' })
    emit('trap', { sent: true, mode })
    playSlot('halo.discharge.set', curMe) // c30d: the quiet zap of placing the trap (c31c: at the trap)
    note(say('trapPlaced'))
    return
  }
  if (testTrap) {
    playSlot('halo.denied')
    note(say('trapDenied'))
    emit('trap', { sent: false, reason: 'one at a time', mode })
    return
  }
  testTrap = { pos: { ...world }, exempt: true }
  emit('trap', { sent: true, mode })
  playSlot('halo.discharge.set', curMe)
  note('Discharge Trap placed (test mode)')
}

function note(s: string) {
  lastEventNote = s
}

export function gameHud(now: number): string {
  const r = arrows.runs
  const cd = (k: 'red' | 'pink' | 'white') => (r[k].ch.active(clock) ? 'ON' : r[k].ch.cooldownLeft(clock) > 0 ? r[k].ch.cooldownLeft(clock).toFixed(0) + 's' : 'ready')
  const left = mode === 'server' ? serverState?.you?.plumesLeft ?? '?' : budget.left
  const boostLeft = mode === 'server' ? serverState?.you?.boostLeft ?? 0 : Math.max(0, testBoostUntil - testClock)
  const trapLeft = mode === 'server' ? serverState?.you?.trapLeft ?? 0 : Math.max(0, testTrapUntil - testClock)
  const hasTrap = mode === 'server' ? !!serverState?.you?.hasTrap : !!testTrap
  const round = mode === 'server' ? `round ${serverState?.match?.round} ${Math.round(serverState?.match?.timeLeft ?? 0)}s` : 'TEST MODE (no server)'
  const ns = netStatus()
  const extra = (clock < restoredUntil ? restoredNote + '\n' : '') + (lobbyNote ? lobbyNote + '\n' : '')
  return `${extra}${manifestInfo}; slots ${audioStats.slots}, packed ${audioStats.packed}, last ${audioStats.lastSlot || '-'} (${audioStats.lastSource || '-'})
frame ${frameMsAvg.toFixed(1)} ms (${(1000 / Math.max(1, frameMsAvg)).toFixed(0)} fps)\nerr: ${lastGameError || 'none'}
id ${myId.slice(0, 12)}${idReady ? '' : ' (not stable)'}
pos local (${curMe.x.toFixed(1)}, ${curMe.y.toFixed(1)}, ${curMe.z.toFixed(1)}) world (${(curMe.x + ORIGIN.x).toFixed(1)}, ${(curMe.z + ORIGIN.z).toFixed(1)})
net ${ns.up ? 'UP' : 'down'} fails=${ns.failCount} ${ns.lastErr}
${skyText}
${round}   keys: ${feature('arrows') ? `1 red ${cd('red')}  2 pink ${cd('pink')}  3 dead-zone ${warnings.deadZoneEnabled ? 'ON' : 'off'} ${cd('white')}  ` : ''}4 plumes ${left}   E trap ${hasTrap ? 'DOWN' : 'ready'}   boost ${boostLeft > 0 ? boostLeft.toFixed(0) + 's' : '-'}${trapLeft > 0 ? '   TRAPPED ' + trapLeft.toFixed(0) + 's' : ''}   ${lastEventNote}`
}


// ---- c26 (gate B): the wearer's own consent, the lease, the opt-out ----
// Join: inside the lobby bubble, HOLD E for 1.5 s. Pause/leave: HOLD Ctrl + Shift + E, any time: paused at once, permanent after 3 s. Both are read here from the wearer's own keys; no server value, setting or command can set or clear them.
let joinHold = 0
let rethrowHold = 0
let rethrowReady = 0 // clock time after which the next re-throw is allowed
let optHold = 0
let wasInside = false
/** may powers and forces run right now? The opt-out always wins; a joined wearer needs a live lease; a wearer who never joined only gets the dev test mode (server unreachable), and only while FINAL_NO_TEST_POWERS is off. */
export function powersAllowed(): boolean {
  if (optOut || paused) return false
  if (consent) return leaseValid()
  return !FINAL_NO_TEST_POWERS && !serverUp()
}
/** consent + a live lease: what push, lift and teleport need (and a running match, checked by the caller) */
const joinedAndLeased = () => consent && !optOut && !paused && leaseValid()
const matchState = (): string => (mode === 'server' ? String(serverState?.match?.state ?? '') : '')
let gateDbg = ''
export const gateInfo = () => gateDbg
function gateUpdate(dt: number, world: Vec) {
  const ctrl = inputSystem.isPressed(InputAction.IA_WALK)
  const shift = inputSystem.isPressed(InputAction.IA_MODIFIER)
  const e = inputSystem.isPressed(InputAction.IA_PRIMARY)
  if (!optOut) {
    if (ctrl && shift && e) { setPaused(true); optHold += dt; if (optHold >= 3) { doOptOut(); note('Ghostcode is off. Take the halo off and put it on again to start again.') } } else { optHold = 0; if (paused) setPaused(false) } // c26: held = paused at once; released before 3 s = resumes (if consent and the lease still hold); 3 s = permanent
  }
  // c27 (Directive M): the wearer's own re-throw: HOLD Ctrl + E for 1.5 s, only joined + leased + a running match, with a cooldown; no server value can fire it
  if (!optOut && !paused && ctrl && !shift && e && joinedAndLeased() && matchState() === 'playing') {
    rethrowHold += dt
    if (rethrowHold >= 1.5 && clock >= rethrowReady) { rethrowHold = 0; rethrowReady = clock + Math.max(1, BLAST.rethrowCooldown); startBlast({ ...(lastBlastCmd ?? {}), centre: lastBlastCmd?.centre ?? 'self', seed: Math.floor(Math.random() * 4294967295), rethrow: true }) }
  } else rethrowHold = 0
  if (optOut || consent) { joinHold = 0; return }
  const b = bare.bubble
  const inP = !!portal && Math.hypot(world.x - toWorld(portal.at).x, world.z - toWorld(portal.at).z) <= portal.radius
  const rp = bareFx.replay // c30: a wearer who never joined holds E inside a replay portal to join (a joined wearer needs nothing: standing in a portal is their pick)
  const inRp = !!rp && [rp.hunters, rp.helpers].some((q) => Math.hypot(world.x - q.x, world.z - q.z) <= Math.max(3, rp.radius))
  const inside = (!!b && Math.hypot(world.x - b.x, world.z - b.z) <= b.radius) || inP || inRp
  gateDbg = 'world ' + world.x.toFixed(0) + ',' + world.z.toFixed(0) + (b ? '  bubble ' + b.x.toFixed(0) + ',' + b.z.toFixed(0) + ' dist ' + Math.hypot(world.x - b.x, world.z - b.z).toFixed(0) + '/' + b.radius : '  no bubble') + '  E-hold ' + joinHold.toFixed(1) + (inside ? '  INSIDE' : '')
  if (inside && !wasInside) note(say('joinPrompt'))
  wasInside = inside
  if (inside && e && !ctrl && !shift) { joinHold += dt; if (joinHold >= 1.5) { grantConsent(); playSlot('lobby.join'); if (inP || inRp) emit('joinCall', {}); joinHold = 0; note('You joined. Hold Ctrl + Shift + E to pause; hold it 3 seconds to leave.') } } else joinHold = 0
}

// ---- the per-frame update; me = the wearer's scene-local position ----
export function gameUpdate(dt: number, me: Vec, speed: number, airborne: boolean, tier: number, vy: number) {
  if (!started) return
  clock += dt
  gateUpdate(dt, toWorld(me))
  mode = serverUp() ? 'server' : 'test' // c27: kept current even while gated (a stale 'test' made the panel claim TEST MODE)
  const gated = idle || optOut || paused || (!consent && (FINAL_NO_TEST_POWERS || serverUp())) // c26: before consent the Halo only does the bare check (the dev test mode, server unreachable and flag off, is the one exception)
  if (gated) {
    // the server's kill switch (or a refusal): nothing is drawn, nothing is forced, nothing is sent about the player
    if (!wasIdle) { wasIdle = true; hideAll(); emit('idle', { on: true }) }
    netUpdate(dt, { pid: myId, name: myName, pos: toWorld(me), local: me, speed, tier }) // only the bare wake-up poll runs while idle
    if (!idle && !optOut && !paused) { lookFx.update(clock, me); bareFxUpdate(toWorld(me), me); blastLookUpdate() } else clearBareFx() // c30: lookFx.update also here: the call portal's colour cycle and the replay portals' lifetimes run for a wearer who has not joined
    return
  }
  if (wasIdle) { wasIdle = false; emit('idle', { on: false }) }
  while (cmdQueue.length) { try { runCommand(cmdQueue.shift()!) } catch (e) { emit('error', { where: 'command', msg: String(e) }) } }
  if (pushUntil > clock && joinedAndLeased()) Physics.applyForceToPlayer(PUSH_SOURCE, Vector3.create(pushForce.x, pushForce.y, pushForce.z))
  else if (pushUntil !== 0) { pushUntil = 0; Physics.removeForceFromPlayer(PUSH_SOURCE) }
  if (lg && lg.phase !== 'done' && !joinedAndLeased()) { Physics.removeForceFromPlayer(LIFT_SOURCE); lg = null } // c26: no consent or no lease: no lift
  const wasServer = mode === 'server'
  mode = serverUp() ? 'server' : 'test'
  if ((mode === 'server') !== wasServer) emit('mode', { mode, err: lastErr })
  testClock += dt
  identify()
  const world = toWorld(me)

  // ---- server sync ----
  if (idReady || clock > 4) netUpdate(dt, { pid: myId, name: myName, pos: world, local: me, speed, tier })
  if (mode === 'server' && serverState) for (const ev of serverState.events ?? []) handleServerEvent(ev)
  if (serverState) serverState.events = []

  // ---- test mode world ----
  if (mode === 'test') {
    if (!markers) markers = new TestMarkers()
    const mv = testMovingSynth(testClock)
    markers.update(TEST_TARGETS.synthFixed, mv, TEST_TARGETS.deadZoneX, me.y)
    // a test round: plumes refill every 120 s so every key can be reviewed again
    if (testClock - testRoundStart > 120) {
      testRoundStart = testClock
      budget.refill()
      emit('test-round', { plumes: budget.left })
    }
    for (const d of TEST_TARGETS.drops) {
      const gone = testDropsGone.get(d.id as string) ?? 0
      if (gone <= testClock && Math.hypot(world.x - d.pos.x, world.z - d.pos.z) <= RULES.pickupRadius) {
        testDropsGone.set(d.id as string, testClock + 30)
        testBoostUntil = testClock + RULES.boostSeconds // a Halo boost applies the moment it is picked up
        playSlot('halo.upgrade_pickup', curMe)
        boostSound(RULES.boostSeconds)
        emit('pickup', { id: d.id, mode })
        note('Halo boost: ' + RULES.boostSeconds + ' s')
      }
    }
    // demo of the automatic endgame arrows (purple, then yellow), toward the fixed Synth point, so they can be reviewed
    const cyc = testClock % 240
    const demo = (name: 'purple' | 'yellow', at: number) => {
      const key = name + Math.floor(testClock / 240)
      if (cyc >= at && cyc < at + 1 && !announcedEnd.has(key)) {
        announcedEnd.add(key)
        startAuto(name, () => ({ ...TEST_TARGETS.synthFixed }), 'endgame-demo')
      }
    }
    demo('purple', 90)
    demo('yellow', 180)
  } else if (markers) {
    // hide the test markers when the server takes over
    markers.update({ x: 0, y: -999, z: 0 }, { x: 0, y: -999, z: 0 }, -999, -999)
  }

  // ---- keys ----
  const pressed = (a: InputAction) => inputSystem.isTriggered(a, PointerEventType.PET_DOWN)
  const ctrl = inputSystem.isPressed(InputAction.IA_WALK) // Ctrl (Walk): held, so no plain key fires
  const shiftOnly = inputSystem.isPressed(InputAction.IA_MODIFIER) && !ctrl // Shift (the client's Sprint/modifier key) + 1..4: the round-8 test triggers
  const shift = shiftOnly || ctrl
  const pressedKey = (a: InputAction) => !shift && pressed(a)
  if (shiftOnly) shiftKeys(pressed)
  if (pressedKey(InputAction.IA_ACTION_3) && !inputSystem.isPressed(InputAction.IA_SECONDARY)) keyRed(world)
  if (pressedKey(InputAction.IA_ACTION_3) && inputSystem.isPressed(InputAction.IA_SECONDARY) && mode === 'test') {
    // F held + 1: the distance render test (see the report): columns at 10, 20, 35, 60, 120, 300, 600 m in four directions
    if (markers4.placed) {
      markers4.clear()
      note('distance markers removed')
    } else {
      markers4.place(me)
      note('DISTANCE TEST: ' + MARKER_DISTANCES.map((d, i) => d + 'm=' + MARKER_COLOR_NAMES[i]).join(' '))
    }
    emit('distance-markers', { placed: markers4.placed })
  }
  if (pressedKey(InputAction.IA_ACTION_4)) {
    if (false) {
    } else keyPink(world)
  }
  if (pressedKey(InputAction.IA_ACTION_5)) keyDeadZone()
  if (pressedKey(InputAction.IA_ACTION_6)) keyPlume(world)

  // ---- warnings (automatic) ----
  const dz = mode === 'server' ? serverState?.deadzone ?? null : testDeadZoneDistance(world)
  const dzDist: number | null = dz ? dz.dist : null
  if (feature('deadzoneWarn') && warnings.deadZone(arrows.runs.white.ch, clock, speed, dzDist)) { // c31: the warning (voice + note) runs with the arrows off; only the white arrow needs them
    if (feature('arrows')) arrows.runs.white.target = () => {
      const q = mode === 'server' ? serverState?.deadzone : testDeadZoneDistance(toWorld(curMe))
      if (!q) return null
      return mode === 'server' ? { x: world.x + q.dx, y: world.y, z: world.z + q.dz } : q.at
    }
    if (feature('arrows')) arrows.runs.white.mode = 'arrow'
    playSlot('warn.deadzone')
    emit('warning', { kind: 'dead-zone', dist: dzDist, speed, triggerAt: Math.max(RULES.deadZoneBaseMetres, speed * RULES.deadZoneSeconds) })
    note('WARNING: approaching dead zone')
  }
  const drops = dropList()
  const up = warnings.upgradeNearby(arrows.runs.pink.ch, clock, world, drops) // c31: the upgrade warning (voice + note) runs with the arrows off; only the pink arrow needs them
  if (up) {
    if (feature('arrows')) { arrows.runs.pink.target = () => livePos(up); arrows.runs.pink.mode = 'arrow' }
    playSlot('warn.upgrade')
    emit('warning', { kind: 'upgrade-nearby', id: up.id, dist: dist(world, up.pos) })
    note('WARNING: upgrade available')
  }
  // ---- draw ----
  curMe = me
  // lead the avatar by a few frames of its own velocity so the chevrons cannot trail it at speed (the Build 03 dots flickered)
  if (dt > 0 && prevMe) {
    const k = Math.min(1, dt * 12)
    velSmooth = { x: velSmooth.x + ((me.x - prevMe.x) / dt - velSmooth.x) * k, y: 0, z: velSmooth.z + ((me.z - prevMe.z) / dt - velSmooth.z) * k }
    if (Math.hypot(velSmooth.x, velSmooth.z) > 120) velSmooth = { x: 0, y: 0, z: 0 } // teleport
  }
  prevMe = { x: me.x, y: me.y, z: me.z }
  arrows.update(dt, clock, { x: me.x + velSmooth.x * 0.05, y: me.y, z: me.z + velSmooth.z * 0.05 }) // arrows are drawn in scene-local space at the feet
  lookFx.warm(clock)
  lookFx.update(clock, me) // c30: also moves the following effects (the Aurora) with the wearer, switches windowed emitters, runs the PP3 colour cycle
  if (!feature('particles')) { particleFx.clear(); lookFx.clear() } else particleFx.update(clock)
  syncPlumes(me)
  syncTraps(me, world)
  syncBubble(dt, me, world)
  liftGlideUpdate(dt, me, world, vy, airborne)
  blastUpdate(world, vy, airborne)
  { // E13 trails: 2 emitters each, the FIRST thing to lose emitters when the Halo is over its cap (the blast bubble and the upgrade drops keep theirs)
    trailRoom = Math.max(0, Math.floor((capsOf(lookData.v).emitters - lookFx.emitterCount - bubbleEmitters()) / 2))
    const own = blastActive() && feature('particles') && trailRoom > 0
    if (own) trailRoom--
    trail.update(me, own)
  }
  blastLookUpdate()
  bareFxUpdate(world, me)
  otherTrailsUpdate(world)
  lastAirborne = airborne
  teleportCheck()
  dropMarkers.update(clock, world, drops.map((d) => ({ id: d.id!, pos: toLocal(d.pos) })).map((d) => ({ id: d.id, pos: d.pos })))
  const sp = synthPos() ?? nearest(world, testSynths())?.target.pos ?? null
  if (contactFx && clock >= contactFx.until) contactFx = null
  // charging effect: within 5 m of the Synth, or for 1.5 s after the server reports a contact there (a contact can end the round at once)
  arcs.update(dt, world, contactFx ? contactFx.pos : sp, contactFx ? contactFx.stage : mode === 'server' ? serverState?.synth?.stage ?? 'free' : 'free', clock)
  if ((sp && dist(world, sp) <= RULES.chargeRadius) || contactFx) {
    if (!charging) {
      charging = true
      playSlot('charge.contact', toLocal(contactFx ? contactFx.pos : sp!)) // c31c: at the Synth
      emit('charging', { d: sp ? dist(world, sp) : null, stage: mode === 'server' ? serverState?.synth?.stage : 'test' })
    }
  } else { if (charging) for (const id of CHARGE_SLOTS) stopSlot(id); charging = false } // c31d (Forces): no charge sound outlasts the arcs: they stop the moment the arcs go
  frameUpdate(dt)
  manifestUpdate(dt, setRemoteAudio)
  setDialogClock(clock)
  dialogSync()
  boostSoundUpdate(mode === 'server' ? serverState?.you?.boostLeft ?? 0 : Math.max(0, testBoostUntil - testClock))
  soundsUpdate()
  skyUpdate(clock, mode === 'test')

  // ---- telemetry: position, tier, cooldown state ----
  posTimer += dt
  if (posTimer >= 1) {
    posTimer = 0
    emit('pos', { pos: world, local: me, speed, vy, tier, airborne, mode, cd: { red: arrows.runs.red.ch.cooldownLeft(clock), pink: arrows.runs.pink.ch.cooldownLeft(clock), white: arrows.runs.white.ch.cooldownLeft(clock) }, plumesLeft: mode === 'server' ? serverState?.you?.plumesLeft : budget.left })
  }
}
let curMe: Vec = { x: 0, y: 0, z: 0 }
let lastAirborne = false
let prevMe: Vec | null = null
let velSmooth: Vec = { x: 0, y: 0, z: 0 }
let charging = false
// c31e (Forces, option 3): the boost = a 3 s ignition burst once, plus a quiet loop under the whole boost that stops exactly when the boost ends (the wearer's own: not spatial)
let boostLoopOn = false, boostLoopFrom = 0
function boostSound(seconds: number) { playSlot('halo.boost_on'); playSlotFor('halo.boost.loop', seconds); boostLoopOn = true; boostLoopFrom = clock }
function boostSoundUpdate(boostLeft: number) { if (boostLoopOn && clock - boostLoopFrom > 1.5 && boostLeft <= 0) { stopSlot('halo.boost.loop'); boostLoopOn = false } } // the boost ended early (or the timer drifted): the loop goes with it
const CHARGE_SLOTS = ['charge.contact', 'charge.reset', 'charge.repair', 'charge.upgrade', 'charge.failed', 'charge.broken'] // c31d: the sounds that belong to the arcs
let contactFx: { pos: Vec; until: number; stage: string } | null = null

function livePos(t: Target): Vec | null {
  const l = dropList().find((d) => d.id === t.id)
  return l ? toLocal(l.pos) : toLocal(t.pos)
}

// start an automatic arrow on a channel (used by the demo and the endgame)
function startAuto(kind: 'purple' | 'yellow', target: () => Vec | null, source: string) {
  const r = arrows.runs[kind]
  if (r.ch.start(clock, 'warning') !== 'started') return
  r.target = () => {
    const t = target()
    return t ? toLocal(t) : null
  }
  r.mode = 'arrow'
  emit('arrow', { kind, source })
}

// ---- keys ----
function keyRed(world: Vec) {
  if (!feature('arrows')) return
  const r = arrows.runs.red
  const syn = mode === 'server' ? synthPos() : nearest(world, testSynths())?.target.pos ?? null
  const res = pressRed(r.ch, clock, world, syn)
  emit('arrow', { kind: 'red', key: 1, result: res.kind, d: 'd' in res ? res.d : null, cooldownLeft: r.ch.cooldownLeft(clock) })
  if (res.kind === 'arrow') {
    r.mode = 'arrow'
    r.target = () => {
      const s = mode === 'server' ? synthPos() : nearest(toWorld(curMe), testSynths())?.target.pos ?? null
      return s ? toLocal(s) : null
    }
    note(`red arrow: Synth ${Math.round(res.d)} m`)
  } else if (res.kind === 'overloaded') {
    // inside 100 m the halo is overloaded: a sputter / failed animation instead of an arrow
    r.mode = 'sputter'
    r.sputterUntil = clock + 1.6
    r.target = () => {
      const s = mode === 'server' ? synthPos() : nearest(toWorld(curMe), testSynths())?.target.pos ?? null
      return s ? toLocal(s) : null
    }
    playSlot('halo.arrow_overload')
    note(`halo OVERLOADED (Synth ${Math.round(res.d)} m, inside 100 m)`)
  } else {
    playSlot('halo.denied')
    note(res.kind === 'cooldown' ? 'red: cooling down' : 'red: no Synth known')
  }
}
function keyPink(world: Vec) {
  if (!feature('arrows')) return
  const r = arrows.runs.pink
  const res = pressPink(r.ch, clock, world, dropList())
  emit('arrow', { kind: 'pink', key: 2, result: res.kind, d: 'd' in res ? res.d : null, cooldownLeft: r.ch.cooldownLeft(clock) })
  if (res.kind === 'arrow') {
    r.mode = 'arrow'
    const id = res.id
    r.target = () => {
      const l = dropList().find((d) => d.id === id)
      return l ? toLocal(l.pos) : null
    }
    note(`pink arrow: upgrade ${Math.round(res.d)} m`)
  } else {
    playSlot('halo.denied')
    note(res.kind === 'cooldown' ? 'pink: cooling down' : 'pink: no upgrade within 80 m')
  }
}
function keyDeadZone() {
  if (!feature('deadzoneWarn') || !feature('arrows')) return // c30f: key 3 does nothing while the arrows are off (its warning rides on the white arrow)
  const on = warnings.toggleDeadZone()
  emit('dead-zone-warnings', { on })
  note(`dead-zone warnings ${on ? 'ON' : 'OFF'}`)
  playSlot(on ? 'halo.warnings_on' : 'halo.warnings_off')
}
function keyPlume(world: Vec) {
  if (!feature('plumes')) return
  const have = mode === 'server' ? (serverState?.you?.plumesLeft ?? 0) > 0 : budget.left > 0
  if (!have) {
    emit('plume', { sent: false, reason: 'none left' })
    playSlot('halo.denied')
    note(say('noPlumes'))
    return
  }
  if (mode === 'test') budget.use()
  else if (serverState?.you) serverState.you.plumesLeft--
  sendGameEvent({ ev: 'plume', pos: world })
  const id = mode === 'server' ? 'own-' + Math.floor(clock * 100) : testPlumeId++
  ownPlumes.set(id, { base: world, born: clock })
  plumes.spawn(id, toLocal(world), 0, clock)
  playSlot('halo.plume', toLocal(world)) // c31c: at the flare
  emit('plume', { sent: true, pos: world, mode })
  note(say('plumeSent'))
}
const ownPlumes = new Map<number | string, { base: Vec; born: number }>()

// the Discharge Traps every player can see: the server's list (or the one local test trap offline); a test trap goes off when the player comes back within 5 m after stepping out
function syncTraps(me: Vec, world: Vec) {
  if (mode === 'server' && serverState) {
    trapMarks.update(clock, (serverState.traps ?? []).map((t: any) => ({ id: t.id, pos: toLocal({ x: t.x, y: t.y, z: t.z }), mine: !!t.mine })))
    return
  }
  if (testTrap) {
    const d = Math.hypot(world.x - testTrap.pos.x, world.z - testTrap.pos.z)
    if (testTrap.exempt && d > RULES.trapRadius) testTrap.exempt = false
    else if (!testTrap.exempt && d <= RULES.trapRadius) {
      testTrapUntil = testClock + RULES.trapSeconds
      testTrap = null
      note('Discharge Trap hit you: one level down for ' + RULES.trapSeconds + ' s')
      emit('trap-hit', { mode, self: true })
      playSlot('halo.discharge.trigger', curMe)
    }
  }
  trapMarks.update(clock, testTrap ? [{ id: 'test', pos: toLocal(testTrap.pos), mine: true }] : [])
}

// ---- the lobby bubble ----
let lastBubble: { at: Vec; radius: number } | null = null
function syncBubble(dt: number, me: Vec, world: Vec) {
  if (!feature('bubbleFx')) { bubbleFx.hide(); return }
  let shown = false
  if (mode === 'server' && serverState?.bubble) {
    const b = serverState.bubble
    const at = toLocal({ x: b.x, y: b.y, z: b.z })
    lastBubble = { at, radius: b.radius }
    bubbleFx.show(clock, at, b.radius, !!b.you)
    lobbyNote = `LOBBY: ${b.inside} inside, ${Math.ceil(b.leftMs / 1000)} s left${b.you ? ' (you are in)' : ' (step into the bubble)'}`
    shown = true
  }
  if (!shown) { bubbleFx.hide(); if (lobbyNote.startsWith('LOBBY:')) lobbyNote = '' } // c30d: the lobby line goes with the bubble (it lingered into round 1)
}

// ---- trace reports: each goes to the console log and (with the server up) to the server's log ----
setOnSound((id, on) => traceReport('snd', { id, on, t: Math.round(clock * 100) / 100, boostLeft: Math.round((serverState?.you?.boostLeft ?? -1) * 100) / 100 })) // c31e: the ear-free check of the boost sounds (test builds only: traceReport sends nothing in the final)
function traceReport(what: string, data: Record<string, unknown>) {
  emit('trace', { what, ...data })
  // Directive Y item 5: the trace upload is test-only diagnostics (the server's halo-probes file); the final build (FINAL_NO_TEST_POWERS on) never sends it
  if (mode === 'server' && !FINAL_NO_TEST_POWERS) sendGameEvent({ ev: 'trace', what, text: JSON.stringify(data).slice(0, 380) })
  console.log('[halo] ' + what + ' ' + JSON.stringify(data))
}

// ---- c27: the blast ("Hand of God"): joined players are thrown into the sky on a random trajectory and fall; the planned ballistic landing is inside BLAST.radius of the centre ----
const BLAST_SOURCE = engine.addEntity()
interface Blast { phase: 'launch' | 'cruise' | 'coast'; elev: number; burst: number; fv: Vec; steer: number; t0: number; vUp: number; vh: number; dir: Vec; land: Vec; start: Vec; centre: Vec; apexPlanned: number; flightPlanned: number; maxY: number; apexAt: number; sawApex: boolean; wasAir: number; seed: number }
let bl: Blast | null = null
let flashUntil = 0
let lastBlastCmd: any = null
let blastBub: { t0: number; at: Vec } | null = null // the wearer's own blast (the others are in bubs)
interface Bub { b: BlastBubble; t0: number; at: Vec }
const bubs: Bub[] = []
const seenBlasts = new Set<string>()
let lastCallSeq = 0, callCooldownUntil = 0
let portal: { at: Vec; until: number; radius: number } | null = null
/** c27 (Directive M): the blast's look = a crack (slot blast.crack), one short white flash, and the red fiery bubble that grows from the launch point (67 % opaque, soft ease) and fades; nothing else */
function blastLook(at: Vec) {
  playSlot('blast.crack', at) // c31c (Directive AA 1, 4): the 8 s crack at the launch point, played out in full (no stop)
  flashUntil = clock + BLAST.flashSeconds
  blastBub = { t0: clock, at: { ...at } }
  spawnBub(at, clock)
  emit('blast', {})
  if (feature('blastBurst')) lookFx.effect('E6', at, clock, { r: lastBubble?.radius }, undefined) // c30b: the burst is scaled to the bubble (R to 1.5 R in 1.5 s; the recipe clamps R to 15 m) // c29e: E6 (the lobby burst) plays with EVERY blast; two recipes, one trigger; the feature blastBurst switches the pairing off
  lookFx.spawn(planFlash(lookData.v), at, clock) // the white glow flash (0.25 s)
}
function spawnBub(at: Vec, t0: number) { bubs.push({ b: new BlastBubble(t0, at), t0, at: { ...at } }) }
function blastLookUpdate() {
  const E = Math.max(0.2, BLAST.bubbleSeconds), H = Math.max(0, BLAST.bubbleHold), I = Math.max(0.2, BLAST.bubbleImplode)
  if (blastBub && clock - blastBub.t0 > E + H + I) blastBub = null
  for (let i = bubs.length - 1; i >= 0; i--) {
    const b = bubs[i]!
    const k = bubbleScale(clock - b.t0, E, H, I)
    if (k <= 0 && clock - b.t0 > 0.1) { b.b.destroy(); bubs.splice(i, 1); continue }
    b.b.update(Math.max(0.05, BLAST_LOOK.radius * k), BLAST_LOOK.radius) // E13: fixed particle size, the emitter count follows the radius
  }
}
/** c27 (Directive N): what every Halo can see without sending anything: other wearers' blast bubbles (from the server's list of recent launches) and the call: a red portal near a far wearer, who answers by stepping in and holding E */
function bareFxUpdate(world: Vec, me: Vec) {
  const dur = BLAST.bubbleSeconds + BLAST.bubbleHold + BLAST.bubbleImplode
  for (const b of bareFx.blasts) {
    if (b.age >= dur) continue
    const key = Math.round(b.x) + ',' + Math.round(b.z) + ',' + Math.round(clock - b.age)
    if ([...seenBlasts].some((k) => { const q = k.split(','); return Math.hypot(+q[0]! - b.x, +q[1]! - b.z) < 6 && Math.abs(+q[2]! - (clock - b.age)) < 3 })) continue
    if (blastBub && Math.hypot(toWorld(blastBub.at).x - b.x, toWorld(blastBub.at).z - b.z) < 6 && Math.abs(blastBub.t0 - (clock - b.age)) < 3) continue // my own launch, already drawn
    seenBlasts.add(key); if (seenBlasts.size > 80) seenBlasts.delete(seenBlasts.values().next().value as string)
    if (Math.hypot(world.x - b.x, world.z - b.z) > BLAST.callRange) continue // only wearers in range
    spawnBub(toLocal({ x: b.x, y: b.y, z: b.z }), clock - b.age)
  }
  const c = bareFx.call
  if (c && feature('calls') && !consent && c.seq !== lastCallSeq && clock >= callCooldownUntil && !portal) {
    lastCallSeq = c.seq
    const far = Math.hypot(world.x - c.x, world.z - c.z)
    if ((far > c.far || feature('callNear')) && far < BLAST.callRange * 20) { // callNear: a test flag (default off): show the portal to a wearer inside the near zone too // only wearers outside the near zone; they get the portal 10 m ahead of them
      callCooldownUntil = clock + BLAST.callCooldown
      const t = Transform.getOrNull(engine.PlayerEntity)
      const f = t ? Vector3.rotate(Vector3.Forward(), t.rotation) : Vector3.Forward()
      const at = { x: me.x + f.x * 10, y: me.y, z: me.z + f.z * 10 }
      portal = { at, until: clock + Math.min(c.left, 60), radius: c.radius }
      lookFx.effect('E14', at, clock, { seconds: Math.min(c.left, 60) }, 'call') // E14: the rift oval, a smoke column, red at 67 %
      note(say('callPrompt'))
    }
  }
  if (portal && (clock > portal.until || consent)) { lookFx.remove('call'); portal = null }
  // c30: the two replay portals (PP2: hunters dark purple, helpers golden), side by side, while the countdown runs
  const rp = bareFx.replay
  replayTick(rp ? rp.left : null)
  if (rp && feature('particles')) {
    if (!lookFx.has('rp-h')) lookFx.effect('E11', toLocal(rp.hunters), clock, { seconds: rp.left + 1, winner: 'hunters' }, 'rp-h')
    if (!lookFx.has('rp-g')) lookFx.effect('E11', toLocal(rp.helpers), clock, { seconds: rp.left + 1, winner: 'helpers' }, 'rp-g')
  } else if (lookFx.has('rp-h') || lookFx.has('rp-g')) { lookFx.remove('rp-h'); lookFx.remove('rp-g') }
}
// c30d: replay.tick is ONE recording (Forces): played once when the replay countdown starts, stopped when the replay portals close
let replayOn = false
function replayTick(left: number | null) {
  if (left === null) { if (replayOn) { replayOn = false; stopSlot('replay.tick') } return }
  if (!replayOn) { replayOn = true; playSlotFor('replay.tick', left + 1) }
}
let trailRoom = 0
const bubbleEmitters = () => bubs.reduce((a, b) => a + b.b.n, 0)
outside.emitters = () => bubbleEmitters() + (trail.live ? 2 : 0) + otherTrails.reduce((a, t) => a + (t.live ? 2 : 0), 0)
function otherTrailsUpdate(world: Vec) {
  const live = feature('particles') ? bareFx.trails.filter((t) => Math.hypot(t.x - world.x, t.z - world.z) > 8).slice(0, trailRoom) : [] // my own trail is drawn locally
  while (otherTrails.length < Math.min(12, live.length)) otherTrails.push(new Trail())
  for (let i = 0; i < otherTrails.length; i++) { const t = live[i]; otherTrails[i]!.update(t ? toLocal(t) : { x: 0, y: -100, z: 0 }, !!t) }
}
function clearBareFx() {
  for (const b of bubs) b.b.destroy()
  bubs.length = 0
  lookFx.remove('call'); portal = null; lookFx.remove('rp-h'); lookFx.remove('rp-g')
  for (const t of otherTrails) t.clear(); otherTrails.length = 0
}
export const blastActive = () => bl !== null
function startBlast(c: any) {
  if (!c.rethrow) lastBlastCmd = { centre: c.centre, cx: c.cx, cz: c.cz, radius: c.radius, scale: c.scale, speed: c.speed, elev: undefined }
  if (!joinedAndLeased() || matchState() !== 'playing') return
  if (bl) { Physics.removeForceFromPlayer(BLAST_SOURCE); bl = null }
  const w = toWorld(curMe)
  const centre = c.centre === 'self' || c.cx === undefined ? w : { x: num(c.cx, w.x), y: 0, z: num(c.cz, w.z) }
  const radius = Math.max(1, Math.min(2000, num(c.radius, BLAST.radius)))
  const seed0 = Math.floor(num(c.seed, Math.random() * 4294967295))
  const seed = c.mix ? (seed0 ^ Math.floor(Math.random() * 4294967295)) >>> 0 : seed0 >>> 0 // an event for everyone carries ONE seed: each wearer mixes in their own luck so every wearer flies a different path; an admin test command keeps the exact seed
  const p = planBlast(w, centre, radius, seed, BLAST, Math.max(0.1, Math.min(4, num(c.scale, BLAST.scale))))
  bl = { phase: 'launch', elev: 0, burst: 0, fv: { x: 0, y: 0, z: 0 }, steer: 0, t0: clock, vUp: p.vUp, vh: p.vh, dir: p.dir, land: p.land, start: w, centre, apexPlanned: p.apex, flightPlanned: p.flight, maxY: w.y, apexAt: 0, sawApex: false, wasAir: 0, seed }
  if (BLAST.cannon >= 1) { // c27 (Directive L): a cannonball. ONE impulse at the start (near top speed), then nothing: the game's own gravity brings the wearer down. The elevation comes from the planned distance (range = rangeA x cos(elev)^rangeK), or c.elev / c.az (degrees) for a calibration shot.
    const S = Math.max(1, Math.min(300, num(c.speed, BLAST.speed)))
    let elev = 0, dirx = p.dir.x, dirz = p.dir.z, vertOnly = false
    if (typeof c.elev === 'number' && Number.isFinite(c.elev)) { elev = Math.max(1, Math.min(89.5, c.elev)); const az = (num(c.az, 0) * Math.PI) / 180; dirx = Math.cos(az); dirz = Math.sin(az) }
    else { elev = 90; vertOnly = true }
    const er = (elev * Math.PI) / 180
    const vxz = vertOnly ? 0 : S * Math.cos(er), vyy = vertOnly ? Math.min(BLAST.vyMax, Math.sqrt(2 * BLAST.riseGravity * p.apex)) : S * Math.sin(er) // apex target -> launch speed (the client's rise gravity is about 40); the planned apex is inside the coded ceiling
    bl.phase = 'coast'; bl.elev = elev; bl.vUp = vyy; bl.vh = vxz; bl.dir = { x: dirx, y: 0, z: dirz }
    const G = Math.max(0.1, Math.min(2000, num(c.gain, BLAST.gain))); const B = Math.max(0.05, Math.min(3, num(c.burst, BLAST.burst))) // the client clips an impulse to about 28 m/s: the launch is a short burst of force instead
    bl.steer = Math.max(0, Math.min(60, num(c.steer, BLAST.steer)))
    bl.burst = B; bl.fv = { x: (dirx * vxz * G) / B, y: (vyy * G) / B, z: (dirz * vxz * G) / B }
    blastLook(toLocal(w))
    traceReport('blast', { cannon: true, gain: +G.toFixed(2), burst: B, seed, speed: +S.toFixed(1), elev: +elev.toFixed(1), az: +((Math.atan2(dirz, dirx) * 180) / Math.PI).toFixed(1), vxz: +vxz.toFixed(1), vy: +vyy.toFixed(1), start: w, planned: p.land, dist: +p.dist.toFixed(0) })
    return
  }
  blastLook(toLocal(w))
  traceReport('blast', { start: w, centre, radius, seed, planned: p.land, dist: +p.dist.toFixed(0), apex: +p.apex.toFixed(0), vUp: +p.vUp.toFixed(1), vh: +p.vh.toFixed(1), flight: +p.flight.toFixed(1) })
}
function blastEnd(why: string, world: Vec) {
  const s = bl; if (!s) return
  Physics.removeForceFromPlayer(BLAST_SOURCE); bl = null
  emit('blast-end', {}) // c29e: tells the server the launch is over (it stops sending this player's trail position)
  traceReport('blast', { end: why, seed: s.seed, planned: s.land, landed: { x: +world.x.toFixed(1), y: +world.y.toFixed(1), z: +world.z.toFixed(1) }, errPlanned: +Math.hypot(world.x - s.land.x, world.z - s.land.z).toFixed(1), fromCentre: +Math.hypot(world.x - s.centre.x, world.z - s.centre.z).toFixed(1), apexReached: +(s.maxY - s.start.y).toFixed(1), apexPlanned: +s.apexPlanned.toFixed(1), flightSeconds: +(clock - s.t0).toFixed(1), flightPlanned: +s.flightPlanned.toFixed(1), vUp: +s.vUp.toFixed(1), vh: +s.vh.toFixed(1) })
}
function blastUpdate(world: Vec, vy: number, airborne: boolean) {
  const s = bl; if (!s) return
  if (!joinedAndLeased()) { blastEnd('no-lease', world); return }
  const age = clock - s.t0
  s.maxY = Math.max(s.maxY, world.y)
  if (s.phase === 'coast') { // the cannonball
    if (age < s.burst) Physics.applyForceToPlayer(BLAST_SOURCE, Vector3.create(s.fv.x, s.fv.y, s.fv.z)); else if (s.burst > 0) { s.burst = 0; Physics.removeForceFromPlayer(BLAST_SOURCE) } // the launch burst, then no forces at all; log the real launch speed, mark the apex, end on landing
    if (s.steer > 0 && age >= s.burst) { // c27 (approved by Desktop): a gentle horizontal force toward the planned landing point: capped, eased out over the last metres, off at touchdown; NO vertical help, NO brake
      const rx = s.land.x - world.x, rz = s.land.z - world.z, rd = Math.hypot(rx, rz)
      const h = Math.max(0, world.y - s.start.y)
      const trem = vy > 0 ? vy / BLAST.riseGravity + Math.sqrt(2 * (h + (vy * vy) / (2 * BLAST.riseGravity)) / BLAST.gravity) : (-vy + Math.sqrt(vy * vy + 2 * BLAST.gravity * h)) / BLAST.gravity
      const want = Math.min(BLAST.vMax, rd / Math.max(0.5, trem))
      const ux = rx / Math.max(1e-6, rd), uz = rz / Math.max(1e-6, rd)
      const along = velSmooth.x * ux + velSmooth.z * uz
      const ease = Math.min(1, rd / Math.max(1, BLAST.steerEase))
      const f = Math.max(0, Math.min(s.steer, BLAST.steerK * (want - along))) * ease
      if (!(s.wasAir > 0 && !airborne) && f > 0.05) Physics.applyForceToPlayer(BLAST_SOURCE, Vector3.create(ux * f, 0, uz * f)); else Physics.removeForceFromPlayer(BLAST_SOURCE)
    }
    if (airborne) s.wasAir = Math.max(s.wasAir, age)
    if (!s.sawApex && age > 0.25 && age < 0.6 && s.apexAt === 0) { s.apexAt = -1; traceReport('blast', { sample: true, seed: s.seed, t: +age.toFixed(2), vy: +vy.toFixed(1), vxz: +Math.hypot(velSmooth.x, velSmooth.z).toFixed(1), y: +(world.y - s.start.y).toFixed(1) }) }
    if (!s.sawApex && vy <= 0.5 && age > 0.5) { s.sawApex = true; traceReport('blast', { apex: true, seed: s.seed, y: +(world.y - s.start.y).toFixed(1), t: +age.toFixed(1), x: +world.x.toFixed(0), z: +world.z.toFixed(0) }) }
    if (age > 2 && !airborne && s.wasAir > 0) blastEnd('landed', world)
    else if (age > 60) blastEnd('timeout', world)
    return
  }
  if (airborne) s.wasAir = Math.max(s.wasAir, age)
  const hv = velSmooth // horizontal velocity of the wearer (scene-local axes = world axes)
  // c27: closed loop. After the launch the horizontal speed is re-planned every frame so the ballistic landing hits the planned point whatever the real rise/fall did: remaining distance / estimated remaining flight time (rise at riseGravity, fall at gravity, ground = the start height)
  let dirx = s.dir.x, dirz = s.dir.z, vhT = s.vh
  if (s.phase === 'cruise') {
    const gr = BLAST.riseGravity, gf = BLAST.gravity
    const h = Math.max(0, world.y - s.start.y)
    const rx = s.land.x - world.x, rz = s.land.z - world.z, rd = Math.hypot(rx, rz)
    const trem = vy > 0 ? vy / gr + Math.sqrt(2 * (h + (vy * vy) / (2 * gr)) / gf) : (-vy + Math.sqrt(vy * vy + 2 * gf * h)) / gf
    if (rd > 1 && trem > 0.2) { dirx = rx / rd; dirz = rz / rd; vhT = Math.min(BLAST.vMax, rd / trem) } else vhT = 0
  }
  const along = hv.x * dirx + hv.z * dirz
  const ex = dirx * vhT - hv.x, ez = dirz * vhT - hv.z
  let fy = 0
  if (s.phase === 'launch') {
    fy = Math.max(0, Math.min(BLAST.maxFy, BLAST.kv * (s.vUp - vy) + BLAST.riseGravity)) // gravity rises to riseGravity while rising: the force must beat it
    if (vy >= s.vUp * 0.97 || age > 4) { s.phase = 'cruise'; traceReport('blast', { launched: true, seed: s.seed, t: +age.toFixed(2), y: +(world.y - s.start.y).toFixed(1), vy: +vy.toFixed(1), vh: +Math.hypot(hv.x, hv.z).toFixed(1) }) }
  } else if (!s.sawApex && vy <= 0.5 && age > 0.5) {
    s.sawApex = true; s.apexAt = age
    traceReport('blast', { apex: true, seed: s.seed, y: +world.y.toFixed(1), t: +age.toFixed(1), x: +world.x.toFixed(0), z: +world.z.toFixed(0), vh: +along.toFixed(1) })
  }
  const jumpHeld = inputSystem.isPressed(InputAction.IA_JUMP) && s.sawApex // the wearer opened the glider: the blast lets go of the course
  const fh = (e: number) => Math.max(-BLAST.maxFh, Math.min(BLAST.maxFh, BLAST.kv * e))
  if (BLAST.hold >= 1 && !jumpHeld) Physics.applyForceToPlayer(BLAST_SOURCE, Vector3.create(fh(ex), fy, fh(ez)))
  else if (fy > 0) Physics.applyForceToPlayer(BLAST_SOURCE, Vector3.create(0, fy, 0))
  else Physics.removeForceFromPlayer(BLAST_SOURCE)
  if (age > 2 && !airborne && s.wasAir > 0) blastEnd('landed', world)
  else if (age > s.flightPlanned * 1.8 + 8) blastEnd('timeout', world)
}
const LIFT_SOURCE = engine.addEntity()
const LIFT_TARGETS = [50, 100, 150, 200]
let liftIdx = 0
interface LiftGlide { phase: 'lift' | 'glide' | 'done'; target: number; start: Vec; t0: number; tRelease: number; release: Vec | null; sampleAt: number; sinkSum: number; sinkN: number; hSum: number; wasAir: boolean; maxY: number }
let lg: LiftGlide | null = null
// Ctrl+1: lift to a chosen altitude (50, 100, 150, 200 m; each press picks the next) with a sustained upward force, release it, then the wearer HOLDS JUMP to open the unpowered glider and steers;
// the trace logs the sink rate, the horizontal speed, the landing spot and the time taken
function startLiftGlide(world: Vec, altitude?: number) {
  if (lg && lg.phase !== 'done') {
    Physics.removeForceFromPlayer(LIFT_SOURCE)
    traceReport('lift-glide', { aborted: true })
    lg = null
    return
  }
  const target = altitude !== undefined ? Math.max(20, Math.min(220, altitude)) : LIFT_TARGETS[liftIdx % LIFT_TARGETS.length]!
  if (altitude === undefined) liftIdx++
  lg = { phase: 'lift', target, start: { ...world }, t0: clock, tRelease: 0, release: null, sampleAt: 0, sinkSum: 0, sinkN: 0, hSum: 0, wasAir: false, maxY: world.y }
  traceReport('lift-glide', { start: world, target })
}
function liftGlideUpdate(dt: number, me: Vec, world: Vec, vy: number, airborne: boolean) {
  if (!lg || lg.phase === 'done') return
  const s = lg
  s.maxY = Math.max(s.maxY, world.y)
  if (s.phase === 'lift') {
    // the same force numbers the flight kit uses: the strong rising force until the climb rate reaches 14.5 m/s, then slightly under the weight so it eases
    const fy = vy < 14.5 ? 57 : 24
    Physics.applyForceToPlayer(LIFT_SOURCE, Vector3.create(0, fy, 0))
    if (world.y >= s.target || clock - s.t0 > 40) {
      Physics.removeForceFromPlayer(LIFT_SOURCE)
      s.phase = 'glide'
      s.tRelease = clock
      s.release = { ...world }
      s.wasAir = true
      traceReport('lift-glide', { released: true, y: world.y, liftSeconds: +(clock - s.t0).toFixed(1), x: world.x, z: world.z })
    }
    return
  }
  // glide: the wearer holds jump to open the glider; sample once a second
  if (clock - s.sampleAt >= 1) {
    s.sampleAt = clock
    const sink = -vy
    s.sinkSum += sink
    s.sinkN++
    s.hSum += Math.hypot(me.x - (s.release ? toLocal(s.release).x : me.x), me.z - (s.release ? toLocal(s.release).z : me.z))
    traceReport('lift-glide', { glide: true, t: +(clock - s.tRelease).toFixed(0), y: +world.y.toFixed(1), sink: +sink.toFixed(2), x: +world.x.toFixed(0), z: +world.z.toFixed(0) })
  }
  if (!airborne && s.wasAir && clock - s.tRelease > 1.5) {
    const rel = s.release ?? s.start
    const dx = world.x - rel.x
    const dz = world.z - rel.z
    const secs = clock - s.tRelease
    s.phase = 'done'
    const horiz = Math.hypot(dx, dz)
    traceReport('lift-glide', { landed: true, x: +world.x.toFixed(0), y: +world.y.toFixed(1), z: +world.z.toFixed(0), glideSeconds: +secs.toFixed(0), horizontalFromRelease: +horiz.toFixed(0), meanHorizontalSpeed: +(horiz / Math.max(1, secs)).toFixed(2), meanSink: +(s.sinkSum / Math.max(1, s.sinkN)).toFixed(2), maxAltitude: +s.maxY.toFixed(0) })
  }
  s.wasAir = airborne
}
// the server asks for a teleport (the group start, or an admin test): one movePlayerTo call, the result and where the avatar ends up are reported to the server's trace log
const teleportPending: { id: string; t0: number; from: Vec; asked: Vec; result: string; checkAt: number }[] = [] // one entry per call: every call is reported
function serverTeleport(ev: any) {
  const asked = { x: Number(ev.x), y: Number(ev.y), z: Number(ev.z) }
  if (![asked.x, asked.y, asked.z].every((v) => Number.isFinite(v))) return
  // c26: joined + leased; in a running match at most 300 m from the wearer; in the lobby (the group start) or at the ending any distance
  const ms = matchState()
  if (!joinedAndLeased() || !(ms === 'playing' || ms === 'lobby' || ms === 'ended')) return
  { const f0 = toWorld(curMe); if (ms === 'playing' && Math.hypot(asked.x - f0.x, asked.z - f0.z) > 300) return }
  const id = String(ev.id ?? '').slice(0, 24)
  const from = toWorld(curMe)
  note(`teleport ${id}: ${Math.round(Math.hypot(asked.x - from.x, asked.z - from.z))} m`)
  try {
    const ra = (globalThis as any).require ? (globalThis as any).require('~system/RestrictedActions') : null
    if (!ra || typeof ra.movePlayerTo !== 'function') {
      traceReport('teleport', { id, result: 'module-or-function-missing' })
      return
    }
    const local = toLocal(asked)
    const t0 = clock
    const tp = { id, t0, from, asked, result: 'calling', checkAt: 1e9 }
    teleportPending.push(tp)
    // c24g: an optional `look` { x, y, z } (world) turns the camera toward that point after the move (movePlayerTo's cameraTarget); ignored unless all three are finite numbers
    const lk = ev.look && typeof ev.look === 'object' && [ev.look.x, ev.look.y, ev.look.z].every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ? toLocal({ x: ev.look.x, y: ev.look.y, z: ev.look.z }) : null
    Promise.resolve(ra.movePlayerTo(lk ? { newRelativePosition: Vector3.create(local.x, local.y, local.z), cameraTarget: Vector3.create(lk.x, lk.y, lk.z) } : { newRelativePosition: Vector3.create(local.x, local.y, local.z) })).then(
      (r: unknown) => { tp.result = 'returned ' + JSON.stringify(r).slice(0, 60); tp.checkAt = clock + 1.5; tp.t0 = clock - tp.t0 },
      (e: unknown) => { traceReport('teleport', { id, result: 'rejected', error: String(e).slice(0, 160), from, asked }); const k = teleportPending.indexOf(tp); if (k >= 0) teleportPending.splice(k, 1) }
    )
  } catch (e) {
    traceReport('teleport', { id, result: 'threw', error: String(e).slice(0, 160), from, asked })
  }
}
function teleportCheck() {
  for (const tp of [...teleportPending]) {
    if (clock < tp.checkAt) continue
    teleportPending.splice(teleportPending.indexOf(tp), 1)
    const now = toWorld(curMe)
    traceReport('teleport', { id: tp.id, result: tp.result, seconds: +Number(tp.t0).toFixed(2), from: tp.from, asked: tp.asked, ended: now, error_m: +Math.hypot(now.x - tp.asked.x, now.y - tp.asked.y, now.z - tp.asked.z).toFixed(1), airborne: lastAirborne })
  }
}
function syncPlumes(me: Vec) {
  if (!feature('plumes')) { plumes.keepOnly(new Set()); return }
  // plumes: our own (drawn at once) plus every plume the server lists (everyone in the match, ours skipped by position/time)
  const keep = new Set<number | string>()
  for (const [id, p] of ownPlumes) {
    if (clock - p.born > RULES.plumeSeconds) ownPlumes.delete(id)
    else keep.add(id)
  }
  if (mode === 'server' && serverState) {
    for (const pl of serverState.plumes ?? []) {
      const mine = [...ownPlumes.values()].some((o) => Math.hypot(o.base.x - pl.x, o.base.z - pl.z) < 0.5)
      if (mine) continue
      const sid = 's' + pl.id
      keep.add(sid)
      plumes.spawn(sid, toLocal({ x: pl.x, y: pl.y, z: pl.z }), RULES.plumeSeconds - pl.leftMs / 1000, clock)
    }
  }
  plumes.keepOnly(keep)
  plumes.update(clock)
}

function handleServerEvent(ev: any) {
  emit('server-event', ev)
  switch (ev.ev) {
    case 'contact': contactFx = { pos: { x: ev.x, y: ev.y, z: ev.z }, until: clock + 1.5, stage: ev.stage === 'free' ? 'reset' : ev.stage }; break
    case 'warn5': playSlot('warn.five_minutes'); note('5 minutes left in the round'); break
    case 'round-start': lobbyNote = ''; cue('round-start'); budget.refill(); note(say('roundStart', { round: ev.round })); playSlot('round.start'); break
    case 'round-complete': note(`round ${ev.round} complete (${ev.side})`); playSlot('round.complete'); break // c30d: its sound again (Forces's list: a round is won) // c30: the cinematics are their own events (portal, strike, aurora, blast)
    case 'round-timeout':
      note('TIME IS UP: the Synth moves')
      playSlot('round.timeout')
      break // c30: no glimpse camera, no stand-in figure
    case 'portal': portalEvent(ev); if (ev.v === 2) cue('ending'); break
    case 'strike': { const at = evPos(ev); if (at && feature('particles')) { lookFx.effect('E8', at, clock, { seconds: Math.max(0.5, Math.min(10, num2(ev.seconds, 2))) }, 'strike'); playSlot('cine.rift.strike') } break }
    case 'aurora': if (feature('particles')) { lookFx.effect('E9', curMe, clock, { seconds: Math.max(1, Math.min(60, num2(ev.seconds, 20))) }, 'aurora'); playSlot('cine.aurora.ambient'); playSlot('cine.aurora.synth_change') } break // around THIS wearer; the effect follows them in flight
    case 'storm': if (feature('particles')) { lookFx.effect('E10', curMe, clock, { seconds: Math.max(1, Math.min(60, num2(ev.seconds, 16))) }, 'storm'); playSlot('cine.carrington.storm') } break
    case 'glimpse-signal': glimpseSignal(ev); break
    case 'restored':
      restoredNote = `restored from the server: round ${ev.round}, plumes ${ev.plumesLeft}`
      restoredUntil = clock + 15
      break
    case 'charge-failed': note('charge failed'); playSlot('charge.failed', synthLocal()); break
    case 'charge-broken': note('charge broken by the other side'); playSlot('charge.broken', synthLocal()); break
    case 'stage': note(`Synth ${ev.stage} mode`); playSlot(ev.stage === 'repair' ? 'charge.repair' : ev.stage === 'upgrade' ? 'charge.upgrade' : 'charge.reset', synthLocal()); break
    case 'pickup': playSlot('halo.upgrade_pickup', curMe); if (ev.kind === 'boost') boostSound(Math.max(1, Math.min(120, num2(ev.seconds, RULES.boostSeconds)))) /* c30d: the boost sound, until the boost ends */; note(ev.kind === 'boost' ? 'Halo boost: 30 s (applied now)' : `picked up ${ev.kind}`); break
    case 'lobby': cue('lobby'); lobbyNote = `LOBBY: everyone into the bubble (${Math.round(ev.seconds)} s)`; note(say('lobbyCall')); playSlot('warn.upgrade'); break
    case 'lobby-end': lobbyNote = ''; note(say('lobbyEnd', { mode: ev.mode, count: ev.count })); break // c30: PP1 comes as its own event; the E6 burst plays with the blast
    case 'lobby-wait': lobbyNote = 'waiting for the next lobby'; note('the game started without you: you wait for the next lobby'); break
    case 'teleport': serverTeleport(ev); break
    case 'blast': runCommand({ ...ev, c: 'blast', mix: 1 }); break
    case 'toss': runCommand({ c: 'lift', altitude: Number(ev.altitude) || 100 }); traceReport('toss-event', { round: ev.round, altitude: ev.altitude }); break
    case 'trap-hit': playSlot('halo.discharge.trigger', evPos(ev) ?? curMe); note(ev.synth ? 'Discharge Trap hit the Synth' : 'Discharge Trap went off'); emit('trap-hit', { x: ev.x, z: ev.z, synth: ev.synth, players: ev.players }); break
    case 'double-agent': note('you were recruited as a double agent'); playSlot('role.double_agent'); break
  }
}

/** frame time (the HUD's ms / fps line): the measure the 77-emitter peak test reads */
function frameUpdate(dt: number) {
  frameMsSum += dt * 1000
  frameMsN++
  if (frameMsN >= 60) {
    frameMsAvg = frameMsSum / frameMsN
    frameMsPeak = Math.max(frameMsPeak, frameMsAvg)
    frameMsSum = 0
    frameMsN = 0
  }
}
let frameMsPeak = 0
export function gameDebug() {
  return { mode, emitters: lookFx.emitterCount, outside: outside.emitters(), frameMsAvg, frameMsPeak }
}

// ---------------- c30 (Directive V): the game sequence, drawn from the server's events ----------------
// PP1 (E7) -> the Synth disappears into it -> [round 1: the Strike E8 | round 2: the Aurora E9 with the blast] -> Blast + Burst (E13 + E6, trails) -> the Glimpse Signal (E12) -> the round starts.
// The ending: PP2 (E11) in the winner's colour -> the Storm (E10) -> two replay portals (PP2, one purple, one gold; bare state) -> the game blasts again.
const num2 = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
const evPos = (ev: any): Vec | null => (typeof ev.x === 'number' && typeof ev.z === 'number' && Number.isFinite(ev.x) && Number.isFinite(ev.z) ? toLocal({ x: ev.x, y: num2(ev.y, 0), z: ev.z }) : null)
function portalEvent(ev: any) {
  const at = evPos(ev); if (!at || !feature('particles')) return
  const secs = Math.max(1, Math.min(60, num2(ev.seconds, 5)))
  if (ev.v === 2) lookFx.effect('E11', at, clock, { seconds: secs, winner: ev.side === 'helpers' ? 'helpers' : 'hunters' }, 'pp2') // PP2 in the winner's colour
  else lookFx.effect('E7', at, clock, { seconds: secs + 0.5 }, 'pp1') // PP1
  playSlotFor('cine.rift.open', ev.v === 2 ? secs : secs + 0.5, at) // c30d: the hum stops when the portal closes
  note(ev.v === 2 ? 'the Synth is gone into the portal: ' + (ev.side === 'helpers' ? 'helpers win' : 'hunters win') : 'the Synth steps into the portal: the blast follows')
}
function glimpseSignal(ev: any) {
  const at = evPos(ev); if (!at || !feature('particles')) return
  const gsecs = Math.max(1, Math.min(30, num2(ev.seconds, 7)))
  lookFx.effect('E12', at, clock, { seconds: gsecs }, 'glimpse') // the Synth's NEW starting spot: a pale-cyan column to max height
  playSlotFor('glimpse.signal', gsecs, at) // c30d: stops when the Glimpse ends // c30d: its own slot (was the spare cine.rift.snap)
  emit('glimpse-signal', { seconds: ev.seconds })
}

// ---------------- round 8: the Synth's pitch dialogue (c30: the replay menu, the timeout glimpse and the final cinematic are gone) ----------------
function toast(body: string, seconds = 4) {
  openDialog('info', clock, () => {}, { title: 'GHOSTCODE (test)', body })
  toastUntil = clock + seconds
}
let toastUntil = 0

function testPick(p: string) {
  if (p === 'help') {
    closeDialog()
    toast("You chose \"I'll Help\". The server would now record your side, secretly.")
  } else if (p === 'doubts') openDialog('doubts', clock, testPick)
  else {
    closeDialog()
    toast("You pressed 'Sure, I'll help!'. The server records which side that button was; the halo is not told.")
  }
}
function serverPick(p: string) {
  if (p === 'help' || p === 'doubts' || p === 'A' || p === 'B') {
    sendGameEvent({ ev: 'choice', pick: p })
    if (p === 'doubts') openDialog('doubts', clock, serverPick)
    else closeDialog()
  }
}
function shiftKeys(pressed: (a: InputAction) => boolean) {
  if (pressed(InputAction.IA_ACTION_3)) {
    // Shift + 1: the choice dialogue: the pitch, then the Dev Team message
    openDialog('pitch', clock, testPick)
    emit('dialogue-test', {})
    note('DIALOGUE TEST: the Synth pitch')
  }
  if (pressed(InputAction.IA_ACTION_6)) {
    // Shift + 4: what a reloaded halo shows when the server hands its state back
    restoredNote = 'restored from the server: round 2, plumes 1 (TEST)'
    restoredUntil = clock + 12
    emit('restored-test', {})
  }
}
// c24i: a short plain-English line for each stage, shown on the HUD line for fx.cueSeconds; the wording is the server's text (cueLobby, cueRound, cueEnding): blank or the feature `cues` off = none
function cue(ev: string) {
  const key = cueKeyFor(ev)
  if (!key || !feature('cues')) return
  const text = say(key)
  if (!text) return
  hudMsg = { text: text.slice(0, 160), until: clock + Math.max(2, Math.min(30, FXS.cueSeconds)) }
}
function dialogSync() {
  if (toastUntil > 0 && clock >= toastUntil) {
    toastUntil = 0
    if (dialog.kind === 'info') closeDialog()
  }
  if (mode !== 'server' || !serverState) return
  const st = serverState.you?.dialog
  if (st === 'pitch' && dialog.kind !== 'pitch') openDialog('pitch', clock, serverPick)
  else if (st === 'doubts' && dialog.kind !== 'doubts') openDialog('doubts', clock, serverPick)
  else if (st === 'done' && (dialog.kind === 'pitch' || dialog.kind === 'doubts')) closeDialog()
}


// ---------------- round 23: the server-to-halo command set (protocol 1) ----------------
// A command is { c: <name>, v?: <protocol it needs>, ...params }. Unknown commands, commands that need a newer protocol, and malformed parameters are IGNORED, never an error.
const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
function runCommand(c: Record<string, unknown>) {
  if (typeof c.v === 'number' && c.v > PROTOCOL_VERSION) return
  switch (c.c) {
    case 'particles': { // c24f candidate: { kind: fire|smoke|sparks, x,y,z (world) | at:'me', size, seconds, height, n, color }: validated and capped (particleplan.ts); the feature switch `particles` is the kill switch
      if (!feature('particles')) break
      const plan = planParticles(c.kind, c, FXS.particleTexture > 0)
      if (!plan) break
      const at2 = c.at === 'me' || c.x === undefined ? curMe : toLocal({ x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) })
      particleFx.spawn(plan, at2, clock)
      break
    }
        case 'look': { // c29 (Plan v2): { id:'E1'..'E14', x,y,z (world) | at:'me', seconds, seed, r, scale }: one effect from the recipe table (look.ts); the feature `particles` is the kill switch
      if (!feature('particles') || typeof c.id !== 'string') break
      let at3 = c.at === 'me' || c.x === undefined ? curMe : toLocal({ x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) })
      if (typeof c.ahead === 'number') { const pt = Transform.getOrNull(engine.PlayerEntity); const fw = pt ? Vector3.rotate(Vector3.Forward(), pt.rotation) : Vector3.Forward(); const d = Math.max(0, Math.min(60, c.ahead)); at3 = { x: curMe.x + fw.x * d, y: curMe.y, z: curMe.z + fw.z * d } } // c29: `ahead` metres in front of the wearer (the way it faces)
      try {
        const okLook = lookFx.effect(c.id, at3, clock, { r: typeof c.r === 'number' ? c.r : undefined, seed: typeof c.seed === 'number' ? c.seed : undefined, seconds: typeof c.seconds === 'number' ? c.seconds : undefined, scale: typeof c.scale === 'number' ? c.scale : undefined })
        note(`look ${c.id}: ${okLook ? 'placed' : 'refused'}, live emitters ${lookFx.emitterCount}, particles ${lookFx.particleCount}`)
      } catch (e) { emit('error', { where: 'look', id: c.id, msg: String(e) }); note('look ' + c.id + ' ERROR: ' + String(e).slice(0, 90)) }
      break
    }
    case 'clear': { // c29e: the STOP: every live effect in this Halo goes at once (look effects, particles, the trails, the blast bubbles)
      lookFx.clear(); trail.clear(); particleFx.clear(); clearBareFx(); hudMsg = null
      break
    }
    case 'hud': { // { text, seconds }: a line on the screen
      const text = typeof c.text === 'string' ? c.text.slice(0, 160) : ''
      hudMsg = text ? { text, until: clock + Math.max(0.5, Math.min(60, num(c.seconds, 5))) } : null
      break
    }
    case 'sound': { // { id }: a slot id of the audio list, or lib:<name>
      if (typeof c.id === 'string' && c.id.length <= 60) playSlot(c.id)
      break
    }
    case 'push': { // { x,y,z, seconds }: a force on the wearer for a while (c27: only joined + leased + a running match; the c26 clamps are gone: sanity limits only, the original -40..40 / -40..60, 0.1..10 s)
      if (!joinedAndLeased() || matchState() !== 'playing') break
      const f = { x: Math.max(-40, Math.min(40, num(c.x, 0))), y: Math.max(-40, Math.min(60, num(c.y, 0))), z: Math.max(-40, Math.min(40, num(c.z, 0))) }
      pushForce = f
      pushUntil = clock + Math.max(0.1, Math.min(10, num(c.seconds, 1)))
      break
    }
    case 'lift': if (joinedAndLeased() && matchState() === 'playing') startLiftGlide(toWorld(curMe), Math.max(20, Math.min(220, num(c.altitude, 100)))); break // joined + leased + a running match; 20..220 m (c27: the c26 120 m cap is gone) // the lift-and-glide start: the halo lifts, releases, and prompts for the glider
    case 'blast': startBlast(c); break
    case 'teleport': serverTeleport(c); break
    case 'tick': applyRemote({ tick: { everySec: num(c.every, TICK.everySec) } }); break
    case 'feature': if (typeof c.name === 'string') applyRemote({ features: { [c.name]: c.on === false || c.on === 0 ? 0 : 1 } }); break
    case 'idle': setIdle(c.on !== false); break
    case 'settings': refetchSettings(); break
    default: break // unknown: ignored
  }
}
function hideAll() {
  for (const k of Object.keys(arrows.runs) as (keyof typeof arrows.runs)[]) arrows.runs[k].target = null
  arrows.update(0, clock, curMe)
  plumes.keepOnly(new Set())
  lookFx.clear(); trail.clear()
  particleFx.clear()
  trapMarks.update(clock, [])
  dropMarkers.update(clock, toWorld(curMe), [])
  bubbleFx.hide()
  closeDialog()
  Physics.removeForceFromPlayer(PUSH_SOURCE)
  hudMsg = null
}
/** the lines index.ts draws on screen: the always-on honest line, a server message, the glider prompt */
export function hudOverlay() {
  return {
    active: idle ? '' : feature('activeLine') ? say('activeLine') : '',
    msg: idle ? (refusedNote || say('idle')) : hudMsg && clock < hudMsg.until ? hudMsg.text : '',
    prompt: '',
    flash: !idle && flashUntil > clock ? Math.max(0, Math.min(1, ((flashUntil - clock) / Math.max(0.05, BLAST.flashSeconds)) * BLAST.flashStrength)) : 0,
    info: settingsInfo()
  }
}
