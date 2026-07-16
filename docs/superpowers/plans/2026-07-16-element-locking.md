# Element Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the existing (scaffolded but unwired) `locked: boolean` element field: locked elements render normally but are fully inert — click-through, no marquee, no erase, no new bindings, no select-all — with lock via Ctrl+Shift+L / panel button / palette, and a global floating "Unlock all" button.

**Architecture:** Patch-array scene helpers (`lockElements`/`unlockAll` in `packages/scene/src/locking.ts`, same idiom as `groupElements`), plus one-line `locked` skips at the four interaction boundaries (driver hit-test, marquee, `canBindTo`, select-all). No renderer changes — locked elements have no visual indicator.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest unit tests, Playwright e2e, React 19 + zustand + i18next in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-07-13-element-locking-design.md`

## Global Constraints

- No new dependencies.
- Helpers return **patch arrays** (only changed elements); callers apply via the `patchScene` idiom (`scene.mutate` replacing matching ids).
- Locking clears locked ids from the current selection (`setSelection([])` after locking).
- Existing arrow bindings to a now-locked element are preserved; only **new** bindings are blocked.
- i18n: every new key goes into **both** `en` and `ko` `common.json`. New keys: `properties.lock`, `palette.lockSelection`, `palette.unlockAll`, `canvas.unlockAll`.
- Shortcut is `Ctrl+Shift+L` (Ctrl+L stays free — browsers own it).
- Testids: `panel-lock` (panel button), `unlock-all` (floating button).
- Commit style: `<package>: <summary>` (e.g. `scene: …`, `tools: …`, `web: …`, `ui: …`).
- All commands run from the repo root `/home/sung/excalidraw-clone`.

---

### Task 1: Scene locking helpers

**Files:**

- Create: `packages/scene/test/locking.test.ts`
- Create: `packages/scene/src/locking.ts`
- Modify: `packages/scene/src/index.ts` (add export after the `./groups` export line)

**Interfaces:**

- Consumes: `ExcalidrawElement` from `./types`, `newRectangle` factory (tests only).
- Produces: `lockElements(elements: readonly ExcalidrawElement[], ids: readonly string[]): ExcalidrawElement[]` and `unlockAll(elements: readonly ExcalidrawElement[]): ExcalidrawElement[]`, both exported from `@excalidraw-clone/scene`. Patches carry `locked` flipped, a fresh `versionNonce`, and a bumped `updated`.

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/locking.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { lockElements, unlockAll } from "../src/locking"
import type { ExcalidrawElement } from "../src/types"

const rect = (x: number): ExcalidrawElement => newRectangle({ x, y: 0, width: 10, height: 10 })
const asLocked = (el: ExcalidrawElement): ExcalidrawElement => ({ ...el, locked: true })

describe("lockElements", () => {
  it("returns locked patches for the requested ids only", () => {
    const a = rect(0)
    const b = rect(20)
    const patches = lockElements([a, b], [a.id])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(a.id)
    expect(patches[0]!.locked).toBe(true)
  })

  it("bumps versionNonce and updated on each patch", () => {
    const a = rect(0)
    const before = a.updated
    const patches = lockElements([a], [a.id])
    expect(patches[0]!.versionNonce).not.toBe(a.versionNonce)
    expect(patches[0]!.updated).toBeGreaterThanOrEqual(before)
  })

  it("skips ids that are already locked or deleted", () => {
    const a = asLocked(rect(0))
    const dead = { ...rect(20), isDeleted: true }
    expect(lockElements([a, dead], [a.id, dead.id])).toEqual([])
  })

  it("ignores unknown ids and does not mutate inputs", () => {
    const a = rect(0)
    expect(lockElements([a], ["ghost"])).toEqual([])
    lockElements([a], [a.id])
    expect(a.locked).toBe(false)
  })
})

describe("unlockAll", () => {
  it("returns unlocked patches for every non-deleted locked element", () => {
    const a = asLocked(rect(0))
    const b = rect(20)
    const c = asLocked(rect(40))
    const patches = unlockAll([a, b, c])
    expect(patches.map((p) => p.id).sort()).toEqual([a.id, c.id].sort())
    for (const p of patches) expect(p.locked).toBe(false)
  })

  it("skips deleted locked elements", () => {
    const dead = { ...asLocked(rect(0)), isDeleted: true }
    expect(unlockAll([dead])).toEqual([])
  })

  it("returns an empty array when nothing is locked and does not mutate inputs", () => {
    const a = rect(0)
    expect(unlockAll([a])).toEqual([])
    const b = asLocked(rect(20))
    unlockAll([b])
    expect(b.locked).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/locking.test.ts`
