/** Velocity Verlet n-body with Plummer softening. Units are arbitrary; G is fixed. */

export const G = 100
export const SOFTEN_FACTOR = 0.42
export const DT = 1 / 240
export const MAX_BODIES = 72
export const MAX_SPEED = 2200
export const TRAIL_SPACING = 2.6
export const TRAIL_MAX = 180

export type Kind = "dust" | "moon" | "rocky" | "ice" | "giant" | "star" | "hole"
export type CollisionMode = "merge" | "bounce" | "ghost"
export type ScenarioId =
  | "system"
  | "binary"
  | "eight"
  | "assist"
  | "swarm"
  | "trojan"
  | "moons"
  | "resonance"
  | "halo"
  | "trinity"
  | "comet"
  | "pinwheel"
  | "disk"
  | "pulse"

export type SceneTone = "pink" | "teal" | "lavender" | "peach" | "ochre" | "mint" | "coral"

export type Body = {
  id: number
  kind: Kind
  tag: string
  mass: number
  radius: number
  color: string
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  ax: number
  ay: number
  trail: { x: number; y: number }[]
}

export type Sim = {
  bodies: Body[]
  nextId: number
  mode: CollisionMode
}

export type SimEvent = {
  type: "merge" | "bounce"
  x: number
  y: number
  magnitude: number
  color: string
}

export type Preset = {
  id: Kind
  label: string
  mass: number
  radius: number
  color: string
}

export const PRESETS: readonly Preset[] = [
  { id: "dust", label: "Dust", mass: 1.4, radius: 3.1, color: "#f3e6d4" },
  { id: "moon", label: "Moon", mass: 7, radius: 5.2, color: "#a4d4c5" },
  { id: "rocky", label: "Rocky", mass: 32, radius: 8, color: "#ff6b5a" },
  { id: "ice", label: "Ice", mass: 54, radius: 10.5, color: "#b8a4ed" },
  { id: "giant", label: "Giant", mass: 170, radius: 16, color: "#ffb084" },
  { id: "star", label: "Star", mass: 8600, radius: 22, color: "#e8b94a" },
  { id: "hole", label: "Hole", mass: 17000, radius: 13, color: "#fffaf0" },
]

export const SCENARIOS: readonly { id: ScenarioId; label: string; tone: SceneTone; blurb: string }[] = [
  { id: "system", label: "System", tone: "ochre", blurb: "A star, two planets, and a moon" },
  { id: "binary", label: "Binary", tone: "peach", blurb: "Twin stars with a distant world" },
  { id: "eight", label: "Figure-8", tone: "lavender", blurb: "The classic three-body dance" },
  { id: "assist", label: "Assist", tone: "pink", blurb: "A comet steals speed from a giant" },
  { id: "swarm", label: "Swarm", tone: "teal", blurb: "Motes circling a black hole" },
  { id: "trojan", label: "Trojans", tone: "mint", blurb: "Worlds parked sixty degrees ahead and behind" },
  { id: "moons", label: "Moons", tone: "coral", blurb: "Four moons around a lone giant" },
  { id: "resonance", label: "Resonance", tone: "peach", blurb: "An eccentric pair locked in a 2:1 rhythm" },
  { id: "halo", label: "Halo", tone: "lavender", blurb: "A band of dust around a star" },
  { id: "trinity", label: "Trinity", tone: "pink", blurb: "A tight pair with a third star outside" },
  { id: "comet", label: "Comet", tone: "teal", blurb: "A long dive past an orbiting giant" },
  { id: "pinwheel", label: "Pinwheel", tone: "mint", blurb: "Three giants sharing one orbit" },
  { id: "disk", label: "Disk", tone: "coral", blurb: "Nested ellipses around a star" },
  { id: "pulse", label: "Pulse", tone: "ochre", blurb: "An eccentric binary that breathes" },
]

const KIND_RANK: Kind[] = ["dust", "moon", "rocky", "ice", "giant", "star", "hole"]

export function presetOf(kind: Kind): Preset {
  const found = PRESETS.find((p) => p.id === kind)
  if (!found) return PRESETS[2]
  return found
}

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && PRESETS.some((p) => p.id === value)
}

export function isMode(value: unknown): value is CollisionMode {
  return value === "merge" || value === "bounce" || value === "ghost"
}

export function isScenario(value: unknown): value is ScenarioId {
  return SCENARIOS.some((s) => s.id === value)
}

function epsOf(a: Body, b: Body): number {
  return SOFTEN_FACTOR * (a.radius + b.radius)
}

/** Circular relative speed for a Plummer-softened two-body pair. */
export function circularSpeed(totalMass: number, distance: number, eps: number): number {
  const r2 = distance * distance
  const soft = r2 + eps * eps
  return Math.sqrt((G * totalMass * r2) / (soft * Math.sqrt(soft)))
}

