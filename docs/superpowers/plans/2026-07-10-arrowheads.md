# Arrowhead Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all 8 schema arrowhead kinds on arrows _and_ lines, and add a Start/End arrowhead picker (incl. None) to the PropertiesPanel.

**Architecture:** A new pure-function renderer module `packages/renderer/src/shapes/arrowheads.ts` owns all arrowhead geometry (switch over the 8 kinds); `arrow.ts` and `line.ts` call it under the existing `startArrowhead`/`endArrowhead` presence checks. The UI adds one gated `<Section>` to `PropertiesPanel.tsx` that patches elements through the existing generic `onChange` flow — no schema, factory, or App.tsx changes.

**Tech Stack:** TypeScript, rough.js (`RoughGenerator`), React 19, vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-arrowheads-design.md` (committed).

## Global Constraints

- pnpm monorepo with turbo; run package tests with `pnpm --filter <name> test` (vitest run), e2e with `pnpm --filter @excalidraw-clone/web e2e` (playwright test).
- The `Arrowhead` union in `packages/scene/src/types.ts` is `"arrow" | "bar" | "dot" | "circle" | "cross" | "triangle" | "diamond" | "triangle_outline"` — **do not change the schema or factories**. Defaults stay: arrow = end `"arrow"`/start `null`; line = both `null`.
- UI package convention: components take `t: (key: string) => string`; unit tests stub `const t = (key: string): string => key`.
- All commits go on the `develop` branch, message style: `<pkg>: <imperative summary>`.
- Full gate before merge: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` (13/13 pkgs) and e2e green.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>` per repo convention.

---

### Task 1: Renderer arrowhead geometry module

**Files:**

- Create: `packages/renderer/src/shapes/arrowheads.ts`
- Test: `packages/renderer/test/arrowheads.test.ts` (new)

**Interfaces:**

- Consumes: `Arrowhead` type from `@excalidraw-clone/scene`; `RoughGenerator`, `Options`, `Drawable`, `Point as RoughPoint` from roughjs (same imports as `arrow.ts`).
- Produces: `arrowheadDrawables(kind: Arrowhead, tip: RoughPoint, prev: RoughPoint, gen: RoughGenerator, opts: Options): readonly Drawable[]` and re-exported constants `ARROWHEAD_LENGTH = 20`, `ARROWHEAD_ANGLE = Math.PI / 6`. Task 2 imports `arrowheadDrawables` from `"./arrowheads"`.

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/test/arrowheads.test.ts`:

