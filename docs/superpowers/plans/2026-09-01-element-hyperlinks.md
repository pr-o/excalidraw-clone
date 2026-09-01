# Element Hyperlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach an external URL to any single element, surfaced as a corner link icon on hover/selection, opened by clicking the icon or `Cmd/Ctrl`-clicking the element, and set/edited/removed through a small popover reachable via `Cmd/Ctrl+K` or the right-click context menu.

**Architecture:** A new pure helper module (`apps/web/src/driver/link.ts`) owns every framework-free decision — input normalization, scheme sanitization, the mutation-draft write, `window.open`, and the "which element does the indicator point at" pick. A one-field Zustand slice (`linkEditor.ts`, a direct copy of `textEdit.ts`) holds `linkEditorElementId`. A single HTML overlay component (`LinkOverlay.tsx`), rendered as a sibling of `<TextEditingOverlay>` in `App.tsx`, is both the editor popover (when the slice id is set) and the hover/selection indicator (when it is not); it positions itself with the same `((el.x + scrollX) * zoom, …)` convention `TextEditingOverlay` uses and re-renders on every scene mutation because `App` already calls `useSceneRevision(scene)`. Entry points are wired in three existing files: `useDrawingDriver.ts` (`Cmd/Ctrl`-click opens), `ContextMenuHost.tsx` (create/edit/remove items), `keyboard/shortcuts.ts` (`Cmd/Ctrl+K`). No new dependencies.

**Tech Stack:** TypeScript, React 19, Zustand 5, react-i18next, Vitest + @testing-library/react (unit), Playwright (e2e) — matches the rest of the repo.

**Spec:** `docs/superpowers/specs/2026-09-01-element-hyperlinks-design.md`

## Global Constraints

- `link: string | null` **already exists** on `ExcalidrawElementBase` (`packages/scene/src/types.ts:78`) and `newElementBase` already defaults it to `null` (`packages/scene/src/factories.ts:77`). **No schema change, no migration, no `SCENE_FORMAT_VERSION` bump.**
- No element normalization on load is added. Every read path treats a falsy `link` as "no link" (`el.link` truthiness, or `el.link ?? null`). Elements from older storage may carry `link === undefined` — that must behave exactly like `null`.
- External URLs only. `sanitizeLinkHref` returns a usable href **only** for protocol `http:`, `https:`, or `mailto:`. Anything else (`javascript:`, `data:`, `file:`, unparseable) → `null`. Sanitize both when rendering an "Open" affordance and immediately before `window.open`.
- Link UI is **single-element only**. Never on a multi-selection. Never in the locked-element context-menu branch (that branch stays copy + unlock only).
- The indicator and popover **ignore element rotation** (`angle`) — anchored to the unrotated top-left corner.
- No hover preview card (icon + native `title` tooltip only). No dedicated toolbar button. Entry points are `Cmd/Ctrl+K` and the context menu.
- i18n: every new string is added to **both** `en/` and `ko/` in the same step. Korean strings are specified verbatim in each task.
- `window.open(href, "_blank", "noopener,noreferrer")` — exact 3rd argument.
- Full gate (`turbo run typecheck lint test` + `pnpm --filter web e2e`) green before the final task's commit. Use `turbo run lint --force` if the lint cache looks stale (known repo gotcha).

---

### Task 1: i18n strings (en + ko)

**Files:**

- Modify: `apps/web/src/locales/en/common.json:152-160` (the `contextMenu` object) and insert a new `linkEditor` object after it
- Modify: `apps/web/src/locales/ko/common.json:141-149` (the `contextMenu` object) and insert a new `linkEditor` object after it
- Modify: `apps/web/src/locales/en/shortcuts.json:38-39` (add two keys before the closing brace)
- Modify: `apps/web/src/locales/ko/shortcuts.json:38-39` (add two keys before the closing brace)

**Interfaces:**

- Produces: `t("contextMenu.createLink")`, `t("contextMenu.editLink")`, `t("contextMenu.removeLink")` (consumed by Task 7), `t("linkEditor.placeholder")`, `t("linkEditor.open")`, `t("linkEditor.remove")` (consumed by Task 4), `t("shortcuts:link")`, `t("shortcuts:openLink")` (consumed by Task 8). Default namespace is `common`; the `shortcuts:` prefix selects the `shortcuts` namespace.

- [ ] **Step 1: Add the English `common.json` strings**

In `apps/web/src/locales/en/common.json`, replace the `contextMenu` object (currently ending `"moveToPage": "Move to page"`) and add `linkEditor` immediately after it, so the region reads:

```json
  "contextMenu": {
    "copy": "Copy",
    "cut": "Cut",
    "paste": "Paste",
    "selectAll": "Select all",
    "zoomToFit": "Zoom to fit",
    "unlock": "Unlock",
    "moveToPage": "Move to page",
    "createLink": "Create link",
    "editLink": "Edit link",
    "removeLink": "Remove link"
  },
  "linkEditor": {
    "placeholder": "Paste or type a link",
    "open": "Open link",
    "remove": "Remove link"
  },
```

(The `"pages": {` object stays exactly where it is, right after `linkEditor`.)

- [ ] **Step 2: Add the Korean `common.json` strings**

In `apps/web/src/locales/ko/common.json`, do the same:

```json
  "contextMenu": {
    "copy": "복사",
    "cut": "잘라내기",
    "paste": "붙여넣기",
    "selectAll": "전체 선택",
    "zoomToFit": "화면에 맞추기",
    "unlock": "잠금 해제",
    "moveToPage": "페이지로 이동",
    "createLink": "링크 만들기",
    "editLink": "링크 편집",
    "removeLink": "링크 제거"
  },
  "linkEditor": {
    "placeholder": "링크를 붙여넣거나 입력하세요",
    "open": "링크 열기",
    "remove": "링크 제거"
  },
```

- [ ] **Step 3: Add the English `shortcuts.json` keys**

In `apps/web/src/locales/en/shortcuts.json`, change the last two lines from:

```json
  "nextPage": "Next page",
  "prevPage": "Previous page"
}
```

to:

```json
  "nextPage": "Next page",
  "prevPage": "Previous page",
  "link": "Add or edit link",
  "openLink": "Open element link"
}
```

- [ ] **Step 4: Add the Korean `shortcuts.json` keys**

In `apps/web/src/locales/ko/shortcuts.json`:

```json
  "nextPage": "다음 페이지",
  "prevPage": "이전 페이지",
  "link": "링크 추가/편집",
  "openLink": "요소 링크 열기"
}
```

- [ ] **Step 5: Verify all four files are valid JSON**

Run (from repo root):

```bash
node -e "for (const f of ['apps/web/src/locales/en/common.json','apps/web/src/locales/ko/common.json','apps/web/src/locales/en/shortcuts.json','apps/web/src/locales/ko/shortcuts.json']) JSON.parse(require('fs').readFileSync(f))"
```

Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/locales
git commit -m "web: add element-link i18n strings (en + ko)"
```

---

### Task 2: `apps/web/src/driver/link.ts` pure helpers

**Files:**

- Create: `apps/web/src/driver/link.ts`
- Test: `apps/web/test/link.test.ts`

**Context:** Follows the `commitTextEdit` / `renameFrame` driver-helper pattern (`apps/web/src/driver/*.ts`, tested in `apps/web/test/*.test.ts`, NOT co-located). `apps/web` unit tests run under Vitest with `environment: "jsdom"` and `globals: false` — so import `describe`/`it`/`expect`/`vi` from `vitest` explicitly, and there is no jest-dom (`toBeInTheDocument` is unavailable; use plain assertions).

**Interfaces:**

- Consumes: `ExcalidrawElement` type from `@excalidraw-clone/scene`; `pickElementAtPoint` from `./hitTest` (signature `pickElementAtPoint(elements: readonly ExcalidrawElement[], point: { x: number; y: number }, options?: { includeLocked?: boolean }): ExcalidrawElement | null`).
- Produces:
  - `normalizeLinkInput(raw: string): string | null`
  - `sanitizeLinkHref(link: string | null | undefined): string | null`
  - `commitElementLink(draft: ExcalidrawElement[], id: string, link: string | null): void`
  - `openLink(link: string | null | undefined): void`
  - `pickLinkIndicatorTarget(elements: readonly ExcalidrawElement[], selectedIds: readonly string[], pointer: { x: number; y: number } | null): ExcalidrawElement | null`

  Consumed by: Task 4 (`normalizeLinkInput`, `sanitizeLinkHref`, `commitElementLink`, `openLink`, `pickLinkIndicatorTarget`), Task 6 (`openLink`), Task 7 (`commitElementLink`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/link.test.ts`:

```ts
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import {
  commitElementLink,
  normalizeLinkInput,
  openLink,
  pickLinkIndicatorTarget,
  sanitizeLinkHref,
} from "../src/driver/link"

describe("normalizeLinkInput", () => {
  it("maps empty / whitespace-only input to null", () => {
    expect(normalizeLinkInput("")).toBeNull()
    expect(normalizeLinkInput("   ")).toBeNull()
  })

  it("prefixes https:// for a bare domain", () => {
    expect(normalizeLinkInput("example.com")).toBe("https://example.com")
  })

  it("trims before prefixing", () => {
    expect(normalizeLinkInput("  example.com  ")).toBe("https://example.com")
  })

  it("leaves an explicit URL scheme untouched", () => {
    expect(normalizeLinkInput("https://x.com")).toBe("https://x.com")
    expect(normalizeLinkInput("http://x.com")).toBe("http://x.com")
    expect(normalizeLinkInput("mailto:a@b.com")).toBe("mailto:a@b.com")
  })
})

describe("sanitizeLinkHref", () => {
  it("returns a normalized href for http(s) and mailto", () => {
    expect(sanitizeLinkHref("https://x.com")).toBe("https://x.com/")
    expect(sanitizeLinkHref("http://x.com/a")).toBe("http://x.com/a")
    expect(sanitizeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com")
  })

  it("rejects dangerous or unparseable values", () => {
    expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull()
    expect(sanitizeLinkHref("data:text/html,x")).toBeNull()
    expect(sanitizeLinkHref("file:///etc/passwd")).toBeNull()
    expect(sanitizeLinkHref("not a url")).toBeNull()
  })

  it("treats null / undefined / empty as no link", () => {
    expect(sanitizeLinkHref(null)).toBeNull()
    expect(sanitizeLinkHref(undefined)).toBeNull()
    expect(sanitizeLinkHref("")).toBeNull()
  })
})

describe("commitElementLink", () => {
  it("sets link on the matching element with a fresh object", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft = [rect]
    commitElementLink(draft, rect.id, "https://a.com")
    expect(draft[0]!.link).toBe("https://a.com")
    expect(draft[0]).not.toBe(rect)
  })

  it("clears link to null", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const draft = [rect]
    commitElementLink(draft, rect.id, null)
    expect(draft[0]!.link).toBeNull()
  })

  it("is a no-op when the id is absent", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft = [rect]
    expect(() => commitElementLink(draft, "nope", "x")).not.toThrow()
    expect(draft[0]).toBe(rect)
  })
})

describe("openLink", () => {
  it("opens a sanitized http(s) link in a new tab", () => {
    const spy = vi.spyOn(window, "open").mockReturnValue(null)
    openLink("https://example.com")
    expect(spy).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer")
    spy.mockRestore()
  })

  it("does nothing for a dangerous, empty, or missing link", () => {
    const spy = vi.spyOn(window, "open").mockReturnValue(null)
    openLink("javascript:alert(1)")
    openLink("")
    openLink(null)
    openLink(undefined)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("pickLinkIndicatorTarget", () => {
  it("returns the single selected element when it has a link", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)?.id).toBe(rect.id)
  })

  it("returns null when the single selected element has no link", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)).toBeNull()
  })

  it("returns null for a multi-selection", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const b = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), link: "https://b.com" }
    expect(pickLinkIndicatorTarget([a, b], [a.id, b.id], null)).toBeNull()
  })

  it("falls back to the linked element under the pointer", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    expect(pickLinkIndicatorTarget([rect], [], { x: 50, y: 50 })?.id).toBe(rect.id)
  })

  it("returns null when the pointer is over an unlinked element", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    expect(pickLinkIndicatorTarget([rect], [], { x: 50, y: 50 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from repo root): `pnpm --filter web test -- test/link.test.ts`
Expected: FAIL — cannot resolve `../src/driver/link`.

- [ ] **Step 3: Implement `link.ts`**

Create `apps/web/src/driver/link.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { pickElementAtPoint } from "./hitTest"

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/** Normalize what the user typed into the link editor into a storable value.
 *  Trim; empty → null; keep an explicit URL scheme as-is; otherwise assume a
 *  bare domain and prefix `https://` (matches Excalidraw). */