export function totalEnergy(bodies: readonly Body[]): number {
  let ke = 0
  let pe = 0
  for (const b of bodies) ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy)
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const soft = dx * dx + dy * dy + epsOf(a, b) ** 2
      pe -= (G * a.mass * b.mass) / Math.sqrt(soft)
    }
  }
  return ke + pe
}

export function addAccelerations(bodies: readonly Body[]): void {
  for (const b of bodies) {
    b.ax = 0
    b.ay = 0
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const soft = dx * dx + dy * dy + epsOf(a, b) ** 2
      const inv = G / (soft * Math.sqrt(soft))
      const ax = dx * inv
      const ay = dy * inv
      a.ax += ax * b.mass
      a.ay += ay * b.mass
      b.ax -= ax * a.mass
      b.ay -= ay * a.mass
    }
  }
}

function pushTrail(b: Body): void {
  const last = b.trail[b.trail.length - 1]
  if (last) {
    const dx = b.x - last.x
    const dy = b.y - last.y
    if (dx * dx + dy * dy < TRAIL_SPACING * TRAIL_SPACING) return
  }
  b.trail.push({ x: b.x, y: b.y })
  if (b.trail.length > TRAIL_MAX) b.trail.splice(0, b.trail.length - TRAIL_MAX)
}

function kindForMass(mass: number): Kind {
  if (mass >= 4500) return "star"
  if (mass >= 140) return "giant"
  if (mass >= 48) return "ice"
  if (mass >= 18) return "rocky"
  if (mass >= 5) return "moon"
  return "dust"
}

function combine(a: Body, b: Body, events: SimEvent[]): Body {
  const mass = a.mass + b.mass
  const keeper = a.mass >= b.mass ? a : b
  const x = (a.x * a.mass + b.x * b.mass) / mass
  const y = (a.y * a.mass + b.y * b.mass) / mass
  const vx = (a.vx * a.mass + b.vx * b.mass) / mass
  const vy = (a.vy * a.mass + b.vy * b.mass) / mass
  let kind = keeper.kind
  let color = keeper.color
  let radius = Math.cbrt(a.radius ** 3 + b.radius ** 3)
  if (a.kind === "hole" || b.kind === "hole" || mass >= 14000) {
    kind = "hole"
    color = presetOf("hole").color
    radius = Math.min(36, Math.max(radius * 0.45, 12 + Math.log10(mass) * 1.2))
  } else if (a.kind === "star" || b.kind === "star" || mass >= 4500) {
    kind = "star"
    color = presetOf("star").color
    radius = Math.min(48, Math.max(radius, 16))
  } else {
    radius = Math.min(42, radius)
    const next = kindForMass(mass)
    if (KIND_RANK.indexOf(next) > KIND_RANK.indexOf(kind)) kind = next
  }
  events.push({
    type: "merge",
    x,
    y,
    magnitude: mass,
    color: keeper.color,
  })
  return {
    ...keeper,
    kind,
    color,
    mass,
    radius,
    x,
    y,
    px: x,
    py: y,
    vx,
    vy,
    ax: 0,
    ay: 0,
  }
}

function bouncePair(a: Body, b: Body, events: SimEvent[]): void {
  let dx = b.x - a.x
  let dy = b.y - a.y
  let dist = Math.hypot(dx, dy)
  const minDist = a.radius + b.radius
  if (dist >= minDist) return
  if (dist < 1e-6) {
    dx = minDist
    dy = 0
    dist = minDist
  }
  const nx = dx / dist
  const ny = dy / dist
  const relN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  const pen = minDist - dist + 0.04
  const invMass = 1 / a.mass + 1 / b.mass
  if (relN < 0) {
    const e = -relN < 6 && pen < 2.5 ? 0.02 : 0.62
    const j = (-(1 + e) * relN) / invMass
    a.vx -= (j * nx) / a.mass
    a.vy -= (j * ny) / a.mass
    b.vx += (j * nx) / b.mass
    b.vy += (j * ny) / b.mass
    if (-relN > 12) {
      events.push({
        type: "bounce",
        x: (a.x * b.radius + b.x * a.radius) / minDist,
        y: (a.y * b.radius + b.y * a.radius) / minDist,
        magnitude: -relN,
        color: a.color,
      })
    }
  }
  const wa = 1 / a.mass / invMass
  const wb = 1 / b.mass / invMass
  a.x -= nx * pen * wa
  a.y -= ny * pen * wa
  b.x += nx * pen * wb
  b.y += ny * pen * wb
}

