# Move to Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Move to page" item to the element context menu that relocates a single, unbound, ungrouped, non-frame-member element to another page via a small floating page-picker, keeping its id and switching the view to the destination page with the element selected.

**Architecture:** A new pure eligibility function (`canMoveElementToPage`, `apps/web/src/driver/moveToPage.ts`) decides when the menu item is legal. A new presentational component (`PagePickerFlyout`, `packages/ui/src/PagePickerFlyout.tsx`) mirrors `ContextMenu`'s floating-panel and roving-focus keyboard-nav conventions to list target pages. `ContextMenuHost` gains a small piece of local state (`{ elementId, x, y } | null`) set by the new item's `perform()`, independent of the store's `contextMenu` state so the flyout survives the context menu closing; it renders `PagePickerFlyout` when that state is set. The actual move — soft-delete on the source `Scene`, push the same element (same id) onto the destination page's `Scene`, switch pages, select — lives in a new `moveElementToPage` callback in `App.tsx`, the only place with access to both the active `scene` and the full `pages: PageRecord[]` array.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Testing Library, Playwright — matches the rest of the repo, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-move-to-page-design.md`

## Global Constraints

- Visibility rule (all must hold for the item to appear): exactly one element selected; `groupIds.length === 0`; `frameId === null`; no `containerId` (isn't bound text inside a container); `boundElements` is `null` or empty (isn't a container with a bound label); if it's an arrow/line, `startBinding === null` and `endBinding === null`; no other element's `startBinding`/`endBinding` references its id; and more than one page exists in the document.
- The moved element **keeps its id** across the move — this is what makes it a move rather than a copy. No new `packages/scene` function; reuse the existing soft-delete pattern already used by `ContextMenuHost`'s Cut handler (`draft[i] = { ...draft[i], isDeleted: true }`).
- `ContextMenuHost` gains exactly two new props: `pages: readonly { id: string; name: string }[]` (target pages only — the caller excludes the current page before passing it down) and `onMoveElementToPage: (elementId: string, targetPageId: string) => void`.
- Clicking "Move to page" behaves like any other item (closes the context menu via `perform(); onClose()`), but `perform()` also opens the new `PagePickerFlyout` via local component state — zero changes to `ContextMenu.tsx` itself.
- Post-move: switch to the destination page and select the moved element there.
- No cross-page atomic undo — each page's `Scene` has fully independent undo/redo history; this is an accepted, documented limitation, not a defect to fix here.
- i18n: the new `contextMenu.moveToPage` string is added to both `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json` in the same step.
- Out of scope, do not build: multi-element/grouped/framed/bound-element moves, cross-page atomic undo, copy-to-page.
- Full gate (`typecheck`, `test`, `format:check`, `lint`, `e2e`) must be green before the final task's commit.

---

### Task 1: `contextMenu.moveToPage` locale strings

**Files:**

- Modify: `apps/web/src/locales/en/common.json:152-159` (the `contextMenu` object)
- Modify: `apps/web/src/locales/ko/common.json:141-148` (the `contextMenu` object)

**Interfaces:**

- Produces: `t("contextMenu.moveToPage")`, consumed by Task 5's `ContextMenuHost` item.

- [ ] **Step 1: Add the English string**

In `apps/web/src/locales/en/common.json`, change:

```json
  "contextMenu": {
    "copy": "Copy",
    "cut": "Cut",
    "paste": "Paste",
    "selectAll": "Select all",
    "zoomToFit": "Zoom to fit",
    "unlock": "Unlock"
  },
```

to:

```json
  "contextMenu": {
    "copy": "Copy",
    "cut": "Cut",
    "paste": "Paste",
    "selectAll": "Select all",
    "zoomToFit": "Zoom to fit",
    "unlock": "Unlock",
    "moveToPage": "Move to page"
  },
```

- [ ] **Step 2: Add the Korean string**

In `apps/web/src/locales/ko/common.json`, change:

```json
  "contextMenu": {
    "copy": "복사",
    "cut": "잘라내기",
    "paste": "붙여넣기",
    "selectAll": "전체 선택",
    "zoomToFit": "화면에 맞추기",
    "unlock": "잠금 해제"
  },
```

to:

```json
  "contextMenu": {
    "copy": "복사",
    "cut": "잘라내기",
    "paste": "붙여넣기",
    "selectAll": "전체 선택",
    "zoomToFit": "화면에 맞추기",
    "unlock": "잠금 해제",
    "moveToPage": "페이지로 이동"
  },
