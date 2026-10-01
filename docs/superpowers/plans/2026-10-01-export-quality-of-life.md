# Export Quality-of-Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four improvements to the existing Export dialog: (1) a **Selection / Whole page** scope toggle, (2) a **page picker** that exports any page, not only the active one, (3) a **Copy to clipboard** button that always writes a PNG and shows an inline error when it fails, and (4) **filenames built from the page name** (`<page>.png`, `<page>-selection.png`) instead of the hardcoded `drawing.png`/`drawing.svg`.

**Architecture:**

- New pure driver module `apps/web/src/driver/exportTarget.ts` decides _what_ gets exported. `resolveExportTarget(pages, activePageId, selectedIds, { pageId, scope })` returns `{ elements, pageName, scope }`. It picks the requested page and falls back to the active page if the id is unknown. Selection scope uses the scene package's existing `expandIdsToCopyClosure`, so bound labels and frame members come along and z-order is kept. Selection scope only applies on the active page and falls back to the whole page when the closure is empty. `exportFilename(pageName, scope, format)` builds a safe filename. `hasExportableSelection(elements, selectedIds)` drives the dialog's toggle visibility.
- The render drivers take an **explicit elements array** instead of a `Scene`. `exportToPNG(elements, opts, canvasBg, pageName)` in `apps/web/src/driver/exportPNG.ts` and the new `renderExportSVG(elements, opts, canvasBg, loadFile)` in `apps/web/src/driver/exportSVG.ts` (moved out of `Dialogs.tsx`) each wrap the elements in a throwaway `new Scene(elements)` for the renderer. `App.tsx` already does this for library thumbnails (`new Scene(item.elements)` → `renderToSVG`). Neither `CanvasRenderer` nor `renderToSVG` changes.
- New driver `apps/web/src/driver/copyImageToClipboard.ts` exports `copyPNGToClipboard(render, env)`. It builds the `ClipboardItem` **synchronously**, passing the render's `Promise<Blob>` as the value. That keeps the click's user activation. Unsupported, insecure or missing APIs reject with `ClipboardUnsupportedError`. The environment is injectable for unit tests.
- `packages/ui/src/ExportDialog.tsx` gains:
  - `scope` and `pageId` on `ExportOptions`
  - required `pages`/`activePageId` props, plus optional `hasSelection` and `onCopy` props
  - a page `<select>` (only when there are 2+ pages)
  - the scope toggle (only when `hasSelection` is true and the picked page is the active page)
  - the Copy button with inline `role="alert"` error and `role="status"` success messages

  The dialog never closes on a copy. A rejected or throwing `onCopy` only sets the error state.

- `apps/web/src/components/Dialogs.tsx` receives `pages`/`activePageId` from `App.tsx` and handles the wiring: resolve target → render PNG/SVG → `download(blob, exportFilename(...))`, and `onCopy` → `copyPNGToClipboard(() => exportToPNG(...))`.

**Tech Stack:** TypeScript, React 19, Vitest 2 + @testing-library/react (jsdom), Playwright e2e (Chromium), i18next JSON locales, pnpm + turbo monorepo. No new dependencies.

**Spec:** inline in this plan (the design was approved in chat; see Goal/Architecture). There is no separate spec document.

## Global Constraints

- **No new runtime or dev dependencies.** Use the Clipboard API, the existing `CanvasRenderer` and the existing `renderToSVG`. No zip library.
- **Out of scope; do not touch:**
  - Save/Open (`apps/web/src/driver/saveFile.ts`, `apps/web/src/driver/openFile.ts`)
  - the StatsPanel
  - any batch, all-pages, zip or PDF export
  - `packages/renderer/src/svg.ts` and `CanvasRenderer`
  - `embedScene` being a no-op for SVG (pre-existing; leave it)
- `ExportOptions.scope: "page" | "selection"`, defaulting to `"page"` every time the dialog opens. `ExportOptions.pageId: string`, defaulting to the active page every time the dialog opens.
- The scope toggle renders **only** when there is a non-empty selection **and** the picked page is the active page. When it is hidden, the emitted `scope` is always `"page"`.
- The page `<select>` renders **only** when there is more than one page.
- **Copy always renders a PNG**, whatever the format toggle says. It writes via `navigator.clipboard.write([new ClipboardItem({ "image/png": … })])`. The value is a `Promise<Blob>`, a form the Clipboard API explicitly allows; it preserves user activation. A copy failure shows an inline error. The dialog must not crash or close.
- Filenames are `<pageName>.<ext>`, or `<pageName>-selection.<ext>` when the _effective_ scope is `"selection"`. The characters `\ / : * ? " < > |` and control characters become `-`. Blank names fall back to `drawing`.
- i18n keys go in **both** `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json`, inside the existing `"export"` object, directly after `"embed"`.
- TDD: every behavior gets a failing test first. Run the exact commands given, and confirm the stated failure before you implement.
- Commit after each task with the exact subject given. End every commit message with the co-author trailer from your session's attribution reminder, passed as a second `-m`.
- Test commands:
  - `pnpm --filter @excalidraw-clone/web exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Full gate: `pnpm lint && pnpm typecheck && pnpm test`. If lint output looks stale or cites paths from another worktree, use `pnpm turbo run lint --force`.

- Lint is `typescript-eslint` `recommendedTypeChecked`. Avoid floating promises (use `void`), avoid `async` functions without `await` (including in tests; return `Promise.resolve()` instead), and use `import type` for type-only imports.

## Review Focus

These are the most likely failure modes, most likely first. Each one is pinned by named tests:

1. **Selection export silently drops bound labels or frame members, or reorders z.** Selecting a labelled rectangle or a frame must export the label or the frame's members too, in scene order. A naive `elements.filter(e => selectedIds.includes(e.id))` loses them.
   - Pinned by Task 1: "includes the bound label of a selected shape", "includes the members of a selected frame", "keeps scene (z) order regardless of selection order".
2. **The wrong page is exported, or selection leaks across pages.**
   - Picking a non-active page must export _that_ page, and with `scope: "page"` even if the toggle was set to Selection first.
   - A stale or unknown `pageId` must fall back to the active page instead of exporting nothing.
   - Pinned by Task 1: "exports a non-active page's elements", "ignores selection scope for a non-active page", "falls back to the active page for an unknown pageId". Task 3: "hides the scope toggle and forces whole-page scope when another page is picked", "falls back to the active page when the picked page disappears". Task 4 e2e: "page picker exports a non-active page's content".
3. **A clipboard failure crashes or closes the dialog, or the write loses user activation.** Permission denied, insecure context, missing `ClipboardItem`, a render failure or a _synchronous_ throw must all end as an inline error with the dialog still usable. `clipboard.write` must be called synchronously inside the click (Safari drops activation across an `await`).
   - Pinned by Task 2: "calls clipboard.write synchronously, before the PNG finishes rendering" and the three `ClipboardUnsupportedError` cases. Task 3: "a rejected copy shows an inline error and keeps the dialog open", "a synchronous throw from onCopy also shows the error". Task 4 e2e: "a failed clipboard write shows an inline error and keeps the dialog usable".
4. **Stale dialog state on reopen.** The dialog component stays mounted while closed (it returns `null`). Without an explicit reset, the scope, page and copy status from the last session leak into the next one.
   - Pinned by Task 3: "reopening resets scope, page and copy status".
5. **Hostile or empty page names produce broken or colliding filenames.** For example `"Q3/Q4: plan"`, `"   "`, or a tab character in a name. A selection export of a page whose selection resolved to nothing must not be named `-selection`.
   - Pinned by Task 1's `exportFilename` cases and "falls back to the whole page when the selection resolves to nothing".

The embedded scene (`embedScene`) of a selection-only PNG must contain only the selection. Task 4's e2e test "embedded scene of a selection-only PNG contains only the selection" pins it.

---

## File Structure

| File                                            | Action                                             | Responsibility                                                                                          |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/driver/exportTarget.ts`           | Create                                             | `ExportScope`, `ExportTarget`, `resolveExportTarget`, `hasExportableSelection`, `exportFilename`. Pure. |
| `apps/web/test/export-target.test.ts`           | Create                                             | Unit tests for the above.                                                                               |
| `apps/web/src/driver/exportPNG.ts`              | Modify (whole file, 76 lines)                      | `exportToPNG(elements, opts, canvasBg, pageName)`: renders explicit elements and embeds only those.     |
| `apps/web/src/driver/exportSVG.ts`              | Create                                             | `renderExportSVG(elements, opts, canvasBg, loadFile)`, moved out of `Dialogs.tsx`.                      |
| `apps/web/test/export-svg.test.ts`              | Create                                             | Unit tests: bbox from the given elements only; file loading only for exported images.                   |
| `apps/web/src/driver/copyImageToClipboard.ts`   | Create                                             | `ClipboardEnv`, `ClipboardUnsupportedError`, `copyPNGToClipboard`.                                      |
| `apps/web/test/copy-image-to-clipboard.test.ts` | Create                                             | Unit tests with a fake clipboard env.                                                                   |
| `packages/ui/src/ExportDialog.tsx`              | Modify (whole file, 149 lines)                     | New options, props, page picker, scope toggle, Copy button, inline status.                              |
| `packages/ui/src/index.ts`                      | Modify (line 28)                                   | Also export the `ExportPageOption` type.                                                                |
| `packages/ui/test/ExportDialog.test.tsx`        | Modify (whole file, 43 lines)                      | Update 3 existing tests; add picker, scope and copy tests.                                              |
| `apps/web/src/locales/en/common.json`           | Modify (`"export"`, after `"embed"`, line 149)     | 7 new keys.                                                                                             |
| `apps/web/src/locales/ko/common.json`           | Modify (`"export"`, after `"embed"`, line 147)     | The same 7 keys in Korean.                                                                              |
| `apps/web/test/i18n-export.test.tsx`            | Create                                             | en/ko resolution of the new keys.                                                                       |
| `apps/web/src/components/Dialogs.tsx`           | Modify (whole file, 75 lines; in Tasks 2, 3 and 4) | Prop threading, then final orchestration (target, filename, copy).                                      |
| `apps/web/src/components/App.tsx`               | Modify (line 778)                                  | `<Dialogs scene={scene} pages={pages} activePageId={activePageId} />`.                                  |
| `apps/web/e2e/export.spec.ts`                   | Create                                             | End to end: selection export, embedded selection, page picker, clipboard success and failure.           |

