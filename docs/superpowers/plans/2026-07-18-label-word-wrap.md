# Label Word Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shape labels wrap at their inner-box width at render time (canvas + SVG), with auto-shrink applying to the wrapped block; scene data untouched.

**Architecture:** One new pure helper `layoutLabel` in `packages/renderer/src/text-metrics.ts` computes display lines (greedy space-only wrap, manual newlines respected) and the combined shrink scale. `drawText`'s existing `fit` branch and the SVG loop's `shapeLabelScale` both switch to it; `textNode` renders supplied display lines. Targeting is unchanged — `fit` is only ever set for `LABELABLE_TYPES` containers, so arrow labels and standalone text never wrap.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest. Spec: `docs/superpowers/specs/2026-07-18-label-word-wrap-design.md`.

## Global Constraints

- Scene data, undo, persistence, `TextEditingOverlay`, arrow/line labels, occlusion backing, and standalone text are untouched.
- Wrap at spaces only; a word wider than the box stays whole (width-bound shrink covers it). Manual `\n` breaks are always kept. Consecutive spaces collapse in wrapped output.
- Wrap once at the natural font size; the shrink never triggers a re-wrap.
- Labels that fit on one line must render byte-identically to today.
- No new e2e (invisible to scene data); the existing 34-spec suite gates regressions.
- `exactOptionalPropertyTypes` is on — any new optional interface property receiving a possibly-undefined value needs `| undefined`. Optional function parameters are unaffected.
- RTK filters test output: check pass/fail with `>/dev/null 2>&1 && echo PASS || echo FAIL`; on FAIL rerun via `rtk proxy` for details. Lint from repo root only. Commit style: `<package>: <what changed>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: renderer — `layoutLabel` pure helper

**Files:**

- Modify: `packages/renderer/src/text-metrics.ts`
- Test: Create `packages/renderer/test/text-metrics.test.ts`

**Interfaces:**

- Consumes: nothing new — pure function, no imports beyond what the file has.
- Produces (Tasks 2 and 3 rely on these exact shapes):

```ts
export interface LabelLayout {
  lines: string[]
  scale: number
}

export const layoutLabel = (
  text: string,
  box: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  measureWidth: (s: string) => number,
): LabelLayout
```

- [ ] **Step 1: Write the failing tests**

Create `packages/renderer/test/text-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { layoutLabel } from "../src/text-metrics"

// mirrors the mock canvas: every character is 10px wide
const m = (s: string): number => s.length * 10