```

- [ ] **Step 3: Verify both files are valid JSON**

Run (from repo root): `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/locales/en/common.json'))" && node -e "JSON.parse(require('fs').readFileSync('apps/web/src/locales/ko/common.json'))"`
Expected: no output, exit code 0 (both parse cleanly).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: add contextMenu.moveToPage locale strings"
```

---

### Task 2: `PagePickerFlyout` presentational component

**Files:**

- Create: `packages/ui/src/PagePickerFlyout.tsx`
- Modify: `packages/ui/src/index.ts:20-21` (add export lines after the `ContextMenu` export block)
- Test: `packages/ui/test/PagePickerFlyout.test.tsx`

**Context:** Mirrors `packages/ui/src/ContextMenu.tsx` almost line-for-line: same viewport-edge-flipping (`useLayoutEffect` measuring the rendered box against `window.innerWidth`/`innerHeight`), same autofocus-first-item-on-mount, same roving-focus Arrow/Home/End keyboard nav and outside-`pointerdown`-closes behavior just shipped for `ContextMenu` in `96d4585`. The one behavioral difference: `ContextMenu`'s button `onClick` calls `item.perform(); onClose()` together, but `PagePickerFlyout`'s row click calls only `onSelect(pageId)` — closing is the caller's responsibility (`ContextMenuHost`, Task 5, closes it after acting on the selection), so `Escape`/outside-click (→ `onClose`) and click/Enter on a row (→ `onSelect`) are two independently testable, non-overlapping behaviors.

**Interfaces:**

- Consumes: nothing from this repo beyond React — pure, prop-driven, same convention as `ContextMenu`.
- Produces: `PagePickerPage` (`{ id: string; name: string }`) and `PagePickerFlyoutProps` (`{ x: number; y: number; pages: readonly PagePickerPage[]; onSelect: (pageId: string) => void; onClose: () => void }`) types, and the `PagePickerFlyout` component. Exported from `@excalidraw-clone/ui`. Task 5's `ContextMenuHost` renders it, passing it `pages` already filtered to exclude the currently active page.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/PagePickerFlyout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PagePickerFlyout, type PagePickerPage } from "../src/PagePickerFlyout"

const pages = (): PagePickerPage[] => [
  { id: "b", name: "Page B" },
  { id: "c", name: "Page C" },
  { id: "d", name: "Page D" },
]

const itemButton = (id: string): HTMLElement => screen.getByTestId(`page-picker-item-${id}`)

describe("PagePickerFlyout", () => {
  it("renders one row per page passed in (the caller has already excluded the current page)", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText("Page B")).toBeInTheDocument()
    expect(screen.getByText("Page C")).toBeInTheDocument()
    expect(screen.getByText("Page D")).toBeInTheDocument()
    expect(screen.queryByText("Page A")).not.toBeInTheDocument()
  })

  it("focuses the first row when it opens", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(itemButton("b")).toHaveFocus()
  })

  it("clicking a row calls onSelect with that page's id, and does not call onClose", async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={onClose} />)
    await userEvent.click(screen.getByText("Page C"))
    expect(onSelect).toHaveBeenCalledWith("c")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Enter on the focused row calls onSelect with that page's id", async () => {
    const onSelect = vi.fn()
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenCalledWith("c")
  })

  it("ArrowDown focuses the next row and ArrowUp the previous", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("c")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("c")).toHaveFocus()
  })

  it("ArrowDown from the last row wraps to the first", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("b")).toHaveFocus()
  })

  it("Home focuses the first row and End the last", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{End}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{Home}")
    expect(itemButton("b")).toHaveFocus()
  })

  it("Escape calls onClose without invoking onSelect", async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("a pointerdown outside the flyout calls onClose", async () => {
    const onClose = vi.fn()
    render(
      <div>
        <button type="button">outside</button>
        <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={onClose} />
      </div>,
    )
    await userEvent.click(screen.getByText("outside"))
    expect(onClose).toHaveBeenCalled()
  })

  it("assigns each row and the flyout a stable data-testid for e2e targeting", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(document.querySelector('[data-testid="page-picker-flyout"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="page-picker-item-b"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/ui`): `npx vitest run test/PagePickerFlyout.test.tsx`
Expected: FAIL — cannot find module `../src/PagePickerFlyout`.

- [ ] **Step 3: Implement `PagePickerFlyout`**

Create `packages/ui/src/PagePickerFlyout.tsx`:

