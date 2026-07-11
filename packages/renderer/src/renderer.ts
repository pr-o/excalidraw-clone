import type { ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { drawElement } from "./draw-element"
import { drawGrid } from "./grid"
import { type MarqueeBox, drawSelectionChrome } from "./overlay"
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
  private readonly imageMap = new Map<string, HTMLImageElement>()
  private readonly overlayCanvas: HTMLCanvasElement | null
  private readonly overlayCtx: CanvasRenderingContext2D | null
  private marquee: MarqueeBox | null = null
  private highlight: readonly string[] = []

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
    this.overlayCanvas = options.overlayCanvas ?? null
    this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext("2d") : null
  }

  setMarquee(box: MarqueeBox | null): void {
    this.marquee = box
    this.requestRedraw()
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

  setBindingHighlight(ids: readonly string[]): void {
    this.highlight = ids
    this.requestRedraw()
  }

  setGrid(opts: GridOptions): void {
    this.grid = opts
    this.requestRedraw()
  }

  preloadImage(fileId: string, dataURL: string): void {
    if (this.imageMap.has(fileId)) return
    const img = new Image()
    img.onload = () => this.requestRedraw()
    img.src = dataURL
    this.imageMap.set(fileId, img)
  }

  unloadImage(fileId: string): void {
    this.imageMap.delete(fileId)
    this.requestRedraw()
  }

  getImage(fileId: string): HTMLImageElement | undefined {
    return this.imageMap.get(fileId)
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
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = BACKGROUND[this.theme]
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const { scrollX, scrollY, zoom } = this.viewTransform
    ctx.setTransform(zoom, 0, 0, zoom, scrollX * zoom, scrollY * zoom)
    drawGrid(ctx, canvas, this.viewTransform, this.grid, this.theme)
    const elements = this.scene.getElements()
    const getImage = (id: string): HTMLImageElement | undefined => this.imageMap.get(id)
    for (const element of elements) {
      drawElement(ctx, element, this.rough, this.shapeCache, getImage)
    }
    this.renderSelection(elements)
  }

  private renderSelection(elements: readonly ExcalidrawElement[]): void {
    if (this.overlayCanvas && this.overlayCtx) {
      drawSelectionChrome(
        this.overlayCtx,
        this.overlayCanvas,
        this.selection,
        elements,
        this.viewTransform,
        this.theme,
        this.marquee,
        this.highlight,
        { clearBackground: true },
      )
      return
    }
    if (this.selection.length === 0 && !this.marquee && this.highlight.length === 0) return
    drawSelectionChrome(
      this.ctx,
      this.canvas,
      this.selection,
      elements,
      this.viewTransform,
      this.theme,
      this.marquee,
      this.highlight,
      { clearBackground: false },
    )
  }
}
