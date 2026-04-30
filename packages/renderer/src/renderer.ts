import type { ViewTransform } from "@excalidraw-clone/geometry"
import type { Scene } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { drawElement } from "./draw-element"
import { ShapeCache } from "./shape-cache"
import type { CanvasRendererOptions, GridOptions, Theme } from "./types"

const IDENTITY: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

const BACKGROUND: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#121212",
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly scene: Scene

  private viewTransform: ViewTransform
  private theme: Theme
  private selection: readonly string[]
  private grid: GridOptions

  private readonly rough: RoughCanvas
  private readonly shapeCache = new ShapeCache()

  private dirty = false
  private rafId: number | null = null
  private unsubscribe: (() => void) | null = null
  private running = false

  constructor(canvas: HTMLCanvasElement, scene: Scene, options: CanvasRendererOptions = {}) {
    this.canvas = canvas
    this.scene = scene
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("CanvasRenderer: failed to acquire 2D context")
    this.ctx = ctx
    this.rough = new RoughCanvas(canvas)
    this.viewTransform = options.viewTransform ?? IDENTITY
    this.theme = options.theme ?? "light"
    this.selection = options.selection ?? []
    this.grid = options.grid ?? { enabled: false, size: 20 }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.unsubscribe = this.scene.subscribe(() => this.requestRedraw())
    this.requestRedraw()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.dirty = false
  }

  setViewTransform(t: ViewTransform): void {
    this.viewTransform = t
    this.requestRedraw()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.requestRedraw()
  }

  setSelection(ids: readonly string[]): void {
    this.selection = ids
    this.requestRedraw()
  }

  setGrid(opts: GridOptions): void {
    this.grid = opts
    this.requestRedraw()
  }

  requestRedraw(): void {
    if (!this.running) return
    this.dirty = true
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (!this.dirty || !this.running) return
      this.dirty = false
      this.render()
    })
  }

  private render(): void {
    const { canvas, ctx } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = BACKGROUND[this.theme]
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    void this.viewTransform
    void this.selection
    void this.grid
    for (const element of this.scene.getElements()) {
      drawElement(ctx, element, this.rough, this.shapeCache)
    }
  }
}
