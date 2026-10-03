# Multi-Page PDF (All Pages as One PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When "Export all pages" is checked in the Export dialog and the format is PDF, download one combined multi-page PDF (`export.pdf`), one PDF page per scene page, each sized to its own content, instead of a zip of separate PDFs. PNG/SVG plus "Export all pages" stays exactly as shipped in batch export (`87a6770`): a zip. This is the next step of the export/sharing roadmap after export quality-of-life (`5eca279`), PDF export (`8e363c2`) and batch/zip export (`87a6770`). The batch-export plan explicitly scoped "combining pages into one multi-page PDF" out; this plan adds it.

**Architecture:**

- `apps/web/src/driver/exportPDF.ts` already has two tiers: `svgToPDF(svg)` draws one raw SVG string onto a one-page PDF, and `exportToPDF(elements, opts, canvasBg, loadFile = getFile)` is a thin wrapper that renders elements to an SVG string via `renderExportSVG` and then calls `svgToPDF`. This plan copies that shape for several pages:
  - New `svgsToPDF(svgs: readonly string[]): Promise<Blob>`. It parses every SVG with the existing `prepareSVGForPDF`. It then loads `jspdf` and `svg2pdf.js` once, with the same lazy `Promise.all([import("jspdf"), import("svg2pdf.js")])` that `svgToPDF` uses. The `jsPDF` document is built from the first SVG's size, exactly as `svgToPDF` builds it. Every later SVG gets its own `pdf.addPage([width, height], width > height ? "landscape" : "portrait")` before it is drawn. Each page is drawn with `svg2pdf(root, pdf, { x: 0, y: 0, width, height })`. The function returns `pdf.output("blob")`.
  - New `buildCombinedPDF(pages, opts, canvasBg, loadFile = getFile): Promise<Blob>`, a thin wrapper. It renders each page's `scene.getElements()` to an SVG string via `renderExportSVG`, in page order, then returns `svgsToPDF(svgs)`. Its relationship to `svgsToPDF` is the same as `exportToPDF`'s relationship to `svgToPDF`.
- `apps/web/src/components/Dialogs.tsx`: `exportAllPages` branches on format. If `opts.format === "pdf"`, it calls `download(await buildCombinedPDF(pages, opts, canvasBg), "export.pdf")`. Otherwise it runs the existing `buildExportZip` line, unchanged.
- **No UI change.** This is a pure behavior branch on the existing "Export all pages" checkbox combined with the existing Format toggle. `packages/ui` is not touched.

**Tech Stack:** TypeScript, React 19, Vitest 2 (jsdom), Playwright e2e (Chromium), pnpm + turbo monorepo, Next 16 (Turbopack), `jspdf@4.2.1` + `svg2pdf.js@2.8.1` (already dependencies, already lazy-loaded). **No new dependencies.**

**Spec:** inline in this plan, design approved in chat. Three decisions were locked by the human and must not be reopened:

1. PDF plus "Export all pages" **always** produces one combined PDF. There is no second toggle and no choice between a zip of PDFs and one PDF.
2. Each PDF page keeps its own content-sized dimensions. There is no uniform page size and no letterboxing.
3. The combined PDF's filename is the literal `"export.pdf"`, mirroring the zip path's literal `"export.zip"`.

There is no separate spec document, following the precedent of the export-quality-of-life, PDF-export and batch-export plans.

## Researched facts (verified 2026-10-03 against `main@87a6770`, not from memory)

1. **`addPage`'s signature is `(format, orientation)`, in that order.** The installed version is `jspdf@4.2.1` (`apps/web/package.json` line 24 has `"jspdf": "4.2.1"`). `node_modules/.pnpm/jspdf@4.2.1/node_modules/jspdf/types/index.d.ts:759-762` declares:
   ```ts
   addPage(
     format?: string | number[],
     orientation?: "p" | "portrait" | "l" | "landscape"
   ): jsPDF;
   ```
   The implementation (`dist/jspdf.es.js:3114`, `var _addPage = function _addPage(parmFormat, parmOrientation)`, called from `API.addPage` at line 3628 via `_addPage.apply(this, arguments)`) takes the same order. So `pdf.addPage([width, height], width > height ? "landscape" : "portrait")` is correct as written. The `[number, number]` tuple fits `number[]`, and the ternary yields the literal union `"landscape" | "portrait"`, which typechecks.
