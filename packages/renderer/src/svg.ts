import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES, mirrorOf } from "@excalidraw-clone/scene"
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  FontFamily,
  Scene,
} from "@excalidraw-clone/scene"
import { RoughSVG } from "roughjs/bin/svg"
import { generateShape } from "./shapes"
import { isFixedWidthText, OCCLUSION_PADDING } from "./shapes/text"
import {
  fontFamilyName,
  layoutLabel,
  measureText,
  wrapLines,
  type FontStyle,
  type FontWeight,
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
  weight?: FontWeight,
  style?: FontStyle,
) => TextSize

const defaultMeasure = (): TextMeasure | null => {
  if (typeof document === "undefined") return null
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  return (text, fontSize, family, lineHeight, weight, style) =>
    measureText(ctx, text, fontSize, family, lineHeight, weight, style)
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

function svgEl<K extends string>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | number>,
): Element {
  const node = doc.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

const measureElText = (measure: TextMeasure, el: ExcalidrawTextElement, text = el.text) =>
  measure(
    text,
    el.fontSize,
    el.fontFamily,
    el.lineHeight,
    el.fontWeight ?? "normal",
    el.fontStyle ?? "normal",
  )

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
    root.appendChild(
      svgEl(doc, "rect", {
        x: bbox.x,
        y: bbox.y,
        width,
        height,
        fill: resolveColor(opts.background, theme),
      }),
    )
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
            (s) => measureElText(measure, el, s).width,
          )
        : el.type === "text" && measure && isFixedWidthText(el)
          ? {
              lines: wrapLines(el.text, el.width, (s) => measureElText(measure, el, s).width),
              scale: 1,
            }
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
    const c = el.crop
    // imported elements may omit `crop`
    if (c == null) {
      group.appendChild(svgEl(doc, "image", { href, width: el.width, height: el.height }))
    } else {
      const kx = el.width / c.width
      const ky = el.height / c.height
      const clipId = `crop-${el.id}`
      const clip = svgEl(doc, "clipPath", { id: clipId })
      clip.appendChild(svgEl(doc, "rect", { width: el.width, height: el.height }))
      group.appendChild(clip)
      group.appendChild(
        svgEl(doc, "image", {
          href,
          x: -c.x * kx,
          y: -c.y * ky,
          width: kx,
          height: ky,
          preserveAspectRatio: "none",
          "clip-path": `url(#${clipId})`,
        }),
      )
    }
    return group
  }
  const group = createGroup(doc, el)

  if (el.type === "text") {
    if (backing && el.text.length > 0) {
      const size = measureElText(backing.measure, el)
      group.appendChild(
        svgEl(doc, "rect", {
          x: el.width / 2 - size.width / 2 - OCCLUSION_PADDING,
          y: el.height / 2 - size.height / 2 - OCCLUSION_PADDING,
          width: size.width + 2 * OCCLUSION_PADDING,
          height: size.height + 2 * OCCLUSION_PADDING,
          fill: backing.background,
        }),
      )
    }
    group.appendChild(textNode(doc, el, theme, layout))
    return group
  }

  if (el.type === "frame") {
    const name = svgEl(doc, "text", {
      "font-family": fontFamilyName(2),
      "font-size": 12,
      fill: resolveColor("#868e96", theme),
      x: 0,
      y: -4,
    })
    name.textContent = el.name ?? "Frame"
    group.appendChild(name)
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
  const cx = el.width / 2
  const cy = el.height / 2
  const parts = [`translate(${el.x} ${el.y})`]
  if (el.angle !== 0) {
    parts.push(`rotate(${(el.angle * 180) / Math.PI} ${cx} ${cy})`)
  }
  if (el.type === "image" || el.type === "text") {
    const [mx, my] = mirrorOf(el)
    if (mx !== 1 || my !== 1) {
      parts.push(`translate(${cx} ${cy}) scale(${mx} ${my}) translate(${-cx} ${-cy})`)
    }
  }
  return parts.join(" ")
}

function textNode(
  doc: Document,
  el: ExcalidrawTextElement,
  theme: Theme,
  layout?: LabelLayout,
): Element {
  const fontSize = el.fontSize * (layout?.scale ?? 1)
  const text = svgEl(doc, "text", {
    "font-family": fontFamilyName(el.fontFamily),
    "font-size": fontSize,
    "font-weight": el.fontWeight ?? "normal",
    "font-style": el.fontStyle ?? "normal",
    fill: resolveColor(el.strokeColor, theme),
    "text-anchor": anchorFor(el.textAlign),
    "dominant-baseline": "text-before-edge",
  })

  const lines = layout?.lines ?? el.text.split("\n")
  const lineHeightPx = fontSize * el.lineHeight
  const totalHeight = lines.length * lineHeightPx
  const baseY = verticalOffset(el, totalHeight)
  const x = horizontalAnchorX(el)

  for (let i = 0; i < lines.length; i += 1) {
    const tspan = svgEl(doc, "tspan", { x, y: baseY + i * lineHeightPx })
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
