# Dark Mode Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish dark mode: element colors invert at draw time, the dead `canvasBg` setting actually paints the canvas, `system` theme resolves correctly and live, and PNG/SVG exports match the screen.

**Architecture:** A memoized `resolveColor(color, theme)` in `packages/renderer` is the single color-resolution point. Theme threads through `ShapeCache` → `generateShape` via a themed element copy, through `drawText` via a fill override, and through the SVG builder. The web app derives `resolvedTheme` ("light"|"dark") from `theme` + `matchMedia` and the driver/exports consume only the resolved value.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), React 19 web app, zustand store, roughjs canvas/SVG rendering, vitest unit tests, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-12-dark-mode-theming-design.md`

## Global Constraints

- Scene data is never mutated by theming; stored element colors stay canonical.
- Images are never color-inverted (canvas or SVG).
- `resolveColor` must never throw; unparseable input returns unchanged.
- `packages/renderer` may import only `@excalidraw-clone/geometry` and `@excalidraw-clone/scene` (ESLint boundary rule) and never React.
- Gate commands (run from repo root unless noted): `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`; e2e: `cd apps/web && pnpm e2e`.
- A lint-staged hook runs `eslint --fix` + `prettier --write` on commit; if it rewrites files, the commit still lands — don't fight formatting.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Renderer unit tests run with `pnpm --filter @excalidraw-clone/renderer test`; web unit tests with `pnpm --filter @excalidraw-clone/web test`.

---

### Task 1: `theme-colors.ts` — resolveColor + themedElement

**Files:**

- Create: `packages/renderer/src/theme-colors.ts`
- Test: `packages/renderer/test/theme-colors.test.ts`

**Interfaces:**

- Consumes: `Theme` from `packages/renderer/src/types.ts` (`"light" | "dark"`); `ExcalidrawElement` from `@excalidraw-clone/scene`.
- Produces: `resolveColor(color: string, theme: Theme): string` and `themedElement<T extends ExcalidrawElement>(el: T, theme: Theme): T` — Tasks 2, 3, and 5 import both from `./theme-colors`.

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/test/theme-colors.test.ts`:

```ts
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { resolveColor, themedElement } from "../src/theme-colors"

const lightness = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
}

describe("resolveColor", () => {
  it("is identity in light theme", () => {
    expect(resolveColor("#1e1e1e", "light")).toBe("#1e1e1e")
  })

  it("passes transparent through in dark theme", () => {
    expect(resolveColor("transparent", "dark")).toBe("transparent")
  })

  it("returns unparseable input unchanged and does not throw", () => {
    expect(resolveColor("not-a-color", "dark")).toBe("not-a-color")
    expect(resolveColor("", "dark")).toBe("")
    expect(resolveColor("#12", "dark")).toBe("#12")
  })

  it("maps the design endpoints exactly", () => {
    // Pinned by the spec: default ink ↔ near-white, white ↔ default ink.
    expect(resolveColor("#1e1e1e", "dark")).toBe("#ececec")
    expect(resolveColor("#ffffff", "dark")).toBe("#1e1e1e")
  })

  it("maps pure black to pure white (clamped)", () => {
    expect(resolveColor("#000000", "dark")).toBe("#ffffff")
  })

  it("expands #rgb shorthand", () => {
    expect(resolveColor("#fff", "dark")).toBe("#1e1e1e")
  })

  it("preserves alpha in #rrggbbaa", () => {
    expect(resolveColor("#1e1e1e80", "dark")).toBe("#ececec80")
  })

  it("inverts lightness monotonically for grays at or above ink level", () => {
    let prev = Infinity
    for (let v = 0x1e; v <= 0xff; v += 0x0b) {
      const c = `#${v.toString(16).padStart(2, "0").repeat(3)}`
      const out = lightness(resolveColor(c, "dark"))
      expect(out).toBeLessThan(prev)
      prev = out
    }
  })

  it("preserves hue: pure red stays red-dominant, just lighter", () => {
    const out = resolveColor("#ff0000", "dark")
    const r = parseInt(out.slice(1, 3), 16)
    const g = parseInt(out.slice(3, 5), 16)
    const b = parseInt(out.slice(5, 7), 16)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
    expect(g).toBe(b) // hue 0 keeps green == blue
  })

  it("memoizes: repeated calls return equal results", () => {
    expect(resolveColor("#e03131", "dark")).toBe(resolveColor("#e03131", "dark"))
  })
})