`apps/web/e2e/theme.spec.ts` ("export dialog defaults to dark and dark PNG has a dark background", line 97) stays **as is**. It is the only test of the theme-driven default background and the dark PNG corner pixel, which `export.spec.ts` does not cover. It keeps passing unchanged: it uses a single page, no selection, and the exact-name "Export" button.

---

## Task 1: Pure export-target resolution and filenames

**Files:**

- Create: `apps/web/src/driver/exportTarget.ts`
- Create: `apps/web/test/export-target.test.ts`

**Interfaces:**

- Consumes: `expandIdsToCopyClosure(ids: readonly string[], elements: readonly ExcalidrawElement[]): ExcalidrawElement[]` from `@excalidraw-clone/scene`. It filters deleted elements, expands frames to their members, adds bound text, and preserves input order. Also consumes `PageRecord` (`{ id; name; scene: Scene; viewport }`) and `createPageRecord(name, elements)` from `apps/web/src/driver/pages.ts`.
- Produces:

  ```ts
  export type ExportScope = "page" | "selection"
  export interface ExportTarget {
    elements: readonly ExcalidrawElement[]
    pageName: string
    scope: ExportScope // the EFFECTIVE scope (after fallbacks)
  }
  export function resolveExportTarget(
    pages: readonly Pick<PageRecord, "id" | "name" | "scene">[],
    activePageId: string,
    selectedIds: readonly string[],
    request: { pageId: string; scope: ExportScope },
  ): ExportTarget
  export function hasExportableSelection(
    elements: readonly ExcalidrawElement[],
    selectedIds: readonly string[],
  ): boolean
  export function exportFilename(
    pageName: string,
    scope: ExportScope,
    format: "png" | "svg",
  ): string
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/export-target.test.ts`:

```ts
import {
  newFrame,
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
} from "../src/driver/exportTarget"
import { createPageRecord } from "../src/driver/pages"

const ids = (els: readonly ExcalidrawElement[]): string[] => els.map((e) => e.id)

const twoPages = () => {
  const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const b = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
  const c = newRectangle({ x: 500, y: 500, width: 30, height: 30 })
  const p1 = createPageRecord("Page 1", [a, b])
  const p2 = createPageRecord("Notes", [c])
  return { a, b, c, p1, p2, pages: [p1, p2] }
}

describe("resolveExportTarget — page scope", () => {
  it("exports every live element of the active page", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: p1.id, scope: "page" })
    expect(ids(out.elements)).toEqual([a.id, b.id])
    expect(out.pageName).toBe("Page 1")
    expect(out.scope).toBe("page")
  })

  it("exports a non-active page's elements, not the active page's", () => {
    const { c, p1, p2, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: p2.id, scope: "page" })
    expect(ids(out.elements)).toEqual([c.id])
    expect(out.pageName).toBe("Notes")
  })

  it("falls back to the active page for an unknown pageId", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [], { pageId: "gone", scope: "page" })
    expect(ids(out.elements)).toEqual([a.id, b.id])
    expect(out.pageName).toBe("Page 1")
  })

  it("skips deleted elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 9, y: 9, width: 1, height: 1 }), isDeleted: true }
    const p = createPageRecord("Page 1", [a, dead])
    const out = resolveExportTarget([p], p.id, [], { pageId: p.id, scope: "page" })
    expect(ids(out.elements)).toEqual([a.id])
  })
})

describe("resolveExportTarget — selection scope", () => {
  it("exports only the selected elements of the active page", () => {
    const { b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [b.id], { pageId: p1.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([b.id])
    expect(out.scope).toBe("selection")
    expect(out.pageName).toBe("Page 1")
  })

  it("includes the bound label of a selected shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 80, height: 40 })
    const label = { ...newLabelFor(rect), text: "hi" }
    const boundRect = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    const other = newRectangle({ x: 300, y: 300, width: 10, height: 10 })
    const p = createPageRecord("Page 1", [boundRect, label, other])
    const out = resolveExportTarget([p], p.id, [rect.id], { pageId: p.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([rect.id, label.id])
  })

  it("includes the members of a selected frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const outside = newRectangle({ x: 400, y: 400, width: 20, height: 20 })
    const p = createPageRecord("Page 1", [frame, member, outside])
    const out = resolveExportTarget([p], p.id, [frame.id], { pageId: p.id, scope: "selection" })
    expect(ids(out.elements).sort()).toEqual([frame.id, member.id].sort())
  })

  it("keeps scene (z) order regardless of selection order", () => {
    const { a, b, p1, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [b.id, a.id], {
      pageId: p1.id,
      scope: "selection",
    })
    expect(ids(out.elements)).toEqual([a.id, b.id])
  })

  it("ignores selection scope for a non-active page (selection is page-local)", () => {
    const { a, c, p1, p2, pages } = twoPages()
    const out = resolveExportTarget(pages, p1.id, [a.id], { pageId: p2.id, scope: "selection" })
    expect(ids(out.elements)).toEqual([c.id])
    expect(out.scope).toBe("page")
  })

  it("falls back to the whole page when the selection resolves to nothing", () => {
    const { a, b, p1, pages } = twoPages()
    const empty = resolveExportTarget(pages, p1.id, [], { pageId: p1.id, scope: "selection" })
    expect(ids(empty.elements)).toEqual([a.id, b.id])
    expect(empty.scope).toBe("page")
    const stale = resolveExportTarget(pages, p1.id, ["no-such-id"], {
      pageId: p1.id,
      scope: "selection",
    })
    expect(ids(stale.elements)).toEqual([a.id, b.id])
    expect(stale.scope).toBe("page")
  })

  it("returns an empty page-scoped target when there are no pages at all", () => {
    const out = resolveExportTarget([], "x", ["y"], { pageId: "x", scope: "selection" })
    expect(out).toEqual({ elements: [], pageName: "", scope: "page" })
  })
})

describe("hasExportableSelection", () => {
  it("is true when a selected id resolves to a live element", () => {
    const { a, b } = twoPages()
    expect(hasExportableSelection([a, b], [a.id])).toBe(true)
  })

  it("is false for an empty or stale selection", () => {
    const { a, b } = twoPages()
    expect(hasExportableSelection([a, b], [])).toBe(false)
    expect(hasExportableSelection([a, b], ["no-such-id"])).toBe(false)
  })
})

describe("exportFilename", () => {
  it.each([
    ["Page 1", "page", "png", "Page 1.png"],
    ["Page 1", "selection", "png", "Page 1-selection.png"],
    ["Notes", "page", "svg", "Notes.svg"],
    ["Notes", "selection", "svg", "Notes-selection.svg"],
    ["", "page", "png", "drawing.png"],
    ["   ", "page", "svg", "drawing.svg"],
    ["", "selection", "png", "drawing-selection.png"],
    ["Q3/Q4: plan", "page", "png", "Q3-Q4- plan.png"],
    ['a\\b*c?d"e<f>g|h', "page", "png", "a-b-c-d-e-f-g-h.png"],
    ["tab\there", "page", "png", "tab-here.png"],
    ["  padded  ", "page", "png", "padded.png"],
    ["회의 노트", "page", "png", "회의 노트.png"],
  ] as const)("(%j, %s, %s) → %j", (name, scope, format, expected) => {
    expect(exportFilename(name, scope, format)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-target.test.ts`
Expected: FAIL. The import of `../src/driver/exportTarget` cannot be resolved.

- [ ] **Step 3: Implement `exportTarget.ts`**

Create `apps/web/src/driver/exportTarget.ts`:

```ts
import { expandIdsToCopyClosure, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { PageRecord } from "./pages"

export type ExportScope = "page" | "selection"

/** What an export actually renders, after every fallback has been applied. */
export interface ExportTarget {
  elements: readonly ExcalidrawElement[]
  pageName: string
  /** The effective scope: "selection" only if a non-empty selection was used. */
  scope: ExportScope
}

/** Resolve the elements to export.
 *
 *  - The requested page is used; an unknown id falls back to the active page.
 *  - "selection" applies only to the active page (selection is page-local) and
 *    only when the selection's copy closure is non-empty; otherwise the whole
 *    page is exported and the effective scope is "page".
 *  - The selection closure brings bound labels and frame members along and
 *    keeps scene (z) order, exactly like copy/duplicate. */
export function resolveExportTarget(
  pages: readonly Pick<PageRecord, "id" | "name" | "scene">[],
  activePageId: string,
  selectedIds: readonly string[],
  request: { pageId: string; scope: ExportScope },
): ExportTarget {
  const page =
    pages.find((p) => p.id === request.pageId) ??
    pages.find((p) => p.id === activePageId) ??
    pages[0]
  if (!page) return { elements: [], pageName: "", scope: "page" }
  const all = page.scene.getElements()
  if (request.scope === "selection" && page.id === activePageId) {
    const closure = expandIdsToCopyClosure(selectedIds, all)
    if (closure.length > 0) return { elements: closure, pageName: page.name, scope: "selection" }
  }
  return { elements: all, pageName: page.name, scope: "page" }
}

/** True when the selection resolves to at least one live element. */
export function hasExportableSelection(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.length > 0 && expandIdsToCopyClosure(selectedIds, elements).length > 0
}

const FALLBACK_BASENAME = "drawing"
const UNSAFE_FILENAME_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"])

/** `<page>.<ext>`, or `<page>-selection.<ext>`, with filesystem-hostile
 *  characters (and control characters) replaced by "-". A blank name falls
 *  back to "drawing". */
export function exportFilename(
  pageName: string,
  scope: ExportScope,
  format: "png" | "svg",
): string {
  const cleaned = Array.from(pageName, (ch) =>
    ch < " " || UNSAFE_FILENAME_CHARS.has(ch) ? "-" : ch,
  )
    .join("")
    .trim()
  const base = cleaned === "" ? FALLBACK_BASENAME : cleaned
  return `${base}${scope === "selection" ? "-selection" : ""}.${format}`
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-target.test.ts`
Expected: PASS (13 `it` tests plus 12 `exportFilename` cases).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/exportTarget.ts apps/web/test/export-target.test.ts
git commit -m "feat(web): resolve export target (page/selection) and page-based filenames" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 2: Render drivers take explicit elements, plus the clipboard driver

