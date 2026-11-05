import { clamp } from "@excalidraw-clone/geometry"
import { ELEMENT_TYPES, type ExcalidrawBinaryFile, type ExcalidrawElement } from "./types"

const KNOWN_TYPES: ReadonlySet<string> = new Set(ELEMENT_TYPES)

const LINEAR_TYPES: ReadonlySet<string> = new Set(["arrow", "line", "freedraw"])

/** A usable number from untrusted data: rejects NaN, ±Infinity and numeric strings. */
export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)

/** `v` when it is a finite number, otherwise `fallback`. */
export const finiteOr = (v: unknown, fallback: number): number => (isFiniteNumber(v) ? v : fallback)

const isPoint = (p: unknown): boolean =>
  typeof p === "object" &&
  p !== null &&
  isFiniteNumber((p as { x?: unknown }).x) &&
  isFiniteNumber((p as { y?: unknown }).y)

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
  if (typeof el.type !== "string" || !KNOWN_TYPES.has(el.type)) return null
  if (LINEAR_TYPES.has(el.type) && !(Array.isArray(el.points) && el.points.every(isPoint))) {
    return null
  }
  return {
    ...el,
    x: finiteOr(el.x, 0),
    y: finiteOr(el.y, 0),
    width: finiteOr(el.width, 0),
    height: finiteOr(el.height, 0),
    angle: finiteOr(el.angle, 0),
    ...(el.type === "text" && typeof el.text !== "string" ? { text: "" } : {}),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    frameId: typeof el.frameId === "string" ? el.frameId : null,
    isDeleted: el.isDeleted === true,
    locked: el.locked === true,
    opacity: clamp(finiteOr(el.opacity, 100), 0, 100),
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

/** One stored image from an untrusted document or library: a record with an id
 *  and a `data:` URL, or null. */
export function sanitizeBinaryFile(raw: unknown): ExcalidrawBinaryFile | null {
  if (typeof raw !== "object" || raw === null) return null
  const f = raw as Record<string, unknown>
  if (typeof f.id !== "string" || f.id === "") return null
  if (typeof f.dataURL !== "string" || !f.dataURL.startsWith("data:")) return null
  return {
    id: f.id,
    mimeType: typeof f.mimeType === "string" ? f.mimeType : "application/octet-stream",
    dataURL: f.dataURL,
    created: finiteOr(f.created, 0),
  }
}

/** An untrusted `files` map, keyed by each file's own id; malformed entries are dropped. */
export function sanitizeFiles(raw: unknown): Record<string, ExcalidrawBinaryFile> {
  const out: Record<string, ExcalidrawBinaryFile> = {}
  if (typeof raw !== "object" || raw === null) return out
  for (const value of Object.values(raw)) {
    const file = sanitizeBinaryFile(value)
    if (file) out[file.id] = file
  }
  return out
}
