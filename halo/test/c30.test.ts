// c30 (Directive V): the effect table, the 75 % look, the three Plasma Portals, the emitter budget with reserved upgrade drops, the colour cycle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { archetype, ARCHETYPES, planEffect, planBubble, planFlash, LCAP, OPACITY, BUBBLE_OPACITY, SKY_TOP, MATERIALS, PORTAL_LOOK, dropCount, capsOf, cycleColor, PORTAL_CYCLE, COLORS_NEW, EFFECT_IDS, liveParticles, type EmitterSpec } from '../src/look.ts'
import { cueKeyFor } from '../src/uiplan.ts'

const plan = (id: string, p: any = {}, look?: any) => planEffect(id, p, look)!
const shellAlpha = (e: EmitterSpec) => e.from[3]
const box = (e: EmitterSpec) => (e.shape.kind === 'box' ? e.shape : null)

test('upgrade drops are reserved: they are counted but never chosen to make room; the others go oldest first', () => {
  const live = [{ emitters: 3, particles: 10, reserved: true }, { emitters: 10, particles: 10 }, { emitters: 3, particles: 10, reserved: true }, { emitters: 10, particles: 10 }]
  assert.equal(dropCount(live, { emitters: 5, particles: 0 }, { emitters: 26, particles: 1e9 }), 1) // 26 + 5 = 31 > 26: the first non-reserved goes (-10 -> 21)
  assert.equal(dropCount(live, { emitters: 30, particles: 0 }, { emitters: 26, particles: 1e9 }), 2)
  assert.equal(dropCount(live, { emitters: 99, particles: 0 }, { emitters: 26, particles: 1e9 }), 2) // never more than the non-reserved ones
  assert.equal(dropCount(live, { emitters: 1, particles: 0 }, { emitters: 99, particles: 1e9 }), 0)
  assert.equal(dropCount(live, { emitters: 1, particles: 0 }, { emitters: 26, particles: 1e9 }, 5), 1) // outside emitters (bubbles, trails) count too
})

test('the caps are server settings (look keys cap.emitters, cap.particles, cap.drops), clamped', () => {
  assert.deepEqual(capsOf(undefined), { emitters: LCAP.emitters, particles: LCAP.particles, drops: LCAP.drops })
  assert.equal(capsOf({ 'cap.drops': 4 }).drops, 4)
  assert.equal(capsOf({ 'cap.drops': 999 }).drops, 12)
  assert.equal(capsOf({ 'cap.emitters': 1 }).emitters, 8)
})

test('E9 the Aurora: 5 curtains + embers, 20 s, follows the wearer; E10 the Storm: sixteen 30 m bursts, 10 to 40 m up, over 16 s in a fixed order', () => {
  const au = plan('E9'); assert.equal(au.seconds, 20); assert.equal(au.follow, true); assert.equal(au.emitters.filter((e) => e.tex === 'glow').length, 5)
  assert.ok(au.emitters.every((e) => Math.abs(e.pos[2]) <= 50 && Math.abs(e.pos[0]) <= 50)) // within 50 m of the wearer
  const st = plan('E10'), cr = st.emitters.filter((e) => e.tex === 'crackle')
  assert.equal(st.seconds, 16); assert.equal(cr.length, 16)
  assert.ok(cr.every((e) => (e.shape as any).radius * 2 === 30 && e.pos[1] >= 10 && e.pos[1] <= 40))
  assert.deepEqual(cr.map((e) => e.at), Array.from({ length: 16 }, (_, k) => k)) // one a second, 0..15 s
  assert.ok(cr.every((e) => e.at! + e.dur! <= 16.2))
  assert.deepEqual(plan('E10'), plan('E10')) // the fixed random sequence
  assert.ok(st.emitters.some((e) => e.tex === 'glow' && e.from[0] > e.from[2])) // the red flashes
})