**Files:**

- Modify: `apps/web/src/driver/exportPNG.ts` (whole file, currently 76 lines)
- Create: `apps/web/src/driver/exportSVG.ts`
- Create: `apps/web/test/export-svg.test.ts`
- Create: `apps/web/src/driver/copyImageToClipboard.ts`
- Create: `apps/web/test/copy-image-to-clipboard.test.ts`
- Modify: `apps/web/src/components/Dialogs.tsx`: the import lines 2–12 and `exportScene` (lines 57–75). This is a pure refactor with no behavior change.
- Regression (must stay green): `apps/web/e2e/theme.spec.ts` "export dialog defaults to dark and dark PNG has a dark background"

**Interfaces:**

- Consumes: `ExportOptions` from `@excalidraw-clone/ui`. Only `scale`, `background` and `embedScene` are read, so this task does not depend on Task 3's new fields. Also consumes `renderToSVG(scene, { background, theme, files })` from `@excalidraw-clone/renderer` and `getFile(id): Promise<ExcalidrawBinaryFile | undefined>` from `@excalidraw-clone/persistence`.
- Produces:

  ```ts
  // exportPNG.ts
  export type PNGRenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">
  export async function exportToPNG(
    elements: readonly ExcalidrawElement[],
    opts: PNGRenderOptions,
    canvasBg?: string, // default "#ffffff"
    pageName?: string, // default "Page 1"; names the embedded page
  ): Promise<Blob>
  // exportSVG.ts
  export type FileLoader = (id: string) => Promise<{ dataURL: string } | undefined>
  export async function renderExportSVG(
    elements: readonly ExcalidrawElement[],
    opts: Pick<ExportOptions, "background">,
    canvasBg: string,
    loadFile?: FileLoader, // default getFile
  ): Promise<string>
  // copyImageToClipboard.ts
  export interface ClipboardEnv {
    clipboard: Pick<Clipboard, "write"> | undefined
    ClipboardItem: typeof ClipboardItem | undefined
    isSecureContext: boolean
  }
  export class ClipboardUnsupportedError extends Error {}
  export async function copyPNGToClipboard(
    render: () => Promise<Blob>,
    env?: ClipboardEnv, // default: the live browser
  ): Promise<void>
  ```

- [ ] **Step 1: Write the failing SVG driver tests**

Create `apps/web/test/export-svg.test.ts`:

```ts
import { newImage, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { type FileLoader, renderExportSVG } from "../src/driver/exportSVG"

const noFiles: FileLoader = () => Promise.resolve(undefined)

describe("renderExportSVG", () => {
  it("sizes the SVG from the given elements only (20px padding)", async () => {
    const rect = newRectangle({ x: 10, y: 20, width: 100, height: 50 })
    const svg = await renderExportSVG([rect], { background: "white" }, "#ffffff", noFiles)
    // bbox (10,20)-(110,70) padded by 20 → x -10, y 0, 140 × 90
    expect(svg).toContain('viewBox="-10 0 140 90"')
  })

  it("ignores deleted elements when sizing", async () => {
    const rect = newRectangle({ x: 10, y: 20, width: 100, height: 50 })
    const dead = { ...newRectangle({ x: 900, y: 900, width: 10, height: 10 }), isDeleted: true }
    const svg = await renderExportSVG([rect, dead], { background: "white" }, "#ffffff", noFiles)
    expect(svg).toContain('viewBox="-10 0 140 90"')
  })

  it("loads each exported image file once and embeds it", async () => {
    const img1 = newImage({ x: 0, y: 0, width: 40, height: 40, fileId: "f1" })
    const img2 = newImage({ x: 50, y: 0, width: 40, height: 40, fileId: "f1" })
    const loadFile = vi.fn<FileLoader>(() =>
      Promise.resolve({ dataURL: "data:image/png;base64,AAAA" }),
    )
    const svg = await renderExportSVG([img1, img2], { background: "white" }, "#ffffff", loadFile)
    expect(loadFile).toHaveBeenCalledTimes(1)
    expect(loadFile).toHaveBeenCalledWith("f1")
    expect(svg).toContain('href="data:image/png;base64,AAAA"')
  })

  it("does not load files for images outside the exported set", async () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const loadFile = vi.fn<FileLoader>(() => Promise.resolve(undefined))
    await renderExportSVG([rect], { background: "white" }, "#ffffff", loadFile)
    expect(loadFile).not.toHaveBeenCalled()
  })

  it("paints the canvas background for white and omits it for transparent", async () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const white = await renderExportSVG([rect], { background: "white" }, "#abcdef", noFiles)
    const clear = await renderExportSVG([rect], { background: "transparent" }, "#abcdef", noFiles)
    expect(white).toContain('fill="#abcdef"')
    expect(clear).not.toContain('fill="#abcdef"')
  })
})
```

- [ ] **Step 2: Write the failing clipboard driver tests**

Create `apps/web/test/copy-image-to-clipboard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import {
  type ClipboardEnv,
  ClipboardUnsupportedError,
  copyPNGToClipboard,
} from "../src/driver/copyImageToClipboard"

/** Records what it was constructed with, like the real ClipboardItem. */
class FakeClipboardItem {
  readonly data: Record<string, Blob | PromiseLike<Blob>>
  constructor(data: Record<string, Blob | PromiseLike<Blob>>) {
    this.data = data
  }
}

type WriteFn = (items: readonly FakeClipboardItem[]) => Promise<void>

/** A write that, like the browser, waits for the item's data promise. */
const makeWrite = () =>
  vi.fn<WriteFn>((items) => Promise.resolve(items[0]!.data["image/png"]).then(() => undefined))

const makeEnv = (write: ReturnType<typeof makeWrite>, overrides: Partial<ClipboardEnv> = {}) =>
  ({
    clipboard: { write: write as unknown as Clipboard["write"] },
    ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    isSecureContext: true,
    ...overrides,
  }) satisfies ClipboardEnv

const png = new Blob(["png-bytes"], { type: "image/png" })

describe("copyPNGToClipboard", () => {
  it("writes one image/png item whose data is the rendered blob", async () => {
    const write = makeWrite()
    await copyPNGToClipboard(() => Promise.resolve(png), makeEnv(write))
    expect(write).toHaveBeenCalledTimes(1)
    const items = write.mock.calls[0]![0]
    expect(items).toHaveLength(1)
    expect(Object.keys(items[0]!.data)).toEqual(["image/png"])
    await expect(Promise.resolve(items[0]!.data["image/png"])).resolves.toBe(png)
  })

  it("calls clipboard.write synchronously, before the PNG finishes rendering", async () => {
    const write = makeWrite()
    let finish!: (b: Blob) => void
    const rendering = new Promise<Blob>((resolve) => {
      finish = resolve
    })
    const done = copyPNGToClipboard(() => rendering, makeEnv(write))
    // No await yet: the write must already have been issued (user activation).
    expect(write).toHaveBeenCalledTimes(1)
    finish(png)
    await done
  })

  it.each([
    ["no Clipboard API", { clipboard: undefined }],
    ["no ClipboardItem", { ClipboardItem: undefined }],
    ["insecure context", { isSecureContext: false }],
  ] as const)("rejects with ClipboardUnsupportedError when %s, without rendering", async (_, o) => {
    const write = makeWrite()
    const render = vi.fn(() => Promise.resolve(png))
    await expect(copyPNGToClipboard(render, makeEnv(write, o))).rejects.toBeInstanceOf(
      ClipboardUnsupportedError,
    )
    expect(render).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it("propagates a permission rejection from clipboard.write", async () => {
    const denied = new DOMException("Write permission denied.", "NotAllowedError")
    const write = vi.fn<WriteFn>(() => Promise.reject(denied))
    await expect(copyPNGToClipboard(() => Promise.resolve(png), makeEnv(write))).rejects.toBe(
      denied,
    )
  })

  it("propagates a render failure", async () => {
    const boom = new Error("toBlob returned null")
    await expect(copyPNGToClipboard(() => Promise.reject(boom), makeEnv(makeWrite()))).rejects.toBe(
      boom,
    )
  })
})
```