export function normalizeLinkInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  if (SCHEME_RE.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Return a safe, openable href, or null. Only http(s) and mailto pass; every
 *  other scheme and any unparseable string is rejected. Used both when deciding
 *  whether to show an "Open" affordance and immediately before `window.open`,
 *  so a hand-edited persisted file can never open a dangerous scheme. */
export function sanitizeLinkHref(link: string | null | undefined): string | null {
  if (!link) return null
  try {
    const url = new URL(link)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/** Mutation-draft helper (style of `commitTextEdit` / `renameFrame`): set or
 *  clear `link` on the element with `id`. No-op if the id is absent. */
export function commitElementLink(
  draft: ExcalidrawElement[],
  id: string,
  link: string | null,
): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  draft[i] = { ...draft[i]!, link }
}

/** Open a link in a new tab if — and only if — it sanitizes to a safe href. */
export function openLink(link: string | null | undefined): void {
  const href = sanitizeLinkHref(link)
  if (href) window.open(href, "_blank", "noopener,noreferrer")
}

/** Which element (if any) the corner link indicator should point at:
 *  1. the sole selected element, when it has a truthy link; else
 *  2. the topmost element under `pointer`, when it has a truthy link; else
 *  3. none. */
export function pickLinkIndicatorTarget(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
  pointer: { x: number; y: number } | null,
): ExcalidrawElement | null {
  if (selectedIds.length === 1) {
    const sole = elements.find((e) => e.id === selectedIds[0])
    if (sole && sole.link) return sole
  }
  if (pointer) {
    const hit = pickElementAtPoint(elements, pointer)
    if (hit && hit.link) return hit
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- test/link.test.ts`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/link.ts apps/web/test/link.test.ts
git commit -m "web: add link.ts pure helpers for element hyperlinks"
```

---

### Task 3: `linkEditor` store slice

**Files:**

- Create: `apps/web/src/store/slices/linkEditor.ts`
- Modify: `apps/web/src/store/index.ts` (import line after `:12`, `AppState` union after `:29`, `create` spread after `:46`)
- Test: `apps/web/test/store-linkEditor.test.ts`

**Context:** A byte-for-byte analogue of `apps/web/src/store/slices/textEdit.ts`.

**Interfaces:**

- Produces: `LinkEditorSlice` — `{ linkEditorElementId: string | null; setLinkEditorElementId: (id: string | null) => void }`, folded into `AppState`, so `useAppStore.getState().linkEditorElementId` and `useAppStore.getState().setLinkEditorElementId(...)` are available everywhere. Consumed by Tasks 4, 7, 8.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/store-linkEditor.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("linkEditorSlice", () => {
  beforeEach(() => useAppStore.getState().setLinkEditorElementId(null))

  it("starts null", () => {
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("setLinkEditorElementId sets and clears", () => {
    useAppStore.getState().setLinkEditorElementId("el-1")
    expect(useAppStore.getState().linkEditorElementId).toBe("el-1")
    useAppStore.getState().setLinkEditorElementId(null)
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- test/store-linkEditor.test.ts`
Expected: FAIL — `linkEditorElementId` / `setLinkEditorElementId` undefined (`setLinkEditorElementId is not a function`).

- [ ] **Step 3: Implement the slice**

Create `apps/web/src/store/slices/linkEditor.ts`:

```ts
import type { StateCreator } from "zustand"

export interface LinkEditorSlice {
  linkEditorElementId: string | null
  setLinkEditorElementId: (id: string | null) => void
}

export const createLinkEditorSlice: StateCreator<LinkEditorSlice, [], [], LinkEditorSlice> = (
  set,
) => ({
  linkEditorElementId: null,
  setLinkEditorElementId: (id) => set({ linkEditorElementId: id }),
})
```

- [ ] **Step 4: Wire it into `apps/web/src/store/index.ts`**

Add the import next to the other slice imports (keep alphabetical — right after the `library` import, before `palette`):

```ts
import { createLinkEditorSlice, type LinkEditorSlice } from "./slices/linkEditor"
```

Add `LinkEditorSlice` to the `AppState` intersection (append after `PointerSlice`):

```ts
export type AppState = ToolSlice &
  ThemeSlice &
  ViewSlice &
  GridSlice &
  DialogSlice &
  PaletteSlice &
  I18nSlice &
  SelectionSlice &
  ToolStateSlice &
  CanvasBgSlice &
  ContextMenuSlice &
  TextEditSlice &
  DispatchSlice &
  LibrarySlice &
  PointerSlice &
  LinkEditorSlice
```

Add the spread inside `create(...)` (append after `createPointerSlice(...a)`):

```ts
  ...createPointerSlice(...a),
  ...createLinkEditorSlice(...a),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test -- test/store-linkEditor.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store/slices/linkEditor.ts apps/web/src/store/index.ts apps/web/test/store-linkEditor.test.ts
git commit -m "web: add linkEditor store slice"
```

---

### Task 4: `LinkOverlay.tsx` — editor mode + App wiring + clear-on-page-switch

**Files:**

- Create: `apps/web/src/components/LinkOverlay.tsx`
- Modify: `apps/web/src/components/App.tsx` — import after `:75`; new `useEffect` after the `attachClipboard` effect (`:195-197`); render `<LinkOverlay scene={scene} />` after `<TextEditingOverlay scene={scene} />` at `:720`
- Test: `apps/web/test/LinkOverlay.test.tsx`

**Context:** Mirrors `apps/web/src/components/TextEditingOverlay.tsx` — `"use client"`, reads `scrollX`/`scrollY`/`zoom` from the store, positions with `(el.x + scrollX) * zoom` / `(el.y + scrollY) * zoom`, seeds a local `value` state from the element in a `useEffect` keyed on `[id, scene]` with `queueMicrotask(() => ref.current?.focus())`, guards `if (!target) return null`, wraps its controls in `className="z-40"`. `App` already calls `useSceneRevision(scene)` in its body, so `LinkOverlay` re-renders on every scene mutation (it follows a dragged element for free). `apps/web` unit tests have **no** jest-dom and **no** auto-cleanup (`globals: false`) — import `cleanup` and call it in `afterEach`, and assert with plain checks (`expect(x).toBeDefined()`, `container.querySelector(...)`).

This task adds only the **editor** half; Task 5 adds the indicator half to the same file.

**Interfaces:**

- Consumes: `normalizeLinkInput`, `sanitizeLinkHref`, `commitElementLink`, `openLink`, `pickLinkIndicatorTarget` from `../driver/link` (Task 2); `linkEditorElementId` / `setLinkEditorElementId` (Task 3); `Scene` type + `scene.mutate((draft) => void, opts?: { skipHistory?: boolean })` (`packages/scene/src/scene.ts:51`); `scene.getElements()` (returns non-deleted only).
- Produces: `LinkOverlay` — `function LinkOverlay({ scene }: { scene: Scene }): React.ReactElement | null`. DOM testids: `link-editor` (container), `link-editor-input`, `link-editor-open`, `link-editor-remove`. Consumed by Task 8 (e2e) and Task 5 (adds `link-indicator` to the same component).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/LinkOverlay.test.tsx`:

```tsx
import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import { LinkOverlay } from "../src/components/LinkOverlay"
import { ensureI18n } from "../src/i18n"
import { useAppStore } from "../src/store"

const renderOverlay = (scene: Scene) =>
  render(
    <I18nextProvider i18n={ensureI18n("en")}>
      <LinkOverlay scene={scene} />
    </I18nextProvider>,
  )

beforeEach(() => {
  useAppStore.getState().setLinkEditorElementId(null)
  useAppStore.getState().setSelection([])
  useAppStore.setState({ lastScenePointer: null })
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
})
afterEach(() => cleanup())

describe("LinkOverlay — editor mode", () => {
  it("renders an input seeded from the element's link, plus a remove button", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 10, y: 20, width: 30, height: 30 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    renderOverlay(scene)

    const input = screen.getByTestId("link-editor-input") as HTMLInputElement
    expect(input.value).toBe("https://a.com")
    expect(screen.getByTestId("link-editor-remove")).toBeDefined()
  })

  it("renders no remove button when the element has no link yet", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setLinkEditorElementId(rect.id)

    const { container } = renderOverlay(scene)

    expect(screen.getByTestId("link-editor-input")).toBeDefined()
    expect(container.querySelector('[data-testid="link-editor-remove"]')).toBeNull()
  })

  it("renders nothing when the editor id is not an element in the scene", () => {
    const scene = new Scene()
    useAppStore.getState().setLinkEditorElementId("missing")

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-editor"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- test/LinkOverlay.test.tsx`
Expected: FAIL — cannot resolve `../src/components/LinkOverlay`.

- [ ] **Step 3: Implement `LinkOverlay.tsx` (editor mode + indicator stub)**

Create `apps/web/src/components/LinkOverlay.tsx`:

```tsx
"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  commitElementLink,
  normalizeLinkInput,
  openLink,
  pickLinkIndicatorTarget,
  sanitizeLinkHref,
} from "../driver/link"
import { useAppStore } from "../store"

export function LinkOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const { t } = useTranslation()
  const editorId = useAppStore((s) => s.linkEditorElementId)
  const setEditorId = useAppStore((s) => s.setLinkEditorElementId)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const lastScenePointer = useAppStore((s) => s.lastScenePointer)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!editorId) return
    const el = scene.getElements().find((e) => e.id === editorId)
    setValue(el?.link ?? "")
    queueMicrotask(() => inputRef.current?.focus())
  }, [editorId, scene])

  if (editorId) {
    const el = scene.getElements().find((e) => e.id === editorId)
    if (!el) return null

    const left = (el.x + scrollX) * zoom
    const top = (el.y + scrollY) * zoom

    const commit = (): void => {
      const next = normalizeLinkInput(value)
      const changed = (el.link ?? null) !== next
      scene.mutate(
        (draft) => commitElementLink(draft, el.id, next),
        changed ? undefined : { skipHistory: true },
      )
      setEditorId(null)
    }

    return (
      <div
        data-testid="link-editor"
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          commit()
        }}
        style={{ position: "absolute", left: `${left}px`, top: `${top - 40}px` }}
        className="z-40 flex items-center gap-1 rounded-md border border-panel bg-panel px-1.5 py-1 shadow-lg"
      >
        <input
          ref={(node) => {
            inputRef.current = node
          }}
          type="text"
          data-testid="link-editor-input"
          value={value}
          placeholder={t("linkEditor.placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              setEditorId(null)
            }
          }}
          className="w-56 bg-transparent text-sm outline-none"
        />
        {sanitizeLinkHref(value) !== null && (
          <button
            type="button"
            data-testid="link-editor-open"
            title={t("linkEditor.open")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openLink(value)}
            className="rounded px-1 text-sm hover:bg-accent-soft"
          >
            &#8599;
          </button>
        )}
        {el.link ? (
          <button
            type="button"
            data-testid="link-editor-remove"
            title={t("linkEditor.remove")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              scene.mutate((draft) => commitElementLink(draft, el.id, null))
              setEditorId(null)
            }}
            className="rounded px-1 text-sm hover:bg-accent-soft"
          >
            &#10005;
          </button>
        ) : null}
      </div>
    )
  }

  const target = pickLinkIndicatorTarget(scene.getElements(), selectedIds, lastScenePointer)
  if (!target) return null

  const left = (target.x + scrollX) * zoom
  const top = (target.y + scrollY) * zoom

  return (
    <button
      type="button"
      data-testid="link-indicator"
      title={sanitizeLinkHref(target.link) ?? target.link ?? ""}
      onClick={() => openLink(target.link)}
      style={{ position: "absolute", left: `${left}px`, top: `${top - 22}px` }}
      className="z-40 rounded border border-panel bg-panel px-1 py-0.5 text-xs leading-none shadow hover:bg-accent-soft"
    >
      &#128279;
    </button>
  )
}
```

> Note: the indicator `<button>` at the bottom is exercised by Task 5's tests and Task 8's e2e; it is included here because it lives in the same component and keeping it out would mean editing this return structure twice.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- test/LinkOverlay.test.tsx`
Expected: PASS, all three editor-mode tests.

- [ ] **Step 5: Wire `LinkOverlay` into `App.tsx`**

Add the import after the `TextEditingOverlay` import (`apps/web/src/components/App.tsx:75`):

```tsx
import { LinkOverlay } from "./LinkOverlay"
```

Add this effect immediately after the `attachClipboard` effect (after `apps/web/src/components/App.tsx:197`):

```tsx
// Any page change (tab switch, Alt+PageUp/Down, opening a file) must drop a
// stale editor id from the previous page — same reasoning the codebase applies
// to textEditElementId. Keyed on activePageId so every path is covered.
useEffect(() => {
  useAppStore.getState().setLinkEditorElementId(null)
}, [activePageId])
```

Change the overlay render block near `apps/web/src/components/App.tsx:720` from:

```tsx
      <TextEditingOverlay scene={scene} />
    </main>
```

to:

```tsx
      <TextEditingOverlay scene={scene} />
      <LinkOverlay scene={scene} />
    </main>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/LinkOverlay.tsx apps/web/src/components/App.tsx apps/web/test/LinkOverlay.test.tsx
git commit -m "web: add LinkOverlay editor popover and wire into App"
```

---

### Task 5: `LinkOverlay.tsx` — indicator mode coverage

**Files:**

- Modify: `apps/web/test/LinkOverlay.test.tsx` (append an `describe` block; implementation already landed in Task 4)

**Context:** The indicator markup is already in `LinkOverlay.tsx` from Task 4. This task adds the missing test coverage for it, so a reviewer can gate "does the indicator appear for the right element" independently of the editor. `pickLinkIndicatorTarget` itself is already unit-tested in Task 2 — these tests verify the component renders/hides the `link-indicator` button off that result and wires its `title` and `onClick`.

**Interfaces:**

- Consumes: `LinkOverlay` (Task 4), `pickLinkIndicatorTarget` behavior (Task 2).
- Produces: no new code — closes the coverage gap for testid `link-indicator`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/LinkOverlay.test.tsx` (after the existing `describe("LinkOverlay — editor mode", …)` block, inside the same file — the `beforeEach`/`afterEach` above already apply):

```tsx
describe("LinkOverlay — indicator mode", () => {
  it("shows the link indicator for a single selected linked element", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setSelection([rect.id])

    renderOverlay(scene)

    const indicator = screen.getByTestId("link-indicator")
    expect(indicator).toBeDefined()
    expect(indicator.getAttribute("title")).toBe("https://a.com/")
  })

  it("shows no indicator when the sole selected element has no link", () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => d.push(rect))
    useAppStore.getState().setSelection([rect.id])

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
  })

  it("shows no indicator for a multi-selection even when both are linked", () => {
    const scene = new Scene()
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const b = { ...newRectangle({ x: 40, y: 0, width: 10, height: 10 }), link: "https://b.com" }
    scene.mutate((d) => d.push(a, b))
    useAppStore.getState().setSelection([a.id, b.id])

    const { container } = renderOverlay(scene)

    expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
  })

  it("falls back to the linked element under the last scene pointer", () => {
    const scene = new Scene()
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    scene.mutate((d) => d.push(rect))
    useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })

    renderOverlay(scene)

    expect(screen.getByTestId("link-indicator")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm --filter web test -- test/LinkOverlay.test.tsx`
Expected: PASS — both the Task 4 editor-mode tests and these four indicator-mode tests. (They pass immediately because the implementation shipped in Task 4; this task is a coverage-only checkpoint. If any fail, fix `LinkOverlay.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/LinkOverlay.test.tsx
git commit -m "web: cover LinkOverlay indicator mode"
```

---

### Task 6: `Cmd/Ctrl`-click to open a link (`useDrawingDriver.ts`)

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts` — import after `:23`; new guard inside `onPointerDown`, inserted after the `pending` block (`:258-270`) and before `canvas.setPointerCapture(e.pointerId)` at `:271`

**Context:** `onPointerDown` already computes `const store = useAppStore.getState()` at `:257` and has `clientToScene` + `pickElementAtPoint` in scope (imported at `:24-30` and `:23`). There is **no** unit-test harness for pointer events in this repo (`useDrawingDriver` uses native `addEventListener`; `apps/web/test` has none). Real coverage is Task 8's e2e (`Ctrl/Meta-click opens`). This task's checkpoint is a typecheck + a manual smoke.

**Interfaces:**

- Consumes: `openLink` from `./link` (Task 2); `store.activeTool`, `store.scrollX/scrollY/zoom`; `clientToScene(canvas, view, e)`; `pickElementAtPoint(elements, point)`.
- Produces: behavior only — a `Cmd/Ctrl`-click on a linked element while the selection tool is active opens the link and swallows the event (no selection change); a click on an unlinked element falls through to normal selection.

- [ ] **Step 1: Add the import**

In `apps/web/src/driver/useDrawingDriver.ts`, after `import { pickElementAtPoint } from "./hitTest"` (`:23`):

```ts
import { openLink } from "./link"
```

- [ ] **Step 2: Add the guard in `onPointerDown`**

Locate, inside `onPointerDown`, the end of the `pending` block:

```ts
        placeLibraryItem(pending, at.x, at.y, scene)
        store.clearPendingItem()
        overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
        return
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
```

Insert the new block between the closing `}` of the `pending` branch and `canvas.setPointerCapture(e.pointerId)`:

```ts
      }
      // Cmd/Ctrl-click on a linked element opens its link (selection tool only,
      // so drawing-tool modifier behavior is untouched; Cmd/Ctrl is otherwise
      // just "bypass snap" at drag time and does not change a plain click).
      if (store.activeTool === "selection" && (e.metaKey || e.ctrlKey)) {
        const at = clientToScene(
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e,
        )
        const hit = pickElementAtPoint(scene.getElements(), at)
        if (hit && hit.link) {
          openLink(hit.link)
          return
        }
      }
      canvas.setPointerCapture(e.pointerId)
      dispatchPointer("pointerDown", e)
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke-check**

Run (from repo root): `pnpm --filter web dev`. Open http://localhost:3000. Draw a rectangle, select it, press `Cmd/Ctrl+K`, type `example.com`, press Enter. Then hold `Cmd/Ctrl` and click the rectangle body — a new tab opens to `https://example.com/`. Hold `Cmd/Ctrl` and click empty canvas — nothing opens, selection clears as normal. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts
git commit -m "web: Cmd/Ctrl-click opens an element's link"
```

---

### Task 7: Context-menu create / edit / remove link items (`ContextMenuHost.tsx`)

**Files:**

- Modify: `apps/web/src/components/ContextMenuHost.tsx` — import after `:22`; new items in the unlocked single-selection path, inserted after the `move-to-page` `if` block (`:164-175`) and before the `delete` item push (`:176`)

**Context:** `ContextMenuHost` builds a `ContextMenuItem[]`; `ContextMenu` renders each as `<button data-testid={`context-menu-item-${item.id}`} onClick={() => { item.perform(); onClose() }}>`. The unlocked element branch already destructures `{ elementIds, locked, scenePoint }` and computes `const selectedElements = scene.getElements().filter((el) => elementIds.includes(el.id))`. The `move-to-page` block just above shows the single-selection guard. The locked branch (copy + unlock only) must **not** get link items. `ContextMenuHost` has no unit-test file; real coverage is Task 8's e2e — this task's checkpoint is typecheck + manual smoke, matching how the `move-to-page` wiring task was verified.

**Interfaces:**

- Consumes: `commitElementLink` from `../driver/link` (Task 2); `useAppStore.getState().setLinkEditorElementId` (Task 3); `t("contextMenu.createLink" | "editLink" | "removeLink")` (Task 1).
- Produces: menu items with ids `create-link`, `edit-link`, `remove-link` → testids `context-menu-item-create-link`, `context-menu-item-edit-link`, `context-menu-item-remove-link`. Shown only in the unlocked, exactly-one-selected path: `create-link` when the element has no link, otherwise `edit-link` + `remove-link`. Consumed by Task 8 (e2e).

- [ ] **Step 1: Add the import**

In `apps/web/src/components/ContextMenuHost.tsx`, change the existing `../driver/moveToPage` import line region. After:

```ts
import { canMoveElementToPage } from "../driver/moveToPage"
```

add:

```ts
import { commitElementLink } from "../driver/link"
```

(Keep imports ordered as the file/ESLint expects — `../driver/link` sorts before `../driver/moveToPage`, so place it on the line above `canMoveElementToPage`.)

- [ ] **Step 2: Add the three items**

Locate the end of the `move-to-page` block and the start of the `delete` push:

```ts
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
```

Insert between the closing `}` of the `move-to-page` `if` and `items.push({ id: "delete", …`:

```ts
        }
        if (elementIds.length === 1) {
          const linkEl = selectedElements[0]
          if (linkEl && !linkEl.link) {
            items.push({
              id: "create-link",
              label: t("contextMenu.createLink"),
              perform: () => useAppStore.getState().setLinkEditorElementId(linkEl.id),
            })
          } else if (linkEl) {
            items.push({
              id: "edit-link",
              label: t("contextMenu.editLink"),
              perform: () => useAppStore.getState().setLinkEditorElementId(linkEl.id),
            })
            items.push({
              id: "remove-link",
              label: t("contextMenu.removeLink"),
              perform: () => scene.mutate((draft) => commitElementLink(draft, linkEl.id, null)),
            })
          }
        }
        items.push({
          id: "delete",
```

- [ ] **Step 3: Typecheck and run the web unit suite**

Run: `pnpm --filter web typecheck`
Run: `pnpm --filter web test`
Expected: both PASS (no existing test asserts the exact context-menu item list; the new items are additive).

- [ ] **Step 4: Manual smoke-check**

Run: `pnpm --filter web dev`. Draw a rectangle. Right-click it → a "Create link" item appears (after "Move to page" when present, before "Delete"). Click it → the link popover opens anchored above the rectangle. Type `example.com`, press Enter. Right-click the rectangle again → now "Edit link" and "Remove link" appear instead of "Create link". Click "Remove link" → the corner indicator disappears. Right-click a **locked** element → only Copy + Unlock, no link items. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ContextMenuHost.tsx
git commit -m "web: add create/edit/remove link items to the element context menu"
```

---

### Task 8: `Cmd/Ctrl+K` shortcut + Help dialog rows

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts` — new `isMeta` block after the `isMeta && key === "/"` block (`:113-117`), before the `e.altKey && key === "pagedown"` block (`:118`)
- Test: `apps/web/test/keyboard-shortcuts.test.ts` — two new `it(...)` in the first `describe`
- Modify: `packages/ui/src/HelpDialog.tsx` — two rows appended to `EDITOR_SHORTCUTS` (`:28-41`), inserted before `{ keys: "Hold Cmd/Ctrl", label: "shortcuts:bypassSnap" }`
- Test: `packages/ui/test/HelpDialog.test.tsx` — one new `it(...)`
- Test: `apps/web/test/i18n-shortcuts.test.tsx` — two new assertions in the existing `it(...)`

**Context:** `attachShortcuts` early-returns when the event target is an INPUT/TEXTAREA/contentEditable, so `Cmd/Ctrl+K` typed inside the link editor input never reaches this handler. `key` is `e.key.toLowerCase()`; `isMeta` is `e.metaKey || e.ctrlKey`. `HelpDialog`'s `EDITOR_SHORTCUTS` is a `readonly Shortcut[]` of `{ keys, label }`; labels are resolved through `t(...)` with the `shortcuts:` namespace prefix. `packages/ui` tests **do** have jest-dom + auto-cleanup (`packages/ui/test/setup.ts`); `apps/web` tests do not.

**Interfaces:**

- Consumes: `useAppStore.getState().selectedIds` and `.setLinkEditorElementId` (Task 3); `t("shortcuts:link")`, `t("shortcuts:openLink")` (Task 1).
- Produces: `Cmd/Ctrl+K` → if exactly one element is selected, opens the link editor for it; otherwise a no-op (but always `preventDefault`s). Two new Help-dialog rows.

- [ ] **Step 1: Write the failing shortcut tests**

In `apps/web/test/keyboard-shortcuts.test.ts`, add inside the first `describe("keyboard shortcuts", …)` block (e.g. after the `"'?' opens help dialog"` test):

```ts
it("Cmd+K opens the link editor for a single selected element", () => {
  useAppStore.getState().setLinkEditorElementId(null)
  useAppStore.getState().setSelection(["el-1"])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  expect(useAppStore.getState().linkEditorElementId).toBe("el-1")
})

it("Cmd+K with a multi-selection is a no-op", () => {
  useAppStore.getState().setLinkEditorElementId(null)
  useAppStore.getState().setSelection(["el-1", "el-2"])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  expect(useAppStore.getState().linkEditorElementId).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test -- test/keyboard-shortcuts.test.ts`
Expected: FAIL — `linkEditorElementId` stays `null` in the first test (no handler yet).

- [ ] **Step 3: Implement the shortcut**

In `apps/web/src/keyboard/shortcuts.ts`, after:

```ts
if (isMeta && key === "/") {
  e.preventDefault()
  useAppStore.getState().setPaletteOpen(true)
  return
}
```

add:

```ts
if (isMeta && key === "k") {
  e.preventDefault()
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 1) useAppStore.getState().setLinkEditorElementId(ids[0]!)
  return
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter web test -- test/keyboard-shortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Help-dialog test**

In `packages/ui/test/HelpDialog.test.tsx`, add:

```tsx
it("lists the element-link shortcuts", () => {
  render(<HelpDialog t={t} open onClose={() => {}} />)
  expect(screen.getByText("Cmd/Ctrl+K")).toBeInTheDocument()
  expect(screen.getByText("Cmd/Ctrl+click")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:link")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:openLink")).toBeInTheDocument()
})
```

(`t` in this file is `(key) => key`, so labels render as their raw keys.)

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter ui test -- HelpDialog.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Cmd/Ctrl+K`.

- [ ] **Step 7: Add the Help-dialog rows**

In `packages/ui/src/HelpDialog.tsx`, change the tail of `EDITOR_SHORTCUTS` from:

```tsx
  { keys: "Cmd/Ctrl+A", label: "shortcuts:selectAll" },
  { keys: "Esc", label: "shortcuts:deselect" },
  { keys: "Hold Cmd/Ctrl", label: "shortcuts:bypassSnap" },
]
```

to:

```tsx
  { keys: "Cmd/Ctrl+A", label: "shortcuts:selectAll" },
  { keys: "Esc", label: "shortcuts:deselect" },
  { keys: "Cmd/Ctrl+K", label: "shortcuts:link" },
  { keys: "Cmd/Ctrl+click", label: "shortcuts:openLink" },
  { keys: "Hold Cmd/Ctrl", label: "shortcuts:bypassSnap" },
]
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm --filter ui test -- HelpDialog.test.tsx`
Expected: PASS.

- [ ] **Step 9: Extend the real-i18n Help test**

In `apps/web/test/i18n-shortcuts.test.tsx`, add two assertions inside the existing `it("renders translated shortcut row labels, not raw i18n keys", …)` (before the final `expect(screen.queryByText(/^shortcuts\./)).toBeNull()`):

```tsx
expect(screen.getByText("Add or edit link")).toBeDefined()
expect(screen.getByText("Open element link")).toBeDefined()
```

- [ ] **Step 10: Run to verify it passes**

Run: `pnpm --filter web test -- test/i18n-shortcuts.test.tsx`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts packages/ui/src/HelpDialog.tsx packages/ui/test/HelpDialog.test.tsx apps/web/test/i18n-shortcuts.test.tsx
git commit -m "web/ui: Cmd/Ctrl+K link shortcut and Help dialog rows"
```

---

### Task 9: E2E coverage (`apps/web/e2e/element-links.spec.ts`)

**Files:**

- Create: `apps/web/e2e/element-links.spec.ts`

**Context:** Follows `apps/web/e2e/context-menu.spec.ts` / `move-to-page.spec.ts` conventions: `beforeEach` does `goto("/")` → `localStorage.clear()` → `reload()` → wait for `toolbar-rectangle`; `dragOnCanvas` from `./_helpers` draws shapes; right-click via `page.mouse.click(x, y, { button: "right" })`. Playwright is `1.49` (`ControlOrMeta` modifier available). `window.open(..., "noopener,noreferrer")` still surfaces to Playwright as a `page`'s `"popup"` event. External navigation is stubbed with `context.route` so the tests do not depend on the network. Autosave is a ~500ms debounce — wait ~900ms before asserting on `localStorage`, as the other specs do.

**Interfaces:**

- Consumes: `dragOnCanvas` from `./_helpers`; testids `toolbar-rectangle`, `toolbar-selection` (existing); `link-editor-input`, `link-editor-remove` (Task 4); `link-indicator` (Task 4/5); `context-menu-item-create-link`, `context-menu-item-edit-link`, `context-menu-item-remove-link` (Task 7).
- Produces: end-to-end confidence that Tasks 1-8 work together in a browser.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/element-links.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.beforeEach(async ({ page, context }) => {
  await context.route("**://example.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><head><title>stub</title></head><body>ok</body></html>",
    }),
  )
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
})

const drawRect = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

const rectCenter = async (page: Page): Promise<{ x: number; y: number }> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + 200, y: box.y + 185 }
}

const selectRect = async (page: Page): Promise<void> => {
  const c = await rectCenter(page)
  await page.mouse.click(c.x, c.y)
}

const setLinkViaShortcut = async (page: Page, url: string): Promise<void> => {
  await selectRect(page)
  await page.keyboard.press("ControlOrMeta+k")
  const input = page.locator('[data-testid="link-editor-input"]')
  await expect(input).toBeVisible()
  await input.fill(url)
  await input.press("Enter")
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("Cmd/Ctrl+K sets a link that shows an indicator and survives a reload", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toBeVisible()

  await page.waitForTimeout(900) // autosave debounce
  await page.reload()
  await page.locator('[data-testid="toolbar-selection"]').click()
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toBeVisible()
})

test("Cmd/Ctrl-click on a linked element opens it in a new tab", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")

  const c = await rectCenter(page)
  await page.keyboard.down("ControlOrMeta")
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.mouse.click(c.x, c.y)])
  await page.keyboard.up("ControlOrMeta")
  await popup.waitForLoadState("domcontentloaded").catch(() => {})
  expect(popup.url()).toContain("example.com")
})

test("clicking the link indicator opens the link", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")
  await selectRect(page)

  const indicator = page.locator('[data-testid="link-indicator"]')
  await expect(indicator).toBeVisible()
  const [popup] = await Promise.all([page.waitForEvent("popup"), indicator.click()])
  await popup.waitForLoadState("domcontentloaded").catch(() => {})
  expect(popup.url()).toContain("example.com")
})

test("context menu: Create link, then Edit/Remove, then the indicator is gone", async ({
  page,
}) => {
  await drawRect(page)
  const c = await rectCenter(page)

  await page.mouse.click(c.x, c.y, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-create-link"]').click()

  const input = page.locator('[data-testid="link-editor-input"]')
  await expect(input).toBeVisible()
  await input.fill("https://example.com")
  await input.press("Enter")
  await page.locator('[data-testid="toolbar-selection"]').click()

  await page.mouse.click(c.x, c.y, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-edit-link"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-remove-link"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toHaveCount(0)

  await page.locator('[data-testid="context-menu-item-remove-link"]').click()
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toHaveCount(0)
})

test("no link editor opens for a multi-selection", async ({ page }) => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 180, y: 180 })
  await page.waitForTimeout(100)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 260, y: 120 }, { x: 320, y: 180 })
  await page.waitForTimeout(100)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 90, y: 90 }, { x: 350, y: 210 })
  await page.waitForTimeout(150)

  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.locator('[data-testid="link-editor-input"]')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the new spec**