2. **Orientation is sticky across pages, so every `addPage` call must pass it explicitly.** `_addPage` starts with `orientation = parmOrientation || orientation`, meaning that leaving the argument out reuses the **previous** page's orientation. It then runs the same swap as the constructor: under `"l"`, `[w, h]` becomes `[h, w]` when `h > w`, and under `"p"` it swaps when `w > h`. If a portrait page followed a landscape first page and the orientation were omitted, it would come out rotated (its MediaBox width and height swapped). Unit test (a) in Task 1 deliberately pairs a landscape SVG with a portrait one to catch this.
3. **`addPage` makes the new page current.** `_addPage` → `beginPage(format)` → `_setPage(page)` plus `setOutputDestination(pages[currentPage])`. A following `svg2pdf(root, pdf, …)` therefore draws onto the new page, and no `setPage` call is needed.
4. **Each page gets its own MediaBox.** `beginPage` stores `mediaBox: { bottomLeftX: 0, bottomLeftY: 0, topRightX: format[0], topRightY: format[1] }` per page. The existing e2e helper's `toHaveLength(1)` on a single-page export confirms that jsPDF writes exactly one `/MediaBox` per page (the `/Pages` root carries none). Page dictionaries are never stream-compressed, so a regex over the raw bytes sees every page's box. The existing unit tests already depend on this.
5. **jsPDF clamps each side of a page to 14400 user units** (`_addPage` emits `console.warn` and calls `Math.min(14400, …)`). Single-page `svgToPDF` already has this limit, because the constructor goes through the same path. This plan does not change it and does not test it.
6. **`svgToPDF` is the only PDF function with unit tests; `exportToPDF` has none.** Element → SVG → PDF composition is covered only by `e2e/export.spec.ts`. That is why `buildCombinedPDF` gets no unit test (see Global Constraints).
7. **`Dialogs.tsx` does not import from `../driver/exportPDF` yet.** The batch-export refactor removed that import when `exportImage` moved to `renderPageBlob`. The current relative imports are `copyImageToClipboard`, `exportPNG`, `exportRender`, `exportTarget`, `exportZip`, `pages`. By path, `../driver/exportPDF` sorts between `copyImageToClipboard` and `exportPNG` (`exportPD…` < `exportPN…`). `exportAllPages` currently reads exactly:
   ```ts
   async function exportAllPages(
     pages: readonly PageRecord[],
     opts: ExportOptions,
     canvasBg: string,
   ): Promise<void> {
     download(await buildExportZip(pages, opts, canvasBg), "export.zip")
   }
   ```
8. **Multi-page e2e setup already has a precedent in `export.spec.ts`.** The tests "page picker exports a non-active page's content" and "export all pages downloads a zip with one entry per page" call `page.locator('[data-testid="page-add"]').click()` and then draw on the new, now-active page. The pages are named `Page 1` and `Page 2`. In those tests, a 60×60 rect exports at 100×100 and a 300×200 rect at 340×240 (20px padding on each side). The page order in the zip/PDF is the `pages` array order (page 1 first).
9. **The existing e2e `exportPDF` helper cannot be reused for several pages.** It contains `expect(boxes).toHaveLength(1) // one page` and returns only `boxes[0]`'s size.
10. **`noUncheckedIndexedAccess` is on** (`tsconfig` sets it to `true`). That is why the existing test uses `svg2pdf.mock.calls[0]!`. The new code destructures `const [first, ...rest] = prepared` and guards `first`. That gives an empty input a defined error instead of an `undefined` crash.

## Global Constraints