- [ ] **Step 3: Run both test files and confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-svg.test.ts test/copy-image-to-clipboard.test.ts`
Expected: FAIL. `../src/driver/exportSVG` and `../src/driver/copyImageToClipboard` cannot be resolved.

- [ ] **Step 4: Implement `exportSVG.ts`**

Create `apps/web/src/driver/exportSVG.ts`:

```ts
"use client"
import { getFile } from "@excalidraw-clone/persistence"
import { renderToSVG } from "@excalidraw-clone/renderer"
import { Scene, type ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"

export type FileLoader = (id: string) => Promise<{ dataURL: string } | undefined>

/** Render exactly `elements` to an SVG string, embedding the image binaries
 *  they reference (loaded once per fileId). The elements are wrapped in a
 *  throwaway Scene, so any page or selection subset can be exported. */
export async function renderExportSVG(
  elements: readonly ExcalidrawElement[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
): Promise<string> {
  const theme = opts.background === "dark" ? "dark" : "light"
  const background = opts.background === "transparent" ? "transparent" : canvasBg
  const live = elements.filter((e) => !e.isDeleted)
  const files = new Map<string, string>()
  for (const el of live) {
    if (el.type === "image" && el.fileId !== null && !files.has(el.fileId)) {
      const bin = await loadFile(el.fileId)
      if (bin) files.set(el.fileId, bin.dataURL)
    }
  }
  return renderToSVG(new Scene(live), { background, theme, files })
}
```

Note: a fileId whose load returns `undefined` is not added to `files`. If two images share such a fileId, the loader is called twice. That matches the old inline code exactly, and the tests do not pin it.

- [ ] **Step 5: Implement `copyImageToClipboard.ts`**

Create `apps/web/src/driver/copyImageToClipboard.ts`:

```ts
"use client"

/** The browser surfaces copyPNGToClipboard needs; injectable for tests. */
export interface ClipboardEnv {
  clipboard: Pick<Clipboard, "write"> | undefined
  ClipboardItem: typeof ClipboardItem | undefined
  isSecureContext: boolean
}

export class ClipboardUnsupportedError extends Error {
  constructor() {
    super("Copying images to the clipboard is not supported in this browser or context")
    this.name = "ClipboardUnsupportedError"
  }
}

const browserEnv = (): ClipboardEnv => ({
  clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
  ClipboardItem: typeof ClipboardItem === "undefined" ? undefined : ClipboardItem,
  isSecureContext: typeof window !== "undefined" && window.isSecureContext,
})

/** Write a PNG to the system clipboard.
 *
 *  `render` is invoked and `clipboard.write` is called synchronously, before any
 *  await. The ClipboardItem holds the still-rendering Promise<Blob>, so the
 *  click's user activation is preserved (Safari requires this; Chromium
 *  accepts it). Always rejects, never throws synchronously, on failure:
 *  ClipboardUnsupportedError when the API or a secure context is missing,
 *  otherwise whatever the render or the write rejected with (e.g. a
 *  NotAllowedError DOMException). */
export async function copyPNGToClipboard(
  render: () => Promise<Blob>,
  env: ClipboardEnv = browserEnv(),
): Promise<void> {
  if (!env.isSecureContext || env.clipboard === undefined || env.ClipboardItem === undefined) {
    throw new ClipboardUnsupportedError()
  }
  const item = new env.ClipboardItem({ "image/png": render() })
  await env.clipboard.write([item])
}
```

- [ ] **Step 6: Run both test files and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-svg.test.ts test/copy-image-to-clipboard.test.ts`
Expected: PASS (5 + 7 tests). jsdom may log "Not implemented: HTMLCanvasElement.prototype.getContext" from `renderToSVG`'s default measurer. That noise is expected; it falls back gracefully, as in `packages/renderer/test/svg.test.ts`.

- [ ] **Step 7: Refactor `exportPNG.ts` to take explicit elements**

Replace the entire contents of `apps/web/src/driver/exportPNG.ts` with:

```ts
"use client"
import { embedTextChunk, getFile, PNG_EXCALIDRAW_KEYWORD } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  buildExcalidrawData,
  newPage,
  Scene,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"

const PADDING = 20

export type PNGRenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">

/** Render exactly `elements` to a PNG blob sized to their bounding box plus
 *  padding. The elements are wrapped in a throwaway Scene, so any page or
 *  selection subset can be exported without touching the live canvas. When
 *  `embedScene` is set, the embedded document holds only these elements, as a
 *  single page named `pageName`. */
export async function exportToPNG(
  elements: readonly ExcalidrawElement[],
  opts: PNGRenderOptions,
  canvasBg = "#ffffff",
  pageName = "Page 1",
): Promise<Blob> {
  const live = elements.filter((e) => !e.isDeleted)
  const scene = new Scene(live)
  const bbox = computeBBox(live)
  const w = Math.max(1, bbox.width + PADDING * 2)
  const h = Math.max(1, bbox.height + PADDING * 2)
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(w * opts.scale)
  canvas.height = Math.floor(h * opts.scale)

  const renderer = new CanvasRenderer(canvas, scene, {
    theme: opts.background === "dark" ? "dark" : "light",
    canvasBg: opts.background === "transparent" ? "transparent" : canvasBg,
    viewTransform: { scrollX: -bbox.x + PADDING, scrollY: -bbox.y + PADDING, zoom: opts.scale },
  })

  const fileIds = new Set<string>()
  for (const el of live) {
    if (el.type === "image" && el.fileId !== null) fileIds.add(el.fileId)
  }
  const loads: Promise<void>[] = []
  for (const id of fileIds) {
    const file = await getFile(id)
    if (file) loads.push(renderer.preloadImage(id, file.dataURL))
  }
  await Promise.all(loads)

  renderer.start()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  renderer.stop()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error("exportToPNG: toBlob returned null"))
    }, "image/png")
  })

  if (opts.embedScene) {
    const page = newPage(pageName, live)
    const json = JSON.stringify(buildExcalidrawData([page], page.id))
    return embedTextChunk(blob, PNG_EXCALIDRAW_KEYWORD, json)
  }
  return blob
}

function computeBBox(elements: readonly ExcalidrawElement[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (elements.length === 0) return { x: 0, y: 0, width: 100, height: 100 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
```

There is one intentional behavior change. The embedded scene used to contain `scene.getElementsIncludingDeleted()`, deleted tombstones included. It now contains only the exported live elements. Tombstones in an exported image are useless, and a selection export must embed only the selection. `exportToPNG` has no jsdom unit test because jsdom has neither `toBlob` nor a 2D context. The Task 4 e2e tests and the theme.spec regression cover it.

- [ ] **Step 8: Point `Dialogs.tsx` at the new driver signatures (no behavior change)**

In `apps/web/src/components/Dialogs.tsx`, replace lines 2–4:

```ts
import { clearAllFiles, clearLocal, download, getFile } from "@excalidraw-clone/persistence"
import { renderToSVG } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
```

with:

```ts
import { clearAllFiles, clearLocal, download } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
```

Next, replace line 12:

```ts
import { exportToPNG } from "../driver/exportPNG"
```

with:

```ts
import { exportToPNG } from "../driver/exportPNG"
import { renderExportSVG } from "../driver/exportSVG"
```

Finally, replace the whole `exportScene` function (lines 57–75) with:

```ts
async function exportScene(scene: Scene, opts: ExportOptions, canvasBg: string): Promise<void> {
  const elements = scene.getElements()
  if (opts.format === "svg") {
    const svg = await renderExportSVG(elements, opts, canvasBg)
    download(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg")
    return
  }
  download(await exportToPNG(elements, opts, canvasBg), "drawing.png")
}
```

- [ ] **Step 9: Run the web unit suite, typecheck and lint**

Run: `pnpm --filter @excalidraw-clone/web test && pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: all pass. In particular, there must be no unused `getFile`/`renderToSVG` import left in `Dialogs.tsx`.

- [ ] **Step 10: Run the existing export e2e regression**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/theme.spec.ts`
Expected: PASS, including "export dialog defaults to dark and dark PNG has a dark background".

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/driver/exportPNG.ts apps/web/src/driver/exportSVG.ts apps/web/src/driver/copyImageToClipboard.ts apps/web/test/export-svg.test.ts apps/web/test/copy-image-to-clipboard.test.ts apps/web/src/components/Dialogs.tsx
git commit -m "refactor(web): render exports from an explicit element list; add PNG clipboard driver" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 3: ExportDialog: page picker, scope toggle, Copy button, i18n, and prop threading

**Files:**

- Modify: `packages/ui/src/ExportDialog.tsx` (whole file, currently 149 lines)
- Modify: `packages/ui/src/index.ts` (line 28)
- Modify: `packages/ui/test/ExportDialog.test.tsx` (whole file, currently 43 lines)
- Modify: `apps/web/src/locales/en/common.json` (`"export"` object, after `"embed"` on line 149)
- Modify: `apps/web/src/locales/ko/common.json` (`"export"` object, after `"embed"` on line 147)
- Create: `apps/web/test/i18n-export.test.tsx`
- Modify: `apps/web/src/components/Dialogs.tsx` (component signature and `<ExportDialog>` props)
- Modify: `apps/web/src/components/App.tsx` (line 778)

**Interfaces:**

- Consumes: `hasExportableSelection(elements, selectedIds)` from `apps/web/src/driver/exportTarget.ts` (Task 1), `PageRecord` from `apps/web/src/driver/pages.ts`, and `selectedIds: string[]` from the zustand store (`useAppStore((s) => s.selectedIds)`).
- Produces:

  ```ts
  export interface ExportOptions {
    format: "png" | "svg"
    scale: 1 | 2 | 3
    background: "white" | "dark" | "transparent"
    embedScene: boolean
    scope: "page" | "selection"
    pageId: string
  }
  export interface ExportPageOption {
    id: string
    name: string
  }
  export interface ExportDialogProps {
    t: (key: string) => string
    open: boolean
    onClose: () => void
    onExport: (opts: ExportOptions) => void
    onCopy?: (opts: ExportOptions) => Promise<void>
    pages: readonly ExportPageOption[]
    activePageId: string
    hasSelection?: boolean
    defaultBackground?: ExportOptions["background"]
    className?: string
  }
  // Dialogs.tsx
  export interface DialogsProps {
    scene: Scene
    pages: readonly PageRecord[]
    activePageId: string
  }
  ```

  Test ids:
  - `export-page` (the `<select>`)
  - `scope-page`, `scope-selection` (toggle buttons with `aria-pressed`)
  - `export-copy` (button)
  - `export-copy-error` (`role="alert"`)
  - `export-copy-success` (`role="status"`)

  i18n keys: `export.page`, `export.scope`, `export.scopePage`, `export.scopeSelection`, `export.copy`, `export.copied`, `export.copyFailed`.

- [ ] **Step 1: Write the failing ExportDialog tests**

Replace the entire contents of `packages/ui/test/ExportDialog.test.tsx` with:

```tsx
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ExportDialog, type ExportOptions } from "../src/ExportDialog"

const t = (key: string): string => key
const ONE_PAGE = [{ id: "p1", name: "Page 1" }]
const TWO_PAGES = [
  { id: "p1", name: "Page 1" },
  { id: "p2", name: "Notes" },
]
type CopyFn = (opts: ExportOptions) => Promise<void>
const confirm = () => screen.getByRole("button", { name: /export\.confirm/i })

describe("ExportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExportDialog
        t={t}
        open={false}
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("default options export PNG @ 1x white, whole active page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith({
      format: "png",
      scale: 1,
      background: "white",
      embedScene: false,
      scope: "page",
      pageId: "p1",
    })
  })

  it("changes propagate: SVG + 2x + dark + embed", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("format-svg"))
    await userEvent.click(screen.getByTestId("scale-2"))
    await userEvent.click(screen.getByTestId("bg-dark"))
    await userEvent.click(screen.getByLabelText(/embed/i))
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith({
      format: "svg",
      scale: 2,
      background: "dark",
      embedScene: true,
      scope: "page",
      pageId: "p1",
    })
  })
})

describe("ExportDialog — page picker", () => {
  it("hides the page picker when there is only one page", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("export-page")).toBeNull()
  })

  it("lists every page by name and defaults to the active page", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={TWO_PAGES}
        activePageId="p2"
      />,
    )
    const picker = screen.getByTestId("export-page")
    expect(picker).toHaveAccessibleName("export.page")
    expect(picker).toHaveValue("p2")
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Page 1", "Notes"])
  })

  it("exports the picked page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
      />,
    )
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ pageId: "p2", scope: "page" }))
  })

  it("falls back to the active page when the picked page disappears", async () => {
    const onExport = vi.fn()
    const { rerender } = render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
      />,
    )
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    rerender(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ pageId: "p1" }))
  })
})

describe("ExportDialog — selection scope", () => {
  it("hides the scope toggle when there is no selection", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("scope-selection")).toBeNull()
    expect(screen.queryByTestId("scope-page")).toBeNull()
  })

  it("shows the scope toggle with a selection, defaulting to the whole page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    expect(screen.getByTestId("scope-page")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("scope-selection")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("scope-page")).toHaveTextContent("export.scopePage")
    expect(screen.getByTestId("scope-selection")).toHaveTextContent("export.scopeSelection")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page" }))
  })

  it("exports scope 'selection' when chosen", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    expect(screen.getByTestId("scope-selection")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "selection", pageId: "p1" }),
    )
  })

  it("hides the scope toggle and forces whole-page scope when another page is picked", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    expect(screen.queryByTestId("scope-selection")).toBeNull()
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page", pageId: "p2" }))
  })

  it("reopening resets scope, page and copy status", async () => {
    const onExport = vi.fn()
    const onCopy = vi.fn<CopyFn>(() => Promise.reject(new Error("denied")))
    const props = {
      t,
      onClose: () => {},
      onExport,
      onCopy,
      pages: TWO_PAGES,
      activePageId: "p1",
      hasSelection: true,
    }
    const { rerender } = render(<ExportDialog {...props} open />)
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.click(screen.getByTestId("export-copy"))
    await screen.findByTestId("export-copy-error")
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    rerender(<ExportDialog {...props} open={false} />)
    rerender(<ExportDialog {...props} open />)
    expect(screen.queryByTestId("export-copy-error")).toBeNull()
    expect(screen.getByTestId("export-page")).toHaveValue("p1")
    expect(screen.getByTestId("scope-page")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page", pageId: "p1" }))
  })
})

describe("ExportDialog — copy to clipboard", () => {
  it("hides the Copy button when onCopy is not provided", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("export-copy")).toBeNull()
  })

  it("copies a PNG even when SVG is chosen, stays open, and confirms", async () => {
    const onClose = vi.fn()
    const onCopy = vi.fn<CopyFn>(() => Promise.resolve())
    render(
      <ExportDialog
        t={t}
        open
        onClose={onClose}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("format-svg"))
    const copy = screen.getByTestId("export-copy")
    expect(copy).toHaveTextContent("export.copy")
    await userEvent.click(copy)
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ format: "png", pageId: "p1" }))
    expect(await screen.findByTestId("export-copy-success")).toHaveTextContent("export.copied")
    expect(screen.getByRole("status")).toBe(screen.getByTestId("export-copy-success"))
    expect(onClose).not.toHaveBeenCalled()
    expect(confirm()).toBeInTheDocument()
  })

  it("passes the selection scope through to onCopy", async () => {
    const onCopy = vi.fn<CopyFn>(() => Promise.resolve())
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.click(screen.getByTestId("export-copy"))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ scope: "selection" }))
  })

  it("a rejected copy shows an inline error and keeps the dialog open", async () => {
    const onClose = vi.fn()
    const onExport = vi.fn()
    const onCopy = vi.fn<CopyFn>(() =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    )
    render(
      <ExportDialog
        t={t}
        open
        onClose={onClose}
        onExport={onExport}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("export-copy"))
    const error = await screen.findByTestId("export-copy-error")
    expect(error).toHaveAttribute("role", "alert")
    expect(error).toHaveTextContent("export.copyFailed")
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it("a synchronous throw from onCopy also shows the error", async () => {
    const onCopy = vi.fn<CopyFn>(() => {
      throw new Error("boom")
    })
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("export-copy"))
    expect(await screen.findByTestId("export-copy-error")).toBeInTheDocument()
  })

  it("disables Copy while copying and clears an earlier error on retry", async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const onCopy = vi
      .fn<CopyFn>()
      .mockImplementationOnce(() => Promise.reject(new Error("denied")))
      .mockImplementationOnce(() => pending)
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    const copy = screen.getByTestId("export-copy")
    await userEvent.click(copy)
    await screen.findByTestId("export-copy-error")
    await userEvent.click(copy)
    expect(copy).toBeDisabled()
    expect(screen.queryByTestId("export-copy-error")).toBeNull()
    finish()
    expect(await screen.findByTestId("export-copy-success")).toBeInTheDocument()
    expect(copy).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: FAIL.

- "renders nothing when closed" and "hides the page picker when there is only one page" pass.
- "hides the scope toggle when there is no selection" and "hides the Copy button when onCopy is not provided" pass.
- The two updated option tests fail on `toHaveBeenCalledWith` (missing `scope`/`pageId`).
- The picker, scope and copy tests fail with `Unable to find an element by: [data-testid="export-page" | "scope-page" | "scope-selection" | "export-copy"]`.

- [ ] **Step 3: Implement the new ExportDialog**

Replace the entire contents of `packages/ui/src/ExportDialog.tsx` with:

```tsx
import { useEffect, useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface ExportOptions {
  format: "png" | "svg"
  scale: 1 | 2 | 3
  background: "white" | "dark" | "transparent"
  embedScene: boolean
  /** "selection" exports only the current selection (active page only). */
  scope: "page" | "selection"
  /** The page whose elements are exported. */
  pageId: string
}

/** A page as listed in the export page picker. */
export interface ExportPageOption {
  id: string
  name: string
}

export interface ExportDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onExport: (opts: ExportOptions) => void
  /** Copy a PNG of the current options to the clipboard. A rejection (or a
   *  synchronous throw) shows an inline error; the dialog stays open either
   *  way. Omit to hide the Copy button. */
  onCopy?: (opts: ExportOptions) => Promise<void>
  /** Every page, in tab order. The picker renders only when there are 2+. */
  pages: readonly ExportPageOption[]
  activePageId: string
  /** True when the active page has a non-empty selection. */
  hasSelection?: boolean
  defaultBackground?: ExportOptions["background"]
  className?: string
}

const SCALES = [1, 2, 3] as const

type CopyStatus = "idle" | "copying" | "copied" | "error"

export function ExportDialog({
  t,
  open,
  onClose,
  onExport,
  onCopy,
  pages,
  activePageId,
  hasSelection = false,
  defaultBackground,
  className,
}: ExportDialogProps): React.ReactElement | null {
  const [format, setFormat] = useState<ExportOptions["format"]>("png")
  const [scale, setScale] = useState<ExportOptions["scale"]>(1)
  const [background, setBackground] = useState<ExportOptions["background"]>(
    defaultBackground ?? "white",
  )
  const [embedScene, setEmbedScene] = useState(false)
  const [scope, setScope] = useState<ExportOptions["scope"]>("page")
  const [pageId, setPageId] = useState(activePageId)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle")

  // The component stays mounted while closed, so per-session choices are
  // reset every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setBackground(defaultBackground ?? "white")
    setScope("page")
    setPageId(activePageId)
    setCopyStatus("idle")
  }, [open, defaultBackground, activePageId])

  if (!open) return null

  // A picked page that no longer exists falls back to the active page.
  const targetPageId = pages.some((p) => p.id === pageId) ? pageId : activePageId
  // Selection is page-local: only offer it when exporting the active page.
  const showScope = hasSelection && targetPageId === activePageId
  const currentOptions = (): ExportOptions => ({
    format,
    scale,
    background,
    embedScene,
    scope: showScope ? scope : "page",
    pageId: targetPageId,
  })

  const handleCopy = (): void => {
    if (!onCopy) return
    setCopyStatus("copying")
    let pending: Promise<void> | undefined
    try {
      // Clipboard images are PNG-only, whatever the format toggle says.
      pending = onCopy({ ...currentOptions(), format: "png" })
    } catch {
      pending = undefined
    }
    if (pending === undefined) {
      setCopyStatus("error")
      return
    }
    void pending.then(
      () => setCopyStatus("copied"),
      () => setCopyStatus("error"),
    )
  }

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("export.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="space-y-4">
        {pages.length > 1 && (
          <Row label={t("export.page")}>
            <select
              data-testid="export-page"
              aria-label={t("export.page")}
              value={targetPageId}
              onChange={(e) => setPageId(e.target.value)}
              className="rounded border border-panel bg-panel px-2 py-1 text-xs"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
        )}
        {showScope && (
          <Row label={t("export.scope")}>
            <Toggle
              value={scope}
              setValue={setScope}
              options={[
                { value: "page", label: t("export.scopePage"), testId: "scope-page" },
                {
                  value: "selection",
                  label: t("export.scopeSelection"),
                  testId: "scope-selection",
                },
              ]}
            />
          </Row>
        )}
        <Row label={t("export.format")}>
          <Toggle
            value={format}
            setValue={setFormat}
            options={[
              { value: "png", label: "PNG", testId: "format-png" },
              { value: "svg", label: "SVG", testId: "format-svg" },
            ]}
          />
        </Row>
        <Row label={t("export.scale")}>
          <Toggle
            value={scale}
            setValue={setScale}
            options={SCALES.map((s) => ({ value: s, label: `${s}×`, testId: `scale-${s}` }))}
          />
        </Row>
        <Row label={t("export.background")}>
          <Toggle
            value={background}
            setValue={setBackground}
            options={[
              { value: "white", label: t("export.bgWhite"), testId: "bg-white" },
              { value: "dark", label: t("export.bgDark"), testId: "bg-dark" },
              { value: "transparent", label: t("export.bgTransparent"), testId: "bg-transparent" },
            ]}
          />
        </Row>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={embedScene}
            onChange={(e) => setEmbedScene(e.target.checked)}
          />
          {t("export.embed")}
        </label>
        {copyStatus === "error" && (
          <p role="alert" data-testid="export-copy-error" className="text-sm text-danger">
            {t("export.copyFailed")}
          </p>
        )}
        {copyStatus === "copied" && (
          <p role="status" data-testid="export-copy-success" className="text-sm text-muted">
            {t("export.copied")}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-panel px-3 py-1 text-sm"
          >
            {t("export.cancel")}
          </button>
          {onCopy && (
            <button
              type="button"
              data-testid="export-copy"
              onClick={handleCopy}
              disabled={copyStatus === "copying"}
              className="rounded border border-panel px-3 py-1 text-sm disabled:opacity-50"
            >
              {t("export.copy")}
            </button>
          )}
          <button
            type="button"
            onClick={() => onExport(currentOptions())}
            className="rounded bg-accent px-3 py-1 text-sm text-white"
          >
            {t("export.confirm")}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-muted">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function Toggle<T extends string | number>({
  value,
  setValue,
  options,
}: {
  value: T
  setValue: (v: T) => void
  options: ReadonlyArray<{ value: T; label: string; testId: string }>
}): React.ReactElement {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          data-testid={opt.testId}
          aria-pressed={value === opt.value}
          onClick={() => setValue(opt.value)}
          className={`rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

(`Row` and `Toggle` are unchanged from the current file. `text-danger` and `text-muted` are existing theme tokens: `--color-danger` is defined in `apps/web/src/app/globals.css` and already used by `LibraryPanel`/`PropertiesPanel`.)

- [ ] **Step 4: Export the new type from the ui barrel**

In `packages/ui/src/index.ts`, replace line 28:

```ts
export type { ExportDialogProps, ExportOptions } from "./ExportDialog"
```

with:

```ts
export type { ExportDialogProps, ExportOptions, ExportPageOption } from "./ExportDialog"
```

- [ ] **Step 5: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: PASS (18 tests).

- [ ] **Step 6: Write the failing i18n test**

Create `apps/web/test/i18n-export.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

// `ensureI18n` initializes a module-level singleton, so tests read through
// `getFixedT(locale)` instead of switching the active language (which is async).

describe("Export dialog i18n — en", () => {
  it("resolves the page/scope/copy strings, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("export.page")).toBe("Page")
    expect(t("export.scope")).toBe("Content")
    expect(t("export.scopePage")).toBe("Whole page")
    expect(t("export.scopeSelection")).toBe("Selection only")
    expect(t("export.copy")).toBe("Copy to clipboard")
    expect(t("export.copied")).toBe("Copied to clipboard")
    expect(t("export.copyFailed")).toBe(
      "Couldn't copy to the clipboard. Your browser may not allow it — use Export instead.",
    )
  })
})

describe("Export dialog i18n — ko", () => {
  it("resolves the page/scope/copy strings, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("export.page")).toBe("페이지")
    expect(t("export.scope")).toBe("내용")
    expect(t("export.scopePage")).toBe("페이지 전체")
    expect(t("export.scopeSelection")).toBe("선택 항목만")
    expect(t("export.copy")).toBe("클립보드에 복사")
    expect(t("export.copied")).toBe("클립보드에 복사했습니다")
    expect(t("export.copyFailed")).toBe(
      "클립보드에 복사하지 못했습니다. 브라우저에서 허용하지 않을 수 있습니다. 대신 내보내기를 사용하세요.",
    )
  })
})
```

- [ ] **Step 7: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-export.test.tsx`
Expected: FAIL with `expected 'export.page' to be 'Page'` (the raw key is returned).

- [ ] **Step 8: Add the locale keys**

First, confirm that each file has exactly one `"embed"` key, inside `"export"`: `grep -n '"embed"' apps/web/src/locales/*/common.json`. The expected hits are en line 149 and ko line 147.

In `apps/web/src/locales/en/common.json`, replace:

```json
    "embed": "Embed scene (re-importable)",
```

with:

```json
    "embed": "Embed scene (re-importable)",
    "page": "Page",
    "scope": "Content",
    "scopePage": "Whole page",
    "scopeSelection": "Selection only",
    "copy": "Copy to clipboard",
    "copied": "Copied to clipboard",
    "copyFailed": "Couldn't copy to the clipboard. Your browser may not allow it — use Export instead.",
```

In `apps/web/src/locales/ko/common.json`, replace:

```json
    "embed": "장면 정보 포함",
```

with:

```json
    "embed": "장면 정보 포함",
    "page": "페이지",
    "scope": "내용",
    "scopePage": "페이지 전체",
    "scopeSelection": "선택 항목만",
    "copy": "클립보드에 복사",
    "copied": "클립보드에 복사했습니다",
    "copyFailed": "클립보드에 복사하지 못했습니다. 브라우저에서 허용하지 않을 수 있습니다. 대신 내보내기를 사용하세요.",
```

- [ ] **Step 9: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-export.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 10: Thread pages, activePageId and hasSelection into Dialogs**

At this point `ExportDialog` requires `pages`/`activePageId`, so the web app no longer typechecks. Fix that by threading the props through. The export itself still renders the active page with `drawing.*` names until Task 4.

In `apps/web/src/components/Dialogs.tsx`, add these imports after `import { renderExportSVG } from "../driver/exportSVG"`:

```ts
import { hasExportableSelection } from "../driver/exportTarget"
import type { PageRecord } from "../driver/pages"
```

Next, replace the component signature line:

```tsx
export function Dialogs({ scene }: { scene: Scene }): React.ReactElement {
```

with:

```tsx
export interface DialogsProps {
  scene: Scene
  pages: readonly PageRecord[]
  activePageId: string
}

export function Dialogs({ scene, pages, activePageId }: DialogsProps): React.ReactElement {
```

Then, directly after `const resolvedTheme = useAppStore((s) => s.resolvedTheme)`, add:

```tsx
const selectedIds = useAppStore((s) => s.selectedIds)
const exportOpen = openDialog === "export"
// Only computed while the dialog is open; the closure check walks the page.
const hasSelection = exportOpen && hasExportableSelection(scene.getElements(), selectedIds)
```

Finally, replace the `<ExportDialog … />` element:

```tsx
<ExportDialog
  t={t}
  open={openDialog === "export"}
  onClose={() => setOpenDialog(null)}
  onExport={onExport}
  defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
/>
```

with:

```tsx
<ExportDialog
  t={t}
  open={exportOpen}
  onClose={() => setOpenDialog(null)}
  onExport={onExport}
  pages={pages.map((p) => ({ id: p.id, name: p.name }))}
  activePageId={activePageId}
  hasSelection={hasSelection}
  defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
/>
```

In `apps/web/src/components/App.tsx`, replace line 778:

```tsx
<Dialogs scene={scene} />
```

with:

```tsx
<Dialogs scene={scene} pages={pages} activePageId={activePageId} />
```

- [ ] **Step 11: Typecheck, lint and test both packages**

Run: `pnpm --filter @excalidraw-clone/ui typecheck && pnpm --filter @excalidraw-clone/ui lint && pnpm --filter @excalidraw-clone/ui test && pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add packages/ui/src/ExportDialog.tsx packages/ui/src/index.ts packages/ui/test/ExportDialog.test.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/test/i18n-export.test.tsx apps/web/src/components/Dialogs.tsx apps/web/src/components/App.tsx
git commit -m "feat(ui,web): add page picker, selection scope and copy button to the export dialog" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 4: Wire up export target, filenames and clipboard copy; add the e2e spec

**Files:**

- Create: `apps/web/e2e/export.spec.ts`
- Modify: `apps/web/src/components/Dialogs.tsx` (whole file)

**Interfaces:**

- Consumes:
  - Task 1: `resolveExportTarget`, `hasExportableSelection`, `exportFilename`, `ExportTarget`
  - Task 2: `exportToPNG(elements, opts, canvasBg, pageName)`, `renderExportSVG(elements, opts, canvasBg)`, `copyPNGToClipboard(render)`
  - Task 3: `ExportDialog` props `pages`/`activePageId`/`hasSelection`/`onCopy`, and the test ids `export-page`, `scope-page`, `scope-selection`, `export-copy`, `export-copy-success`, `export-copy-error`
  - e2e: `dragOnCanvas` from `apps/web/e2e/_helpers.ts`
- Produces: the final export behavior. No new exported symbols beyond `DialogsProps` (Task 3).

- [ ] **Step 1: Write the failing e2e spec**

Create `apps/web/e2e/export.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas } from "./_helpers"

type Point = { x: number; y: number }
type ExportedPNG = { filename: string; width: number; height: number; bytes: Buffer }

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const drawRect = async (page: Page, from: Point, to: Point): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

/** Rect A (60×60 at 100,100) and rect B (100×80 at 400,300); then marquee-select A only. */
const drawTwoRectsAndSelectFirst = async (page: Page): Promise<void> => {
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await drawRect(page, { x: 400, y: 300 }, { x: 500, y: 380 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 180, y: 180 })
  await page.waitForTimeout(150)
}

const exportButton = (page: Page) => page.getByRole("button", { name: "Export", exact: true })

const openExportDialog = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await expect(exportButton(page)).toBeVisible()
}