describe("themedElement", () => {
  it("returns the same object in light theme", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(themedElement(el, "light")).toBe(el)
  })

  it("resolves strokeColor and backgroundColor in dark theme without mutating", () => {
    const el = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    }
    const themed = themedElement(el, "dark")
    expect(themed).not.toBe(el)
    expect(themed.strokeColor).toBe("#ececec")
    expect(themed.backgroundColor).toBe("transparent")
    expect(el.strokeColor).toBe("#1e1e1e") // original untouched
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test -- theme-colors`
Expected: FAIL — cannot resolve `../src/theme-colors`.

- [ ] **Step 3: Write the implementation**

Create `packages/renderer/src/theme-colors.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Theme } from "./types"

// Linear lightness inversion pinned at two design endpoints:
// default ink #1e1e1e (l = 30/255) → #ececec (l = 236/255), white → #1e1e1e.
// Hue and saturation are preserved; out-of-range results clamp to [0, 1],
// so pure black maps to pure white.
const INK_L = 30 / 255
const INK_INVERTED_L = 236 / 255
const SLOPE = (INK_L - INK_INVERTED_L) / (1 - INK_L)

const invertLightness = (l: number): number =>
  Math.min(1, Math.max(0, INK_INVERTED_L + SLOPE * (l - INK_L)))

interface ParsedHex {
  r: number
  g: number
  b: number
  alphaHex: string
}

const HEX_SHORT = /^#[0-9a-f]{3}$/i
const HEX_LONG = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

const parseHex = (color: string): ParsedHex | null => {
  if (HEX_SHORT.test(color)) {
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(color[i]!.repeat(2), 16))
    return { r: r!, g: g!, b: b!, alphaHex: "" }
  }
  if (HEX_LONG.test(color)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    return { r: r!, g: g!, b: b!, alphaHex: color.slice(7).toLowerCase() }
  }
  return null
}

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

const hueToRgb = (p: number, q: number, t: number): number => {
  let tn = t
  if (tn < 0) tn += 1
  if (tn > 1) tn -= 1
  if (tn < 1 / 6) return p + (q - p) * 6 * tn
  if (tn < 1 / 2) return q
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
  return p
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ]
}

const hex2 = (v: number): string => v.toString(16).padStart(2, "0")

const darkCache = new Map<string, string>()

/** Resolve a stored element/background color for the given theme.
 *  Light is identity; dark preserves hue/saturation and inverts lightness.
 *  Never throws: transparent and unparseable inputs pass through unchanged. */
export const resolveColor = (color: string, theme: Theme): string => {
  if (theme === "light" || color === "transparent") return color
  const cached = darkCache.get(color)
  if (cached !== undefined) return cached
  const parsed = parseHex(color)
  if (parsed === null) return color
  const [h, s, l] = rgbToHsl(parsed.r, parsed.g, parsed.b)
  const [r, g, b] = hslToRgb(h, s, invertLightness(l))
  const out = `#${hex2(r)}${hex2(g)}${hex2(b)}${parsed.alphaHex}`
  darkCache.set(color, out)
  return out
}

/** Copy of the element with stroke/background resolved for the theme.
 *  Light returns the original object so WeakMap-keyed caches stay valid. */