```tsx
"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

export interface PagePickerPage {
  id: string
  name: string
}

export interface PagePickerFlyoutProps {
  x: number
  y: number
  pages: readonly PagePickerPage[]
  onSelect: (pageId: string) => void
  onClose: () => void
}

export function PagePickerFlyout({
  x,
  y,
  pages,
  onSelect,
  onClose,
}: PagePickerFlyoutProps): React.ReactElement {
  const flyoutRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = flyoutRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
    const top = y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    flyoutRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [])

  useEffect(() => {
    const moveFocus = (next: (current: number, count: number) => number): void => {
      const buttons = Array.from(
        flyoutRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      )
      if (buttons.length === 0) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[next(current, buttons.length)]?.focus()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        moveFocus((i, n) => (i + 1) % n)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        moveFocus((i, n) => (i <= 0 ? n - 1 : i - 1))
      } else if (e.key === "Home") {
        e.preventDefault()
        moveFocus(() => 0)
      } else if (e.key === "End") {
        e.preventDefault()
        moveFocus((_, n) => n - 1)
      }
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (!flyoutRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [onClose])

  return (
    <div
      ref={flyoutRef}
      role="menu"
      data-testid="page-picker-flyout"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-panel py-1 shadow-xl"
    >
      {pages.map((page) => (
        <button
          key={page.id}
          role="menuitem"
          type="button"
          data-testid={`page-picker-item-${page.id}`}
          onClick={() => onSelect(page.id)}
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
        >
          <span>{page.name}</span>
        </button>
      ))}
    </div>
  )
}
```

Add to `packages/ui/src/index.ts`, immediately after the existing `ContextMenu` export block (after `export type { ContextMenuItem, ContextMenuProps } from "./ContextMenu"`):

```ts
export { PagePickerFlyout } from "./PagePickerFlyout"
export type { PagePickerFlyoutProps, PagePickerPage } from "./PagePickerFlyout"
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/ui`): `npx vitest run test/PagePickerFlyout.test.tsx`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/PagePickerFlyout.tsx packages/ui/src/index.ts packages/ui/test/PagePickerFlyout.test.tsx
git commit -m "ui: add PagePickerFlyout component"
```

---

### Task 3: `canMoveElementToPage` — the element-eligibility rule

**Files:**

- Create: `apps/web/src/driver/moveToPage.ts`
- Test: `apps/web/test/moveToPage-driver.test.ts`

**Context:** This is the pure, element-shape half of the spec's visibility rule (the "more than one page exists" half is a document-level concern handled directly in `ContextMenuHost`, Task 5, since it already receives a pre-filtered `pages` prop). Follows this repo's `<name>-driver.test.ts` naming convention for driver-file tests (see `apps/web/test/pages-driver.test.ts` for `driver/pages.ts`, `apps/web/test/clipboard-driver.test.ts` for `driver/clipboard.ts`).

**Interfaces:**

- Consumes: `ExcalidrawElement` type from `@excalidraw-clone/scene` (existing).
- Produces: `canMoveElementToPage(element: ExcalidrawElement, allElements: readonly ExcalidrawElement[]): boolean`. Task 5's `ContextMenuHost` calls this (combined with its own `elementIds.length === 1 && pages.length > 0` check) to decide whether to show the "Move to page" item.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/moveToPage-driver.test.ts`:

```ts
import { newArrow, newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { canMoveElementToPage } from "../src/driver/moveToPage"

describe("canMoveElementToPage", () => {
  it("allows a plain, unbound, ungrouped, unframed element", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(canMoveElementToPage(rect, [rect])).toBe(true)
  })

  it("disallows an element that belongs to a group", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    expect(canMoveElementToPage(rect, [rect])).toBe(false)
  })

  it("disallows an element that is a member of a frame", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), frameId: "f1" }
    expect(canMoveElementToPage(rect, [rect])).toBe(false)
  })

  it("disallows a container with a bound label riding along", () => {
    const text = newText({ x: 0, y: 0, text: "hi" })
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    expect(canMoveElementToPage(rect, [rect, text])).toBe(false)
  })

  it("disallows bound text that lives inside a container", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const text = { ...newText({ x: 0, y: 0, text: "hi" }), containerId: rect.id }
    expect(canMoveElementToPage(text, [rect, text])).toBe(false)
  })

  it("disallows an arrow with a startBinding", () => {
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      startBinding: { elementId: target.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(arrow, [target, arrow])).toBe(false)
  })

  it("disallows an arrow with an endBinding", () => {
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      endBinding: { elementId: target.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(arrow, [target, arrow])).toBe(false)
  })

  it("disallows an element that another arrow's startBinding targets", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      startBinding: { elementId: rect.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(rect, [rect, arrow])).toBe(false)
  })

  it("disallows an element that another arrow's endBinding targets", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      endBinding: { elementId: rect.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(rect, [rect, arrow])).toBe(false)
  })

  it("allows an arrow that has neither its own bindings nor is targeted by another", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const other = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
    expect(canMoveElementToPage(arrow, [arrow, other])).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run test/moveToPage-driver.test.ts`
