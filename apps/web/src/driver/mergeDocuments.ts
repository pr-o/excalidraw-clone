import type { ExcalidrawData, ExcalidrawElement, ExcalidrawPage } from "@excalidraw-clone/scene"

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Three-way merge of one value: whichever side changed it since `base` wins; when
 * both did, `local` wins. `undefined` means "absent" on that side.
 */
function pick<T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
  if (same(local, base)) return remote
  if (same(remote, base)) return local
  return local
}

/** Merges two edited copies of one page's elements, element by element (by id).
 *  Order: the remote order, then elements only this side added, in local order. */
function mergeElements(
  base: readonly ExcalidrawElement[],
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const byId = (list: readonly ExcalidrawElement[]) => new Map(list.map((e) => [e.id, e]))
  const b = byId(base)
  const l = byId(local)
  const r = byId(remote)
  const out: ExcalidrawElement[] = []
  const take = (id: string): void => {
    const merged = pick(b.get(id), l.get(id), r.get(id))
    if (merged) out.push(merged)
  }
  for (const el of remote) take(el.id)
  for (const el of local) if (!r.has(el.id)) take(el.id)
  return out
}

function mergePage(
  base: ExcalidrawPage | undefined,
  local: ExcalidrawPage,
  remote: ExcalidrawPage,
): ExcalidrawPage {
  const guides = pick(base?.guides, local.guides, remote.guides)
  const comments = pick(base?.comments, local.comments, remote.comments)
  return {
    id: local.id,
    name: pick(base?.name, local.name, remote.name) ?? local.name,
    elements: mergeElements(base?.elements ?? [], local.elements, remote.elements),
    ...(guides ? { guides } : {}),
    ...(comments ? { comments } : {}),
  }
}

/**
 * Combines this tab's unsaved edits (`local`) with a document another tab just saved
 * (`remote`), both descended from `base`, the last document the two tabs agreed on.
 *
 * Everything either side changed survives: added, edited and (soft-)deleted elements,
 * renamed and added pages, guides and comments. When both changed the same element
 * (or page property), this tab's version wins. A page one side removed stays removed
 * unless the other side edited it. Pages keep the remote order, followed by pages only
 * this tab added; this tab stays on its own active page.
 */
export function mergeDocuments(
  base: ExcalidrawData,
  local: ExcalidrawData,
  remote: ExcalidrawData,
): ExcalidrawData {
  const b = new Map(base.pages.map((p) => [p.id, p]))
  const l = new Map(local.pages.map((p) => [p.id, p]))
  const r = new Map(remote.pages.map((p) => [p.id, p]))
  const pages: ExcalidrawPage[] = []
  const add = (id: string): void => {
    const lp = l.get(id)
    const rp = r.get(id)
    const bp = b.get(id)
    if (lp && rp) pages.push(mergePage(bp, lp, rp))
    else if (lp) {
      // Removed by the other tab: gone, unless this tab edited it since.
      if (!bp || !same(lp, bp)) pages.push(lp)
    } else if (rp) {
      if (!bp || !same(rp, bp)) pages.push(rp)
    }
  }
  for (const p of remote.pages) add(p.id)
  for (const p of local.pages) if (!r.has(p.id)) add(p.id)
  const activePageId = pages.some((p) => p.id === local.activePageId)
    ? local.activePageId
    : (pages[0]?.id ?? local.activePageId)
  return { ...remote, pages, activePageId }
}
