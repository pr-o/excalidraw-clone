# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **PDF** as a third format in the Export dialog, next to PNG and SVG. The PDF is a single vector page sized to the content's bounding box plus the same 20px padding the PNG/SVG exports use (not A4/Letter). It works with every existing export option: page picker, Selection / Whole page scope, background (Light / Dark / Transparent) and page-named filenames (`<page>.pdf`, `<page>-selection.pdf`). The Scale row is hidden while PDF is chosen. Copy to clipboard stays PNG-only.

This is part 2 of the export/sharing roadmap. Part 1 (export quality-of-life: selection export, page picker, PNG clipboard copy) is on local `main` at `5eca279`. Part 3 (share links) is deferred.

**Architecture:**

- New driver `apps/web/src/driver/exportPDF.ts`, next to `exportPNG.ts`/`exportSVG.ts`. It has three exports:
  - `prepareSVGForPDF(svg)`: a pure DOM step. It parses the SVG string, reads the page size from the root's own `width`/`height` attributes, and patches text so svg2pdf top-aligns it (see "Researched facts" below).
  - `svgToPDF(svg)`: lazily `import()`s `jspdf` and `svg2pdf.js`, creates a `jsPDF` document whose single page is exactly `width × height` pt, awaits `svg2pdf(root, pdf, { x: 0, y: 0, width, height })`, and returns `pdf.output("blob")`.
  - `exportToPDF(elements, opts, canvasBg, loadFile = getFile)`: `svgToPDF(await renderExportSVG(...))`.
- **Sizing reuses the SVG path; there is no new sizing code.** `renderToSVG` (`packages/renderer/src/svg.ts:54–66`) already computes the live elements' bbox with `padding ?? 20` and writes it to the root as `width`, `height` and `viewBox`. `exportPNG.ts` uses the same min/max-of-`x/y/width/height` bbox with `PADDING = 20`. The PDF page takes the root's `width`/`height`, so it equals the SVG export's size and the PNG export's pixel size at 1×, by construction. One SVG user unit maps to one PDF point (`unit: "pt"`), so the PDF's `MediaBox` numbers equal the PNG's 1× pixel numbers. The e2e test asserts exactly that.
- `packages/ui/src/ExportDialog.tsx`: `ExportOptions.format` widens to `"png" | "svg" | "pdf"`. A third toggle `{ value: "pdf", label: "PDF", testId: "format-pdf" }` is added. Labels stay hardcoded like `"PNG"`/`"SVG"`, so there are no i18n changes. The Scale `<Row>` renders only when `format !== "pdf"`. The `scale` state is kept, not reset, so switching back to PNG shows the earlier choice.
- `apps/web/src/driver/exportTarget.ts`: `exportFilename`'s `format` parameter becomes `ExportOptions["format"]`, so it can never drift from the dialog type again.
- `apps/web/src/components/Dialogs.tsx`: `exportImage()` gains a third branch, `if (opts.format === "pdf") { download(await exportToPDF(...), filename); return }`. `onCopy` is unchanged: it always renders PNG. There is no PDF clipboard target, because the async Clipboard API only guarantees `image/png`, `text/plain` and `text/html`.

**Tech Stack:** TypeScript, React 19, Vitest 2 + @testing-library/react (jsdom), Playwright e2e (Chromium), pnpm + turbo monorepo, Next 16 (Turbopack). **New runtime dependencies (the first in the export area): `jspdf@4.2.1` and `svg2pdf.js@2.8.1`, pinned exactly.**

**Spec:** inline in this plan. The design was approved in chat; see Goal/Architecture. There is no separate spec document.

## Researched facts (verified 2026-10-02, not from memory)

All of these were verified on 2026-10-02. Each was either run in a scratch worktree of `main@5eca279` with the deps installed, or read from the published package files. The whole plan below was executed there end to end: unit tests, `pnpm turbo run build lint typecheck test` (28/28) and `e2e/export.spec.ts` (7/7) all passed.

1. **Versions.** npm `latest` is `jspdf@4.2.1` (published 2026-03-17) and `svg2pdf.js@2.8.1` (2026-08-31). svg2pdf.js's `peerDependencies` are `jspdf: "^4.0.0 || ^3.0.0 || ^2.0.0"`, so the pair is compatible. `pnpm add … --save-exact` writes `"jspdf": "4.2.1"` and `"svg2pdf.js": "2.8.1"`. jspdf's optionalDependencies (`html2canvas`, `dompurify`, `canvg`, `core-js`) are installed by pnpm and only loaded by jspdf APIs this plan never calls. `next build` compiles cleanly, and jspdf/svg2pdf land in separate lazy chunks.
2. **`jsPDF` constructor** (`jspdf/types/index.d.ts:720`): `new jsPDF(options?: jsPDFOptions)` with `{ orientation?: "p"|"portrait"|"l"|"landscape"; unit?: "pt"|"px"|…; format?: string | number[]; compress?: boolean; putOnlyUsedFonts?: boolean; … }`. A custom page is `format: [width, height]`.
   - **Gotcha, verified in Chromium:** jsPDF swaps `[w, h]` to match `orientation`, which defaults to portrait. `new jsPDF({ unit: "pt", format: [440, 340] })` produces a **340 × 440** page. You must pass `orientation: width > height ? "landscape" : "portrait"`. Task 1's landscape test pins this; a mutation to always-portrait fails it.
   - `unit: "pt"` gives `MediaBox [0 0 440. 340.]` for `[440, 340]`, which is 1:1 with SVG units, as the svg2pdf README recommends. `unit: "px"` silently has scale factor 1.333 without the `px_scaling` hotfix, so it is avoided.