Expected: FAIL — `Cannot find module '../src/locking'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `packages/scene/src/locking.ts`:

```ts
import type { ExcalidrawElement } from "./types"

const newNonce = (): number => Math.floor(Math.random() * 2 ** 31)

/** Returns locked patches (fresh versionNonce, bumped updated) for the matched
 *  ids. Skips ids already locked, deleted, or unknown. */
export function lockElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  return elements
    .filter((el) => idSet.has(el.id) && !el.isDeleted && !el.locked)
    .map((el) => ({ ...el, locked: true, versionNonce: newNonce(), updated: Date.now() }))
}

/** Returns unlocked patches for every non-deleted locked element. */
export function unlockAll(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements
    .filter((el) => el.locked && !el.isDeleted)
    .map((el) => ({ ...el, locked: false, versionNonce: newNonce(), updated: Date.now() }))
}
```

In `packages/scene/src/index.ts`, after the line
`export { expandIdsToGroups, groupElements, ungroupElements } from "./groups"`, add:

```ts
export { lockElements, unlockAll } from "./locking"
```

- [ ] **Step 4: Run the scene tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS (all scene test files, including the 7 new locking tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/locking.ts packages/scene/test/locking.test.ts packages/scene/src/index.ts
git commit -m "scene: lockElements/unlockAll patch helpers"
```

---

### Task 2: New arrow bindings skip locked elements (existing bindings preserved)

**Files:**

- Modify: `packages/scene/src/bindings.ts:30-41` (`bindingTargetAt`)
- Test: `packages/scene/test/bindings.test.ts` (new `describe("locking × bindings", …)` block)

**Interfaces:**

- Consumes: existing `bindingTargetAt`, `reconcileBindings`, `BINDING_GAP`, and the `rect(over)` fixture already defined at the top of `bindings.test.ts`. `newArrow`, `ExcalidrawArrowElement`, and `Point` are already imported there.
- Produces: `bindingTargetAt` never returns a `locked` element (blocks **new** bindings from the arrow tool and endpoint drags). `canBindTo` stays locked-agnostic.

**⚠️ Deviation from spec §3.3, on purpose:** the spec says to add `!el.locked` inside `canBindTo`. But `canBindTo` is also called by `liveTarget` inside `reconcileBindings` (bindings.ts:74-82) — rejecting locked there would make reconciliation **sever existing bindings** to a now-locked element, contradicting spec §1 ("existing arrow bindings to a now-locked element keep working"). The locked check therefore goes in `bindingTargetAt`, the new-binding lookup path. Both behaviors get pinned by tests below.

- [ ] **Step 1: Write the failing test**

In `packages/scene/test/bindings.test.ts`, add a new top-level describe block (after the `describe("canBindTo", …)` block):

```ts
describe("locking × bindings", () => {
  it("bindingTargetAt skips locked elements (no new bindings)", () => {
    const r = rect({ locked: true })
    expect(bindingTargetAt({ x: 50, y: 50 }, [r])).toBeNull()
  })

  it("reconcileBindings keeps existing bindings to locked elements", () => {
    const target = rect({ x: 100, y: 0, locked: true })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 96, y: 50 },
      ],
      width: 96,
      height: 50,
      endBinding: { elementId: target.id, focus: 0, gap: BINDING_GAP },
    } as ExcalidrawArrowElement
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const after = draft[1] as ExcalidrawArrowElement
    expect(after.endBinding?.elementId).toBe(target.id)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/bindings.test.ts`
