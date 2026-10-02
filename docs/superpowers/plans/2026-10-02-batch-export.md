# Batch Export (All Pages as ZIP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Export dialog export every page at once, as a single `.zip` containing one PNG/SVG/PDF file per page (named exactly like today's single-page export). This is the next increment of the export/sharing roadmap: part 1 was export quality-of-life (`5eca279`), part 2 was PDF export (`8e363c2`); the export-quality-of-life plan explicitly scoped "any batch, all-pages, zip or PDF export" out — PDF closed the format gap, this closes the batch gap.

**Architecture:**

- New shared dispatcher `apps/web/src/driver/exportRender.ts` exports `renderPageBlob(format, elements, opts, canvasBg, pageName): Promise<Blob>`. It picks `exportToPNG`/`renderExportSVG`/`exportToPDF` by format and always returns a `Blob` (wrapping the SVG string itself, since `renderExportSVG` returns a string). `Dialogs.tsx`'s existing `exportImage()` is refactored to call it instead of its own three-branch `if`, so there is exactly one place that renders one page — used by both the existing single-file path and the new zip path.
- New driver `apps/web/src/driver/exportZip.ts` exports `buildExportZip(pages, opts, canvasBg): Promise<Blob>`. It loops every page (always the whole page — selection is page-local and doesn't apply across pages), calls `renderPageBlob` for each, names each entry with the existing `exportFilename(page.name, "page", opts.format)`, de-dupes same-named pages by appending ` (2)`, ` (3)`, … before the extension, and returns one zip `Blob` from `JSZip`. `jszip` is loaded with a lazy `import()`, like `jspdf`/`svg2pdf.js`.
- `packages/ui/src/ExportDialog.tsx`: `ExportOptions` gains `allPages: boolean`. A checkbox "Export all pages" renders above the page picker, but only when there are 2+ pages. Checking it hides the page picker, the selection-scope toggle, and the Copy button (a zip isn't clipboard-pastable) — Format, Scale (unless PDF), Background and Embed scene stay visible and apply to every page in the zip. `allPages` resets to `false` whenever the dialog reopens, like `scope`/`pageId`.
- `apps/web/src/components/Dialogs.tsx`: `onExport` branches on `opts.allPages` — build the zip via `buildExportZip(pages, opts, canvasBg)` and download it as `export.zip`, instead of resolving a single target.

**Tech Stack:** TypeScript, React 19, Vitest 2 + @testing-library/react (jsdom), Playwright e2e (Chromium), i18next JSON locales, pnpm + turbo monorepo, Next 16 (Turbopack). **One new runtime dependency: `jszip@3.10.2`, pinned exactly.**

**Spec:** inline in this plan. The design was approved in chat (scope: zip of per-page files; checkbox above the page picker; JSZip over a hand-rolled encoder). There is no separate spec document, matching the precedent set by the export-quality-of-life and PDF-export plans.

## Researched facts (verified 2026-10-02 in a scratch worktree of `main@8a91e33`, not from memory)

1. **Version.** `pnpm add jszip --save-exact` in `apps/web` resolves `jszip@3.10.2` (latest). It is not already present anywhere in the lockfile.
2. **Types are bundled.** `jszip`'s own `package.json` declares `"types": "./index.d.ts"`. No `@types/jszip` needed.
3. **Works under jsdom/Vitest with zero mocking**, unlike svg2pdf.js. A round-trip probe — build a zip with a `Blob` entry and a string entry via `zip.generateAsync({ type: "blob" })`, then read it back with `JSZip.loadAsync(blob)` — passed outright under the project's existing Vitest config. `blob.type` is `"application/zip"`.
4. **Bundling: `import("jszip")` produces a genuinely separate, lazily-loaded chunk under Next/Turbopack**, not part of the initial page bundle. Verified by wiring a throwaway dynamic-import call into `Dialogs.tsx` and running `next build`: the chunk containing JSZip's code appears only in `.next/server/app/page/react-loadable-manifest.json` (Next's manifest for code-split chunks), not in `app-build-manifest.json` (the initial/eager chunk list). `next build` itself completes with no warnings about Node builtins (JSZip's `browser` field in `package.json` correctly remaps `./lib/index` to `./dist/jszip.min.js` for bundlers that honor it, and Turbopack does).
5. **No existing precedent for unit-testing `exportToPNG`** — there is no `export-png.test.ts`; canvas rendering is e2e-only (`HTMLCanvasElement.getContext` is `"Not implemented"` under jsdom without the `canvas` npm package, which this project does not install). This plan does not change that: `exportRender.ts`'s PNG branch is pinned by mocking `exportToPNG` itself (so the test only pins _dispatch_, not canvas rendering), consistent with how `renderExportSVG` is the only one of the three drivers that gets a real, non-mocked unit test today.
6. **`renamePage` has no uniqueness check** (`apps/web/src/driver/pages.ts:55`) — two pages can share a name. This is required for Task 3's e2e de-dup test (rename a second page to collide with the first).

## Global Constraints

- **Exactly one new runtime dependency**: `"jszip": "3.10.2"` in `apps/web/package.json` `dependencies` only, pinned exactly, inserted alphabetically between `"jspdf"` and `"next"`. No new dev dependency.
- **The zip uses JSZip's default (no compression / STORE)** — `zip.generateAsync({ type: "blob" })` with no `compression` option. Do not add `compression: "DEFLATE"`; it adds async-worker complexity this feature doesn't need.
- **The zip's own filename is always the literal `"export.zip"`** — not derived from any page name (it spans every page, so no single page name fits).
- **All-pages export always uses the whole page for every page.** There is no `scope` concept inside `buildExportZip` at all — it is not a parameter. Selection scope stays page-local and is enforced entirely by the dialog hiding the scope toggle when `allPages` is checked.
- **The "Export all pages" checkbox renders only when `pages.length > 1`**, mirroring the existing page-picker's visibility rule exactly.
- **Checking it hides:** the page picker, the selection-scope toggle, and the Copy button. **It does not hide:** Format, Scale (still hidden for PDF, independent of `allPages`), Background, Embed scene — these apply uniformly to every file in the zip.
- **`allPages` resets to `false` every time the dialog opens**, in the same `useEffect` that resets `scope`/`pageId`/`copyStatus`.
- **Filename collisions** (two pages whose `exportFilename` output is identical after sanitizing) are disambiguated by appending ` (2)`, ` (3)`, … before the extension, in page order, first page keeping the unsuffixed name.
- **No new error UI.** A rendering failure during zip-building rejects silently (console error), exactly like the existing single-file `exportImage` path (`void exportImage(...)` in `Dialogs.tsx`, unchanged). Out of scope to add.
- **Out of scope; do not touch:** `packages/renderer/src/svg.ts`, `CanvasRenderer`, the internals of `exportPNG.ts`/`exportSVG.ts`/`exportPDF.ts` (only consumed via `renderPageBlob`, never modified), `copyImageToClipboard.ts`, `saveFile.ts`/`openFile.ts`, the StatsPanel, and combining pages into one multi-page PDF (every page is always its own file in the zip, regardless of format).
- TDD: every behavior gets a failing test first. Run the exact commands given and confirm the stated failure before you implement.
- Commit after each task with the exact subject given. End every commit message with the co-author trailer from your session's attribution reminder, passed as a second `-m`.
- Test commands:
  - `pnpm --filter @excalidraw-clone/web exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Before any Playwright run, make sure nothing else is listening on port 3000 (`ss -ltnp | grep :3000`); the config has `reuseExistingServer: true` and would silently test another checkout's server.

  Full gate: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`, or `pnpm turbo run build lint typecheck test --force` if lint output looks stale or cites paths from another worktree.

- Lint is `typescript-eslint` `recommendedTypeChecked` plus `import-x`. Avoid floating promises (use `void`), avoid `async` functions without `await` (return `Promise.resolve()` from fakes instead), use `import type` for type-only imports, and keep relative imports in each file alphabetical by path.

## Review Focus

These are the most likely failure modes, most likely first. Each one is pinned by named tests:

1. **Two pages whose names sanitize to the same filename silently overwrite each other in the zip** (only one of two survives) instead of both appearing with a disambiguating suffix.
   - Pinned by Task 1: `buildExportZip` "disambiguates pages that sanitize to the same filename". Task 3 e2e: "export all pages disambiguates same-named pages".
2. **Checking "Export all pages" doesn't actually suppress selection scope, or only one page ends up in the zip** — a leftover `scope: "selection"` or a single `pageId` leaks into the zip, so it zips only a selection or only one page's worth of content instead of every whole page.
   - Pinned by Task 2: the dialog test asserting the scope toggle and page picker disappear and `onExport` receives `allPages: true`. Task 1: `buildExportZip`'s signature has no `scope` parameter at all, so there is nothing to leak — pinned structurally, and by "adds one entry per page, named like a single export", which asserts both of two pages appear in the zip.
3. **Reopening the dialog after a zip export leaves `allPages` checked**, so the next ordinary "Export" click silently produces a zip instead of the single file the user expects.
   - Pinned by Task 2: "reopening resets allPages to false".
4. **The all-pages checkbox is shown (or hidden) inconsistently with the page picker** — e.g. it appears with only one page, where it would always produce a redundant one-entry zip and confuse a user who has never seen a page picker.
   - Pinned by Task 2: "hides the all-pages checkbox when there is only one page".
5. **The chosen format doesn't actually apply to every file in the zip** — e.g. all entries come out PNG regardless of the Format toggle.
   - Pinned by Task 1: `buildExportZip` "renders every page with the requested format". Task 3 e2e: "export all pages downloads a zip with one entry per page" uses a non-default format.

---

### Task 1: Shared render dispatcher + `jszip` + zip builder

**Files:**

- Create: `apps/web/src/driver/exportRender.ts`
- Create: `apps/web/src/driver/exportZip.ts`
- Modify: `apps/web/package.json` (add `jszip` dependency)
- Modify: `apps/web/src/components/Dialogs.tsx` (refactor `exportImage` to use `renderPageBlob`; behavior-preserving)
- Test: `apps/web/test/export-render.test.ts`
- Test: `apps/web/test/export-zip.test.ts`

**Interfaces:**

- Consumes: `exportToPNG(elements, opts, canvasBg, pageName)` from `./exportPNG` (existing); `renderExportSVG(elements, opts, canvasBg)` from `./exportSVG` (existing); `exportToPDF(elements, opts, canvasBg)` from `./exportPDF` (existing); `exportFilename(pageName, scope, format)` from `./exportTarget` (existing); `type PageRecord` from `./pages` (existing); `type ExportOptions` from `@excalidraw-clone/ui` (existing, not yet widened — this task only uses its pre-existing `format`/`scale`/`background`/`embedScene` fields).
- Produces: `renderPageBlob(format: ExportOptions["format"], elements: readonly ExcalidrawElement[], opts: Pick<ExportOptions, "scale" | "background" | "embedScene">, canvasBg: string, pageName: string): Promise<Blob>` from `exportRender.ts`, and `buildExportZip(pages: readonly Pick<PageRecord, "name" | "scene">[], opts: Pick<ExportOptions, "format" | "scale" | "background" | "embedScene">, canvasBg: string): Promise<Blob>` from `exportZip.ts` — both consumed by Task 3 (`Dialogs.tsx` wiring).

- [ ] **Step 1: Add the `jszip` dependency**

```bash
pnpm --filter @excalidraw-clone/web add jszip --save-exact
```

Expected: `apps/web/package.json`'s `dependencies` gains `"jszip": "3.10.2"`, inserted alphabetically between `"jspdf"` and `"next"`. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the failing test for `renderPageBlob`**

Create `apps/web/test/export-render.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const exportToPNG = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(new Blob(["png-bytes"], { type: "image/png" }))),
)
const renderExportSVG = vi.hoisted(() => vi.fn(() => Promise.resolve("<svg></svg>")))
const exportToPDF = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(new Blob(["pdf-bytes"], { type: "application/pdf" }))),
)
vi.mock("../src/driver/exportPNG", () => ({ exportToPNG }))
vi.mock("../src/driver/exportSVG", () => ({ renderExportSVG }))
vi.mock("../src/driver/exportPDF", () => ({ exportToPDF }))

import { renderPageBlob } from "../src/driver/exportRender"

const ELEMENTS: never[] = []
const OPTS = { scale: 1 as const, background: "white" as const, embedScene: false }

beforeEach(() => {
  exportToPNG.mockClear()
  renderExportSVG.mockClear()
  exportToPDF.mockClear()
})

describe("renderPageBlob", () => {
  it("dispatches png to exportToPNG, forwarding pageName", async () => {
    const blob = await renderPageBlob("png", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(exportToPNG).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff", "Page 1")
    expect(renderExportSVG).not.toHaveBeenCalled()
    expect(exportToPDF).not.toHaveBeenCalled()
    expect(blob.type).toBe("image/png")
  })

  it("dispatches svg to renderExportSVG and wraps the string as a Blob", async () => {
    const blob = await renderPageBlob("svg", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(renderExportSVG).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff")
    expect(blob.type).toBe("image/svg+xml")
    expect(await blob.text()).toBe("<svg></svg>")
  })

  it("dispatches pdf to exportToPDF", async () => {
    const blob = await renderPageBlob("pdf", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(exportToPDF).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff")
    expect(blob.type).toBe("application/pdf")
  })
})
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-render.test.ts`
Expected: FAIL — `Cannot find module '../src/driver/exportRender'` (or similar resolve error).

- [ ] **Step 4: Implement `exportRender.ts`**

Create `apps/web/src/driver/exportRender.ts`:

```ts
"use client"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { exportToPDF } from "./exportPDF"
import { exportToPNG } from "./exportPNG"
import { renderExportSVG } from "./exportSVG"

export type RenderOptions = Pick<ExportOptions, "scale" | "background" | "embedScene">

/** Render exactly `elements` to a Blob in the given format, dispatching to
 *  the matching driver. The one place every export path — a single file or
 *  one entry of a zip — renders a page, so they can never drift apart. */
export async function renderPageBlob(
  format: ExportOptions["format"],
  elements: readonly ExcalidrawElement[],
  opts: RenderOptions,
  canvasBg: string,
  pageName: string,
): Promise<Blob> {
  if (format === "svg") {
    const svg = await renderExportSVG(elements, opts, canvasBg)
    return new Blob([svg], { type: "image/svg+xml" })
  }
  if (format === "pdf") return exportToPDF(elements, opts, canvasBg)
  return exportToPNG(elements, opts, canvasBg, pageName)
}
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-render.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing test for `buildExportZip`**

Create `apps/web/test/export-zip.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const renderPageBlob = vi.hoisted(() =>
  vi.fn((format: string, _elements: unknown, _opts: unknown, _canvasBg: string, pageName: string) =>
    Promise.resolve(new Blob([`${format}:${pageName}`], { type: "text/plain" })),
  ),
)
vi.mock("../src/driver/exportRender", () => ({ renderPageBlob }))

import JSZip from "jszip"
import { buildExportZip } from "../src/driver/exportZip"

const sceneOf = (elements: never[] = []): { getElements: () => never[] } => ({
  getElements: () => elements,
})
const OPTS = {
  format: "png" as const,
  scale: 1 as const,
  background: "white" as const,
  embedScene: false,
}

beforeEach(() => {
  renderPageBlob.mockClear()
})

describe("buildExportZip", () => {
  it("adds one entry per page, named like a single export", async () => {
    const pages = [
      { name: "Page 1", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
    ]
    const blob = await buildExportZip(pages, OPTS, "#fff")
    expect(blob.type).toBe("application/zip")
    const zip = await JSZip.loadAsync(blob)
    expect(Object.keys(zip.files).sort()).toEqual(["Notes.png", "Page 1.png"])
    expect(await zip.file("Page 1.png")?.async("text")).toBe("png:Page 1")
  })

  it("disambiguates pages that sanitize to the same filename", async () => {
    const pages = [
      { name: "Notes", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
    ]
    const zip = await JSZip.loadAsync(await buildExportZip(pages, OPTS, "#fff"))
    expect(Object.keys(zip.files).sort()).toEqual(["Notes (2).png", "Notes (3).png", "Notes.png"])
  })

  it("renders every page with the requested format", async () => {
    await buildExportZip([{ name: "Page 1", scene: sceneOf() }], { ...OPTS, format: "pdf" }, "#fff")
    expect(renderPageBlob).toHaveBeenCalledWith(
      "pdf",
      [],
      expect.objectContaining({ format: "pdf" }),
      "#fff",
      "Page 1",
    )
  })

  it("works with a single page", async () => {
    const zip = await JSZip.loadAsync(
      await buildExportZip([{ name: "Page 1", scene: sceneOf() }], OPTS, "#fff"),
    )
    expect(Object.keys(zip.files)).toEqual(["Page 1.png"])
  })
})
```

- [ ] **Step 7: Run it, confirm it fails**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-zip.test.ts`
Expected: FAIL — `Cannot find module '../src/driver/exportZip'` (or similar resolve error).

- [ ] **Step 8: Implement `exportZip.ts`**

Create `apps/web/src/driver/exportZip.ts`:

```ts
"use client"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderPageBlob, type RenderOptions } from "./exportRender"
import { exportFilename } from "./exportTarget"
import type { PageRecord } from "./pages"

export type ZipOptions = RenderOptions & Pick<ExportOptions, "format">

/** Export every page as its own file, named like a single-page export,
 *  bundled into one uncompressed .zip. Same-named pages (after
 *  exportFilename's sanitizing) are disambiguated with " (2)", " (3)", etc.
 *  before the extension, in page order. jszip is loaded on first use. */
export async function buildExportZip(
  pages: readonly Pick<PageRecord, "name" | "scene">[],
  opts: ZipOptions,
  canvasBg: string,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  const used = new Set<string>()
  for (const page of pages) {
    const blob = await renderPageBlob(
      opts.format,
      page.scene.getElements(),
      opts,
      canvasBg,
      page.name,
    )
    zip.file(uniqueName(exportFilename(page.name, "page", opts.format), used), blob)
  }
  return zip.generateAsync({ type: "blob" })
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf(".")
  const base = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? "" : name.slice(dot)
  let i = 2
  let candidate = `${base} (${i})${ext}`
  while (used.has(candidate)) {
    i += 1
    candidate = `${base} (${i})${ext}`
  }
  used.add(candidate)
  return candidate
}
```

- [ ] **Step 9: Run the test, confirm it passes**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-zip.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Refactor `Dialogs.tsx`'s `exportImage` to use `renderPageBlob`**

In `apps/web/src/components/Dialogs.tsx`, change the import block from:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { exportToPDF } from "../driver/exportPDF"
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
```

to:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { renderPageBlob } from "../driver/exportRender"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
  type ExportTarget,
} from "../driver/exportTarget"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"
```

Then change the `exportImage` function from:

```ts
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
  if (opts.format === "pdf") {
    download(await exportToPDF(target.elements, opts, canvasBg), filename)
    return
  }
  download(await exportToPNG(target.elements, opts, canvasBg, target.pageName), filename)
}
```

to:

```ts
async function exportImage(
  target: ExportTarget,
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  const filename = exportFilename(target.pageName, target.scope, opts.format)
  download(
    await renderPageBlob(opts.format, target.elements, opts, canvasBg, target.pageName),
    filename,
  )
}
```

This is behavior-preserving: `exportImage` renders and downloads exactly as before, just via the shared dispatcher.

- [ ] **Step 11: Confirm no regression**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web exec vitest run`
Expected: PASS (all existing tests, plus the 7 new ones from this task).

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: PASS (all existing export e2e tests still pass — this is the regression check for the `exportImage` refactor, since it has no unit test of its own).

- [ ] **Step 12: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/driver/exportRender.ts apps/web/src/driver/exportZip.ts apps/web/src/components/Dialogs.tsx apps/web/test/export-render.test.ts apps/web/test/export-zip.test.ts
git commit -m "feat(web): add a shared per-page render dispatcher and a zip builder" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `ExportDialog` — "Export all pages" checkbox

**Files:**

- Modify: `packages/ui/src/ExportDialog.tsx`
- Modify: `apps/web/src/locales/en/common.json`
- Modify: `apps/web/src/locales/ko/common.json`
- Test: `packages/ui/test/ExportDialog.test.tsx`

**Interfaces:**

- Consumes: nothing new from earlier tasks (this task only touches `packages/ui`, which cannot import from `apps/web`).
- Produces: `ExportOptions.allPages: boolean`, emitted by `onExport`/`onCopy`'s `opts` — consumed by Task 3 (`Dialogs.tsx`'s `onExport` branches on it).

- [ ] **Step 1: Write the failing tests**

In `packages/ui/test/ExportDialog.test.tsx`, update the two existing exact-match assertions. Change:

```ts
expect(onExport).toHaveBeenCalledWith({
  format: "png",
  scale: 1,
  background: "white",
  embedScene: false,
  scope: "page",
  pageId: "p1",
})
```

to:

```ts
expect(onExport).toHaveBeenCalledWith({
  format: "png",
  scale: 1,
  background: "white",
  embedScene: false,
  scope: "page",
  pageId: "p1",
  allPages: false,
})
```

and change:

```ts
expect(onExport).toHaveBeenCalledWith({
  format: "svg",
  scale: 2,
  background: "dark",
  embedScene: true,
  scope: "page",
  pageId: "p1",
})
```

to:

```ts
expect(onExport).toHaveBeenCalledWith({
  format: "svg",
  scale: 2,
  background: "dark",
  embedScene: true,
  scope: "page",
  pageId: "p1",
  allPages: false,
})
```

Then append a new describe block at the end of the file:

```ts
describe("ExportDialog — export all pages", () => {
  it("hides the all-pages checkbox when there is only one page", () => {
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
    expect(screen.queryByTestId("export-all-pages")).toBeNull()
  })

  it("shows the checkbox with 2+ pages, unchecked by default", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={TWO_PAGES}
        activePageId="p1"
      />,
    )
    expect(screen.getByTestId("export-all-pages")).not.toBeChecked()
  })

  it("checking it hides the page picker, scope toggle and Copy button, and emits allPages: true", async () => {
    const onExport = vi.fn()
    const onCopy = vi.fn<CopyFn>(() => Promise.resolve())
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        onCopy={onCopy}
        pages={TWO_PAGES}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("export-all-pages"))
    expect(screen.queryByTestId("export-page")).toBeNull()
    expect(screen.queryByTestId("scope-page")).toBeNull()
    expect(screen.queryByTestId("export-copy")).toBeNull()
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ allPages: true }))
  })

  it("unchecking restores the page picker and scope toggle", async () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={TWO_PAGES}
        activePageId="p1"
        hasSelection
      />,
    )
    const checkbox = screen.getByTestId("export-all-pages")
    await userEvent.click(checkbox)
    await userEvent.click(checkbox)
    expect(screen.getByTestId("export-page")).toBeInTheDocument()
    expect(screen.getByTestId("scope-page")).toBeInTheDocument()
  })

  it("reopening resets allPages to false", async () => {
    const onExport = vi.fn()
    const props = { t, onClose: () => {}, onExport, pages: TWO_PAGES, activePageId: "p1" }
    const { rerender } = render(<ExportDialog {...props} open />)
    await userEvent.click(screen.getByTestId("export-all-pages"))
    rerender(<ExportDialog {...props} open={false} />)
    rerender(<ExportDialog {...props} open />)
    expect(screen.getByTestId("export-all-pages")).not.toBeChecked()
    expect(screen.getByTestId("export-page")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: FAIL — the two updated exact-match tests fail on the missing `allPages` key, and every new test in the "export all pages" block fails with `Unable to find an element by: [data-testid="export-all-pages"]`.

- [ ] **Step 3: Widen `ExportOptions` and add the checkbox**

In `packages/ui/src/ExportDialog.tsx`, change the interface from:

```ts
export interface ExportOptions {
  format: "png" | "svg" | "pdf"
  scale: 1 | 2 | 3
  background: "white" | "dark" | "transparent"
  embedScene: boolean
  /** "selection" exports only the current selection (active page only). */
  scope: "page" | "selection"
  /** The page whose elements are exported. */
  pageId: string
}
```

to:

```ts
export interface ExportOptions {
  format: "png" | "svg" | "pdf"
  scale: 1 | 2 | 3
  background: "white" | "dark" | "transparent"
  embedScene: boolean
  /** "selection" exports only the current selection (active page only). */
  scope: "page" | "selection"
  /** The page whose elements are exported. Ignored when allPages is true. */
  pageId: string
  /** Export every page as its own file inside one .zip, instead of a single file. */
  allPages: boolean
}
```

Change the state declarations from:

```ts
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
```

to:

```ts
const [format, setFormat] = useState<ExportOptions["format"]>("png")
const [scale, setScale] = useState<ExportOptions["scale"]>(1)
const [background, setBackground] = useState<ExportOptions["background"]>(
  defaultBackground ?? "white",
)
const [embedScene, setEmbedScene] = useState(false)
const [scope, setScope] = useState<ExportOptions["scope"]>("page")
const [pageId, setPageId] = useState(activePageId)
const [allPages, setAllPages] = useState(false)
const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle")

// The component stays mounted while closed, so per-session choices are
// reset every time the dialog opens.
useEffect(() => {
  if (!open) return
  setBackground(defaultBackground ?? "white")
  setScope("page")
  setPageId(activePageId)
  setAllPages(false)
  setCopyStatus("idle")
}, [open, defaultBackground, activePageId])
```

Change the derived values and `currentOptions` from:

```ts
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
```

to:

```ts
// A picked page that no longer exists falls back to the active page.
const targetPageId = pages.some((p) => p.id === pageId) ? pageId : activePageId
const showAllPagesToggle = pages.length > 1
const showPagePicker = pages.length > 1 && !allPages
// Selection is page-local: only offer it when exporting the active page,
// and never alongside an all-pages zip.
const showScope = !allPages && hasSelection && targetPageId === activePageId
const currentOptions = (): ExportOptions => ({
  format,
  scale,
  background,
  embedScene,
  scope: showScope ? scope : "page",
  pageId: targetPageId,
  allPages,
})
```

Change the page-picker `Row` from:

```tsx
        {pages.length > 1 && (
          <Row label={t("export.page")}>
```

to:

```tsx
        {showAllPagesToggle && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="export-all-pages"
              checked={allPages}
              onChange={(e) => setAllPages(e.target.checked)}
            />
            {t("export.allPages")}
          </label>
        )}
        {showPagePicker && (
          <Row label={t("export.page")}>
```

Change the Copy button from:

```tsx
          {onCopy && (
            <button
              type="button"
              data-testid="export-copy"
```

to:

```tsx
          {onCopy && !allPages && (
            <button
              type="button"
              data-testid="export-copy"
```

- [ ] **Step 4: Add the `export.allPages` i18n key**

In `apps/web/src/locales/en/common.json`, change:

```json
    "embed": "Embed scene (re-importable)",
    "page": "Page",
```

to:

```json
    "embed": "Embed scene (re-importable)",
    "allPages": "Export all pages (.zip)",
    "page": "Page",
```

In `apps/web/src/locales/ko/common.json`, change:

```json
    "embed": "장면 정보 포함",
    "page": "페이지",
```

to:

```json
    "embed": "장면 정보 포함",
    "allPages": "모든 페이지 내보내기 (.zip)",
    "page": "페이지",
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: PASS (all existing tests plus the 5 new ones).

- [ ] **Step 6: Confirm the rest of the UI package and the web app still typecheck**

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: FAIL — `Dialogs.tsx` constructs `ExportOptions` nowhere directly (it only forwards what the dialog emits), so this should still PASS. If it fails, it means some other `apps/web` call site builds an `ExportOptions` object literal missing `allPages`; find it and add `allPages: false}` — there should be none before Task 3.

Note: the dialog itself is the only `ExportOptions` producer; `Dialogs.tsx` only ever receives and forwards what it emits (`onExport`/`onCopy` parameters), so `apps/web` typecheck is expected to pass unchanged by this task.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/ExportDialog.tsx packages/ui/test/ExportDialog.test.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "feat(ui): offer an 'Export all pages' checkbox in the Export dialog" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `Dialogs.tsx`; e2e tests

**Files:**

- Modify: `apps/web/src/components/Dialogs.tsx`
- Modify: `apps/web/e2e/export.spec.ts`

**Interfaces:**

- Consumes: `buildExportZip(pages, opts, canvasBg)` from `../driver/exportZip` (Task 1); `ExportOptions.allPages` (Task 2); `download(blob, filename)` from `@excalidraw-clone/persistence` (existing, already imported).
- Produces: nothing new for later tasks — this is the final wiring task besides the full gate.

**Why this task's RED is e2e-only:** `onExport` is a module-private closure of a client component. By this point in the plan, Task 2's checkbox already exists and emits `allPages: true`, but `Dialogs.tsx` doesn't read it yet — `targetFor(opts)` still forces `scope: "page"` and keeps whichever single `pageId` was active, so checking "Export all pages" and clicking Export still downloads one page's single file, not a zip. The e2e tests below are genuinely RED against that state: `download.suggestedFilename()` is the active page's own filename (e.g. `"Page 2.svg"`), never the literal `"export.zip"` both tests assert.

- [ ] **Step 1: Write the failing e2e tests**

In `apps/web/e2e/export.spec.ts`, add `import JSZip from "jszip"` to the top import block, changing:

```ts
import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { dragOnCanvas } from "./_helpers"
```

to:

```ts
import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { dragOnCanvas } from "./_helpers"
```

Then append two new tests at the end of the file:

```ts
test("export all pages downloads a zip with one entry per page", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  await openExportDialog(page)
  await page.locator('[data-testid="format-svg"]').click()
  await expect(page.locator('[data-testid="export-all-pages"]')).toBeVisible()
  await page.locator('[data-testid="export-all-pages"]').check()
  await expect(page.locator('[data-testid="export-page"]')).toHaveCount(0)

  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("export.zip")
  const bytes = readFileSync(await download.path())
  const zip = await JSZip.loadAsync(bytes)
  expect(Object.keys(zip.files).sort()).toEqual(["Page 1.svg", "Page 2.svg"])
  const page1Svg = await zip.file("Page 1.svg")?.async("text")
  expect(page1Svg).toContain("<svg")
})

test("export all pages disambiguates pages that share a name", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  const secondId = (await page
    .locator('[data-testid^="page-tab-"]')
    .nth(1)
    .getAttribute("data-testid"))!.replace("page-tab-", "")

  // Rename page 2 to "Page 1" so both pages share a name.
  await page.locator(`[data-testid="page-switch-${secondId}"]`).dblclick()
  const input = page.locator(`[data-testid="page-rename-input-${secondId}"]`)
  await input.fill("Page 1")
  await input.press("Enter")
  await expect(input).toHaveCount(0)

  await openExportDialog(page)
  await page.locator('[data-testid="export-all-pages"]').check()
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const bytes = readFileSync(await (await downloadPromise).path())
  const zip = await JSZip.loadAsync(bytes)
  expect(Object.keys(zip.files).sort()).toEqual(["Page 1 (2).png", "Page 1.png"])
})
```

- [ ] **Step 2: Run the new e2e tests, confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts -g "all pages"`
Expected: FAIL on both tests' `expect(download.suggestedFilename()).toBe("export.zip")` — `onExport` still ignores `opts.allPages` and downloads the active page's own single file instead.