describe("layoutLabel", () => {
  it("wraps two words at a narrow width without shrinking", () => {
    const out = layoutLabel("hello world", { width: 60, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["hello", "world"])
    expect(out.scale).toBe(1)
  })

  it("respects manual newlines and only adds breaks", () => {
    const out = layoutLabel("a b\nc", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a b", "c"])
    expect(out.scale).toBe(1)
  })

  it("keeps an over-wide word whole and shrinks by the width bound", () => {
    // "extraordinary" → 130 wide; box 60 → scale 60/130
    const out = layoutLabel("extraordinary", { width: 60, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["extraordinary"])
    expect(out.scale).toBeCloseTo(60 / 130)
  })

  it("preserves empty logical lines", () => {
    const out = layoutLabel("a\n\nb", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a", "", "b"])
  })

  it("returns one line at scale 1 for short text", () => {
    const out = layoutLabel("hi", { width: 84, height: 64 }, 20, 1.25, m)
    expect(out.lines).toEqual(["hi"])
    expect(out.scale).toBe(1)
  })

  it("shrinks by the height bound when wrapping makes the block tall", () => {
    // each word fits alone (10 ≤ 10) but no two together → 4 lines × 25 = 100; box height 50
    const out = layoutLabel("a b c d", { width: 10, height: 50 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a", "b", "c", "d"])
    expect(out.scale).toBe(0.5)
  })

  it("collapses consecutive spaces in wrapped output", () => {
    const out = layoutLabel("a  b", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a b"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (`layoutLabel` is not exported)

- [ ] **Step 3: Implement**

Append to `packages/renderer/src/text-metrics.ts`:

```ts
export interface LabelLayout {
  lines: string[]
  scale: number
}

/** Display layout for a shape label: greedy space-only wrap of each logical
 *  line at box.width (a word wider than the box stays whole), then the
 *  combined shrink scale — min(1, width bound, height bound) — for the
 *  wrapped block. measureWidth must measure at the natural font size. */
export const layoutLabel = (
  text: string,
  box: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  measureWidth: (s: string) => number,
): LabelLayout => {
  const lines: string[] = []
  for (const logical of text.split("\n")) {
    const words = logical.split(" ").filter((w) => w.length > 0)
    if (words.length === 0) {
      lines.push("")
      continue
    }
    let current = words[0]!
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]!}`
      if (measureWidth(candidate) <= box.width) {
        current = candidate
      } else {
        lines.push(current)
        current = words[i]!
      }
    }
    lines.push(current)
  }
  let widest = 0
  for (const line of lines) widest = Math.max(widest, measureWidth(line))
  const totalHeight = lines.length * fontSize * lineHeight
  const scale = Math.min(
    1,
    widest > 0 ? box.width / widest : 1,
    totalHeight > 0 ? box.height / totalHeight : 1,
  )
  return { lines, scale }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/text-metrics.ts packages/renderer/test/text-metrics.test.ts
git commit -m "renderer: layoutLabel — space-wrap + shrink scale for shape labels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: renderer — canvas fit branch wraps via `layoutLabel`

**Files:**

- Modify: `packages/renderer/src/shapes/text.ts`
- Test: `packages/renderer/test/shapes-text.test.ts` (extend)

**Interfaces:**

- Consumes: `layoutLabel(text, box, fontSize, lineHeight, measureWidth): LabelLayout` from `../text-metrics` (Task 1).
- Produces: no signature changes — `drawText(ctx, e, fillColor?, opts?: TextDrawOptions)` is unchanged; with `opts.fit` it now draws wrapped display lines.

- [ ] **Step 1: Write the failing tests**

Append inside the `drawText` describe in `packages/renderer/test/shapes-text.test.ts`:

```ts
it("fit wraps two words at the box width instead of shrinking", () => {
  const { ctx } = createMockCanvas()
  // "hello world" → 110 wide; box 60 → wraps to "hello" / "world", both fit → no shrink
  const t = { ...newText({ x: 0, y: 0, width: 60, height: 100, text: "hello world" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  const fills = ctx.__calls.filter((c) => c.method === "fillText")
  expect(fills.map((c) => c.args[0])).toEqual(["hello", "world"])
  expect((ctx.__props.font as string).startsWith("20px")).toBe(true)
})

it("fit shrinks a wrapped block that is taller than the box", () => {
  const { ctx } = createMockCanvas()
  // wraps to 4 lines × 25 = 100; box height 50 → scale 0.5 → 10px
  const t = { ...newText({ x: 0, y: 0, width: 10, height: 50, text: "a b c d" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  expect(ctx.__calls.filter((c) => c.method === "fillText")).toHaveLength(4)
  expect((ctx.__props.font as string).startsWith("10px")).toBe(true)
})

it("without fit, text is never wrapped", () => {
  const { ctx } = createMockCanvas()
  const t = { ...newText({ x: 0, y: 0, width: 10, height: 10, text: "hello world" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t)
  const fills = ctx.__calls.filter((c) => c.method === "fillText")
  expect(fills.map((c) => c.args[0])).toEqual(["hello world"])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (fit shrinks "hello world" onto one line instead of wrapping)

- [ ] **Step 3: Implement**

In `packages/renderer/src/shapes/text.ts`:

1. Add the import:

```ts
import { fontSpec, layoutLabel } from "../text-metrics"
```

(replacing the existing `import { fontSpec } from "../text-metrics"`).

2. In `drawText`, replace the block from `const lines = e.text.split("\n")` through the end of the `if (opts?.fit) { ... }` branch with:

```ts
ctx.save()
ctx.font = fontSpec(e.fontSize, e.fontFamily)
let fontSize = e.fontSize
let lines: readonly string[] = e.text.split("\n")
if (opts?.fit) {
  const layout = layoutLabel(
    e.text,
    { width: e.width, height: e.height },
    e.fontSize,
    e.lineHeight,
    (s) => ctx.measureText(s).width,
  )
  lines = layout.lines
  if (layout.scale < 1) {
    fontSize = e.fontSize * layout.scale
    ctx.font = fontSpec(fontSize, e.fontFamily)
  }
}
const lineHeightPx = fontSize * e.lineHeight
const totalHeight = lines.length * lineHeightPx
```

(The `if (e.text.length === 0) return` guard stays first; the `maxLineWidth` helper stays — the occlude block below still uses it; delete the old fit computation that measured `widest`/`naturalHeight` inline.)

Note the existing width/height-shrink tests keep passing: a single unbreakable word wraps to itself, and manual-newline text wraps to the same lines, so the scale math is unchanged for those inputs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS` (including all existing fit/occlude tests)

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shapes/text.ts packages/renderer/test/shapes-text.test.ts
git commit -m "renderer: canvas shape labels word-wrap at the inner box via layoutLabel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: renderer — SVG wrap parity + full gate

**Files:**

- Modify: `packages/renderer/src/svg.ts`
- Test: `packages/renderer/test/svg.test.ts` (extend)

**Interfaces:**

- Consumes: `layoutLabel` and `LabelLayout` from `./text-metrics` (Task 1); existing `measure`/`container` plumbing in `renderToSVG`.
- Produces: `renderElement(..., backing?, layout?: LabelLayout)` and `textNode(doc, el, theme, layout?: LabelLayout)` — the `fontScale = 1` parameter from auto-shrink is replaced by the layout object (`shapeLabelScale` is deleted). No exported API changes.

- [ ] **Step 1: Write the failing tests**

Append inside the `renderToSVG shape label auto-shrink` describe in `packages/renderer/test/svg.test.ts` (it already has `stubMeasure` and `labeledRectScene`):

```ts
it("wraps a two-word label into two tspans at natural size", () => {
  // "hello world" → 110 wide; box 84 → wraps, both lines fit → font-size 20
  const svg = renderToSVG(labeledRectScene("hello world"), { measure: stubMeasure })
  expect(svg.match(/<tspan/g)).toHaveLength(2)
  expect(svg).toContain('font-size="20"')
})

it("does not wrap when no measurer is available", () => {
  const svg = renderToSVG(labeledRectScene("hello world"))
  expect(svg.match(/<tspan/g)).toHaveLength(1)
  expect(svg).toContain('font-size="20"')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (label renders as one tspan; only the scale is applied today)

- [ ] **Step 3: Implement**

In `packages/renderer/src/svg.ts`:

1. Import the helper (extending the existing text-metrics import):

```ts
import {
  fontFamilyName,
  layoutLabel,
  measureText,
  type LabelLayout,
  type TextSize,
} from "./text-metrics"
```

2. Delete the `shapeLabelScale` function. In the `renderToSVG` loop, replace the `fontScale` computation and call with:

```ts
const labelLayout =
  el.type === "text" &&
  el.text.length > 0 &&
  measure &&
  container &&
  LABELABLE_TYPES.has(container.type)
    ? layoutLabel(
        el.text,
        { width: el.width, height: el.height },
        el.fontSize,
        el.lineHeight,
        (s) => measure(s, el.fontSize, el.fontFamily, el.lineHeight).width,
      )
    : undefined
const node = renderElement(doc, el, rsvg, opts.files, theme, backing, labelLayout)
```

3. `renderElement`: replace the `fontScale = 1` parameter with `layout?: LabelLayout`, and the text branch call with `textNode(doc, el, theme, layout)`.

4. `textNode`: replace the `fontScale = 1` parameter and derive both font size and lines from the layout:

```ts
function textNode(
  doc: Document,
  el: ExcalidrawTextElement,
  theme: Theme,
  layout?: LabelLayout,
): SVGTextElement {
  const fontSize = el.fontSize * (layout?.scale ?? 1)
  const lines = layout?.lines ?? el.text.split("\n")
```

(The rest of `textNode` already iterates `lines` and uses `fontSize` for the attribute and `lineHeightPx` — no further changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS` (including the existing auto-shrink and backing tests)

- [ ] **Step 5: Run the full gate**

```bash
rtk lint
pnpm typecheck >/dev/null 2>&1 && echo TYPECHECK-PASS || echo TYPECHECK-FAIL
pnpm test >/dev/null 2>&1 && echo UNIT-PASS || echo UNIT-FAIL
pnpm --filter @excalidraw-clone/web e2e
```

Expected: lint clean, TYPECHECK-PASS, UNIT-PASS, 34 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/svg.ts packages/renderer/test/svg.test.ts
git commit -m "renderer: SVG shape labels word-wrap via layoutLabel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After all tasks

Use superpowers:finishing-a-development-branch — merge `develop` → `main` fast-forward and push both, per this repo's convention.
