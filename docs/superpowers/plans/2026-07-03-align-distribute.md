# Align & Distribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Arrange section to the PropertiesPanel that aligns (6-way) and distributes (2-axis) a multi-selection of elements.

**Architecture:** Pure geometry (`alignElements`/`distributeElements`) in the scene package returns `{id,x,y}` position patches; thin `onAlign`/`onDistribute` handlers in `App.tsx` apply them through `scene.mutate` (same shape as the existing z-order handlers); a conditional Arrange `<Section>` in `PropertiesPanel` renders the buttons, gated on selection size.

**Tech Stack:** TypeScript, React, Zustand, Vitest (unit), @testing-library/react (UI unit), Playwright (e2e), pnpm + Turbo monorepo.

## Global Constraints

- Node `>=22.0.0`, pnpm `>=10.0.0` (root `package.json` engines).
- Scene package is framework-free: no React, no DOM. Only depends on `@excalidraw-clone/geometry`.
- `apps/web` has **no** `@testing-library` — React component unit tests live in `packages/ui/test/`.
- `getElementBounds(el)` returns rotation-aware axis-aligned `Bounds = { x, y, width, height }`.
- Linear point coords are **relative** to the element's `x`/`y`; translating an element = changing only `x`/`y`.
- `scene.mutate((draft) => …)` runs `reconcileBoundText` + `reconcileBindings` after every mutation; bound arrows reflow to their targets (expected).
- Scope: **align + distribute only**. No grouping, no z-order (already ships), no keyboard shortcuts, no drag-time guides.
- Test style: scene tests `import { describe, expect, it } from "vitest"`, import from `../src/...`; UI tests use `render/screen` + `userEvent`, `const t = (key: string): string => key`.
- Panel/button styling: reuse the existing `Section` component and `rounded border border-gray-300 p-1 text-xs` button classes; no new icon library.

---

### Task 1: Arrange geometry (scene)

**Files:**

- Create: `packages/scene/src/arrange.ts`
- Create: `packages/scene/test/arrange.test.ts`
- Modify: `packages/scene/src/index.ts` (add exports)

**Interfaces:**

- Consumes: `getElementBounds` from `./bounds`; `ExcalidrawElement` from `./types`.
- Produces:
  - `type AlignEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"`
  - `type DistributeAxis = "horizontal" | "vertical"`
  - `interface PositionPatch { id: string; x: number; y: number }`
  - `alignElements(elements: readonly ExcalidrawElement[], edge: AlignEdge): PositionPatch[]` — one patch per element; `[]` when `< 2` elements.
  - `distributeElements(elements: readonly ExcalidrawElement[], axis: DistributeAxis): PositionPatch[]` — patches for interior elements only (first/last unchanged); `[]` when `< 3` elements.

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/arrange.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { alignElements, distributeElements } from "../src/arrange"

const rect = (x: number, y: number, w: number, h: number) => ({
  ...newRectangle({ x, y, width: w, height: h }),
})

describe("alignElements", () => {
  const a = rect(0, 0, 10, 10) // bounds x 0..10,  y 0..10
  const b = rect(100, 50, 20, 20) // bounds x 100..120, y 50..70

  const patchFor = (edge: Parameters<typeof alignElements>[1], id: string) =>
    alignElements([a, b], edge).find((p) => p.id === id)!

  it("returns [] for fewer than 2 elements", () => {
    expect(alignElements([a], "left")).toEqual([])
    expect(alignElements([], "left")).toEqual([])
  })

  it("left aligns every element's left edge to the group min-x", () => {
    expect(patchFor("left", a.id).x).toBe(0)
    expect(patchFor("left", b.id).x).toBe(0)
  })

  it("right aligns every element's right edge to the group max-x", () => {
    expect(patchFor("right", a.id).x).toBe(110) // 120 - 10
    expect(patchFor("right", b.id).x).toBe(100) // 120 - 20
  })

  it("centerX aligns every element's center to the group center-x", () => {
    // group center-x = (0 + 120) / 2 = 60
    expect(patchFor("centerX", a.id).x).toBe(55) // 60 - 5
    expect(patchFor("centerX", b.id).x).toBe(50) // 60 - 10
  })

  it("top aligns every element's top edge to the group min-y", () => {
    expect(patchFor("top", a.id).y).toBe(0)
    expect(patchFor("top", b.id).y).toBe(0)
  })
})

