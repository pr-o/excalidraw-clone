import {
  elementShadow,
  hasSpans,
  LABELABLE_TYPES,
  LINEAR_LABELABLE_TYPES,
  mirrorOf,
  shadowMargin,
  sliceRuns,
} from "@excalidraw-clone/scene"
import type {
  ExcalidrawElement,
  ExcalidrawTableElement,
  ExcalidrawTextElement,
  FontFamily,
  Scene,
  TextSpan,
} from "@excalidraw-clone/scene"
import { RoughSVG } from "roughjs/bin/svg"
import { generateShape } from "./shapes"
import { gradientLine, gradientTakes, withFill } from "./shapes/gradient"
import { layoutTableCells } from "./shapes/table"
import { isFixedWidthText, OCCLUSION_PADDING } from "./shapes/text"
import {
  fontFamilyName,
  layoutLabel,
  measureText,
  splitLines,
  wrapRich,
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
  spans?: readonly TextSpan[],
) => TextSize

const defaultMeasure = (): TextMeasure | null => {
  if (typeof document === "undefined") return null
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  return (text, fontSize, family, lineHeight, weight, style, spans) =>
    measureText(ctx, text, fontSize, family, lineHeight, weight, style, undefined, spans)
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

const measureElText = (
  measure: TextMeasure,
  el: ExcalidrawTextElement,
  text = el.text,
  start = 0,
): TextSize => {
  const weight = el.fontWeight ?? "normal"
  const style = el.fontStyle ?? "normal"
  if (!hasSpans(el)) {
    return measure(text, el.fontSize, el.fontFamily, el.lineHeight, weight, style)
  }
  // Rich text: per line, sum the width of each style run of the slice at `start`.
  const lines = splitLines(text)
  let width = 0
  for (const l of lines) {
    let lineWidth = 0
    const from = start + l.start
    for (const r of sliceRuns(el.text, el.spans, from, from + l.text.length)) {
      const w = r.bold ? "bold" : weight
      const st = r.italic ? "italic" : style
      lineWidth += measure(r.text, el.fontSize, el.fontFamily, el.lineHeight, w, st).width
    }
    width = Math.max(width, lineWidth)
  }
  return { width, height: lines.length * el.fontSize * el.lineHeight }
}

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
            (s, start) => measureElText(measure, el, s, start).width,
            el.spans,
          )
        : el.type === "text" && measure && isFixedWidthText(el)
          ? fixedLayout(el, measure)
          : undefined
    const node = renderElement(doc, el, rsvg, opts.files, theme, backing, labelLayout, measure)
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
  measure?: TextMeasure | null,
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
  const line = gradientLine(el)
  let fill: string | undefined
  if (line) {
    const { to, ...coords } = line
    fill = `gradient-${el.id}`
    const grad = svgEl(doc, "linearGradient", {
      id: fill,
      gradientUnits: "userSpaceOnUse",
      ...coords,
    })
    grad.appendChild(
      svgEl(doc, "stop", { offset: 0, "stop-color": resolveColor(el.backgroundColor, theme) }),
    )
    grad.appendChild(svgEl(doc, "stop", { offset: 1, "stop-color": resolveColor(to, theme) }))
    const defs = svgEl(doc, "defs", {})
    defs.appendChild(grad)
    group.appendChild(defs)
  }
  drawables.forEach((d, i) => {
    group.appendChild(rsvg.draw(fill && gradientTakes(el, i) ? withFill(d, `url(#${fill})`) : d))
  })
  if (el.type === "table") appendTableText(doc, group, el, theme, measure)
  return group
}

/** One <text> per laid-out cell line; without a measurer lines are not wrapped. */
function appendTableText(
  doc: Document,
  group: SVGGElement,
  t: ExcalidrawTableElement,
  theme: Theme,
  measure: TextMeasure | null | undefined,
): void {
  const lines = layoutTableCells(t, (s, bold, italic) =>
    measure
      ? measure(
          s,
          t.fontSize,
          t.fontFamily,
          t.fontSize,
          bold ? "bold" : "normal",
          italic ? "italic" : "normal",
        ).width
      : 0,
  )
  for (const l of lines) {
    const node = svgEl(doc, "text", {
      x: l.x,
      y: l.y,
      "font-family": fontFamilyName(t.fontFamily),
      "font-size": t.fontSize,
      "font-weight": l.bold ? "bold" : "normal",
      fill: resolveColor(t.strokeColor, theme),
      "text-anchor": anchorFor(t.textAlign),
      "dominant-baseline": "text-before-edge",
    })
    if (l.runs) {
      // Runs flow inside one anchored <text>, as for rich text elements.
      node.setAttribute("xml:space", "preserve")
      for (const r of l.runs) {
        if (r.bold === l.bold && !r.italic) {
          node.appendChild(doc.createTextNode(r.text))
          continue
        }
        const run = svgEl(doc, "tspan", {
          ...(r.bold !== l.bold ? { "font-weight": "bold" } : {}),
          ...(r.italic ? { "font-style": "italic" } : {}),
        })
        run.textContent = r.text
        node.appendChild(run)
      }
    } else {
      node.textContent = l.text
    }
    group.appendChild(node)
  }
}