Expected: FAIL — `bindingTargetAt skips locked elements` gets the element back instead of `null`. The `reconcileBindings` test already passes (it pins the behavior we must not break).

- [ ] **Step 3: Implement the bindingTargetAt skip**

In `packages/scene/src/bindings.ts`, change `bindingTargetAt`'s filter line only:

```ts
export const bindingTargetAt = (
  point: Point,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i]!
    if (!canBindTo(el) || el.locked) continue
    if (el.type === "text" && el.containerId !== null) continue
    if (hitTestElement(el, point)) return el
  }
  return null
}
```

`canBindTo` itself is untouched.

- [ ] **Step 4: Run the scene tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/test/bindings.test.ts
git commit -m "scene: bindingTargetAt skips locked elements; existing bindings preserved"
```

---

### Task 3: Tools — marquee skips locked; eraser contract test

**Files:**

- Modify: `packages/tools/src/tools/selection/marquee.ts` (`elementsInsideMarquee`)
- Test: `packages/tools/test/selection-marquee.test.ts`, `packages/tools/test/eraser-tool.test.ts`

**Interfaces:**

- Consumes: `elementsInsideMarquee(marquee: Bounds, elements: readonly ExcalidrawElement[]): readonly string[]`; `eraserTool.reduce(state, event, ctx)`; `makeCtx`/`point`/`applyMutation` from `packages/tools/test/test-utils.ts`.
- Produces: `elementsInsideMarquee` never returns ids of `locked` elements. The eraser test documents the driver contract: `ctx.hitTest` returns `null` over locked elements (the driver change lands in Task 4).

- [ ] **Step 1: Write the failing marquee test**

In `packages/tools/test/selection-marquee.test.ts`, add inside the existing `describe`:

```ts
it("locked elements inside the marquee are not selected", () => {
  const a = newRectangle({ x: 10, y: 10, width: 30, height: 30 })
  const b = { ...newRectangle({ x: 60, y: 60, width: 30, height: 30 }), locked: true }
  const ctx = makeCtx({ readElements: () => [a, b], hitTest: () => null })
  let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
  s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(150, 150) }, ctx)
  const sel = s[1].find((e) => e.kind === "select")
  expect(sel).toBeDefined()
  if (sel?.kind === "select") expect(sel.ids).toEqual([a.id])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- test/selection-marquee.test.ts`
Expected: FAIL — `sel.ids` contains both ids.

- [ ] **Step 3: Implement the marquee skip**

In `packages/tools/src/tools/selection/marquee.ts`, `elementsInsideMarquee` loop:

```ts
for (const e of elements) {
  if (e.isDeleted) continue
  if (e.locked) continue
  const b = getElementBounds(e)
  if (boundsContains(marquee, b)) ids.push(e.id)
}
```

- [ ] **Step 4: Add the eraser contract test (passes immediately — documents driver behavior)**

In `packages/tools/test/eraser-tool.test.ts`, add inside the existing `describe`:

```ts
it("does not erase locked elements when hitTest honors locked (mirrors the driver)", () => {
  const r = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
  const draft: ExcalidrawElement[] = [r]
  const ctx = makeCtx({
    readElements: () => [r],
    hitTest: () => (r.locked ? null : r),
  })
  const [state, effects] = eraserTool.reduce(
    eraserTool.initial,
    { type: "pointerDown", at: point(5, 5) },
    ctx,
  )
  applyMutation(effects, draft)
  expect(state.phase).toBe("erasing")
  expect(draft[0]?.isDeleted).toBe(false)
})
```

This is a contract test, not red-green: the eraser calls `ctx.hitTest`, and the real hit-test gains its locked skip in the driver (Task 4). It pins the tools-side expectation so a future eraser rewrite that bypasses `ctx.hitTest` fails here.

- [ ] **Step 5: Run all tools tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS (all tools test files, both new tests included).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/selection/marquee.ts packages/tools/test/selection-marquee.test.ts packages/tools/test/eraser-tool.test.ts
git commit -m "tools: marquee skips locked elements; eraser locked contract test"
```

