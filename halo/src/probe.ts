// Round 24 PROBE (not for publishing): what can the equipped halo do at runtime? Runs once, a few seconds after the first frame, and writes its findings to PROBE (shown in the panel).
import { engine, Transform, MeshRenderer, Material, GltfContainer, GltfContainerLoadingState, ParticleSystem } from '@dcl/sdk/ecs'
import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'

export let PROBE = 'probe armed'
const lines: string[] = ['probe armed']
let hb = 'HB none'
const render = () => { PROBE = hb + String.fromCharCode(10) + lines.join(String.fromCharCode(10)) }
const add = (s: string) => { lines.push(s); render() }
let t = 0
let started = false
let gltfE: any = null
let loadChecks = 0

export function probeTick(dt: number, me: { x: number; y: number; z: number }) {
  try { probeTick2(dt, me) } catch (e) { add('PROBE EXCEPTION ' + e) }
}
let frames = 0
function probeTick2(dt: number, me: { x: number; y: number; z: number }) {
  frames++
  if (frames % 15 === 0) { hb = 'HB frames=' + frames + ' t=' + t.toFixed(1) + 's (the panel counts only while the scene runs: a stall freezes this line)'; render() } // scene-health heartbeat for the texture test
  if (frames === 1) add('first frame, dt=' + dt)
  t += dt
  if (!started) { started = true; stages = buildStages(me) }
  if (false) {
    const g: any = globalThis
    const ty = (n: string) => n + ':' + typeof g[n]
    add('ENV ' + ['document', 'window', 'navigator', 'WebGLRenderingContext', 'OffscreenCanvas', 'HTMLCanvasElement', 'createImageBitmap', 'XMLHttpRequest', 'WebSocket', 'Blob', 'WebAssembly', 'TextDecoder'].map(ty).join(' '))
    try { add('URL.createObjectURL:' + typeof (g.URL && g.URL.createObjectURL)) } catch (e) { add('URL err ' + e) }
    const base = { x: me.x, y: me.y, z: me.z + 10 }
    // A: a particle emitter, no texture
    try {
      const a = engine.addEntity()
      Transform.create(a, { position: Vector3.create(base.x - 4, base.y, base.z) })
      ParticleSystem.create(a, { active: true, rate: 40, maxParticles: 300, lifetime: 3, gravity: -0.4, initialSize: { start: 0.8, end: 1.2 }, sizeOverTime: { start: 1, end: 3 },
        initialColor: { start: Color4.create(1, 0.2, 0, 1), end: Color4.create(1, 0.6, 0, 1) }, colorOverTime: { start: Color4.create(1, 0.3, 0, 0.9), end: Color4.create(0.3, 0, 0, 0) },
        blendMode: 1, shape: { $case: 'cone', cone: { angle: 15, radius: 0.5 } }, initialVelocitySpeed: { start: 2, end: 4 }, billboard: true })
      add('A particle emitter (no texture) created')
    } catch (e) { add('A particle ERR ' + e) }
    // B: a particle emitter with a texture packed in the zip
    try {
      const b = engine.addEntity()
      Transform.create(b, { position: Vector3.create(base.x, base.y, base.z) })
      ParticleSystem.create(b, { active: true, rate: 40, maxParticles: 300, lifetime: 3, gravity: -0.4, initialSize: { start: 1.5, end: 2 }, sizeOverTime: { start: 1, end: 3 },
        colorOverTime: { start: Color4.create(1, 0.3, 0, 0.8), end: Color4.create(0.2, 0.05, 0.05, 0) }, blendMode: 0, shape: { $case: 'cone', cone: { angle: 15, radius: 0.5 } },
        initialVelocitySpeed: { start: 2, end: 4 }, billboard: true, texture: { tex: { $case: 'texture', texture: { src: 'images/puff.png' } } } as any })
      add('B particle emitter (zip texture images/puff.png) created')
    } catch (e) { add('B particle ERR ' + e) }
    // C: a particle emitter with a texture loaded from our https server
    try {
      const c = engine.addEntity()
      Transform.create(c, { position: Vector3.create(base.x + 4, base.y, base.z) })
      ParticleSystem.create(c, { active: true, rate: 40, maxParticles: 300, lifetime: 3, gravity: -0.4, initialSize: { start: 1.5, end: 2 }, sizeOverTime: { start: 1, end: 3 },
        colorOverTime: { start: Color4.create(0.2, 0.6, 1, 0.8), end: Color4.create(0, 0.1, 0.3, 0) }, blendMode: 0, shape: { $case: 'cone', cone: { angle: 15, radius: 0.5 } },
        initialVelocitySpeed: { start: 2, end: 4 }, billboard: true, texture: { tex: { $case: 'texture', texture: { src: 'https://emanate.hiddenforces.net/audio/files/probe-puff.png' } } } as any })
      add('C particle emitter (https texture) created')
    } catch (e) { add('C particle ERR ' + e) }
    // D: a plane with a PBR material whose texture is an https URL
    try {
      const d = engine.addEntity()
      Transform.create(d, { position: Vector3.create(base.x + 8, base.y + 2, base.z), scale: Vector3.create(3, 3, 3) })
      MeshRenderer.setPlane(d)
      Material.setPbrMaterial(d, { texture: { tex: { $case: 'texture', texture: { src: 'https://emanate.hiddenforces.net/audio/files/probe-puff.png' } } } as any, emissiveColor: Color4.create(1, 0.3, 0, 1), emissiveIntensity: 2 })
      add('D plane with https texture created')
    } catch (e) { add('D material ERR ' + e) }
    // E: a GLB from our https server
    try {
      gltfE = engine.addEntity()
      Transform.create(gltfE, { position: Vector3.create(base.x - 8, base.y + 1, base.z) })
      GltfContainer.create(gltfE, { src: 'https://emanate.hiddenforces.net/audio/files/probe-halo.glb' })
      add('E GltfContainer (https glb) created')
    } catch (e) { add('E gltf ERR ' + e) }
    // F: a GLB shipped in the zip (control)
    try {
      const f = engine.addEntity()
      Transform.create(f, { position: Vector3.create(base.x - 12, base.y + 1, base.z), scale: Vector3.create(3, 3, 3) })
      GltfContainer.create(f, { src: 'halo.glb' })
      add('F GltfContainer (zip halo.glb) created')
    } catch (e) { add('F gltf ERR ' + e) }
  }
  if (started && gltfE && ++loadChecks % 120 === 60 && loadChecks < 1500) {
    try { const st: any = GltfContainerLoadingState.getOrNull(gltfE); add('E gltf state ' + (st ? st.currentState : 'none')) } catch (e) { add('E state ERR ' + e) }
  }
}