Expected: FAIL — cannot find module `../src/driver/moveToPage`.

- [ ] **Step 3: Implement `canMoveElementToPage`**

Create `apps/web/src/driver/moveToPage.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/**
 * Eligibility rule for the context menu's "Move to page" action (single-element
 * moves only, per docs/superpowers/specs/2026-08-16-move-to-page-design.md).
 * True when `element` can be relocated to another page without leaving a
 * dangling group/frame/binding reference behind: it belongs to no group, is
 * not a frame member, carries no bound label and is not itself bound text,
 * has no live start/end binding of its own (arrow/line), and no other
 * element's binding targets it.
 */
export function canMoveElementToPage(
  element: ExcalidrawElement,
  allElements: readonly ExcalidrawElement[],
): boolean {
  if (element.groupIds.length > 0) return false
  if (element.frameId !== null) return false
  if (element.boundElements !== null && element.boundElements.length > 0) return false
  if (element.type === "text" && element.containerId !== null) return false
  if (element.type === "arrow" || element.type === "line") {
    if (element.startBinding !== null || element.endBinding !== null) return false
  }
  const isBindingTarget = allElements.some(
    (el) =>
      (el.type === "arrow" || el.type === "line") &&
      (el.startBinding?.elementId === element.id || el.endBinding?.elementId === element.id),
  )
  return !isBindingTarget
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run test/moveToPage-driver.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/moveToPage.ts apps/web/test/moveToPage-driver.test.ts
git commit -m "web: add canMoveElementToPage eligibility rule"
```

---

### Task 4: `moveElementToPage` callback in `App.tsx`

**Files:**

- Modify: `apps/web/src/components/App.tsx:355-358` (insert immediately after the existing `renderThumbnail` callback, before `return (` at line 360)

**Context:** No dedicated unit test for this task. `App.tsx`'s `Inner` component has no existing unit-test file or pattern for testing its callbacks directly (its logic is exercised entirely through Playwright e2e specs, same as `switchToPage`, the `onAdd`/`onDuplicate`/`onDelete` `PagesTabBar` handlers, and every other callback already in this file). This callback is instead verified by Task 6's e2e spec (`move-to-page.spec.ts`), which asserts the element's soft-delete on the source page, its arrival with the same id on the destination page, the view switch, and the selection — end to end.

One non-obvious detail this step must get right: the existing per-active-page thumbnail-flush effect (`apps/web/src/components/App.tsx:169-187`) is subscribed to whichever `Scene` is currently active. Soft-deleting the element happens on the _source_ scene while it is still active, so that effect's `saver.schedule()` fires — but it's a 500ms-debounced flush, and `switchToPage`'s `setActivePageId` call (which happens synchronously afterward, in the same handler) tears the effect down before the debounce elapses, via `saver.dispose()` (`packages/persistence/src/auto-save.ts:42-46`, which only cancels the pending timer — it does not flush). The result: without an explicit fix, the source page's thumbnail would go stale after a move, still showing the removed element. This callback works around it exactly the way `PagesTabBar`'s existing `onAdd`/`onDuplicate` handlers already refresh a page's thumbnail explicitly (`apps/web/src/components/App.tsx:572-578`, `:599-605`) — call `renderPageThumbnail` for the source page directly, before switching away.

**Interfaces:**

- Consumes (all already in scope in `Inner`): `scene: Scene` (line 93-96), `pages: PageRecord[]` (line 90), `activePageId: string` (line 91), `canvasBg`/`resolvedTheme` (lines 97-98), `renderPageThumbnail` (imported line 61), `setThumbnails` (line 92), `switchToPage` (defined lines 103-126), `useAppStore` (imported line 69).
- Produces: `moveElementToPage(elementId: string, targetPageId: string): void`. Task 5 passes this as `ContextMenuHost`'s `onMoveElementToPage` prop.

- [ ] **Step 1: Add the callback**

In `apps/web/src/components/App.tsx`, insert the following immediately after the `renderThumbnail` callback (current lines 355-358, ending `}, [])`) and before the blank line preceding `return (`:

```tsx
const moveElementToPage = useCallback(
  (elementId: string, targetPageId: string): void => {
    const element = scene.getElements().find((el) => el.id === elementId)
    const target = pages.find((p) => p.id === targetPageId)
    if (!element || !target) return
    scene.mutate((draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i]!.id === elementId) draft[i] = { ...draft[i]!, isDeleted: true }
      }
    })
    target.scene.mutate((draft) => {
      draft.push(element)
    })
    // The per-active-page thumbnail-flush effect below is subscribed to the
    // *source* scene at this point (we haven't switched pages yet) but gets
    // torn down by switchToPage's setActivePageId before its 500ms debounce
    // fires, so it never runs for this mutation. Refresh the source page's
    // thumbnail explicitly, the same way onAdd/onDuplicate below refresh a
    // freshly created page's.
    void renderPageThumbnail(scene, canvasBg, resolvedTheme)
      .then((thumb) => {
        setThumbnails((prev) => ({ ...prev, [activePageId]: thumb }))
      })
      .catch(() => {
        // Leave the source page's last-good thumbnail in place if this render fails.
      })
    switchToPage(targetPageId)
    useAppStore.getState().setSelection([elementId])
  },
  [scene, pages, activePageId, canvasBg, resolvedTheme, switchToPage],
)
```

- [ ] **Step 2: Run typecheck to confirm it compiles**

Run (from repo root): `npm run typecheck`
Expected: PASS. (ESLint may flag `moveElementToPage` as an unused local until Task 5 wires it into the `ContextMenuHost` render — that's expected and resolved there; the full-gate `lint` run is deferred to Task 7.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/App.tsx
git commit -m "web: add moveElementToPage callback to App"
```

---

### Task 5: Wire `ContextMenuHost` — new props, flyout state, the "Move to page" item

**Files:**

- Modify: `apps/web/src/components/ContextMenuHost.tsx` (full-file rewrite — see Step 1)
- Modify: `apps/web/src/components/App.tsx:683` (the `<ContextMenuHost scene={scene} />` render call)

**Context:** This is the wiring task. `ContextMenuHost` currently returns `null` immediately when `contextMenu` (the Zustand store slice) is `null` (line 38: `if (!contextMenu) return null`). That early return is a problem for this feature: `ContextMenu`'s own button `onClick` always runs `item.perform(); onClose()` together (`packages/ui/src/ContextMenu.tsx:86-89`), and `onClose` nulls out the store's `contextMenu` — so if the new item's `perform()` only set local flyout state, the very next line (`onClose()`) would cause `ContextMenuHost` to re-render, hit the early return, and return `null` before the flyout could ever be seen. The fix: move the flyout's local state above the early-return check, and restructure the return to render `ContextMenu` and `PagePickerFlyout` independently, each gated on its own state.

**Interfaces:**

- Consumes: `PagePickerFlyout` (Task 2, from `@excalidraw-clone/ui`), `canMoveElementToPage` (Task 3, from `../driver/moveToPage`), `moveElementToPage` (Task 4, passed in as the new `onMoveElementToPage` prop).
- Produces: `ContextMenuHostProps` (`{ scene: Scene; pages: readonly { id: string; name: string }[]; onMoveElementToPage: (elementId: string, targetPageId: string) => void }`), and a `"move-to-page"` item (`data-testid="context-menu-item-move-to-page"`) that appears in the unlocked single-element menu when `canMoveElementToPage` allows it and `pages.length > 0`. Task 6's e2e spec targets both this item's testid and `PagePickerFlyout`'s `page-picker-flyout`/`page-picker-item-{id}` testids.

- [ ] **Step 1: Replace `ContextMenuHost.tsx` in full**

Replace the entire contents of `apps/web/src/components/ContextMenuHost.tsx` with:

```tsx
"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import {
  bringForward,
  bringToFront,
  duplicateElements,
  type ExcalidrawElement,
  getElementsBounds,
  groupElements,
  lockElements,
  type Scene,
  sendBackward,
  sendToBack,
  ungroupElements,
  unlockElements,
} from "@excalidraw-clone/scene"
import { ContextMenu, type ContextMenuItem, PagePickerFlyout } from "@excalidraw-clone/ui"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { buildPaste, copyPayload } from "../driver/clipboard"
import { canMoveElementToPage } from "../driver/moveToPage"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"

// Same predicate as apps/web/src/keyboard/clipboard.ts's private selectableIds —
// pasted/duplicated bound text rides along with its container but isn't itself selectable.
const selectableIds = (els: readonly ExcalidrawElement[]): string[] =>
  els.filter((el) => !(el.type === "text" && el.containerId !== null)).map((el) => el.id)

export interface ContextMenuHostProps {
  scene: Scene
  pages: readonly { id: string; name: string }[]
  onMoveElementToPage: (elementId: string, targetPageId: string) => void
}

