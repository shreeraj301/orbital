import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Crosshair, Moon, Pause, Play, Sun, Trash2, Volume2, VolumeX } from "lucide-react"
import {
  DT,
  PRESETS,
  SCENARIOS,
  addBody,
  classifyLaunch,
  clearBodies,
  createScenario,
  isKind,
  isMode,
  isScenario,
  presetOf,
  removeBody,
  predictLaunch,
  stepSim,
  warm,
  type Body,
  type CollisionMode,
  type Kind,
  type ScenarioId,
  type Sim,
  type SimEvent,
} from "@/lib/orbit/sim"
import { makeStars, renderScene, type Aim, type Flash, type Particle, type StarDot } from "@/lib/orbit/draw"
import { OrbitAudio } from "@/lib/orbit/audio"

const SAVE_KEY = "orbital-settings-v1"
const LAUNCH_CAP = 720

type Drag =
  | {
      mode: "spawn" | "nudge" | "move"
      id?: number
      sx: number
      sy: number
      x0: number
      y0: number
      x: number
      y: number
      px: number
      py: number
    }
  | {
      mode: "pan"
      sx: number
      sy: number
      x: number
      y: number
      camX: number
      camY: number
    }

type Pinch = {
  dist: number
  zoom: number
  anchorX: number
  anchorY: number
}

declare global {
  interface Window {
    __orbit?: {
      count: () => number
      load: (id: ScenarioId) => void
      fling: (x: number, y: number, vx: number, vy: number, kind?: Kind) => number
      clear: () => void
      positions: () => Pick<Body, "id" | "x" | "y" | "vx" | "vy" | "mass" | "kind" | "tag">[]
    }
  }
}

function formatScale(scale: number): string {
  const snapped = Math.round(scale * 20) / 20
  return `${Number(snapped.toFixed(2))}×`
}

function formatSpeed(speed: number): string {
  if (!Number.isFinite(speed)) return "0"
  if (speed >= 100) return speed.toFixed(0)
  if (speed >= 10) return speed.toFixed(1)
  return speed.toFixed(2)
}