3. **`svg2pdf()` signature** (`svg2pdf.js/types.d.ts`): `svg2pdf(element: Element, pdf: jsPDF, options?: { x?; y?; width?; height?; loadExternalStyleSheets?; loadImages? }): Promise<jsPDF>`. It is **async**. The implementation is an `__awaiter` async function, so any error, even a bad argument, surfaces as a **rejected promise**, not a synchronous throw. `exportToPDF` is therefore `async`, and errors propagate through `exportImage`'s promise exactly like the PNG/SVG paths: `void exportImage(...)` in `Dialogs.tsx`, unchanged. A **detached** element from `DOMParser` works in Chromium; it does not need to be attached to `document`. `data:` image `href`s are embedded as image XObjects (`loadImages` defaults to `true`).
4. **svg2pdf ignores `dominant-baseline`.** It reads only `alignment-baseline`/`vertical-align`, and maps `text-top`/`top` to jsPDF's `top` baseline. `renderToSVG` top-aligns every text with `dominant-baseline="text-before-edge"`. Without a fix, every PDF text line is drawn one ascent too high. Verified in Chromium: a 20px text at y=10 renders with `Tm … 10.` unpatched and `Tm … 27.` with `alignment-baseline="text-top"`. `prepareSVGForPDF` adds that attribute to exactly those `<text>` nodes, in the PDF-only parsed DOM. `renderToSVG` is not touched.
5. **Fonts.** svg2pdf can only use jsPDF's 14 standard fonts unless TTFs are registered. Its alias table maps `cursive`→Times, `sans-serif`/`arial`→Helvetica and `monospace`→Courier. So the app's families render as:
   - Caveat (family 1, the default) → **Times-Roman**
   - Helvetica (family 2) → **Helvetica**
   - Cascadia (family 3) → **Courier**

   **Non-Latin text (e.g. Korean) is not representable in the standard fonts and comes out as mojibake** (`안녕` → `(ÅH±U)`), with no error. This is a **known limitation, explicitly out of scope** here: fixing it means shipping and registering a CJK TTF, which is multiple MB. Record it in the final report as a follow-up.

6. **jsdom / Vitest compatibility: the verdict is split.**
   - **jsPDF works under jsdom.** Construction, page geometry and `output("blob" | "arraybuffer")` producing `%PDF-1.3` all work. Page geometry is real-unit-testable.
   - **svg2pdf.js does not.** Its README says so ("requires a fully functional DOM implementation and does not work with JSDOM"), and I confirmed it. Any `<text>` throws `TypeError: textNode.getBBox is not a function`, plus `HTMLCanvasElement.getContext` "Not implemented". Text-free SVGs happen to work, which would give false confidence.
   - **svg2pdf.js cannot even be imported under Vitest.** The package has no `exports` map. Its `main` is a UMD bundle that, evaluated by Vitest, takes the browser-global branch and crashes at import time: `TypeError: Cannot read properties of undefined (reading 'jsPDF')` (`src/utils/fonts.ts:62`). Next/Turbopack uses the `browser`/`module` ES build and is fine (e2e verified).
   - **jsdom's `XMLSerializer` emits a duplicate `xmlns` attribute** for `renderToSVG`'s root: `<svg xmlns="…" xmlns="…">`. jsdom's own `DOMParser` then rejects that string with a `parsererror`. Chromium serializes it once (verified). So `exportToPDF(elements, …)` cannot be unit-tested end to end in jsdom, even with svg2pdf mocked.
   - **Consequence:** `exportPDF.ts` gets a **real unit test of everything except the drawing**: parsing, the page size taken from the SVG, the baseline patch, jsPDF page geometry and orientation, the call contract with svg2pdf, and rejection propagation. `vi.mock("svg2pdf.js")` stands in for svg2pdf. The mock also sidesteps the UMD import crash, because a `vi.mock` factory never loads the real module. The actual drawing (text as real PDF text, vector shapes, sizes matching PNG) is **e2e-only** (Task 3). This sits between the two precedents: `renderExportSVG` is fully unit-tested, and `exportToPNG` is e2e-only.
7. **Why lazy `import()` for both libraries.** jspdf + svg2pdf are roughly 780 KB minified across three chunks. Loading them only on the first PDF export keeps them out of the main bundle. It also means no unit test that transitively imports `Dialogs.tsx` ever evaluates svg2pdf's UMD build (see 6).

## Global Constraints

- **Exactly two new runtime dependencies**, both in `apps/web/package.json` `dependencies`, pinned exactly: `"jspdf": "4.2.1"`, `"svg2pdf.js": "2.8.1"`. Do not add them to `packages/ui` or any other package. No new dev dependencies: no PDF parser, `pdf-lib` or `pdfjs-dist`. The e2e test reads the PDF with `node:zlib` and regexes.
- **Do not change the sizing convention.** No A4/Letter, no margins, no new padding constant. The page size comes from `renderToSVG`'s root `width`/`height` (padding 20). `unit: "pt"`, single page.
- **Out of scope; do not touch:**
  - `packages/renderer/src/svg.ts` and `CanvasRenderer`. The baseline fix lives in the PDF driver's parsed DOM only.
  - `exportPNG.ts`, `exportSVG.ts` and `copyImageToClipboard.ts`.
  - i18n locale files. Format labels are hardcoded `"PNG"`/`"SVG"`/`"PDF"`.
  - The `embedScene` checkbox, which stays visible and is a no-op for SVG and PDF (pre-existing for SVG; leave it).
  - Font embedding / non-Latin glyphs (Researched fact 5).
  - Error UI for a failed download export (pre-existing for PNG/SVG: `void exportImage(...)`).
  - The menu label "Export image…".
- **Copy to clipboard stays PNG-only.** `ExportDialog.handleCopy` already forces `format: "png"`, and `Dialogs.onCopy` always calls `exportToPNG`. Neither changes; a new unit test pins it for PDF.
- **Scale row:** hidden iff `format === "pdf"`. The `scale` state is not reset. `currentOptions()` still emits `scale` (whatever is held), and `exportToPDF` ignores it.
- TDD: every behavior gets a failing test first. Run the exact commands given and confirm the stated failure before you implement.
- Commit after each task with the exact subject given. End every commit message with the co-author trailer from your session's attribution reminder, passed as a second `-m`.
- Test commands:
  - `pnpm --filter @excalidraw-clone/web exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Before any Playwright run, make sure nothing else is listening on port 3000. The config has `reuseExistingServer: true` locally and would silently test another checkout's server. Check with `ss -ltnp | grep :3000`.

  Full gate: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`. `build` is included because this is the first feature that adds bundled third-party code. If lint output looks stale or cites paths from another worktree, use `pnpm turbo run lint --force`.

- Lint is `typescript-eslint` `recommendedTypeChecked` plus `import-x`. Avoid floating promises (use `void`), avoid `async` functions without `await` (return `Promise.resolve()` from fakes instead), and use `import type` for type-only imports.

