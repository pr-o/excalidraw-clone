import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES } from "@excalidraw-clone/scene"
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  FontFamily,
  Scene,
} from "@excalidraw-clone/scene"
import { RoughSVG } from "roughjs/bin/svg"
import { generateShape } from "./shapes"
import { OCCLUSION_PADDING } from "./shapes/text"
import {
  fontFamilyName,
  layoutLabel,
  measureText,
  type LabelLayout,
  type TextSize,
} from "./text-metrics"
import { resolveColor, themedElement } from "./theme-colors"
import type { Theme } from "./types"

export type TextMeasure = (
  text: string,
  fontSize: number,
  family: FontFamily,
  lineHeight: number,
) => TextSize

const defaultMeasure = (): TextMeasure | null => {
  if (typeof document === "undefined") return null
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  return (text, fontSize, family, lineHeight) =>
    measureText(ctx, text, fontSize, family, lineHeight)
}

export interface SVGRenderOptions {
  background?: string
  embedScene?: boolean
  padding?: number
  files?: ReadonlyMap<string, string>
  /** Resolve all colors for this theme; default "light" (identity). */
  theme?: Theme
  /** Text measurer for linear-label backing rects; defaults to a hidden
   *  canvas context, and the backing is skipped when none is available. */
  measure?: TextMeasure
}

const SVG_NS = "http://www.w3.org/2000/svg"

