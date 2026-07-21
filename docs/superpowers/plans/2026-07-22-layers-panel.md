# Elements/Layers Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable left-side Layers Panel that lists every scene element in z-order with per-row reorder buttons and two-way canvas selection sync, backed by new pure z-order utilities extracted from `App.tsx`.

**Architecture:** Extract the four reorder operations (`sendToBack`/`sendBackward`/`bringForward`/`bringToFront`) from inline `App.tsx` lambdas into pure functions in `packages/scene/src/z-order.ts`. Build a new props-driven `LayersPanel` component in `packages/ui` (same convention as `LibraryPanel`/`PropertiesPanel` — no internal store). Remove the now-redundant "Layers" section from `PropertiesPanel`. Wire everything together in `App.tsx`.

**Tech Stack:** TypeScript, React, Zustand (`useAppStore`), Vitest (unit + component tests), Playwright (e2e), Tailwind CSS, react-i18next.

## Global Constraints

- Follow existing monorepo package boundaries: pure scene logic in `packages/scene`, dumb UI components in `packages/ui`, wiring/state in `apps/web`.
- No new dependencies.
- Match existing Tailwind utility-class style seen in `LibraryPanel.tsx`/`PropertiesPanel.tsx` (no custom CSS files).
- Every new/changed user-facing string goes through `t(...)` with both `en` and `ko` locale entries added.
- `pnpm --filter <pkg> typecheck` and `pnpm --filter <pkg> test` must pass for every touched package before each commit.
- Design source of truth: `docs/superpowers/specs/2026-07-22-layers-panel-design.md`.

---

### Task 1: Extract z-order utilities into `packages/scene`

**Files:**

- Create: `packages/scene/src/z-order.ts`
- Create: `packages/scene/test/z-order.test.ts`
- Modify: `packages/scene/src/index.ts`

**Interfaces:**

- Produces: `sendToBack(elements: readonly ExcalidrawElement[], selectedIds: readonly string[]): ExcalidrawElement[]`, `bringToFront(...)`, `sendBackward(...)`, `bringForward(...)` — all exported from `@excalidraw-clone/scene`. Later tasks (Task 4) call these directly.

- [ ] **Step 1: Write the failing tests**

Create `packages/scene/test/z-order.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { bringForward, bringToFront, sendBackward, sendToBack } from "../src/z-order"

const rect = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })

describe("sendToBack", () => {
  it("moves a single selected element to the front of the array (visual back)", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendToBack([a, b, c, d], [c.id])
    expect(result.map((e) => e.id)).toEqual([c.id, a.id, b.id, d.id])
  })

  it("moves multiple selected elements together, preserving their relative order", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendToBack([a, b, c, d], [b.id, c.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, a.id, d.id])
  })

  it("no-ops on an empty selection", () => {
    const a = rect(0)
    const b = rect(20)
    expect(sendToBack([a, b], []).map((e) => e.id)).toEqual([a.id, b.id])
  })
})

describe("bringToFront", () => {
  it("moves a single selected element to the end of the array (visual front)", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringToFront([a, b, c, d], [a.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, d.id, a.id])
  })

  it("moves multiple selected elements together, preserving their relative order", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringToFront([a, b, c, d], [a.id, b.id])
    expect(result.map((e) => e.id)).toEqual([c.id, d.id, a.id, b.id])
  })
})

describe("sendBackward", () => {
  it("swaps a selected element with its unselected left neighbor", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendBackward([a, b, c, d], [c.id])
    expect(result.map((e) => e.id)).toEqual([a.id, c.id, b.id, d.id])
  })

  it("moves an adjacent selected pair back together without swapping past each other", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendBackward([a, b, c, d], [b.id, c.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, a.id, d.id])
  })

  it("no-ops when the selected element is already at the back", () => {
    const a = rect(0)
    const b = rect(20)
    expect(sendBackward([a, b], [a.id]).map((e) => e.id)).toEqual([a.id, b.id])
  })
})

describe("bringForward", () => {
  it("swaps a selected element with its unselected right neighbor", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringForward([a, b, c, d], [a.id])
    expect(result.map((e) => e.id)).toEqual([b.id, a.id, c.id, d.id])
  })

  it("moves an adjacent selected pair forward together without swapping past each other", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringForward([a, b, c, d], [a.id, b.id])
    expect(result.map((e) => e.id)).toEqual([c.id, a.id, b.id, d.id])
  })

  it("no-ops when the selected element is already at the front", () => {
    const a = rect(0)
    const b = rect(20)
    expect(bringForward([a, b], [b.id]).map((e) => e.id)).toEqual([a.id, b.id])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: FAIL — `Cannot find module '../src/z-order'` (or similar resolution error), since the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `packages/scene/src/z-order.ts`:

```ts
import type { ExcalidrawElement } from "./types"

