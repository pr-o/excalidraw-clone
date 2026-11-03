import type { ElementType, ExcalidrawElement } from "./types"

const ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
  "parallelogram",
  "hexagon",
  "pentagon",
  "octagon",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "frame",
  "table",
])

const LINEAR_TYPES: ReadonlySet<string> = new Set(["arrow", "line", "freedraw"])

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

const isPoint = (p: unknown): boolean =>
  typeof p === "object" &&
  p !== null &&
  finite((p as { x?: unknown }).x) &&
  finite((p as { y?: unknown }).y)

/**
 * Makes an untrusted element (opened file, pasted clipboard, imported library)
 * safe for the scene and renderer, or returns null when it cannot be repaired.
 *
 * Dropped: not an object, no id, unknown type, or a linear element whose
 * `points` are not finite {x, y} pairs (there is nothing sensible to draw).
 * One such element used to throw inside the render loop, and because the scene
 * is auto-saved the app then crashed again on every reload.
 *
 * Repaired rather than dropped (older or hand-made files lose nothing, and the
 * type-specific sanitizers — tables, spans, crop — still get to run): missing
 * or non-finite `x`, `y`, `width`, `height` and `angle` become 0, `text` becomes
 * "", and `groupIds`, `boundElements`, `frameId`, `isDeleted`, `locked`,
 * `opacity` and `link` get their neutral defaults.
 */
export function sanitizeElement(raw: unknown): ExcalidrawElement | null {
  if (typeof raw !== "object" || raw === null) return null
  const el = raw as Record<string, unknown>
  if (typeof el.id !== "string" || el.id === "") return null
  if (typeof el.type !== "string" || !ELEMENT_TYPES.has(el.type)) return null
  if (LINEAR_TYPES.has(el.type) && !(Array.isArray(el.points) && el.points.every(isPoint))) {
    return null
  }
  const num = (v: unknown): number => (finite(v) ? v : 0)
  return {
    ...el,
    x: num(el.x),
    y: num(el.y),
    width: num(el.width),
    height: num(el.height),
    angle: num(el.angle),
    ...(el.type === "text" && typeof el.text !== "string" ? { text: "" } : {}),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    frameId: typeof el.frameId === "string" ? el.frameId : null,
    isDeleted: el.isDeleted === true,
    locked: el.locked === true,
    opacity: finite(el.opacity) ? Math.min(100, Math.max(0, el.opacity)) : 100,
    link: typeof el.link === "string" ? el.link : null,
  } as unknown as ExcalidrawElement
}

/** `sanitizeElement` over a list: unusable entries are dropped, the rest repaired. */
export function sanitizeElements(raw: unknown): ExcalidrawElement[] {
  if (!Array.isArray(raw)) return []
  const out: ExcalidrawElement[] = []
  for (const item of raw) {
    const el = sanitizeElement(item)
    if (el) out.push(el)
  }
  return out
}
