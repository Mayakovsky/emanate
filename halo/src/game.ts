// EMANATE Build 04: the halo's gameplay layer. Keys 1-4 (arrows, plumes), warnings, charging arcs, upgrades.
// With the local game server up, targets come from it. Otherwise TEST MODE: fixed and moving test targets around the spawn.
import { engine, inputSystem, InputAction, PointerEventType, PlayerIdentityData, AvatarBase, Physics } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { getUserData } from '~system/UserIdentity'
import { skyUpdate, skyText, skyStart } from './sky'
import { openDialog, closeDialog, setDialogClock, dialog } from './dialog'
import { planParticles } from './particleplan'
import { ParticleFx, FxLib, playLib, FX_KINDS, Arrows, Plumes, ChargeArcs, DropMarkers, TrapMarkers, BubbleFx, RiftFx as BurstRiftFx, TestMarkers, EndgameFx, SkyDome, StandIn, RiftFx, AuroraFx, DistanceMarkers, CameraTests, MARKER_COLOR_NAMES, MARKER_DISTANCES, initSounds, playSlot, playSound, soundsUpdate, setRemoteAudio, audioStats, slotSource } from './fx'
import { idle, setIdle, refetchSettings, cmdQueue, settingsInfo, refusedNote, emit, netUpdate, sendGameEvent, serverState, serverUp, probeWebSocket, probeAll, probeText, lastErr, netStatus, lastGameError, manifestUpdate, manifestInfo } from './net'
import { probeTick, probeRun, PROBE } from './probe'
import { FXS, TICK, applyRemote, feature, say, PROTOCOL_VERSION } from './settings'
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
let promptUntil = 0 // the glider prompt
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
let testBubble: { at: Vec; radius: number; until: number } | null = null // the Ctrl+2 test dome around the wearer
let lobbyNote = ''
let testDropsGone = new Map<string, number>() // test drop id -> time it can come back
let testRoundStart = 0
let mode: 'test' | 'server' = 'test'
let lastEventNote = ''
let started = false
const announcedEnd = new Set<string>()

export function gameInit() {
  initSounds()
  probeWebSocket()
  probeAll()
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
  if (!feature('trap')) return
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
  const extra = (clock < restoredUntil ? restoredNote + '\n' : '') + (lobbyNote ? lobbyNote + '\n' : '') + (probeNote ? probeNote + '\n' : '')
  return `${extra}${manifestInfo}; slots ${audioStats.slots}, packed ${audioStats.packed}, last ${audioStats.lastSlot || '-'} (${audioStats.lastSource || '-'})
frame ${frameMsAvg.toFixed(1)} ms (${(1000 / Math.max(1, frameMsAvg)).toFixed(0)} fps)\nerr: ${lastGameError || 'none'}
id ${myId.slice(0, 12)}${idReady ? '' : ' (not stable)'}
pos local (${curMe.x.toFixed(1)}, ${curMe.y.toFixed(1)}, ${curMe.z.toFixed(1)}) world (${(curMe.x + ORIGIN.x).toFixed(1)}, ${(curMe.z + ORIGIN.z).toFixed(1)})
net ${ns.up ? 'UP' : 'down'} fails=${ns.failCount} ${ns.lastErr}
${probeText}
${PROBE}
${skyText}
${round}   keys: 1 red ${cd('red')}  2 pink ${cd('pink')}  3 dead-zone ${warnings.deadZoneEnabled ? 'ON' : 'off'} ${cd('white')}  4 plumes ${left}   E trap ${hasTrap ? 'DOWN' : 'ready'}   boost ${boostLeft > 0 ? boostLeft.toFixed(0) + 's' : '-'}${trapLeft > 0 ? '   TRAPPED ' + trapLeft.toFixed(0) + 's' : ''}   ${lastEventNote}`
}