```ts
import type { Arrowhead } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { arrowheadDrawables } from "../src/shapes/arrowheads"

const TIP: [number, number] = [100, 50]
const PREV: [number, number] = [0, 50] // horizontal shaft pointing right
const OPTS = { stroke: "#1e1e1e", strokeWidth: 2, seed: 7 }

const run = (kind: Arrowhead) => {
  const gen = new RoughGenerator()
  const spies = {
    linearPath: vi.spyOn(gen, "linearPath"),
    polygon: vi.spyOn(gen, "polygon"),
    circle: vi.spyOn(gen, "circle"),
    line: vi.spyOn(gen, "line"),
  }
  const drawables = arrowheadDrawables(kind, TIP, PREV, gen, OPTS)
  return { spies, drawables }
}

describe("arrowheadDrawables", () => {
  it("arrow → one open chevron via linearPath through the tip", () => {
    const { spies, drawables } = run("arrow")
    expect(drawables.length).toBe(1)
    expect(spies.linearPath).toHaveBeenCalledOnce()
    const [pts, opts] = spies.linearPath.mock.calls[0]!
    expect(pts).toHaveLength(3)
    expect(pts[1]).toEqual([100, 50]) // tip is the middle point
    expect(opts?.fill).toBeUndefined()
  })

  it("triangle → filled polygon with a vertex at the tip", () => {
    const { spies } = run("triangle")
    expect(spies.polygon).toHaveBeenCalledOnce()
    const [pts, opts] = spies.polygon.mock.calls[0]!
    expect(pts[0]).toEqual([100, 50])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("triangle_outline → same polygon, no fill", () => {
    const { spies } = run("triangle_outline")
    expect(spies.polygon).toHaveBeenCalledOnce()
    expect(spies.polygon.mock.calls[0]?.[1]?.fill).toBeUndefined()
  })

  it("bar → one perpendicular segment centered on the tip", () => {
    const { spies } = run("bar")
    expect(spies.line).toHaveBeenCalledOnce()
    const [x1, y1, x2, y2] = spies.line.mock.calls[0]!
    // shaft is horizontal → bar is vertical through the tip
    expect(x1).toBeCloseTo(100)
    expect(x2).toBeCloseTo(100)
    expect(y1).toBeCloseTo(40)
    expect(y2).toBeCloseTo(60)
  })

  it("dot → filled circle centered on the tip, diameter 12", () => {
    const { spies } = run("dot")
    expect(spies.circle).toHaveBeenCalledOnce()
    const [cx, cy, d, opts] = spies.circle.mock.calls[0]!
    expect([cx, cy, d]).toEqual([100, 50, 12])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("circle → same circle, no fill", () => {
    const { spies } = run("circle")
    expect(spies.circle).toHaveBeenCalledOnce()
    expect(spies.circle.mock.calls[0]?.[3]?.fill).toBeUndefined()
  })

  it("cross → two segments crossing at the tip", () => {
    const { spies, drawables } = run("cross")
    expect(spies.line).toHaveBeenCalledTimes(2)
    expect(drawables.length).toBe(2)
    // both segments have the tip as midpoint
    for (const call of spies.line.mock.calls) {
      const [x1, y1, x2, y2] = call
      expect((Number(x1) + Number(x2)) / 2).toBeCloseTo(100)
      expect((Number(y1) + Number(y2)) / 2).toBeCloseTo(50)
    }
  })

  it("diamond → filled 4-gon with far vertex at the tip", () => {
    const { spies } = run("diamond")
    expect(spies.polygon).toHaveBeenCalledOnce()
    const [pts, opts] = spies.polygon.mock.calls[0]!
    expect(pts).toHaveLength(4)
    expect(pts[0]).toEqual([100, 50])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("every kind produces at least one drawable", () => {
    const kinds: Arrowhead[] = [
      "arrow",
      "bar",
      "dot",
      "circle",
      "cross",
      "triangle",
      "diamond",
      "triangle_outline",
    ]
    for (const kind of kinds) {
      expect(run(kind).drawables.length).toBeGreaterThan(0)
    }
  })

  it("all kinds inherit strokeLineDash from opts", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    arrowheadDrawables("arrow", TIP, PREV, gen, { ...OPTS, strokeLineDash: [8, 8] })
    expect(spy.mock.calls[0]?.[1]?.strokeLineDash).toEqual([8, 8])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: FAIL — `Cannot find module '../src/shapes/arrowheads'` (or equivalent resolution error).

- [ ] **Step 3: Write the implementation**

Create `packages/renderer/src/shapes/arrowheads.ts`:

```ts
import type { Arrowhead } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"

export const ARROWHEAD_LENGTH = 20
export const ARROWHEAD_ANGLE = Math.PI / 6

const filled = (opts: Options): Options => ({
  ...opts,
  fill: opts.stroke,
  fillStyle: "solid",
})