function resolveCollisions(bodies: Body[], mode: CollisionMode, events: SimEvent[]): Body[] {
  if (mode === "ghost" || bodies.length < 2) return bodies
  if (mode === "bounce") {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) bouncePair(bodies[i], bodies[j], events)
      }
    }
    return bodies
  }
  let list = bodies
  for (let pass = 0; pass < 6; pass++) {
    let bestI = -1
    let bestJ = -1
    let bestPen = 0
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const pen = a.radius + b.radius - Math.hypot(dx, dy)
        if (pen > bestPen) {
          bestPen = pen
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestI < 0) break
    const merged = combine(list[bestI], list[bestJ], events)
    const next: Body[] = []
    for (let i = 0; i < list.length; i++) {
      if (i === bestI) next.push(merged)
      else if (i !== bestJ) next.push(list[i])
    }
    list = next
  }
  return list
}

export function warm(sim: Sim): void {
  addAccelerations(sim.bodies)
  for (const b of sim.bodies) {
    b.px = b.x
    b.py = b.y
  }
}

export function stepSim(sim: Sim, dt: number, events: SimEvent[], trails = true): void {
  events.length = 0
  const bodies = sim.bodies
  for (const b of bodies) {
    b.px = b.x
    b.py = b.y
    b.vx += b.ax * dt * 0.5
    b.vy += b.ay * dt * 0.5
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  addAccelerations(bodies)
  for (const b of bodies) {
    b.vx += b.ax * dt * 0.5
    b.vy += b.ay * dt * 0.5
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > MAX_SPEED) {
      const s = MAX_SPEED / sp
      b.vx *= s
      b.vy *= s
    }
    if (trails) pushTrail(b)
  }
  const collided = resolveCollisions(bodies, sim.mode, events)
  if (collided !== bodies) sim.bodies = collided
  if (events.length > 0) addAccelerations(sim.bodies)
  if (sim.bodies.some((b) => !Number.isFinite(b.x) || !Number.isFinite(b.vx) || !Number.isFinite(b.ax))) {
    sim.bodies = sim.bodies.filter(
      (b) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy),
    )
    addAccelerations(sim.bodies)
  }
}

type Spawn = {
  kind: Kind
  x: number
  y: number
  vx?: number
  vy?: number
  mass?: number
  radius?: number
  color?: string
  tag?: string
}

function makeBody(next: () => number, input: Spawn): Body {
  const preset = presetOf(input.kind)
  const x = input.x
  const y = input.y
  return {
    id: next(),
    kind: input.kind,
    tag: input.tag ?? "",
    mass: input.mass ?? preset.mass,
    radius: input.radius ?? preset.radius,
    color: input.color ?? preset.color,
    x,
    y,
    px: x,
    py: y,
    vx: input.vx ?? 0,
    vy: input.vy ?? 0,
    ax: 0,
    ay: 0,
    trail: [],
  }
}

function finish(bodies: Body[]): Body[] {
  let m = 0
  let px = 0
  let py = 0
  let mx = 0
  let my = 0
  for (const b of bodies) {
    m += b.mass
    px += b.vx * b.mass
    py += b.vy * b.mass
    mx += b.x * b.mass
    my += b.y * b.mass
  }
  if (m <= 0) return bodies
  const vx = px / m
  const vy = py / m
  const cx = mx / m
  const cy = my / m
  for (const b of bodies) {
    b.vx -= vx
    b.vy -= vy
    b.x -= cx
    b.y -= cy
    b.px = b.x
    b.py = b.y
  }
  return bodies
}

function pairEps(a: Body, b: Body): number {
  return epsOf(a, b)
}

function buildSystem(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star" })
  const inner = makeBody(next, { kind: "rocky", x: 168, y: 0, tag: "inner" })
  const outer = makeBody(next, { kind: "giant", x: 340, y: 0, tag: "outer", mass: 480, radius: 18 })
  const moon = makeBody(next, { kind: "moon", x: 378, y: 0, tag: "moon", radius: 4.6 })
  inner.vy = circularSpeed(star.mass + inner.mass, 168, pairEps(star, inner))
  outer.vy = circularSpeed(star.mass + outer.mass, 340, pairEps(star, outer))
  moon.vy = outer.vy + circularSpeed(outer.mass + moon.mass, 38, pairEps(outer, moon))
  return finish([star, inner, outer, moon])
}

function buildBinary(next: () => number): Body[] {
  const mass = 4200
  const radius = 18
  const sep = 210
  const a = makeBody(next, {
    kind: "star",
    x: -sep / 2,
    y: 0,
    mass,
    radius,
    tag: "star-a",
    color: "#e8b94a",
  })
  const b = makeBody(next, {
    kind: "star",
    x: sep / 2,
    y: 0,
    mass,
    radius,
    tag: "star-b",
    color: "#ffb084",
  })
  const rel = circularSpeed(mass + mass, sep, pairEps(a, b))
  a.vy = rel / 2
  b.vy = -rel / 2
  const planetD = 680
  const planet = makeBody(next, { kind: "rocky", x: planetD, y: 0, tag: "planet" })
  const v = circularSpeed(mass + mass + planet.mass, planetD, SOFTEN_FACTOR * (radius + planet.radius))
  planet.vy = v
  return finish([a, b, planet])
}