- **No changes to `packages/ui` code or tests.** Do not touch `ExportDialog.tsx` or `ExportDialog.test.tsx`. The checkbox's rendering logic and test coverage are out of scope.
- **Exception: the `export.allPages` locale string itself is in scope**, because it lives in `apps/web/src/locales/{en,ko}/common.json` (not `packages/ui`) and is now factually wrong for PDF. Task 2 drops the format-specific suffix from both locales: `"Export all pages (.zip)"` → `"Export all pages"`, and the Korean equivalent `"모든 페이지 내보내기 (.zip)"` → `"모든 페이지 내보내기"`. No test asserts the literal string (component tests mock `t()` to return the key), so this is a pure content fix with no test impact. Do not make the label dynamic per format — that would require `ExportDialog.tsx` to accept a format-aware label, which is a `packages/ui` change and out of scope.
- **No new `ExportOptions` fields.** The branch reads only the existing `opts.format` and `opts.allPages`.
- **`buildCombinedPDF` gets no unit test.** This is a deliberate parity choice: `exportToPDF`, its single-page twin, has none either. Only the raw-SVG layer (`svgToPDF`, now also `svgsToPDF`) is unit-tested, and element → SVG → PDF composition is covered by e2e. Reviewers: this is not a gap.
- **The combined PDF's filename is always the literal `"export.pdf"`.** It is not derived from any page name.
- **Each PDF page keeps its own content-sized dimensions** (content bbox plus the existing 20px padding, 1 SVG unit = 1 pt). Never force a uniform size, scale, or letterbox.
- **PNG/SVG plus "Export all pages" is completely unchanged.** It still calls `buildExportZip(pages, opts, canvasBg)` and downloads `"export.zip"`. `exportZip.ts` and `exportRender.ts` are not modified. `buildExportZip` never receives `format: "pdf"` from the dialog any more, but its PDF branch (via `renderPageBlob`) stays as is. Do not delete it.
- **`svgToPDF` and `exportToPDF` are not modified.** `svgsToPDF` is a new sibling. Do not refactor `svgToPDF` to delegate to it; the existing single-page path keeps its own tests and behavior byte-for-byte.
- **`jspdf`/`svg2pdf.js` stay lazy.** Use only `await Promise.all([import("jspdf"), import("svg2pdf.js")])` inside `svgsToPDF`. Never add a top-level `from "jspdf"`/`from "svg2pdf.js"` import.
- **Every `addPage` call passes an explicit orientation** (Researched fact 2).
- **No new error UI.** A rendering failure rejects silently (console error), like the existing `void exportAllPages(...)` call in `onExport`, which is unchanged.
- TDD: every behavior gets a failing test first. Run the exact commands given and confirm the stated failure before you implement.
- Commit after each task with the exact subject given. The co-author trailer is written below as the literal placeholder `Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>`. **This project's convention is that each commit credits whichever model actually wrote it: the implementer substitutes its own model name here, not a fixed value.**
- Test commands:
  - `pnpm --filter @excalidraw-clone/web exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Before any Playwright run, make sure nothing else is listening on port 3000 (`ss -ltnp | grep :3000`). The config has `reuseExistingServer: true` and would silently test another checkout's server.

  Full gate: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`, or `pnpm turbo run build lint typecheck test --force` if lint output looks stale or cites paths from another worktree.

- Lint is `typescript-eslint` `recommendedTypeChecked` plus `import-x`. Avoid floating promises (use `void`), avoid `async` functions without `await` (return `Promise.resolve()` from fakes instead), use `import type` for type-only imports, and keep relative imports in each file alphabetical by path.

## Review Focus

These are the most likely failure modes, most likely first. Each one is pinned by named tests:

1. **A later page comes out rotated** (MediaBox width and height swapped), because `addPage` was called without an orientation and inherited the first page's (Researched fact 2), or because the orientation ternary was inverted.
   - Pinned by Task 1: `svgsToPDF` "gives every page its own size, landscape and portrait mixed", which asserts exact per-page MediaBoxes for a landscape-then-portrait pair.
2. **Every page is forced to the first page's size**, for example by `addPage()` with no format, which falls back to the document's format.
   - Pinned by the same Task 1 test (two distinct MediaBoxes). The Task 2 e2e test "export all pages as PDF downloads one multi-page export.pdf" asserts two pages with different, content-matching sizes.
3. **Pages are drawn onto the wrong page, or with the wrong root/size.** For example, all SVGs land on page 1, or the first root is reused.
   - Pinned by Task 1: "draws each SVG once, onto its own page, at full page size", which checks every `svg2pdf` call's root (by its `width` attribute) and options.