// ---- the per-frame update; me = the wearer's scene-local position ----
export function gameUpdate(dt: number, me: Vec, speed: number, airborne: boolean, tier: number, vy: number) {
  probeTick(dt, me)
  if (!started) return
  clock += dt
  if (idle) {
    // the server's kill switch (or a refusal): nothing is drawn, nothing is forced, nothing is sent about the player
    if (!wasIdle) { wasIdle = true; hideAll(); emit('idle', { on: true }) }
    netUpdate(dt, { pid: myId, name: myName, pos: toWorld(me), local: me, speed, tier }) // only the bare wake-up poll runs while idle
    return
  }
  if (wasIdle) { wasIdle = false; emit('idle', { on: false }) }
  while (cmdQueue.length) { try { runCommand(cmdQueue.shift()!) } catch (e) { emit('error', { where: 'command', msg: String(e) }) } }
  if (pushUntil > clock) Physics.applyForceToPlayer(PUSH_SOURCE, Vector3.create(pushForce.x, pushForce.y, pushForce.z))
  else if (pushUntil !== 0) { pushUntil = 0; Physics.removeForceFromPlayer(PUSH_SOURCE) }
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
  const ctrl = inputSystem.isPressed(InputAction.IA_WALK) // Ctrl (Walk) + 1..3: the round-12 probes (lift and glide, bubble burst, movePlayerTo)
  const shiftOnly = inputSystem.isPressed(InputAction.IA_MODIFIER) && !ctrl // Shift (the client's Sprint/modifier key) + 1..4: the round-8 test triggers
  const shift = shiftOnly || ctrl
  const pressedKey = (a: InputAction) => !shift && pressed(a)
  if (shiftOnly) shiftKeys(pressed)
  if (ctrl) ctrlKeys(pressed, me, world)
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
  gliderPrompt(airborne, tier)
  syncPlumes(me)
  syncTraps(me, world)
  syncBubble(dt, me, world)
  liftGlideUpdate(dt, me, world, vy, airborne)
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
  } else if (testBubble) {
    if (clock > testBubble.until) { burstState = { t0: clock, at: testBubble.at, radius: testBubble.radius }; testBubble = null; playSlot('cine.rift.strike') }
    else { bubbleFx.show(clock, testBubble.at, testBubble.radius, true); shown = true }
  }
  if (burstState) {
    const t = clock - burstState.t0
    burstRift.update(dt, t, burstState.at)
    bubbleFx.burst(clock, t, burstState.at, burstState.radius)
    if (t > 2.6) { burstState = null; burstRift.hide(); bubbleFx.hide() }
  } else if (!shown) bubbleFx.hide()
}

