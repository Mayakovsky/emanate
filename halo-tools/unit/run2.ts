// Run the halo against the REAL @dcl/ecs engine in Node, with synthetic PointerEventsResult key events.
import { engine, Transform, PointerEventsResult, PhysicsCombinedForce, AvatarLocomotionSettings, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { main } from '../../halo/src/index'

let ts = 1
const key = (button: InputAction, state: PointerEventType) =>
  PointerEventsResult.addValue(engine.RootEntity, { button, state, timestamp: ts++, tickNumber: ts, hit: undefined } as any)
const step = async (dt = 0.016) => { await engine.update(dt) }
const comp = () => { const c = PhysicsCombinedForce.getOrNull(engine.PlayerEntity); return c ? `(${c.vector!.x.toFixed(1)},${c.vector!.y.toFixed(1)},${c.vector!.z.toFixed(1)})` : 'NONE' }
const settings = () => { const s = AvatarLocomotionSettings.getOrNull(engine.PlayerEntity); return s ? `run=${s.runSpeed} glideFall=${s.glidingFallingSpeed} dbl=${s.doubleJumpHeight}` : 'NONE' }

async function go() {
  Transform.createOrReplace(engine.PlayerEntity, { position: Vector3.create(8, 30, 8), rotation: Quaternion.Identity() })
  Transform.createOrReplace(engine.CameraEntity, { position: Vector3.create(8, 31, 8), rotation: Quaternion.fromEulerDegrees(-45, 0, 0) })
  main()
  await step()
  console.log('after load: force', comp(), '| settings', settings())
  // E twice -> tier 3
  key(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN); await step(); key(InputAction.IA_PRIMARY, PointerEventType.PET_UP); await step()
  key(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN); await step(); key(InputAction.IA_PRIMARY, PointerEventType.PET_UP); await step()
  console.log('after E,E (tier 3): force', comp(), '| settings', settings())
  // hold Space and F
  key(InputAction.IA_JUMP, PointerEventType.PET_DOWN); await step()
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN); for (let i = 0; i < 3; i++) await step()
  console.log('F DOWN (held) frames 1-3: force', comp(), '| settings', settings())
  for (let i = 0; i < 60; i++) await step()
  console.log('F still held after 1 s     : force', comp())
  key(InputAction.IA_SECONDARY, PointerEventType.PET_UP); await step(); await step()
  console.log('F UP                       : force', comp())
  // F with NO Space event ever sent (sanity: does F alone matter to the halo?)
  key(InputAction.IA_JUMP, PointerEventType.PET_UP); await step()
  key(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN); for (let i = 0; i < 3; i++) await step()
  console.log('F DOWN, Space released     : force', comp())
}
go().catch((e) => { console.error('RUN ERROR', e); process.exit(1) })
