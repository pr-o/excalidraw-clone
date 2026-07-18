# Label Auto-Shrink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shape labels that are too long shrink at render time so text always fits its container's inner box, in canvas rendering and SVG export, without touching scene data.

**Architecture:** Pure view-layer change inside `packages/renderer`. `drawText` gains a `fit` option computing `scale = min(1, boxW/widestLine, boxH/totalHeight)` from one measurement at natural size; the SVG path computes the same scale via its existing `measure` hook and renders `textNode` at the effective font size. The renderer's per-element container lookup (built for arrow labels) routes: linear container → occlusion, shape container → fit.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest. Spec: `docs/superpowers/specs/2026-07-18-label-auto-shrink-design.md`.

## Global Constraints

- Scene data, undo history, persistence, `TextEditingOverlay`, arrow/line labels, and standalone text are untouched.
- No minimum font size — text always fits; scale is capped at 1 (labels never grow).
- Fitting applies only to text whose `containerId` resolves to a `LABELABLE_TYPES` container.
- When text already fits (scale = 1), rendering must be byte-identical to today.
- No new e2e spec (the change is invisible to scene data); the existing 34-spec suite gates regressions.
- RTK filters test output: check pass/fail with `>/dev/null 2>&1 && echo PASS || echo FAIL`; on FAIL rerun via `rtk proxy` for details.
- Run lint from the repo root only. Commit style: `<package>: <what changed>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: renderer — canvas fit path (`drawText` opts + routing)

**Files:**

- Modify: `packages/renderer/src/shapes/text.ts`
- Modify: `packages/renderer/src/draw-element.ts`
- Modify: `packages/renderer/src/renderer.ts` (the `render()` element loop)
- Test: `packages/renderer/test/shapes-text.test.ts`, `packages/renderer/test/renderer-elements.test.ts`

**Interfaces:**

- Consumes: existing `TextOcclusion`, `OCCLUSION_PADDING`, `fontSpec` in `shapes/text.ts`; `LABELABLE_TYPES` and `LINEAR_LABELABLE_TYPES` from `@excalidraw-clone/scene`; mock canvas `measureText` returns `{ width: text.length * 10 }`; defaults fontSize 20 / lineHeight 1.25.
- Produces: `drawText(ctx, e, fillColor?, opts?: TextDrawOptions)` with `export interface TextDrawOptions { occlude?: TextOcclusion; fit?: boolean }` (the former 4th positional `occlude` parameter is consolidated into `opts`); `drawElement(..., theme?, labelOpts?: LabelDrawOptions)` with `export interface LabelDrawOptions { occlusionBg?: string; fit?: boolean }`. Task 2 relies on the same scale formula.

- [ ] **Step 1: Update existing occlusion tests to the new opts shape and add fit tests**

In `packages/renderer/test/shapes-text.test.ts`, the three occlusion tests currently pass `{ background: "#ffffff" }` as the 4th argument. Wrap each in `occlude`:

```ts
drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, {
  occlude: { background: "#ffffff" },
})
```

(2 call sites: "with occlude, fills a padded backing rect before the text" and "occlude with empty text draws nothing" — the "without occlude" test passes no 4th arg and is unchanged.)

Then append inside the `drawText` describe:

```ts
it("fit shrinks the font so a wide line fits the box width", () => {
  const { ctx } = createMockCanvas()
  // "hi!!" → mock width 40; box width 20 → scale 0.5 → 20px × 0.5 = 10px
  const t = { ...newText({ x: 0, y: 0, width: 20, height: 64, text: "hi!!" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  expect((ctx.__props.font as string).startsWith("10px")).toBe(true)
})

it("fit leaves text that already fits at its natural size", () => {
  const { ctx } = createMockCanvas()
  // "hi" → width 20 ≤ 84; height 25 ≤ 64 → scale 1
  const t = { ...newText({ x: 0, y: 0, width: 84, height: 64, text: "hi" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  expect((ctx.__props.font as string).startsWith("20px")).toBe(true)
})

it("fit shrinks by the height bound for tall multi-line text", () => {
  const { ctx } = createMockCanvas()
  // 4 lines × 25 = 100 natural height; box height 50 → scale 0.5 → 10px
  const t = { ...newText({ x: 0, y: 0, width: 84, height: 50, text: "a\nb\nc\nd" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  expect((ctx.__props.font as string).startsWith("10px")).toBe(true)
})

it("fit with empty text draws nothing", () => {
  const { ctx } = createMockCanvas()
  const t = { ...newText({ x: 0, y: 0, width: 20, height: 20 }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
  expect(ctx.__calls).toHaveLength(0)
})
```

In `packages/renderer/test/renderer-elements.test.ts`, append inside the describe (imports already include `newRectangle`, `newText`, `newArrow`, `newLabelForLinear`):

```ts
it("shrinks a shape label to fit but leaves arrow labels and standalone text alone", () => {
  vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  // shape label: 21 chars → mock width 210; box width 84 → scale 0.4 → 8px
  const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
  const shapeLabel = {
    ...newText({
      x: 8,
      y: 8,
      width: 84,
      height: 64,
      text: "aaaaaaaaaaaaaaaaaaaaa",
      textAlign: "center",
    }),
    containerId: rect.id,
  }
  const linkedRect = { ...rect, boundElements: [{ id: shapeLabel.id, type: "text" as const }] }
  const { canvas, ctx } = createMockCanvas()
  const r = new CanvasRenderer(canvas, new Scene([linkedRect, shapeLabel]))
  r.start()
  flush()
  const fonts = ctx.__calls.filter((c) => c.method === "set:font").map((c) => c.args[0] as string)
  expect(fonts.some((f) => f.startsWith("8px"))).toBe(true)
  r.stop()

  // arrow label and standalone text stay at 20px
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  }
  const arrowLabel = { ...newLabelForLinear(arrow), text: "aaaaaaaaaaaaaaaaaaaaa" }
  const linkedArrow = { ...arrow, boundElements: [{ id: arrowLabel.id, type: "text" as const }] }
  const loose = newText({ x: 0, y: 0, width: 10, height: 10, text: "aaaaaaaaaaaaaaaaaaaaa" })
  const { canvas: canvas2, ctx: ctx2 } = createMockCanvas()
  const r2 = new CanvasRenderer(canvas2, new Scene([linkedArrow, arrowLabel, loose]))
  r2.start()
  flush()
  const fonts2 = ctx2.__calls.filter((c) => c.method === "set:font").map((c) => c.args[0] as string)
  expect(fonts2.length).toBeGreaterThan(0)
  expect(fonts2.every((f) => f.startsWith("20px"))).toBe(true)
  r2.stop()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (drawText's 4th parameter is still `occlude`; no fit behavior)

- [ ] **Step 3: Implement**

`packages/renderer/src/shapes/text.ts` — replace the `TextOcclusion`/`drawText` section (keep `OCCLUSION_PADDING`, `horizontalOffset`, `verticalOffset` as-is):

```ts
export interface TextOcclusion {
  background: string
}

export interface TextDrawOptions {
  occlude?: TextOcclusion
  fit?: boolean
}

const maxLineWidth = (ctx: CanvasRenderingContext2D, lines: readonly string[]): number => {
  let max = 0
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width)
  return max
}

export const drawText = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawTextElement,
  fillColor?: string,
  opts?: TextDrawOptions,
): void => {
  if (e.text.length === 0) return
  const lines = e.text.split("\n")

  ctx.save()
  ctx.font = fontSpec(e.fontSize, e.fontFamily)
  let fontSize = e.fontSize
  if (opts?.fit) {
    const widest = maxLineWidth(ctx, lines)
    const naturalHeight = lines.length * e.fontSize * e.lineHeight
    const scale = Math.min(
      1,
      widest > 0 ? e.width / widest : 1,
      naturalHeight > 0 ? e.height / naturalHeight : 1,
    )
    if (scale < 1) {
      fontSize = e.fontSize * scale
      ctx.font = fontSpec(fontSize, e.fontFamily)
    }
  }
  const lineHeightPx = fontSize * e.lineHeight
  const totalHeight = lines.length * lineHeightPx

  if (opts?.occlude) {
    const widest = maxLineWidth(ctx, lines)
    ctx.fillStyle = opts.occlude.background
    ctx.fillRect(
      e.width / 2 - widest / 2 - OCCLUSION_PADDING,
      e.height / 2 - totalHeight / 2 - OCCLUSION_PADDING,
      widest + 2 * OCCLUSION_PADDING,
      totalHeight + 2 * OCCLUSION_PADDING,
    )
  }
  ctx.fillStyle = fillColor ?? e.strokeColor
  ctx.textBaseline = "top"
  ctx.textAlign = e.textAlign

  const baseY = verticalOffset(e, totalHeight)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const x = horizontalOffset(e, ctx.measureText(line).width)
    const y = baseY + i * lineHeightPx
    ctx.fillText(line, x, y)
  }
  ctx.restore()
}
```

Note: `verticalOffset(e, totalHeight)` receives the scaled `totalHeight`, so middle-alignment centers the shrunk block; `horizontalOffset` center-aligns from `e.width / 2`, unaffected by scale.

`packages/renderer/src/draw-element.ts` — replace the `labelOcclusionBg?: string` parameter with an options object and pass both flags through:

```ts
export interface LabelDrawOptions {
  occlusionBg?: string
  fit?: boolean
}

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
  theme: Theme = "light",
  labelOpts?: LabelDrawOptions,
): void => {
```

and in the text branch:

```ts
if (element.type === "text") {
  drawText(ctx, element, resolveColor(element.strokeColor, theme), {
    occlude:
      labelOpts?.occlusionBg === undefined ? undefined : { background: labelOpts.occlusionBg },
    fit: labelOpts?.fit,
  })
  ctx.restore()
  return
}
```

`packages/renderer/src/renderer.ts` — extend the scene import to include `LABELABLE_TYPES`:

```ts
import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES } from "@excalidraw-clone/scene"
```

and in `render()`, replace the `labelBg` computation and `drawElement` call with:

```ts
const labelOpts =
  container === undefined
    ? undefined
    : LINEAR_LABELABLE_TYPES.has(container.type)
      ? { occlusionBg: occludeBg }
      : LABELABLE_TYPES.has(container.type)
        ? { fit: true }
        : undefined
drawElement(ctx, element, this.rough, this.shapeCache, getImage, this.theme, labelOpts)
```

(The `container` lookup and `occludeBg` computation above the loop stay exactly as they are.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS` (including the untouched occlusion-rect coordinate assertions)

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shapes/text.ts packages/renderer/src/draw-element.ts packages/renderer/src/renderer.ts packages/renderer/test/shapes-text.test.ts packages/renderer/test/renderer-elements.test.ts
git commit -m "renderer: shape labels auto-shrink to fit their inner box on canvas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: renderer — SVG fit parity + full gate

**Files:**

- Modify: `packages/renderer/src/svg.ts`
- Test: `packages/renderer/test/svg.test.ts`

**Interfaces:**

- Consumes: `TextMeasure`, `defaultMeasure`, the `measure`/`byId`/`container` plumbing already in `renderToSVG`; `LABELABLE_TYPES` from `@excalidraw-clone/scene`; same scale formula as Task 1.
- Produces: `textNode(doc, el, theme, fontScale = 1)` renders at `el.fontSize × fontScale`; `renderElement` gains a trailing `fontScale = 1` parameter. No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/svg.test.ts` (imports already include everything needed):

```ts
describe("renderToSVG shape label auto-shrink", () => {
  const stubMeasure = (
    text: string,
    fontSize: number,
    _family: number,
    lineHeight: number,
  ): { width: number; height: number } => ({
    width: text.length * 10,
    height: fontSize * lineHeight,
  })

  const labeledRectScene = (text: string): Scene => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const label = {
      ...newText({ x: 8, y: 8, width: 84, height: 64, text, textAlign: "center" }),
      containerId: rect.id,
    }
    return new Scene([{ ...rect, boundElements: [{ id: label.id, type: "text" as const }] }, label])
  }

  it("emits a scaled font-size for a label wider than its box", () => {
    // 21 chars → 210 wide; box 84 → scale 0.4 → font-size 8
    const svg = renderToSVG(labeledRectScene("aaaaaaaaaaaaaaaaaaaaa"), { measure: stubMeasure })
    expect(svg).toContain('font-size="8"')
    expect(svg).not.toContain('font-size="20"')
  })

  it("keeps the natural font-size when the label fits", () => {
    const svg = renderToSVG(labeledRectScene("box"), { measure: stubMeasure })
    expect(svg).toContain('font-size="20"')
  })

  it("keeps the natural font-size when no measurer is available", () => {
    // jsdom's canvas.getContext returns null → default measurer unavailable
    const svg = renderToSVG(labeledRectScene("aaaaaaaaaaaaaaaaaaaaa"))
    expect(svg).toContain('font-size="20"')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (font-size is always the natural size)

- [ ] **Step 3: Implement**

In `packages/renderer/src/svg.ts`:

1. Extend the scene value import:

```ts
import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES } from "@excalidraw-clone/scene"
```

2. Add a scale helper next to `defaultMeasure`:

```ts
const shapeLabelScale = (el: ExcalidrawTextElement, measure: TextMeasure): number => {
  const size = measure(el.text, el.fontSize, el.fontFamily, el.lineHeight)
  return Math.min(
    1,
    size.width > 0 ? el.width / size.width : 1,
    size.height > 0 ? el.height / size.height : 1,
  )
}
```

3. In the `renderToSVG` element loop, after the existing `backing` computation, add `fontScale` and pass it through:

```ts
const fontScale =
  el.type === "text" &&
  el.text.length > 0 &&
  measure &&
  container &&
  LABELABLE_TYPES.has(container.type)
    ? shapeLabelScale(el, measure)
    : 1
const node = renderElement(doc, el, rsvg, opts.files, theme, backing, fontScale)
```

4. Thread it into the text node — `renderElement` gains a trailing parameter:

```ts
function renderElement(
  doc: Document,
  el: ExcalidrawElement,
  rsvg: RoughSVG,
  files: ReadonlyMap<string, string> | undefined,
  theme: Theme,
  backing?: { background: string; measure: TextMeasure },
  fontScale = 1,
): SVGGElement | null {
```

with the text branch calling `textNode(doc, el, theme, fontScale)`, and `textNode` scaling both the attribute and the line advance:

```ts
function textNode(
  doc: Document,
  el: ExcalidrawTextElement,
  theme: Theme,
  fontScale = 1,
): SVGTextElement {
  const fontSize = el.fontSize * fontScale
  const text = doc.createElementNS(SVG_NS, "text")
  text.setAttribute("font-family", fontFamilyName(el.fontFamily))
  text.setAttribute("font-size", String(fontSize))
  text.setAttribute("fill", resolveColor(el.strokeColor, theme))
  text.setAttribute("text-anchor", anchorFor(el.textAlign))
  text.setAttribute("dominant-baseline", "text-before-edge")

  const lines = el.text.split("\n")
  const lineHeightPx = fontSize * el.lineHeight
  const totalHeight = lines.length * lineHeightPx
  const baseY = verticalOffset(el, totalHeight)
  const x = horizontalAnchorX(el)

  for (let i = 0; i < lines.length; i += 1) {
    const tspan = doc.createElementNS(SVG_NS, "tspan")
    tspan.setAttribute("x", String(x))
    tspan.setAttribute("y", String(baseY + i * lineHeightPx))
    tspan.textContent = lines[i] ?? ""
    text.appendChild(tspan)
  }
  return text
}
```

(Only the `fontSize` const and the two lines using it change from today's `textNode`; the linear-label `backing` path is untouched and its labels always get `fontScale` 1 because their container is not in `LABELABLE_TYPES`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS`

- [ ] **Step 5: Run the full gate**

```bash
rtk lint
pnpm typecheck >/dev/null 2>&1 && echo TYPECHECK-PASS || echo TYPECHECK-FAIL
pnpm test >/dev/null 2>&1 && echo UNIT-PASS || echo UNIT-FAIL
pnpm --filter @excalidraw-clone/web e2e
```

Expected: lint clean, TYPECHECK-PASS, UNIT-PASS, 34/34 e2e passed.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/svg.ts packages/renderer/test/svg.test.ts
git commit -m "renderer: shape labels auto-shrink in SVG export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After all tasks

Use superpowers:finishing-a-development-branch — merge `develop` → `main` fast-forward and push both, per this repo's convention.