/** Drawables for one arrowhead. `tip` is the endpoint; `prev` is the adjacent shaft point. */
export const arrowheadDrawables = (
  kind: Arrowhead,
  tip: RoughPoint,
  prev: RoughPoint,
  gen: RoughGenerator,
  opts: Options,
): readonly Drawable[] => {
  const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0])
  const dir: RoughPoint = [Math.cos(angle), Math.sin(angle)]
  const perp: RoughPoint = [-Math.sin(angle), Math.cos(angle)]
  const L = ARROWHEAD_LENGTH

  const chevronWings = (): { left: RoughPoint; right: RoughPoint } => ({
    left: [
      tip[0] - L * Math.cos(angle - ARROWHEAD_ANGLE),
      tip[1] - L * Math.sin(angle - ARROWHEAD_ANGLE),
    ],
    right: [
      tip[0] - L * Math.cos(angle + ARROWHEAD_ANGLE),
      tip[1] - L * Math.sin(angle + ARROWHEAD_ANGLE),
    ],
  })

  switch (kind) {
    case "arrow": {
      const { left, right } = chevronWings()
      return [gen.linearPath([left, tip, right], opts)]
    }
    case "triangle":
    case "triangle_outline": {
      const { left, right } = chevronWings()
      const o = kind === "triangle" ? filled(opts) : opts
      return [gen.polygon([tip, left, right], o)]
    }
    case "bar": {
      const h = L / 2
      return [
        gen.line(
          tip[0] - h * perp[0],
          tip[1] - h * perp[1],
          tip[0] + h * perp[0],
          tip[1] + h * perp[1],
          opts,
        ),
      ]
    }
    case "dot":
    case "circle": {
      const o = kind === "dot" ? filled(opts) : opts
      return [gen.circle(tip[0], tip[1], 0.6 * L, o)]
    }
    case "cross": {
      const h = L / 2
      const dirs = [angle + Math.PI / 4, angle - Math.PI / 4]
      return dirs.map((a) =>
        gen.line(
          tip[0] - h * Math.cos(a),
          tip[1] - h * Math.sin(a),
          tip[0] + h * Math.cos(a),
          tip[1] + h * Math.sin(a),
          opts,
        ),
      )
    }
    case "diamond": {
      const half = L / 2
      const width = L / 3
      const mid: RoughPoint = [tip[0] - half * dir[0], tip[1] - half * dir[1]]
      const back: RoughPoint = [tip[0] - L * dir[0], tip[1] - L * dir[1]]
      return [
        gen.polygon(
          [
            tip,
            [mid[0] + width * perp[0], mid[1] + width * perp[1]],
            back,
            [mid[0] - width * perp[0], mid[1] - width * perp[1]],
          ],
          filled(opts),
        ),
      ]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS — all arrowheads.test.ts tests green, no other renderer tests broken.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @excalidraw-clone/renderer typecheck` → exit 0.

```bash
git add packages/renderer/src/shapes/arrowheads.ts packages/renderer/test/arrowheads.test.ts
git commit -m "renderer: add arrowheadDrawables — geometry for all 8 arrowhead kinds"
```

---

### Task 2: Wire arrow.ts and line.ts to the module

**Files:**

- Modify: `packages/renderer/src/shapes/arrow.ts` (delete private `arrowhead()` helper + constants; call the module)
- Modify: `packages/renderer/src/shapes/line.ts` (add presence-checked arrowhead blocks)
- Test: `packages/renderer/test/arrowheads.test.ts` (append integration describe-blocks)

**Interfaces:**

- Consumes: `arrowheadDrawables` from `"./arrowheads"` (Task 1).
- Produces: `arrowShape` / `lineShape` behavior relied on by the canvas renderer — no signature changes.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/arrowheads.test.ts`:

```ts
import { newArrow, newLine } from "@excalidraw-clone/scene"
import { arrowShape, lineShape } from "../src/shapes"

const twoPoints = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
]

describe("arrowShape arrowhead kinds", () => {
  it("endArrowhead 'triangle' → polygon at the end tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    const e = { ...newArrow({ x: 0, y: 0 }), points: twoPoints, endArrowhead: "triangle" as const }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]?.[0]).toEqual([100, 0])
  })

  it("startArrowhead 'dot' → circle at the start tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "circle")
    const e = {
      ...newArrow({ x: 0, y: 0 }),
      points: twoPoints,
      startArrowhead: "dot" as const,
      endArrowhead: null,
    }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [cx, cy] = spy.mock.calls[0]!
    expect([cx, cy]).toEqual([0, 0])
  })

  it("default arrow (end 'arrow', start null) → shaft + one chevron", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const e = { ...newArrow({ x: 0, y: 0 }), points: twoPoints }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledTimes(2) // shaft + chevron
  })
})

describe("lineShape arrowheads", () => {
  it("no arrowheads (default) → single linearPath, nothing else", () => {
    const gen = new RoughGenerator()
    const lp = vi.spyOn(gen, "linearPath")
    const l = { ...newLine({ x: 0, y: 0 }), points: twoPoints }
    lineShape(l, gen)
    expect(lp).toHaveBeenCalledOnce()
  })

  it("endArrowhead 'bar' → perpendicular segment at the end tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "line")
    const l = { ...newLine({ x: 0, y: 0 }), points: twoPoints, endArrowhead: "bar" as const }
    lineShape(l, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [x1, , x2] = spy.mock.calls[0]!
    expect(x1).toBeCloseTo(100)
    expect(x2).toBeCloseTo(100)
  })

  it("startArrowhead 'circle' → outline circle at the start tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "circle")
    const l = { ...newLine({ x: 0, y: 0 }), points: twoPoints, startArrowhead: "circle" as const }
    lineShape(l, gen)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[3]?.fill).toBeUndefined()
  })
})
```

Note: `newLine`'s factory defaults both arrowheads to `null`, so the spread-with-override pattern above is type-safe (spread strips `readonly`).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: FAIL — `arrowShape endArrowhead 'triangle'` fails (chevron drawn instead of polygon); `lineShape endArrowhead 'bar'` fails (no `line` call). The default-arrow test may already pass — that is fine; it pins existing behavior.

- [ ] **Step 3: Rewrite arrow.ts and line.ts**

Replace `packages/renderer/src/shapes/arrow.ts` in full:

```ts
import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { arrowheadDrawables } from "./arrowheads"
import { strokeLineDash } from "./stroke-dash"

const arrowOptions = (e: ExcalidrawArrowElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
  strokeLineDash: strokeLineDash(e.strokeStyle),
})

export const arrowShape = (e: ExcalidrawArrowElement, gen: RoughGenerator): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = arrowOptions(e)
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  const drawables: Drawable[] = [gen.linearPath(pts, opts)]
  if (e.endArrowhead) {
    const tip = pts[pts.length - 1]!
    const prev = pts[pts.length - 2]!
    drawables.push(...arrowheadDrawables(e.endArrowhead, tip, prev, gen, opts))
  }
  if (e.startArrowhead) {
    const tip = pts[0]!
    const next = pts[1]!
    drawables.push(...arrowheadDrawables(e.startArrowhead, tip, next, gen, opts))
  }
  return drawables
}
```

Replace `packages/renderer/src/shapes/line.ts` in full:

```ts
import type { ExcalidrawLineElement } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { arrowheadDrawables } from "./arrowheads"
import { strokeLineDash } from "./stroke-dash"

const linearOptions = (e: ExcalidrawLineElement): Options => ({
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  roughness: e.roughness,
  seed: e.seed,
  strokeLineDash: strokeLineDash(e.strokeStyle),
})

export const lineShape = (e: ExcalidrawLineElement, gen: RoughGenerator): readonly Drawable[] => {
  if (e.points.length < 2) return []
  const opts = linearOptions(e)
  const pts: RoughPoint[] = e.points.map((p) => [p.x, p.y])
  const drawables: Drawable[] = [gen.linearPath(pts, opts)]
  if (e.endArrowhead) {
    drawables.push(
      ...arrowheadDrawables(e.endArrowhead, pts[pts.length - 1]!, pts[pts.length - 2]!, gen, opts),
    )
  }
  if (e.startArrowhead) {
    drawables.push(...arrowheadDrawables(e.startArrowhead, pts[0]!, pts[1]!, gen, opts))
  }
  return drawables
}
```

(The old private `arrowhead()` helper and `ARROWHEAD_LENGTH`/`ARROWHEAD_ANGLE` constants in arrow.ts are deleted — they now live in `arrowheads.ts`.)

- [ ] **Step 4: Run the full renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS — new tests green AND all pre-existing tests (shapes-others.test.ts pins arrow/line behavior) still green.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @excalidraw-clone/renderer typecheck` → exit 0.

```bash
git add packages/renderer/src/shapes/arrow.ts packages/renderer/src/shapes/line.ts packages/renderer/test/arrowheads.test.ts
git commit -m "renderer: arrow + line honor all arrowhead kinds via arrowheadDrawables"
```

---

### Task 3: PropertiesPanel Arrowheads section

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`
- Test: `packages/ui/test/PropertiesPanel.test.tsx` (append)

**Interfaces:**

- Consumes: existing `PropertiesPanelProps` (no prop changes), `commonValue`, `Section`; `Arrowhead` type from `@excalidraw-clone/scene`.
- Produces: two button rows with `data-testid` = `arrowhead-start-<kind|none>` / `arrowhead-end-<kind|none>`; clicks emit `onChange({ startArrowhead: … })` / `onChange({ endArrowhead: … })` with an `Arrowhead` or `null`. Task 5's e2e relies on these testids.

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/test/PropertiesPanel.test.tsx` (inside the existing `describe("PropertiesPanel")`; `newArrow`, `newLine` come from `@excalidraw-clone/scene` — extend the existing import):

```ts
it("shows Arrowheads section when all selected are linear", () => {
  const arrow = newArrow({ x: 0, y: 0 })
  const line = newLine({ x: 0, y: 0 })
  render(<PropertiesPanel t={t} selectedElements={[arrow, line]} {...handlers} />)
  expect(screen.getByTestId("arrowhead-end-arrow")).toBeInTheDocument()
  expect(screen.getByTestId("arrowhead-start-none")).toBeInTheDocument()
})

it("hides Arrowheads section when selection includes a non-linear element", () => {
  const arrow = newArrow({ x: 0, y: 0 })
  const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  render(<PropertiesPanel t={t} selectedElements={[arrow, rect]} {...handlers} />)
  expect(screen.queryByTestId("arrowhead-end-arrow")).toBeNull()
})

it("marks the common end arrowhead as pressed (arrow default: end 'arrow')", () => {
  const arrow = newArrow({ x: 0, y: 0 })
  render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} />)
  expect(screen.getByTestId("arrowhead-end-arrow")).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByTestId("arrowhead-start-none")).toHaveAttribute("aria-pressed", "true")
})