/** Moves matched elements to the front of the array (rendered first = visual back). */
export function sendToBack(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const moved = elements.filter((e) => selectedIds.includes(e.id))
  const remaining = elements.filter((e) => !selectedIds.includes(e.id))
  return [...moved, ...remaining]
}

/** Moves matched elements to the end of the array (rendered last = visual front). */
export function bringToFront(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const moved = elements.filter((e) => selectedIds.includes(e.id))
  const remaining = elements.filter((e) => !selectedIds.includes(e.id))
  return [...remaining, ...moved]
}

/** Swaps each matched element with its left neighbor, skipping neighbors that are also matched. */
export function sendBackward(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const result = [...elements]
  for (let i = 1; i < result.length; i += 1) {
    if (selectedIds.includes(result[i]!.id) && !selectedIds.includes(result[i - 1]!.id)) {
      ;[result[i - 1], result[i]] = [result[i]!, result[i - 1]!]
    }
  }
  return result
}

/** Swaps each matched element with its right neighbor, skipping neighbors that are also matched. */
export function bringForward(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): ExcalidrawElement[] {
  const result = [...elements]
  for (let i = result.length - 2; i >= 0; i -= 1) {
    if (selectedIds.includes(result[i]!.id) && !selectedIds.includes(result[i + 1]!.id)) {
      ;[result[i + 1], result[i]] = [result[i]!, result[i + 1]!]
    }
  }
  return result
}
```

Modify `packages/scene/src/index.ts` — add this line after the `export { lockElements, unlockAll } from "./locking"` line:

```ts
export { bringForward, bringToFront, sendBackward, sendToBack } from "./z-order"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS — all `z-order.test.ts` cases green.

Run: `pnpm --filter @excalidraw-clone/scene typecheck`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/z-order.ts packages/scene/test/z-order.test.ts packages/scene/src/index.ts
git commit -m "scene: extract z-order reorder utilities"
```

---

### Task 2: Build the `LayersPanel` component

**Files:**

- Create: `packages/ui/src/LayersPanel.tsx`
- Create: `packages/ui/test/LayersPanel.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**

- Consumes: `ExcalidrawElement` from `@excalidraw-clone/scene` (types only); `iconHTML` from `./shared/icons` (existing, already covers all 12 `ElementType` values).
- Produces: `LayersPanel` component and `LayersPanelProps` type, exported from `@excalidraw-clone/ui`. Task 4 renders it with real handlers.
  - `onSelect: (id: string, opts: { additive: boolean }) => void`
  - `onSendToBack: (id: string) => void`, `onSendBackward`, `onBringForward`, `onBringToFront`: same shape, scoped to one element id each.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/LayersPanel.test.tsx`:

```tsx
import { newEllipse, newRectangle } from "@excalidraw-clone/scene"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LayersPanel } from "../src/LayersPanel"

const t = (key: string): string => key

const handlers = {
  onToggle: vi.fn(),
  onSelect: vi.fn(),
  onSendToBack: vi.fn(),
  onSendBackward: vi.fn(),
  onBringForward: vi.fn(),
  onBringToFront: vi.fn(),
}