/** Click Export and read the downloaded PNG's name and IHDR dimensions. */
const exportPNG = async (page: Page): Promise<ExportedPNG> => {
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG")
  return {
    filename: download.suggestedFilename(),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes,
  }
}

const expectNear = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3)
}

const embeddedRectangleCount = (bytes: Buffer): number =>
  (bytes.toString("latin1").match(/"type":"rectangle"/g) ?? []).length

test("selection-only export renders just the selected elements' bounding box", async ({ page }) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  // Whole page (default): bbox x 100..500, y 100..380, plus 20px padding per side.
  await openExportDialog(page)
  await expect(page.locator('[data-testid="scope-page"]')).toHaveAttribute("aria-pressed", "true")
  const whole = await exportPNG(page)
  expect(whole.filename).toBe("Page 1.png")
  expectNear(whole.width, 440)
  expectNear(whole.height, 320)

  // Selection only: rect A alone, 60×60 plus padding.
  await openExportDialog(page)
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPNG(page)
  expect(selection.filename).toBe("Page 1-selection.png")
  expectNear(selection.width, 100)
  expectNear(selection.height, 100)
})

test("embedded scene of a selection-only PNG contains only the selection", async ({ page }) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.getByLabel(/Embed scene/).check()
  const whole = await exportPNG(page)
  expect(embeddedRectangleCount(whole.bytes)).toBe(2)

  await openExportDialog(page)
  await page.getByLabel(/Embed scene/).check()
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPNG(page)
  expect(embeddedRectangleCount(selection.bytes)).toBe(1)
})