test('the call portal colour cycle: the rainbow plus white and black, no brown, gold embers excepted', () => {
  assert.ok(PORTAL_CYCLE.some((c) => c[0] > 0.95 && c[1] > 0.95 && c[2] > 0.95)); assert.ok(PORTAL_CYCLE.some((c) => c[0] < 0.1 && c[1] < 0.1 && c[2] < 0.1))
  for (let t = 0; t < 12; t += 0.05) {
    const [r, g, b] = cycleColor(t)
    const brown = r > 0.25 && r < 0.75 && g > 0.1 && g < 0.5 && b < 0.2 && r > g && g > b * 1.2 // dark orange
    assert.ok(!brown, 'brown at t=' + t.toFixed(2) + ' ' + [r, g, b].map((v) => v.toFixed(2)).join(','))
  }
  const seen = new Set<string>(); for (let t = 0; t < 12; t += 0.6) seen.add(cycleColor(t).join(',')); assert.ok(seen.size >= 7)
})


// ---------------------------------------------------------------- c30b (Directive W): the FX volume pass and the clamp
const parts = (p: ReturnType<typeof plan>) => p.emitters.reduce((a, e) => a + liveParticles(e), 0)
const top = (e: EmitterSpec) => e.pos[1] + (box(e) ? box(e)!.z / 2 : 0)
const black = (e: EmitterSpec) => e.from[0] < 0.1 && e.from[1] < 0.1 && e.from[2] < 0.1
const largest = (e: EmitterSpec) => e.sizeMax * Math.max(e.sizeStart, e.sizeEnd)

test('c30b: the busiest moment (round-start blast + burst + Glimpse + trails + PP1 + a Signal Flare + 6 drops) fits the caps', () => {
  const blast = planBubble([0, 0, 0], 110, 110).emitters.length, burst = plan('E6').emitters.length, sig = plan('E12').emitters.length, pp1 = plan('E7').emitters.length, e1 = plan('E1').emitters.length
  const drop = plan('E3'); assert.equal(drop.reserved, true)
  const total = blast + burst + sig + 16 + pp1 + e1 + LCAP.drops * drop.emitters.length
  assert.ok(total <= LCAP.emitters, 'emitters ' + total)
  const p = planBubble([0, 0, 0], 110, 110).emitters.reduce((a, e) => a + liveParticles(e), 0) + parts(plan('E6')) + parts(plan('E12')) + parts(plan('E7')) + parts(plan('E1')) + LCAP.drops * parts(drop)
  assert.ok(p <= LCAP.particles, 'particles ' + p)
})

test('c30b: smoke is black and dense everywhere except the two locked looks; flames start at 0.9 opacity', () => {
  assert.ok(MATERIALS.smoke.from[0] <= 0.05 && MATERIALS.smoke.from[3] >= 0.9 && MATERIALS.smoke.to[3] >= 0.5)
  assert.equal(MATERIALS.fire.from[3], 0.9)
  for (const id of ['E1', 'E7', 'E11', 'E14']) { const w = plan(id).emitters.filter((e) => e.tex === 'wisp'); assert.ok(w.length && w.every(black), id) }
  // c30f (Directive X item 3, baked): the Upgrade Drop's smoke is pink at the base and fades to very pale pink at the top
  { const w = plan('E3').emitters.filter((e) => e.tex === 'wisp').sort((x, y) => x.pos[1] - y.pos[1]); assert.equal(w.length, 2)
    assert.ok(w[0]!.from[0] > 0.9 && w[0]!.from[1] < 0.5 && w[0]!.from[2] > 0.6, 'pink base'); assert.ok(w[1]!.to[1] > 0.85 && w[1]!.to[2] > 0.9, 'very pale pink top') }
  assert.ok(plan('E12').emitters.some((e) => e.tex === 'wisp' && e.from[2] > 0.9)) // the Glimpse stays pastel blue
})

test('c30b: smoke columns reach the sky top and are stacked so they stay dense the whole way up', () => {
  for (const id of ['E1', 'E7', 'E11', 'E14']) {
    const w = plan(id).emitters.filter((e) => e.tex === 'wisp')
    assert.ok(w.length >= 6, id + ' segments ' + w.length)
    assert.ok(Math.abs(Math.max(...w.map(top)) - SKY_TOP) < 1e-6, id)
    const h = w.map((e) => box(e)!.z); assert.ok(h.every((x) => Math.abs(x - h[0]!) < 1e-6)) // equal segments, equal density
  }
})