function createGroup(doc: Document, el: ExcalidrawElement): SVGGElement {
  const group = doc.createElementNS(SVG_NS, "g")
  group.setAttribute("transform", elementTransform(el))
  if (el.opacity !== 100) {
    group.setAttribute("opacity", String(el.opacity / 100))
  }
  appendShadowFilter(doc, group, el)
  return group
}

/** A group-level feDropShadow, so the element's several paths cast one shadow. The scene-space
 *  offset is mapped into the group's local (rotated, mirrored) space to stay put on screen. */
function appendShadowFilter(doc: Document, group: SVGGElement, el: ExcalidrawElement): void {
  const sh = elementShadow(el)
  if (!sh) return
  const cos = Math.cos(-el.angle)
  const sin = Math.sin(-el.angle)
  const [mx, my] = el.type === "image" || el.type === "text" ? mirrorOf(el) : [1, 1]
  const r = (n: number): number => Math.round(n * 100) / 100 + 0
  const dx = r(mx * (sh.offsetX * cos - sh.offsetY * sin))
  const dy = r(my * (sh.offsetX * sin + sh.offsetY * cos))
  // Local-space region covering the element, its points and the shadow, so nothing is clipped.
  const xs = [0, el.width]
  const ys = [0, el.height]
  if (el.type === "line" || el.type === "arrow" || el.type === "freedraw") {
    for (const p of el.points) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }
  const m = shadowMargin(el) + el.strokeWidth + 8
  const x = Math.min(...xs) - m
  const y = Math.min(...ys) - m
  const id = `shadow-${el.id}`
  const filter = svgEl(doc, "filter", {
    id,
    filterUnits: "userSpaceOnUse",
    x,
    y,
    width: Math.max(...xs) - Math.min(...xs) + 2 * m,
    height: Math.max(...ys) - Math.min(...ys) + 2 * m,
  })
  filter.appendChild(
    svgEl(doc, "feDropShadow", { dx, dy, stdDeviation: sh.blur / 2, "flood-color": sh.color }),
  )
  const defs = svgEl(doc, "defs", {})
  defs.appendChild(filter)
  group.appendChild(defs)
  group.setAttribute("filter", `url(#${id})`)
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

function fixedLayout(el: ExcalidrawTextElement, measure: TextMeasure): LabelLayout {
  const wrapped = wrapRich(
    el.text,
    el.spans,
    el.width,
    (s, start) => measureElText(measure, el, s, start).width,
  )
  return { lines: wrapped.map((l) => l.text), wrapped, scale: 1 }
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

  const lines = layout?.wrapped ?? splitLines(el.text)
  const lineHeightPx = fontSize * el.lineHeight
  const totalHeight = lines.length * lineHeightPx
  const baseY = verticalOffset(el, totalHeight)
  const x = horizontalAnchorX(el)
  const rich = hasSpans(el)
  if (rich) text.setAttribute("xml:space", "preserve")

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]!
    const lx = x + (el.textAlign === "left" ? l.indent * (layout?.scale ?? 1) : 0)
    const tspan = svgEl(doc, "tspan", { x: lx, y: baseY + i * lineHeightPx })
    if (rich) {
      for (const r of sliceRuns(el.text, el.spans, l.start, l.start + l.text.length)) {
        if (!r.bold && !r.italic) {
          tspan.appendChild(doc.createTextNode(r.text))
          continue
        }
        const run = svgEl(doc, "tspan", {
          ...(r.bold ? { "font-weight": "bold" } : {}),
          ...(r.italic ? { "font-style": "italic" } : {}),
        })
        run.textContent = r.text
        tspan.appendChild(run)
      }
    } else {
      tspan.textContent = l.text
    }
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
    const m = shadowMargin(el)
    minX = Math.min(minX, el.x - m)
    minY = Math.min(minY, el.y - m)
    maxX = Math.max(maxX, el.x + el.width + m)
    maxY = Math.max(maxY, el.y + el.height + m)
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