it("mixed values → no arrowhead button pressed", () => {
  const a = newArrow({ x: 0, y: 0 }) // end "arrow"
  const l = newLine({ x: 0, y: 0 }) // end null
  render(<PropertiesPanel t={t} selectedElements={[a, l]} {...handlers} />)
  expect(screen.getByTestId("arrowhead-end-arrow")).toHaveAttribute("aria-pressed", "false")
  expect(screen.getByTestId("arrowhead-end-none")).toHaveAttribute("aria-pressed", "false")
})

it("emits onChange({ startArrowhead: 'dot' }) when a start kind is clicked", async () => {
  const arrow = newArrow({ x: 0, y: 0 })
  const onChange = vi.fn()
  render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} onChange={onChange} />)
  await userEvent.click(screen.getByTestId("arrowhead-start-dot"))
  expect(onChange).toHaveBeenCalledWith({ startArrowhead: "dot" })
})

it("emits onChange({ endArrowhead: null }) when end None is clicked", async () => {
  const arrow = newArrow({ x: 0, y: 0 })
  const onChange = vi.fn()
  render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} onChange={onChange} />)
  await userEvent.click(screen.getByTestId("arrowhead-end-none"))
  expect(onChange).toHaveBeenCalledWith({ endArrowhead: null })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: FAIL — `Unable to find an element by: [data-testid="arrowhead-end-arrow"]` etc.