4. **PDF plus all-pages still produces a zip, or PNG/SVG plus all-pages stops producing one.**
   - Pinned by Task 2: the new e2e test asserts `export.pdf`. The existing "export all pages downloads a zip with one entry per page" (SVG) and "…disambiguates pages that share a name" (PNG) tests must still pass unchanged.
5. **`jspdf`/`svg2pdf.js` get statically imported** and bloat the initial bundle.
   - Pinned by Task 3 Step 2 (grep).

---

### Task 1: `svgsToPDF` + `buildCombinedPDF` in `exportPDF.ts`

**Files:**

- Modify: `apps/web/src/driver/exportPDF.ts`
- Test: `apps/web/test/export-pdf.test.ts`

**Interfaces:**

- Consumes: `prepareSVGForPDF(svg)` (existing, same file); `renderExportSVG(elements, opts, canvasBg, loadFile)` and `type FileLoader` from `./exportSVG` (existing, already imported); `getFile` from `@excalidraw-clone/persistence` (existing, already imported); `type PageRecord` from `./pages` (existing).
- Produces: `svgsToPDF(svgs: readonly string[]): Promise<Blob>` and `buildCombinedPDF(pages: readonly Pick<PageRecord, "name" | "scene">[], opts: Pick<ExportOptions, "background">, canvasBg: string, loadFile?: FileLoader): Promise<Blob>`. Task 2 (`Dialogs.tsx`) consumes `buildCombinedPDF`.

- [ ] **Step 1: Write the failing tests for `svgsToPDF`**

In `apps/web/test/export-pdf.test.ts`, change the import line from:

```ts
import { prepareSVGForPDF, svgToPDF } from "../src/driver/exportPDF"
```

to:

```ts
import { prepareSVGForPDF, svgsToPDF, svgToPDF } from "../src/driver/exportPDF"
```

Then append a new describe block at the end of the file. It reuses the file's existing hoisted `svg2pdf` mock, `svgOf`, `pdfText` and the `beforeEach` that clears the mock:

```ts
describe("svgsToPDF", () => {
  it("gives every page its own size, landscape and portrait mixed", async () => {
    const blob = await svgsToPDF([svgOf(440, 320), svgOf(100, 300)])
    expect(blob.type).toBe("application/pdf")
    const text = await pdfText(blob)
    expect(text.startsWith("%PDF-")).toBe(true)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2)
    const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ])
    // In page order; the second page must NOT inherit the first's landscape
    // orientation (which would swap it to 300×100).
    expect(boxes).toEqual([
      [440, 320],
      [100, 300],
    ])
  })

  it("a single SVG still makes exactly one page", async () => {
    const text = await pdfText(await svgsToPDF([svgOf(140, 90)]))
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
    expect(text).toMatch(/\/MediaBox \[0 0 140\.? 90\.?\]/)
  })

  it("draws each SVG once, onto its own page, at full page size", async () => {
    await svgsToPDF([svgOf(440, 320), svgOf(100, 300), svgOf(250, 250)])
    expect(svg2pdf).toHaveBeenCalledTimes(3)
    const calls = svg2pdf.mock.calls
    expect(calls.map(([el]) => [el.localName, el.getAttribute("width")])).toEqual([
      ["svg", "440"],
      ["svg", "100"],
      ["svg", "250"],
    ])
    expect(calls.map(([, , opts]) => opts)).toEqual([
      { x: 0, y: 0, width: 440, height: 320 },
      { x: 0, y: 0, width: 100, height: 300 },
      { x: 0, y: 0, width: 250, height: 250 },
    ])
    // One shared document, not one per page.
    expect(new Set(calls.map(([, pdf]) => pdf)).size).toBe(1)
  })

  it("rejects an empty list", async () => {
    await expect(svgsToPDF([])).rejects.toThrow(/no pages/)
  })

  it("rejects when svg2pdf rejects on a later page", async () => {
    svg2pdf.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"))
    await expect(svgsToPDF([svgOf(10, 10), svgOf(20, 20)])).rejects.toThrow("boom")
  })
})
```

