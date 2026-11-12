import { T, engine, log } from './fake-ecs'
import { Vector3, Quaternion } from '../../halo/node_modules/@dcl/sdk/math'
import { main } from '../../halo/src/index'
main()
const frame = (dt = 0.016) => { (engine as any)._system(dt); T.triggered.clear() }
// camera looking with a pitch (degrees, + = up) and yaw 0
const setPitch = (deg: number) => { T.camera.rotation = Quaternion.fromEulerDegrees(-deg, 0, 0) } // DCL: rotation about X by -pitch looks up
const show = (label: string) => {
  const gf = T.settings ? T.settings.glidingFallingSpeed : undefined
  const f = [...T.forces.entries()].map(([k, v]: any) => `src${k}=(${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)})`).join(' ')
  console.log(label.padEnd(44), f || '(no force)', ' glidingFallingSpeed=' + gf)
}
frame() // settle
T.triggered.add(1); frame(); T.triggered.add(1); frame() // E E -> tier 3
console.log('settings tier3:', JSON.stringify(T.settings))
for (const pitch of [0, 45, 90, -45, -90]) {
  setPitch(pitch)
  // look vector check
  const look = Vector3.rotate(Vector3.Forward(), T.camera.rotation)
  T.pressed.add(2); for (let i = 0; i < 5; i++) frame()
  show(`F held, camera pitch ${pitch}  look=(${look.x.toFixed(2)},${look.y.toFixed(2)},${look.z.toFixed(2)})`)
  T.pressed.delete(2); frame(); show('  F released')
}
// vertical-speed ramps: simulate rising at various rates by moving the player
setPitch(45)
T.pressed.add(2)
for (const rate of [0, 5, 9, 12]) {
  T.player.position = Vector3.create(0, 30, 0); frame(1)
  for (let i = 0; i < 40; i++) { T.player.position = Vector3.create(0, T.player.position.y + rate * 0.016, 0); frame() }
  show(`pitch 45, rising ${rate} m/s (measured)`)
}
// near the ceiling
T.player.position = Vector3.create(0, 190, 0); for (let i = 0; i < 5; i++) frame(); show('pitch 45, altitude 190 m (ceiling fade)')
T.player.position = Vector3.create(0, 199, 0); for (let i = 0; i < 5; i++) frame(); show('pitch 45, altitude 199 m')
