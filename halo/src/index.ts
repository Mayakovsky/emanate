// EMANATE Build 02b: halo movement revamp (Zone). Plain test code, no graphics, no network.
//
// Three stacking tiers plus Normal (0); the server sets the tier (E now places a Discharge Trap). There is no Normal mode: players start
// with the Sprint Round.
//   1 SPRINT   boosted run speed from the start
//   2 JUMP     sprint + a small bump to the normal jump + a LARGE double jump (~10 m); gliding stays
//   3 FLYING   sprint + jumps + Flying mode. Opening the glider (jump, double jump, jump again in the
//              air) turns Flying on; closing it ends it. While flying the player sinks at one very
//              low constant rate (FLY_SINK, slower than a feather). Boost is how the player moves:
//                F  the ONE boost key (HOLD it): a sustained force along the CAMERA's look direction,
//                   pitch included. Look up + F = climb, look level + F = forward and holds height,
//                   look down + F = dive. The glider only stays open while JUMP is HELD (Unity
//                   closes it when the jump button is released), so hold Space + F. Upward force
//                   fades to zero approaching the 200 m ceiling (the most other players can see).
//
// SPEED CAP: total speed is kept under 50 m/s in every tier and under boost (50 m/s is the most
// other players can see). Boost is scaled so it cannot push past SPEED_CAP along its direction,
// and a brake force opposes the velocity whenever the player is over SPEED_CAP for any reason (a
// long dive, stacked boosts).
//
// The halo reapplies its settings EVERY FRAME: a parcel scene the player walks into also writes
// AvatarLocomotionSettings and the last writer wins.
//
// It logs the tier, position and velocity (from Transform deltas) every 0.5 s, and EVERY input
// event it receives, because whether a smart wearable receives key presses is part of the test.
//
// NOTE: this SDK version has no component that says whether the player is gliding, so the boost
// keys are live for the whole of tier 3 (not only while the glider is open); the log shows vy so
// the test can tell them apart. The sink rate (glidingFallingSpeed) only applies while gliding.
import {
  engine,
  AvatarLocomotionSettings,
  Transform,
  inputSystem,
  InputAction,
  PointerEventType,
  Physics,
  PhysicsCombinedForce
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { emit } from './net'
import { gameInit, gameUpdate, gameTier, gamePlaceTrap, gameHud, hudOverlay, powersAllowed, blastActive, gateInfo } from './game'
import { idle } from './net'
import ReactEcs, { UiEntity, Label, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { dialogUi } from './dialog'
import { POWER as P, feature, BUILD_ID } from './settings'

type Tier = 0 | 1 | 2 | 3 // 0 normal (no powers), 1 Speed, 2 Jump, 3 Fly: the server decides the tier (round level, a Halo boost, a Discharge Trap hit)
const TIER_NAMES: Record<Tier, string> = { 0: 'NORMAL', 1: 'SPRINT', 2: 'JUMP', 3: 'FLYING' }

// ---- tunables (adjust from the Zone measurements) ----
// Tier 1: sprint (normal: jog 8, run 10). Target run 15-25 m/s.
// Tier 2: small normal-jump bump (normal ~1 m) + large double jump (~10 m, ~three stories).
// Tier 3: Flying. Constant drift-down while the glider is open (a falling feather is ~0.5-1 m/s).
// Boost = a SUSTAINED FORCE while F is held, along the camera look direction (pitch included).
// Real Unity values (CharacterControllerSettings.asset, from Desktop): Gravity -10, JumpGravityFactor 4
// (gravity x4 = 40 m/s^2 while moving UP), GlideWindResponse 1.5 (continuous forces x1.5 while gliding),
// CharacterMass 1, ExternalEnvDrag 0.5. Vertical: net accel = F.y*1.5 - gravity, so holding height while
// falling needs F.y ~ 6.7 (10/1.5) and KEEPING a climb going needs F.y ~ 26.7 (40/1.5). Horizontal
// F.x/F.z adds to the external velocity each frame (x1.5 while gliding). While the glider is open Unity
// also clamps FALL speed to glidingFallingSpeed (ApplyGliding), so a dive needs that raised (see DIVE_SINK).
// ---- Build 02d limits (1 s averages as the Synth sees them; Forces's numbers) ----
// ---- Build 02d quick landing: hardLandingCooldown overrides Unity's LongFallStunTime (0.75 s) ----
// ---- Build 02d momentum jump (halo-tools/jump_sim.py): quadratic air drag + weak air accel make a run jump settle ~10 m/s ----
const BOOST_SOURCE = engine.addEntity()
const BRAKE_SOURCE = engine.addEntity()
const AIR_SOURCE = engine.addEntity()

let tier: Tier = 1
let baseTier: Tier = 1
let logTimer = 0
let hudTimer = 0
let prevPos: Vector3 | undefined
let speed = 0
let vy = 0
let vySm = 0 // smoothed vertical speed, for the force ramps
let vel = Vector3.Zero() // measured velocity from Transform deltas
let velSm = Vector3.Zero() // smoothed (~0.15 s) for the limits and ramps
let hSm = 0 // smoothed horizontal speed
// momentum jump state
let airborne = false
let airT = 0
let stillFrames = 0
let h0 = 0 // horizontal speed at takeoff
let hPrev = Vector3.Zero() // horizontal velocity while on the ground (slow filter)
let carryDir = Vector3.Zero()
let elapsed = 0
let maxHeight = 0
let maxSpeed = 0

const ACTIONS: [InputAction, string][] = [
  [InputAction.IA_PRIMARY, 'E/IA_PRIMARY'],
  [InputAction.IA_SECONDARY, 'F/IA_SECONDARY'],
  [InputAction.IA_ACTION_3, '1/IA_ACTION_3'],
  [InputAction.IA_ACTION_4, '2/IA_ACTION_4'],
  [InputAction.IA_ACTION_5, '3/IA_ACTION_5'],
  [InputAction.IA_ACTION_6, '4/IA_ACTION_6'],
  [InputAction.IA_JUMP, 'JUMP'],
  [InputAction.IA_FORWARD, 'FORWARD']
]

function setTier(next: Tier) {
  tier = next
  Physics.removeForceFromPlayer(BOOST_SOURCE)
  Physics.removeForceFromPlayer(BRAKE_SOURCE)
  Physics.removeForceFromPlayer(AIR_SOURCE)
  airborne = false
  console.log(`[halo] TIER -> ${tier} ${TIER_NAMES[tier]}`)
  emit('tier', { tier, name: TIER_NAMES[tier] })
}

// Tiers stack: each keeps everything from the one before.
// ---- on-screen diagnostic readout (so we can SEE what the game delivers to the wearable) ----
let hudText = 'halo: starting...'
function hudUi() {
  const d = dialogUi()
  const o = hudOverlay()
  const line = (text: string, top: string, size: number, color: Color4) =>
    text ? ReactEcs.createElement(UiEntity, { uiTransform: { positionType: 'absolute', position: { top, left: '30%' }, width: '40%', height: 30, pointerFilter: 'none' } }, ReactEcs.createElement(Label, { value: text, fontSize: size, textAlign: 'middle-center', color })) : null
  return ReactEcs.createElement(
    UiEntity,
    { uiTransform: { positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' } },
    ReactEcs.createElement(
      UiEntity,
      {
        uiTransform: { positionType: 'absolute', position: { top: '42%', left: '1%' }, width: 720, height: 270, pointerFilter: 'none' },
        uiBackground: { color: Color4.create(0, 0, 0, idle || !feature('debugPanel') ? 0 : 0.55) }
      },
      feature('debugPanel') && !idle ? ReactEcs.createElement(Label, { value: hudText + '\n' + o.info, fontSize: 14, textAlign: 'top-left', color: Color4.White() }) : null
    ),
    line(o.active, '0.5%', 11, Color4.create(1, 1, 1, 0.7)),
    o.flash > 0.01 ? ReactEcs.createElement(UiEntity, { uiTransform: { positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }, uiBackground: { color: Color4.create(1, 1, 1, o.flash) } }) : null,
    line(o.msg, '12%', 20, Color4.create(1, 0.95, 0.5, 1)),
    line(o.prompt, '20%', 22, Color4.create(0.5, 1, 0.8, 1)),
    d
  )
}
let stockPrev: { x: number; z: number } | null = null
let stockSpeed = 0
let diving = false // set each frame by the boost code: F held and looking down

function applySettings() {
  if (tier === 0) {
    // normal: no powers (a Discharge Trap hit on a level-1 player): the client's own locomotion defaults
    AvatarLocomotionSettings.deleteFrom(engine.PlayerEntity)
    return
  }
  const settings: Record<string, number> = { walkSpeed: P.walkSpeed, jogSpeed: P.jogSpeed, runSpeed: P.runSpeed, hardLandingCooldown: P.landCooldown }
  if (tier >= 2) {
    settings.doubleJumpHeight = P.doubleJumpHeight
    // a faster run jumps higher (read when the jump starts); the double jump is unchanged
    const f = 1 + P.jumpBonus * Math.max(0, Math.min(1, hSm / 18))
    settings.jumpHeight = P.jumpHeight * f
    settings.runJumpHeight = P.runJumpHeight * f
  }
  // the glider clamps FALL speed to this: slow drift normally, a high limit while diving
  if (tier >= 3) settings.glidingFallingSpeed = diving ? P.diveSink : P.flySink
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, settings)
}

function liftFactor(y: number): number {
  return Math.max(0, Math.min(1, (P.ceiling - y) / P.ceilingTaper))
}

function halo(dt: number) {
  elapsed += dt
  if (idle || !feature('powers') || !powersAllowed()) { // c26: no consent / no lease / opt-out: the stock avatar
    // idle (the server's kill switch) or the powers switched off: the client's own locomotion, no forces
    if (tier !== 0) setTier(0)
    hudText = 'EMANATE halo: stock avatar (' + (idle ? 'off' : powersAllowed() ? 'on' : 'not joined, paused or lease ended') + '), build ' + BUILD_ID // c27: the panel must not show the last powered frame while the wearer is stock
    AvatarLocomotionSettings.deleteFrom(engine.PlayerEntity)
    Physics.removeForceFromPlayer(BOOST_SOURCE)
    Physics.removeForceFromPlayer(BRAKE_SOURCE)
    Physics.removeForceFromPlayer(AIR_SOURCE)
    const t0 = Transform.getOrNull(engine.PlayerEntity)
    if (t0 && stockPrev && dt > 0) { const sp = Math.hypot(t0.position.x - stockPrev.x, t0.position.z - stockPrev.z) / dt; stockSpeed = stockSpeed * 0.9 + Math.min(sp, 150) * 0.1; hudText += '  ' + gateInfo() + '  speed ' + stockSpeed.toFixed(1) + ' m/s' }
    if (t0) stockPrev = { x: t0.position.x, z: t0.position.z }
    if (t0) try { gameUpdate(dt, Vector3.create(t0.position.x, t0.position.y, t0.position.z), 0, false, 0, 0) } catch (e) {}
    return
  }

  // ---- input (and log everything we receive) ----
  for (const [action, name] of ACTIONS) {
    if (inputSystem.isTriggered(action, PointerEventType.PET_DOWN)) {
      console.log(`[halo] INPUT down ${name}`)
      emit('key', { key: name })
    }
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    // E: place a Discharge Trap where you stand (one at a time). Halo boosts now apply the moment they are picked up, so E no longer uses an upgrade or cycles the tier.
    gamePlaceTrap() // (c30: the F + E camera tests are gone: no camera tricks any more)
  }
  {
    const want = gameTier(baseTier)
    if (want !== tier) setTier(want)
  }

  // ---- reapply settings every frame ----
  applySettings()

  // ---- tier 3: boost = sustained force along the camera look direction while F is held ----
  const t = Transform.getOrNull(engine.PlayerEntity)
  let boostLog = 'off'
  diving = false
  if (tier === 3 && t) {
    if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
      // the camera's look direction (pitch included); fall back to the avatar's facing if the
      // camera transform is not readable
      const cam = Transform.getOrNull(engine.CameraEntity)
      const look = Vector3.normalize(Vector3.rotate(Vector3.Forward(), (cam ?? t).rotation))
      const sinp = Math.max(-1, Math.min(1, look.y))
      const cosp = Math.sqrt(Math.max(0, 1 - sinp * sinp))
      const hLen = Math.sqrt(look.x * look.x + look.z * look.z)
      // horizontal: along the look direction, scaled by cos(pitch)
      // fade the push out as the horizontal speed approaches H_MAX
      const hRamp = Math.max(0, Math.min(1, (P.hMax - hSm) / 3))
      const fx = hLen > 1e-4 ? (look.x / hLen) * P.fwdForce * cosp * hRamp : 0
      const fz = hLen > 1e-4 ? (look.z / hLen) * P.fwdForce * cosp * hRamp : 0
      // vertical. WHY not 'switch to the rising force once rising': gravity jumps from 10 to 40 the moment
      // vy > 0, so a force chosen from the measured vy balances at vy ~ 0 and never climbs (this is what
      // flew in c7e3381; simulated in halo-tools). So: looking UP (beyond ~10 deg) always uses the strong
      // 'rising' force; the climb is capped by easing off above a target rate that scales with the pitch.
      // Level (or within ~10 deg) uses the hold force (holds height). Looking DOWN adds a downward force.
      let fy = P.fyHold
      if (sinp > 0) {
        const w = Math.max(0, Math.min(1, sinp / 0.17)) // 0 level .. 1 at ~10 degrees up
        const base = P.fyHold + (P.fyRising - P.fyHold) * w + P.climbForce * sinp
        const target = Math.min(P.climbMax, (P.climbMax * sinp) / 0.7)
        fy = vySm < target ? base : P.fyEase
      } else {
        fy += P.diveForce * sinp * Math.max(0, Math.min(1, (P.diveMax + vySm) / 3))
      }
      // ramp any upward force to 0 over the last CEILING_TAPER m below the ceiling
      if (fy > 0) fy *= liftFactor(t.position.y)
      diving = sinp < -0.17 // looking down more than ~10 degrees
      Physics.applyForceToPlayer(BOOST_SOURCE, Vector3.create(fx, fy, fz))
      boostLog = `F=(${fx.toFixed(1)},${fy.toFixed(1)},${fz.toFixed(1)}) pitch=${(Math.asin(sinp) * 57.3).toFixed(0)}deg cam=${cam ? 'camera' : 'avatar-fallback'}`
    } else {
      Physics.removeForceFromPlayer(BOOST_SOURCE)
    }
  }

  // ---- measurement + log ----
  if (t) {
    if (prevPos && dt > 0) {
      const dx = t.position.x - prevPos.x
      const dy = t.position.y - prevPos.y
      const dz = t.position.z - prevPos.z
      speed = Math.sqrt(dx * dx + dz * dz) / dt
      vy = dy / dt
      // ignore a teleport or a long frame (>150 m/s measured is not real movement): it must not feed the
      // smoothing either, or a respawn would trigger the dive brake / climb ramps for about a second
      const m = Vector3.create(dx / dt, dy / dt, dz / dt)
      if (Vector3.length(m) < 150) {
        vySm = vySm * 0.85 + vy * 0.15
        vel = m
        velSm = Vector3.add(Vector3.scale(velSm, 0.9), Vector3.scale(m, 0.1))
      }
      hSm = Math.sqrt(velSm.x * velSm.x + velSm.z * velSm.z)
    }
    // ---- limits: ONE brake force. Opposes velocity above the 24.3 m/s total cap and horizontal speed above 19.2; a vertical brake holds a dive near 21.9 ----
    let bx = 0
    let by = 0
    let bz = 0
    const total = Vector3.length(velSm)
    if (total > P.speedCap) {
      const u = Vector3.normalize(velSm)
      bx = -u.x * P.brake
      by = -u.y * P.brake
      bz = -u.z * P.brake
    }
    // (the dive brake, like the horizontal one, only acts when the total-speed brake is not already opposing)
    if (total <= P.speedCap && vySm < -P.diveBrakeStart) by += Math.min(1, (-vySm - P.diveBrakeStart) / 4.1) * P.diveBrake
    // horizontal limit: a real brake (02d only faded the thrust and measured 28.5 against 26)
    // (only when the total-speed brake is not already opposing the whole velocity: the two must not stack)
    if (total <= P.speedCap && hSm > P.hMax) {
      const k = Math.min(1, (hSm - P.hMax) / 1.5)
      bx += (-velSm.x / hSm) * P.brake * k
      bz += (-velSm.z / hSm) * P.brake * k
    }
    const blasting = blastActive() // c27: the blast flies free: no speed brake, no air carry
    if (!blasting && (bx !== 0 || by !== 0 || bz !== 0)) {
      Physics.applyForceToPlayer(BRAKE_SOURCE, Vector3.create(bx, by, bz))
    } else {
      Physics.removeForceFromPlayer(BRAKE_SOURCE)
    }

    // ---- momentum jump: carry the takeoff speed through the air ----
    // Unity's in-air drag is quadratic and its air acceleration weak, so a run jump bleeds to ~10 m/s. At takeoff
    // we add a forward impulse, then hold a forward force along the takeoff heading until we land. No force while
    // boosting (tier 3, F held): the boost has its own thrust.
    const fHeldNow = inputSystem.isPressed(InputAction.IA_SECONDARY)
    if (!airborne) {
      const hVelNow = Vector3.create(velSm.x, 0, velSm.z)
      hPrev = Vector3.add(Vector3.scale(hPrev, 0.9), Vector3.scale(hVelNow, 0.1))
      if (vySm > 2.5 && vy > 3) {
        airborne = true
        airT = 0
        stillFrames = 0
        h0 = Vector3.length(hPrev)
        if (h0 > 3) {
          carryDir = Vector3.normalize(hPrev)
          Physics.applyImpulseToPlayer(Vector3.scale(carryDir, P.airImpulse * h0))
        }
      }
    } else {
      airT += dt
      stillFrames = Math.abs(vy) < 0.15 ? stillFrames + 1 : 0
      if (airT > 0.3 && stillFrames >= 6) {
        airborne = false // landed
        h0 = 0
        Physics.removeForceFromPlayer(AIR_SOURCE)
      }
    }
    if (!blasting && airborne && h0 > 3 && !(tier === 3 && fHeldNow)) {
      const scale = Math.max(0, Math.min(1, (P.hMax - hSm) / 3)) // fades out toward the horizontal limit (H_MAX)
      if (scale > 0.01) Physics.applyForceToPlayer(AIR_SOURCE, Vector3.scale(carryDir, P.airCarryK * h0 * scale))
      else Physics.removeForceFromPlayer(AIR_SOURCE)
    } else {
      Physics.removeForceFromPlayer(AIR_SOURCE)
    }
    try {
      gameUpdate(dt, Vector3.create(t.position.x, t.position.y, t.position.z), hSm, airborne, tier, vy)
    } catch (e) {
      emit('error', { where: 'gameUpdate', msg: String(e), stack: String((e as any)?.stack ?? '').slice(0, 400) })
    }
    prevPos = Vector3.create(t.position.x, t.position.y, t.position.z)
    maxHeight = Math.max(maxHeight, t.position.y)
    maxSpeed = Math.max(maxSpeed, speed)
    hudTimer += dt
    if (hudTimer >= 0.2) {
      hudTimer = 0
      const fHeld = inputSystem.isPressed(InputAction.IA_SECONDARY)
      const spaceHeld = inputSystem.isPressed(InputAction.IA_JUMP)
      hudText =
        `TIER ${tier} ${TIER_NAMES[tier]}   alt ${t.position.y.toFixed(1)} m
` +
        `F held: ${fHeld}   Space held: ${spaceHeld}
` +
        `force component: ${PhysicsCombinedForce.has(engine.PlayerEntity)}   boost: ${boostLog}
` +
        `speed: ${hSm.toFixed(1)} h, ${vySm.toFixed(1)} v, ${Vector3.length(velSm).toFixed(1)} total m/s (smoothed)   air: ${airborne ? 'yes' : 'no'}
` +
        `glideFall limit: ${diving ? P.diveSink : P.flySink} m/s   land cooldown: ${P.landCooldown}s   camera: ${Transform.getOrNull(engine.CameraEntity) ? 'read' : 'NOT readable'}
` +
        gameHud(0)
    }
    logTimer += dt
    if (logTimer >= 0.5) {
      logTimer = 0
      console.log(
        `[halo] t=${elapsed.toFixed(1)} tier=${tier} pos=(${t.position.x.toFixed(1)},${t.position.y.toFixed(1)},${t.position.z.toFixed(1)}) ` +
          `hspeed=${speed.toFixed(1)} vy=${vy.toFixed(1)} v3=${Vector3.length(vel).toFixed(1)} maxY=${maxHeight.toFixed(1)} maxHSpeed=${maxSpeed.toFixed(1)} boost=${boostLog} ` +
          `F=${inputSystem.isPressed(InputAction.IA_SECONDARY)} space=${inputSystem.isPressed(InputAction.IA_JUMP)} ` +
          `forceComp=${PhysicsCombinedForce.has(engine.PlayerEntity)} glideFall=${diving ? P.diveSink : P.flySink}`
      )
    }
  }
}

export function main() {
  console.log('[halo] loaded. E places a Discharge Trap. Tier 3: HOLD jump to keep the glider open, HOLD F to thrust along the camera look direction (pitch included).')
  try {
    ReactEcsRenderer.setUiRenderer(hudUi)
  } catch (e) {
    console.log('[halo] HUD unavailable: ' + e)
  }
  engine.addSystem(halo, 0, 'emanate-halo')
  emit('loaded', { build: '04' })
  gameInit()
}