test('c30b: a Plasma Portal is a three-storey house on fire: a fire base 10 m across, flames to 12-15 m, black smoke to the sky top; ONE recipe, the colours as Directive V', () => {
  const pp1 = plan('E7'), pp2h = plan('E11', { winner: 'hunters' }), pp2g = plan('E11', { winner: 'helpers' }), pp3 = plan('E14')
  const fire = pp1.emitters.filter((e) => e.tex === 'flipbook')
  assert.equal(box(fire[0]!)!.x, PORTAL_LOOK.base) // 10 m across
  const reach = Math.max(...fire.map((e) => top(e) + (box(e) ? 0 : e.speedMax * e.lifetime * 0.5)))
  assert.ok(reach >= 12 && reach <= 16, 'flames to ' + reach.toFixed(1))
  assert.deepEqual(pp1.emitters.map((e) => e.shape), pp2h.emitters.map((e) => e.shape))
  assert.equal(pp3.emitters.length, pp1.emitters.length + 1) // PP3 adds the gold embers
  const fc = (p: ReturnType<typeof plan>) => p.emitters.find((e) => e.tex === 'flipbook')!.from
  assert.ok(fc(pp1)[1] > fc(pp1)[0] && fc(pp1)[1] > fc(pp1)[2]) // electric green
  assert.ok(fc(pp2h)[2] > fc(pp2h)[1]) // hunters: purple
  assert.ok(fc(pp2g)[0] > 0.9 && fc(pp2g)[1] > 0.8 && fc(pp2g)[2] < 0.3) // helpers: gold
  assert.deepEqual(pp3.emitters[pp3.emitters.length - 1]!.from.slice(0, 3), COLORS_NEW.gold.slice(0, 3))
})

test('c30b: the lobby bubble is 80 % and at most 30 m across; the burst grows from R to 1.5 R in 1.5 s; the blast is unchanged (75 %)', () => {
  assert.equal(BUBBLE_OPACITY, 0.8); assert.equal(OPACITY, 0.75)
  const e5 = plan('E5', { r: 10 }); assert.ok(e5.emitters.filter((e) => e.tex === 'wisp').every((e) => +e.from[3].toFixed(4) === 0.8))
  assert.ok(planBubble([0, 0, 0], 110, 110).emitters.every((e) => +e.from[3].toFixed(4) === 0.75))
  for (const r of [10, 15, 60, 5000]) {
    const b = plan('E5', { r }), R = Math.min(r, 15)
    assert.ok(b.emitters.every((e) => Math.hypot(e.pos[0], e.pos[2]) <= R + 1e-6 && e.pos[1] <= R * 1.05 + 1e-6), 'r ' + r)
    const bu = plan('E6', { r }); assert.ok(bu.emitters.every((e) => (e.shape as any).radius === R))
    for (const e of bu.emitters) { const grow = e.speedMax * e.lifetime; assert.ok(Math.abs(grow - R * 0.5) < 1e-6 && Math.abs(e.lifetime - 1.5) < 1e-6, 'burst r ' + r) }
  }
})

test('c31c: the Glimpse keeps its colour, height and particles, 5.6 m across (2.8 m radius, Directive AA); the width is the server key E12.width (2..30 m)', () => {
  const g = plan('E12'), w = g.emitters.filter((e) => e.tex === 'wisp')
  assert.ok(w.length === 3 && w.every((e) => box(e)!.x === 5.6)) // c31 (Forces): 24 -> 8 m; c31c (Directive AA): 8 -> 5.6 m
  const core = g.emitters.find((e) => e.tex !== 'wisp' && e.rate > 5)!, emb = g.emitters[g.emitters.length - 1]!
  assert.ok(Math.abs(box(core)!.x - 1.75) < 1e-9); assert.equal(box(emb)!.x, 5.6)
  for (const [v, want] of [[16, 16], [1, 2], [99, 30], ['junk', 5.6]] as [any, number][]) {
    const gw = plan('E12', {}, { 'E12.width': v })
    assert.ok(gw.emitters.filter((e) => e.tex === 'wisp').every((e) => box(e)!.x === want), 'width ' + v)
    assert.equal(parts(gw), parts(g)) // the width never changes the particle count
  }
  const c30a = 2.2 * MATERIALS.ash.rate * MATERIALS.ash.lifetime // the c30a column (one emitter, 792 wanted, held to 600)
  assert.ok(parts(g) >= 3 * Math.min(600, Math.ceil(c30a)) + 3 * 48, 'particles ' + parts(g))
  assert.ok(w.every((e) => e.from[0] === COLORS_NEW.ghost[0] && e.from[2] === COLORS_NEW.ghost[2]))
})