let stages: { at: number; name: string; run: () => void }[] = []
let announced = -1
function runStages() {
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]!
    if (announced < i && t > st.at - 2) { add('about to ' + st.name); announced = i }
    if (st.run && t > st.at) { const r = st.run; st.run = null as any; try { r(); add('done ' + st.name) } catch (e) { add('ERR ' + st.name + ' ' + e) } }
  }
}
function buildStages(me: { x: number; y: number; z: number }) {
  const base = { x: me.x, y: me.y, z: me.z + 10 }
  const g: any = globalThis
  const ty = (n: string) => n + ':' + typeof g[n]
  const A: any = { active: true, rate: 40, maxParticles: 300, lifetime: 3, gravity: -0.4, initialSize: { start: 0.8, end: 1.2 }, sizeOverTime: { start: 1, end: 3 },
    initialColor: { start: Color4.create(1, 0.2, 0, 1), end: Color4.create(1, 0.6, 0, 1) }, colorOverTime: { start: Color4.create(1, 0.3, 0, 0.9), end: Color4.create(0.3, 0, 0, 0) },
    blendMode: 1, shape: { $case: 'cone', cone: { angle: 15, radius: 0.5 } }, initialVelocitySpeed: { start: 2, end: 4 }, billboard: true }
  const tex = (src: string) => ({ tex: { $case: 'texture', texture: { src } } })
  const emitter = (dx: number, extra: any) => { const e = engine.addEntity(); Transform.create(e, { position: Vector3.create(base.x + dx, base.y, base.z) }); ParticleSystem.create(e, { ...A, ...extra }) }
  return [
    { at: 8, name: 'ENV', run: () => add('ENV ' + ['document', 'window', 'navigator', 'WebGLRenderingContext', 'OffscreenCanvas', 'HTMLCanvasElement', 'createImageBitmap', 'XMLHttpRequest', 'WebSocket', 'Blob', 'WebAssembly', 'TextDecoder'].map(ty).join(' ') + ' createObjectURL:' + typeof (g.URL && g.URL.createObjectURL)) },
    { at: 90, name: 'G particles, zip thumbnail.png texture', run: () => emitter(0, { blendMode: 0, initialSize: { start: 1.5, end: 2 }, texture: tex('thumbnail.png') }) },
    { at: 91, name: 'H plane, zip thumbnail.png texture', run: () => { const d = engine.addEntity(); Transform.create(d, { position: Vector3.create(base.x + 8, base.y + 2, base.z), scale: Vector3.create(3, 3, 3) }); MeshRenderer.setPlane(d); Material.setPbrMaterial(d, { texture: tex('thumbnail.png') as any }) } },
    { at: 92, name: 'I fire emitter, alpha blend, no texture', run: () => emitter(-4, { blendMode: 0, rate: 60, lifetime: 4, gravity: -1.2, initialSize: { start: 1.5, end: 2.5 }, sizeOverTime: { start: 1, end: 3.5 }, initialColor: { start: Color4.create(1, 0.35, 0.02, 1), end: Color4.create(1, 0.6, 0.05, 1) }, colorOverTime: { start: Color4.create(1, 0.45, 0.05, 0.9), end: Color4.create(0.25, 0.04, 0.02, 0) }, initialVelocitySpeed: { start: 3, end: 6 } }) },
    { at: 14, name: 'A particles, no texture', run: () => emitter(-4, {}) },
    { at: 20, name: 'B particles, zip texture', run: () => emitter(0, { blendMode: 0, initialSize: { start: 1.5, end: 2 }, texture: tex('images/puff.png') }) },
    { at: 26, name: 'C particles, https texture', run: () => emitter(4, { blendMode: 0, initialSize: { start: 1.5, end: 2 }, texture: tex('https://emanate.hiddenforces.net/audio/files/probe-puff.png') }) },
    { at: 32, name: 'D plane, https texture', run: () => { const d = engine.addEntity(); Transform.create(d, { position: Vector3.create(base.x + 8, base.y + 2, base.z), scale: Vector3.create(3, 3, 3) }); MeshRenderer.setPlane(d); Material.setPbrMaterial(d, { texture: tex('https://emanate.hiddenforces.net/audio/files/probe-puff.png') as any, emissiveColor: Color4.create(1, 0.3, 0, 1), emissiveIntensity: 2 }) } },
    { at: 38, name: 'F gltf from the zip (control)', run: () => { const f = engine.addEntity(); Transform.create(f, { position: Vector3.create(base.x - 12, base.y + 1, base.z), scale: Vector3.create(3, 3, 3) }); GltfContainer.create(f, { src: 'halo.glb' }) } },
    { at: 44, name: 'E gltf from https', run: () => { gltfE = engine.addEntity(); Transform.create(gltfE, { position: Vector3.create(base.x - 8, base.y + 1, base.z) }); GltfContainer.create(gltfE, { src: 'https://emanate.hiddenforces.net/audio/files/probe-halo.glb' }) } }
  ]
}

/** round 24 probe (test builds only): run one stage by its first word ('ENV', 'A', 'B', 'C', 'D', 'E', 'F') on demand, a command from the server */
export function probeRun(which: string) {
  const st = stages.find((x) => x.name.split(' ')[0] === which)
  if (!st || !st.run) { add('no stage ' + which); return }
  add('about to ' + st.name)
  const r = st.run; st.run = null as any
  try { r(); add('done ' + st.name) } catch (e) { add('ERR ' + st.name + ' ' + e) }
}
