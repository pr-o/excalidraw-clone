import type { ExcalidrawElement } from "./types"

const newNonce = (): number => Math.floor(Math.random() * 2 ** 31)

/** Patches (fresh versionNonce, bumped updated) for matched, live elements not yet in `locked` state. */
const setLocked = (
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  locked: boolean,
): ExcalidrawElement[] => {
  const idSet = new Set(ids)
  return elements
    .filter((el) => idSet.has(el.id) && !el.isDeleted && el.locked !== locked)
    .map((el) => ({ ...el, locked, versionNonce: newNonce(), updated: Date.now() }))
}

/** Returns locked patches (fresh versionNonce, bumped updated) for the matched
 *  ids. Skips ids already locked, deleted, or unknown. */
export const lockElements = (
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] => setLocked(elements, ids, true)

/** Returns unlocked patches (fresh versionNonce, bumped updated) for the matched
 *  ids. Skips ids not currently locked, deleted, or unknown. */
export const unlockElements = (
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] => setLocked(elements, ids, false)

/** Returns unlocked patches for every non-deleted locked element. */
export function unlockAll(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements
    .filter((el) => el.locked && !el.isDeleted)
    .map((el) => ({ ...el, locked: false, versionNonce: newNonce(), updated: Date.now() }))
}