describe("distributeElements", () => {
  it("returns [] for fewer than 3 elements", () => {
    expect(distributeElements([rect(0, 0, 10, 10), rect(50, 0, 10, 10)], "horizontal")).toEqual([])
  })

  it("gives equal edge-to-edge gaps horizontally, moving only the interior", () => {
    const first = rect(0, 0, 10, 10) // right edge 10
    const mid = rect(30, 0, 10, 10)
    const last = rect(100, 0, 10, 10) // left edge 100
    const patches = distributeElements([first, mid, last], "horizontal")
    // gap = (100 - 10 - 10) / 2 = 40; mid left edge -> 10 + 40 = 50
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(mid.id)
    expect(patches[0]!.x).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test arrange`
Expected: FAIL — cannot resolve `../src/arrange`.

- [ ] **Step 3: Write the implementation**

Create `packages/scene/src/arrange.ts`:

```ts
import { getElementBounds } from "./bounds"
import type { ExcalidrawElement } from "./types"

export type AlignEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"
export type DistributeAxis = "horizontal" | "vertical"

export interface PositionPatch {
  id: string
  x: number
  y: number
}

export function alignElements(
  elements: readonly ExcalidrawElement[],
  edge: AlignEdge,
): PositionPatch[] {
  if (elements.length < 2) return []
  const items = elements.map((el) => ({ el, b: getElementBounds(el) }))
  const minX = Math.min(...items.map(({ b }) => b.x))
  const maxX = Math.max(...items.map(({ b }) => b.x + b.width))
  const minY = Math.min(...items.map(({ b }) => b.y))
  const maxY = Math.max(...items.map(({ b }) => b.y + b.height))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return items.map(({ el, b }) => {
    let { x, y } = el
    switch (edge) {
      case "left":
        x = el.x + (minX - b.x)
        break
      case "right":
        x = el.x + (maxX - b.width - b.x)
        break
      case "centerX":
        x = el.x + (centerX - b.width / 2 - b.x)
        break
      case "top":
        y = el.y + (minY - b.y)
        break
      case "bottom":
        y = el.y + (maxY - b.height - b.y)
        break
      case "centerY":
        y = el.y + (centerY - b.height / 2 - b.y)
        break
    }
    return { id: el.id, x, y }
  })
}

export function distributeElements(
  elements: readonly ExcalidrawElement[],
  axis: DistributeAxis,
): PositionPatch[] {
  if (elements.length < 3) return []
  const horizontal = axis === "horizontal"
  const items = elements
    .map((el) => {
      const b = getElementBounds(el)
      return { el, start: horizontal ? b.x : b.y, size: horizontal ? b.width : b.height }
    })
    .sort((p, q) => p.start - q.start)

  const first = items[0]!
  const last = items[items.length - 1]!
  const spanStart = first.start + first.size // inner (right/bottom) edge of first
  const spanEnd = last.start // inner (left/top) edge of last
  const interiorSize = items.slice(1, -1).reduce((sum, it) => sum + it.size, 0)
  const gap = (spanEnd - spanStart - interiorSize) / (items.length - 1)

  const patches: PositionPatch[] = []
  let cursor = spanStart
  for (let i = 1; i < items.length - 1; i += 1) {
    cursor += gap
    const it = items[i]!
    const delta = cursor - it.start
    patches.push({
      id: it.el.id,
      x: horizontal ? it.el.x + delta : it.el.x,
      y: horizontal ? it.el.y : it.el.y + delta,
    })
    cursor += it.size
  }
  return patches
}
```

- [ ] **Step 4: Add the exports**

In `packages/scene/src/index.ts`, after the `export { BUILTIN_TEMPLATES } from "./templates"` line, add:

```ts
export { alignElements, distributeElements } from "./arrange"
export type { AlignEdge, DistributeAxis, PositionPatch } from "./arrange"
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter @excalidraw-clone/scene test arrange && pnpm --filter @excalidraw-clone/scene typecheck`
Expected: PASS — 6 tests; typecheck no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/arrange.ts packages/scene/test/arrange.test.ts packages/scene/src/index.ts
git commit -m "scene: add alignElements + distributeElements geometry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Arrange section (ui) + app wiring

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx` (props interface; new section before the Layers section at line ~206)
- Modify: `packages/ui/test/PropertiesPanel.test.tsx` (add `onAlign`/`onDistribute` to shared `handlers`; add new cases)
- Modify: `apps/web/src/components/App.tsx` (import + two handler props on `<PropertiesPanel>`)

**Interfaces:**

- Consumes: `alignElements`, `distributeElements`, `AlignEdge`, `DistributeAxis` from `@excalidraw-clone/scene` (Task 1).
- Produces: `PropertiesPanelProps` gains `onAlign: (edge: AlignEdge) => void` and `onDistribute: (axis: DistributeAxis) => void`. Arrange section renders only when `selectedElements.length >= 2`; distribute buttons disabled when `< 3`. Testids: `align-left`, `align-centerX`, `align-right`, `align-top`, `align-centerY`, `align-bottom`, `distribute-horizontal`, `distribute-vertical`.

- [ ] **Step 1: Write the failing UI tests**

In `packages/ui/test/PropertiesPanel.test.tsx`, add `onAlign`/`onDistribute` to the shared `handlers` object (so existing renders still typecheck):

```ts
const handlers = {
  onChange: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onSendToBack: noop,
  onSendBackward: noop,
  onBringForward: noop,
  onBringToFront: noop,
  onAlign: noop,
  onDistribute: noop,
}
```

Then append these cases inside the `describe("PropertiesPanel", …)` block:

```ts
  it("hides the Arrange section when fewer than 2 elements are selected", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.queryByTestId("align-left")).toBeNull()
  })

  it("shows the Arrange section when 2+ elements are selected", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("align-left")).toBeInTheDocument()
  })

  it("calls onAlign with the edge when an align button is clicked", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    const onAlign = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} onAlign={onAlign} />)
    await userEvent.click(screen.getByTestId("align-centerX"))
    expect(onAlign).toHaveBeenCalledWith("centerX")
  })

  it("disables distribute with 2 selected and enables + fires it with 3", async () => {
    const mk = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })
    const onDistribute = vi.fn()
    const { rerender } = render(
      <PropertiesPanel t={t} selectedElements={[mk(0), mk(50)]} {...handlers} onDistribute={onDistribute} />,
    )
    expect(screen.getByTestId("distribute-horizontal")).toBeDisabled()
    rerender(
      <PropertiesPanel t={t} selectedElements={[mk(0), mk(50), mk(100)]} {...handlers} onDistribute={onDistribute} />,
    )
    const btn = screen.getByTestId("distribute-horizontal")
    expect(btn).toBeEnabled()
    await userEvent.click(btn)
    expect(onDistribute).toHaveBeenCalledWith("horizontal")
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test PropertiesPanel`
Expected: FAIL — `align-left` not found / `onAlign` type error.

- [ ] **Step 3: Extend PropertiesPanel props**

In `packages/ui/src/PropertiesPanel.tsx`, change the imports at the top from:

```tsx
import type {
  ExcalidrawElement,
  FillStyle,
  Roundness,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"
```

to:

```tsx
import type {
  AlignEdge,
  DistributeAxis,
  ExcalidrawElement,
  FillStyle,
  Roundness,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"
```

Add two props to `PropertiesPanelProps` (after `onBringToFront`):

```tsx
  onBringToFront: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
  className?: string
```

Add them to the destructured params in the function signature (after `onBringToFront,`):

```tsx
  onBringToFront,
  onAlign,
  onDistribute,
  className,
```

- [ ] **Step 4: Add the Arrange section markup**

In `packages/ui/src/PropertiesPanel.tsx`, immediately **before** the `<Section label={t("properties.layers")}>` block (line ~206), insert:

```tsx
{
  selectedElements.length >= 2 && (
    <Section label={t("properties.arrange")}>
      <div className="grid grid-cols-3 gap-1">
        {(["left", "centerX", "right", "top", "centerY", "bottom"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            data-testid={`align-${edge}`}
            aria-label={t(`properties.align_${edge}`)}
            onClick={() => onAlign(edge)}
            className="rounded border border-gray-300 p-1 text-xs"
          >
            {ALIGN_GLYPH[edge]}
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {(["horizontal", "vertical"] as const).map((axis) => (
          <button
            key={axis}
            type="button"
            data-testid={`distribute-${axis}`}
            aria-label={t(`properties.distribute_${axis}`)}
            disabled={selectedElements.length < 3}
            onClick={() => onDistribute(axis)}
            className="flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
          >
            {axis === "horizontal" ? "⇿" : "⇳"}
          </button>
        ))}
      </div>
    </Section>
  )
}
```

Then add the glyph map near the top of the file, right after the `OPACITY_STEPS` constant (line ~14):

```tsx
const ALIGN_GLYPH: Record<AlignEdge, string> = {
  left: "⇤",
  centerX: "↔",
  right: "⇥",
  top: "⤒",
  centerY: "↕",
  bottom: "⤓",
}
```

- [ ] **Step 5: Wire the handlers in App.tsx**

In `apps/web/src/components/App.tsx`, add to the `@excalidraw-clone/scene` import block:

```ts
import {
  alignElements,
  BUILTIN_TEMPLATES,
  distributeElements,
  type ExcalidrawElement,
  type LibraryItem,
  normalizeToOrigin,
  Scene,
} from "@excalidraw-clone/scene"
```

Then, in the `<PropertiesPanel …>` element, after the `onBringToFront={…}` prop (before the closing `/>`), add:

```tsx
              onAlign={(edge) => {
                const byId = new Map(
                  alignElements(selectedElements, edge).map((p) => [p.id, p]),
                )
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = { ...draft[i]!, x: p.x, y: p.y }
                  }
                })
              }}
              onDistribute={(axis) => {
                const byId = new Map(
                  distributeElements(selectedElements, axis).map((p) => [p.id, p]),
                )
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    const p = byId.get(draft[i]!.id)
                    if (p) draft[i] = { ...draft[i]!, x: p.x, y: p.y }
                  }
                })
              }}
```

- [ ] **Step 6: Run UI tests + typecheck (ui + web)**

Run: `pnpm --filter @excalidraw-clone/ui test PropertiesPanel && pnpm --filter @excalidraw-clone/ui typecheck && pnpm --filter web typecheck`
Expected: PASS — all PropertiesPanel tests; both typechecks clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/components/App.tsx
git commit -m "ui: add Arrange (align + distribute) section to PropertiesPanel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: i18n strings (web)

**Files:**

- Modify: `apps/web/src/locales/en/common.json` (`properties` block, ends line ~42)
- Modify: `apps/web/src/locales/ko/common.json` (`properties` block)

**Interfaces:**

- Consumes: the `t("properties.arrange")`, `t("properties.align_<edge>")`, `t("properties.distribute_<axis>")` keys referenced in Task 2.
- Produces: nine new keys per locale.

- [ ] **Step 1: Add en strings**

In `apps/web/src/locales/en/common.json`, change the end of the `"properties"` block from:

```json
    "bringToFront": "Bring to front"
  },
```

to:

```json
    "bringToFront": "Bring to front",
    "arrange": "Arrange",
    "align_left": "Align left",
    "align_centerX": "Align center horizontal",
    "align_right": "Align right",
    "align_top": "Align top",
    "align_centerY": "Align center vertical",
    "align_bottom": "Align bottom",
    "distribute_horizontal": "Distribute horizontally",
    "distribute_vertical": "Distribute vertically"
  },
```

- [ ] **Step 2: Add ko strings**

In `apps/web/src/locales/ko/common.json`, change the end of the `"properties"` block from:

```json
    "bringToFront": "맨 앞으로"
  },
```

to:

```json
    "bringToFront": "맨 앞으로",
    "arrange": "정렬",
    "align_left": "왼쪽 정렬",
    "align_centerX": "가로 가운데 정렬",
    "align_right": "오른쪽 정렬",
    "align_top": "위쪽 정렬",
    "align_centerY": "세로 가운데 정렬",
    "align_bottom": "아래쪽 정렬",
    "distribute_horizontal": "가로로 분배",
    "distribute_vertical": "세로로 분배"
  },
```

- [ ] **Step 3: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: add Arrange (align/distribute) i18n strings (en, ko)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end + full gate

**Files:**

- Create: `apps/web/e2e/align-distribute.spec.ts`

**Interfaces:**

- Consumes: the full stack from Tasks 1-3. Uses `dragOnCanvas` from `./_helpers`, the `align-top` testid, the selection toolbar button, and the persisted `excalidraw-scene` localStorage key.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/align-distribute.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = { id: string; type: string; x: number; y: number; isDeleted?: boolean }

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

test("align top makes selected rectangles share a top edge", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Three rectangles at different heights.
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 120 }, { x: 160, y: 180 })
  await draw({ x: 220, y: 220 }, { x: 280, y: 300 })
  await draw({ x: 340, y: 160 }, { x: 400, y: 220 })

  // Marquee-select all three.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 90 }, { x: 430, y: 330 })
  await page.waitForTimeout(150)

  // Align their tops.
  await page.locator('[data-testid="align-top"]').click()
  await page.waitForTimeout(300)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(3)
  const tops = rects.map((r) => r.y)
  const minTop = Math.min(...tops)
  for (const top of tops) {
    expect(Math.abs(top - minTop)).toBeLessThan(1)
  }
})
```

- [ ] **Step 2: Run the e2e test**

Run: `pnpm --filter web e2e align-distribute`
Expected: PASS — 1 test. (Rectangles are unrotated axis-aligned boxes, so `y` equals the top edge.)

- [ ] **Step 3: Full monorepo gate**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all green (typecheck 13/13, test 13/13, lint 13/13, build 7/7).

- [ ] **Step 4: Full e2e suite**

Run: `pnpm --filter web e2e`
Expected: all specs pass (existing 17 + new align-distribute spec).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/align-distribute.spec.ts
git commit -m "web: e2e — align top shares a top edge across selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** align 6-way + `<2` no-op (Task 1) ✓; distribute 2-axis, equal gaps, `<3` no-op, interior-only (Task 1) ✓; Arrange section gated at ≥2, distribute disabled `<3`, testids, aria-labels (Task 2) ✓; App handlers via `scene.mutate` mirroring z-order (Task 2) ✓; i18n en+ko (Task 3) ✓; e2e marquee→align-top→equal tops (Task 4) ✓. Testing strategy (scene unit, ui unit, e2e) all present.
- **Type consistency:** `AlignEdge`/`DistributeAxis`/`PositionPatch` defined in Task 1, imported unchanged in Tasks 2. `onAlign(edge)`/`onDistribute(axis)` signatures identical across PropertiesPanel props (Task 2), App wiring (Task 2), and tests. Testids `align-<edge>`/`distribute-<axis>` consistent across Tasks 2 and 4.
- **Green commits:** Task 2 bundles the App.tsx wiring with the required-prop addition so `pnpm --filter web typecheck` stays green at that commit; i18n (Task 3) is non-typechecked copy; labels render as keys until Task 3 but e2e keys off testids, not labels.
- **Scope guards honored:** align + distribute only; no grouping, z-order, shortcuts, or drag guides; only `x`/`y` touched.