## Review Focus

These are the most likely failure modes, most likely first. Each one is pinned by named tests:

1. **The PDF page comes out rotated or swapped** (jsPDF's orientation swap, Researched fact 2). Wide content must give a wide page and tall content a tall page.
   - Pinned by Task 1: "produces a one-page PDF whose page is exactly the SVG size (landscape)", "keeps a tall page tall (portrait)". Task 3 e2e: "PDF export is one vector page sized like the PNG, for the page or the selection" (440 × 320, wide).
2. **The PDF is sized differently from the PNG/SVG export.** Examples: A4, a different padding, `px` units scaled by 4/3, or the deleted/selection subset ignored.
   - Pinned by Task 1: "reads the page size from the SVG's own width/height", "draws the parsed root at the origin, full page size". Task 3 e2e asserts the same 440 × 320 / 100 × 100 numbers as the existing PNG test, for the whole page and the selection.
3. **Text is shifted up by one ascent** (`dominant-baseline` ignored by svg2pdf, Researched fact 4), or text is rasterized or dropped.
   - Pinned by Task 1: "adds alignment-baseline=text-top to top-aligned text only". Task 3 e2e: "PDF export keeps text as real PDF text" (font resource present, `(hello pdf) Tj` in the inflated content stream).
4. **The Scale row is not hidden for PDF, or picking PDF loses the user's scale for PNG.**
   - Pinned by Task 2: "hides the Scale row for PDF and restores it, with the earlier choice, for PNG". Task 3 e2e asserts `scale-1` is absent after picking PDF.
5. **PDF chosen → the clipboard gets something other than a PNG**, or Copy breaks.
   - Pinned by Task 2: "still copies a PNG when PDF is chosen".
6. **Wrong filename extension or a missing `-selection` suffix.**
   - Pinned by Task 2's three new `exportFilename` cases, and Task 3 e2e (`Page 1.pdf`, `Page 1-selection.pdf`).
7. **svg2pdf failures are swallowed or turned into a bogus blob.** A rejection from svg2pdf must reject `svgToPDF`, and malformed or sizeless SVG must throw instead of producing an empty PDF.
   - Pinned by Task 1: "rejects when svg2pdf rejects", "throws on malformed SVG", "throws when the root has no positive size".
8. **The heavy libraries are pulled into the main bundle or into unrelated unit tests.**
   - Enforced by code shape: `exportPDF.ts` has **no** top-level import of `jspdf`/`svg2pdf.js`, only `await import(...)` inside `svgToPDF`.
   - Verified by Task 4 (`pnpm build` succeeds; the full `pnpm test` stays green). Reviewers: reject any static `import … from "jspdf"`/`"svg2pdf.js"`.

---

## File Structure

| File                                     | Action                                                    | Responsibility                                                     |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/package.json`                  | Modify (via `pnpm add`)                                   | Add `"jspdf": "4.2.1"`, `"svg2pdf.js": "2.8.1"` to `dependencies`. |
| `pnpm-lock.yaml`                         | Modify (via `pnpm add`, ~+209 lines)                      | Lock the two packages and their transitive/optional deps.          |
| `apps/web/src/driver/exportPDF.ts`       | Create                                                    | `PreparedSVG`, `prepareSVGForPDF`, `svgToPDF`, `exportToPDF`.      |
| `apps/web/test/export-pdf.test.ts`       | Create                                                    | Unit tests (svg2pdf mocked, real jsPDF).                           |
| `packages/ui/src/ExportDialog.tsx`       | Modify (line 5; lines 157–158; lines 162–168)             | Widen `format`; add PDF toggle; hide Scale row for PDF.            |
| `packages/ui/test/ExportDialog.test.tsx` | Modify (append after line 401)                            | New `describe("ExportDialog — PDF format")` with 3 tests.          |
| `apps/web/src/driver/exportTarget.ts`    | Modify (after line 1; line 58)                            | `exportFilename(…, format: ExportOptions["format"])`.              |
| `apps/web/test/export-target.test.ts`    | Modify (after line 147)                                   | 3 new `exportFilename` cases for `pdf`.                            |
| `apps/web/src/components/Dialogs.tsx`    | Modify (after line 11; after line 99)                     | Import `exportToPDF`; third `exportImage` branch.                  |
| `apps/web/e2e/export.spec.ts`            | Modify (line 2, line 6, before line 53, append after 191) | `exportPDF`/`pdfStreams` helpers; 2 new e2e tests.                 |

`apps/web/test/export-svg.test.ts` and `apps/web/e2e/theme.spec.ts` stay **as is**. Neither touches the format union, and both keep passing unchanged.

---

## Task 1: Dependencies and the PDF driver

**Files:**

- Modify: `apps/web/package.json`, `pnpm-lock.yaml` (via `pnpm add` only; never hand-edit)
- Create: `apps/web/src/driver/exportPDF.ts`
- Create: `apps/web/test/export-pdf.test.ts`

**Interfaces:**

- Consumes:
  - `renderExportSVG(elements: readonly ExcalidrawElement[], opts: Pick<ExportOptions, "background">, canvasBg: string, loadFile: FileLoader = getFile): Promise<string>` and `type FileLoader = (id: string) => Promise<{ dataURL: string } | undefined>` from `apps/web/src/driver/exportSVG.ts`. Its output root always has `width`/`height` = padded bbox (`Math.max(1, …)`), and every `<text>` carries `dominant-baseline="text-before-edge"` (`packages/renderer/src/svg.ts:64–66, 223`).
  - `getFile` from `@excalidraw-clone/persistence`.
  - `jsPDF` from `jspdf` (Researched fact 2).
  - `svg2pdf` from `svg2pdf.js` (Researched fact 3).
- Produces:

  ```ts
  export interface PreparedSVG {
    root: Element
    width: number
    height: number
  }
  export function prepareSVGForPDF(svg: string): PreparedSVG
  export function svgToPDF(svg: string): Promise<Blob>
  export function exportToPDF(
    elements: readonly ExcalidrawElement[],
    opts: Pick<ExportOptions, "background">,
    canvasBg: string,
    loadFile?: FileLoader,
  ): Promise<Blob>
  ```

  `opts` is a `Pick` that reads only `background`. That field existed before Task 2, so this task compiles against the current `ExportOptions`, and full `ExportOptions` values are accepted later.

- [ ] **Step 1: Add the pinned dependencies**

Run from the repo root:

```bash
pnpm --filter @excalidraw-clone/web add jspdf@4.2.1 svg2pdf.js@2.8.1 --save-exact
```

Expected: `Done in …`. `git diff apps/web/package.json` shows exactly two added lines in `dependencies`, in alphabetical position:

```diff
+    "jspdf": "4.2.1",
     "next": "^16.2.2",
     ...
+    "svg2pdf.js": "2.8.1",
     "zustand": "^5.0.0"
```

`git diff --stat pnpm-lock.yaml` shows roughly +209 lines. If pnpm writes `^4.2.1` (no `--save-exact`), fix the two lines by hand to the exact versions and re-run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/test/export-pdf.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prepareSVGForPDF, svgToPDF } from "../src/driver/exportPDF"

// svg2pdf.js needs a real layout engine (SVGElement.getBBox), which jsdom
// lacks, and its UMD "main" build cannot even be imported under Vitest. It is
// mocked here; the real drawing is covered by e2e/export.spec.ts. jsPDF itself
// runs fine under jsdom, so the page geometry below is real.
const svg2pdf = vi.hoisted(() =>
  vi.fn((_el: Element, pdf: unknown, _opts?: unknown) => Promise.resolve(pdf)),
)
vi.mock("svg2pdf.js", () => ({ svg2pdf }))

const svgOf = (w: number, h: number, body = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-20 -20 ${w} ${h}">${body}</svg>`

const pdfText = async (blob: Blob): Promise<string> =>
  new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()))