- [ ] **Step 3: Implement the section**

In `packages/ui/src/PropertiesPanel.tsx`:

(a) Extend the scene type import with `Arrowhead`:

```ts
import type {
  AlignEdge,
  Arrowhead,
  DistributeAxis,
  ExcalidrawElement,
  FillStyle,
  Roundness,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"
```

(b) Add module-level constants next to `STROKE_STYLES` etc.:

```ts
const ARROWHEAD_KINDS: readonly (Arrowhead | null)[] = [
  null,
  "arrow",
  "triangle",
  "triangle_outline",
  "bar",
  "dot",
  "circle",
  "cross",
  "diamond",
]
```

(c) Add a glyph component near `Swatch` at the bottom of the file (16×16 inline SVGs, shaft + head pointing right, `currentColor`):

```tsx
function ArrowheadGlyph({ kind }: { kind: Arrowhead | null }): React.ReactElement {
  const head = (() => {
    switch (kind) {
      case "arrow":
        return <path d="M9 4 L14 8 L9 12" fill="none" />
      case "triangle":
        return <path d="M14 8 L8 4.5 L8 11.5 Z" fill="currentColor" />
      case "triangle_outline":
        return <path d="M14 8 L8 4.5 L8 11.5 Z" fill="none" />
      case "bar":
        return <path d="M13 3.5 L13 12.5" fill="none" />
      case "dot":
        return <circle cx="12" cy="8" r="3" fill="currentColor" stroke="none" />
      case "circle":
        return <circle cx="12" cy="8" r="3" fill="none" />
      case "cross":
        return <path d="M9.5 5 L14.5 11 M14.5 5 L9.5 11" fill="none" />
      case "diamond":
        return <path d="M14 8 L11 5 L8 8 L11 11 Z" fill="currentColor" />
      default:
        return null
    }
  })()
  const shaftEnd = kind === null ? 14 : 9
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={`M2 8 L${shaftEnd} 8`} fill="none" />
      {head}
    </svg>
  )
}
```