test("page picker exports a non-active page's content", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1: 60×60

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2: 300×200
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")

  const [page1Id, page2Id] = await page
    .locator('[data-testid^="page-tab-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("page-tab-", "")))

  await openExportDialog(page)
  const picker = page.locator('[data-testid="export-page"]')
  await expect(picker).toHaveValue(page2Id!)
  await expect(page.locator('[data-testid="scope-selection"]')).toBeVisible()

  // Picking another page hides the (page-local) selection toggle.
  await picker.selectOption(page1Id!)
  await expect(page.locator('[data-testid="scope-selection"]')).toHaveCount(0)
  const other = await exportPNG(page)
  expect(other.filename).toBe("Page 1.png")
  expectNear(other.width, 100)
  expectNear(other.height, 100)

  // Reopening defaults back to the active page.
  await openExportDialog(page)
  await expect(picker).toHaveValue(page2Id!)
  const active = await exportPNG(page)
  expect(active.filename).toBe("Page 2.png")
  expectNear(active.width, 340)
  expectNear(active.height, 240)
})

test("copy to clipboard writes a PNG of the selection even when SVG is chosen", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.locator('[data-testid="format-svg"]').click()
  await page.locator('[data-testid="scope-selection"]').click()
  await page.locator('[data-testid="export-copy"]').click()
  await expect(page.locator('[data-testid="export-copy-success"]')).toHaveText(
    "Copied to clipboard",
  )
  await expect(exportButton(page)).toBeVisible() // dialog stayed open

  await page.bringToFront()
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item!.getType("image/png")
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    return {
      types: [...item!.types],
      signature: Array.from(bytes.slice(0, 8)),
      width: view.getUint32(16),
      height: view.getUint32(20),
    }
  })
  expect(clip.types).toContain("image/png")
  expect(clip.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expectNear(clip.width, 100)
  expectNear(clip.height, 100)
})

