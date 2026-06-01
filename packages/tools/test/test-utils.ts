import type { GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolContext } from "../src"

export const NO_MODIFIERS: Modifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
}

export const IDENTITY_VIEW: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

export const NO_GRID: GridSnap = { enabled: false, size: 20 }

export const makeCtx = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  readElements: () => [],
  hitTest: () => null,
  viewTransform: IDENTITY_VIEW,
  modifiers: NO_MODIFIERS,
  selectedIds: [],
  grid: NO_GRID,
  ...overrides,
})

export const applyMutation = (
  effects: readonly { kind: string; apply?: (draft: ExcalidrawElement[]) => void }[],
  draft: ExcalidrawElement[],
): void => {
  for (const eff of effects) {
    if (eff.kind === "mutation" && eff.apply) eff.apply(draft)
  }
}

export const point = (x: number, y: number): Point => ({ x, y })

export const withModifiers = (mods: Partial<Modifiers>): Modifiers => ({
  ...NO_MODIFIERS,
  ...mods,
})