// ---- the round-12 probes (Ctrl + 1, 2, 3): each reports to the HUD, to the console log and (with the server up) to the server's probe log ----
function probeReport(what: string, data: Record<string, unknown>) {
  emit('probe', { what, ...data })
  if (mode === 'server') sendGameEvent({ ev: 'probe', what, text: JSON.stringify(data).slice(0, 380) })
  console.log('[halo] PROBE ' + what + ' ' + JSON.stringify(data))
}
const LIFT_SOURCE = engine.addEntity()
const LIFT_TARGETS = [50, 100, 150, 200]
let liftIdx = 0
interface LiftGlide { phase: 'lift' | 'glide' | 'done'; target: number; start: Vec; t0: number; tRelease: number; release: Vec | null; sampleAt: number; sinkSum: number; sinkN: number; hSum: number; wasAir: boolean; maxY: number }
let lg: LiftGlide | null = null
let probeNote = ''
export function probeHud() {
  return probeNote
}
// Ctrl+1: lift to a chosen altitude (50, 100, 150, 200 m; each press picks the next) with a sustained upward force, release it, then the wearer HOLDS JUMP to open the unpowered glider and steers;
// the probe logs the sink rate, the horizontal speed, the landing spot and the time taken
function startLiftGlide(world: Vec, altitude?: number) {
  if (lg && lg.phase !== 'done') {
    Physics.removeForceFromPlayer(LIFT_SOURCE)
    probeReport('lift-glide', { aborted: true })
    lg = null
    probeNote = 'lift-glide: aborted'
    return
  }
  const target = altitude !== undefined ? Math.max(20, Math.min(220, altitude)) : LIFT_TARGETS[liftIdx % LIFT_TARGETS.length]!
  if (altitude === undefined) liftIdx++
  lg = { phase: 'lift', target, start: { ...world }, t0: clock, tRelease: 0, release: null, sampleAt: 0, sinkSum: 0, sinkN: 0, hSum: 0, wasAir: false, maxY: world.y }
  probeReport('lift-glide', { start: world, target })
  probeNote = `lift-glide: lifting to ${target} m (press Ctrl+1 again to abort)`
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
      promptUntil = clock + 12
      probeReport('lift-glide', { released: true, y: world.y, liftSeconds: +(clock - s.t0).toFixed(1), x: world.x, z: world.z })
    }
    probeNote = `lift-glide: lifting ${world.y.toFixed(0)}/${s.target} m, climb ${vy.toFixed(1)} m/s`
    return
  }
  // glide: the wearer holds jump to open the glider; sample once a second
  if (clock - s.sampleAt >= 1) {
    s.sampleAt = clock
    const sink = -vy
    s.sinkSum += sink
    s.sinkN++
    s.hSum += Math.hypot(me.x - (s.release ? toLocal(s.release).x : me.x), me.z - (s.release ? toLocal(s.release).z : me.z))
    probeReport('lift-glide', { glide: true, t: +(clock - s.tRelease).toFixed(0), y: +world.y.toFixed(1), sink: +sink.toFixed(2), x: +world.x.toFixed(0), z: +world.z.toFixed(0) })
    probeNote = `lift-glide: HOLD JUMP to glide. t ${(clock - s.tRelease).toFixed(0)} s, y ${world.y.toFixed(0)} m, sink ${sink.toFixed(2)} m/s`
  }
  if (!airborne && s.wasAir && clock - s.tRelease > 1.5) {
    const rel = s.release ?? s.start
    const dx = world.x - rel.x
    const dz = world.z - rel.z
    const secs = clock - s.tRelease
    s.phase = 'done'
    const horiz = Math.hypot(dx, dz)
    probeReport('lift-glide', { landed: true, x: +world.x.toFixed(0), y: +world.y.toFixed(1), z: +world.z.toFixed(0), glideSeconds: +secs.toFixed(0), horizontalFromRelease: +horiz.toFixed(0), meanHorizontalSpeed: +(horiz / Math.max(1, secs)).toFixed(2), meanSink: +(s.sinkSum / Math.max(1, s.sinkN)).toFixed(2), maxAltitude: +s.maxY.toFixed(0) })
    probeNote = `lift-glide LANDED: ${secs.toFixed(0)} s, ${horiz.toFixed(0)} m from the release point, mean sink ${(s.sinkSum / Math.max(1, s.sinkN)).toFixed(2)} m/s, mean speed ${(horiz / Math.max(1, secs)).toFixed(1)} m/s`
  }
  s.wasAir = airborne
}
// Ctrl+3: the scene teleport call, once: what happens (refused, a permission prompt, moved)
function probeMovePlayerTo(world: Vec) {
  probeNote = 'movePlayerTo probe: calling...'
  try {
    // loaded only when the probe runs: a wearable runtime that does not offer the module must not break the halo at start-up
    const ra = (globalThis as any).require ? (globalThis as any).require('~system/RestrictedActions') : null
    if (!ra || typeof ra.movePlayerTo !== 'function') {
      probeReport('movePlayerTo', { result: 'module-or-function-missing', haveRequire: !!(globalThis as any).require })
      probeNote = 'movePlayerTo probe: the module is not available to this wearable'
      return
    }
    const target = { x: world.x + 20, y: world.y, z: world.z }
    const t0 = clock
    const p = ra.movePlayerTo({ newRelativePosition: Vector3.create(me0().x + 20, me0().y, me0().z) })
    Promise.resolve(p).then(
      (r: unknown) => { probeReport('movePlayerTo', { result: 'returned', value: JSON.stringify(r), seconds: +(clock - t0).toFixed(1), from: world, asked: target }); probeNote = 'movePlayerTo probe: returned ' + JSON.stringify(r) },
      (e: unknown) => { probeReport('movePlayerTo', { result: 'rejected', error: String(e).slice(0, 200) }); probeNote = 'movePlayerTo probe: rejected ' + String(e).slice(0, 80) }
    )
  } catch (e) {
    probeReport('movePlayerTo', { result: 'threw', error: String(e).slice(0, 200) })
    probeNote = 'movePlayerTo probe: threw ' + String(e).slice(0, 80)
  }
}
const me0 = () => curMe
// the server asks for a teleport (the group start, or the admin's limit probe): one movePlayerTo call, the result and where the avatar ends up are reported to the server's probe log
const teleportPending: { id: string; t0: number; from: Vec; asked: Vec; result: string; checkAt: number }[] = [] // one entry per call: every call is reported
function serverTeleport(ev: any) {
  const asked = { x: Number(ev.x), y: Number(ev.y), z: Number(ev.z) }
  if (![asked.x, asked.y, asked.z].every((v) => Number.isFinite(v))) return
  const id = String(ev.id ?? '').slice(0, 24)
  const from = toWorld(curMe)
  note(`teleport ${id}: ${Math.round(Math.hypot(asked.x - from.x, asked.z - from.z))} m`)
  try {
    const ra = (globalThis as any).require ? (globalThis as any).require('~system/RestrictedActions') : null
    if (!ra || typeof ra.movePlayerTo !== 'function') {
      probeReport('teleport', { id, result: 'module-or-function-missing' })
      return
    }
    const local = toLocal(asked)
    const t0 = clock
    const tp = { id, t0, from, asked, result: 'calling', checkAt: 1e9 }
    teleportPending.push(tp)
    Promise.resolve(ra.movePlayerTo({ newRelativePosition: Vector3.create(local.x, local.y, local.z) })).then(
      (r: unknown) => { tp.result = 'returned ' + JSON.stringify(r).slice(0, 60); tp.checkAt = clock + 1.5; tp.t0 = clock - tp.t0 },
      (e: unknown) => { probeReport('teleport', { id, result: 'rejected', error: String(e).slice(0, 160), from, asked }); const k = teleportPending.indexOf(tp); if (k >= 0) teleportPending.splice(k, 1) }
    )
  } catch (e) {
    probeReport('teleport', { id, result: 'threw', error: String(e).slice(0, 160), from, asked })
  }
}
function teleportCheck() {
  for (const tp of [...teleportPending]) {
    if (clock < tp.checkAt) continue
    teleportPending.splice(teleportPending.indexOf(tp), 1)
    const now = toWorld(curMe)
    probeReport('teleport', { id: tp.id, result: tp.result, seconds: +Number(tp.t0).toFixed(2), from: tp.from, asked: tp.asked, ended: now, error_m: +Math.hypot(now.x - tp.asked.x, now.y - tp.asked.y, now.z - tp.asked.z).toFixed(1), airborne: lastAirborne })
  }
}
function ctrlKeys(pressed: (a: InputAction) => boolean, me: Vec, world: Vec) {
  if (pressed(InputAction.IA_ACTION_3)) startLiftGlide(world)
  if (pressed(InputAction.IA_ACTION_4)) {
    // Ctrl + 2: the bubble blows: a 10 m dome around the wearer for 4 s, then the burst with the Rift lightning
    if (burstState) return
    testBubble = { at: { ...me }, radius: 10, until: clock + 4 }
    probeReport('bubble-burst', { at: world, radius: 10, note: 'dome for 4 s, then the burst' })
    probeNote = 'bubble burst: dome for 4 s, then it blows'
  }
  if (pressed(InputAction.IA_ACTION_5)) probeMovePlayerTo(world)
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
    case 'round-start': budget.refill(); note(say('roundStart', { round: ev.round })); playSlot('round.start'); break
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
    case 'lobby': lobbyNote = `LOBBY: everyone into the bubble (${Math.round(ev.seconds)} s)`; note(say('lobbyCall')); playSlot('warn.upgrade'); break
    case 'lobby-end': lobbyNote = ''; note(say('lobbyEnd', { mode: ev.mode, count: ev.count })); playSlot('cine.rift.strike'); if (lastBubble) { burstState = { t0: clock, at: lastBubble.at, radius: lastBubble.radius }; riftOpening(lastBubble.at) }; break
    case 'lobby-wait': lobbyNote = 'waiting for the next lobby'; note('the game started without you: you wait for the next lobby'); break
    case 'teleport': serverTeleport(ev); break
    case 'toss': runCommand({ c: 'lift', altitude: Number(ev.altitude) || 100 }); probeReport('toss-event', { round: ev.round, altitude: ev.altitude }); break
    case 'trap-hit': playSlot('warn.upgrade'); note(ev.synth ? 'Discharge Trap hit the Synth' : 'Discharge Trap went off'); emit('trap-hit', { x: ev.x, z: ev.z, synth: ev.synth, players: ev.players }); break
    case 'endgame': note(`endgame: ${ev.kind}`); break
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
  if (ms === 'ended' && dialog.kind !== 'replay') openDialog('replay', clock, serverPick, { replayCount: serverState.match.replayCount ?? 0 })
  else if (ms === 'playing' && dialog.kind === 'replay') closeDialog()
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
    case 'probe': probeRun(String(c.name ?? '')); break // round 24: test builds only
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
    case 'push': { // { x,y,z, seconds }: a force on the wearer for a while (limited)
      const f = { x: Math.max(-40, Math.min(40, num(c.x, 0))), y: Math.max(-40, Math.min(60, num(c.y, 0))), z: Math.max(-40, Math.min(40, num(c.z, 0))) }
      pushForce = f
      pushUntil = clock + Math.max(0.1, Math.min(10, num(c.seconds, 1)))
      break
    }
    case 'lift': startLiftGlide(toWorld(curMe), num(c.altitude, 100)); break // the lift-and-glide start: the halo lifts, releases, and prompts for the glider
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
function gliderPrompt(airborne: boolean, tier: number) {
  if (airborne && !lastAirborne && tier >= 3 && FXS.gliderPrompt > 0) promptUntil = clock + FXS.gliderPromptSeconds
  if (inputSystem.isPressed(InputAction.IA_JUMP) && promptUntil > 0 && clock - (promptUntil - FXS.gliderPromptSeconds) > 1) promptUntil = 0 // jump is held: the glider is being opened
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
  promptUntil = 0
}
/** the lines index.ts draws on screen: the always-on honest line, a server message, the glider prompt */
export function hudOverlay() {
  return {
    active: idle ? '' : feature('activeLine') ? say('activeLine') : '',
    msg: idle ? (refusedNote || say('idle')) : hudMsg && clock < hudMsg.until ? hudMsg.text : '',
    prompt: !idle && promptUntil > clock ? say('gliderPrompt') : '',
    info: settingsInfo()
  }
}
