import type { AlignmentGuide, Bounds, Point, ViewTransform } from "@excalidraw-clone/geometry"
import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES, isBoundLabel } from "@excalidraw-clone/scene"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { drawCropDim } from "./crop-overlay"
import { isElementVisible } from "./culling"
import { drawElement } from "./draw-element"
import { drawGrid } from "./grid"
import {
  type MarqueeBox,
  drawAlignmentGuides,
  drawLasso,
  drawSelectionChrome,
  drawUserGuides,
} from "./overlay"
import { ShapeCache } from "./shape-cache"
import { resolveColor } from "./theme-colors"
import type { CanvasRendererOptions, GridOptions, Theme } from "./types"

const IDENTITY: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

/** One rough.js shape cache for every renderer (main canvas, page thumbnails):
 *  entries are keyed by the immutable element object plus theme, so a
 *  thumbnail re-render reuses the main canvas's shapes instead of
 *  regenerating every element. */
const SHARED_SHAPE_CACHE = new ShapeCache()

/** Decoded images, shared by every renderer. Image ids are content hashes, so an
 *  id always means the same bytes. Each page gets its own renderer, so a
 *  per-renderer map left images blank after a page switch or reload. */
const SHARED_IMAGES = new Map<string, HTMLImageElement>()
const SHARED_IMAGE_LOADS = new Map<string, Promise<void>>()
/** Renderers currently drawing; an image finishing its load redraws all of them. */
const RUNNING = new Set<CanvasRenderer>()

/** Decodes `dataURL` into the shared image cache (once per `fileId`) and redraws
 *  every running renderer when it is ready. Safe to call before any renderer exists. */
export function preloadSharedImage(fileId: string, dataURL: string): Promise<void> {
  const pending = SHARED_IMAGE_LOADS.get(fileId)
  if (pending) return pending
  const img = new Image()
  const load = new Promise<void>((resolve) => {
    img.onload = () => {
      for (const renderer of RUNNING) renderer.requestRedraw()
      resolve()
    }
    img.onerror = () => resolve()
  })
  img.src = dataURL
  SHARED_IMAGES.set(fileId, img)
  SHARED_IMAGE_LOADS.set(fileId, load)
  return load
}

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
  private readonly shapeCache = SHARED_SHAPE_CACHE
  private readonly imageMap = SHARED_IMAGES
  private readonly imageLoads = SHARED_IMAGE_LOADS
  private readonly overlayCanvas: HTMLCanvasElement | null
  private readonly overlayCtx: CanvasRenderingContext2D | null
  private marquee: MarqueeBox | null = null
  private highlight: readonly string[] = []
  private hiddenId: string | null = null
  private hiddenCell: { row: number; col: number } | null = null
  private cropId: string | null = null
  private guides: readonly AlignmentGuide[] = []
  private lasso: readonly Point[] = []
  private showUserGuides = false

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
    this.guides = options.guides ?? []
    this.overlayCanvas = options.overlayCanvas ?? null
    this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext("2d") : null
  }

  setMarquee(box: MarqueeBox | null): void {
    this.marquee = box
    this.requestRedraw()
  }

  setLasso(path: readonly Point[]): void {
    this.lasso = path
    this.requestRedraw()
  }

  start(): void {
    if (this.running) return
    this.running = true
    RUNNING.add(this)
    this.unsubscribe = this.scene.subscribe(() => this.requestRedraw())
    this.requestRedraw()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    RUNNING.delete(this)
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

  /** Skip drawing one element (the text being edited in the DOM overlay); with
   *  `cell`, a table stays drawn and only that cell's text is skipped. */
  setHiddenElement(id: string | null, cell: { row: number; col: number } | null = null): void {
    this.hiddenId = id
    this.hiddenCell = cell
    this.requestRedraw()
  }

  /** Crop mode: ghost the hidden part of this image on the overlay. */
  setCropElement(id: string | null): void {
    this.cropId = id
    this.requestRedraw()
  }

  setGuides(guides: readonly AlignmentGuide[]): void {
    this.guides = guides
    this.requestRedraw()
  }

  /** Ruler guides live on the scene; this only toggles their visibility. */
  setShowUserGuides(show: boolean): void {
    this.showUserGuides = show
    this.requestRedraw()
  }

  preloadImage(fileId: string, dataURL: string): Promise<void> {
    return preloadSharedImage(fileId, dataURL)
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
      const hiddenCell =
        element.id === this.hiddenId && element.type === "table" ? this.hiddenCell : null
      if ((element.id === this.hiddenId && !hiddenCell) || !isElementVisible(element, view))
        continue
      const container = isBoundLabel(element) ? byId.get(element.containerId) : undefined
      const labelOpts = hiddenCell
        ? { hiddenCell }
        : container === undefined
          ? undefined
          : LINEAR_LABELABLE_TYPES.has(container.type)
            ? { occlusionBg: occludeBg }
            : LABELABLE_TYPES.has(container.type)
              ? { fit: true }
              : undefined
      drawElement(ctx, element, this.rough, this.shapeCache, getImage, this.theme, labelOpts, zoom)
    }
    // Main canvas, after elements: above the drawing, below the selection overlay.
    if (this.showUserGuides) drawUserGuides(ctx, this.scene.getGuides(), view, zoom, this.theme)
    this.renderSelection(elements)
  }

  private renderSelection(elements: readonly ExcalidrawElement[]): void {
    // Dedicated overlay canvas when given (cleared each frame); otherwise draw
    // on top of the main canvas, and only when there is something to draw.
    const onOverlay = this.overlayCanvas !== null && this.overlayCtx !== null
    if (
      !onOverlay &&
      this.selection.length === 0 &&
      !this.marquee &&
      this.highlight.length === 0 &&
      this.guides.length === 0 &&
      this.lasso.length === 0 &&
      this.cropId === null
    ) {
      return
    }
    const ctx = this.overlayCtx ?? this.ctx
    drawSelectionChrome(
      ctx,
      this.overlayCanvas ?? this.canvas,
      this.selection,
      elements,
      this.viewTransform,
      this.theme,
      this.marquee,
      this.highlight,
      { clearBackground: onOverlay },
    )
    drawAlignmentGuides(ctx, this.guides, this.viewTransform, this.theme)
    drawLasso(ctx, this.lasso, this.viewTransform, this.theme)
    const cropEl = this.cropId === null ? undefined : elements.find((e) => e.id === this.cropId)
    if (cropEl?.type === "image" && cropEl.fileId !== null) {
      const img = this.imageMap.get(cropEl.fileId)
      if (img && img.complete && img.naturalWidth > 0)
        drawCropDim(ctx, cropEl, img, this.viewTransform)
    }
  }
}