export function renderToSVG(scene: Scene, opts: SVGRenderOptions = {}): string {
  const padding = opts.padding ?? 20
  const theme = opts.theme ?? "light"
  const elements = scene.getElements().filter((e) => !e.isDeleted)
  const bbox = computeBBox(elements, padding)
  const width = Math.max(1, bbox.width)
  const height = Math.max(1, bbox.height)
  const doc = document.implementation.createDocument(SVG_NS, "svg", null)
  const root = doc.documentElement
  root.setAttribute("xmlns", SVG_NS)
  root.setAttribute("width", String(width))
  root.setAttribute("height", String(height))
  root.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${width} ${height}`)

  if (opts.background && opts.background !== "transparent") {
    const rect = doc.createElementNS(SVG_NS, "rect")
    rect.setAttribute("x", String(bbox.x))
    rect.setAttribute("y", String(bbox.y))
    rect.setAttribute("width", String(width))
    rect.setAttribute("height", String(height))
    rect.setAttribute("fill", resolveColor(opts.background, theme))
    root.appendChild(rect)
  }

  const rsvg = new RoughSVG(root as unknown as SVGSVGElement)

  const measure = opts.measure ?? defaultMeasure()
  const byId = new Map(elements.map((e) => [e.id, e] as const))
  const labelBg = resolveColor(
    opts.background && opts.background !== "transparent" ? opts.background : "#ffffff",
    theme,
  )
  for (const el of elements) {
    const container =
      el.type === "text" && el.containerId !== null ? byId.get(el.containerId) : undefined
    const backing =
      measure && container && LINEAR_LABELABLE_TYPES.has(container.type)
        ? { background: labelBg, measure }
        : undefined
    const labelLayout =
      el.type === "text" &&
      el.text.length > 0 &&
      measure &&
      container &&
      LABELABLE_TYPES.has(container.type)
        ? layoutLabel(
            el.text,
            { width: el.width, height: el.height },
            el.fontSize,
            el.lineHeight,
            (s) => measure(s, el.fontSize, el.fontFamily, el.lineHeight).width,
          )
        : undefined
    const node = renderElement(doc, el, rsvg, opts.files, theme, backing, labelLayout)
    if (node) root.appendChild(node)
  }

  return new XMLSerializer().serializeToString(root)
}

function renderElement(
  doc: Document,
  el: ExcalidrawElement,
  rsvg: RoughSVG,
  files: ReadonlyMap<string, string> | undefined,
  theme: Theme,
  backing?: { background: string; measure: TextMeasure },
  layout?: LabelLayout,
): SVGGElement | null {
  if (el.type === "image") {
    const href = el.fileId === null ? undefined : files?.get(el.fileId)
    if (href === undefined) return null
    const group = createGroup(doc, el)
    const image = doc.createElementNS(SVG_NS, "image")
    image.setAttribute("href", href)
    image.setAttribute("width", String(el.width))
    image.setAttribute("height", String(el.height))
    group.appendChild(image)
    return group
  }
  const group = createGroup(doc, el)

  if (el.type === "text") {
    if (backing && el.text.length > 0) {
      const size = backing.measure(el.text, el.fontSize, el.fontFamily, el.lineHeight)
      const rect = doc.createElementNS(SVG_NS, "rect")
      rect.setAttribute("x", String(el.width / 2 - size.width / 2 - OCCLUSION_PADDING))
      rect.setAttribute("y", String(el.height / 2 - size.height / 2 - OCCLUSION_PADDING))
      rect.setAttribute("width", String(size.width + 2 * OCCLUSION_PADDING))
      rect.setAttribute("height", String(size.height + 2 * OCCLUSION_PADDING))
      rect.setAttribute("fill", backing.background)
      group.appendChild(rect)
    }
    group.appendChild(textNode(doc, el, theme, layout))
    return group
  }

  const drawables = generateShape(themedElement(el, theme), rsvg.generator)
  for (const d of drawables) {
    group.appendChild(rsvg.draw(d))
  }
  return group
}

function createGroup(doc: Document, el: ExcalidrawElement): SVGGElement {
  const group = doc.createElementNS(SVG_NS, "g")
  group.setAttribute("transform", elementTransform(el))
  if (el.opacity !== 100) {
    group.setAttribute("opacity", String(el.opacity / 100))
  }
  return group
}

function elementTransform(el: ExcalidrawElement): string {
  const tx = el.x
  const ty = el.y
  if (el.angle === 0) return `translate(${tx} ${ty})`
  const cx = el.width / 2
  const cy = el.height / 2
  const deg = (el.angle * 180) / Math.PI
  return `translate(${tx} ${ty}) rotate(${deg} ${cx} ${cy})`
}

function textNode(
  doc: Document,
  el: ExcalidrawTextElement,
  theme: Theme,
  layout?: LabelLayout,
): SVGTextElement {
  const fontSize = el.fontSize * (layout?.scale ?? 1)
  const text = doc.createElementNS(SVG_NS, "text")
  text.setAttribute("font-family", fontFamilyName(el.fontFamily))
  text.setAttribute("font-size", String(fontSize))
  text.setAttribute("fill", resolveColor(el.strokeColor, theme))
  text.setAttribute("text-anchor", anchorFor(el.textAlign))
  text.setAttribute("dominant-baseline", "text-before-edge")

  const lines = layout?.lines ?? el.text.split("\n")
  const lineHeightPx = fontSize * el.lineHeight
  const totalHeight = lines.length * lineHeightPx
  const baseY = verticalOffset(el, totalHeight)
  const x = horizontalAnchorX(el)

  for (let i = 0; i < lines.length; i += 1) {
    const tspan = doc.createElementNS(SVG_NS, "tspan")
    tspan.setAttribute("x", String(x))
    tspan.setAttribute("y", String(baseY + i * lineHeightPx))
    tspan.textContent = lines[i] ?? ""
    text.appendChild(tspan)
  }
  return text
}

function anchorFor(align: ExcalidrawTextElement["textAlign"]): string {
  switch (align) {
    case "center":
      return "middle"
    case "right":
      return "end"
    case "left":
    default:
      return "start"
  }
}

function horizontalAnchorX(el: ExcalidrawTextElement): number {
  switch (el.textAlign) {
    case "center":
      return el.width / 2
    case "right":
      return el.width
    case "left":
    default:
      return 0
  }
}

function verticalOffset(el: ExcalidrawTextElement, totalHeight: number): number {
  switch (el.verticalAlign) {
    case "middle":
      return (el.height - totalHeight) / 2
    case "bottom":
      return el.height - totalHeight
    case "top":
    default:
      return 0
  }
}

function computeBBox(
  elements: readonly ExcalidrawElement[],
  padding: number,
): { x: number; y: number; width: number; height: number } {
  if (elements.length === 0) return { x: 0, y: 0, width: 100, height: 100 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
