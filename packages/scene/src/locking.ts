import type { ExcalidrawElement } from "./types"

const newNonce = (): number => Math.floor(Math.random() * 2 ** 31)

/** Returns locked patches (fresh versionNonce, bumped updated) for the matched
 *  ids. Skips ids already locked, deleted, or unknown. */
export function lockElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  return elements
    .filter((el) => idSet.has(el.id) && !el.isDeleted && !el.locked)
    .map((el) => ({ ...el, locked: true, versionNonce: newNonce(), updated: Date.now() }))
}

/** Returns unlocked patches for every non-deleted locked element. */
export function unlockAll(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements
    .filter((el) => el.locked && !el.isDeleted)
    .map((el) => ({ ...el, locked: false, versionNonce: newNonce(), updated: Date.now() }))
}