export const themedElement = <T extends ExcalidrawElement>(el: T, theme: Theme): T =>
  theme === "light"
    ? el
    : {
        ...el,
        strokeColor: resolveColor(el.strokeColor, theme),
        backgroundColor: resolveColor(el.backgroundColor, theme),
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer test -- theme-colors`
Expected: PASS (all 12 tests).

- [ ] **Step 5: Full renderer package check, then commit**

Run: `pnpm --filter @excalidraw-clone/renderer test && pnpm typecheck`
Expected: all renderer tests pass; typecheck 13/13.

```bash
git add packages/renderer/src/theme-colors.ts packages/renderer/test/theme-colors.test.ts
git commit -m "renderer: theme-colors module — resolveColor + themedElement

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Thread theme through ShapeCache, drawElement, drawText

**Files:**

- Modify: `packages/renderer/src/shape-cache.ts`
- Modify: `packages/renderer/src/draw-element.ts`
- Modify: `packages/renderer/src/shapes/text.ts`
- Modify: `packages/renderer/src/renderer.ts` (render loop + `setTheme`)
- Test: `packages/renderer/test/shape-cache.test.ts` (extend), `packages/renderer/test/renderer-elements.test.ts` (extend)

**Interfaces:**

- Consumes: `resolveColor`, `themedElement` from `./theme-colors` (Task 1).
- Produces: `ShapeCache.get(element, generator, theme?: Theme)` (3rd param, default `"light"`); `drawElement(ctx, element, rough, cache, getImage, theme?: Theme)` (6th param, default `"light"`); `drawText(ctx, e, fillColor?: string)` (3rd param, defaults to `e.strokeColor`). Task 5's SVG builder relies on `themedElement`, not on these.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/shape-cache.test.ts` (match the file's existing imports — it already imports `ShapeCache`, a generator, and `newRectangle`; add missing ones):

```ts
describe("ShapeCache theming", () => {
  it("generates dark drawables with resolved colors", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const el = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeColor: "#1e1e1e",
    }
    const [dark] = cache.get(el, gen, "dark")
    expect(dark!.options.stroke).toBe("#ececec")
  })

  it("invalidates when the theme changes for the same element", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const el = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeColor: "#1e1e1e",
    }
    const [light] = cache.get(el, gen, "light")
    expect(light!.options.stroke).toBe("#1e1e1e")
    const [dark] = cache.get(el, gen, "dark")
    expect(dark!.options.stroke).toBe("#ececec")
    const [lightAgain] = cache.get(el, gen, "light")
    expect(lightAgain!.options.stroke).toBe("#1e1e1e")
  })
})
```

(`RoughGenerator` import: `import { RoughGenerator } from "roughjs/bin/generator"` — the existing file already constructs one; reuse its pattern.)

Append to `packages/renderer/test/renderer-elements.test.ts` (this file already spies on `RoughCanvas.prototype.draw` and uses `createMockCanvas` + fake timers — follow its exact setup):

```ts
it("draws elements with dark-resolved colors when theme is dark", () => {
  const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  const { canvas } = createMockCanvas()
  const scene = new Scene([
    { ...newRectangle({ x: 10, y: 10, width: 50, height: 50 }), strokeColor: "#1e1e1e" },
  ])
  const r = new CanvasRenderer(canvas, scene, { theme: "dark" })
  r.start()
  vi.advanceTimersByTime(20)
  expect(drawSpy).toHaveBeenCalledTimes(1)
  const drawable = drawSpy.mock.calls[0]![0] as { options: { stroke: string } }
  expect(drawable.options.stroke).toBe("#ececec")
  r.stop()
})

it("draws text with the dark-resolved fill", () => {
  const { canvas, ctx } = createMockCanvas()
  const scene = new Scene([{ ...newText({ x: 10, y: 10, text: "hi" }), strokeColor: "#1e1e1e" }])
  const r = new CanvasRenderer(canvas, scene, { theme: "dark" })
  r.start()
  vi.advanceTimersByTime(20)
  const fills = ctx.__calls.filter((c) => c.method === "set:fillStyle").map((c) => c.args[0])
  expect(fills).toContain("#ececec")
  r.stop()
})
```