- [ ] **Step 3: Wire `onExport` to branch on `allPages`**

In `apps/web/src/components/Dialogs.tsx`, change the import block from:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { renderPageBlob } from "../driver/exportRender"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
  type ExportTarget,
} from "../driver/exportTarget"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"
```

to:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { renderPageBlob } from "../driver/exportRender"
import {
  exportFilename,
  hasExportableSelection,
  resolveExportTarget,
  type ExportTarget,
} from "../driver/exportTarget"
import { buildExportZip } from "../driver/exportZip"
import type { PageRecord } from "../driver/pages"
import { useAppStore } from "../store"
```

Change `onExport` from:

```ts
const onExport = (opts: ExportOptions): void => {
  void exportImage(targetFor(opts), opts, canvasBg)
  setOpenDialog(null)
}
```

to:

```ts
const onExport = (opts: ExportOptions): void => {
  if (opts.allPages) {
    void exportAllPages(pages, opts, canvasBg)
  } else {
    void exportImage(targetFor(opts), opts, canvasBg)
  }
  setOpenDialog(null)
}
```

Add a new function right after `exportImage`'s closing brace (i.e. after the function this plan's Task 1 Step 10 last edited):

```ts
async function exportAllPages(
  pages: readonly PageRecord[],
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  download(await buildExportZip(pages, opts, canvasBg), "export.zip")
}
```