beforeEach(() => {
  svg2pdf.mockClear()
})

describe("prepareSVGForPDF", () => {
  it("reads the page size from the SVG's own width/height", () => {
    const { root, width, height } = prepareSVGForPDF(svgOf(440, 320))
    expect(root.localName).toBe("svg")
    expect(width).toBe(440)
    expect(height).toBe(320)
  })

  it("adds alignment-baseline=text-top to top-aligned text only", () => {
    const { root } = prepareSVGForPDF(
      svgOf(
        100,
        100,
        '<text dominant-baseline="text-before-edge"><tspan x="0" y="0">a</tspan></text><text><tspan>b</tspan></text>',
      ),
    )
    const [top, plain] = Array.from(root.getElementsByTagName("text"))
    expect(top?.getAttribute("alignment-baseline")).toBe("text-top")
    expect(plain?.hasAttribute("alignment-baseline")).toBe(false)
  })

  it("throws on malformed SVG", () => {
    expect(() => prepareSVGForPDF("<svg")).toThrow(/could not parse/)
  })

  it("throws when the root has no positive size", () => {
    expect(() => prepareSVGForPDF('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/no size/)
  })
})

describe("svgToPDF", () => {
  it("produces a one-page PDF whose page is exactly the SVG size (landscape)", async () => {
    const blob = await svgToPDF(svgOf(440, 320))
    expect(blob.type).toBe("application/pdf")
    const text = await pdfText(blob)
    expect(text.startsWith("%PDF-")).toBe(true)
    expect(text).toMatch(/\/MediaBox \[0 0 440\.? 320\.?\]/)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
  })

  it("keeps a tall page tall (portrait)", async () => {
    const text = await pdfText(await svgToPDF(svgOf(100, 300)))
    expect(text).toMatch(/\/MediaBox \[0 0 100\.? 300\.?\]/)
  })

  it("draws the parsed root at the origin, full page size", async () => {
    await svgToPDF(svgOf(140, 90))
    expect(svg2pdf).toHaveBeenCalledTimes(1)
    const [el, , opts] = svg2pdf.mock.calls[0]!
    expect(el.localName).toBe("svg")
    expect(opts).toEqual({ x: 0, y: 0, width: 140, height: 90 })
  })

  it("rejects when svg2pdf rejects", async () => {
    svg2pdf.mockRejectedValueOnce(new Error("boom"))
    await expect(svgToPDF(svgOf(10, 10))).rejects.toThrow("boom")
  })
})
```

Notes for the implementer:

- `exportToPDF` itself has no unit test, on purpose. jsdom serializes `renderToSVG`'s root with a duplicate `xmlns`, and jsdom's own `DOMParser` then rejects it (Researched fact 6). That composition is a one-liner and is covered by Task 3's e2e tests.
- Do **not** "fix" the test by aliasing `svg2pdf.js` to its ES build in `vitest.config.ts`. That only makes the real svg2pdf crash later on `getBBox`.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-pdf.test.ts`
Expected: FAIL. `Failed to resolve import "../src/driver/exportPDF"`, with no tests run.

- [ ] **Step 4: Implement `exportPDF.ts`**

Create `apps/web/src/driver/exportPDF.ts`:

```ts
"use client"
import { getFile } from "@excalidraw-clone/persistence"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { ExportOptions } from "@excalidraw-clone/ui"
import { renderExportSVG, type FileLoader } from "./exportSVG"

const SVG_NS = "http://www.w3.org/2000/svg"

/** A parsed export SVG, ready for svg2pdf. */
export interface PreparedSVG {
  root: Element
  /** The SVG's own width/height attributes: the content bbox plus padding,
   *  exactly as renderToSVG sized it. */
  width: number
  height: number
}

/** Parse renderExportSVG output and patch what svg2pdf cannot read.
 *
 *  renderToSVG top-aligns text with `dominant-baseline="text-before-edge"`,
 *  which svg2pdf ignores (it would draw every line one ascent too high); the
 *  equivalent `alignment-baseline="text-top"` is added for it. Throws on
 *  malformed input or a root without a positive width/height. */
export function prepareSVGForPDF(svg: string): PreparedSVG {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  if (root.namespaceURI !== SVG_NS || root.localName !== "svg") {
    throw new Error("exportToPDF: could not parse the export SVG")
  }
  const width = Number(root.getAttribute("width"))
  const height = Number(root.getAttribute("height"))
  if (!(width > 0) || !(height > 0)) {
    throw new Error("exportToPDF: the export SVG has no size")
  }
  for (const text of Array.from(root.getElementsByTagNameNS(SVG_NS, "text"))) {
    if (text.getAttribute("dominant-baseline") === "text-before-edge") {
      text.setAttribute("alignment-baseline", "text-top")
    }
  }
  return { root, width, height }
}

/** Draw an export SVG onto a single PDF page of exactly its own size
 *  (1 SVG unit = 1 pt). jsPDF and svg2pdf.js are loaded on first use. */
export async function svgToPDF(svg: string): Promise<Blob> {
  const { root, width, height } = prepareSVGForPDF(svg)
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")])
  // jsPDF swaps [w, h] to match `orientation` (default portrait), so a wide
  // page must be declared landscape or it comes out rotated.
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  })
  await svg2pdf(root, pdf, { x: 0, y: 0, width, height })
  return pdf.output("blob")
}

/** Render exactly `elements` to a one-page PDF sized like the PNG/SVG export
 *  (content bounding box plus the same 20px padding). Vector output: there is
 *  no scale. Text uses the PDF standard fonts (Helvetica/Times/Courier). */
export async function exportToPDF(
  elements: readonly ExcalidrawElement[],
  opts: Pick<ExportOptions, "background">,
  canvasBg: string,
  loadFile: FileLoader = getFile,
): Promise<Blob> {
  return svgToPDF(await renderExportSVG(elements, opts, canvasBg, loadFile))
}
```

Why each choice:

- **Root `width`/`height`**: Review Focus #2.
- **`orientation`**: Review Focus #1.
- **`unit: "pt"`**: Researched fact 2.
- **`compress: true`**: Flate-compresses the content streams only. Page dictionaries, `MediaBox` and font resources stay plain text, which the e2e test relies on.
- **`putOnlyUsedFonts: true`**: without it, jsPDF lists all 14 standard fonts in every file.
- **Lazy `import()`**: Researched fact 7 and Review Focus #8. Do not hoist these into static imports.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-pdf.test.ts`
Expected: PASS, `Tests 8 passed (8)`.

Optional mutation check (do not commit): change the `orientation:` line to `orientation: "portrait",` and re-run. Expected: exactly one failure, `svgToPDF > produces a one-page PDF whose page is exactly the SVG size (landscape)`. Revert.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors. `import("svg2pdf.js")` resolves its types from the package's `types.d.ts` under `moduleResolution: "Bundler"`; this was verified.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/driver/exportPDF.ts apps/web/test/export-pdf.test.ts
git commit -m "feat(web): add PDF export driver (jspdf + svg2pdf.js), page sized like PNG/SVG" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 2: Dialog offers PDF and hides Scale; filenames accept pdf

**Files:**

- Modify: `packages/ui/src/ExportDialog.tsx`: line 5 (`format` type), lines 156–159 (format toggle options), lines 162–168 (Scale row)
- Modify: `packages/ui/test/ExportDialog.test.tsx` (append after the final line 401)
- Modify: `apps/web/src/driver/exportTarget.ts`: add an import after line 1; line 58 (`format` parameter)
- Modify: `apps/web/test/export-target.test.ts` (insert after line 147)

These must land in one commit. Widening `ExportOptions["format"]` makes `Dialogs.tsx:94`'s `exportFilename(…, opts.format)` fail to typecheck until `exportFilename` accepts `"pdf"`.

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `ExportOptions.format: "png" | "svg" | "pdf"`.
  - `exportFilename(pageName: string, scope: ExportScope, format: ExportOptions["format"]): string`.
  - A new DOM contract, `data-testid="format-pdf"`, used by Task 3's e2e test.

**Interim behavior note:** between this task's commit and Task 3's, picking PDF in the running app downloads a **PNG** named `*.pdf`, because `exportImage` falls through to its PNG branch. That is expected. Task 3's e2e test starts RED because of it.

- [ ] **Step 1: Write the failing dialog tests**

Append to the end of `packages/ui/test/ExportDialog.test.tsx` (after line 401). It reuses the file's existing `t`, `ONE_PAGE`, `CopyFn` and `confirm` helpers from lines 5–13:

```tsx
describe("ExportDialog — PDF format", () => {
  it("offers PDF and exports format 'pdf'", async () => {
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
    const pdf = screen.getByTestId("format-pdf")
    expect(pdf).toHaveTextContent("PDF")
    await userEvent.click(pdf)
    expect(pdf).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ format: "pdf", pageId: "p1" }))
  })

  it("hides the Scale row for PDF and restores it, with the earlier choice, for PNG", async () => {
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
    await userEvent.click(screen.getByTestId("scale-2"))
    await userEvent.click(screen.getByTestId("format-pdf"))
    expect(screen.queryByText("export.scale")).toBeNull()
    expect(screen.queryByTestId("scale-2")).toBeNull()
    // Background still applies to PDF.
    expect(screen.getByTestId("bg-dark")).toBeInTheDocument()

    await userEvent.click(screen.getByTestId("format-png"))
    expect(screen.getByText("export.scale")).toBeInTheDocument()
    expect(screen.getByTestId("scale-2")).toHaveAttribute("aria-pressed", "true")
  })

  it("still copies a PNG when PDF is chosen", async () => {
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
      />,
    )
    await userEvent.click(screen.getByTestId("format-pdf"))
    await userEvent.click(screen.getByTestId("export-copy"))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ format: "png" }))
  })
})
```

- [ ] **Step 2: Write the failing filename cases**

In `apps/web/test/export-target.test.ts`, insert directly after line 147 (`["회의 노트", "page", "png", "회의 노트.png"],`), inside the `it.each([...] as const)` array:

```ts
    ["Notes", "page", "pdf", "Notes.pdf"],
    ["Notes", "selection", "pdf", "Notes-selection.pdf"],
    ["", "page", "pdf", "drawing.pdf"],
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: FAIL. 3 failures, all in "ExportDialog — PDF format", each `Unable to find an element by: [data-testid="format-pdf"]`. The 18 existing tests pass.

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: FAIL in `test/export-target.test.ts`, `Type '"pdf"' is not assignable to type '"png" | "svg"'` (or equivalent). This RED is a **type** RED. At runtime, `exportFilename` already formats any string, so `vitest run test/export-target.test.ts` passes even now. That is expected; the type error is the failing check.

- [ ] **Step 4: Widen `ExportOptions.format`**

In `packages/ui/src/ExportDialog.tsx`, line 5:

```diff
-  format: "png" | "svg"
+  format: "png" | "svg" | "pdf"
```

- [ ] **Step 5: Add the PDF toggle option**

In the format `<Toggle>` options (lines 156–159), add a third entry after the SVG one:

```diff
               { value: "png", label: "PNG", testId: "format-png" },
               { value: "svg", label: "SVG", testId: "format-svg" },
+              { value: "pdf", label: "PDF", testId: "format-pdf" },
             ]}