test('c30b: THE CLAMP: no server value can make one effect ask for more than 48 emitters or 9000 particles, or a particle past 8 m (40 m for the locked looks)', () => {
  const huge = { 'E1.smoke.rate': 4, 'E1.smoke.size': 4, 'E1.smoke.life': 4, 'E5.smoke.count': 999, 'E5.fire.size': 4, 'E7.fire.rate': 4, 'E7.smoke.size': 4 }
  for (const id of EFFECT_IDS) for (const p of [{ r: 5000 }, { r: 1e9, seconds: 1e9, to: [1e6, 1e6, 1e6] }, {}] as any[]) {
    const pl = plan(id, p, huge)
    assert.ok(pl.emitters.length <= LCAP.effectEmitters, id + ' emitters ' + pl.emitters.length)
    assert.ok(parts(pl) <= LCAP.effectParticles + pl.emitters.length, id + ' particles ' + parts(pl))
    for (const e of pl.emitters) assert.ok((pl.big ? e.sizeMax <= LCAP.bigSize : largest(e) <= LCAP.size + 1e-6) && e.rate <= LCAP.rate && e.lifetime <= LCAP.lifetime, id) // the locked looks (blast, Glimpse) keep their growth; their START size is capped
  }
  assert.ok(planBubble([0, 0, 0], 1e9, 1e9).emitters.every((e) => Math.abs(e.pos[1]) <= 2000))
  assert.equal(capsOf({ 'cap.emitters': 99999 }).emitters, 240); assert.equal(capsOf({ 'cap.particles': 1e9 }).particles, 40000)
})

test('c30b: every effect plans inside its caps (STOP-proof ids unchanged); the cinematic recipes still exist for a later redesign', () => {
  for (const id of EFFECT_IDS) {
    const p = plan(id, { r: id === 'E5' ? 10 : undefined })
    assert.ok(p.emitters.length > 0 && p.emitters.length <= LCAP.effectEmitters, id)
  }
  for (const id of ['E8', 'E9', 'E10']) assert.ok(plan(id).emitters.length > 0, id)
  assert.equal(cueKeyFor('ending'), 'cueEnding'); assert.equal(planFlash().emitters.length, 1)
})

// ---------------------------------------------------------------- c30c (Forces): the two archetypes, the original Plume and the original call Portal
test('c30c: PLUME and PORTAL play on their own, as the original c29b recipes (first palette)', () => {
  const pl = plan('PLUME'), po = plan('PORTAL')
  assert.equal(pl.seconds, 14); assert.equal(po.seconds, 45)
  assert.equal(pl.emitters.length, 4) // fire, 2 smoke, embers (100 m column)
  assert.equal(po.emitters.length, 12 + 1 + 5 + 1) // rim fire, glow heart, crackle, smoke column to 100 m
  assert.ok(pl.emitters.some((e) => e.tex === 'flipbook' && e.from[3] === 0.95)) // the ORIGINAL fire (0.95), not c30b's
  assert.ok(po.emitters.filter((e) => e.tex === 'wisp').every((e) => e.from[0] > 0.9)) // the ORIGINAL red smoke
  const xs = po.emitters.filter((e) => e.tex === 'flipbook').map((e) => e.pos[0]), ys = po.emitters.filter((e) => e.tex === 'flipbook').map((e) => e.pos[1])
  assert.ok(Math.abs(Math.max(...xs) - 1.75) < 1e-6 && Math.abs(Math.max(...ys) - 6) < 1e-6) // the oval 3.5 m wide, 6 m tall
})