(`newText` is confirmed exported from `@excalidraw-clone/scene` — see `packages/scene/src/index.ts:28`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- shape-cache renderer-elements`
Expected: new tests FAIL (extra args ignored → stroke stays `#1e1e1e`).

- [ ] **Step 3: Implement**

`packages/renderer/src/shape-cache.ts` — full new content:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { generateShape } from "./shapes"
import { themedElement } from "./theme-colors"
import type { Theme } from "./types"

interface ShapeCacheEntry {
  versionNonce: number
  theme: Theme
  drawables: readonly Drawable[]
}

export class ShapeCache {
  private cache = new WeakMap<ExcalidrawElement, ShapeCacheEntry>()

  get(
    element: ExcalidrawElement,
    generator: RoughGenerator,
    theme: Theme = "light",
  ): readonly Drawable[] {
    const entry = this.cache.get(element)
    if (entry && entry.versionNonce === element.versionNonce && entry.theme === theme) {
      return entry.drawables
    }
    const drawables = generateShape(themedElement(element, theme), generator)
    this.cache.set(element, { versionNonce: element.versionNonce, theme, drawables })
    return drawables
  }

  clear(): void {
    this.cache = new WeakMap()
  }
}
```

`packages/renderer/src/shapes/text.ts` — change only the signature and the fillStyle line:

```ts
export const drawText = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawTextElement,
  fillColor?: string,
): void => {
```

and inside: `ctx.fillStyle = fillColor ?? e.strokeColor`

`packages/renderer/src/draw-element.ts` — new signature and themed calls:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { drawText } from "./shapes/text"
import { resolveColor } from "./theme-colors"
import type { Theme } from "./types"

export type ImageLookup = (fileId: string) => HTMLImageElement | undefined

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
  theme: Theme = "light",
): void => {
```

- text branch: `drawText(ctx, element, resolveColor(element.strokeColor, theme))`
- shape branch: `const drawables = cache.get(element, rough.generator, theme)`
- image branch: unchanged (never inverted).

`packages/renderer/src/renderer.ts`:

- In `render()`, the element loop becomes
  `drawElement(ctx, element, this.rough, this.shapeCache, getImage, this.theme)`.
- `setTheme` clears the cache so a flip regenerates immediately:

```ts
setTheme(theme: Theme): void {
  this.theme = theme
  this.shapeCache.clear()
  this.requestRedraw()
}
```

- [ ] **Step 4: Run the renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS, including all pre-existing tests (default `theme = "light"` keeps old behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src packages/renderer/test
git commit -m "renderer: dark theme threads through shape cache, drawElement, drawText

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Renderer canvasBg — themed background fill, transparent support

**Files:**

- Modify: `packages/renderer/src/types.ts`
- Modify: `packages/renderer/src/renderer.ts`
- Test: `packages/renderer/test/renderer-skeleton.test.ts` (extend; also update any assertion on `#121212`)

**Interfaces:**

- Consumes: `resolveColor` from `./theme-colors` (Task 1).
- Produces: `CanvasRendererOptions.canvasBg?: string` and `CanvasRenderer.setCanvasBg(color: string): void`. `canvasBg === "transparent"` means clear-only (no fill). Tasks 4 and 5 rely on both. **Behavior change:** dark default background becomes `resolveColor("#ffffff","dark") = "#1e1e1e"` (was `#121212`), now matching the `--bg-canvas` CSS var.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/renderer-skeleton.test.ts` (it already uses `createMockCanvas`, `Scene`, fake timers — follow its setup; `callsOf` comes from `../src/test-utils/mock-canvas`):

```ts
describe("canvas background", () => {
  it("fills with the canvasBg color in light theme", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene([]), { canvasBg: "#fff3bf" })
    r.start()
    vi.advanceTimersByTime(20)
    const fills = ctx.__calls.filter((c) => c.method === "set:fillStyle").map((c) => c.args[0])
    expect(fills[0]).toBe("#fff3bf")
    r.stop()
  })

  it("fills with the dark-resolved canvasBg in dark theme (default white → #1e1e1e)", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene([]), { theme: "dark" })
    r.start()
    vi.advanceTimersByTime(20)
    const fills = ctx.__calls.filter((c) => c.method === "set:fillStyle").map((c) => c.args[0])
    expect(fills[0]).toBe("#1e1e1e")
    r.stop()
  })

  it("skips the background fill entirely when canvasBg is transparent", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene([]), { canvasBg: "transparent" })
    r.start()
    vi.advanceTimersByTime(20)
    expect(callsOf(ctx, "clearRect").length).toBeGreaterThan(0)
    expect(callsOf(ctx, "fillRect")).toHaveLength(0)
    r.stop()
  })

  it("setCanvasBg triggers a redraw with the new color", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene([]))
    r.start()
    vi.advanceTimersByTime(20)
    r.setCanvasBg("#fff3bf")
    vi.advanceTimersByTime(20)
    const fills = ctx.__calls.filter((c) => c.method === "set:fillStyle").map((c) => c.args[0])
    expect(fills).toContain("#fff3bf")
    r.stop()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- renderer-skeleton`
Expected: new tests FAIL (`canvasBg` option ignored, `setCanvasBg` undefined).

- [ ] **Step 3: Implement**

`packages/renderer/src/types.ts` — add to `CanvasRendererOptions`:

```ts
  /** Canvas background color; "transparent" clears without filling. Dark theme inverts it. */
  canvasBg?: string
