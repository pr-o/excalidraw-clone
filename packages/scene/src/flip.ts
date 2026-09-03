import type { ExcalidrawElement } from "./types"

export type FlipAxis = "x" | "y"

/** Per-axis mirror sign for an element; `[1, 1]` when unflipped. */
export const mirrorOf = (el: Pick<ExcalidrawElement, "mirror">): readonly [number, number] =>
  el.mirror ?? [1, 1]