---

### Task 4: Web enforcement — driver hit-test skip, select-all filter, Ctrl+Shift+L

**Files:**

- Create: `apps/web/src/driver/patchScene.ts` (extracted from `shortcuts.ts` so App.tsx and PaletteHost can reuse it)
- Modify: `apps/web/src/keyboard/shortcuts.ts` (use extracted helper; add Ctrl+Shift+L)
- Modify: `apps/web/src/driver/useDrawingDriver.ts:137-145` (hit-test loop)
- Modify: `apps/web/src/components/PaletteHost.tsx` (select-all filter only — lock commands come in Task 6)
- Test: `apps/web/test/keyboard-shortcuts.test.ts`

**Interfaces:**

- Consumes: `lockElements` from `@excalidraw-clone/scene` (Task 1).
- Produces: `patchScene(scene: Scene, patches: readonly ExcalidrawElement[]): void` exported from `apps/web/src/driver/patchScene.ts` — Tasks 6 relies on this exact name/signature. Ctrl+Shift+L locks the selection and clears it; the driver's `ctx.hitTest` skips locked elements (covers click-select, drag, eraser).

- [ ] **Step 1: Write the failing shortcut tests**

In `apps/web/test/keyboard-shortcuts.test.ts`, add `newRectangle` to the scene import:

```ts
import { newRectangle, Scene } from "@excalidraw-clone/scene"
```

and add inside the existing `describe`:

```ts
it("Ctrl+Shift+L locks the selection and clears it", () => {
  const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(r)
  })
  useAppStore.getState().setSelection([r.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }))
  expect(scene.getElements()[0]!.locked).toBe(true)
  expect(useAppStore.getState().selectedIds).toEqual([])
})

it("Ctrl+Shift+L with empty selection is a no-op", () => {
  const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(r)
  })
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }))
  expect(scene.getElements()[0]!.locked).toBe(false)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @excalidraw-clone/web test -- test/keyboard-shortcuts.test.ts`
Expected: FAIL — first new test: `expected false to be true` (no handler yet; keydown falls through to `TOOL_KEYS["l"]` and just switches to the line tool).

- [ ] **Step 3: Extract patchScene**

Create `apps/web/src/driver/patchScene.ts`:

```ts
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"

/** Apply patch-array results (groupElements, lockElements, …): replace each
 *  matching element in the scene with its patched copy. No-op on empty input. */
export function patchScene(scene: Scene, patches: readonly ExcalidrawElement[]): void {
  if (patches.length === 0) return
  const byId = new Map(patches.map((p) => [p.id, p]))
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const p = byId.get(draft[i]!.id)
      if (p) draft[i] = p
    }
  })
}
```

- [ ] **Step 4: Rewire shortcuts.ts and add Ctrl+Shift+L**

In `apps/web/src/keyboard/shortcuts.ts`:

1. Delete the local `patchScene` function (lines 30-39).
2. Update imports:

```ts
"use client"
import { groupElements, lockElements, type Scene, ungroupElements } from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"
```

(`type ExcalidrawElement` import is no longer needed once the local helper is gone.)

3. After the `isMeta && key === "g"` block (the group shortcut) and before the `isMeta && key === "'"` block, add:

```ts
if (isMeta && e.shiftKey && key === "l") {
  e.preventDefault()
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 0) return
  patchScene(scene, lockElements(scene.getElements(), ids))
  useAppStore.getState().setSelection([])
  return
}
```

- [ ] **Step 5: Add the driver hit-test skip**

In `apps/web/src/driver/useDrawingDriver.ts`, in the `ctx.hitTest` loop (~line 141), alongside the bound-text skip:

```ts
        hitTest: (at) => {
          const elements = scene.getElements()
          for (let i = elements.length - 1; i >= 0; i -= 1) {
            const el = elements[i] as ExcalidrawElement
            if (el.type === "text" && el.containerId !== null) continue
            if (el.locked) continue
            if (hitTestElement(el, at)) return el
          }
          return null
        },
```

- [ ] **Step 6: Filter select-all**