```

`packages/renderer/src/renderer.ts`:

- Delete the `BACKGROUND` const entirely.
- Add field `private canvasBg: string`; in the constructor: `this.canvasBg = options.canvasBg ?? "#ffffff"`.
- Add next to `setTheme`:

```ts
setCanvasBg(color: string): void {
  this.canvasBg = color
  this.requestRedraw()
}
```

- In `render()`, replace

```ts
ctx.fillStyle = BACKGROUND[this.theme]
ctx.fillRect(0, 0, canvas.width, canvas.height)
```

with

```ts
if (this.canvasBg !== "transparent") {
  ctx.fillStyle = resolveColor(this.canvasBg, this.theme)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}
```

and add `import { resolveColor } from "./theme-colors"`.

- [ ] **Step 4: Fix stale `#121212` assertions, run suite**

Run: `grep -rn "121212" packages/renderer/test/` — update any hit to expect `#1e1e1e` (the dark default is now derived, not hardcoded).
Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src packages/renderer/test
git commit -m "renderer: canvasBg option — themed background fill, transparent support, drop BACKGROUND table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: resolvedTheme — system preference, live listener, driver wiring

**Files:**

- Modify: `apps/web/src/store/slices/theme.ts`
- Modify: `apps/web/src/components/App.tsx` (theme effect, ~lines 103–110)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (renderer construction ~line 100, subscription ~line 106)
- Test: Create `apps/web/test/theme-resolution.test.ts`

**Interfaces:**

- Consumes: `CanvasRenderer` options `theme` + `canvasBg` and `setCanvasBg` (Task 3).
- Produces: `ResolvedTheme = "light" | "dark"`; store fields `resolvedTheme: ResolvedTheme` (default `"light"`) and `setResolvedTheme(t: ResolvedTheme)`; pure `computeResolvedTheme(theme: Theme, prefersDark: boolean): ResolvedTheme` — all exported from `apps/web/src/store/slices/theme.ts`. Task 5's dialog default reads `resolvedTheme`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/theme-resolution.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"
import { computeResolvedTheme } from "../src/store/slices/theme"

describe("computeResolvedTheme", () => {
  it("passes explicit themes through regardless of OS preference", () => {
    expect(computeResolvedTheme("light", true)).toBe("light")
    expect(computeResolvedTheme("dark", false)).toBe("dark")
  })

  it("resolves system from the OS preference", () => {
    expect(computeResolvedTheme("system", true)).toBe("dark")
    expect(computeResolvedTheme("system", false)).toBe("light")
  })
})

