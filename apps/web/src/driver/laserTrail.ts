import { sceneToViewport, type Point, type ViewTransform } from "@excalidraw-clone/geometry"

interface TrailPoint {
  x: number
  y: number
  t: number
}

export interface LaserTrailOptions {
  now?: () => number
  raf?: (cb: () => void) => number
  caf?: (handle: number) => void
  ttlMs?: number
}

const DEFAULT_TTL_MS = 700
const STROKE = "#fa5252"
const MAX_WIDTH = 4
const GLOW_BLUR = 8

/** Owns the ephemeral laser-pointer trail: a list of timestamped scene points,
 *  a self-stopping animation loop that fades and prunes them, and the painting
 *  of a dedicated overlay canvas. Never touches the Scene. */
export class LaserTrail {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly getView: () => ViewTransform
  private readonly now: () => number
  private readonly raf: (cb: () => void) => number
  private readonly caf: (handle: number) => void
  private readonly ttlMs: number
  private points: TrailPoint[] = []
  private frame: number | null = null

  constructor(
    canvas: HTMLCanvasElement,
    getView: () => ViewTransform,
    opts: LaserTrailOptions = {},
  ) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")
    this.getView = getView
    this.now = opts.now ?? (() => performance.now())
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb))
    this.caf = opts.caf ?? ((h) => cancelAnimationFrame(h))
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  }

  push(at: Point): void {
    this.points.push({ x: at.x, y: at.y, t: this.now() })
    if (this.frame === null) this.frame = this.raf(() => this.tick())
  }

  clear(): void {
    this.points = []
    if (this.frame !== null) {
      this.caf(this.frame)
      this.frame = null
    }
    this.paintClear()
  }

  private tick(): void {
    this.frame = null
    const cutoff = this.now() - this.ttlMs
    this.points = this.points.filter((p) => p.t >= cutoff)
    this.draw()
    if (this.points.length > 0) {
      this.frame = this.raf(() => this.tick())
    } else {
      this.paintClear()
    }
  }

  private paintClear(): void {
    const { ctx, canvas } = this
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  private draw(): void {
    const { ctx, canvas } = this
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.points.length < 2) return
    const view = this.getView()
    const nowT = this.now()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = STROKE
    ctx.shadowColor = STROKE
    ctx.shadowBlur = GLOW_BLUR
    for (let i = 1; i < this.points.length; i += 1) {
      const a = this.points[i - 1]!
      const b = this.points[i]!
      const life = Math.max(0, 1 - (nowT - b.t) / this.ttlMs)
      if (life <= 0) continue
      const pa = sceneToViewport({ x: a.x, y: a.y }, view)
      const pb = sceneToViewport({ x: b.x, y: b.y }, view)
      ctx.globalAlpha = life
      ctx.lineWidth = MAX_WIDTH * life
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }
}
