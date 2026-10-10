import type { Body } from "@/lib/orbit/sim"

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  radius: number
  color: string
}

export type Flash = {
  x: number
  y: number
  life: number
  max: number
  radius: number
}

export type Aim = {
  x: number
  y: number
  radius: number
  color: string
  path: { x: number; y: number }[]
  hit: boolean
  regime: string
  label: string
  anchorX: number
  anchorY: number
  pointerX: number
  pointerY: number
  gesture: boolean
}

export type StarDot = { x: number; y: number; r: number; a: number; p: number }

export type SceneView = {
  dpr: number
  cssW: number
  cssH: number
  camX: number
  camY: number
  zoom: number
  shakeX: number
  shakeY: number
  time: number
  trails: boolean
  reduceMotion: boolean
  selectedId: number | null
  bg: string
  fg: string
  muted: string
}

const TAU = Math.PI * 2
const DANGER = "#ff6b5a"

export function makeStars(count: number): StarDot[] {
  let s = 48271
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const stars: StarDot[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(),
      y: rand(),
      r: rand() < 0.08 ? 1.4 : 0.7,
      a: 0.25 + rand() * 0.55,
      p: 0.15 + rand() * 0.85,
    })
  }
  return stars
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

function mix(hex: string, toward: number, t: number): string {
  const [r, g, b] = parseHex(hex)
  const m = (c: number) => Math.round(c + (toward - c) * t)
  return `rgb(${m(r)},${m(g)},${m(b)})`
}

