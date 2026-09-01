import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { pickElementAtPoint } from "./hitTest"

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/** Normalize what the user typed into the link editor into a storable value.
 *  Trim; empty → null; keep an explicit URL scheme as-is; otherwise assume a
 *  bare domain and prefix `https://` (matches Excalidraw). */
export function normalizeLinkInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  if (SCHEME_RE.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Return a safe, openable href, or null. Only http(s) and mailto pass; every
 *  other scheme and any unparseable string is rejected. Used both when deciding
 *  whether to show an "Open" affordance and immediately before `window.open`,
 *  so a hand-edited persisted file can never open a dangerous scheme. */
export function sanitizeLinkHref(link: string | null | undefined): string | null {
  if (!link) return null
  try {
    const url = new URL(link)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/** Mutation-draft helper (style of `commitTextEdit` / `renameFrame`): set or
 *  clear `link` on the element with `id`. No-op if the id is absent. */
export function commitElementLink(
  draft: ExcalidrawElement[],
  id: string,
  link: string | null,
): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  draft[i] = { ...draft[i]!, link }
}

/** Open a link in a new tab if — and only if — it sanitizes to a safe href. */
export function openLink(link: string | null | undefined): void {
  const href = sanitizeLinkHref(link)
  if (href) window.open(href, "_blank", "noopener,noreferrer")
}

/** Which element (if any) the corner link indicator should point at:
 *  1. the sole selected element, when it has a truthy link; else
 *  2. the topmost element under `pointer`, when it has a truthy link; else
 *  3. none. */
export function pickLinkIndicatorTarget(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
  pointer: { x: number; y: number } | null,
): ExcalidrawElement | null {
  if (selectedIds.length === 1) {
    const sole = elements.find((e) => e.id === selectedIds[0])
    if (sole && sole.link) return sole
  }
  if (pointer) {
    const hit = pickElementAtPoint(elements, pointer)
    if (hit && hit.link) return hit
  }
  return null
}
