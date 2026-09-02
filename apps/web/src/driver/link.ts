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
 *  1. the sole selected element, when it has an openable link (passes
 *     `sanitizeLinkHref`); else
 *  2. the topmost element under `pointer`, when it has an openable link (passes
 *     `sanitizeLinkHref`); else
 *  3. none.
 *  Gating on openability rather than truthiness keeps a stored-but-unopenable
 *  link (a typo, or a rejected scheme) from rendering a dead indicator. */
export function pickLinkIndicatorTarget(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
  pointer: { x: number; y: number } | null,
): ExcalidrawElement | null {
  if (selectedIds.length === 1) {
    const sole = elements.find((e) => e.id === selectedIds[0])
    if (sole && sanitizeLinkHref(sole.link)) return sole
  }
  if (pointer) {
    const hit = pickElementAtPoint(elements, pointer)
    if (hit && sanitizeLinkHref(hit.link)) return hit
  }
  return null
}

/** Layout constants for the link overlay (editor popover + corner indicator). */
// w-56 input (224) + px-1.5 (12) + border + up to 2 ~24px buttons
export const LINK_EDITOR_WIDTH = 300
export const LINK_INDICATOR_WIDTH = 32
export const LINK_EDITOR_OFFSET = 40
export const LINK_INDICATOR_OFFSET = 22
export const LINK_FLIP_GAP = 4

/** Clamp an absolutely-positioned overlay box into the viewport. `<main>` is
 *  `overflow-hidden`, so a box at a negative offset is clipped rather than
 *  scrolled to. `left` is clamped to `[0, viewportW - width]`. `top` uses the
 *  natural position above the anchor (`aboveTop`) when that is on-screen; when
 *  it is negative the box flips to `belowTop` (just under the anchor), itself
 *  clamped to `>= 0`. This is clamp-only — no true scroll-into-view. */
export function clampLinkOverlayPos(
  natural: { left: number; aboveTop: number; belowTop: number },
  width: number,
  viewportW: number,
): { left: number; top: number } {
  const left = Math.max(0, Math.min(natural.left, Math.max(0, viewportW - width)))
  const top = natural.aboveTop >= 0 ? natural.aboveTop : Math.max(0, natural.belowTop)
  return { left, top }
}