function renderPos(b: Body, alpha: number): { x: number; y: number } {
  return {
    x: b.px + (b.x - b.px) * alpha,
    y: b.py + (b.y - b.py) * alpha,
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  bodies: readonly Body[],
  alpha: number,
  particles: readonly Particle[],
  flashes: readonly Flash[],
  stars: readonly StarDot[],
  aim: Aim | null,
): void {
  const { dpr, cssW, cssH, zoom } = view
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.setTransform(dpr, 0, 0, dpr, view.shakeX * dpr, view.shakeY * dpr)
  ctx.fillStyle = view.bg
  ctx.fillRect(-40, -40, cssW + 80, cssH + 80)

  for (const star of stars) {
    const sx = ((star.x * cssW - view.camX * star.p * 0.08) % cssW + cssW) % cssW
    const sy = ((star.y * cssH + view.camY * star.p * 0.08) % cssH + cssH) % cssH
    ctx.globalAlpha = star.a
    ctx.fillStyle = view.fg
    ctx.beginPath()
    ctx.arc(sx, sy, star.r, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const s = zoom * dpr
  ctx.setTransform(
    s,
    0,
    0,
    -s,
    (cssW / 2 + view.shakeX) * dpr - view.camX * s,
    (cssH / 2 + view.shakeY) * dpr + view.camY * s,
  )
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (view.trails) {
    for (const b of bodies) {
      const pts = b.trail
      if (pts.length < 2) continue
      const bands = 4
      for (let band = 0; band < bands; band++) {
        const i0 = Math.floor(((pts.length - 1) * band) / bands)
        const i1 = Math.floor(((pts.length - 1) * (band + 1)) / bands)
        if (i1 <= i0) continue
        ctx.beginPath()
        ctx.moveTo(pts[i0].x, pts[i0].y)
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.strokeStyle = rgba(b.color, 0.07 + 0.16 * band)
        ctx.lineWidth = (1.15 + band * 0.2) / zoom
        ctx.stroke()
      }
    }
  }

  const order = bodies.map((b, i) => i).sort((i, j) => bodies[j].radius - bodies[i].radius)
  for (const index of order) drawBody(ctx, bodies[index], renderPos(bodies[index], alpha), zoom, view.time)

  for (const p of particles) {
    const t = Math.max(0, p.life / p.max)
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(0.45 / zoom, (1.5 * (0.45 + t)) / zoom), 0, TAU)
    ctx.fillStyle = rgba(p.color, 0.85 * t)
    ctx.fill()
  }

  for (const f of flashes) {
    const t = Math.max(0, f.life / f.max)
    const radius = f.radius + (1 - t) * f.radius * 2.4
    ctx.beginPath()
    ctx.arc(f.x, f.y, radius, 0, TAU)
    ctx.strokeStyle = rgba(view.fg, 0.45 * t)
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()
  }

  if (view.selectedId != null) {
    const selected = bodies.find((b) => b.id === view.selectedId)
    if (selected) {
      const p = renderPos(selected, alpha)
      ctx.beginPath()
      ctx.arc(p.x, p.y, selected.radius + 6 / zoom, 0, TAU)
      ctx.strokeStyle = rgba(view.fg, 0.85)
      ctx.lineWidth = 1.25 / zoom
      ctx.stroke()
    }
  }

  if (aim && aim.regime !== "move") {
    ctx.beginPath()
    ctx.arc(aim.x, aim.y, aim.radius, 0, TAU)
    ctx.fillStyle = rgba(aim.color, 0.2)
    ctx.fill()
    ctx.strokeStyle = rgba(aim.hit ? DANGER : aim.color, 0.95)
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()
  }

  ctx.setTransform(dpr, 0, 0, dpr, view.shakeX * dpr, view.shakeY * dpr)
  const vignette = ctx.createRadialGradient(
    cssW / 2,
    cssH / 2,
    Math.min(cssW, cssH) * 0.35,
    cssW / 2,
    cssH / 2,
    Math.max(cssW, cssH) * 0.72,
  )
  vignette.addColorStop(0, "rgba(0,0,0,0)")
  vignette.addColorStop(1, "rgba(0,0,0,0.38)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, cssW, cssH)

  if (aim) drawAim(ctx, view, aim)
}

function project(view: SceneView, x: number, y: number) {
  return {
    x: (x - view.camX) * view.zoom + view.cssW / 2,
    y: view.cssH / 2 - (y - view.camY) * view.zoom,
  }
}

function dashPolyline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  dash: number,
  gap: number,
  phase: number,
) {
  const period = dash + gap
  let cursor = phase
  ctx.beginPath()
  for (let i = 1; i < points.length; i++) {
    const x0 = points[i - 1].x
    const y0 = points[i - 1].y
    const x1 = points[i].x
    const y1 = points[i].y
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len < 0.4) continue
    let t = 0
    while (t < len) {
      const at = ((cursor % period) + period) % period
      const drawing = at < dash
      const until = drawing ? dash - at : period - at
      const step = Math.min(until, len - t)
      if (drawing) {
        const a0 = t / len
        const a1 = (t + step) / len
        ctx.moveTo(x0 + (x1 - x0) * a0, y0 + (y1 - y0) * a0)
        ctx.lineTo(x0 + (x1 - x0) * a1, y0 + (y1 - y0) * a1)
      }
      t += step
      cursor += step
    }
  }
  ctx.stroke()
}

function drawAim(ctx: CanvasRenderingContext2D, view: SceneView, aim: Aim) {
  const stroke = aim.hit || aim.regime === "impact" ? DANGER : aim.color
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (aim.gesture) {
    const dx = aim.pointerX - aim.anchorX
    const dy = aim.pointerY - aim.anchorY
    const len = Math.hypot(dx, dy)
    if (len > 6) {
      ctx.beginPath()
      ctx.moveTo(aim.anchorX, aim.anchorY)
      ctx.lineTo(aim.pointerX, aim.pointerY)
      ctx.strokeStyle = rgba(view.fg, 0.78)
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (len > 16) {
        const ang = Math.atan2(dy, dx)
        const size = 8
        ctx.beginPath()
        ctx.moveTo(aim.pointerX, aim.pointerY)
        ctx.lineTo(aim.pointerX - Math.cos(ang - 0.42) * size, aim.pointerY - Math.sin(ang - 0.42) * size)
        ctx.moveTo(aim.pointerX, aim.pointerY)
        ctx.lineTo(aim.pointerX - Math.cos(ang + 0.42) * size, aim.pointerY - Math.sin(ang + 0.42) * size)
        ctx.stroke()
      }
    }
  }

  if (aim.path.length > 1) {
    const screen = aim.path.map((p) => project(view, p.x, p.y))
    ctx.lineWidth = 1.75
    ctx.strokeStyle = rgba(stroke, 0.92)
    dashPolyline(ctx, screen, 8, 6, view.reduceMotion ? 0 : view.time * 26)
    const end = screen[screen.length - 1]
    ctx.beginPath()
    ctx.arc(end.x, end.y, aim.hit ? 5.5 : 3.25, 0, TAU)
    ctx.lineWidth = 1.5
    ctx.stroke()
    if (aim.hit) {
      const s = 3.5
      ctx.beginPath()
      ctx.moveTo(end.x - s, end.y - s)
      ctx.lineTo(end.x + s, end.y + s)
      ctx.moveTo(end.x + s, end.y - s)
      ctx.lineTo(end.x - s, end.y + s)
      ctx.stroke()
    }
  }

  ctx.font = "500 13px Inter, ui-sans-serif, sans-serif"
  const showDot = aim.regime !== "place" && aim.regime !== "move"
  const dot = showDot ? 6 : 0
  const gap = showDot ? 6 : 0
  const padX = 8
  const textW = ctx.measureText(aim.label).width
  const boxW = padX * 2 + dot + gap + textW
  const boxH = 26
  let lx = aim.pointerX + 14
  let ly = aim.pointerY - 36
  lx = Math.max(8, Math.min(view.cssW - boxW - 8, lx))
  ly = Math.max(8, Math.min(view.cssH - boxH - 8, ly))
  ctx.fillStyle = "rgba(10,26,26,0.92)"
  ctx.beginPath()
  ctx.roundRect(lx, ly, boxW, boxH, 8)
  ctx.fill()
  if (showDot) {
    ctx.beginPath()
    ctx.arc(lx + padX + dot / 2, ly + boxH / 2, dot / 2, 0, TAU)
    ctx.fillStyle = stroke
    ctx.fill()
  }
  ctx.fillStyle = view.fg
  ctx.fillText(aim.label, lx + padX + dot + gap, ly + 17)
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: Body,
  p: { x: number; y: number },
  zoom: number,
  time: number,
): void {
  const { x, y } = p
  const r = b.radius
  if (r * zoom < 0.7) {
    ctx.fillStyle = b.color
    ctx.beginPath()
    ctx.arc(x, y, Math.max(r, 0.8 / zoom), 0, TAU)
    ctx.fill()
    return
  }

  if (b.kind === "hole") {
    ctx.beginPath()
    ctx.ellipse(x, y, r * 2.7, r * 0.92, time * 0.28 + b.id, 0, TAU)
    ctx.strokeStyle = rgba(b.color, 0.72)
    ctx.lineWidth = 1.35 / zoom
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(x, y, r * 2.15, r * 0.7, time * 0.28 + b.id + 0.4, 0, TAU)
    ctx.strokeStyle = rgba("#ffb084", 0.4)
    ctx.lineWidth = 2.4 / zoom
    ctx.stroke()
    const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.1)
    glow.addColorStop(0, "rgba(0,0,0,0)")
    glow.addColorStop(0.55, rgba(b.color, 0.14))
    glow.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, r * 2.1, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fillStyle = "#05060a"
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r * 1.08, 0, TAU)
    ctx.strokeStyle = rgba(b.color, 0.9)
    ctx.lineWidth = 1.1 / zoom
    ctx.stroke()
    return
  }

  if (b.kind === "star") {
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4.6)
    glow.addColorStop(0, rgba(b.color, 0.5))
    glow.addColorStop(0.28, rgba(b.color, 0.12))
    glow.addColorStop(1, rgba(b.color, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, r * 4.6, 0, TAU)
    ctx.fill()
  }

  const grad = ctx.createRadialGradient(x - r * 0.34, y + r * 0.36, r * 0.08, x, y, r)
  grad.addColorStop(0, mix(b.color, 255, 0.55))
  grad.addColorStop(0.45, b.color)
  grad.addColorStop(1, mix(b.color, 0, 0.45))
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = grad
  ctx.fill()

  if (b.kind === "giant" || b.kind === "ice") {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.clip()
    ctx.strokeStyle = b.kind === "giant" ? "rgba(40,28,16,0.28)" : "rgba(255,255,255,0.28)"
    const offsets = b.kind === "giant" ? [-0.32, 0.02, 0.34] : [-0.18, 0.22]
    for (const off of offsets) {
      ctx.beginPath()
      ctx.moveTo(x - r, y + off * r)
      ctx.lineTo(x + r, y + off * r)
      ctx.lineWidth = r * (b.kind === "giant" ? 0.14 : 0.1)
      ctx.stroke()
    }
    ctx.restore()
    ctx.beginPath()
    ctx.ellipse(x, y, r * 1.72, r * 0.42, -0.5, 0, TAU)
    ctx.strokeStyle = rgba(b.color, b.kind === "ice" ? 0.45 : 0.38)
    ctx.lineWidth = Math.max(1.1 / zoom, r * 0.06)
    ctx.stroke()
  }

  if ((b.kind === "rocky" || b.kind === "moon") && r > 4) {
    const n = b.kind === "moon" ? 3 : 2
    for (let i = 0; i < n; i++) {
      const a = b.id * 1.7 + i * 2.3
      const cr = r * (0.28 + i * 0.16)
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * cr, y + Math.sin(a) * cr * 0.75, r * 0.13, 0, TAU)
      ctx.fillStyle = "rgba(0,0,0,0.16)"
      ctx.fill()
    }
  }

  if (b.kind === "rocky" || b.kind === "ice") {
    ctx.beginPath()
    ctx.arc(x, y, r * 1.06, 0, TAU)
    ctx.strokeStyle = rgba(b.color, 0.35)
    ctx.lineWidth = Math.max(r * 0.1, 0.8 / zoom)
    ctx.stroke()
  }
}
