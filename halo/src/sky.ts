// EMANATE Build 04b item 3: sky test (test toggle only, no cinematic). Trigger: hold F and press 3 (test mode). The halo walks through a fixed
// sequence of sky settings on the scene root, one phase every 8 s, then removes them all, so what a wearable may set, what a scene
// overrides and what reverts can be read from screenshots. The HUD shows the current phase.
import { engine, SkyboxTime, Skybox, EnvironmentFog, Sun } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const R = engine.RootEntity
const grad = (r: number, g: number, b: number) => ({ keys: [{ color: { r, g, b, a: 1 }, time: 0 }] })
const PHASES: { name: string; run: () => void }[] = [
  { name: 'time 00:00 (midnight)', run: () => SkyboxTime.createOrReplace(R, { fixedTime: 0 }) },
  { name: 'time 12:00 (noon)', run: () => SkyboxTime.createOrReplace(R, { fixedTime: 43200 }) },
  { name: 'time 18:30 (dusk)', run: () => SkyboxTime.createOrReplace(R, { fixedTime: 66600 }) },
  { name: 'Skybox colours: red zenith, orange horizon', run: () => Skybox.createOrReplace(R, { skyColors: { zenith: grad(0.8, 0.1, 0.1), horizon: grad(1, 0.5, 0.1) } }) },
  { name: 'EnvironmentFog: dense grey', run: () => EnvironmentFog.createOrReplace(R, { color: grad(0.6, 0.6, 0.65), density: 0.02 }) },
  { name: 'Sun: red tint, intensity 2', run: () => Sun.createOrReplace(R, { color: grad(1, 0.2, 0.2), intensity: 2 }) },
  {
    name: 'all removed (revert check)',
    run: () => {
      SkyboxTime.deleteFrom(R)
      Skybox.deleteFrom(R)
      EnvironmentFog.deleteFrom(R)
      Sun.deleteFrom(R)
    }
  }
]
export const SKY_START = 3 // s after the trigger
export const SKY_PHASE = 8 // s per phase
let phase = -1
let startedAt = -1
export let skyText = 'sky test: hold F + press 3 to start'
export function skyStart(t: number) {
  startedAt = t
  phase = -1
}

export function skyUpdate(t: number, enabled: boolean) {
  if (!enabled || startedAt < 0) return
  const i = Math.floor((t - startedAt - SKY_START) / SKY_PHASE)
  if (i < 0) {
    skyText = `sky test: starts in ${Math.ceil(startedAt + SKY_START - t)} s`
    return
  }
  if (i >= PHASES.length) {
    skyText = 'sky test: done'
    return
  }
  if (i !== phase) {
    phase = i
    try {
      PHASES[i].run()
      skyText = `SKY TEST ${i + 1}/${PHASES.length}: ${PHASES[i].name}`
    } catch (e) {
      skyText = `SKY TEST ${i + 1}: ERROR ${String(e).slice(0, 80)}`
    }
  }
}