describe("LayersPanel", () => {
  it("shows only the toggle button when closed", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a]} selectedIds={[]} open={false} {...handlers} />)
    expect(screen.queryByTestId(`layer-row-${a.id}`)).toBeNull()
    expect(screen.getByTestId("layers-toggle")).toBeInTheDocument()
  })

  it("renders rows in reverse scene order (front-most element first)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newEllipse({ x: 20, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a, b]} selectedIds={[]} open {...handlers} />)
    const rows = screen.getAllByTestId(/^layer-row-/)
    expect(rows.map((r) => r.dataset.testid)).toEqual([`layer-row-${b.id}`, `layer-row-${a.id}`])
  })

  it("excludes deleted elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), isDeleted: true }
    render(<LayersPanel t={t} elements={[a, dead]} selectedIds={[]} open {...handlers} />)
    expect(screen.queryByTestId(`layer-row-${dead.id}`)).toBeNull()
  })

  it("highlights rows present in selectedIds", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a]} selectedIds={[a.id]} open {...handlers} />)
    expect(screen.getByTestId(`layer-row-${a.id}`).className).toContain("bg-violet-100")
  })

  it("calls onSelect with additive:false on a plain click", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onSelect = vi.fn()
    render(
      <LayersPanel t={t} elements={[a]} selectedIds={[]} open {...handlers} onSelect={onSelect} />,
    )
    await userEvent.click(screen.getByTestId(`layer-select-${a.id}`))
    expect(onSelect).toHaveBeenCalledWith(a.id, { additive: false })
  })

  it("calls onSelect with additive:true on a shift-click", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onSelect = vi.fn()
    render(
      <LayersPanel t={t} elements={[a]} selectedIds={[]} open {...handlers} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByTestId(`layer-select-${a.id}`), { shiftKey: true })
    expect(onSelect).toHaveBeenCalledWith(a.id, { additive: true })
  })

  it("calls the matching reorder callback with the row's id", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onBringToFront = vi.fn()
    render(
      <LayersPanel
        t={t}
        elements={[a]}
        selectedIds={[]}
        open
        {...handlers}
        onBringToFront={onBringToFront}
      />,
    )
    await userEvent.click(screen.getByTestId(`layer-bring-to-front-${a.id}`))
    expect(onBringToFront).toHaveBeenCalledWith(a.id)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: FAIL — `Cannot find module '../src/LayersPanel'`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/LayersPanel.tsx`:

```tsx
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { iconHTML } from "./shared/icons"

export interface LayersPanelProps {
  t: (key: string) => string
  elements: readonly ExcalidrawElement[]
  selectedIds: readonly string[]
  open: boolean
  onToggle: () => void
  onSelect: (id: string, opts: { additive: boolean }) => void
  onSendToBack: (id: string) => void
  onSendBackward: (id: string) => void
  onBringForward: (id: string) => void
  onBringToFront: (id: string) => void
}

export function LayersPanel({
  t,
  elements,
  selectedIds,
  open,
  onToggle,
  onSelect,
  onSendToBack,
  onSendBackward,
  onBringForward,
  onBringToFront,
}: LayersPanelProps): React.ReactElement {
  const rows = elements
    .filter((e) => !e.isDeleted)
    .slice()
    .reverse()

  return (
    <aside
      aria-label={t("layers.title")}
      data-testid="layers-panel"
      className={`fixed left-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
        open ? "w-64" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("layers.toggle")}
        aria-expanded={open}
        data-testid="layers-toggle"
        className="flex h-10 w-10 items-center justify-center self-start border-b text-sm"
      >
        {open ? "‹" : "›"}
      </button>

      {open && (
        <>
          <div className="border-b px-3 py-2 text-sm font-medium">{t("layers.title")}</div>
          <ul className="flex-1 overflow-y-auto px-2 py-2">
            {rows.map((element) => {
              const selected = selectedIds.includes(element.id)
              const label =
                element.type === "text"
                  ? element.text.trim() || t("toolbar.text")
                  : t(`toolbar.${element.type}`)
              return (
                <li
                  key={element.id}
                  data-testid={`layer-row-${element.id}`}
                  className={`mb-0.5 flex items-center gap-1 rounded px-1 py-1 text-xs ${
                    selected ? "bg-violet-100" : "hover:bg-gray-50"
                  } ${element.groupIds.length > 0 ? "border-l-2 border-violet-300 pl-1" : ""}`}
                >
                  <button
                    type="button"
                    data-testid={`layer-select-${element.id}`}
                    onClick={(e) => onSelect(element.id, { additive: e.shiftKey })}
                    className="flex flex-1 items-center gap-1 overflow-hidden text-left"
                  >
                    <span
                      className="shrink-0"
                      aria-hidden
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: static icon set, no user input
                      dangerouslySetInnerHTML={{ __html: iconHTML(element.type) }}
                    />
                    {element.locked && (
                      <span aria-hidden className="shrink-0 text-[10px]">
                        🔒
                      </span>
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      data-testid={`layer-send-to-back-${element.id}`}
                      aria-label={t("properties.sendToBack")}
                      title={t("properties.sendToBack")}
                      onClick={() => onSendToBack(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-send-backward-${element.id}`}
                      aria-label={t("properties.sendBackward")}
                      title={t("properties.sendBackward")}
                      onClick={() => onSendBackward(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-bring-forward-${element.id}`}
                      aria-label={t("properties.bringForward")}
                      title={t("properties.bringForward")}
                      onClick={() => onBringForward(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      data-testid={`layer-bring-to-front-${element.id}`}
                      aria-label={t("properties.bringToFront")}
                      title={t("properties.bringToFront")}
                      onClick={() => onBringToFront(element.id)}
                      className="rounded px-0.5 hover:bg-gray-100"
                    >
                      ⏭
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
```

Modify `packages/ui/src/index.ts` — add after the `LibraryPanel` export block:

```ts
export { LayersPanel } from "./LayersPanel"
export type { LayersPanelProps } from "./LayersPanel"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS — all `LayersPanel.test.tsx` cases green.

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/LayersPanel.tsx packages/ui/test/LayersPanel.test.tsx packages/ui/src/index.ts
git commit -m "ui: add LayersPanel component"
```

---

### Task 3: Remove the redundant Layers section from `PropertiesPanel`

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx:40-56` (props interface + destructure), `packages/ui/src/PropertiesPanel.tsx:382-413` (JSX section)
- Modify: `packages/ui/test/PropertiesPanel.test.tsx:11-21` (handlers fixture)
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json` (drop the now-unused `properties.layers` key)

**Interfaces:**

- Consumes: nothing new.
- Produces: `PropertiesPanelProps` no longer has `onSendToBack`/`onSendBackward`/`onBringForward`/`onBringToFront`. Task 4's `<PropertiesPanel>` call site in `App.tsx` must drop those props.

- [ ] **Step 1: Remove the four reorder props from `PropertiesPanelProps` and the destructure**

In `packages/ui/src/PropertiesPanel.tsx`, remove these four lines from the `PropertiesPanelProps` interface:

```ts
  onSendToBack: () => void
  onSendBackward: () => void
  onBringForward: () => void
  onBringToFront: () => void
```

And remove the matching four lines from the `PropertiesPanel(...)` destructured parameters:

```ts
  onSendToBack,
  onSendBackward,
  onBringForward,
  onBringToFront,
```

- [ ] **Step 2: Remove the Layers `<Section>` JSX block**

In `packages/ui/src/PropertiesPanel.tsx`, delete this block (currently between the `panel-lock` button and the `properties.actions` Section):

```tsx
<Section label={t("properties.layers")}>
  <div className="grid grid-cols-2 gap-1">
    <button
      type="button"
      onClick={onSendToBack}
      className="rounded border border-gray-300 p-1 text-xs"
    >
      {t("properties.sendToBack")}
    </button>
    <button
      type="button"
      onClick={onSendBackward}
      className="rounded border border-gray-300 p-1 text-xs"
    >
      {t("properties.sendBackward")}
    </button>
    <button
      type="button"
      onClick={onBringForward}
      className="rounded border border-gray-300 p-1 text-xs"
    >
      {t("properties.bringForward")}
    </button>
    <button
      type="button"
      onClick={onBringToFront}
      className="rounded border border-gray-300 p-1 text-xs"
    >
      {t("properties.bringToFront")}
    </button>
  </div>
</Section>
```

- [ ] **Step 3: Update the `PropertiesPanel` test fixture**

In `packages/ui/test/PropertiesPanel.test.tsx`, remove these four lines from the `handlers` object:

```ts
  onSendToBack: noop,
  onSendBackward: noop,
  onBringForward: noop,
  onBringToFront: noop,
```

(Leave `const noop = ...` in place — it's still used by `onAlign`/`onDistribute`.)

- [ ] **Step 4: Drop the now-unused `properties.layers` i18n key**

In `apps/web/src/locales/en/common.json`, remove the line `"layers": "Layers",` from the `properties` block.
In `apps/web/src/locales/ko/common.json`, remove the line `"layers": "레이어",` from the `properties` block.

- [ ] **Step 5: Run tests to verify everything is still green**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS — `PropertiesPanel.test.tsx` still green (no test referenced the removed buttons directly).

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

Note: `apps/web` will now fail typecheck because `App.tsx` still passes the removed props to `<PropertiesPanel>` — that's expected and fixed in Task 4. Do not run `apps/web` typecheck/build in this task.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "ui: remove redundant Layers section from PropertiesPanel"
```

---

### Task 4: Wire `LayersPanel` into `App.tsx`

**Files:**

- Modify: `apps/web/src/components/App.tsx`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json` (add `layers` namespace)

**Interfaces:**

- Consumes: `LayersPanel` + `LayersPanelProps` from `@excalidraw-clone/ui` (Task 2); `sendToBack`/`sendBackward`/`bringForward`/`bringToFront` + `expandIdsToGroups` from `@excalidraw-clone/scene` (Task 1, and `expandIdsToGroups` already existed pre-plan); `useAppStore` selection actions `setSelection`/`addToSelection` (pre-existing, `apps/web/src/store/slices/selection.ts`).
- Produces: nothing new for later tasks — this is the final wiring task besides e2e.

- [ ] **Step 1: Add the new imports**

In `apps/web/src/components/App.tsx`, change the `@excalidraw-clone/scene` import block from:

```ts
import {
  alignElements,
  BUILTIN_TEMPLATES,
  cloneElementsWithNewIds,
  distributeElements,
  expandIdsToCopyClosure,
  type ExcalidrawElement,
  groupElements,
  type LibraryItem,
  lockElements,
  normalizeToOrigin,
  Scene,
  ungroupElements,
  unlockAll,
} from "@excalidraw-clone/scene"
```

to:

```ts
import {
  alignElements,
  bringForward,
  bringToFront,
  BUILTIN_TEMPLATES,
  cloneElementsWithNewIds,
  distributeElements,
  expandIdsToCopyClosure,
  expandIdsToGroups,
  type ExcalidrawElement,
  groupElements,
  type LibraryItem,
  lockElements,
  normalizeToOrigin,
  Scene,
  sendBackward,
  sendToBack,
  ungroupElements,
  unlockAll,
} from "@excalidraw-clone/scene"
```

And change:

```ts
import { HamburgerMenu, LibraryPanel, PropertiesPanel, Toolbar } from "@excalidraw-clone/ui"
```

to:

```ts
import {
  HamburgerMenu,
  LayersPanel,
  LibraryPanel,
  PropertiesPanel,
  Toolbar,
} from "@excalidraw-clone/ui"
```

- [ ] **Step 2: Add `layersOpen` state and a memoized element list**

Change:

```ts
const [menuOpen, setMenuOpen] = useState(false)
const [libraryOpen, setLibraryOpen] = useState(false)
```

to:

```ts
const [menuOpen, setMenuOpen] = useState(false)
const [libraryOpen, setLibraryOpen] = useState(false)
const [layersOpen, setLayersOpen] = useState(false)
```

Change:

```ts
const hasLockedElements = useMemo(
  () => scene.getElements().some((e) => e.locked),
  [scene, sceneRevision],
)
```

to:

```ts
const hasLockedElements = useMemo(
  () => scene.getElements().some((e) => e.locked),
  [scene, sceneRevision],
)
const layerElements = useMemo(() => scene.getElements(), [scene, sceneRevision])
```

- [ ] **Step 3: Remove the four reorder props from the `<PropertiesPanel>` call site**

In the `<PropertiesPanel>` JSX, delete these four handler props (currently right after `onDelete`'s closing brace and before `onAlign`):

```tsx
              onSendToBack={() => {
                scene.mutate((draft) => {
                  const moved = draft.filter((e) => selectedIds.includes(e.id))
                  const remaining = draft.filter((e) => !selectedIds.includes(e.id))
                  draft.length = 0
                  draft.push(...moved, ...remaining)
                })
              }}
              onSendBackward={() => {
                scene.mutate((draft) => {
                  for (let i = 1; i < draft.length; i += 1) {
                    if (
                      selectedIds.includes(draft[i]!.id) &&
                      !selectedIds.includes(draft[i - 1]!.id)
                    ) {
                      ;[draft[i - 1], draft[i]] = [draft[i]!, draft[i - 1]!]
                    }
                  }
                })
              }}
              onBringForward={() => {
                scene.mutate((draft) => {
                  for (let i = draft.length - 2; i >= 0; i -= 1) {
                    if (
                      selectedIds.includes(draft[i]!.id) &&
                      !selectedIds.includes(draft[i + 1]!.id)
                    ) {
                      ;[draft[i + 1], draft[i]] = [draft[i]!, draft[i + 1]!]
                    }
                  }
                })
              }}
              onBringToFront={() => {
                scene.mutate((draft) => {
                  const moved = draft.filter((e) => selectedIds.includes(e.id))
                  const remaining = draft.filter((e) => !selectedIds.includes(e.id))
                  draft.length = 0
                  draft.push(...remaining, ...moved)
                })
              }}
```

- [ ] **Step 4: Render `LayersPanel`**

Immediately before the `<LibraryPanel` JSX element, add:

```tsx
<LayersPanel
  t={t}
  elements={layerElements}
  selectedIds={selectedIds}
  open={layersOpen}
  onToggle={() => setLayersOpen((v) => !v)}
  onSelect={(id, opts) => {
    const hitIds = expandIdsToGroups([id], scene.getElements())
    if (opts.additive) {
      if (!selectedIds.includes(id)) useAppStore.getState().addToSelection(hitIds)
    } else {
      useAppStore.getState().setSelection(hitIds)
    }
  }}
  onSendToBack={(id) => {
    scene.mutate((draft) => {
      const next = sendToBack(draft, [id])
      draft.length = 0
      draft.push(...next)
    })
  }}
  onSendBackward={(id) => {
    scene.mutate((draft) => {
      const next = sendBackward(draft, [id])
      draft.length = 0
      draft.push(...next)
    })
  }}
  onBringForward={(id) => {
    scene.mutate((draft) => {
      const next = bringForward(draft, [id])
      draft.length = 0
      draft.push(...next)
    })
  }}
  onBringToFront={(id) => {
    scene.mutate((draft) => {
      const next = bringToFront(draft, [id])
      draft.length = 0
      draft.push(...next)
    })
  }}
/>
```

(This goes right above the existing `<LibraryPanel ... />` element, still inside the `{!zenMode && (<> ... </>)}` block.)

- [ ] **Step 5: Add the `layers` i18n namespace**

In `apps/web/src/locales/en/common.json`, change the end of the file from:

```json
  "library": {
    "title": "Library",
    "toggle": "Toggle library",
    "addFromSelection": "Add from selection",
    "empty": "Library is empty",
    "import": "Import library…",
    "export": "Export library",
    "rename": "Rename",
    "delete": "Delete",
    "imported": "{added} added, {skipped} skipped",
    "importError": "Could not read library file",
    "placing": "Click to place • Esc to cancel",
    "templates": "Templates",
    "myItems": "My items"
  }
}
```

to:

```json
  "library": {
    "title": "Library",
    "toggle": "Toggle library",
    "addFromSelection": "Add from selection",
    "empty": "Library is empty",
    "import": "Import library…",
    "export": "Export library",
    "rename": "Rename",
    "delete": "Delete",
    "imported": "{added} added, {skipped} skipped",
    "importError": "Could not read library file",
    "placing": "Click to place • Esc to cancel",
    "templates": "Templates",
    "myItems": "My items"
  },
  "layers": {
    "title": "Layers",
    "toggle": "Toggle layers panel"
  }
}
```

In `apps/web/src/locales/ko/common.json`, change the end of the file from:

```json
  "library": {
    "title": "라이브러리",
    "toggle": "라이브러리 열고 닫기",
    "addFromSelection": "선택 항목 추가",
    "empty": "라이브러리가 비어 있습니다",
    "import": "라이브러리 가져오기…",
    "export": "라이브러리 내보내기",
    "rename": "이름 변경",
    "delete": "삭제",
    "imported": "추가 {added}, 건너뜀 {skipped}",
    "importError": "라이브러리 파일을 읽을 수 없습니다",
    "placing": "클릭하여 배치 • Esc로 취소",
    "templates": "템플릿",
    "myItems": "내 항목"
  }
}
```

to:

```json
  "library": {
    "title": "라이브러리",
    "toggle": "라이브러리 열고 닫기",
    "addFromSelection": "선택 항목 추가",
    "empty": "라이브러리가 비어 있습니다",
    "import": "라이브러리 가져오기…",
    "export": "라이브러리 내보내기",
    "rename": "이름 변경",
    "delete": "삭제",
    "imported": "추가 {added}, 건너뜀 {skipped}",
    "importError": "라이브러리 파일을 읽을 수 없습니다",
    "placing": "클릭하여 배치 • Esc로 취소",
    "templates": "템플릿",
    "myItems": "내 항목"
  },
  "layers": {
    "title": "레이어",
    "toggle": "레이어 패널 열고 닫기"
  }
}
```

- [ ] **Step 6: Run typecheck and unit tests**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/App.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: wire LayersPanel into App"
```

---

### Task 5: e2e test and full gate

**Files:**

- Create: `apps/web/e2e/layers-panel.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `./_helpers` (existing); reads scene state via `localStorage.getItem("excalidraw-scene")`, same convention as `apps/web/e2e/group.spec.ts`.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/layers-panel.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = { id: string; type: string; isDeleted?: boolean }

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

test("layers panel: z-order display, reorder buttons, and click-to-select", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 100 }, { x: 160, y: 160 }) // drawn first -> back
  await draw({ x: 220, y: 100 }, { x: 280, y: 160 }) // drawn second -> front

  await page.locator('[data-testid="toolbar-selection"]').click()
  const [a, b] = await readScene(page)
  expect(a).toBeDefined()
  expect(b).toBeDefined()

  // Panel starts closed.
  await expect(page.locator('[data-testid^="layer-row-"]')).toHaveCount(0)
  await page.locator('[data-testid="layers-toggle"]').click()

  const rows = page.locator('[data-testid^="layer-row-"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toHaveAttribute("data-testid", `layer-row-${b!.id}`)
  await expect(rows.nth(1)).toHaveAttribute("data-testid", `layer-row-${a!.id}`)

  // Send the front element (b) to back: array order flips, panel order follows.
  await page.locator(`[data-testid="layer-send-to-back-${b!.id}"]`).click()
  await page.waitForTimeout(150)
  const afterReorder = await readScene(page)
  expect(afterReorder.map((e) => e.id)).toEqual([b!.id, a!.id])
  await expect(rows.nth(0)).toHaveAttribute("data-testid", `layer-row-${a!.id}`)
  await expect(rows.nth(1)).toHaveAttribute("data-testid", `layer-row-${b!.id}`)

  // Clicking a's row selects it on canvas; Delete removes only a.
  await page.locator(`[data-testid="layer-select-${a!.id}"]`).click()
  await page.waitForTimeout(120)
  await page.keyboard.press("Delete")
  await page.waitForTimeout(150)
  const afterDelete = await readScene(page)
  expect(afterDelete.map((e) => e.id)).toEqual([b!.id])
})
```

- [ ] **Step 2: Run the e2e test to verify it fails first (sanity check on a clean tree)**

Run: `pnpm --filter @excalidraw-clone/web e2e -- layers-panel`
Expected: This should already PASS if Tasks 1-4 are complete and committed. If it fails, debug against the running app before proceeding — do not skip investigating a failure here.

- [ ] **Step 3: Run the full gate**

Run: `pnpm typecheck`
Expected: PASS across all packages.

Run: `pnpm test`
Expected: PASS across all packages (scene, ui, web unit tests).

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS — full Playwright suite, including the new `layers-panel.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/layers-panel.spec.ts
git commit -m "web: layers panel e2e — z-order, reorder buttons, click-to-select"
```

---

## Self-Review Notes

- **Spec coverage:** z-order extraction (Task 1) ✓, LayersPanel component (Task 2) ✓, PropertiesPanel simplification (Task 3) ✓, App wiring incl. selection sync + i18n (Task 4) ✓, e2e + full gate (Task 5) ✓. Out-of-scope items (visibility toggle, drag-and-drop, collapsible groups, thumbnails, frame nesting) are explicitly not implemented anywhere in this plan.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `LayersPanelProps` (Task 2) is used identically in Task 4's JSX (`onSelect(id, { additive })`, four `onSend*/onBring*(id)` signatures match exactly). `sendToBack`/`sendBackward`/`bringForward`/`bringToFront` signatures from Task 1 are called identically in Task 4.
