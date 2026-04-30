import { type ViewTransform, viewportToScene } from "@excalidraw-clone/geometry"
import type { GridOptions, Theme } from "./types"

const GRID_COLOR: Record<Theme, string> = {
  light: "#dddddd",
  dark: "#2a2a2a",
}

export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  grid: GridOptions,
  theme: Theme,
): void => {
  if (!grid.enabled) return
  if (grid.size <= 0) return
  const topLeft = viewportToScene({ x: 0, y: 0 }, view)
  const bottomRight = viewportToScene({ x: canvas.width, y: canvas.height }, view)
  const minX = Math.floor(topLeft.x / grid.size) * grid.size
  const maxX = Math.ceil(bottomRight.x / grid.size) * grid.size
  const minY = Math.floor(topLeft.y / grid.size) * grid.size
  const maxY = Math.ceil(bottomRight.y / grid.size) * grid.size

  ctx.strokeStyle = GRID_COLOR[theme]
  ctx.lineWidth = 1 / view.zoom
  ctx.beginPath()
  for (let x = minX; x <= maxX; x += grid.size) {
    ctx.moveTo(x, minY)
    ctx.lineTo(x, maxY)
  }
  for (let y = minY; y <= maxY; y += grid.size) {
    ctx.moveTo(minX, y)
    ctx.lineTo(maxX, y)
  }
  ctx.stroke()
}