```

- [ ] **Step 6: Hide the Scale row for PDF**

Replace the Scale row (lines 162–168):

```tsx
<Row label={t("export.scale")}>
  <Toggle
    value={scale}
    setValue={setScale}
    options={SCALES.map((s) => ({ value: s, label: `${s}×`, testId: `scale-${s}` }))}
  />
</Row>
```

with:

```tsx
{
  /* A PDF is vector and sized to its content: scale does not apply. */
}
{
  format !== "pdf" && (
    <Row label={t("export.scale")}>
      <Toggle
        value={scale}
        setValue={setScale}
        options={SCALES.map((s) => ({ value: s, label: `${s}×`, testId: `scale-${s}` }))}
      />
    </Row>
  )
}
```

Do not touch the `scale` state, the `useEffect` reset (lines 67–73) or `currentOptions()` (lines 81–88).

- [ ] **Step 7: Type `exportFilename`'s format from the dialog**

In `apps/web/src/driver/exportTarget.ts`, add after line 1:

```ts
import type { ExportOptions } from "@excalidraw-clone/ui"
```

and change line 58:

```diff
-  format: "png" | "svg",
+  format: ExportOptions["format"],
```

`exportPNG.ts`/`exportSVG.ts` already import types from `@excalidraw-clone/ui`, so this adds no new package edge.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/ExportDialog.test.tsx`
Expected: PASS, `Tests 21 passed (21)`.

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/export-target.test.ts`
Expected: PASS, `Tests 28 passed (28)` (25 before, plus 3 cases).

- [ ] **Step 9: Typecheck and lint both packages**

Run: `pnpm --filter @excalidraw-clone/ui typecheck && pnpm --filter @excalidraw-clone/ui lint && pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors. `Dialogs.tsx` still compiles: `exportImage`'s final PNG line covers `"pdf"` until Task 3.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/ExportDialog.tsx packages/ui/test/ExportDialog.test.tsx apps/web/src/driver/exportTarget.ts apps/web/test/export-target.test.ts
git commit -m "feat(ui,web): offer PDF in the export dialog, hide scale for PDF, accept pdf filenames" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 3: Wire PDF into `exportImage`; e2e tests

