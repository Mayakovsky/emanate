// Build 02d logic test (fake SDK): limits, quick landing, jump bonus, momentum jump.
import { T, engine, log } from './fake-ecs'
import { Vector3, Quaternion } from '../../halo/node_modules/@dcl/sdk/math'
import { main } from '../../halo/src/index'

main()
const DT = 1 / 60
const frame = () => { (engine as any)._system(DT); T.triggered.clear() }
const fmt = (v: any) => (v ? `(${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)})` : 'none')
const forces = () => [...T.forces.entries()].map(([k, v]: any) => `src${k}=${fmt(v)}`).join(' ') || 'none'
let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); ok ? pass++ : fail++ }
// source entity ids: BOOST=100, BRAKE=101, AIR=102 (created in this order at module load)
const BOOST = 100, BRAKE = 101, AIR = 102

// ---------- tier 2: settings (landing, jump bonus) ----------
T.player.position = Vector3.create(0, 0, 0)
frame()
T.triggered.add(1); frame() // E -> tier 2
check('hardLandingCooldown 0.25 (one third of 0.75 s)', T.settings.hardLandingCooldown === 0.25, `=${T.settings.hardLandingCooldown}`)
check('sprint run 16.2, jog 11.7, walk 5 (02f)', T.settings.runSpeed === 16.2 && T.settings.jogSpeed === 11.7 && T.settings.walkSpeed === 5, `run ${T.settings.runSpeed} jog ${T.settings.jogSpeed} walk ${T.settings.walkSpeed}`)
check('standing: jump heights = base', Math.abs(T.settings.jumpHeight - 1.6) < 1e-6 && Math.abs(T.settings.runJumpHeight - 2.2) < 1e-6, `jump ${T.settings.jumpHeight} run ${T.settings.runJumpHeight}`)
check('double jump 9 (-10% from 10)', T.settings.doubleJumpHeight === 9, `=${T.settings.doubleJumpHeight}`)

// ---------- run at 18 m/s along +x on the ground ----------
let x = 0
for (let i = 0; i < 90; i++) { x += 16.2 * DT; T.player.position = Vector3.create(x, 0, 0); frame() }
check('running 16.2 m/s: jump heights scaled x1.225 (bonus 0.25 x 16.2/18)', Math.abs(T.settings.runJumpHeight - 2.2 * 1.225) < 0.05 && Math.abs(T.settings.jumpHeight - 1.6 * 1.225) < 0.05, `jump ${T.settings.jumpHeight.toFixed(2)} run ${T.settings.runJumpHeight.toFixed(2)}`)
check('no brake or air force while running on the ground', !T.forces.has(BRAKE) && !T.forces.has(AIR), forces())

// ---------- takeoff: vy 10.9, horizontal drops to ~10 (the real in-air behaviour) ----------
log.length = 0
let y = 0, vy = 10.9, hv = 16.2
let sawImpulse: any = null, airForce: any = null
for (let i = 0; i < 70; i++) {
  hv += (10 - hv) * 0.04
  x += hv * DT; vy -= (vy > 0 ? 40 : 10) * DT; y = Math.max(0, y + vy * DT)
  T.player.position = Vector3.create(x, y, 0); frame()
  const imp = log.find((l) => l[0] === 'impulse'); if (imp && !sawImpulse) sawImpulse = imp[1]
  if (T.forces.has(AIR)) airForce = T.forces.get(AIR)
  if (y <= 0 && vy < 0) { vy = 0 }
}
check('takeoff gives a forward impulse ~0.3 x 16.2 = 4.9 along +x', sawImpulse && sawImpulse.x > 4 && sawImpulse.x < 5.8 && Math.abs(sawImpulse.z) < 0.5, fmt(sawImpulse))
check('in the air: forward force along the takeoff heading ~0.55 x 16.2 = 8.9', airForce && airForce.x > 6.5 && airForce.x < 10, fmt(airForce))
for (let i = 0; i < 20; i++) { T.player.position = Vector3.create(x, 0, 0); frame() } // standing still on the ground
check('after landing: air force removed', !T.forces.has(AIR), forces())

// ---------- total speed cap 30 ----------
for (let i = 0; i < 40; i++) { x += 38 * DT; T.player.position = Vector3.create(x, 0, 0); frame() } // 38 m/s horizontal
const brake = T.forces.get(BRAKE)
check('38 m/s > cap 24.3: brake opposes velocity (about -40 along x)', brake && brake.x < -30 && Math.abs(brake.y) < 1, fmt(brake))
for (let i = 0; i < 60; i++) { T.player.position = Vector3.create(x, 0, 0); frame() }
check('stopped: brake released', !T.forces.has(BRAKE), forces())

// ---------- dive brake: descending 26 m/s ----------
y = 120
for (let i = 0; i < 40; i++) { y -= 26 * DT; T.player.position = Vector3.create(x, y, 0); frame() }
const dbrake = T.forces.get(BRAKE)
check('descending 26 m/s: upward brake on (limit ~21.9)', dbrake && dbrake.y > 8, fmt(dbrake))
y = 120
for (let i = 0; i < 40; i++) { y -= 15 * DT; T.player.position = Vector3.create(x, y, 0); frame() }
check('descending 15 m/s: no dive brake', !T.forces.has(BRAKE) || T.forces.get(BRAKE).y < 1, forces())

// ---------- tier 3: boost ramps ----------
T.triggered.add(1); frame() // tier 3
T.player.position = Vector3.create(0, 50, 0); frame(); frame()
T.camera.rotation = Quaternion.fromEulerDegrees(-45, 0, 0)
T.pressed.add(2)
// horizontal limit: moving 25.5 m/s -> the push is nearly faded; 15 m/s -> full 22*cos45 = 15.6
let xx = 0
for (let i = 0; i < 80; i++) { xx += 14 * DT; T.player.position = Vector3.create(xx, 50, 0); frame() }
const f15 = T.forces.get(BOOST)
check('14 m/s horizontal: forward push full (~15.6 at 45 deg)', f15 && f15.z > 12, fmt(f15))
for (let i = 0; i < 80; i++) { xx += 25.5 * DT; T.player.position = Vector3.create(xx, 50, 0); frame() }
const f25 = T.forces.get(BOOST)
check('25.5 m/s horizontal (> 19.2): thrust faded to ~0', f25 && Math.hypot(f25.x, f25.z) < 1, fmt(f25))
// horizontal brake: above 21.3 it opposes the horizontal velocity (the 02d build only faded the thrust)
T.pressed.delete(2)
for (let i = 0; i < 60; i++) { T.player.position = Vector3.create(xx, 50, 0); frame() }  // settle
let x3 = xx
for (let i = 0; i < 80; i++) { x3 += 23 * DT; T.player.position = Vector3.create(x3, 50, 0); frame() }
const hb = T.forces.get(BRAKE)
check('23 m/s horizontal > 19.2: horizontal brake on (about -40 along x), total 23 < 24.3', hb && hb.x < -30 && Math.abs(hb.y) < 1, fmt(hb))
for (let i = 0; i < 60; i++) { T.player.position = Vector3.create(x3, 50, 0); frame() }
let x4 = x3
for (let i = 0; i < 80; i++) { x4 += 17.5 * DT; T.player.position = Vector3.create(x4, 50, 0); frame() }
check('17.5 m/s horizontal (< 19.2): no horizontal brake', !T.forces.has(BRAKE), forces())
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
