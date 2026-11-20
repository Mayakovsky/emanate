// EMANATE Build 04: the halo's gameplay layer. Keys 1-4 (arrows, plumes), warnings, charging arcs, upgrades.
// With the local game server up, targets come from it. Otherwise TEST MODE: fixed and moving test targets around the spawn.
import { engine, inputSystem, InputAction, PointerEventType, PlayerIdentityData, AvatarBase, Physics, Transform, MeshRenderer, Material, MaterialTransparencyMode, type Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { getUserData } from '~system/UserIdentity'
import { BLAST } from './settings'
import { planBlast, bubbleScale } from './blastplan'
import { skyUpdate, skyText, skyStart } from './sky'
import { openDialog, closeDialog, setDialogClock, dialog } from './dialog'
import { planParticles } from './particleplan'
import { ParticleFx, FxLib, playLib, FX_KINDS, Arrows, Plumes, ChargeArcs, DropMarkers, TrapMarkers, BubbleFx, RiftFx as BurstRiftFx, TestMarkers, EndgameFx, SkyDome, StandIn, RiftFx, AuroraFx, DistanceMarkers, CameraTests, MARKER_COLOR_NAMES, MARKER_DISTANCES, initSounds, playSlot, playSound, soundsUpdate, setRemoteAudio, audioStats, slotSource } from './fx'
import { consent, optOut, paused, setPaused, leaseValid, bare, bareFx, grantConsent, doOptOut } from './net'
import { idle, setIdle, refetchSettings, cmdQueue, settingsInfo, refusedNote, emit, netUpdate, sendGameEvent, serverState, serverUp, lastErr, netStatus, lastGameError, manifestUpdate, manifestInfo } from './net'
import { replayMenuAction, cueKeyFor } from './uiplan'
import { FXS, TICK, applyRemote, feature, say, PROTOCOL_VERSION, FINAL_NO_TEST_POWERS } from './settings'
import {
  ArrowChannel, PlumeBudget, Warnings, pressRed, pressPink, RULES, TEST_TARGETS, testMovingSynth, testDeadZoneDistance, dist, nearest, type Vec, type Target
} from './logic'

// Scene (local) -> world. The preview scene's base parcel is 0,0, so they are equal there. UNVERIFIED for the equipped wearable:
// the telemetry reports both, and the server compares the halo's position with what the Synth sees.
const ORIGIN = { x: 0, z: 0 }
const toWorld = (p: Vec): Vec => ({ x: p.x + ORIGIN.x, y: p.y, z: p.z + ORIGIN.z })
const toLocal = (p: Vec): Vec => ({ x: p.x - ORIGIN.x, y: p.y, z: p.z - ORIGIN.z })

const arrows = new Arrows()
const fxLib = new FxLib()
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
const endgameFx = new EndgameFx()
const skyDome = new SkyDome()
const markers4 = new DistanceMarkers()
const standIn = new StandIn()
let glimpse: { until: number; spot: Vec } | null = null // the round-timeout glimpse of where the Synth is hiding
let restoredNote = ''
let restoredUntil = 0
let finalBanner = 0
let testReplays = 0
let idReady = false
let serverReplayOpen = false
const rift = new RiftFx()
const particleFx = new ParticleFx()
const aurora = new AuroraFx()
let cine = 0 // 0 off, 1 the Rift, 2 the aurora, 3 Carrington (test mode: hold F + press 3; server mode: round ends)
let cineStart = 0
let cueRiftOpen = false
let lastEndgameKey = ''
let riftAt: Vec = { x: 0, y: 0, z: 0 }
let frameMs = 16
let frameMsSum = 0
let frameMsN = 0
let frameMsAvg = 0
const camTests = new CameraTests()
let egTest = 0 // 0 off, 1 containment, 2 escape (test mode: hold F + press 4)
let egAnchor: Vec = { x: 0, y: 0, z: 0 } // where the endgame test effect stands: where the wearer was (plus 25 m ahead of the spawn heading) when it was triggered
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
const burstRift = new BurstRiftFx()
let burstState: { t0: number; at: Vec; radius: number } | null = null // the bubble blowing (lobby end, or the Ctrl+2 test)
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
${round}   keys: 1 red ${cd('red')}  2 pink ${cd('pink')}  3 dead-zone ${warnings.deadZoneEnabled ? 'ON' : 'off'} ${cd('white')}  4 plumes ${left}   E trap ${hasTrap ? 'DOWN' : 'ready'}   boost ${boostLeft > 0 ? boostLeft.toFixed(0) + 's' : '-'}${trapLeft > 0 ? '   TRAPPED ' + trapLeft.toFixed(0) + 's' : ''}   ${lastEventNote}`
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
    if (ctrl && shift && e) { setPaused(true); optHold += dt; if (optHold >= 3) { doOptOut(); note('Emanate is off. Take the halo off and put it on again to start again.') } } else { optHold = 0; if (paused) setPaused(false) } // c26: held = paused at once; released before 3 s = resumes (if consent and the lease still hold); 3 s = permanent
  }
  // c27 (Directive M): the wearer's own re-throw: HOLD Ctrl + E for 1.5 s, only joined + leased + a running match, with a cooldown; no server value can fire it
  if (!optOut && !paused && ctrl && !shift && e && joinedAndLeased() && matchState() === 'playing') {
    rethrowHold += dt
    if (rethrowHold >= 1.5 && clock >= rethrowReady) { rethrowHold = 0; rethrowReady = clock + Math.max(1, BLAST.rethrowCooldown); startBlast({ ...(lastBlastCmd ?? {}), centre: lastBlastCmd?.centre ?? 'self', seed: Math.floor(Math.random() * 4294967295), rethrow: true }) }
  } else rethrowHold = 0
  if (optOut || consent) { joinHold = 0; return }
  const b = bare.bubble
  const inP = !!portal && Math.hypot(world.x - toWorld(portal.at).x, world.z - toWorld(portal.at).z) <= portal.radius
  const inside = (!!b && Math.hypot(world.x - b.x, world.z - b.z) <= b.radius) || inP
  gateDbg = 'world ' + world.x.toFixed(0) + ',' + world.z.toFixed(0) + (b ? '  bubble ' + b.x.toFixed(0) + ',' + b.z.toFixed(0) + ' dist ' + Math.hypot(world.x - b.x, world.z - b.z).toFixed(0) + '/' + b.radius : '  no bubble') + '  E-hold ' + joinHold.toFixed(1) + (inside ? '  INSIDE' : '')
  if (inside && !wasInside) note(say('joinPrompt'))
  wasInside = inside
  if (inside && e && !ctrl && !shift) { joinHold += dt; if (joinHold >= 1.5) { grantConsent(); if (inP) emit('joinCall', {}); joinHold = 0; note('You joined. Hold Ctrl + Shift + E to pause; hold it 3 seconds to leave.') } } else joinHold = 0
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
    if (!idle && !optOut && !paused) { bareFxUpdate(toWorld(me), me); blastLookUpdate() } else clearBareFx()
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
        playSlot('halo.upgrade_pickup')
        playSlot('halo.boost_on')
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
    if (inputSystem.isPressed(InputAction.IA_SECONDARY) && mode === 'test') {
      // F held + 2: toggle the sky-darkening dome prototype (night)
      const on = skyDome.toggle()
      emit('sky-dome', { on })
      note(`sky dome ${on ? 'ON' : 'off'}`)
    } else keyPink(world)
  }
  if (pressedKey(InputAction.IA_ACTION_5)) {
    if (inputSystem.isPressed(InputAction.IA_SECONDARY) && mode === 'test') cineTrigger(world) // F held + 3: the cinematic prototypes (Rift, aurora)
    else keyDeadZone()
  }
  if (pressedKey(InputAction.IA_ACTION_6)) {
    if (inputSystem.isPressed(InputAction.IA_SECONDARY) && mode === 'test') {
      // F held + 4: the endgame test: off -> containment (purple, ground) -> escape (yellow, high) -> off
      egTest = (egTest + 1) % 3
      if (egTest === 1) egAnchor = { x: world.x, y: world.y, z: world.z + 8 }
      emit('endgame-test', { state: egTest })
      note(egTest === 0 ? 'endgame test off' : egTest === 1 ? 'ENDGAME TEST: containment (purple portal)' : 'ENDGAME TEST: escape (yellow portal)')
      if (egTest) playSlot(egTest === 1 ? 'end.portal.contain.line' : 'end.portal.escape.line')
    } else keyPlume(world)
  }

  // ---- warnings (automatic) ----
  const dz = mode === 'server' ? serverState?.deadzone ?? null : testDeadZoneDistance(world)
  const dzDist: number | null = dz ? dz.dist : null
  if (feature('deadzoneWarn') && feature('arrows') && warnings.deadZone(arrows.runs.white.ch, clock, speed, dzDist)) {
    arrows.runs.white.target = () => {
      const q = mode === 'server' ? serverState?.deadzone : testDeadZoneDistance(toWorld(curMe))
      if (!q) return null
      return mode === 'server' ? { x: world.x + q.dx, y: world.y, z: world.z + q.dz } : q.at
    }
    arrows.runs.white.mode = 'arrow'
    playSlot('warn.deadzone')
    emit('warning', { kind: 'dead-zone', dist: dzDist, speed, triggerAt: Math.max(RULES.deadZoneBaseMetres, speed * RULES.deadZoneSeconds) })
    note('WARNING: approaching dead zone')
  }
  const drops = dropList()
  const up = feature('arrows') ? warnings.upgradeNearby(arrows.runs.pink.ch, clock, world, drops) : null
  if (up) {
    arrows.runs.pink.target = () => livePos(up)
    arrows.runs.pink.mode = 'arrow'
    playSlot('warn.upgrade')
    emit('warning', { kind: 'upgrade-nearby', id: up.id, dist: dist(world, up.pos) })
    note('WARNING: upgrade available')
  }
  // endgame arrow (server): purple = containment, yellow = escape; automatic, repeats while the endgame is open
  const eg = mode === 'server' ? serverState?.endgame : null
  if (eg && !eg.resolved) {
    const name = eg.kind === 'containment' ? 'purple' : 'yellow'
    if (arrows.runs[name].ch.start(clock, 'warning') === 'started') {
      arrows.runs[name].target = () => ({ x: eg.x, y: world.y, z: eg.z })
      arrows.runs[name].mode = 'arrow'
      emit('arrow', { kind: name, source: 'endgame', d: Math.hypot(eg.x - world.x, eg.z - world.z) })
    }
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
  fxLib.update(clock)
  if (!feature('particles')) particleFx.clear(); else particleFx.update(clock)
  syncPlumes(me)
  syncTraps(me, world)
  syncBubble(dt, me, world)
  liftGlideUpdate(dt, me, world, vy, airborne)
  blastUpdate(world, vy, airborne)
  blastLookUpdate()
  bareFxUpdate(world, me)
  lastAirborne = airborne
  teleportCheck()
  dropMarkers.update(clock, world, drops.map((d) => ({ id: d.id!, pos: toLocal(d.pos) })).map((d) => ({ id: d.id, pos: d.pos })))
  const sp = synthPos() ?? nearest(world, testSynths())?.target.pos ?? null
  if (contactFx && clock >= contactFx.until) contactFx = null
  // charging effect: within 5 m of the Synth, or for 1.5 s after the server reports a contact there (a contact can end the round at once)
  arcs.update(dt, world, contactFx ? contactFx.pos : sp, contactFx ? contactFx.stage : mode === 'server' ? serverState?.synth?.stage ?? 'free' : 'free')
  if ((sp && dist(world, sp) <= RULES.chargeRadius) || contactFx) {
    if (!charging) {
      charging = true
      playSlot('charge.contact')
      emit('charging', { d: sp ? dist(world, sp) : null, stage: mode === 'server' ? serverState?.synth?.stage : 'test' })
    }
  } else charging = false
  // endgame fx: from the server's endgame point, or the test trigger at the fixed test Synth point
  {
    const eg2 = mode === 'server' && cine !== 3 ? serverState?.endgame : null
    {
      const k = eg2 ? 'srv:' + eg2.kind : egTest ? 'test:' + egTest : ''
      if (k !== lastEndgameKey) {
        lastEndgameKey = k
        if (k) {
          const kind = eg2 ? eg2.kind : egTest === 1 ? 'containment' : 'escape'
          playSlot('end.plume.rise')
          playSlot(kind === 'containment' ? 'end.portal.contain.open' : 'end.portal.escape.open')
        }
      }
    }
    try {
      if (eg2) endgameFx.update(dt, clock, eg2.kind, toLocal({ x: eg2.x, y: 0, z: eg2.z }))
      else if (egTest) endgameFx.update(dt, clock, egTest === 1 ? 'containment' : 'escape', toLocal(egAnchor))
      else if (endgameFx.built) endgameFx.hide()
    } catch (e) {
      emit('error', { where: 'endgameFx', msg: String(e) })
    }
  }
  try {
    camTests.update(me, toLocal(testMovingSynth(testClock)), riftAt)
    skyDome.update(me)
    cineUpdate(dt, me)
  } catch (e) {
    emit('error', { where: 'skyDome', msg: String(e) })
  }
  manifestUpdate(dt, setRemoteAudio)
  setDialogClock(clock)
  dialogSync()
  glimpseUpdate()
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
  if (!feature('deadzoneWarn')) return
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
  playSlot('halo.plume')
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
  if (burstState) {
    const t = clock - burstState.t0
    burstRift.update(dt, t, burstState.at)
    bubbleFx.burst(clock, t, burstState.at, burstState.radius)
    if (t > 2.6) { burstState = null; burstRift.hide(); bubbleFx.hide() }
  } else if (!shown) bubbleFx.hide()
}

// ---- trace reports: each goes to the console log and (with the server up) to the server's log ----
function traceReport(what: string, data: Record<string, unknown>) {
  emit('trace', { what, ...data })
  if (mode === 'server') sendGameEvent({ ev: 'trace', what, text: JSON.stringify(data).slice(0, 380) })
  console.log('[halo] ' + what + ' ' + JSON.stringify(data))
}

// ---- c27: the blast ("Hand of God"): joined players are thrown into the sky on a random trajectory and fall; the planned ballistic landing is inside BLAST.radius of the centre ----
const BLAST_SOURCE = engine.addEntity()
interface Blast { phase: 'launch' | 'cruise' | 'coast'; elev: number; burst: number; fv: Vec; steer: number; t0: number; vUp: number; vh: number; dir: Vec; land: Vec; start: Vec; centre: Vec; apexPlanned: number; flightPlanned: number; maxY: number; apexAt: number; sawApex: boolean; wasAir: number; seed: number }
let bl: Blast | null = null
let flashUntil = 0
let lastBlastCmd: any = null
let blastBub: { t0: number; at: Vec } | null = null // the wearer's own blast (the others are in bubs)
interface Bub { e: Entity; e2: Entity; t0: number; at: Vec }
const bubs: Bub[] = []
const seenBlasts = new Set<string>()
let lastCallSeq = 0, callCooldownUntil = 0
let portal: { at: Vec; until: number; e: Entity; e2: Entity; radius: number } | null = null
/** c27 (Directive M): the blast's look = a crack (slot blast.crack), one short white flash, and the red fiery bubble that grows from the launch point (67 % opaque, soft ease) and fades; nothing else */
function blastLook(at: Vec) {
  playSlot('blast.crack')
  flashUntil = clock + BLAST.flashSeconds
  blastBub = { t0: clock, at: { ...at } }
  spawnBub(at, clock)
  emit('blast', {})
  fxLib.spawn('smoke', at, clock, { size: Math.max(3, BLAST.bubbleRadius / 12), seconds: BLAST.bubbleSeconds + 3, height: BLAST.bubbleRadius, n: 24 })
}
function spawnBub(at: Vec, t0: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(at.x, at.y, at.z), scale: Vector3.create(0.1, 0.1, 0.1) })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.create(1, 0.18, 0.04, BLAST.bubbleAlpha), emissiveColor: Color4.create(1, 0.35, 0.05, 1), emissiveIntensity: 1.6, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
  // a second sphere with a NEGATIVE scale shows the inside faces: the wearer, still inside while it grows, sees the red fire around them
  const e2 = engine.addEntity()
  Transform.create(e2, { position: Vector3.create(at.x, at.y, at.z), scale: Vector3.create(-0.1, 0.1, 0.1) })
  MeshRenderer.setSphere(e2)
  Material.setPbrMaterial(e2, { albedoColor: Color4.create(1, 0.18, 0.04, BLAST.bubbleAlpha), emissiveColor: Color4.create(1, 0.35, 0.05, 1), emissiveIntensity: 1.6, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 })
  bubs.push({ e, e2, t0, at: { ...at } })
}
function blastLookUpdate() {
  const E = Math.max(0.2, BLAST.bubbleSeconds), H = Math.max(0, BLAST.bubbleHold), I = Math.max(0.2, BLAST.bubbleImplode)
  if (blastBub && clock - blastBub.t0 > E + H + I) blastBub = null
  for (let i = bubs.length - 1; i >= 0; i--) {
    const b = bubs[i]!
    const k = bubbleScale(clock - b.t0, E, H, I)
    if (k <= 0 && clock - b.t0 > 0.1) { engine.removeEntity(b.e); engine.removeEntity(b.e2); bubs.splice(i, 1); continue }
    const r = Math.max(0.05, BLAST.bubbleRadius * k)
    Transform.getMutable(b.e).scale = Vector3.create(r * 2, r * 2, r * 2)
    Transform.getMutable(b.e2).scale = Vector3.create(-r * 2, r * 2, r * 2)
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
    if (far > c.far && far < BLAST.callRange * 20) { // only wearers outside the near zone; they get the portal 10 m ahead of them
      callCooldownUntil = clock + BLAST.callCooldown
      const t = Transform.getOrNull(engine.PlayerEntity)
      const f = t ? Vector3.rotate(Vector3.Forward(), t.rotation) : Vector3.Forward()
      const at = { x: me.x + f.x * 10, y: me.y, z: me.z + f.z * 10 }
      const mk = (neg: boolean) => { const e = engine.addEntity(); Transform.create(e, { position: Vector3.create(at.x, at.y + c.radius * 0.5, at.z), scale: Vector3.create((neg ? -1 : 1) * c.radius * 2, c.radius * 2, c.radius * 2) }); MeshRenderer.setSphere(e); Material.setPbrMaterial(e, { albedoColor: Color4.create(1, 0.18, 0.04, BLAST.bubbleAlpha), emissiveColor: Color4.create(1, 0.35, 0.05, 1), emissiveIntensity: 1.6, transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND, metallic: 0, roughness: 1 }); return e }
      portal = { at, until: clock + Math.min(c.left, 60), e: mk(false), e2: mk(true), radius: c.radius }
      fxLib.spawn('smoke', at, clock, { size: Math.max(2, c.radius / 3), seconds: 12, height: 40, n: 16 })
      note(say('callPrompt'))
    }
  }
  if (portal) {
    if (clock > portal.until || consent) { engine.removeEntity(portal.e); engine.removeEntity(portal.e2); portal = null }
    else { const k = 1 + 0.03 * Math.sin(clock * 2); const r = portal.radius * 2 * k; Transform.getMutable(portal.e).scale = Vector3.create(r, r, r); Transform.getMutable(portal.e2).scale = Vector3.create(-r, r, r) }
  }
}
function clearBareFx() {
  for (const b of bubs) { engine.removeEntity(b.e); engine.removeEntity(b.e2) }
  bubs.length = 0
  if (portal) { engine.removeEntity(portal.e); engine.removeEntity(portal.e2); portal = null }
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
    case 'round-start': cue('round-start'); budget.refill(); note(say('roundStart', { round: ev.round })); playSlot('round.start'); break
    case 'round-complete': {
      note(`round ${ev.round} complete (${ev.side})`)
      const at = contactFx ? contactFx.pos : serverState?.synth ? { x: serverState.synth.x, y: serverState.synth.y, z: serverState.synth.z } : { x: 0, y: 0, z: 0 }
      startCine(Math.min(3, ev.round), toLocal(at)) // round 1 -> Rift, round 2 -> aurora, round 3 -> Carrington -> endgame
      break
    }
    case 'round-timeout':
      note('TIME IS UP: this is where the Synth is hiding')
      playSlot('round.timeout')
      startGlimpse({ x: ev.x, y: ev.y, z: ev.z }, ev.glimpseSeconds ?? 8)
      break
    case 'final-cinematic': startFinal(); break
    case 'restored':
      restoredNote = `restored from the server: round ${ev.round}, plumes ${ev.plumesLeft}`
      restoredUntil = clock + 15
      break
    case 'charge-failed': note('charge failed'); playSlot('charge.failed'); break
    case 'charge-broken': note('charge broken by the other side'); playSlot('charge.broken'); break
    case 'stage': note(`Synth ${ev.stage} mode`); playSlot(ev.stage === 'repair' ? 'charge.repair' : ev.stage === 'upgrade' ? 'charge.upgrade' : 'charge.reset'); break
    case 'pickup': playSlot('halo.upgrade_pickup'); note(ev.kind === 'boost' ? 'Halo boost: 30 s (applied now)' : `picked up ${ev.kind}`); break
    case 'lobby': cue('lobby'); lobbyNote = `LOBBY: everyone into the bubble (${Math.round(ev.seconds)} s)`; note(say('lobbyCall')); playSlot('warn.upgrade'); break
    case 'lobby-end': lobbyNote = ''; note(say('lobbyEnd', { mode: ev.mode, count: ev.count })); playSlot('cine.rift.strike'); if (lastBubble) { burstState = { t0: clock, at: lastBubble.at, radius: lastBubble.radius }; riftOpening(lastBubble.at) }; break
    case 'lobby-wait': lobbyNote = 'waiting for the next lobby'; note('the game started without you: you wait for the next lobby'); break
    case 'teleport': serverTeleport(ev); break
    case 'blast': runCommand({ ...ev, c: 'blast', mix: 1 }); break
    case 'toss': runCommand({ c: 'lift', altitude: Number(ev.altitude) || 100 }); traceReport('toss-event', { round: ev.round, altitude: ev.altitude }); break
    case 'trap-hit': playSlot('warn.upgrade'); note(ev.synth ? 'Discharge Trap hit the Synth' : 'Discharge Trap went off'); emit('trap-hit', { x: ev.x, z: ev.z, synth: ev.synth, players: ev.players }); break
    case 'endgame': cue('endgame'); note(`endgame: ${ev.kind}`); break
    case 'double-agent': note('you were recruited as a double agent'); playSlot('role.double_agent'); break
  }
}

// hold F + E: cycle the camera test: off -> bird's-eye (250 m up) -> behind the moving test Synth point -> off
export function gameCameraTest() {
  const order = [0, 1, 2, 5]
  const m = order[(order.indexOf(camTests.mode) + 1) % order.length] ?? 0
  camTests.setMode(m)
  emit('camera-test', { mode: m })
  note(m === 0 ? 'camera test off' : m === 1 ? "CAMERA TEST: bird's-eye (250 m)" : m === 2 ? 'CAMERA TEST: behind the moving Synth point' : 'CAMERA TEST: far view from 180 m toward the markers (north)')
}

// hold F + 3: cycle the cinematic prototypes: off -> 1 The Rift -> 2 the aurora -> off
function cineTrigger(world: Vec) {
  cine = (cine + 1) % 4
  cineStart = clock
  emit('cinematic-test', { cine })
  startCine(cine, toLocal(testMovingSynth(testClock)))
}
function startCine(c: number, at: Vec) {
  if (!feature('cinematics') && c !== 0) return
  cine = c
  cineStart = clock
  cueRiftOpen = false
  if (cine === 1) {
    riftAt = at
    note('CINEMATIC 1: the Rift (strike, bird\'s-eye, glimpse, snap back)')
    playSlot('cine.rift.strike')
  } else if (cine === 2) {
    if (!skyDome.on) skyDome.toggle()
    note('CINEMATIC 2: night + aurora')
    playSlot('cine.aurora.ambient')
    playSlot('cine.aurora.synth_change')
    frameMsSum = 0
    frameMsN = 0
  } else if (cine === 3) {
    if (!skyDome.on) skyDome.toggle()
    note('CINEMATIC 3: Carrington storm, then the endgame')
    playSlot('cine.carrington.storm')
  } else {
    if (skyDome.on) skyDome.toggle()
    note('cinematic off')
  }
}
let world0: Vec = { x: 0, y: 0, z: 0 }
function cineUpdate(dt: number, me: Vec) {
  world0 = toWorld(me)
  frameMsSum += dt * 1000
  frameMsN++
  if (frameMsN >= 60) {
    frameMsAvg = frameMsSum / frameMsN
    frameMsSum = 0
    frameMsN = 0
  }
  const t = clock - cineStart
  if (cine === 1) {
    rift.update(dt, t, riftAt)
    if (!cueRiftOpen && t > 1.5) {
      cueRiftOpen = true
      playSlot('cine.rift.open')
    }
    // timeline: 0-3 s strike; 3 s bird's-eye above the rift; 9 s third-person glimpse; 15 s snap back
    if (t > 3 && t < 9 && camTests.mode !== 3) camTests.setMode(3, riftAt)
    if (t >= 9 && t < 15 && camTests.mode !== 4) camTests.setMode(4, riftAt)
    if (t >= 15) {
      playSlot('cine.rift.snap')
      camTests.setMode(0)
      cine = 0
      rift.hide()
      note('cinematic done: snapped back')
    }
  } else {
    if (rift.built) rift.hide()
  }
  if (cine === 2 && t > 20) {
    // the aurora lasts 20 s, then the night lifts
    cine = 0
    if (skyDome.on) skyDome.toggle()
    aurora.hide()
    note('aurora over')
  }
  if (cine === 2) aurora.update(clock, me)
  else if (aurora.cols.length) aurora.hide()
  // Cinematic 3: a storm on the night planes (flashes, strobing, crackle) for 12 s, then it hands off to the endgame plume and portal
  if (cine === 3) {
    const tt = t
    const flash = tt < 12 ? (Math.sin(tt * 23) > 0.7 || Math.random() < 0.04 ? 1 : 0.05 + 0.1 * Math.abs(Math.sin(tt * 3))) : 0
    skyDome.setFlash(flash)
    if (tt < 12 && Math.random() < 0.05) playSlot('cine.carrington.crackle')
    if (tt >= 12) {
      skyDome.setFlash(0)
      playSlot('cine.carrington.ignite')
      if (skyDome.on) skyDome.toggle()
      cine = 0
      if (mode === 'test') {
        egTest = 1
        egAnchor = { x: world0.x, y: world0.y, z: world0.z + 8 }
      }
      note('storm over: the endgame')
    }
  } else skyDome.setFlash(0)
}

export function gameDebug() {
  return { cine, dome: skyDome.on, cam: camTests.mode, egTest, mode }
}


// ---------------- round 8: dialogue, replay menu, timeout glimpse, final cinematic ----------------
function toast(body: string, seconds = 4) {
  openDialog('info', clock, () => {}, { title: 'EMANATE (test)', body })
  toastUntil = clock + seconds
}
let toastUntil = 0
let reopenReplayAt = 0

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
function testReplayPick(p: string) {
  testReplays++
  closeDialog()
  if (testReplays >= 3) {
    testReplays = 0
    startFinal()
  } else {
    toast(`Replay "${p}" started (test): ${testReplays} of 3 replayed rounds counted`, 3)
    reopenReplayAt = clock + 4
  }
}
function serverPick(p: string) {
  if (p === 'help' || p === 'doubts' || p === 'A' || p === 'B') {
    sendGameEvent({ ev: 'choice', pick: p })
    if (p === 'doubts') openDialog('doubts', clock, serverPick)
    else closeDialog()
  } else {
    sendGameEvent({ ev: 'replay', kind: p === 'again' ? 'again' : 'round', round: p.startsWith('round:') ? Number(p.slice(6)) : 1 })
    closeDialog()
  }
}
function shiftKeys(pressed: (a: InputAction) => boolean) {
  if (pressed(InputAction.IA_ACTION_3)) {
    // Shift + 1: the choice dialogue: the pitch, then the Dev Team message
    openDialog('pitch', clock, testPick)
    emit('dialogue-test', {})
    note('DIALOGUE TEST: the Synth pitch')
  }
  if (pressed(InputAction.IA_ACTION_4)) {
    // Shift + 2: the round timeout: the five-minute warning cue, then the glimpse of where the Synth is hiding, then it snaps back
    note('ROUND TIMEOUT TEST: 5 minutes left (cue), then the glimpse')
    playSlot('warn.five_minutes')
    startGlimpse(testMovingSynth(testClock), 8)
    emit('timeout-test', {})
  }
  if (pressed(InputAction.IA_ACTION_5)) {
    // Shift + 3: the replay menu after the Ending (three replayed rounds trigger the final cinematic)
    openDialog('replay', clock, testReplayPick, { replayCount: testReplays })
    emit('replay-test', { count: testReplays })
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
  if (reopenReplayAt > 0 && clock >= reopenReplayAt) {
    reopenReplayAt = 0
    if (dialog.kind === 'none') openDialog('replay', clock, testReplayPick, { replayCount: testReplays })
  }
  if (mode !== 'server' || !serverState) return
  const st = serverState.you?.dialog
  if (st === 'pitch' && dialog.kind !== 'pitch') openDialog('pitch', clock, serverPick)
  else if (st === 'doubts' && dialog.kind !== 'doubts') openDialog('doubts', clock, serverPick)
  else if (st === 'done' && (dialog.kind === 'pitch' || dialog.kind === 'doubts')) closeDialog()
  const ms = serverState.match?.state
  const act = replayMenuAction(ms, dialog.kind === 'replay') // c24i: the menu closes in EVERY state but 'ended' (a server reset into 'lobby' used to leave it stuck)
  if (act === 'open') openDialog('replay', clock, serverPick, { replayCount: serverState.match.replayCount ?? 0 })
  else if (act === 'close') closeDialog()
}
function startGlimpse(spot: Vec, seconds: number) {
  glimpse = { until: clock + seconds, spot }
  riftAt = toLocal(spot)
  camTests.setMode(4, riftAt)
  emit('glimpse', { spot, seconds })
}
function glimpseUpdate() {
  if (!glimpse) return
  standIn.update(toLocal(glimpse.spot), clock)
  if (clock >= glimpse.until) {
    glimpse = null
    camTests.setMode(0)
    standIn.hide()
    note('glimpse over: back to your avatar')
  }
}
function startFinal() {
  finalBanner = clock + 12
  startCine(3, toLocal(testMovingSynth(testClock)))
  openDialog('info', clock, () => {}, { title: 'THE FINAL CINEMATIC', body: 'Three replayed rounds. The sky ignites.' })
  toastUntil = clock + 6
  emit('final-cinematic', {})
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
        case 'hud': { // { text, seconds }: a line on the screen
      const text = typeof c.text === 'string' ? c.text.slice(0, 160) : ''
      hudMsg = text ? { text, until: clock + Math.max(0.5, Math.min(60, num(c.seconds, 5))) } : null
      break
    }
    case 'sound': { // { id }: a slot id of the audio list, or lib:<name>
      if (typeof c.id === 'string' && c.id.length <= 60) playSlot(c.id)
      break
    }
    case 'fx': { // { kind, x,y,z (world) | at:'me', size, seconds, color, n, height, heading }
      if (typeof c.kind !== 'string') break
      const at = c.at === 'me' || c.x === undefined ? curMe : toLocal({ x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) })
      fxLib.spawn(c.kind, at, clock, { size: num(c.size, 3), seconds: num(c.seconds, 3), color: c.color, n: num(c.n, 12), height: num(c.height, 20), heading: num(c.heading, 0) })
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
function riftOpening(at: Vec) {
  // the Rift opening as its own effect: the lobby bubble's centre
  fxLib.spawn('portal', at, clock, { size: 5, seconds: 10, height: 18, color: 'red' })
  fxLib.spawn('smoke', { x: at.x, y: at.y, z: at.z + 5 }, clock, { size: 5, seconds: 10, height: 200, n: 30 })
}
function hideAll() {
  for (const k of Object.keys(arrows.runs) as (keyof typeof arrows.runs)[]) arrows.runs[k].target = null
  arrows.update(0, clock, curMe)
  plumes.keepOnly(new Set())
  fxLib.clear()
  particleFx.clear()
  trapMarks.update(clock, [])
  dropMarkers.update(clock, toWorld(curMe), [])
  bubbleFx.hide()
  burstRift.hide()
  burstState = null
  if (endgameFx.built) endgameFx.hide()
  if (skyDome.on) skyDome.toggle()
  camTests.setMode(0)
  standIn.hide()
  rift.hide()
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
