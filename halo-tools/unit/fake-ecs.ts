// Minimal fake of '@dcl/sdk/ecs' for unit-testing the halo's logic outside the game.
import { Vector3, Quaternion } from '../../halo/node_modules/@dcl/sdk/math'
export const log: any[] = []
const state: any = { pressed: new Set<number>(), triggered: new Set<number>(), player: { position: Vector3.create(0, 30, 0), rotation: Quaternion.Identity() }, camera: { position: Vector3.create(0, 31, 0), rotation: Quaternion.Identity() }, settings: undefined as any, forces: new Map<any, any>() }
export const T = state
let nextEntity = 100
export const engine: any = {
  PlayerEntity: 1, CameraEntity: 2,
  addEntity: () => nextEntity++,
  addSystem: (fn: any) => { (engine as any)._system = fn }
}
export const AvatarLocomotionSettings: any = { createOrReplace: (_e: any, v: any) => { state.settings = v }, deleteFrom: () => { state.settings = undefined } }
export const Transform: any = { getOrNull: (e: number) => (e === 1 ? state.player : e === 2 ? state.camera : null) }
export const InputAction = { IA_PRIMARY: 1, IA_SECONDARY: 2, IA_ACTION_3: 10, IA_ACTION_4: 11, IA_ACTION_5: 12, IA_ACTION_6: 13, IA_JUMP: 8, IA_FORWARD: 4 }
export const PointerEventType = { PET_DOWN: 1, PET_UP: 0 }
export const inputSystem: any = { isTriggered: (a: number) => state.triggered.has(a), isPressed: (a: number) => state.pressed.has(a) }
export const Physics: any = {
  applyForceToPlayer: (src: any, v: any, mag?: number) => { state.forces.set(src, v); log.push(['force', v]) },
  removeForceFromPlayer: (src: any) => { state.forces.delete(src) },
  applyImpulseToPlayer: (v: any) => log.push(['impulse', v])
}
export const PhysicsCombinedForce: any = { has: () => state.forces.size > 0 }
