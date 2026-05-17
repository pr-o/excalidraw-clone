import type { Scene } from "@excalidraw-clone/scene"
import { RoughSVG } from "roughjs/bin/svg"

export interface SVGRenderOptions {
  background?: string
  embedScene?: boolean
}

export function renderToSVG(scene: Scene, opts: SVGRenderOptions = {}): string {
  const elements = scene.getElements()
  const bbox = computeBBox(elements)
  const width = Math.max(1, bbox.width)
  const height = Math.max(1, bbox.height)
  const svgNS = "http://www.w3.org/2000/svg"
  const doc = document.implementation.createDocument(svgNS, "svg", null)
  const root = doc.documentElement
  root.setAttribute("xmlns", svgNS)
  root.setAttribute("width", String(width))
  root.setAttribute("height", String(height))
  root.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${width} ${height}`)
  if (opts.background) {
    const rect = doc.createElementNS(svgNS, "rect")
    rect.setAttribute("x", String(bbox.x))
    rect.setAttribute("y", String(bbox.y))
    rect.setAttribute("width", String(width))
    rect.setAttribute("height", String(height))
    rect.setAttribute("fill", opts.background)
    root.appendChild(rect)
  }
  // RoughSVG is instantiated against the root for future per-element draw paths.
  // Per-element SVG draw is deferred to v1.1 (see Phase 8 plan note).
  void new RoughSVG(root as unknown as SVGSVGElement)
  return new XMLSerializer().serializeToString(root)
}

function computeBBox(elements: ReturnType<Scene["getElements"]>): {
  x: number
  y: number
  width: number
  height: number
} {
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
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