Run (from repo root): `pnpm --filter web e2e element-links`
Expected: PASS, all five tests. (Playwright's `webServer` config starts `pnpm dev` automatically.)

- [ ] **Step 3: If a test fails**

Debug with `pnpm --filter web e2e element-links --headed --debug` or inspect `apps/web/test-results/`. Common causes: the link editor commits on blur, so switching tools mid-flow is intentional and safe; the indicator also appears from `lastScenePointer`, so a fresh `selectRect` before asserting keeps intent explicit. Fix the source, re-run this spec only, then continue.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/element-links.spec.ts
git commit -m "web: e2e coverage for element hyperlinks"
```

---

### Task 10: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint + unit, repo-wide**

Run (from repo root): `pnpm turbo run typecheck lint test`
Expected: all green. If `lint` reports paths from another worktree or otherwise looks stale, re-run `pnpm turbo run lint --force`.

- [ ] **Step 2: Full e2e suite**

Run (from repo root): `pnpm --filter web e2e`
Expected: all green — `element-links.spec.ts` plus every pre-existing spec (`context-menu.spec.ts`, `move-to-page.spec.ts`, `pages.spec.ts`, `arrow-binding.spec.ts`, `group.spec.ts`, …) with no regressions.

- [ ] **Step 3: If anything failed**

Fix the specific failure in the file it points to, re-run only that suite to confirm, then re-run Steps 1-2 once more before proceeding.

- [ ] **Step 4: Confirm the working tree is clean**

Run: `git status`
Expected: nothing to commit — every task committed its own changes. This is a final confirmation, not a new commit.

---

## Self-Review

**Spec coverage:**

| Spec section                                                                                                                  | Task(s)                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Data model — no schema/migration; falsy `link` = no link                                                                      | Global Constraints; Task 2 (`sanitizeLinkHref`/`pickLinkIndicatorTarget` use truthiness; `link ?? ""` in Task 4) |
| `apps/web/src/driver/link.ts` — `normalizeLinkInput`, `sanitizeLinkHref`, `commitElementLink`, `openLink`                     | Task 2                                                                                                           |
| `linkEditor` store slice                                                                                                      | Task 3                                                                                                           |
| `LinkOverlay.tsx` editor mode (input, Open, Unlink, Enter/Escape/blur, skipHistory on no-op, render null if not found)        | Task 4                                                                                                           |
| `LinkOverlay.tsx` indicator mode (selected-with-link → pointer-hit-with-link → none)                                          | Task 2 (`pickLinkIndicatorTarget`) + Task 4 (render) + Task 5 (coverage)                                         |
| Both modes wrapped in `z-40`; `TextEditingOverlay`-style anchor math                                                          | Task 4                                                                                                           |
| Render `<LinkOverlay>` as sibling of `<TextEditingOverlay>` in `App.tsx`                                                      | Task 4 Step 5                                                                                                    |
| `Cmd/Ctrl`-click opens (selection tool only, before pointer capture)                                                          | Task 6                                                                                                           |
| Context menu create/edit/remove (single selection, not locked, after duplicate/move-to-page, before delete)                   | Task 7                                                                                                           |
| `Cmd/Ctrl+K` in `shortcuts.ts` (single selection guard, `preventDefault`)                                                     | Task 8                                                                                                           |
| `HelpDialog` two rows                                                                                                         | Task 8                                                                                                           |
| Page switch clears `linkEditorElementId`                                                                                      | Task 4 Step 5 (`useEffect` on `activePageId`)                                                                    |
| i18n — `contextMenu.*`, `linkEditor.*` (en+ko), `shortcuts.link`/`openLink` (en+ko)                                           | Task 1                                                                                                           |
| Unit tests for `link.ts`                                                                                                      | Task 2                                                                                                           |
| E2E `element-links.spec.ts` (create+persist, Cmd/Ctrl+click open, indicator open, remove via menu, no UI for multi-selection) | Task 9                                                                                                           |
| Full gate                                                                                                                     | Task 10                                                                                                          |

No gaps.

**Placeholder scan:** No `TODO` / `TBD` / "add error handling" / "similar to Task N" / bare prose code steps. Every code step carries real code. The two UI-only tasks (6, 7) without an automated unit test state so explicitly and point at Task 9 for coverage plus a concrete manual smoke — consistent with how the shipped `move-to-page` plan treated its `ContextMenuHost`/`App.tsx` wiring tasks.

**Type consistency:**

- `commitElementLink(draft: ExcalidrawElement[], id: string, link: string | null): void` — defined Task 2, called identically in Task 4 (editor commit + remove button) and Task 7 (remove item).
- `openLink(link: string | null | undefined): void` — defined Task 2, called in Task 4 (Open button, indicator click) and Task 6 (`hit.link`).
- `pickLinkIndicatorTarget(elements, selectedIds, pointer)` — defined Task 2, called in Task 4 with `(scene.getElements(), selectedIds, lastScenePointer)`; `lastScenePointer` is `{ x: number; y: number } | null` (`store/slices/pointer.ts`), matching the parameter type.
- `LinkEditorSlice.setLinkEditorElementId: (id: string | null) => void` — defined Task 3, called with a `string` in Tasks 7 & 8 and with `null` in Task 4 (commit/escape/remove) and the Task 4 page-switch effect.
- `scene.mutate(fn, opts?: { skipHistory?: boolean })` — matches `packages/scene/src/scene.ts:51`; Task 4 passes `changed ? undefined : { skipHistory: true }`.
- testids are referenced with the exact strings they are defined with: `link-editor-input`, `link-editor-remove`, `link-indicator`, `context-menu-item-create-link` / `-edit-link` / `-remove-link`.
- i18n keys: Task 1 defines `contextMenu.createLink|editLink|removeLink` and `linkEditor.placeholder|open|remove` under `common`, and `link|openLink` under `shortcuts`; Task 4 reads `t("linkEditor.*")`, Task 7 reads `t("contextMenu.*Link")`, Task 8 uses `"shortcuts:link"` / `"shortcuts:openLink"`.

Consistent.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-element-hyperlinks.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