function buildEight(next: () => number): Body[] {
  // Chenciner–Montgomery figure-8, scaled so one period is ~32s at 1×.
  const L = 170
  const period = 32
  const basePeriod = 6.32591398
  const mass = L ** 3 / (G * (period / basePeriod) ** 2)
  const vScale = Math.sqrt((G * mass) / L)
  const px = 0.97000436
  const py = -0.24308753
  const vx = 0.466203685
  const vy = 0.43236573
  const colors = ["#b8a4ed", "#a4d4c5", "#ffb084"]
  const specs = [
    { x: px, y: py, vx, vy },
    { x: -px, y: -py, vx, vy },
    { x: 0, y: 0, vx: -2 * vx, vy: -2 * vy },
  ]
  const bodies = specs.map((s, i) =>
    makeBody(next, {
      kind: "rocky",
      x: s.x * L,
      y: s.y * L,
      vx: s.vx * vScale,
      vy: s.vy * vScale,
      mass,
      radius: 6.2,
      color: colors[i],
      tag: `dancer-${i}`,
    }),
  )
  return finish(bodies)
}

function buildAssist(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 7600, radius: 20 })
  const dist = 260
  const giant = makeBody(next, { kind: "giant", x: dist, y: 0, tag: "giant" })
  const vg = circularSpeed(star.mass + giant.mass, dist, pairEps(star, giant))
  giant.vy = vg
  // Comet climbs past the giant's trailing flank. Tuned so the pass is close
  // but outside the merge radii, and the comet leaves faster than it arrived.
  const comet = makeBody(next, {
    kind: "dust",
    x: dist + 40,
    y: -460,
    vx: -8,
    vy: 78,
    tag: "comet",
    color: "#fffaf0",
  })
  return finish([star, giant, comet])
}

function buildSwarm(next: () => number): Body[] {
  const hole = makeBody(next, { kind: "hole", x: 0, y: 0, tag: "hole" })
  const dists = [84, 118, 160, 214, 280, 360, 450]
  const colors = ["#f3e6d4", "#a4d4c5", "#ff6b5a", "#b8a4ed", "#ffb084", "#e8b94a", "#fffaf0"]
  const gold = Math.PI * (3 - Math.sqrt(5))
  const bodies: Body[] = [hole]
  dists.forEach((d, i) => {
    const ang = i * gold
    const kind: Kind = i % 2 === 0 ? "dust" : "moon"
    const b = makeBody(next, {
      kind,
      x: Math.cos(ang) * d,
      y: Math.sin(ang) * d,
      color: colors[i % colors.length],
      tag: `mote-${i}`,
    })
    const retro = i === 4
    const v =
      circularSpeed(hole.mass + b.mass, d, pairEps(hole, b)) * (retro ? 0.86 : 0.94 + (i % 3) * 0.02)
    const dir = retro ? -1 : 1
    b.vx = -Math.sin(ang) * v * dir
    b.vy = Math.cos(ang) * v * dir
    bodies.push(b)
  })
  return finish(bodies)
}

function keplerState(mu: number, a: number, e: number, nu: number): { x: number; y: number; vx: number; vy: number } {
  const p = a * (1 - e * e)
  const r = p / (1 + e * Math.cos(nu))
  const scale = Math.sqrt(mu / p)
  const vr = scale * e * Math.sin(nu)
  const vt = scale * (1 + e * Math.cos(nu))
  const c = Math.cos(nu)
  const s = Math.sin(nu)
  return { x: r * c, y: r * s, vx: vr * c - vt * s, vy: vr * s + vt * c }
}

function rotateState(
  state: { x: number; y: number; vx: number; vy: number },
  angle: number,
): { x: number; y: number; vx: number; vy: number } {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return {
    x: state.x * c - state.y * s,
    y: state.x * s + state.y * c,
    vx: state.vx * c - state.vy * s,
    vy: state.vx * s + state.vy * c,
  }
}

function buildTrojan(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 9000, radius: 20 })
  const radius = 240
  const planet = makeBody(next, {
    kind: "giant",
    x: radius,
    y: 0,
    tag: "planet",
    mass: 96,
    radius: 13,
    color: "#ffb084",
  })
  const speed = circularSpeed(star.mass + planet.mass, radius, pairEps(star, planet))
  planet.vy = speed
  const lead = Math.PI / 3
  const specs = [
    { tag: "l4", angle: lead, color: "#a4d4c5" },
    { tag: "l5", angle: -lead, color: "#b8a4ed" },
  ]
  const bodies: Body[] = [star, planet]
  for (const spec of specs) {
    const x = Math.cos(spec.angle) * radius
    const y = Math.sin(spec.angle) * radius
    const trojan = makeBody(next, {
      kind: "moon",
      x,
      y,
      tag: spec.tag,
      mass: 5,
      radius: 4.4,
      color: spec.color,
    })
    trojan.vx = -Math.sin(spec.angle) * speed
    trojan.vy = Math.cos(spec.angle) * speed
    bodies.push(trojan)
  }
  return finish(bodies)
}