test("a failed clipboard write shows an inline error and keeps the dialog usable", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    })
  })

  await openExportDialog(page)
  await page.locator('[data-testid="export-copy"]').click()
  // By test id, not getByRole("alert"): Next's dev route announcer also has role=alert.
  await expect(page.locator('[data-testid="export-copy-error"]')).toHaveText(
    "Couldn't copy to the clipboard. Your browser may not allow it — use Export instead.",
  )
  await expect(exportButton(page)).toBeVisible()

  const exported = await exportPNG(page)
  expect(exported.filename).toBe("Page 1.png")
})
```

- [ ] **Step 2: Run the e2e spec and confirm it fails**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: FAIL (all 5 tests). Do not commit yet.

- "selection-only…" and "page picker…" fail at their first filename assertion: `Expected: "Page 1.png"`, `Received: "drawing.png"`.
- "embedded scene…" fails at `expect(embeddedRectangleCount(selection.bytes)).toBe(1)`, which receives 2.
- "copy to clipboard…" and "a failed clipboard write…" time out waiting for `[data-testid="export-copy"]`. The button is hidden because `onCopy` is not wired yet.

If "selection-only…" instead fails earlier, at `scope-page` not being visible, the selection was lost when the menu opened. Stop and investigate with superpowers:systematic-debugging; do not weaken the test.

- [ ] **Step 3: Implement the final Dialogs wiring**

Replace the entire contents of `apps/web/src/components/Dialogs.tsx` with:

```tsx
"use client"
import { clearAllFiles, clearLocal, download } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import {
  ExportDialog,
  HelpDialog,
  ResetCanvasDialog,
  type ExportOptions,
} from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { exportToPNG } from "../driver/exportPNG"
import { renderExportSVG } from "../driver/exportSVG"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
  type ExportTarget,
} from "../driver/exportTarget"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"

export interface DialogsProps {
  scene: Scene
  pages: readonly PageRecord[]
  activePageId: string
}