**Files:**

- Modify: `apps/web/e2e/export.spec.ts`: line 2 (imports), line 6 (types), insert helpers before line 53 (`const expectNear`), append tests after line 191
- Modify: `apps/web/src/components/Dialogs.tsx`: import after line 11; new branch after line 99

**Interfaces:**

- Consumes: `exportToPDF` (Task 1); `ExportOptions.format === "pdf"` and `data-testid="format-pdf"` (Task 2); `exportFilename` accepting `"pdf"` (Task 2).
- Produces: user-visible PDF downloads. There are no new exports.

**Why this task's RED is e2e-only:** `exportImage` is a module-private function of a client component. Its only observable effect is a browser download of a real rendered PDF, and svg2pdf cannot run under jsdom (Researched fact 6). The e2e test is the failing test. It is RED now because the PDF option downloads PNG bytes, so the `%PDF-` header check fails.

- [ ] **Step 1: Add the e2e imports, type and helpers**

In `apps/web/e2e/export.spec.ts`:

Line 2, add the `node:zlib` import below it:

```diff
 import { readFileSync } from "node:fs"
+import { inflateSync } from "node:zlib"
```

Line 6, add a type below it:

```diff
 type ExportedPNG = { filename: string; width: number; height: number; bytes: Buffer }
+type ExportedPDF = { filename: string; width: number; height: number; bytes: Buffer }
```

Insert directly **before** line 53 (`const expectNear = …`):

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

/** Every Flate-compressed stream of a PDF, inflated and concatenated. */
const pdfStreams = (bytes: Buffer): string => {
  const latin = bytes.toString("latin1")
  const out: string[] = []
  for (const m of latin.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = m.index + m[0].length
    const end = latin.indexOf("endstream", start)
    try {
      out.push(inflateSync(bytes.subarray(start, end)).toString("latin1"))
    } catch {
      // not a Flate stream
    }
  }
  return out.join("\n")
}
```

Why parse the `MediaBox` rather than only the `%PDF-` magic: the magic header proves only that a PDF arrived. The `MediaBox` is the page size, which is this feature's core contract (Review Focus #1 and #2), and reading it costs one regex. The page dictionary is never compressed. Content streams are Flate-compressed (`compress: true`), so the text check inflates them with `node:zlib`. No PDF library is added.

- [ ] **Step 2: Append the failing e2e tests**

Append to the end of `apps/web/e2e/export.spec.ts` (after line 191):

```ts
test("PDF export is one vector page sized like the PNG, for the page or the selection", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  // Scale has no meaning for a content-sized vector page.
  await expect(page.locator('[data-testid="scale-1"]')).toHaveCount(0)
  const whole = await exportPDF(page)
  expect(whole.filename).toBe("Page 1.pdf")
  // Same box as the PNG test above: bbox 400×280 plus 20px padding per side.
  expectNear(whole.width, 440)
  expectNear(whole.height, 320)
  // Shapes are drawn as vector paths, not an embedded raster.
  expect(whole.bytes.toString("latin1")).not.toContain("/Subtype /Image")

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPDF(page)
  expect(selection.filename).toBe("Page 1-selection.pdf")
  expectNear(selection.width, 100)
  expectNear(selection.height, 100)
})