- [ ] **Step 4: Run the web unit tests and typecheck**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web exec vitest run`
Expected: PASS (no regressions; `Dialogs.tsx` has no unit tests of its own — the e2e tests below are the real coverage for this wiring).

- [ ] **Step 5: Run the full export e2e spec, confirm the new tests now pass**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Dialogs.tsx apps/web/e2e/export.spec.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): export every page as a zip when 'Export all pages' is checked" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(`apps/web/package.json`/`pnpm-lock.yaml` are included only if `pnpm install` touched them when resolving the test run above — `git status` first; if unchanged, drop them from the `add`.)

---

### Task 4: Full gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full build/lint/typecheck/test**

Run: `pnpm turbo run build lint typecheck test --force`
Expected: all tasks succeed (28/28, matching the project's current task count).

- [ ] **Step 2: Confirm `jszip` is never eagerly imported**

Run: `grep -rn "from \"jszip\"\|require(\"jszip\")" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "\.test\."`
Expected: no output — the only reference is the dynamic `import("jszip")` inside `exportZip.ts`, which `grep -rn "import(\"jszip\")"` should find exactly once.

- [ ] **Step 3: Run every touched e2e spec**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts e2e/pages.spec.ts`
Expected: PASS.

- [ ] **Step 4: Run the full e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS (all specs).

- [ ] **Step 5: Confirm a clean tree**

Run: `git status`
Expected: clean (everything from Tasks 1–3 committed).