In `apps/web/src/components/PaletteHost.tsx`, `select-all` command:

```ts
      perform: () =>
        useAppStore
          .getState()
          .setSelection(
            scene
              .getElements()
              .filter((e) => !e.locked)
              .map((e) => e.id),
          ),
```

(`scene.getElements()` already excludes deleted elements.)

- [ ] **Step 7: Run web tests to verify everything passes**

Run: `pnpm --filter @excalidraw-clone/web test`
Expected: PASS (all web unit tests, including the 2 new shortcut tests).

- [ ] **Step 8: Typecheck (patchScene extraction touches imports)**

Run: `pnpm typecheck`
Expected: exit 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/driver/patchScene.ts apps/web/src/keyboard/shortcuts.ts apps/web/src/driver/useDrawingDriver.ts apps/web/src/components/PaletteHost.tsx apps/web/test/keyboard-shortcuts.test.ts
git commit -m "web: locked elements are inert — driver hit-test skip, select-all filter, Ctrl+Shift+L"
```

---

### Task 5: PropertiesPanel Lock button

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`
- Test: `packages/ui/test/PropertiesPanel.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `PropertiesPanelProps` gains required `onLock: () => void`; a full-width button `data-testid="panel-lock"` labeled `t("properties.lock")` renders whenever the panel renders (any selection). App.tsx wires it in Task 6.

- [ ] **Step 1: Write the failing tests**

In `packages/ui/test/PropertiesPanel.test.tsx`, add `onLock: vi.fn(),` to the shared `handlers` object (after `onUngroup: vi.fn(),`), then add inside the `describe`:

```ts
  it("renders the Lock button whenever a selection exists", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("panel-lock")).toBeInTheDocument()
  })

  it("fires onLock when the Lock button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onLock = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onLock={onLock} />)
    await userEvent.click(screen.getByTestId("panel-lock"))
    expect(onLock).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/PropertiesPanel.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="panel-lock"]`. (TypeScript may also flag the unknown `onLock` prop — that's the same red.)

- [ ] **Step 3: Implement**

In `packages/ui/src/PropertiesPanel.tsx`:

1. Add to `PropertiesPanelProps` (after `onUngroup: () => void`):

```ts
  onLock: () => void
```

2. Add `onLock,` to the destructured props in the `PropertiesPanel` function signature (after `onUngroup,`).

3. Insert the button between the closing `)}` of the Arrange section (`selectedElements.length >= 2 && (…)`) and `<Section label={t("properties.layers")}>`:

```tsx
<button
  type="button"
  data-testid="panel-lock"
  onClick={onLock}
  className="w-full rounded border border-gray-300 p-1 text-xs"
>
  {t("properties.lock")}
</button>
```

- [ ] **Step 4: Run ui tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS (all ui test files).

- [ ] **Step 5: Typecheck — App.tsx now misses the required prop**

Run: `pnpm typecheck`
Expected: **FAIL** in `apps/web` — `Property 'onLock' is missing` at the `<PropertiesPanel …>` call site in App.tsx. That is Task 6's job. To keep this commit green on its own, wire a minimal stub now in `apps/web/src/components/App.tsx` (replaced with the real handler in Task 6): add `onLock={() => {}}` after `onUngroup={…}` in the `<PropertiesPanel>` JSX. Re-run `pnpm typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/components/App.tsx
git commit -m "ui: Lock button in PropertiesPanel (panel-lock)"
```

---

### Task 6: App wiring — onLock, palette commands, floating Unlock all, i18n

**Files:**

- Modify: `apps/web/src/components/App.tsx`
- Modify: `apps/web/src/components/PaletteHost.tsx`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`

**Interfaces:**

- Consumes: `lockElements`, `unlockAll` from `@excalidraw-clone/scene` (Task 1); `patchScene` from `../driver/patchScene` (Task 4); `useSceneRevision` (already used in App.tsx); `onLock` prop (Task 5).
- Produces: floating button `data-testid="unlock-all"` (bottom-left, hidden in zen mode, rendered only when a non-deleted locked element exists); palette commands `lock-selection` (hint `Ctrl+Shift+L`) and `unlock-all`; four i18n keys in both locales.