describe("resolvedTheme slice", () => {
  it("defaults to light and updates via setResolvedTheme", () => {
    expect(useAppStore.getState().resolvedTheme).toBe("light")
    useAppStore.getState().setResolvedTheme("dark")
    expect(useAppStore.getState().resolvedTheme).toBe("dark")
    useAppStore.getState().setResolvedTheme("light")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web test -- theme-resolution`
Expected: FAIL — `computeResolvedTheme` not exported.

- [ ] **Step 3: Implement the slice**

`apps/web/src/store/slices/theme.ts` — full new content:

```ts
import type { StateCreator } from "zustand"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const computeResolvedTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme =>
  theme === "system" ? (prefersDark ? "dark" : "light") : theme

export interface ThemeSlice {
  theme: Theme
  setTheme: (t: Theme) => void
  /** Derived from theme + OS preference by the App effect; never persisted. */
  resolvedTheme: ResolvedTheme
  setResolvedTheme: (t: ResolvedTheme) => void
}

export const createThemeSlice: StateCreator<ThemeSlice, [], [], ThemeSlice> = (set) => ({
  theme: "light",
  setTheme: (t) => set({ theme: t }),
  resolvedTheme: "light",
  setResolvedTheme: (t) => set({ resolvedTheme: t }),
})
```

- [ ] **Step 4: Rewrite the App.tsx theme effect**

Replace the existing effect (currently sets `dataset.theme` from a one-shot `matchMedia` read):

```ts
useEffect(() => {
  const mql = window.matchMedia("(prefers-color-scheme: dark)")
  const apply = (): void => {
    const resolved = computeResolvedTheme(theme, mql.matches)
    document.documentElement.dataset.theme = resolved
    useAppStore.getState().setResolvedTheme(resolved)
  }
  apply()
  if (theme !== "system") return
  mql.addEventListener("change", apply)
  return () => mql.removeEventListener("change", apply)
}, [theme])
```

Add `computeResolvedTheme` to the existing `../store/slices/theme` (or store barrel) import in App.tsx — match however `Theme` is currently imported there.

- [ ] **Step 5: Wire the driver**

`apps/web/src/driver/useDrawingDriver.ts`:

Construction (line ~100) — pass initial values so a renderer mounted into an already-dark session starts dark:

```ts
const initial = useAppStore.getState()
const renderer = new CanvasRenderer(canvas, scene, {
  overlayCanvas: overlay,
  theme: initial.resolvedTheme,
  canvasBg: initial.canvasBg,
})
```

Subscription (line ~106) — replace the theme line and add canvasBg:

```ts
if (s.resolvedTheme !== prev.resolvedTheme) renderer.setTheme(s.resolvedTheme)
if (s.canvasBg !== prev.canvasBg) renderer.setCanvasBg(s.canvasBg)
```

- [ ] **Step 6: Run web tests + typecheck**

Run: `pnpm --filter @excalidraw-clone/web test && pnpm typecheck`
Expected: PASS / 13 of 13.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "web: resolvedTheme — system preference resolution with live matchMedia listener; canvas follows it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: WYSIWYG exports — themed SVG, themed PNG, theme-aware dialog default

**Files:**

- Modify: `packages/renderer/src/svg.ts`
- Modify: `apps/web/src/driver/exportPNG.ts`
- Modify: `apps/web/src/components/Dialogs.tsx`
- Modify: `packages/ui/src/ExportDialog.tsx`
- Test: `packages/renderer/test/svg.test.ts` (extend)

**Interfaces:**

- Consumes: `resolveColor`, `themedElement` (Task 1); renderer `canvasBg` option (Task 3); store `resolvedTheme` (Task 4).
- Produces: `SVGRenderOptions.theme?: Theme` (background and element colors resolved through it; default `"light"` keeps today's output byte-identical — the App.tsx library-preview call site at `renderToSVG(tempScene, { padding: 4 })` is intentionally untouched); `exportToPNG(scene, opts, canvasBg?: string)` (3rd param, default `"#ffffff"`); `ExportDialogProps.defaultBackground?: ExportOptions["background"]`.

- [ ] **Step 1: Write the failing SVG tests**

Append to `packages/renderer/test/svg.test.ts` (match its existing Scene/element setup):

```ts
describe("renderToSVG theming", () => {
  it("resolves element and background colors in dark theme", () => {
    const scene = new Scene([
      { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" },
    ])
    const svg = renderToSVG(scene, { background: "#ffffff", theme: "dark" })
    expect(svg).toContain("#ececec") // inverted stroke
    expect(svg).toContain('fill="#1e1e1e"') // inverted background rect
    expect(svg).not.toContain('stroke="#1e1e1e"')
  })

  it("keeps light output unchanged", () => {
    const scene = new Scene([
      { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" },
    ])
    expect(renderToSVG(scene, { background: "#ffffff" })).toBe(
      renderToSVG(scene, { background: "#ffffff", theme: "light" }),
    )
  })

  it("resolves text fill in dark theme", () => {
    const scene = new Scene([{ ...newText({ x: 0, y: 0, text: "hi" }), strokeColor: "#1e1e1e" }])
    const svg = renderToSVG(scene, { theme: "dark" })
    expect(svg).toContain('fill="#ececec"')
  })
})
```

(Use the same text factory found in Task 2.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- svg`
Expected: new tests FAIL (`theme` option unknown/ignored).

- [ ] **Step 3: Implement SVG theming**

`packages/renderer/src/svg.ts`:

```ts
import { resolveColor, themedElement } from "./theme-colors"
import type { Theme } from "./types"

export interface SVGRenderOptions {
  background?: string
  embedScene?: boolean
  padding?: number
  files?: ReadonlyMap<string, string>
  /** Resolve all colors for this theme; default "light" (identity). */
  theme?: Theme
}
```

In `renderToSVG`: `const theme = opts.theme ?? "light"`; the background rect sets
`rect.setAttribute("fill", resolveColor(opts.background, theme))`; pass `theme` into
`renderElement(doc, el, rsvg, opts.files, theme)`.

In `renderElement(doc, el, rsvg, files, theme: Theme)`:

- image branch: unchanged (never inverted);
- text branch: `group.appendChild(textNode(doc, el, theme))`;
- shape branch: `const drawables = generateShape(themedElement(el, theme), rsvg.generator)`.

In `textNode(doc, el, theme: Theme)`: `text.setAttribute("fill", resolveColor(el.strokeColor, theme))`.

Run: `pnpm --filter @excalidraw-clone/renderer test -- svg` — expected: PASS.

- [ ] **Step 4: Themed PNG export**

`apps/web/src/driver/exportPNG.ts`:

- Delete the `BG_FOR` const.
- New signature: `export async function exportToPNG(scene: Scene, opts: ExportOptions, canvasBg = "#ffffff"): Promise<Blob>`
- Renderer construction:

```ts
const renderer = new CanvasRenderer(canvas, scene, {
  theme: opts.background === "dark" ? "dark" : "light",
  canvasBg: opts.background === "transparent" ? "transparent" : canvasBg,
  viewTransform: { scrollX: -bbox.x + PADDING, scrollY: -bbox.y + PADDING, zoom: opts.scale },
})
```

- Delete the manual `ctx` acquisition + pre-fill block (lines acquiring `getContext("2d")`, the `clearRect`/`fillStyle`/`fillRect` branch) — the renderer now paints the background itself, and `"transparent"` finally works (the old pre-fill was overpainted by the renderer's unconditional fill).

- [ ] **Step 5: Dialogs wiring + dialog default**

`apps/web/src/components/Dialogs.tsx`:

- Read `const resolvedTheme = useAppStore((s) => s.resolvedTheme)`.
- Delete `BG_FOR_SVG`.
- `onExport`: `void exportScene(scene, opts, canvasBg)` (canvasBg is already read in this component).
- `exportScene` becomes:

```ts
async function exportScene(scene: Scene, opts: ExportOptions, canvasBg: string): Promise<void> {
  const theme = opts.background === "dark" ? "dark" : "light"
  const background = opts.background === "transparent" ? "transparent" : canvasBg
  if (opts.format === "svg") {
    const files = new Map<string, string>()
    for (const el of scene.getElements()) {
      if (el.type === "image" && el.fileId !== null && !files.has(el.fileId)) {
        const bin = await getFile(el.fileId)
        if (bin) files.set(el.fileId, bin.dataURL)
      }
    }
    const svg = renderToSVG(scene, { background, theme, files })
    const blob = new Blob([svg], { type: "image/svg+xml" })
    download(blob, "drawing.svg")
    return
  }
  const blob = await exportToPNG(scene, opts, canvasBg)
  download(blob, "drawing.png")
}
```

- ExportDialog usage: `<ExportDialog ... defaultBackground={resolvedTheme === "dark" ? "dark" : "white"} />`

`packages/ui/src/ExportDialog.tsx`:

- `import { useEffect, useState } from "react"`
- Props: add `defaultBackground?: ExportOptions["background"]`.
- State + sync (the dialog stays mounted, so re-derive on open):

```ts
const [background, setBackground] = useState<ExportOptions["background"]>(
  defaultBackground ?? "white",
)
useEffect(() => {
  if (open) setBackground(defaultBackground ?? "white")
}, [open, defaultBackground])
```

(destructure `defaultBackground` alongside the other props).

- [ ] **Step 6: Full gate (unit-level)**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all green, 13/13 + build 7/7.

- [ ] **Step 7: Commit**

```bash
git add packages/renderer packages/ui apps/web/src
git commit -m "renderer+web+ui: WYSIWYG exports — themed SVG/PNG via resolveColor, theme-aware export default

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: e2e coverage + full gate

**Files:**

- Modify: `apps/web/e2e/theme.spec.ts` (extend — one shallow test exists)

**Interfaces:**

- Consumes: everything above; e2e helpers `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; testids `theme-dark`, `theme-system`, `toolbar-rectangle`, `bg-dark`, `format-png`; hamburger opens via `page.getByRole("button", { name: /menu/i })`; export via menu item (see `file-io.spec.ts` for the menu-click pattern).
- Produces: nothing downstream; final verification.

- [ ] **Step 1: Extend `apps/web/e2e/theme.spec.ts`**

Keep the existing `data-theme` test, add:

```ts
import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas } from "./_helpers"

const bgPixel = async (page: Page): Promise<[number, number, number]> =>
  page.evaluate(() => {
    const c = document.querySelector("canvas")!
    const ctx = c.getContext("2d")!
    const d = ctx.getImageData(30, 30, 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  })

// Brightest channel value in a region — stroke pixels are jittery (roughjs),
// so scan a box instead of a single coordinate.
const maxChannelIn = async (
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> =>
  page.evaluate(
    ([rx, ry, rw, rh]) => {
      const c = document.querySelector("canvas")!
      const ctx = c.getContext("2d")!
      const d = ctx.getImageData(rx!, ry!, rw!, rh!).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
      return max
    },
    [x, y, w, h],
  )

const setThemeVia = async (page: Page, testId: string): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
}

test("dark theme paints the canvas dark and keeps default strokes visible", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 400, y: 320 })
  await setThemeVia(page, "theme-dark")

  const [r, g, b] = await bgPixel(page)
  expect(Math.max(r, g, b)).toBeLessThan(70) // dark background

  // Top border of the rect runs near y=200 between x=200..400; the default
  // ink stroke must now be light. Scan a box straddling the border.
  expect(await maxChannelIn(page, 280, 190, 40, 20)).toBeGreaterThan(180)
})

test("system theme follows OS preference live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-system")
  expect((await bgPixel(page))[0]).toBeGreaterThan(200)

  await page.emulateMedia({ colorScheme: "dark" })
  await page.waitForTimeout(300)
  expect((await bgPixel(page))[0]).toBeLessThan(70)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  // Leaving "system" detaches the listener: explicit light wins over dark OS.
  await setThemeVia(page, "theme-light")
  expect((await bgPixel(page))[0]).toBeGreaterThan(200)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
})

test("dark theme persists across reload", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-dark")
  await page.reload()
  await page.locator("canvas").first().waitFor()
  await page.waitForTimeout(500)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  expect((await bgPixel(page))[0]).toBeLessThan(70)
})

test("export dialog defaults to dark and dark PNG has a dark background", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-dark")

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await expect(page.locator('[data-testid="bg-dark"]')).toHaveAttribute("aria-pressed", "true")

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  const b64 = readFileSync(path!).toString("base64")

  // Decode in the page: corner pixel of the exported PNG must be dark.
  const corner = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await new Promise((res) => (img.onload = res))
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(1, 1, 1, 1).data
    return [d[0], d[1], d[2]]
  }, b64)
  expect(Math.max(corner[0]!, corner[1]!, corner[2]!)).toBeLessThan(70)
})
```

Labels are exact per `apps/web/src/locales/en/common.json`: the menu item is
`"Export image…"` (note the real ellipsis character) and the dialog confirm button is
`"Export"`. e2e runs with the `en` locale by default (fresh localStorage).

- [ ] **Step 2: Run the e2e suite**

Run: `cd apps/web && pnpm e2e`
Expected: all specs pass (21 existing + 4 new; the pre-existing theme test still passes).

- [ ] **Step 3: Full gate**

Run from repo root: `pnpm typecheck && pnpm test && pnpm lint && pnpm build && cd apps/web && pnpm e2e`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e
git commit -m "web: e2e — dark canvas visibility, live system flip, persistence, themed export default

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §1 color module → Task 1; §2 renderer + canvasBg → Tasks 2–3; §3 system theme → Task 4; §4 exports → Task 5; §5 testing → per-task tests + Task 6. The spec's "setTheme clears the shape cache" is implemented in Task 2 (belt) on top of per-entry theme validation (suspenders).
- **Known deltas from today's behavior (intentional, per spec):** dark canvas background moves `#121212` → `#1e1e1e` (aligns with the `--bg-canvas` CSS var); transparent PNG export becomes actually transparent (was silently overpainted); export dialog background defaults to the session theme instead of always "white".
- **Text factory name** `newText` confirmed exported from `@excalidraw-clone/scene` (`packages/scene/src/index.ts:28`).