Note on test (a)'s MediaBox regex: the existing single-page tests allow an optional trailing `.` (`440\.?`), because jsPDF may print `440.` for some values. `[\d.]+` captures that too, and `Number("440.")` is `440`, so the exact `toEqual` holds either way.

Note on `mockResolvedValueOnce(undefined)`: the mock's declared return type is `Promise<unknown>`, so `undefined` typechecks. The real implementation ignores `svg2pdf`'s resolved value.

- [ ] **Step 2: Run them, confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-pdf.test.ts`
Expected: FAIL. All 5 new `svgsToPDF` tests fail with `TypeError: svgsToPDF is not a function` (Vitest does not typecheck, so the missing export imports as `undefined`). The 8 existing `prepareSVGForPDF`/`svgToPDF` tests still pass.

- [ ] **Step 3: Implement `svgsToPDF` and `buildCombinedPDF`**

In `apps/web/src/driver/exportPDF.ts`, change the import block from:

```ts
"use client"
import { getFile } from "@excalidraw-clone/persistence"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderExportSVG, type FileLoader } from "./exportSVG"
```

to:

```ts
"use client"
import { getFile } from "@excalidraw-clone/persistence"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderExportSVG, type FileLoader } from "./exportSVG"
import type { PageRecord } from "./pages"
```

Then insert the following **between** `svgToPDF`'s closing brace and the `/** Render exactly \`elements\` to a one-page PDF …`doc comment of`exportToPDF`:

```ts
/** Draw several export SVGs into one PDF, one page each, every page exactly
 *  its own SVG's size (1 SVG unit = 1 pt). The multi-page twin of svgToPDF.
 *  jsPDF and svg2pdf.js are loaded on first use. Rejects on an empty list. */
export async function svgsToPDF(svgs: readonly string[]): Promise<Blob> {
  const [first, ...rest] = svgs.map(prepareSVGForPDF)
  if (!first) throw new Error("svgsToPDF: no pages to export")
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")])
  // jsPDF swaps [w, h] to match `orientation` (default portrait), so a wide
  // page must be declared landscape or it comes out rotated.
  const pdf = new jsPDF({
    orientation: first.width > first.height ? "landscape" : "portrait",
    unit: "pt",
    format: [first.width, first.height],
    compress: true,
    putOnlyUsedFonts: true,
  })
  await svg2pdf(first.root, pdf, { x: 0, y: 0, width: first.width, height: first.height })
  for (const { root, width, height } of rest) {
    // addPage's orientation is sticky (omitted = previous page's), so always
    // pass it, or a tall page after a wide one comes out rotated. The new page
    // becomes current, so svg2pdf draws onto it.
    pdf.addPage([width, height], width > height ? "landscape" : "portrait")
    await svg2pdf(root, pdf, { x: 0, y: 0, width, height })
  }
  return pdf.output("blob")
}
```

Then append at the very end of the file, after `exportToPDF`:

```ts
/** Render every page, in order, into one multi-page PDF, each page sized
 *  like its own single-page PDF export (content bounding box plus padding).
 *  Always the whole page: selection is page-local and never applies here. */