export function ContextMenuHost({
  scene,
  pages,
  onMoveElementToPage,
}: ContextMenuHostProps): React.ReactElement | null {
  const { t } = useTranslation()
  const contextMenu = useAppStore((s) => s.contextMenu)
  // Must be referentially stable: ContextMenu keys its window keydown/pointerdown
  // effect on `onClose`, and App re-renders on every store change (Escape also
  // clears the selection via attachShortcuts). A fresh closure per render would
  // tear the Escape listener down mid-dispatch, so it would never fire.
  const close = useCallback((): void => useAppStore.getState().setContextMenu(null), [])
  // Set by the "Move to page" item's perform(). Kept independent of `contextMenu`
  // itself: ContextMenu's onClick always runs perform() then onClose() together,
  // and onClose nulls out the store's contextMenu, so flyout state must live
  // outside it or the flyout would never get a chance to render.
  const [flyout, setFlyout] = useState<{ elementId: string; x: number; y: number } | null>(null)

  const items: ContextMenuItem[] = []

  if (contextMenu) {
    if (contextMenu.target === "canvas") {
      const { scenePoint } = contextMenu
      items.push({
        id: "paste",
        label: t("contextMenu.paste"),
        perform: () => {
          void navigator.clipboard
            ?.readText()
            .then((text) => {
              const pasted = buildPaste(text, scenePoint)
              if (pasted.length === 0) return
              scene.mutate((draft) => {
                draft.push(...pasted)
              })
              useAppStore.getState().setSelection(selectableIds(pasted))
            })
            .catch(() => {})
        },
      })
      items.push({
        id: "select-all",
        label: t("contextMenu.selectAll"),
        perform: () => {
          useAppStore
            .getState()
            .setSelection(selectableIds(scene.getElements().filter((el) => !el.locked)))
        },
      })
      const bounds = getElementsBounds(scene.getElements())
      if (bounds) {
        items.push({
          id: "zoom-to-fit",
          label: t("contextMenu.zoomToFit"),
          perform: () => {
            useAppStore
              .getState()
              .setView(fitToContent(bounds, window.innerWidth, window.innerHeight))
          },
        })
      }
    } else {
      const { elementIds, locked, scenePoint } = contextMenu
      const selectedElements = scene.getElements().filter((el) => elementIds.includes(el.id))

      items.push({
        id: "copy",
        label: t("contextMenu.copy"),
        perform: () => {
          const payload = copyPayload(scene.getElements(), elementIds)
          if (payload) void navigator.clipboard?.writeText(payload.text).catch(() => {})
        },
      })

      if (locked) {
        items.push({
          id: "unlock",
          label: t("contextMenu.unlock"),
          perform: () => {
            patchScene(scene, unlockElements(scene.getElements(), elementIds))
            useAppStore.getState().setSelection(elementIds)
          },
        })
      } else {
        items.push({
          id: "cut",
          label: t("contextMenu.cut"),
          perform: () => {
            const payload = copyPayload(scene.getElements(), elementIds)
            if (!payload) return
            void navigator.clipboard?.writeText(payload.text).catch(() => {})
            const doomed = new Set(payload.ids)
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                if (doomed.has(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
              }
            })
            useAppStore.getState().setSelection([])
          },
        })
        items.push({
          id: "paste",
          label: t("contextMenu.paste"),
          perform: () => {
            void navigator.clipboard
              ?.readText()
              .then((text) => {
                const pasted = buildPaste(text, scenePoint)
                if (pasted.length === 0) return
                scene.mutate((draft) => {
                  draft.push(...pasted)
                })
                useAppStore.getState().setSelection(selectableIds(pasted))
              })
              .catch(() => {})
          },
        })
        items.push({
          id: "duplicate",
          label: t("properties.duplicate"),
          perform: () => {
            const copies = duplicateElements(scene.getElements(), elementIds)
            scene.mutate((draft) => {
              draft.push(...copies)
            })
            useAppStore.getState().setSelection(selectableIds(copies))
          },
        })
        if (elementIds.length === 1 && pages.length > 0) {
          const el = selectedElements[0]
          if (el && canMoveElementToPage(el, scene.getElements())) {
            items.push({
              id: "move-to-page",
              label: t("contextMenu.moveToPage"),
              perform: () => {
                setFlyout({ elementId: el.id, x: contextMenu.x, y: contextMenu.y })
              },
            })
          }
        }
        items.push({
          id: "delete",
          label: t("properties.delete"),
          perform: () => {
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                if (elementIds.includes(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
              }
            })
            useAppStore.getState().setSelection([])
          },
        })
        items.push({
          id: "bring-to-front",
          label: t("properties.bringToFront"),
          perform: () => {
            scene.mutate((draft) => {
              const next = bringToFront(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "bring-forward",
          label: t("properties.bringForward"),
          perform: () => {
            scene.mutate((draft) => {
              const next = bringForward(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "send-backward",
          label: t("properties.sendBackward"),
          perform: () => {
            scene.mutate((draft) => {
              const next = sendBackward(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        items.push({
          id: "send-to-back",
          label: t("properties.sendToBack"),
          perform: () => {
            scene.mutate((draft) => {
              const next = sendToBack(draft, elementIds)
              draft.length = 0
              draft.push(...next)
            })
          },
        })
        if (elementIds.length >= 2) {
          items.push({
            id: "group",
            label: t("properties.group"),
            perform: () => {
              const byId = new Map(
                groupElements(selectedElements, elementIds, crypto.randomUUID()).map((el) => [
                  el.id,
                  el,
                ]),
              )
              if (byId.size === 0) return
              scene.mutate((draft) => {
                for (let i = 0; i < draft.length; i += 1) {
                  const p = byId.get(draft[i]!.id)
                  if (p) draft[i] = p
                }
              })
            },
          })
        }
        if (selectedElements.some((el) => el.groupIds.length > 0)) {
          items.push({
            id: "ungroup",
            label: t("properties.ungroup"),
            perform: () => {
              const byId = new Map(
                ungroupElements(selectedElements, elementIds).map((el) => [el.id, el]),
              )
              if (byId.size === 0) return
              scene.mutate((draft) => {
                for (let i = 0; i < draft.length; i += 1) {
                  const p = byId.get(draft[i]!.id)
                  if (p) draft[i] = p
                }
              })
            },
          })
        }
        items.push({
          id: "lock",
          label: t("properties.lock"),
          perform: () => {
            patchScene(scene, lockElements(scene.getElements(), elementIds))
            useAppStore.getState().setSelection([])
          },
        })
      }
    }
  }

  if (!contextMenu && !flyout) return null

  return (
    <>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={items} onClose={close} />
      )}
      {flyout && (
        <PagePickerFlyout
          x={flyout.x}
          y={flyout.y}
          pages={pages}
          onSelect={(targetPageId) => {
            onMoveElementToPage(flyout.elementId, targetPageId)
            setFlyout(null)
          }}
          onClose={() => setFlyout(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Wire the new props at the call site in `App.tsx`**

In `apps/web/src/components/App.tsx`, change line 683 from:

```tsx
<ContextMenuHost scene={scene} />
```

to:

```tsx
<ContextMenuHost
  scene={scene}
  pages={pages.filter((p) => p.id !== activePageId).map((p) => ({ id: p.id, name: p.name }))}
  onMoveElementToPage={moveElementToPage}
/>
```

- [ ] **Step 3: Run typecheck and the full web unit suite**

Run (from repo root): `npm run typecheck`
Run (from `apps/web`): `npx vitest run`
Expected: both PASS. (`moveElementToPage`, added in Task 4, is now referenced, so the earlier unused-local lint warning is resolved too.)

- [ ] **Step 4: Manual smoke-check**

Run (from `apps/web`): `npm run dev`, open the app, draw a rectangle, add a second page via the `+` tab, switch back to the first page, right-click the rectangle — expect a "Move to page" item in the menu. Click it — expect the context menu to close and a small flyout listing "Page 2" to appear at the same position. Click it — expect the rectangle to vanish from page 1, the view to switch to page 2, and the rectangle to reappear there (selected — the Properties panel should be visible). Stop the dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ContextMenuHost.tsx apps/web/src/components/App.tsx
git commit -m "web: wire Move to page into ContextMenuHost"
```

---

### Task 6: E2E coverage

**Files:**

- Create: `apps/web/e2e/move-to-page.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `./_helpers` (existing, used by every other e2e spec); testids `toolbar-rectangle`, `toolbar-selection`, `toolbar-arrow`, `page-add`, `page-tab-{id}`, `page-switch-{id}`, `context-menu`, `context-menu-item-move-to-page` (Task 5), `page-picker-flyout`, `page-picker-item-{id}` (Task 2), `panel-lock` (existing, `packages/ui/src/PropertiesPanel.tsx:367` — only rendered when something is selected, used here as the observable signal that the moved element landed selected).
- Produces: end-to-end confidence that Tasks 1-5 work together through a real browser, matching the depth of coverage `context-menu.spec.ts`/`pages.spec.ts` already provide for their features.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/move-to-page.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneDoc = {
  pages: {
    id: string
    name: string
    elements: { id: string; type: string; isDeleted?: boolean }[]
  }[]
  activePageId: string
}

const readDoc = async (page: Page): Promise<SceneDoc | null> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  if (json === null) return null
  return JSON.parse(json) as SceneDoc
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
})

const drawRect = async (page: Page) => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("move to page relocates the element, switches view, selects it, and refreshes both tab thumbnails", async ({
  page,
}) => {
  await drawRect(page)
  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")

  // Capture the source thumbnail with the rectangle still on it, before the move.
  await expect
    .poll(async () => page.locator(`[data-testid="page-thumb-${firstId}"]`).getAttribute("src"), {
      timeout: 3000,
    })
    .toMatch(/^data:image\/png;base64,/)
  const beforeMoveThumb = await page
    .locator(`[data-testid="page-thumb-${firstId}"]`)
    .getAttribute("src")

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await expect.poll(async () => (await readDoc(page))?.pages.length).toBe(2)
  const doc1 = await readDoc(page)
  const secondId = doc1!.pages[1]!.id

  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(firstId)

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-move-to-page"]').click()

  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="page-picker-flyout"]')).toBeVisible()
  await expect(page.locator(`[data-testid="page-picker-item-${secondId}"]`)).toBeVisible()
  await page.locator(`[data-testid="page-picker-item-${secondId}"]`).click()

  await expect(page.locator('[data-testid="page-picker-flyout"]')).toHaveCount(0)
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(secondId)

  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages
        .find((p) => p.id === firstId)
        ?.elements.filter((e) => !e.isDeleted && e.type === "rectangle").length
    })
    .toBe(0)
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages
        .find((p) => p.id === secondId)
        ?.elements.filter((e) => !e.isDeleted && e.type === "rectangle").length
    })
    .toBe(1)
  const finalDoc = await readDoc(page)
  const sourceRectId = doc1!.pages[0]!.elements.find((e) => e.type === "rectangle")!.id
  const destRectId = finalDoc!.pages
    .find((p) => p.id === secondId)!
    .elements.find((e) => e.type === "rectangle" && !e.isDeleted)!.id
  expect(destRectId).toBe(sourceRectId) // same id — a move, not a copy

  // Selected on arrival: PropertiesPanel only renders when something is selected.
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()

  // Source page's thumbnail no longer shows the moved rectangle.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect
    .poll(async () => page.locator(`[data-testid="page-thumb-${firstId}"]`).getAttribute("src"), {
      timeout: 3000,
    })
    .not.toBe(beforeMoveThumb)
})

test("negative: item absent for a multi-selection, a bound element, and when only one page exists", async ({
  page,
}) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Only one page: absent even for an otherwise-eligible element.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
  await page.keyboard.press("Escape")

  // Add a second page so the item would otherwise be eligible to appear.
  await page.locator('[data-testid="page-add"]').click()
  const firstTab = page.locator('[data-testid^="page-tab-"]').first()
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()

  // Draw a second rectangle clear of the first, marquee-select both, right-click
  // one of them: multi-selection hides the item (elementIds.length > 1). This
  // path also covers grouped elements — right-clicking any grouped member always
  // expands the selection to the whole group first, so it is unreachable through
  // the UI with a single element id; canMoveElementToPage's own groupIds check
  // (Task 3) is unit-tested directly instead.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 280, y: 150 }, { x: 340, y: 210 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 130, y: 130 }, { x: 360, y: 240 })
  await page.waitForTimeout(150)
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
  await page.keyboard.press("Escape")

  // A rectangle that another arrow points at: hidden as a binding target.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 150 }, { x: 560, y: 210 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 200, y: 185 }, { x: 530, y: 180 })
  await page.waitForTimeout(700)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.mouse.click(box.x + 530, box.y + 200, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the new spec**

Run (from `apps/web`): `npm run e2e -- move-to-page.spec.ts`
Expected: PASS, both tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/move-to-page.spec.ts
git commit -m "web: e2e coverage for move to page"
```

---

### Task 7: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate from repo root**

Run: `npm run typecheck && npm test && npm run format:check && npm run lint`
Expected: all green.

- [ ] **Step 2: Run the full e2e suite**

Run (from `apps/web`): `npm run e2e`
Expected: all green, including the new `move-to-page.spec.ts` alongside every pre-existing spec (no regressions in `context-menu.spec.ts`, `pages.spec.ts`, `arrow-binding.spec.ts`, `group.spec.ts`, etc.).

- [ ] **Step 3: If anything failed, fix and re-run**

Fix the specific failure in the file it points to, re-run only that suite to confirm, then re-run the full gate (Step 1) and full e2e (Step 2) once more before proceeding.

- [ ] **Step 4: Confirm the working tree is clean**

Run: `git status`
Expected: nothing to commit — every task already committed its own changes (Tasks 1-6). This step is a final confirmation, not a new commit.