(d) Compute gating + common values with the other `commonValue` calls (after `roundness`):

```ts
const allLinear =
  selectedElements.length > 0 &&
  selectedElements.every((e) => e.type === "arrow" || e.type === "line")
const startArrowhead = commonValue<Arrowhead | null>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "startArrowhead",
)
const endArrowhead = commonValue<Arrowhead | null>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "endArrowhead",
)
```

(e) Add the section in the JSX between the `fillStyle` and `roundness` sections:

```tsx
{
  allLinear && (
    <Section label={t("properties.arrowheads")}>
      {(
        [
          ["start", "startArrowhead", startArrowhead],
          ["end", "endArrowhead", endArrowhead],
        ] as const
      ).map(([end, field, value]) => (
        <div key={end} className="mb-1 flex items-center gap-1">
          <span className="w-8 text-[10px] text-gray-500">
            {t(`properties.arrowhead${end === "start" ? "Start" : "End"}`)}
          </span>
          <div className="flex flex-1 flex-wrap gap-0.5">
            {ARROWHEAD_KINDS.map((kind) => (
              <button
                key={kind ?? "none"}
                type="button"
                data-testid={`arrowhead-${end}-${kind ?? "none"}`}
                aria-pressed={value === kind}
                aria-label={t(`properties.arrowhead_${kind ?? "none"}`)}
                title={t(`properties.arrowhead_${kind ?? "none"}`)}
                onClick={() => onChange({ [field]: kind } as Partial<ExcalidrawElement>)}
                className={`flex h-6 w-6 items-center justify-center rounded border ${value === kind ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
              >
                <ArrowheadGlyph kind={kind} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}