- [ ] **Step 1: Add i18n keys**

`apps/web/src/locales/en/common.json`:

- In `"properties"`, after `"arrowhead_diamond_outline": …` add: `"lock": "Lock"`
- In `"palette"`, after `"empty": …` add: `"lockSelection": "Lock selection", "unlockAll": "Unlock all elements"`
- Add a top-level section (after `"canvasBg": { … }`):

```json
  "canvas": {
    "unlockAll": "Unlock all"
  },
```

`apps/web/src/locales/ko/common.json` (same three locations):

- `"lock": "잠금"`
- `"lockSelection": "선택 요소 잠금", "unlockAll": "모든 잠금 해제"`
- `"canvas": { "unlockAll": "모두 잠금 해제" },`

- [ ] **Step 2: Wire App.tsx**

In `apps/web/src/components/App.tsx`:

1. Extend the scene import with `lockElements` and `unlockAll` (alphabetical spots: `lockElements` after `type LibraryItem`, `unlockAll` after `ungroupElements`).
2. Add: `import { patchScene } from "../driver/patchScene"`.
3. After the `selectedElements` useMemo, add:

```tsx
const hasLockedElements = useMemo(
  () => scene.getElements().some((e) => e.locked),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRevision invalidates on every mutation
  [scene, sceneRevision],
)
```

(If the existing `selectedElements` memo carries no eslint-disable for `sceneRevision`, drop the disable comment here too and match its exact style.)

4. Replace the Task 5 stub `onLock={() => {}}` with:

```tsx
              onLock={() => {
                patchScene(scene, lockElements(scene.getElements(), selectedIds))
                useAppStore.getState().setSelection([])
              }}
```

5. Inside the `{!zenMode && (<> … </>)}` fragment, after `<LibraryPanel … />`, add:

```tsx
{
  hasLockedElements && (
    <button
      type="button"
      data-testid="unlock-all"
      aria-label={t("canvas.unlockAll")}
      onClick={() => patchScene(scene, unlockAll(scene.getElements()))}
      className="absolute bottom-3 left-3 z-30 rounded-lg bg-white px-3 py-2 text-xs shadow"
    >
      🔓 {t("canvas.unlockAll")}
    </button>
  )
}
```

- [ ] **Step 3: Add palette commands**

In `apps/web/src/components/PaletteHost.tsx`:

1. Update imports:

```ts
import { lockElements, type Scene, unlockAll } from "@excalidraw-clone/scene"
import { patchScene } from "../driver/patchScene"
```

2. Append to the `commands` array (after the `grid` command):

```ts
    {
      id: "lock-selection",
      label: t("palette.lockSelection"),
      hint: "Ctrl+Shift+L",
      perform: () => {
        const { selectedIds, setSelection } = useAppStore.getState()
        if (selectedIds.length === 0) return
        patchScene(scene, lockElements(scene.getElements(), selectedIds))
        setSelection([])
      },
    },
    {
      id: "unlock-all",
      label: t("palette.unlockAll"),
      perform: () => patchScene(scene, unlockAll(scene.getElements())),
    },
```

- [ ] **Step 4: Verify — typecheck, lint, web unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @excalidraw-clone/web test`
Expected: all exit 0. (No new unit tests here — this wiring is exercised end-to-end in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/App.tsx apps/web/src/components/PaletteHost.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: lock wiring — panel onLock, palette commands, floating Unlock all, i18n"
```

---

### Task 7: e2e coverage + full gate

**Files:**

