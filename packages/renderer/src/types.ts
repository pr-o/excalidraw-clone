import type { ViewTransform } from "@excalidraw-clone/geometry"

export type Theme = "light" | "dark"

export interface GridOptions {
  enabled: boolean
  size: number
}

export interface CanvasRendererOptions {
  overlayCanvas?: HTMLCanvasElement
  viewTransform?: ViewTransform
  theme?: Theme
  selection?: readonly string[]
  grid?: GridOptions
}