test("PDF export keeps text as real PDF text", async ({ page }) => {
  await freshCanvas(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.locator('[data-testid="toolbar-text"]').click()
  await page.mouse.click(box.x + 200, box.y + 200)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello pdf")
  await editor.blur()
  await page.waitForTimeout(300)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  const pdf = await exportPDF(page)
  expect(pdf.filename).toBe("Page 1.pdf")
  // The default hand-drawn family falls back to the standard Times font.
  expect(pdf.bytes.toString("latin1")).toContain("/BaseFont /Times-Roman")
  expect(pdfStreams(pdf.bytes)).toContain("(hello pdf) Tj")
})
```

Notes:

- The format toggle state persists across dialog opens (it is not in the reset `useEffect`), so the second `format-pdf` click in the first test is redundant but harmless. Keep it: it makes the test independent of that persistence.
- The text-tool flow (click canvas → textarea → type → blur) is the same one `e2e/text-tool.spec.ts` uses.

- [ ] **Step 3: Run the e2e tests and confirm they fail**

Make sure port 3000 is free (`ss -ltnp | grep :3000` prints nothing), then:

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: the 5 existing tests pass. The 2 new tests FAIL at `expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")`, received `"\x89PNG\r"`: the PDF option currently falls through to the PNG branch.

- [ ] **Step 4: Wire the PDF branch**

In `apps/web/src/components/Dialogs.tsx`, add after line 11 (`import { copyPNGToClipboard } …`):

```diff
 import { copyPNGToClipboard } from "../driver/copyImageToClipboard"
+import { exportToPDF } from "../driver/exportPDF"
 import { exportToPNG } from "../driver/exportPNG"
```

In `exportImage` (lines 89–101), add the PDF branch after the SVG branch (after line 99, `}`):

```diff
   if (opts.format === "svg") {
     const svg = await renderExportSVG(target.elements, opts, canvasBg)
     download(new Blob([svg], { type: "image/svg+xml" }), filename)
     return
   }
+  if (opts.format === "pdf") {
+    download(await exportToPDF(target.elements, opts, canvasBg), filename)
+    return
+  }
   download(await exportToPNG(target.elements, opts, canvasBg, target.pageName), filename)
 }
```

Leave `onCopy` (lines 50–53) unchanged. It must keep calling `exportToPNG`; PDF has no clipboard path.

- [ ] **Step 5: Run the e2e tests and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts`
Expected: PASS, `7 passed`.

- [ ] **Step 6: Run the export regression in theme.spec**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/theme.spec.ts`
Expected: PASS. Its dark-PNG export test does not touch the format toggle.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors. The `tsconfig` includes `e2e/**/*`, so the helpers are type-checked too. `m.index` from `matchAll` is a `number`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/e2e/export.spec.ts apps/web/src/components/Dialogs.tsx
git commit -m "feat(web): export the page or selection as a content-sized vector PDF" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 4: Full gate

**Files:** none modified. This task only verifies. If anything fails, fix it forward in the owning task's files.

**Interfaces:** consumes everything above and produces nothing new.

- [ ] **Step 1: Run the full monorepo gate, including the production build**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`
Expected: every turbo task succeeds. `@excalidraw-clone/web:build` prints `✓ Compiled successfully` with no `Module not found` for `jspdf`, `svg2pdf.js` or jspdf's optional deps (`html2canvas`, `dompurify`, `canvg`). Combined as `pnpm turbo run build lint typecheck test`, this is 28/28. If lint output references paths from another worktree, re-run with `pnpm turbo run lint --force`.

- [ ] **Step 2: Confirm the libraries are lazy**

Run: `grep -n 'from "jspdf"\|from "svg2pdf.js"' apps/web/src -r`
Expected: **no output**. The only references are the two `import("…")` calls inside `svgToPDF`.

- [ ] **Step 3: Run the related e2e specs**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/export.spec.ts e2e/theme.spec.ts e2e/text-tool.spec.ts e2e/pages.spec.ts`
Expected: PASS.

- [ ] **Step 4: Run the whole e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS, with no new failures compared with `main`. The suite grows by 2 tests.

- [ ] **Step 5: Confirm a clean tree**

Run: `git status`
Expected: a clean working tree, with all work committed in Tasks 1–3. This task makes no commit unless a fix-forward was needed; in that case, commit it as `fix(web): <what was fixed>` plus the co-author trailer.

---

## Self-Review

I ran these checks after drafting. Findings and resolutions:

- **Spec coverage.**
  - `ExportOptions.format` widened to `"png" | "svg" | "pdf"` → Task 2 Step 4. `exportFilename` follows via `ExportOptions["format"]` → Task 2 Step 7.
  - New driver `exportPDF.ts` in `apps/web/src/driver/`, wrapping `renderExportSVG` + `svg2pdf.js` + `jsPDF` → Task 1.
  - Page sized to the content bbox with the same padding and bbox logic as PNG/SVG, single page, not A4/Letter. This is achieved by taking `renderToSVG`'s own root size: no new sizing code, no new constant. → Task 1 (unit) and Task 3 (e2e: the same 440×320 / 100×100 as the PNG test).
  - Scale row hidden iff `format === "pdf"` → Task 2 Step 6, unit test plus e2e.
  - `exportImage()` gains a third branch → Task 3 Step 4.
  - Copy stays PNG-only → unchanged code, pinned by Task 2 "still copies a PNG when PDF is chosen".
  - Pinned deps `jspdf@4.2.1`, `svg2pdf.js@2.8.1` → Task 1 Step 1.
  - Labels follow the hardcoded `"PNG"`/`"SVG"` pattern. I checked the locales: no `export.png`/`export.svg`/`export.pdf` keys exist in `apps/web/src/locales/{en,ko}/common.json`, whose `"export"` object is at en line 141. → no locale edits.
- **Placeholder scan.** Every code step contains complete code. The only non-literal text is the commit co-author trailer, deliberately left to each implementer's session attribution reminder. Commit subjects are exact.
- **Type consistency.**
  - `exportToPDF`'s `opts: Pick<ExportOptions, "background">` matches `renderExportSVG`'s parameter exactly. `Dialogs.tsx` passes the full `ExportOptions`, which is structurally accepted.
  - `FileLoader` is imported from `./exportSVG` (it is exported there); `getFile` is assignable to it, the same as in `exportSVG.ts`.
  - `svgToPDF` returns `pdf.output("blob")`, typed `Blob` by the `output(type: "blob"): Blob` overload. `download(blob: Blob, filename: string)` accepts it.
  - `svg2pdf(root: Element, pdf: jsPDF, { x, y, width, height })` matches `types.d.ts`. `root` is `doc.documentElement: Element` (`HTMLElement` in lib.dom typings, which is an `Element`).
  - In the unit test, `svg2pdf.mock.calls[0]!` destructures to `[Element, unknown, unknown?]`, so `el.localName` type-checks.
  - With `exactOptionalPropertyTypes`, no optional property is ever passed `undefined`.
  - Task 1 compiles before Task 2, because it reads only `background`. Task 2 keeps `Dialogs.tsx` compiling: the PNG fallthrough covers `"pdf"` until Task 3.
- **Review Focus coverage.**
  - (1) orientation → 2 Task 1 tests (mutation-checked) plus Task 3 e2e
  - (2) sizing → 2 Task 1 tests plus Task 3 e2e ×2 sizes
  - (3) text baseline and real text → Task 1 plus Task 3 e2e
  - (4) Scale row → Task 2 plus Task 3 e2e
  - (5) copy stays PNG → Task 2
  - (6) filenames → Task 2 ×3 plus Task 3 e2e ×2
  - (7) error propagation → Task 1 ×3
  - (8) lazy loading → Task 4 Steps 1–2
- **Issues found and fixed while drafting.** All were found by running code, not by reading docs.
  - **jsPDF orientation swap.** A naive `new jsPDF({ unit: "pt", format: [w, h] })` produced a rotated 340×440 page for 440×340 content in Chromium. The fix is the explicit `orientation`, pinned by the landscape/portrait tests.
  - **svg2pdf ignores `dominant-baseline`.** This would have shipped every text line about 17px too high (at 20px font size) with all tests green, unless a test looked for it. Fixed in the PDF driver's parsed DOM with `alignment-baseline="text-top"` (verified to move `Tm` y from 10 to 27). Pinned by a unit test.
  - **svg2pdf + Vitest.** The UMD `main` crashes at import time under Vitest, and the real drawing crashes on `getBBox` under jsdom. Rather than a vitest alias that only defers the crash, the unit test mocks `svg2pdf.js` and keeps jsPDF real. The heavy imports are lazy, so no other unit test loads either library.
  - **jsdom duplicate-`xmlns` serialization.** `renderExportSVG` output from jsdom is invalid XML to jsdom's own `DOMParser`; Chromium's is fine. This is why `exportToPDF`'s composition is e2e-only, while `prepareSVGForPDF`/`svgToPDF` are unit-tested with hand-written SVG strings.
  - **`unit: "px"` trap.** Without the `px_scaling` hotfix, jsPDF's `px` unit has scale factor 1.333, so the MediaBox would not equal the PNG pixel size. `pt` is used instead.
  - **Copy with PDF selected uses the hidden scale.** The PNG copy still honors the `scale` state even while its row is hidden. Accepted as-is: it is the user's last explicit choice, and resetting it would lose that choice for PNG (Review Focus #4).
  - **Non-Latin text is unreadable in the PDF.** Standard fonts only, as above. This is out of scope and called out in Global Constraints and Researched fact 5, as a follow-up for the roadmap.
- **Re-verification pass (2026-10-02, against HEAD 5eca279).** I re-read the live files and re-checked:
  - `apps/web/src/driver/exportTarget.ts`: 67 lines; line 1 `import { expandIdsToCopyClosure, type ExcalidrawElement } from "@excalidraw-clone/scene"`; `exportFilename` lines 55–67 with `format: "png" | "svg",` on line 58.
  - `apps/web/src/driver/exportSVG.ts`: `export type FileLoader` on line 7; `renderExportSVG(elements, opts: Pick<ExportOptions, "background">, canvasBg, loadFile = getFile): Promise<string>` wraps `new Scene(live)` → `renderToSVG`.
  - `apps/web/src/driver/exportPNG.ts`: `PADDING = 20` on line 12; `computeBBox` (min/max of `x`, `y`, `x+width`, `y+height`; an empty input gives 100×100) on lines 72–90. This is identical to `renderToSVG`'s `computeBBox` (`packages/renderer/src/svg.ts:277–298`, `padding ?? 20` on line 55, `Math.max(1, …)` on lines 59–60, root `width`/`height`/`viewBox` on lines 64–66).
  - `packages/ui/src/ExportDialog.tsx`: 270 lines; `format: "png" | "svg"` on line 5; format toggle on lines 152–161 (PNG line 157, SVG line 158); Scale row on lines 162–168; `handleCopy` forces `format: "png"` on line 96; reset `useEffect` on lines 67–73; `currentOptions` on lines 81–88.
  - `packages/ui/test/ExportDialog.test.tsx`: 401 lines, 18 tests; helpers `t`, `ONE_PAGE`, `CopyFn`, `confirm` on lines 5–13.
  - `apps/web/src/components/Dialogs.tsx`: 101 lines; imports on lines 11–13; `onCopy` → `copyPNGToClipboard(() => exportToPNG(...))` on lines 50–53; `exportImage` on lines 89–101 (SVG branch lines 95–99, PNG fallthrough line 100).
  - `apps/web/test/export-target.test.ts`: 151 lines, 25 tests; the last `exportFilename` case `["회의 노트", …]` is on line 147.
  - `apps/web/e2e/export.spec.ts`: 191 lines, 5 tests; `readFileSync` import on line 2; `ExportedPNG` type on line 6; `expectNear` on line 53; helpers `freshCanvas`, `drawRect`, `drawTwoRectsAndSelectFirst`, `exportButton`, `openExportDialog`, `exportPNG`, `embeddedRectangleCount` as described.
  - `apps/web/vitest.config.ts`: `environment: "jsdom"`, `include: ["test/**/*.test.{ts,tsx}"]`; jsdom resolves to 29.1.0.
  - `apps/web/playwright.config.ts`: Chromium only, `pnpm dev` (Turbopack), `reuseExistingServer: !CI`.
  - `apps/web/tsconfig.json` includes `e2e/**/*`; the base config has `moduleResolution: "Bundler"`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
  - `DEFAULT_FONT_FAMILY = 1` (`packages/scene/src/defaults.ts:10`) → `"Caveat", cursive` → Times-Roman in the PDF, which is why the e2e test asserts `/BaseFont /Times-Roman`.
  - The full plan, applied to a scratch worktree of `5eca279`, passed `export-pdf.test.ts` 8/8, `ExportDialog.test.tsx` 21/21, `export-target.test.ts` 28/28, `pnpm turbo run build lint typecheck test` 28/28, Prettier `--check` on every touched file, and `e2e/export.spec.ts` 7/7.

  No discrepancies remain.