function buildMoons(next: () => number): Body[] {
  const giant = makeBody(next, {
    kind: "giant",
    x: 0,
    y: 0,
    tag: "giant",
    mass: 1500,
    radius: 22,
    color: "#ffb084",
  })
  const specs: { d: number; kind: Kind; tag: string; color: string; mass?: number }[] = [
    { d: 68, kind: "moon", tag: "inner", color: "#ff6b5a" },
    { d: 108, kind: "rocky", tag: "second", color: "#a4d4c5", mass: 18 },
    { d: 162, kind: "ice", tag: "third", color: "#b8a4ed", mass: 28 },
    { d: 228, kind: "dust", tag: "outer", color: "#e8b94a", mass: 8 },
  ]
  const bodies: Body[] = [giant]
  for (const spec of specs) {
    const moon = makeBody(next, {
      kind: spec.kind,
      x: spec.d,
      y: 0,
      tag: spec.tag,
      color: spec.color,
      mass: spec.mass,
    })
    moon.vy = circularSpeed(giant.mass + moon.mass, spec.d, pairEps(giant, moon))
    bodies.push(moon)
  }
  return finish(bodies)
}

function buildResonance(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 8800, radius: 20 })
  const a1 = 188
  const a2 = a1 * 2 ** (2 / 3)
  const innerState = keplerState(G * star.mass, a1, 0.07, 0)
  const outerState = keplerState(G * star.mass, a2, 0.045, 0)
  const inner = makeBody(next, {
    kind: "rocky",
    x: innerState.x,
    y: innerState.y,
    vx: innerState.vx,
    vy: innerState.vy,
    tag: "inner",
    color: "#ff6b5a",
  })
  const outer = makeBody(next, {
    kind: "ice",
    x: outerState.x,
    y: outerState.y,
    vx: outerState.vx,
    vy: outerState.vy,
    tag: "outer",
    color: "#b8a4ed",
  })
  return finish([star, inner, outer])
}

function buildHalo(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 7600, radius: 18 })
  const colors = ["#f3e6d4", "#a4d4c5", "#ffb084", "#b8a4ed", "#ff6b5a", "#e8b94a"]
  const bodies: Body[] = [star]
  const count = 10
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const dist = 168 + (i % 2) * 28
    const mote = makeBody(next, {
      kind: "dust",
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      color: colors[i % colors.length],
      tag: `ring-${i}`,
      mass: 1.1,
      radius: 2.8,
    })
    const speed = circularSpeed(star.mass + mote.mass, dist, pairEps(star, mote))
    mote.vx = -Math.sin(angle) * speed
    mote.vy = Math.cos(angle) * speed
    bodies.push(mote)
  }
  return finish(bodies)
}

function buildTrinity(next: () => number): Body[] {
  const mass = 2500
  const sep = 170
  const thirdMass = 2000
  const span = 540
  const totalBin = mass * 2
  const total = totalBin + thirdMass
  const binX = -span * (thirdMass / total)
  const thirdX = span * (totalBin / total)
  const a = makeBody(next, {
    kind: "star",
    x: binX - sep / 2,
    y: 0,
    mass,
    radius: 15,
    tag: "star-a",
    color: "#e8b94a",
  })
  const b = makeBody(next, {
    kind: "star",
    x: binX + sep / 2,
    y: 0,
    mass,
    radius: 15,
    tag: "star-b",
    color: "#ffb084",
  })
  const c = makeBody(next, {
    kind: "star",
    x: thirdX,
    y: 0,
    mass: thirdMass,
    radius: 14,
    tag: "star-c",
    color: "#ff6b5a",
  })
  const spin = circularSpeed(mass + mass, sep, pairEps(a, b))
  const orbit = circularSpeed(total, span, SOFTEN_FACTOR * (15 + 14))
  const vBin = orbit * (thirdMass / total)
  const vThird = orbit * (totalBin / total)
  a.vy = spin / 2 - vBin
  b.vy = -spin / 2 - vBin
  c.vy = vThird
  return finish([a, b, c])
}

function buildComet(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 8200, radius: 20 })
  const dist = 280
  const giant = makeBody(next, { kind: "giant", x: dist, y: 0, tag: "giant", mass: 220, radius: 15 })
  giant.vy = circularSpeed(star.mass + giant.mass, dist, pairEps(star, giant))
  const dive = rotateState(keplerState(G * star.mass, 760, 0.78, Math.PI), 1.15)
  const comet = makeBody(next, {
    kind: "dust",
    x: dive.x,
    y: dive.y,
    vx: dive.vx,
    vy: dive.vy,
    tag: "comet",
    color: "#fffaf0",
    mass: 1.2,
    radius: 3.2,
  })
  return finish([star, giant, comet])
}