```

Note on `aria-pressed={value === kind}`: `commonValue` returns `undefined` for mixed selections, so no button (including None, whose `kind` is `null`) is pressed — `undefined === null` is `false`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS — all PropertiesPanel tests green (new + pre-existing).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @excalidraw-clone/ui typecheck` → exit 0.

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx
git commit -m "ui: add Arrowheads start/end picker section to PropertiesPanel"
```

---

### Task 4: i18n strings (en, ko)

**Files:**

- Modify: `apps/web/src/locales/en/common.json`
- Modify: `apps/web/src/locales/ko/common.json`

**Interfaces:**

- Consumes: key names emitted by Task 3 (`properties.arrowheads`, `properties.arrowheadStart`, `properties.arrowheadEnd`, `properties.arrowhead_none`, `properties.arrowhead_<kind>` × 8).
- Produces: translated labels; no code contracts.

- [ ] **Step 1: Add the keys**

In `apps/web/src/locales/en/common.json`, inside the `"properties"` object (after the `"ungroup"` key, matching existing flat style):

```json
"arrowheads": "Arrowheads",
"arrowheadStart": "Start",
"arrowheadEnd": "End",
"arrowhead_none": "None",
"arrowhead_arrow": "Arrow",
"arrowhead_triangle": "Triangle",
"arrowhead_triangle_outline": "Triangle (outline)",
"arrowhead_bar": "Bar",
"arrowhead_dot": "Dot",
"arrowhead_circle": "Circle",
"arrowhead_cross": "Cross",
"arrowhead_diamond": "Diamond"
```

In `apps/web/src/locales/ko/common.json`, same position:

```json
"arrowheads": "화살촉",
"arrowheadStart": "시작",
"arrowheadEnd": "끝",
"arrowhead_none": "없음",
"arrowhead_arrow": "화살표",
"arrowhead_triangle": "삼각형",
"arrowhead_triangle_outline": "삼각형(윤곽)",
"arrowhead_bar": "바",
"arrowhead_dot": "점",
"arrowhead_circle": "원",
"arrowhead_cross": "십자",
"arrowhead_diamond": "마름모"
```

- [ ] **Step 2: Verify web tests + typecheck still pass**

Run: `pnpm --filter @excalidraw-clone/web test && pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS (JSON validity + no key-collision failures).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: arrowhead picker i18n strings (en, ko)"
```

---

### Task 5: e2e + full gate

**Files:**

- Create: `apps/web/e2e/arrowheads.spec.ts`

**Interfaces:**

- Consumes: `data-testid="arrowhead-start-dot"` button from Task 3; toolbar testids `toolbar-arrow` / `toolbar-selection`; `dragOnCanvas` helper from `./_helpers`; persistence key `excalidraw-scene`.
- Produces: nothing downstream — final task.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/arrowheads.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  startArrowhead?: string | null
  endArrowhead?: string | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

test("picking a start arrowhead persists it; end keeps the default", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })

  // Draw one arrow.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 260, y: 100 })
  await page.waitForTimeout(120)

  // Marquee-select it.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 130 })
  await page.waitForTimeout(150)

  // Pick "dot" as the start arrowhead.
  await page.locator('[data-testid="arrowhead-start-dot"]').click()
  await page.waitForTimeout(150)

  const arrows = (await readScene(page)).filter((e) => e.type === "arrow")
  expect(arrows).toHaveLength(1)
  expect(arrows[0]!.startArrowhead).toBe("dot")
  expect(arrows[0]!.endArrowhead).toBe("arrow")

  // Strip the end arrowhead via None.
  await page.locator('[data-testid="arrowhead-end-none"]').click()
  await page.waitForTimeout(150)
  const after = (await readScene(page)).filter((e) => e.type === "arrow")
  expect(after[0]!.endArrowhead).toBeNull()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS — all specs including arrowheads.spec.ts (20 total: 19 existing + 1 new). If the marquee-select does not select the arrow (panel absent), check the drag rectangle fully encloses the arrow's bounding box before touching the implementation.

- [ ] **Step 3: Run the full monorepo gate**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all four exit 0, 13/13 packages (build 7/7).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/arrowheads.spec.ts
git commit -m "web: e2e — arrowhead picker persists start/end kinds"
```
