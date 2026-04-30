import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { generateShape } from "./shapes"

interface ShapeCacheEntry {
  versionNonce: number
  drawables: readonly Drawable[]
}

export class ShapeCache {
  private cache = new WeakMap<ExcalidrawElement, ShapeCacheEntry>()

  get(element: ExcalidrawElement, generator: RoughGenerator): readonly Drawable[] {
    const entry = this.cache.get(element)
    if (entry && entry.versionNonce === element.versionNonce) {
      return entry.drawables
    }
    const drawables = generateShape(element, generator)
    this.cache.set(element, { versionNonce: element.versionNonce, drawables })
    return drawables
  }

  clear(): void {
    this.cache = new WeakMap()
  }
}
