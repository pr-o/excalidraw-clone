import type { Bounds, ViewTransform } from "@excalidraw-clone/geometry"
import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES } from "@excalidraw-clone/scene"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { isElementVisible } from "./culling"
import { drawElement } from "./draw-element"
import { drawGrid } from "./grid"
import { type MarqueeBox, drawSelectionChrome } from "./overlay"
import { ShapeCache } from "./shape-cache"
import { resolveColor } from "./theme-colors"
import type { CanvasRendererOptions, GridOptions, Theme } from "./types"

const IDENTITY: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly scene: Scene

  private viewTransform: ViewTransform
  private theme: Theme
  private canvasBg: string
  private selection: readonly string[]
  private grid: GridOptions

  private readonly rough: RoughCanvas
  private readonly shapeCache = new ShapeCache()
  private readonly imageMap = new Map<string, HTMLImageElement>()
  private readonly imageLoads = new Map<string, Promise<void>>()
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
    this.canvasBg = options.canvasBg ?? "#ffffff"
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
    this.shapeCache.clear()
    this.requestRedraw()
  }

  setCanvasBg(color: string): void {
    this.canvasBg = color
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

  preloadImage(fileId: string, dataURL: string): Promise<void> {
    const pending = this.imageLoads.get(fileId)
    if (pending) return pending
    const img = new Image()
    const load = new Promise<void>((resolve) => {
      img.onload = () => {
        this.requestRedraw()
        resolve()
      }
      img.onerror = () => resolve()
    })
    img.src = dataURL
    this.imageMap.set(fileId, img)
    this.imageLoads.set(fileId, load)
    return load
  }

  unloadImage(fileId: string): void {
    this.imageMap.delete(fileId)
    this.imageLoads.delete(fileId)
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
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.canvasBg !== "transparent") {
      ctx.fillStyle = resolveColor(this.canvasBg, this.theme)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    const { scrollX, scrollY, zoom } = this.viewTransform
    ctx.setTransform(zoom, 0, 0, zoom, scrollX * zoom, scrollY * zoom)
    drawGrid(ctx, canvas, this.viewTransform, this.grid, this.theme)
    const elements = this.scene.getElements()
    const getImage = (id: string): HTMLImageElement | undefined => this.imageMap.get(id)
    const view: Bounds = {
      x: -scrollX,
      y: -scrollY,
      width: canvas.width / zoom,
      height: canvas.height / zoom,
    }
    const byId = new Map(elements.map((e) => [e.id, e] as const))
    const occludeBg = resolveColor(
      this.canvasBg === "transparent" ? "#ffffff" : this.canvasBg,
      this.theme,
    )
    for (const element of elements) {
      if (!isElementVisible(element, view)) continue
      const container =
        element.type === "text" && element.containerId !== null
          ? byId.get(element.containerId)
          : undefined
      const labelOpts =
        container === undefined
          ? undefined
          : LINEAR_LABELABLE_TYPES.has(container.type)
            ? { occlusionBg: occludeBg }
            : LABELABLE_TYPES.has(container.type)
              ? { fit: true }
              : undefined
      drawElement(ctx, element, this.rough, this.shapeCache, getImage, this.theme, labelOpts)
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