test('c30c: any effect can be assigned an archetype from the server (<id>.as) and tuned by its own keys, scale and height', () => {
  const e7 = plan('E7', {}, { 'E7.as': 'PORTAL' }), base = plan('PORTAL')
  assert.equal(e7.emitters.length, base.emitters.length); assert.equal(e7.seconds, plan('E7').seconds) // the look of the portal, the time of E7
  const tuned = plan('E7', {}, { 'E7.as': 'portal', 'E7.fire.color': '0.1,1,0.2', 'E7.scale': 2, 'E7.height': 200 })
  assert.ok(tuned.emitters.filter((e) => e.tex === 'flipbook').every((e) => e.from[1] === 1)) // green fire from E7's own key
  assert.ok(Math.max(...tuned.emitters.filter((e) => e.tex === 'flipbook').map((e) => e.pos[1])) === 12) // scale 2: the oval is 12 m tall
  assert.equal(tuned.emitters.filter((e) => e.tex === 'wisp').length, 2) // height 200: two column segments
  assert.equal(plan('E1', {}, { 'E1.as': 'PLUME' }).emitters.length, 4)
  assert.equal(plan('E1', {}, { 'E1.as': 'nonsense' }).emitters.length, plan('E1').emitters.length) // unknown archetype: the effect's own recipe
  for (const id of EFFECT_IDS) for (const a of ARCHETYPES) { const p = plan(id, { r: 5 }, { [id + '.as']: a, [id + '.scale']: 99, [id + '.height']: 1e9 }); assert.ok(p.emitters.length <= LCAP.effectEmitters && p.emitters.every((e) => e.sizeMax <= LCAP.bigSize)) }
  assert.equal(archetype('X', 'E1', undefined).length, 0)
})

test('c31c (Directive AA 7): the Upgrade Drop column is 2.1 m across (1.05 m radius); its foot fire and glow are scaled x 0.7; still pink to pale pink', () => {
  const d = plan('E3'), boxes = d.emitters.filter((e) => e.shape.kind === 'box')
  assert.ok(boxes.length === 3 && boxes.every((e) => Math.abs(box(e)!.x - 2.1) < 1e-9), 'columns 2.1 m')
  const fire = d.emitters.find((e) => e.shape.kind === 'cone')!, glow = d.emitters.find((e) => e.shape.kind === 'sphere')!
  assert.ok(Math.abs((fire.shape as any).radius - 1.05) < 1e-9 && Math.abs((glow.shape as any).radius - 0.56) < 1e-9)
  const w = d.emitters.filter((e) => e.tex === 'wisp').sort((x, y) => x.pos[1] - y.pos[1]); assert.ok(w[1]!.to[1] > w[0]!.to[1]) // paler at the top
})
test('c31c (Directive AA 5): the Plasma Charge fizz: small pale-yellow points along the charge line, a short life, they grow then go; the arcs stay', () => {
  const c = plan('E2', { to: [0, 0, 4] }), fizz = c.emitters.filter((e) => e.tex === 'glow')
  assert.ok(fizz.length >= 5, 'fizz points ' + fizz.length)
  for (const z of fizz) { assert.ok(z.sizeMax <= 0.3 && z.lifetime <= 0.35 && z.sizeEnd > z.sizeStart * 4, 'pop'); assert.ok(z.from[0] > 0.9 && z.from[1] > 0.9 && z.from[2] < 0.7 && z.from[3] > 0.9, 'pale yellow'); assert.equal(z.to[3], 0) }
  assert.ok(c.emitters.filter((e) => e.tex === 'crackle').length === 5, 'the box arcs stay')
  assert.ok(fizz.reduce((a, e) => a + liveParticles(e), 0) > parts(plan('E12')) / 100, 'many')
})
test('c31c (Directive AA 8): portal flames are smaller and more of them; height, base and black smoke unchanged; still under the effect caps', () => {
  for (const id of ['E7', 'E11', 'E14']) {
    const p = plan(id), fire = p.emitters.filter((e) => e.tex === 'flipbook')
    assert.ok(fire.length === 8 && fire.every((e) => e.sizeMax <= MATERIALS.fire.size[1] * 1.1 * 0.6 + 1e-9), id + ' smaller')
    assert.ok(fire.every((e) => e.rate >= MATERIALS.fire.rate * 1.4 * 2 - 1e-9), id + ' more')
    assert.ok(p.emitters.filter((e) => e.tex === 'wisp').length === 6 && parts(p) <= 9000, id + ' smoke + caps')
  }
})