export function Dialogs({ scene, pages, activePageId }: DialogsProps): React.ReactElement {
  const { t } = useTranslation()
  const openDialog = useAppStore((s) => s.openDialog)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const canvasBg = useAppStore((s) => s.canvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const exportOpen = openDialog === "export"
  // Only computed while the dialog is open; the closure check walks the page.
  const hasSelection = exportOpen && hasExportableSelection(scene.getElements(), selectedIds)

  const targetFor = (opts: ExportOptions): ExportTarget =>
    resolveExportTarget(pages, activePageId, selectedIds, opts)

  const onExport = (opts: ExportOptions): void => {
    void exportImage(targetFor(opts), opts, canvasBg)
    setOpenDialog(null)
  }

  // Must stay synchronous up to the clipboard.write call (user activation):
  // copyPNGToClipboard issues the write before awaiting the render.
  const onCopy = (opts: ExportOptions): Promise<void> => {
    const target = targetFor(opts)
    return copyPNGToClipboard(() => exportToPNG(target.elements, opts, canvasBg, target.pageName))
  }

  const onResetConfirm = (): void => {
    scene.mutate((draft) => {
      draft.length = 0
    })
    clearLocal()
    void clearAllFiles()
    useAppStore.getState().setSelection([])
    setOpenDialog(null)
  }

  return (
    <>
      <HelpDialog t={t} open={openDialog === "help"} onClose={() => setOpenDialog(null)} />
      <ExportDialog
        t={t}
        open={exportOpen}
        onClose={() => setOpenDialog(null)}
        onExport={onExport}
        onCopy={onCopy}
        pages={pages.map((p) => ({ id: p.id, name: p.name }))}
        activePageId={activePageId}
        hasSelection={hasSelection}
        defaultBackground={resolvedTheme === "dark" ? "dark" : "white"}
      />
      <ResetCanvasDialog
        t={t}
        open={openDialog === "reset"}
        onClose={() => setOpenDialog(null)}
        onConfirm={onResetConfirm}
      />
    </>
  )
}

async function exportImage(
  target: ExportTarget,
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  const filename = exportFilename(target.pageName, target.scope, opts.format)
  if (opts.format === "svg") {
    const svg = await renderExportSVG(target.elements, opts, canvasBg)
    download(new Blob([svg], { type: "image/svg+xml" }), filename)
    return
  }
  download(await exportToPNG(target.elements, opts, canvasBg, target.pageName), filename)
}
```

(`resolveExportTarget`'s `request: { pageId; scope }` parameter accepts the full `ExportOptions` structurally.)

- [ ] **Step 4: Typecheck, lint and run the web unit suite**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all pass.

- [ ] **Step 5: Re-run the e2e spec and confirm it passes**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: PASS (5 tests).

If only "copy to clipboard…" fails, inside `navigator.clipboard.read()` with "Document is not focused": the `page.bringToFront()` call is already there, so add `await page.locator('[data-testid="export-copy-success"]').click()` immediately before the `page.evaluate`. That focuses the document. Do not drop the clipboard read-back assertion.

- [ ] **Step 6: Run the export regression in theme.spec**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/theme.spec.ts`
Expected: PASS. The single-page dark export is unaffected; its file is now named `Page 1.png`, which that test does not assert.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/export.spec.ts apps/web/src/components/Dialogs.tsx
git commit -m "feat(web): export selection or any page with page-named files, and copy PNG to clipboard" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 5: Full gate

**Files:** none modified. This task only verifies. If anything fails, fix it forward in the owning task's files.

**Interfaces:** consumes everything above and produces nothing new.

- [ ] **Step 1: Run the full monorepo gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all turbo tasks succeed. If lint output references paths from another worktree, re-run with `pnpm turbo run lint --force`.

- [ ] **Step 2: Run the related e2e specs**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts e2e/theme.spec.ts e2e/pages.spec.ts e2e/file-io.spec.ts e2e/clipboard.spec.ts`
Expected: PASS. These cover export, the dark-PNG export regression, multi-page state, Save/Open (untouched) and the element clipboard (it shares the Clipboard API but not this code).

- [ ] **Step 3: Run the whole e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS, with no new failures compared with `main`. The suite grows by the 5 new tests.

- [ ] **Step 4: Confirm a clean tree**

Run: `git status`
Expected: a clean working tree, with all work committed in Tasks 1–4. This task makes no commit unless a fix-forward was needed; in that case, commit it as `fix(web): <what was fixed>` plus the co-author trailer.

---

## Self-Review

I ran these checks after drafting. Findings and resolutions:

- **Spec coverage.**
  - Selection-only scope (`ExportOptions.scope`, default `"page"`):
    - the toggle shows only when there is a selection _and_ the target page is the active page → Task 3, Steps 1 and 3
    - resolution renders only the selection's bbox → Task 1 (`resolveExportTarget`) and Task 2 (explicit-elements renderers)
    - end to end → Task 4 e2e "selection-only export…"
  - Page picker (`ExportOptions.pageId`, defaults to the active page):
    - `<select>` only with 2+ pages, listing id (value) and name (label) → Task 3
    - exports that page's elements → Task 1 and Task 4 e2e "page picker…"
    - single output only; no batch/zip → Global Constraints
  - Copy to clipboard:
    - `onCopy` prop and the button next to Export → Task 3
    - always PNG → `{ ...currentOptions(), format: "png" }` in Task 3, plus Task 4 e2e choosing SVG first
    - `navigator.clipboard.write([new ClipboardItem({ "image/png": … })])` → Task 2
    - failures surface inline and the dialog never closes → Tasks 2, 3 and 4
  - Filenames from the page name, with a `-selection` suffix and a `drawing` fallback for blank names → Task 1 `exportFilename`, wired in Task 4.
  - New dedicated `apps/web/e2e/export.spec.ts` → Task 4. `theme.spec.ts` (line 97) is deliberately left as is: it is the only coverage of the theme-driven default background and the dark corner pixel, and it still passes.
  - i18n in en and ko inside `"export"` after `"embed"` → Task 3, Steps 6–9.
  - Save/Open, the StatsPanel and batch export are untouched → Global Constraints. No task lists those files.
- **Placeholder scan.** Every code step contains complete code. The only non-literal text is the commit co-author trailer, which is deliberately left to each implementer's own session attribution reminder. Commit subjects are exact.
- **Type consistency.**
  - `ExportScope` (Task 1) is `"page" | "selection"`, identical to `ExportOptions["scope"]` (Task 3). `resolveExportTarget(…, request: { pageId: string; scope: ExportScope })` therefore accepts an `ExportOptions` structurally in Task 4.
  - `exportFilename`'s `format: "png" | "svg"` equals `ExportOptions["format"]`.
  - `exportToPNG`'s `PNGRenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">` and `renderExportSVG`'s `Pick<ExportOptions, "background">` only read fields that existed before Task 3. Task 2 therefore compiles before Task 3 changes `ExportOptions`, and full `ExportOptions` values are accepted afterwards.
  - `onCopy?: (opts: ExportOptions) => Promise<void>` matches Task 4's `onCopy`, which returns `copyPNGToClipboard(...)`, a `Promise<void>`.
  - `FileLoader` returns `Promise<{ dataURL: string } | undefined>`, and `getFile` returns `Promise<ExcalidrawBinaryFile | undefined>` with `dataURL: string`, so it is assignable.
  - `ClipboardItem`'s lib.dom constructor takes `Record<string, string | Blob | PromiseLike<string | Blob>>`, so passing `render()` (a `Promise<Blob>`) type-checks.
  - With `exactOptionalPropertyTypes`, the optional props `onCopy`/`hasSelection` are always either omitted or passed a defined value.
  - In Task 3, the web package briefly fails to typecheck between Step 3 and Step 10. Step 10 (prop threading) restores it, and Step 11 verifies that before the commit.
- **Review Focus coverage.**
  - (1) closure/labels/frames/z-order → three Task 1 tests
  - (2) wrong page or selection leaking across pages → Task 1 ×3, Task 3 ×2, Task 4 e2e
  - (3) clipboard failures and user activation → Task 2 ×5, Task 3 ×3, Task 4 e2e ×2
  - (4) stale state on reopen → Task 3 "reopening resets…"
  - (5) hostile or blank names and the `-selection` fallback → 12 `exportFilename` cases plus "falls back to the whole page when the selection resolves to nothing"
  - Embedded-scene scoping → Task 4 e2e
- **Issues found and fixed while drafting.**
  - The prompt's summary implied that only the PNG path reaches into a scene. In fact **both** `renderToSVG(scene, …)` (`packages/renderer/src/svg.ts:54`) and `CanvasRenderer(canvas, scene, …)` take a `Scene`. Rather than changing either renderer, which is out of scope and would ripple into thumbnails and library previews, both drivers wrap explicit elements in `new Scene(elements)`. `App.tsx`'s `renderThumbnail` (around lines 384–387) already uses this pattern.
  - The naive selection filter would drop bound labels and frame members. I switched to the existing `expandIdsToCopyClosure`, the same closure copy/duplicate use.
  - The `<dialog>` component stays mounted while closed, so the existing `useEffect` reset (background only) had to be extended to scope, page and copy status. Review Focus #4 covers this.
  - The e2e error assertion uses a test id rather than `getByRole("alert")`, because Next's dev route announcer also has `role="alert"` and Playwright pierces its shadow DOM.
  - jsdom has neither `canvas.toBlob` nor a 2D context, so `exportToPNG` gets no unit test. It is covered by the Task 4 e2e tests (dimensions, filename, embedded content, clipboard) and the theme.spec regression.
  - No toast or transient-message primitive exists in `packages/ui`. Every existing `navigator.clipboard` call in `ContextMenuHost.tsx` (lines 65, 108, 128, 142) swallows errors with `.catch(() => {})`. There is therefore no established error-UI pattern to reuse, so the plan adds a minimal inline `<p role="alert">` using the existing `text-danger` token.
- **Re-verification pass (2026-10-01, against HEAD d96200f).** I re-checked:
  - `packages/ui/src/ExportDialog.tsx`: 149 lines; `ExportOptions` on lines 4–9; props on lines 11–18; background-reset `useEffect` on lines 37–39; buttons on lines 88–103; `Row`/`Toggle` on lines 109–149.
  - `packages/ui/test/ExportDialog.test.tsx`: 43 lines; 3 tests; `t = (key) => key`; confirm button found by `/export\.confirm/i`.
  - `packages/ui/test/setup.ts`: jest-dom plus the `showModal`/`close` polyfill. `packages/ui/src/index.ts` line 28 exports `ExportDialogProps, ExportOptions`.
  - `apps/web/src/driver/exportPNG.ts`: 76 lines; `exportToPNG(scene, opts, canvasBg = "#ffffff")`; `PADDING = 20`; `scene.getElements()` on line 14; `getFile` preload on lines 28–37; embed via `newPage("Page 1", scene.getElementsIncludingDeleted())` on line 51.
  - `apps/web/src/components/Dialogs.tsx`: 75 lines; `Dialogs({ scene })`; `exportScene` on lines 57–75 with hardcoded `drawing.svg`/`drawing.png`; SVG file preload inline.
  - `packages/renderer/src/svg.ts`: `renderToSVG(scene: Scene, opts)` on line 54; `padding` default 20; the `viewBox` attribute is `${bbox.x} ${bbox.y} ${width} ${height}` with a padded bbox; the background rect uses `resolveColor(background, theme)`.
  - `apps/web/src/components/App.tsx`:
    - `pages`/`setPages` on line 97, `activePageId` on line 98, `scene` `useMemo` on lines 100–103, `selectedIds` on line 228, `selectedElements` on lines 279–282
    - `onExport={() => setOpenDialog("export")}` on line 456; `<Dialogs scene={scene} />` on line 778
    - the `new Scene(item.elements)` + `renderToSVG` precedent on lines 384–387
  - `apps/web/src/driver/pages.ts`: `PageRecord { id; name; scene; viewport }`; `createPageRecord(name, elements)`; `addPage` names pages `Page ${n}`. `hydratePages` creates "Page 1" on a fresh store.
  - `@excalidraw-clone/scene` exports `expandIdsToCopyClosure`, `newFrame`, `newLabelFor`, `newImage`, `newRectangle` and `Scene`. `Scene.getElements()` filters deleted elements. `BoundElement.type` is `"arrow" | "text"`.
  - `@excalidraw-clone/persistence`'s `download(blob, filename)` already takes a filename. `getFile` is lazy over IndexedDB, so it is safe to import in jsdom. `embedTextChunk` writes plain UTF-8 tEXt, so the JSON is greppable in raw PNG bytes.
  - Locales: `"export"` object at en line 141 / ko line 139; `"embed"` at en line 149 / ko line 147, each unique.
  - The `ensureI18n(...).getFixedT` pattern (`apps/web/test/i18n-roughness.test.tsx`).
  - The `--color-danger` token in `apps/web/src/app/globals.css` line 19.
  - e2e: `dragOnCanvas`/`parseStoredScene` in `apps/web/e2e/_helpers.ts`; the hamburger `getByRole("button", { name: /menu/i })` and the "Export image…" menu text; `getByRole("button", { name: "Export", exact: true })` as used in `theme.spec.ts` line 97 onward; `page-tab-<id>`/`page-add` test ids in `PagesTabBar.tsx` lines 117 and 214; the marquee-select pattern from `align-distribute.spec.ts`.
  - Playwright config: Chromium only, `baseURL` `http://localhost:3000` (a secure context for the Clipboard API).
  - Package scripts (`test`, `typecheck`, `lint`, `e2e`) and Vitest ^2.1.8 in both packages.
  - Lint uses `recommendedTypeChecked`. The plan's code avoids floating promises (`void`) and `async` without `await` (the test fakes return `Promise.resolve()`).

  No discrepancies remain.