function formatMass(mass: number): string {
  if (!Number.isFinite(mass)) return "0"
  if (mass >= 100) return mass.toFixed(0)
  const rounded = Math.round(mass * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const REGIME_LABEL: Record<string, string> = {
  circular: "Circular",
  bound: "Bound",
  escape: "Escape",
  impact: "Impact",
  free: "Drift",
}

export function OrbitSim() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const simRef = useRef<Sim | null>(null)
  if (simRef.current === null) simRef.current = createScenario("system")

  const [preset, setPreset] = useState<Kind>("rocky")
  const [paused, setPaused] = useState(false)
  const [timeScale, setTimeScale] = useState(1)
  const [trails, setTrails] = useState(true)
  const [collision, setCollision] = useState<CollisionMode>("merge")
  const [place, setPlace] = useState(false)
  const [muted, setMuted] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [scenario, setScenario] = useState<ScenarioId>("system")
  const [count, setCount] = useState(() => simRef.current?.bodies.length ?? 0)
  const [selected, setSelected] = useState<{
    id: number
    label: string
    mass: number
    speed: number
    color: string
  } | null>(null)
  const [armClear, setArmClear] = useState(false)
  const [full, setFull] = useState(false)
  const [ready, setReady] = useState(false)

  const live = useRef({
    paused: false,
    timeScale: 1,
    trails: true,
    collision: "merge" as CollisionMode,
    preset: "rocky" as Kind,
    place: false,
    muted: false,
    scenario: "system" as ScenarioId,
  })
  live.current.paused = paused
  live.current.timeScale = timeScale
  live.current.trails = trails
  live.current.collision = collision
  live.current.preset = preset
  live.current.place = place
  live.current.muted = muted
  live.current.scenario = scenario

  const cam = useRef({ x: 0, y: 0, zoom: 1 })
  const viewSize = useRef({ cssW: 1, cssH: 1, dpr: 1 })
  const selectedId = useRef<number | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<Pinch | null>(null)
  const suppressRef = useRef(false)
  const holdRef = useRef(false)
  const starsRef = useRef<StarDot[] | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const flashesRef = useRef<Flash[]>([])
  const audioRef = useRef<OrbitAudio | null>(null)
  const reduceRef = useRef(false)
  const trauma = useRef(0)
  const framed = useRef(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actions = useRef({
    load: (_id: ScenarioId) => {},
    wipe: () => {},
    frame: () => {},
  })

  const syncCount = () => setCount(simRef.current?.bodies.length ?? 0)

  const publishSelection = (id: number | null) => {
    selectedId.current = id
    const sim = simRef.current
    if (!sim || id == null) {
      setSelected(null)
      return
    }
    const body = sim.bodies.find((b) => b.id === id)
    if (!body) {
      selectedId.current = null
      setSelected(null)
      return
    }
    setSelected({
      id: body.id,
      label: presetOf(body.kind).label,
      mass: body.mass,
      speed: Math.hypot(body.vx, body.vy),
      color: body.color,
    })
  }

  const frameBodies = (bodies: readonly Body[]) => {
    const { cssW, cssH } = viewSize.current
    if (cssW < 2 || cssH < 2) return
    if (bodies.length === 0) {
      cam.current.x = 0
      cam.current.y = 0
      cam.current.zoom = 1.1
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const b of bodies) {
      minX = Math.min(minX, b.x - b.radius)
      minY = Math.min(minY, b.y - b.radius)
      maxX = Math.max(maxX, b.x + b.radius)
      maxY = Math.max(maxY, b.y + b.radius)
    }
    const bw = Math.max(48, (maxX - minX) * 1.45)
    const bh = Math.max(48, (maxY - minY) * 1.45)
    const top = 20
    const viewW = Math.max(80, cssW - 32)
    const viewH = Math.max(80, cssH - top - 16)
    const zoom = Math.max(0.12, Math.min(6, Math.min(viewW / bw, viewH / bh)))
    cam.current.zoom = zoom
    const freeCenterY = top + viewH / 2
    cam.current.x = (minX + maxX) / 2
    cam.current.y = (minY + maxY) / 2 + (freeCenterY - cssH / 2) / zoom
  }

  const audio = () => {
    if (!audioRef.current) audioRef.current = new OrbitAudio()
    audioRef.current.muted = live.current.muted
    return audioRef.current
  }

  const unlockAudio = () => {
    audio().unlock()
  }

  const burst = (x: number, y: number, color: string, n: number, speed: number) => {
    const countN = reduceRef.current ? Math.min(n, 6) : n
    const list = particlesRef.current
    for (let i = 0; i < countN; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random() * 0.85)
      const life = 0.35 + Math.random() * 0.45
      list.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        radius: 1.1 + Math.random() * 1.8,
        color,
      })
    }
    if (list.length > 420) list.splice(0, list.length - 420)
    flashesRef.current.push({ x, y, life: 0.32, max: 0.32, radius: 8 + Math.min(24, speed * 0.08) })
    if (!reduceRef.current) trauma.current = Math.min(1, trauma.current + Math.min(0.65, 0.12 + speed / 320))
  }

  const load = (id: ScenarioId) => {
    const sim = createScenario(id)
    sim.mode = live.current.collision
    simRef.current = sim
    setScenario(id)
    publishSelection(null)
    syncCount()
    particlesRef.current = []
    flashesRef.current = []
    frameBodies(sim.bodies)
    audio().scene()
  }

  const wipe = () => {
    const sim = simRef.current
    if (!sim) return
    clearBodies(sim)
    publishSelection(null)
    syncCount()
    cam.current.x = 0
    cam.current.y = 0
    cam.current.zoom = 1.1
    particlesRef.current = []
    flashesRef.current = []
    setArmClear(false)
  }

  actions.current.load = load
  actions.current.wipe = wipe
  actions.current.frame = () => frameBodies(simRef.current?.bodies ?? [])

  useEffect(() => {
    const unlock = () => audio().unlock()
    window.addEventListener("pointerdown", unlock)
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (isKind(saved.preset)) setPreset(saved.preset)
      if (isMode(saved.collision)) setCollision(saved.collision)
      if (typeof saved.trails === "boolean") setTrails(saved.trails)
      if (typeof saved.muted === "boolean") setMuted(saved.muted)
      if (saved.theme === "dark" || saved.theme === "light") setTheme(saved.theme)
      if (typeof saved.place === "boolean") setPlace(saved.place)
      if (typeof saved.timeScale === "number" && saved.timeScale >= 0.25 && saved.timeScale <= 4) {
        setTimeScale(saved.timeScale)
      }
    } catch {
      /* ignore broken saves */
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    reduceRef.current = motion.matches
    const onMotion = () => {
      reduceRef.current = motion.matches
    }
    motion.addEventListener("change", onMotion)
    return () => motion.removeEventListener("change", onMotion)
  }, [])

  useEffect(() => {
    const sim = simRef.current
    if (sim) sim.mode = collision
  }, [collision])

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ preset, timeScale, collision, trails, muted, place, theme }))
    } catch {
      /* private mode */
    }
  }, [preset, timeScale, collision, trails, muted, place, theme])

  const themeBoot = useRef(false)
  useEffect(() => {
    if (!themeBoot.current) {
      themeBoot.current = true
      if (document.documentElement.dataset.theme === "dark" && theme !== "dark") {
        setTheme("dark")
        return
      }
    }
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", theme === "dark" ? "#071211" : "#fffaf0")
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    if (!starsRef.current) starsRef.current = makeStars(150)

    const parent = canvas.parentElement
    const resize = () => {
      const rect = (parent ?? canvas).getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      viewSize.current = { cssW: rect.width, cssH: rect.height, dpr }
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      if (!framed.current && rect.width > 2 && rect.height > 2) {
        frameBodies(simRef.current?.bodies ?? [])
        framed.current = true
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (parent) observer.observe(parent)

    const screenToWorld = (sx: number, sy: number) => {
      const { cssW, cssH } = viewSize.current
      const { x, y, zoom } = cam.current
      return { x: (sx - cssW / 2) / zoom + x, y: (cssH / 2 - sy) / zoom + y }
    }

    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = screenToWorld(sx, sy)
      cam.current.zoom = Math.max(0.12, Math.min(6, cam.current.zoom * factor))
      const after = screenToWorld(sx, sy)
      cam.current.x += before.x - after.x
      cam.current.y += before.y - after.y
    }

    let acc = 0
    let last = performance.now()
    let uiAcc = 0
    let simTime = 0
    let announced = false
    let raf = 0
    let dead = false
    const events: SimEvent[] = []
    const juice: SimEvent[] = []

    const computeAim = (): Aim | null => {
      const drag = dragRef.current
      if (!drag || drag.mode === "pan") return null
      const sim = simRef.current
      if (!sim) return null
      const chosen = presetOf(live.current.preset)
      const point = { anchorX: drag.sx, anchorY: drag.sy, pointerX: drag.px, pointerY: drag.py }
      if (drag.mode === "move" && drag.id != null) {
        const body = sim.bodies.find((b) => b.id === drag.id)
        if (!body) return null
        return {
          x: body.x,
          y: body.y,
          radius: body.radius,
          color: body.color,
          path: [],
          hit: false,
          regime: "move",
          label: "Moving",
          gesture: false,
          ...point,
        }
      }
      const dragged = Math.hypot(drag.px - drag.sx, drag.py - drag.sy)
      if (dragged < 4) return null
      if (live.current.place && drag.mode === "spawn") {
        return {
          x: drag.x,
          y: drag.y,
          radius: chosen.radius,
          color: chosen.color,
          path: [],
          hit: false,
          regime: "place",
          label: chosen.label,
          gesture: false,
          ...point,
        }
      }
      let vx = drag.x - drag.x0
      let vy = drag.y - drag.y0
      const sp = Math.hypot(vx, vy)
      if (sp > LAUNCH_CAP) {
        vx *= LAUNCH_CAP / sp
        vy *= LAUNCH_CAP / sp
      }
      let specX = drag.x0
      let specY = drag.y0
      let radius = chosen.radius
      let color = chosen.color
      let mass = chosen.mass
      let kind = chosen.id
      let vx0 = vx
      let vy0 = vy
      let replaceId: number | undefined
      if (drag.mode === "nudge" && drag.id != null) {
        const body = sim.bodies.find((b) => b.id === drag.id)
        if (!body) return null
        specX = body.x
        specY = body.y
        radius = body.radius
        color = body.color
        mass = body.mass
        kind = body.kind
        vx0 = body.vx + vx
        vy0 = body.vy + vy
        replaceId = body.id
      }
      sim.mode = live.current.collision
      const predicted = predictLaunch(sim.bodies, sim.mode, {
        x: specX,
        y: specY,
        vx: vx0,
        vy: vy0,
        mass,
        radius,
        kind,
        color,
        replaceId,
      })
      const readout = classifyLaunch(sim.bodies, predicted.x, predicted.y, vx0, vy0, radius, replaceId, mass)
      const regime = predicted.hit ? "impact" : readout.regime
      const name = REGIME_LABEL[regime] ?? ""
      const label = name ? `${formatSpeed(readout.speed)} /s · ${name}` : `${formatSpeed(readout.speed)} /s`
      return {
        x: predicted.x,
        y: predicted.y,
        radius,
        color,
        path: predicted.points,
        hit: predicted.hit,
        regime,
        label,
        gesture: true,
        ...point,
      }
    }

    const loop = (now: number) => {
      if (dead) return
      raf = requestAnimationFrame(loop)
      let raw = (now - last) / 1000
      last = now
      if (raw > 0.05) raw = 0.05
      const current = simRef.current
      if (!current) return
      current.mode = live.current.collision
      juice.length = 0
      if (!live.current.paused && !holdRef.current) {
        acc += raw * live.current.timeScale
        let steps = 0
        while (acc >= DT && steps < 24) {
          stepSim(current, DT, events)
          for (let i = 0; i < events.length; i++) juice.push(events[i])
          acc -= DT
          steps += 1
          simTime += DT
        }
        if (steps >= 24) acc = 0
      }
      const alpha = live.current.paused || holdRef.current ? 1 : Math.min(1, acc / DT)

      let biggest: SimEvent | null = null
      for (const ev of juice) {
        const speed = ev.type === "merge" ? 26 + Math.min(40, ev.magnitude * 0.01) : Math.min(80, ev.magnitude * 0.4)
        burst(ev.x, ev.y, ev.color, ev.type === "merge" ? 20 : 8, speed)
        if (!biggest || ev.magnitude > biggest.magnitude) biggest = ev
      }
      if (biggest) {
        if (biggest.type === "merge") audio().merge(biggest.magnitude)
        else audio().bounce(biggest.magnitude)
      }

      const parts = particlesRef.current
      for (const p of parts) {
        p.life -= raw
        p.x += p.vx * raw
        p.y += p.vy * raw
      }
      let write = 0
      for (const p of parts) if (p.life > 0) parts[write++] = p
      parts.length = write
      const flashes = flashesRef.current
      for (const f of flashes) f.life -= raw
      let fw = 0
      for (const f of flashes) if (f.life > 0) flashes[fw++] = f
      flashes.length = fw

      trauma.current = reduceRef.current ? 0 : Math.max(0, trauma.current - raw * 1.35)
      const shake = trauma.current * trauma.current
      const shakeX = shake === 0 ? 0 : (Math.sin(simTime * 47) * 0.6 + Math.sin(simTime * 83) * 0.4) * 12 * shake
      const shakeY = shake === 0 ? 0 : (Math.cos(simTime * 53) * 0.6 + Math.sin(simTime * 71) * 0.4) * 10 * shake

      const { cssW, cssH, dpr } = viewSize.current
      renderScene(
        ctx,
        {
          dpr,
          cssW,
          cssH,
          camX: cam.current.x,
          camY: cam.current.y,
          zoom: cam.current.zoom,
          shakeX,
          shakeY,
          time: simTime,
          trails: live.current.trails,
          reduceMotion: reduceRef.current,
          selectedId: selectedId.current,
          bg: "#0a1a1a",
          fg: "#fffaf0",
          muted: "#a0a0a0",
        },
        current.bodies,
        alpha,
        parts,
        flashes,
        starsRef.current ?? [],
        computeAim(),
      )

      uiAcc += raw
      if (uiAcc > 0.2) {
        uiAcc = 0
        setCount((prev) => (prev === current.bodies.length ? prev : current.bodies.length))
        const id = selectedId.current
        if (id != null) {
          const body = current.bodies.find((b) => b.id === id)
          if (!body) publishSelection(null)
          else {
            const speed = Math.hypot(body.vx, body.vy)
            setSelected((prev) => {
              if (
                prev &&
                prev.id === body.id &&
                Math.abs(prev.speed - speed) < 0.25 &&
                prev.mass === body.mass &&
                prev.color === body.color
              ) {
                return prev
              }
              return { id: body.id, label: presetOf(body.kind).label, mass: body.mass, speed, color: body.color }
            })
          }
        }
        if (!announced) {
          announced = true
          setReady(true)
        }
      }
    }

    raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, select, textarea")) return
      const onControl = Boolean(target?.closest("button, a"))
      if (e.code === "Space") {
        if (onControl) return
        e.preventDefault()
        if (!e.repeat) setPaused((v) => !v)
        return
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (onControl) return
        const id = selectedId.current
        const sim = simRef.current
        if (id != null && sim) {
          e.preventDefault()
          removeBody(sim, id)
          publishSelection(null)
          syncCount()
        }
        return
      }
      if (e.key === "f" || e.key === "F") {
        frameBodies(simRef.current?.bodies ?? [])
        return
      }
      if (e.key === "Escape") publishSelection(null)
      const index = Number(e.key)
      if (index >= 1 && index <= PRESETS.length) setPreset(PRESETS[index - 1].id)
      const pan = 48 / cam.current.zoom
      if (e.key === "ArrowLeft") cam.current.x -= pan
      if (e.key === "ArrowRight") cam.current.x += pan
      if (e.key === "ArrowUp") cam.current.y += pan
      if (e.key === "ArrowDown") cam.current.y -= pan
      if (e.key === "+" || e.key === "=") zoomAt(viewSize.current.cssW / 2, viewSize.current.cssH / 2, 1.12)
      if (e.key === "-" || e.key === "_") zoomAt(viewSize.current.cssW / 2, viewSize.current.cssH / 2, 1 / 1.12)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0011))
    }

    window.addEventListener("keydown", onKey)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    window.__orbit = {
      count: () => simRef.current?.bodies.length ?? 0,
      load: (id) => {
        if (isScenario(id)) actions.current.load(id)
      },
      fling: (x, y, vx, vy, kind) => {
        const current = simRef.current
        if (!current) return -1
        const body = addBody(current, { kind: kind ?? live.current.preset, x, y, vx, vy })
        syncCount()
        if (!body) return -1
        publishSelection(body.id)
        return body.id
      },
      clear: () => actions.current.wipe(),
      positions: () =>
        (simRef.current?.bodies ?? []).map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          mass: b.mass,
          kind: b.kind,
          tag: b.tag,
        })),
    }

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("keydown", onKey)
      canvas.removeEventListener("wheel", onWheel)
      delete window.__orbit
    }
    // Refs hold the live sim; restarting the loop would hitch the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const localOf = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const toWorld = (sx: number, sy: number) => {
    const { cssW, cssH } = viewSize.current
    const { x, y, zoom } = cam.current
    return { x: (sx - cssW / 2) / zoom + x, y: (cssH / 2 - sy) / zoom + y }
  }

  const hitBody = (wx: number, wy: number) => {
    const sim = simRef.current
    if (!sim) return null
    const zoom = cam.current.zoom
    let best: Body | null = null
    let bestD = Infinity
    for (const b of sim.bodies) {
      const dx = b.x - wx
      const dy = b.y - wy
      const reach = b.radius + 10 / zoom
      const d = dx * dx + dy * dy
      if (d <= reach * reach && d < bestD) {
        best = b
        bestD = d
      }
    }
    return best
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    unlockAudio()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const p = localOf(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const world = toWorld(mid.x, mid.y)
      pinchRef.current = { dist, zoom: cam.current.zoom, anchorX: world.x, anchorY: world.y }
      dragRef.current = null
      holdRef.current = false
      suppressRef.current = true
      return
    }
    if (suppressRef.current || e.button === 1 || e.button === 2 || e.altKey) {
      dragRef.current = { mode: "pan", sx: p.x, sy: p.y, x: p.x, y: p.y, camX: cam.current.x, camY: cam.current.y }
      return
    }
    const world = toWorld(p.x, p.y)
    const hit = hitBody(world.x, world.y)
    if (live.current.place && hit) {
      dragRef.current = {
        mode: "move",
        id: hit.id,
        sx: p.x,
        sy: p.y,
        x0: world.x,
        y0: world.y,
        x: world.x,
        y: world.y,
        px: p.x,
        py: p.y,
      }
      holdRef.current = true
      publishSelection(hit.id)
      return
    }
    if (hit) {
      dragRef.current = {
        mode: "nudge",
        id: hit.id,
        sx: p.x,
        sy: p.y,
        x0: world.x,
        y0: world.y,
        x: world.x,
        y: world.y,
        px: p.x,
        py: p.y,
      }
      holdRef.current = true
      publishSelection(hit.id)
      return
    }
    dragRef.current = {
      mode: "spawn",
      sx: p.x,
      sy: p.y,
      x0: world.x,
      y0: world.y,
      x: world.x,
      y: world.y,
      px: p.x,
      py: p.y,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = localOf(e.clientX, e.clientY)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p)
    const pinch = pinchRef.current
    if (pinch && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const zoom = Math.max(0.12, Math.min(6, pinch.zoom * (dist / pinch.dist)))
      cam.current.zoom = zoom
      cam.current.x = pinch.anchorX - (mid.x - viewSize.current.cssW / 2) / zoom
      cam.current.y = pinch.anchorY - (viewSize.current.cssH / 2 - mid.y) / zoom
      return
    }
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === "pan") {
      cam.current.x = drag.camX - (p.x - drag.sx) / cam.current.zoom
      cam.current.y = drag.camY + (p.y - drag.sy) / cam.current.zoom
      drag.x = p.x
      drag.y = p.y
      return
    }
    const world = toWorld(p.x, p.y)
    drag.x = world.x
    drag.y = world.y
    drag.px = p.x
    drag.py = p.y
    if (drag.mode === "move" && drag.id != null && simRef.current) {
      const body = simRef.current.bodies.find((b) => b.id === drag.id)
      if (!body) {
        dragRef.current = null
        holdRef.current = false
        return
      }
      body.x = world.x
      body.y = world.y
      body.px = world.x
      body.py = world.y
    }
  }

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (pointers.current.size === 0) suppressRef.current = false
    if (pointers.current.size > 0) {
      dragRef.current = null
      holdRef.current = false
      return
    }
    const drag = dragRef.current
    dragRef.current = null
    holdRef.current = false
    if (!drag || drag.mode === "pan") return
    const dist = Math.hypot(drag.px - drag.sx, drag.py - drag.sy)
    const sim = simRef.current
    if (!sim) return
    if (drag.mode === "move") {
      if (drag.id != null) publishSelection(drag.id)
      warm(sim)
      return
    }
    if (live.current.place && drag.mode === "spawn") {
      if (dist < 3) return
      const chosen = presetOf(live.current.preset)
      const body = addBody(sim, { kind: chosen.id, x: drag.x, y: drag.y, vx: 0, vy: 0 })
      if (!body) {
        setFull(true)
        window.setTimeout(() => setFull(false), 1400)
        return
      }
      audio().place()
      publishSelection(body.id)
      syncCount()
      return
    }
    if (dist < 6) {
      if (drag.mode === "nudge" && drag.id != null) publishSelection(drag.id)
      else publishSelection(null)
      return
    }
    let vx = drag.x - drag.x0
    let vy = drag.y - drag.y0
    const sp = Math.hypot(vx, vy)
    if (sp > LAUNCH_CAP) {
      vx *= LAUNCH_CAP / sp
      vy *= LAUNCH_CAP / sp
    }
    if (drag.mode === "spawn") {
      const chosen = presetOf(live.current.preset)
      const body = addBody(sim, { kind: chosen.id, x: drag.x0, y: drag.y0, vx, vy })
      if (!body) {
        setFull(true)
        window.setTimeout(() => setFull(false), 1400)
        return
      }
      audio().launch(sp)
      publishSelection(body.id)
      syncCount()
      burst(body.x, body.y, body.color, 8, 14)
      return
    }
    if (drag.id == null) return
    const body = sim.bodies.find((b) => b.id === drag.id)
    if (!body) return
    body.vx += vx
    body.vy += vy
    publishSelection(body.id)
    audio().nudge()
  }

  const confirmClear = () => {
    if (!armClear) {
      setArmClear(true)
      if (armTimer.current) clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmClear(false), 1600)
      return
    }
    if (armTimer.current) clearTimeout(armTimer.current)
    wipe()
  }

  return (
    <main className="flex h-dvh w-full justify-center overflow-hidden bg-bg text-fg" data-ready={ready ? "true" : "false"}>
      <div className="flex h-full min-w-0 w-full max-w-6xl flex-col">
        <header className="px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="kicker">Gravity sandbox</p>
              <h1 className="display">Orbital</h1>
            </div>
            <p className="shrink-0 pb-1 text-sm text-muted tabular-nums">
              {count} {count === 1 ? "body" : "bodies"}
              {paused ? <span className="text-fg"> · Paused</span> : null}
            </p>
          </div>
          {selected ? (
            <div className="selection mt-3">
              <span className="swatch shrink-0" style={{ background: selected.color }} />
              <p className="min-w-0 flex-1 text-sm leading-snug">
                {selected.label}
                <span className="text-muted tabular-nums">
                  {" "}
                  · mass {formatMass(selected.mass)} · {formatSpeed(selected.speed)} /s
                </span>
              </p>
              <button
                type="button"
                className="chip shrink-0"
                onClick={() => {
                  const sim = simRef.current
                  if (!sim) return
                  removeBody(sim, selected.id)
                  publishSelection(null)
                  syncCount()
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-snug text-muted">
              {place
                ? "Drag to set a body down. Drag one to move it."
                : "Drag the dark to fling. Drag a body to nudge. Pinch to zoom."}
            </p>
          )}
          {full ? <p className="mt-2 text-sm text-muted">The field is full. Clear a few bodies.</p> : null}
        </header>
        <div className="relative min-h-0 flex-1 px-3 pb-3 sm:px-5">
          <div className="stage relative h-full overflow-hidden">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none select-none"
              role="application"
              aria-label="Orbital sandbox. Drag empty space to launch a body. The solid line is your throw. The dashes are the path gravity will take. Drag a body to nudge it."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onContextMenu={(e) => e.preventDefault()}
            />
            {count === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
                <div className="max-w-xs text-center">
                  <p className="stage-title">Drag to fling a body into the dark.</p>
                  <p className="stage-copy mt-2 text-sm leading-snug">
                    The solid line is one second of your throw. The dashes are where gravity takes it.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      <section className="dock" aria-label="Simulation controls">
        <div className="dock-scroll flex flex-col gap-3 px-4 pt-3 sm:px-5">
          <div>
            <p className="kicker mb-2">Worlds</p>
            <div className="mass-row" role="toolbar" aria-label="Mass presets">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip chip-mass"
                  data-preset={item.id}
                  aria-pressed={preset === item.id}
                  onClick={() => setPreset(item.id)}
                >
                  <span className="swatch" data-kind={item.id} style={{ background: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="kicker mb-2">Scenes</p>
            <div className="scene-grid" role="toolbar" aria-label="Scenes">
              {SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip scene-chip"
                  data-scenario={item.id}
                  data-tone={item.tone}
                  title={item.blurb}
                  aria-label={`${item.label}. ${item.blurb}`}
                  aria-pressed={scenario === item.id}
                  onClick={() => load(item.id)}
                >
                  <span className="tone-pip" aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <label className="flex w-full items-center gap-3 text-sm text-muted sm:w-auto sm:min-w-56 sm:flex-1">
              <span id="time-label">Time</span>
              <input
                aria-labelledby="time-label"
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
              />
              <span className="w-12 text-right text-fg tabular-nums">{formatScale(timeScale)}</span>
            </label>
            <button type="button" className="chip chip-primary" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" className="chip" aria-pressed={trails} onClick={() => setTrails((v) => !v)}>
              Trails
            </button>
            <button type="button" className="chip" aria-pressed={place} onClick={() => setPlace((v) => !v)}>
              Place
            </button>
            <label className="sr-only" htmlFor="collision-mode">
              Collision
            </label>
            <select
              id="collision-mode"
              className="select"
              value={collision}
              aria-label="Collision"
              onChange={(e) => {
                const value = e.target.value
                if (isMode(value)) setCollision(value)
              }}
            >
              <option value="merge">Merge</option>
              <option value="bounce">Bounce</option>
              <option value="ghost">Pass</option>
            </select>
            <button type="button" className="chip" onClick={() => frameBodies(simRef.current?.bodies ?? [])}>
              <Crosshair aria-hidden="true" />
              Frame
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme((v) => (v === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={muted}
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => {
                setMuted((v) => {
                  const next = !v
                  if (!next) {
                    live.current.muted = false
                    audio().unlock()
                  }
                  return next
                })
              }}
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>
            <button type="button" className={armClear ? "chip chip-danger" : "chip"} onClick={confirmClear}>
              <Trash2 aria-hidden="true" />
              {armClear ? "Confirm" : "Clear"}
            </button>
          </div>
        </div>
      </section>
      </div>
    </main>
  )
}