function buildPinwheel(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 8400, radius: 18 })
  const dist = 250
  const mass = 130
  const colors = ["#ffb084", "#ff6b5a", "#e8b94a"]
  const bodies: Body[] = [star]
  const speed = circularSpeed(star.mass + mass, dist, SOFTEN_FACTOR * (star.radius + 12)) * 1.01
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3
    const giant = makeBody(next, {
      kind: "giant",
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      mass,
      radius: 12,
      color: colors[i],
      tag: `arm-${i}`,
    })
    giant.vx = -Math.sin(angle) * speed
    giant.vy = Math.cos(angle) * speed
    bodies.push(giant)
  }
  return finish(bodies)
}

function buildDisk(next: () => number): Body[] {
  const star = makeBody(next, { kind: "star", x: 0, y: 0, tag: "star", mass: 6200, radius: 18, color: "#e8b94a" })
  const colors = ["#f3e6d4", "#a4d4c5", "#ffb084", "#b8a4ed", "#ff6b5a", "#e8b94a", "#fffaf0", "#a4d4c5"]
  const bodies: Body[] = [star]
  const count = 8
  for (let i = 0; i < count; i++) {
    const state = rotateState(keplerState(G * star.mass, 150 + i * 42, 0.38, 0.4), i * 0.79)
    bodies.push(
      makeBody(next, {
        kind: "dust",
        x: state.x,
        y: state.y,
        vx: state.vx,
        vy: state.vy,
        color: colors[i],
        tag: `grain-${i}`,
        mass: 1.2,
        radius: 2.7,
      }),
    )
  }
  return finish(bodies)
}

function buildPulse(next: () => number): Body[] {
  const mass = 3200
  const a = 210
  const e = 0.48
  const sep = a * (1 - e)
  const rel = Math.sqrt((G * (mass + mass) * (1 + e)) / (a * (1 - e)))
  const left = makeBody(next, {
    kind: "star",
    x: -sep / 2,
    y: 0,
    mass,
    radius: 16,
    tag: "star-a",
    color: "#e8b94a",
  })
  const right = makeBody(next, {
    kind: "star",
    x: sep / 2,
    y: 0,
    mass,
    radius: 16,
    tag: "star-b",
    color: "#ffb084",
  })
  left.vy = rel / 2
  right.vy = -rel / 2
  const planetD = 690
  const planet = makeBody(next, { kind: "ice", x: planetD, y: 0, tag: "planet", color: "#b8a4ed" })
  planet.vy = circularSpeed(mass + mass + planet.mass, planetD, SOFTEN_FACTOR * (16 + planet.radius))
  return finish([left, right, planet])
}

export function createScenario(id: ScenarioId): Sim {
  let n = 1
  const next = () => n++
  const builders: Record<ScenarioId, (next: () => number) => Body[]> = {
    system: buildSystem,
    binary: buildBinary,
    eight: buildEight,
    assist: buildAssist,
    swarm: buildSwarm,
    trojan: buildTrojan,
    moons: buildMoons,
    resonance: buildResonance,
    halo: buildHalo,
    trinity: buildTrinity,
    comet: buildComet,
    pinwheel: buildPinwheel,
    disk: buildDisk,
    pulse: buildPulse,
  }
  const bodies = builders[id](next)
  const sim: Sim = { bodies, nextId: n, mode: "merge" }
  warm(sim)
  return sim
}

function separatePoint(bodies: readonly Body[], x: number, y: number, radius: number): { x: number; y: number } {
  let px = x
  let py = y
  for (let pass = 0; pass < 5; pass++) {
    let moved = false
    for (const b of bodies) {
      let dx = px - b.x
      let dy = py - b.y
      let dist = Math.hypot(dx, dy)
      const min = b.radius + radius + 2
      if (dist < min) {
        if (dist < 1e-4) {
          dx = min
          dy = 0
          dist = min
        }
        px = b.x + (dx / dist) * min
        py = b.y + (dy / dist) * min
        moved = true
      }
    }
    if (!moved) break
  }
  return { x: px, y: py }
}

export function addBody(sim: Sim, input: Spawn): Body | null {
  if (sim.bodies.length >= MAX_BODIES) return null
  const preset = presetOf(input.kind)
  const radius = input.radius ?? preset.radius
  const pos = separatePoint(sim.bodies, input.x, input.y, radius)
  const body = makeBody(() => sim.nextId++, { ...input, x: pos.x, y: pos.y, radius })
  sim.bodies.push(body)
  warm(sim)
  return body
}

export function removeBody(sim: Sim, id: number): void {
  const next = sim.bodies.filter((b) => b.id !== id)
  if (next.length === sim.bodies.length) return
  sim.bodies = next
  warm(sim)
}

export function clearBodies(sim: Sim): void {
  sim.bodies = []
}

export type LaunchRegime = "circular" | "bound" | "escape" | "impact" | "free"