- Create: `apps/web/e2e/locking.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; testids `toolbar-rectangle`, `toolbar-selection`, `panel-lock`, `unlock-all`; localStorage key `excalidraw-scene` (auto-save lands ~800ms after mutation — wait 900ms before reading, same as `group.spec.ts`).
- Produces: e2e proof of click-through, marquee skip, unlock-all round-trip, and persistence across reload.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/locking.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  locked?: boolean
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const drawRect = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

const clickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, at, at) // zero-length drag = click
  await page.waitForTimeout(120)
}

test("locked element is click-through and Unlock all restores it", async ({ page }) => {
  await freshCanvas(page)

  // A below, B on top, overlapping in (150,150)-(200,200).
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await drawRect(page, { x: 150, y: 150 }, { x: 250, y: 250 })

  // Select B via a point only inside B, lock it from the panel.
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()
  await page.locator('[data-testid="panel-lock"]').click()
  await page.waitForTimeout(120)

  // Locking clears the selection: panel gone, floating Unlock all appears.
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="unlock-all"]')).toBeVisible()

  // Click a point only inside locked B: nothing gets selected.
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)

  // Click the overlap: B is topmost but locked, so A gets selected.
  await clickCanvas(page, { x: 175, y: 175 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()
  await page.keyboard.press("Escape")

  // Unlock all: button disappears, B is selectable again.
  await page.locator('[data-testid="unlock-all"]').click()
  await page.waitForTimeout(120)
  await expect(page.locator('[data-testid="unlock-all"]')).toHaveCount(0)
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()

  await page.waitForTimeout(900)
  const rects = await readScene(page)
  expect(rects.every((r) => !r.locked)).toBe(true)
})

test("marquee selects only unlocked elements", async ({ page }) => {
  await freshCanvas(page)

  // Side by side: A at x≈100, B at x≈220.
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await drawRect(page, { x: 220, y: 100 }, { x: 280, y: 160 })

  // Lock B.
  await clickCanvas(page, { x: 250, y: 130 })
  await page.locator('[data-testid="panel-lock"]').click()
  await page.waitForTimeout(120)

  // Marquee over both, then Delete: only unlocked A dies.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 180 })
  await page.waitForTimeout(150)
  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(1)
  expect(Math.abs(rects[0]!.x - 220)).toBeLessThan(1)
  expect(rects[0]!.locked).toBe(true)
})

test("lock persists across reload (Ctrl+Shift+L path)", async ({ page }) => {
  await freshCanvas(page)

  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await clickCanvas(page, { x: 130, y: 130 })
  await page.keyboard.press("Control+Shift+KeyL")
  await page.waitForTimeout(900) // let auto-save flush

  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Still locked after reload: floating button shows, element not clickable.
  await expect(page.locator('[data-testid="unlock-all"]')).toBeVisible()
  await clickCanvas(page, { x: 130, y: 130 })
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects[0]!.locked).toBe(true)
})
```

- [ ] **Step 2: Run the new e2e spec**

Run: `pnpm --filter @excalidraw-clone/web e2e -- locking.spec.ts`
Expected: 3 passed. (Playwright config auto-starts the dev server; if a run flakes on timing, bump the 120ms settles to 150ms rather than restructuring.)

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: full e2e suite passes (25 existing + 3 new = 28).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/locking.spec.ts
git commit -m "web: e2e — locked click-through, marquee skip, unlock-all, persistence"
```

---

## Spec coverage map

| Spec section                                                                             | Task                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| §2 scene helpers (`lockElements`/`unlockAll`, exports)                                   | 1                                        |
| §3.3 arrow binding blocks locked (existing bindings preserved)                           | 2                                        |
| §3.2 marquee skip; eraser contract                                                       | 3                                        |
| §3.1 driver hit-test skip (click/drag/eraser); §3.4 select-all; §4 shortcut Ctrl+Shift+L | 4                                        |
| §4 panel Lock button (`panel-lock`)                                                      | 5                                        |
| §4 palette commands, floating `unlock-all`, i18n keys                                    | 6                                        |
| §5 e2e (click-through, marquee, unlock-all, persistence)                                 | 7                                        |
| §1 semantics "locking clears selection"                                                  | 4 (shortcut), 6 (panel/palette handlers) |

Deviation from spec, decided during planning: the locked check lands in `bindingTargetAt`, **not** `canBindTo` — `canBindTo` is shared with `reconcileBindings.liveTarget`, and rejecting locked there would sever existing bindings, contradicting §1 ("existing arrow bindings … keep working"). Task 2 pins both behaviors with tests.
