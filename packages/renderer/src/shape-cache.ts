import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { generateShape } from "./shapes"
import { themedElement } from "./theme-colors"
import type { Theme } from "./types"

interface ShapeCacheEntry {
  theme: Theme
  drawables: readonly Drawable[]
}

/** rough.js drawables per element. Elements are immutable (an edit replaces the
 *  object), so the object itself is the cache key; only the theme can change
 *  what one element draws. */
export class ShapeCache {
  private cache = new WeakMap<ExcalidrawElement, ShapeCacheEntry>()

  get(
    element: ExcalidrawElement,
    generator: RoughGenerator,
    theme: Theme = "light",
  ): readonly Drawable[] {
    const entry = this.cache.get(element)
    if (entry?.theme === theme) return entry.drawables
    const drawables = generateShape(themedElement(element, theme), generator)
    this.cache.set(element, { theme, drawables })
    return drawables
  }

  clear(): void {
    this.cache = new WeakMap()
  }
}