export function classifyLaunch(
  sources: readonly Body[],
  x: number,
  y: number,
  vx: number,
  vy: number,
  probeRadius: number,
  ignoreId?: number,
  probeMass = 0,
): { speed: number; regime: LaunchRegime } {
  const speed = Math.hypot(vx, vy)
  let best: Body | null = null
  let bestAcc = 0
  let bestDist = 0
  for (const b of sources) {
    if (b.id === ignoreId) continue
    const dx = x - b.x
    const dy = y - b.y
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-3) continue
    const acc = (G * b.mass) / (dist * dist)
    if (acc > bestAcc) {
      bestAcc = acc
      best = b
      bestDist = dist
    }
  }
  if (!best || bestAcc < 0.02) return { speed, regime: "free" }
  if (bestDist < best.radius + probeRadius) return { speed, regime: "impact" }
  const central = best.mass + Math.max(0, probeMass)
  const eps = SOFTEN_FACTOR * (best.radius + probeRadius)
  const vc = circularSpeed(central, bestDist, eps)
  const ve = Math.sqrt((2 * G * central) / Math.sqrt(bestDist * bestDist + eps * eps))
  const rx = (x - best.x) / bestDist
  const ry = (y - best.y) / bestDist
  const radial = Math.abs(vx * rx + vy * ry)
  if (speed > vc * 0.88 && speed < vc * 1.12 && radial < Math.max(6, speed * 0.24)) {
    return { speed, regime: "circular" }
  }
  if (speed < ve * 0.98) return { speed, regime: "bound" }
  return { speed, regime: "escape" }
}

const NO_TRAIL: { x: number; y: number }[] = []

export type PredictSpec = {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  radius: number
  kind: Kind
  color: string
  replaceId?: number
}

/**
 * Future path of a launch, using the same integrator, masses, and collision
 * mode as the live sim. A massless trace with frozen wells misses slingshots.
 */
export function predictLaunch(
  bodies: readonly Body[],
  mode: CollisionMode,
  spec: PredictSpec,
  duration = 3.2,
): { points: { x: number; y: number }[]; hit: boolean; x: number; y: number } {
  const clones = bodies.map((b) => ({ ...b, trail: NO_TRAIL }))
  let nextId = 1
  for (const b of clones) if (b.id >= nextId) nextId = b.id + 1
  const sim: Sim = { bodies: clones, nextId, mode }
  let probeId: number
  let originX = spec.x
  let originY = spec.y
  if (spec.replaceId != null) {
    const body = sim.bodies.find((b) => b.id === spec.replaceId)
    if (!body) return { points: [], hit: false, x: spec.x, y: spec.y }
    body.vx = spec.vx
    body.vy = spec.vy
    probeId = body.id
    originX = body.x
    originY = body.y
  } else {
    const pos = separatePoint(sim.bodies, spec.x, spec.y, spec.radius)
    const body = makeBody(() => sim.nextId++, {
      kind: spec.kind,
      x: pos.x,
      y: pos.y,
      vx: spec.vx,
      vy: spec.vy,
      mass: spec.mass,
      radius: spec.radius,
      color: spec.color,
      tag: "aim",
    })
    sim.bodies.push(body)
    probeId = body.id
    originX = body.x
    originY = body.y
  }
  warm(sim)
  const n = sim.bodies.length
  const dt = n > 28 ? DT * 4 : n > 12 ? DT * 2 : DT
  const steps = Math.min(960, Math.max(1, Math.round(duration / dt)))
  const sampleEvery = Math.max(1, Math.round(steps / 140))
  const events: SimEvent[] = []
  const points: { x: number; y: number }[] = [{ x: originX, y: originY }]
  const find = () => sim.bodies.find((b) => b.id === probeId)
  for (let i = 1; i <= steps; i++) {
    stepSim(sim, dt, events, false)
    const probe = find()
    if (!probe || !Number.isFinite(probe.x) || !Number.isFinite(probe.y)) {
      const last = points[points.length - 1]
      let bestX = last.x
      let bestY = last.y
      let bestD = Infinity
      for (const ev of events) {
        const dx = ev.x - last.x
        const dy = ev.y - last.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          bestX = ev.x
          bestY = ev.y
        }
      }
      if (bestX !== last.x || bestY !== last.y) points.push({ x: bestX, y: bestY })
      return { points, hit: true, x: originX, y: originY }
    }
    if (i % sampleEvery === 0 || i === steps) points.push({ x: probe.x, y: probe.y })
    const dx = probe.x - originX
    const dy = probe.y - originY
    if (dx * dx + dy * dy > 16e6) return { points, hit: false, x: originX, y: originY }
  }
  return { points, hit: false, x: originX, y: originY }
}