export async function buildCombinedPDF(
  pages: readonly Pick<PageRecord, "name" | "scene">[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
): Promise<Blob> {
  const svgs: string[] = []
  for (const page of pages) {
    svgs.push(await renderExportSVG(page.scene.getElements(), opts, canvasBg, loadFile))
  }
  return svgsToPDF(svgs)
}
```

Per Global Constraints, `buildCombinedPDF` gets no unit test, for parity with `exportToPDF`. Task 2's e2e test covers it.

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-pdf.test.ts`
Expected: PASS (13 tests: 8 existing + 5 new).

- [ ] **Step 5: Typecheck and lint the web app**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS. If `pdf.addPage(...)`'s orientation argument fails to typecheck as `string`, `width > height ? "landscape" : "portrait"` was split into a `let`/`const` without a literal type. Keep it inline as written.

Run: `pnpm --filter @excalidraw-clone/web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/exportPDF.ts apps/web/test/export-pdf.test.ts
git commit -m "feat(web): combine several export SVGs into one multi-page, per-page-sized PDF" -m "Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 2: Wire `Dialogs.tsx`; e2e test

**Files:**

- Modify: `apps/web/src/components/Dialogs.tsx`
- Modify: `apps/web/e2e/export.spec.ts`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json` (label text only, Step 4b)

**Interfaces:**

- Consumes: `buildCombinedPDF(pages, opts, canvasBg)` from `../driver/exportPDF` (Task 1); `buildExportZip` (existing, unchanged); `download(blob, filename)` from `@excalidraw-clone/persistence` (existing, already imported).
- Produces: nothing for later tasks. This is the final wiring task before the full gate.

**Why this task's RED is e2e-only:** `exportAllPages` is a module-private function of a client component with no unit tests, the same situation as batch-export's Task 3. Before this task, checking "Export all pages" with PDF selected downloads `export.zip` (the zip path, containing one PDF per page). The new test asserts `download.suggestedFilename()` is `"export.pdf"`, so it is genuinely RED.

**e2e helper choice:** the existing `exportPDF` helper hard-asserts exactly one page (Researched fact 9). Options considered:

- Duplicating it as an `exportMultiPagePDF` would repeat the download, read and `%PDF-` boilerplate.
- Adding an expected-page-count parameter would make its single-`width`/`height` return shape wrong for more than one page.

The smallest clean change is to **extract only the MediaBox parsing** into a new `pdfMediaBoxes(bytes)` helper that returns every page's `{ width, height }`. `exportPDF` keeps its `toHaveLength(1)` assertion and its return shape, so its two callers are untouched. The new test does its download inline, the way the two existing all-pages zip tests already do.

- [ ] **Step 1: Extract `pdfMediaBoxes` (behavior-preserving)**

In `apps/web/e2e/export.spec.ts`, change:

```ts
/** Click Export and read the downloaded PDF's name and its single page's
 *  MediaBox size (page dictionaries are never compressed). */
const exportPDF = async (page: Page): Promise<ExportedPDF> => {
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  const boxes = [
    ...bytes
      .toString("latin1")
      .matchAll(/\/MediaBox \[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g),
  ]
  expect(boxes).toHaveLength(1) // one page
  const [x0, y0, x1, y1] = boxes[0]!.slice(1).map(Number) as [number, number, number, number]
  return { filename: download.suggestedFilename(), width: x1 - x0, height: y1 - y0, bytes }
}
```

to:

```ts
/** Every page's MediaBox size, in page order (page dictionaries are never
 *  compressed, so the raw bytes can be scanned). */
const pdfMediaBoxes = (bytes: Buffer): { width: number; height: number }[] =>
  [
    ...bytes
      .toString("latin1")
      .matchAll(/\/MediaBox \[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g),
  ].map((m) => {
    const [x0, y0, x1, y1] = m.slice(1).map(Number) as [number, number, number, number]
    return { width: x1 - x0, height: y1 - y0 }
  })

/** Click Export and read the downloaded PDF's name and its single page's size. */
const exportPDF = async (page: Page): Promise<ExportedPDF> => {
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  const boxes = pdfMediaBoxes(bytes)
  expect(boxes).toHaveLength(1) // one page
  return { filename: download.suggestedFilename(), ...boxes[0]!, bytes }
}
```

- [ ] **Step 2: Write the failing e2e test**

Append to the end of `apps/web/e2e/export.spec.ts`:

```ts
test("export all pages as PDF downloads one multi-page export.pdf", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1: 60×60

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2: 300×200
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  await page.locator('[data-testid="export-all-pages"]').check()

  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("export.pdf")
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")

  // One PDF page per scene page, in page order, each sized to its own
  // content (bbox + 20px padding per side), not a uniform page size.
  const boxes = pdfMediaBoxes(bytes)
  expect(boxes).toHaveLength(2)
  expectNear(boxes[0]!.width, 100)
  expectNear(boxes[0]!.height, 100)
  expectNear(boxes[1]!.width, 340)
  expectNear(boxes[1]!.height, 240)
  expect(boxes[0]!.width).not.toBe(boxes[1]!.width)
  // Still vector output.
  expect(bytes.toString("latin1")).not.toContain("/Subtype /Image")
})
```

- [ ] **Step 3: Run the e2e tests, confirm the new one fails and the refactor didn't regress**

Run: `ss -ltnp | grep :3000` (expect no output), then:
`pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected:

- The new test FAILs on `expect(download.suggestedFilename()).toBe("export.pdf")`, receiving `"export.zip"`.
- Every other test PASSes, including the two existing PDF tests that go through the refactored `exportPDF`/`pdfMediaBoxes` helper.

- [ ] **Step 4: Branch `exportAllPages` on PDF**

In `apps/web/src/components/Dialogs.tsx`, change:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { exportToPNG } from "../driver/exportPNG"
```

to:

```ts
import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
import { buildCombinedPDF } from "../driver/exportPDF"
import { exportToPNG } from "../driver/exportPNG"
```

Then change `exportAllPages` from:

```ts
async function exportAllPages(
  pages: readonly PageRecord[],
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  download(await buildExportZip(pages, opts, canvasBg), "export.zip")
}
```

to:

```ts
async function exportAllPages(
  pages: readonly PageRecord[],
  opts: ExportOptions,
  canvasBg: string,
): Promise<void> {
  // PDF has real pages, so all pages go into one PDF; images go into a zip.
  if (opts.format === "pdf") {
    download(await buildCombinedPDF(pages, opts, canvasBg), "export.pdf")
    return
  }
  download(await buildExportZip(pages, opts, canvasBg), "export.zip")
}
```

Leave `onExport` unchanged; it already calls `void exportAllPages(pages, opts, canvasBg)` when `opts.allPages` is set.

- [ ] **Step 4b: Fix the now-inaccurate checkbox label in both locales**

The label still says "(.zip)" even though PDF now produces a `.pdf`. This is a locale-content fix only — no component logic changes, so it's in scope despite the "no `packages/ui`" constraint (these files are in `apps/web`).

In `apps/web/src/locales/en/common.json`, change:

```json
"allPages": "Export all pages (.zip)",
```

to:

```json
"allPages": "Export all pages",
```

In `apps/web/src/locales/ko/common.json`, change:

```json
"allPages": "모든 페이지 내보내기 (.zip)",
```

to:

```json
"allPages": "모든 페이지 내보내기",
```

No test covers the literal string (verify: `grep -n "Export all pages" packages/ui/test/ExportDialog.test.tsx` should find nothing, since the test mocks `t()` to echo the key). This step has no RED/GREEN cycle — it's a content-only fix.

- [ ] **Step 5: Typecheck, lint and run the web unit tests**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web lint`
Expected: PASS (import order: `copyImageToClipboard` < `exportPDF` < `exportPNG`).

Run: `pnpm --filter @excalidraw-clone/web exec vitest run`
Expected: PASS (no regressions).

- [ ] **Step 6: Run the full export e2e spec, confirm everything passes**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: PASS (all tests). This includes the new one and the unchanged "export all pages downloads a zip with one entry per page" (SVG) and "export all pages disambiguates pages that share a name" (PNG), which prove the non-PDF path still zips.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/Dialogs.tsx apps/web/e2e/export.spec.ts apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "feat(web): export all pages as one multi-page PDF when the format is PDF" -m "Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 3: Full gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full build/lint/typecheck/test**

Run: `pnpm turbo run build lint typecheck test --force`
Expected: all tasks succeed (28/28, matching the project's current task count).

- [ ] **Step 2: Confirm the PDF libraries are still lazy**

Run: `grep -rn 'from "jspdf"\|from "svg2pdf.js"' apps/web/src`
Expected: **no output**. The only references are the `import("…")` calls inside `svgToPDF` and `svgsToPDF`; `grep -rn 'import("jspdf")' apps/web/src` should find exactly two.

- [ ] **Step 3: Confirm `packages/ui` is untouched**

Run: `git diff --stat 87a6770 -- packages/ui`
Expected: no output.

- [ ] **Step 4: Run the related e2e specs**

Run: `ss -ltnp | grep :3000` (expect no output), then:
`pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts e2e/pages.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS (all specs).

- [ ] **Step 6: Confirm a clean tree**

Run: `git status`
Expected: clean (everything from Tasks 1–2 committed).