export function selfTest(): Record<string, number> {
  const out: Record<string, number> = {}
  const bin = createScenario("binary")
  bin.mode = "ghost"
  const stars = bin.bodies.filter((b) => b.kind === "star")
  const sep0 = Math.hypot(stars[0].x - stars[1].x, stars[0].y - stars[1].y)
  const e0 = totalEnergy(bin.bodies)
  let maxE = 0
  const events: SimEvent[] = []
  for (let i = 0; i < 240 * 24; i++) {
    stepSim(bin, DT, events)
    if (i % 80 === 0) maxE = Math.max(maxE, Math.abs(totalEnergy(bin.bodies) - e0) / Math.abs(e0))
  }
  const sep1 = Math.hypot(stars[0].x - stars[1].x, stars[0].y - stars[1].y)
  out.binaryEnergyDrift = maxE
  out.binarySepDrift = Math.abs(sep1 - sep0) / sep0
  out.binaryCount = bin.bodies.length

  const sys = createScenario("system")
  sys.mode = "ghost"
  const moon = sys.bodies.find((b) => b.tag === "moon")!
  const outer = sys.bodies.find((b) => b.tag === "outer")!
  let moonMin = Infinity
  let moonMax = 0
  for (let i = 0; i < 240 * 40; i++) {
    stepSim(sys, DT, events)
    const d = Math.hypot(moon.x - outer.x, moon.y - outer.y)
    moonMin = Math.min(moonMin, d)
    moonMax = Math.max(moonMax, d)
  }
  out.moonMin = moonMin
  out.moonMax = moonMax
  out.systemCount = sys.bodies.length

  const eight = createScenario("eight")
  eight.mode = "ghost"
  let extent0 = 0
  for (const b of eight.bodies) extent0 = Math.max(extent0, Math.hypot(b.x, b.y))
  let extentMax = 0
  let minPair = Infinity
  for (let i = 0; i < 240 * 40; i++) {
    stepSim(eight, DT, events)
    for (const b of eight.bodies) extentMax = Math.max(extentMax, Math.hypot(b.x, b.y))
    if (i % 10 === 0) {
      const bs = eight.bodies
      for (let a = 0; a < bs.length; a++) {
        for (let c = a + 1; c < bs.length; c++) {
          minPair = Math.min(minPair, Math.hypot(bs[a].x - bs[c].x, bs[a].y - bs[c].y))
        }
      }
    }
  }
  out.eightExtent = extentMax / extent0
  out.eightMinPair = minPair
  out.eightCount = eight.bodies.length

  const assist = createScenario("assist")
  assist.mode = "merge"
  const comet = () => assist.bodies.find((b) => b.tag === "comet")
  const giant = () => assist.bodies.find((b) => b.tag === "giant")
  const startSpeed = Math.hypot(comet()!.vx, comet()!.vy)
  let minCG = Infinity
  let minCS = Infinity
  let speedAtClose = startSpeed
  for (let i = 0; i < 240 * 18; i++) {
    stepSim(assist, DT, events)
    const c = comet()
    const g = giant()
    const s = assist.bodies.find((b) => b.tag === "star")
    if (!c || !g || !s) break
    const dg = Math.hypot(c.x - g.x, c.y - g.y)
    const ds = Math.hypot(c.x - s.x, c.y - s.y)
    if (dg < minCG) {
      minCG = dg
      speedAtClose = Math.hypot(c.vx, c.vy)
    }
    minCS = Math.min(minCS, ds)
  }
  const end = comet()
  out.assistMinGiant = minCG
  out.assistMinStar = minCS
  out.assistStart = startSpeed
  out.assistClose = speedAtClose
  out.assistEnd = end ? Math.hypot(end.vx, end.vy) : 0
  out.assistAlive = end ? 1 : 0

  const a = makeBody(() => 1, { kind: "rocky", x: -10, y: 0, vx: 30, vy: 0, tag: "a" })
  const b = makeBody(() => 2, { kind: "moon", x: 10, y: 0, vx: -10, vy: 4, tag: "b" })
  const before = a.mass * a.vx + b.mass * b.vx
  const beforeY = a.mass * a.vy + b.mass * b.vy
  const merged = combine(a, b, [])
  out.mergePx = Math.abs(merged.mass * merged.vx - before)
  out.mergePy = Math.abs(merged.mass * merged.vy - beforeY)

  const star = makeBody(() => 1, { kind: "star", x: 0, y: 0 })
  const probeR = 8
  const d = 200
  const eps = SOFTEN_FACTOR * (star.radius + probeR)
  const vc = circularSpeed(star.mass, d, eps)
  const cls = classifyLaunch([star], d, 0, 0, vc, probeR)
  out.circularFlag = cls.regime === "circular" ? 1 : 0

  let finite = 1
  for (const sim of [bin, sys, eight, assist]) {
    for (const body of sim.bodies) {
      if (!Number.isFinite(body.x) || !Number.isFinite(body.vx)) finite = 0
    }
  }
  out.finite = finite
  return out
}
