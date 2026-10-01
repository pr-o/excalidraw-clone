# Font Size Control & Stale Hit-Box Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an S/M/L/XL (16/20/28/36) font-size preset row to the PropertiesPanel's Text section, and fix the latent bug where changing any font property (`fontSize`, `fontFamily`, `fontWeight`, `fontStyle`) on a _standalone_ text element leaves its `width`/`height` (and therefore its hit-box) stale, so the element can no longer be click-selected over its newly rendered area.

**Architecture:**

- A new tiny driver module `apps/web/src/driver/measureStandaloneText.ts` owns the "scratch canvas 2D context + `measureText`" idiom that today lives inline in `TextEditingOverlay.tsx`. The overlay is refactored to call it (pure refactor, no behavior change).
- A new pure driver function `apps/web/src/driver/applyPropertiesPatch.ts` computes what one element becomes when a PropertiesPanel patch is applied: `{ ...el, ...patch }`, plus — only for standalone text (`type === "text" && containerId === null`) and only when the patch touches a font key — `width`/`height` re-measured from the _merged_ element. The measurer is an injectable parameter (default `measureStandaloneText`) so the function is unit-testable without a canvas.
- `App.tsx`'s PropertiesPanel `onChange` swaps its inline spread for `applyPropertiesPatch(draft[i]!, patch)`. Everything else in that handler (selection filter, single `scene.mutate`) stays identical.
- `PropertiesPanel.tsx` gains a `FONT_SIZES` table and a third button row in the Text section, mirroring the font-family picker (`aria-pressed` on exact-match of the common `fontSize`).
- Bound text labels (`containerId !== null`) are never measured by this path; `reconcileBoundText` continues to own them.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react (jsdom), Playwright e2e, i18next JSON locales, pnpm + turbo monorepo.

**Spec:** inline in this plan — see Goal/Architecture (no separate spec document).

## Global Constraints

- Do NOT touch the StatsPanel `onChange` handler in `apps/web/src/components/App.tsx` (the `if (stats.kind !== "single") return` one, ~line 685). Out of scope.
- Do NOT change `newText()` in `packages/scene/src/factories.ts` (it keeps creating 0×0 boxes; the text-edit commit path sizes them).
- Do NOT change `measureText` in `packages/renderer/src/text-metrics.ts`.
- Bound labels (`containerId !== null`) must never be re-measured by the new code, and the TextEditingOverlay must still not create a canvas context for them (an existing test asserts `getContext` is not called).
- Legacy text elements may lack `fontWeight`/`fontStyle`; absent ⟺ `"normal"`. Never write `undefined` into those fields.
- i18n keys go in BOTH `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json`, inside the existing `"properties"` object, directly after `"italic"`. Key suffixes `_s`/`_m`/`_l`/`_xl` do not collide with i18next plural suffixes (`_zero/_one/_two/_few/_many/_other`).
- TDD: every behavior gets a failing test first. Run the exact commands given; confirm the stated failure before implementing.
- Commit after each task with the exact subject given. End every commit message with the co-author trailer from your session's attribution reminder (pass it as a second `-m`).
- Test commands: `pnpm --filter @excalidraw-clone/web exec vitest run <file>`, `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`, `pnpm --filter @excalidraw-clone/web exec playwright test <file>`. Full gate: `pnpm lint && pnpm typecheck && pnpm test` (if lint output looks stale, use `pnpm turbo run lint --force`).

## Review Focus

Most likely failure modes, most likely first — the Task 3 tests pin every one:

1. **Bound labels re-measured by mistake.** A text element with `containerId !== null` receiving a font patch must keep its `width`/`height` byte-identical and the measurer must not be invoked for it (reconcileBoundText owns it).
2. **Measuring the pre-patch element instead of the merged one.** Measuring `draft[i]` before applying the patch yields the _old_ size — the exact stale-box bug in a new costume. The measurer must receive the patched `fontSize`/`fontFamily`/`fontWeight`/`fontStyle`.
3. **Non-font patches on text, and patches on non-text elements.** `strokeColor`, `opacity`, `roundness`, etc. on text must not trigger re-measure (width/height untouched, measurer not called); rectangles/arrows in a mixed selection must be pass-through exactly as today.
4. **Multi-select with different current sizes/contents.** Each selected standalone text element is measured independently from its own `text` (not the first element's), so two texts of different length end up with different widths after the same `{ fontSize: 36 }` patch.
5. **Legacy elements & measurement unavailability.** Legacy text without `fontWeight`/`fontStyle` must be measured as `"normal"`; and if no 2D context is available (`getContext` returns `null`, as in bare jsdom) the patch must still apply, leaving width/height unchanged rather than throwing or writing `NaN`/`undefined`. Note: standalone text does NOT word-wrap (`autoResize` is unused; `measureText` splits on `\n` only), so "long text" means width = widest `\n`-separated line and height = line count × fontSize × lineHeight — a multi-line test pins this.

---

## File Structure

| File                                             | Action                                                                              | Responsibility                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/driver/measureStandaloneText.ts`   | Create                                                                              | `TextMeasureInput` type + `measureStandaloneText(input)`: scratch canvas ctx → `measureText`, `undefined` when no 2D context. |
| `apps/web/src/components/TextEditingOverlay.tsx` | Modify (import line 2; `commit` ~lines 78–97)                                       | Use `measureStandaloneText` instead of the inline canvas idiom.                                                               |
| `apps/web/test/fontAwareCanvasStub.ts`           | Create                                                                              | Test-only jsdom 2D-context stub whose `measureText` width depends on the current `ctx.font` (size, bold, code family).        |
| `apps/web/test/measure-standalone-text.test.ts`  | Create                                                                              | Unit tests for `measureStandaloneText`.                                                                                       |
| `packages/ui/src/PropertiesPanel.tsx`            | Modify (constants ~line 21–25; derived values ~137–154; Text section ~314–350)      | `FONT_SIZES` table, `fontSize` common value, font-size button row.                                                            |
| `packages/ui/test/PropertiesPanel.test.tsx`      | Modify (append inside `describe("PropertiesPanel — Text section")`, ends ~line 451) | Font-size picker tests.                                                                                                       |
| `apps/web/src/locales/en/common.json`            | Modify (`properties`, after `"italic"` ~line 87)                                    | `fontSize`, `fontSize_s/_m/_l/_xl`.                                                                                           |
| `apps/web/src/locales/ko/common.json`            | Modify (`properties`, after `"italic"` ~line 87)                                    | Same keys, Korean.                                                                                                            |
| `apps/web/test/i18n-font-size.test.tsx`          | Create                                                                              | en/ko resolution of the new keys.                                                                                             |
| `apps/web/src/driver/applyPropertiesPatch.ts`    | Create                                                                              | Pure per-element patch application with standalone-text re-measure.                                                           |
| `apps/web/test/apply-properties-patch.test.ts`   | Create                                                                              | Unit tests covering the Review Focus list.                                                                                    |
| `apps/web/src/components/App.tsx`                | Modify (import block ~line 49–69; PropertiesPanel `onChange` ~lines 482–490)        | Call `applyPropertiesPatch`.                                                                                                  |
| `apps/web/e2e/text-tool.spec.ts`                 | Modify (append)                                                                     | End-to-end: XL font size grows the persisted box and the grown area is click-selectable.                                      |

---

## Task 1: Extract `measureStandaloneText` and refactor TextEditingOverlay to use it

**Files:**

- Create: `apps/web/src/driver/measureStandaloneText.ts`
- Create: `apps/web/test/fontAwareCanvasStub.ts`
- Create: `apps/web/test/measure-standalone-text.test.ts`
- Modify: `apps/web/src/components/TextEditingOverlay.tsx` (line 2 import; `commit` body ~lines 78–97)
- Test (must stay green, unchanged): `apps/web/test/TextEditingOverlay.test.tsx`, `apps/web/test/commit-text-edit.test.ts`

**Interfaces:**

- Consumes: `measureText(ctx, text, fontSize, family, lineHeight, weight?, style?): TextSize` from `@excalidraw-clone/renderer`; `ExcalidrawTextElement` from `@excalidraw-clone/scene`.
- Produces:

  ```ts
  export type TextMeasureInput = Pick<
    ExcalidrawTextElement,
    "text" | "fontSize" | "fontFamily" | "lineHeight" | "fontWeight" | "fontStyle"
  >
  export interface MeasuredSize {
    width: number
    height: number
  }
  export function measureStandaloneText(input: TextMeasureInput): MeasuredSize | undefined
  ```

  and test helper `export function createFontAwareStubContext(): CanvasRenderingContext2D`.

- [ ] **Step 1: Create the font-aware canvas stub (test helper)**

Create `apps/web/test/fontAwareCanvasStub.ts`:

```ts
/** jsdom has no 2D canvas. This stub's measureText depends on the context's
 *  current `font` string (as written by renderer's fontSpec:
 *  "<style> <weight> <size>px <family>"), so tests can observe that font
 *  changes alter the measured width:
 *    width = chars × sizePx × (code family ? 0.6 : 0.5) × (bold ? 1.2 : 1)
 *  Italic does not change width. Not a *.test.ts file, so vitest does not run it. */
export function createFontAwareStubContext(): CanvasRenderingContext2D {
  let font = "normal normal 10px sans-serif"
  const ctx = {
    get font(): string {
      return font
    },
    set font(value: string) {
      font = value
    },
    measureText(text: string): { width: number } {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "10")
      const bold = / bold /.test(` ${font} `)
      const code = font.includes("Cascadia")
      return { width: String(text).length * px * (code ? 0.6 : 0.5) * (bold ? 1.2 : 1) }
    },
  }
  return ctx as unknown as CanvasRenderingContext2D
}
```

- [ ] **Step 2: Write the failing tests for `measureStandaloneText`**

Create `apps/web/test/measure-standalone-text.test.ts`:

```ts
import { newText } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { measureStandaloneText } from "../src/driver/measureStandaloneText"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

describe("measureStandaloneText — with a 2D context", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  it("measures width from the widest line and height from line count", () => {
    const el = newText({ x: 0, y: 0, text: "ab\nabcd", fontSize: 20 })
    // widest line "abcd": 4 × 20 × 0.5 = 40; height: 2 lines × 20 × 1.25 = 50
    expect(measureStandaloneText(el)).toEqual({ width: 40, height: 50 })
  })

  it("larger fontSize produces a larger box", () => {
    const small = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontSize: 16 }))!
    const large = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontSize: 36 }))!
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })

  it("bold is wider than normal", () => {
    const normal = measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))!
    const bold = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontWeight: "bold" }))!
    expect(bold.width).toBeGreaterThan(normal.width)
  })

  it("treats a legacy element without fontWeight/fontStyle as normal", () => {
    const { fontWeight: _w, fontStyle: _s, ...legacy } = newText({ x: 0, y: 0, text: "hello" })
    const normal = measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))
    expect(measureStandaloneText(legacy)).toEqual(normal)
  })
})

describe("measureStandaloneText — without a 2D context", () => {
  it("returns undefined when getContext yields null", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null)
    expect(measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))).toBeUndefined()
    spy.mockRestore()
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/measure-standalone-text.test.ts`
Expected: FAIL — cannot resolve `../src/driver/measureStandaloneText`.

- [ ] **Step 4: Implement `measureStandaloneText`**

Create `apps/web/src/driver/measureStandaloneText.ts`:

```ts
import { measureText } from "@excalidraw-clone/renderer"
import type { ExcalidrawTextElement } from "@excalidraw-clone/scene"

/** The fields that determine a text element's rendered size. */
export type TextMeasureInput = Pick<
  ExcalidrawTextElement,
  "text" | "fontSize" | "fontFamily" | "lineHeight" | "fontWeight" | "fontStyle"
>

export interface MeasuredSize {
  width: number
  height: number
}

/** Measure the rendered size of a free-standing (unbound) text element using
 *  a scratch canvas 2D context, so its persisted width/height — and so its
 *  hit-test box — fit its content. Returns undefined when no 2D context is
 *  available (e.g. bare jsdom); callers then leave the size unchanged.
 *  Bound labels must not be measured here — reconcileBoundText sizes those. */
export function measureStandaloneText(input: TextMeasureInput): MeasuredSize | undefined {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return undefined
  return measureText(
    ctx,
    input.text,
    input.fontSize,
    input.fontFamily,
    input.lineHeight,
    input.fontWeight ?? "normal",
    input.fontStyle ?? "normal",
  )
}
```

- [ ] **Step 5: Run the new tests and confirm they pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/measure-standalone-text.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Refactor TextEditingOverlay to use the helper**

In `apps/web/src/components/TextEditingOverlay.tsx`:

Replace line 2:

```ts
import { fontFamilyName, measureText } from "@excalidraw-clone/renderer"
```

with:

```ts
import { fontFamilyName } from "@excalidraw-clone/renderer"
```

and add, next to the other `../driver/*` imports (after `import { commitTextEdit } from "../driver/commitTextEdit"`):

```ts
import { measureStandaloneText } from "../driver/measureStandaloneText"
```

Replace the measurement block inside `commit` (currently):

```ts
// Free-standing text has no container to size it; measure the typed
// content so the persisted box (and so its hit-test area) fits it.
const ctx = el.containerId === null ? document.createElement("canvas").getContext("2d") : null
const measuredSize = ctx
  ? measureText(
      ctx,
      value,
      el.fontSize,
      el.fontFamily,
      el.lineHeight,
      el.fontWeight ?? "normal",
      el.fontStyle ?? "normal",
    )
  : undefined
```

with:

```ts
// Free-standing text has no container to size it; measure the typed
// content so the persisted box (and so its hit-test area) fits it.
// Bound labels are skipped entirely (no canvas is created for them).
const measuredSize =
  el.containerId === null ? measureStandaloneText({ ...el, text: value }) : undefined
```

Leave the following `scene.mutate(...)` / `setId(null)` lines unchanged.

- [ ] **Step 7: Run the existing overlay + commit tests (pure refactor — must stay green)**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/TextEditingOverlay.test.tsx test/commit-text-edit.test.ts test/measure-standalone-text.test.ts`
Expected: PASS, including "does not measure a bound label (container sizing governs it)" (still no `getContext` call for labels).

- [ ] **Step 8: Typecheck and lint the web app**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors (in particular, no unused `measureText` import left in the overlay).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/driver/measureStandaloneText.ts apps/web/src/components/TextEditingOverlay.tsx apps/web/test/fontAwareCanvasStub.ts apps/web/test/measure-standalone-text.test.ts
git commit -m "refactor(web): extract measureStandaloneText from TextEditingOverlay" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 2: Font-size preset row in PropertiesPanel + i18n

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx` — constants (after `FONT_FAMILIES`, ~line 25), derived values (after `fontFamily`, ~line 141), Text section (after the bold/italic `<div>`, before `</Section>`, ~line 349)
- Modify: `packages/ui/test/PropertiesPanel.test.tsx` — append inside `describe("PropertiesPanel — Text section", …)` (closing `})` ~line 451)
- Modify: `apps/web/src/locales/en/common.json` (~line 87), `apps/web/src/locales/ko/common.json` (~line 87)
- Create: `apps/web/test/i18n-font-size.test.tsx`

**Interfaces:**

- Consumes: existing `PropertiesPanelProps.onChange: (patch: Partial<ExcalidrawElement>) => void`, `commonValue<T>(elements, key)` helper in the same file.
- Produces: buttons `data-testid="font-size-16" | "font-size-20" | "font-size-28" | "font-size-36"` inside `role="group"` with `aria-label={t("properties.fontSize")}`; clicking emits `onChange({ fontSize: <n> })`. i18n keys `properties.fontSize`, `properties.fontSize_s`, `properties.fontSize_m`, `properties.fontSize_l`, `properties.fontSize_xl`.

- [ ] **Step 1: Write the failing PropertiesPanel tests**

In `packages/ui/test/PropertiesPanel.test.tsx`, insert these tests immediately before the closing `})` of `describe("PropertiesPanel — Text section", …)` (i.e. right after the `"treats legacy text without fontWeight/fontStyle as normal"` test):

```tsx
it("shows a labelled font-size group for an all-text selection", () => {
  const el = newText({ x: 0, y: 0, text: "a" })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  const group = screen.getByRole("group", { name: "properties.fontSize" })
  for (const n of [16, 20, 28, 36]) {
    expect(group).toContainElement(screen.getByTestId(`font-size-${n}`))
  }
})

it("hides the font-size buttons for a non-text selection", () => {
  const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  expect(screen.queryByTestId("font-size-20")).toBeNull()
})

it.each([
  [16, "properties.fontSize_s"],
  [20, "properties.fontSize_m"],
  [28, "properties.fontSize_l"],
  [36, "properties.fontSize_xl"],
] as const)("emits onChange({ fontSize: %i }) from its labelled button", async (n, label) => {
  const el = newText({ x: 0, y: 0, text: "a" })
  const onChange = vi.fn()
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
  const button = screen.getByTestId(`font-size-${n}`)
  expect(button).toHaveTextContent(label)
  await userEvent.click(button)
  expect(onChange).toHaveBeenCalledWith({ fontSize: n })
})

it("marks M (20) as pressed for a default text element", () => {
  const el = newText({ x: 0, y: 0, text: "a" })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  expect(screen.getByTestId("font-size-20")).toHaveAttribute("aria-pressed", "true")
  for (const n of [16, 28, 36]) {
    expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
  }
})

it("marks the element's font size as pressed", () => {
  const el = newText({ x: 0, y: 0, text: "a", fontSize: 28 })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  expect(screen.getByTestId("font-size-28")).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByTestId("font-size-20")).toHaveAttribute("aria-pressed", "false")
})

it("no font size pressed for a mixed-size selection; clicking applies to all", async () => {
  const a = newText({ x: 0, y: 0, text: "a", fontSize: 16 })
  const b = newText({ x: 0, y: 40, text: "b", fontSize: 36 })
  const onChange = vi.fn()
  render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} onChange={onChange} />)
  for (const n of [16, 20, 28, 36]) {
    expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
  }
  await userEvent.click(screen.getByTestId("font-size-28"))
  expect(onChange).toHaveBeenCalledWith({ fontSize: 28 })
})

it("no font size pressed for a non-preset size", () => {
  const el = newText({ x: 0, y: 0, text: "a", fontSize: 24 })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  for (const n of [16, 20, 28, 36]) {
    expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
  }
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/PropertiesPanel.test.tsx`
Expected: FAIL — the 10 new test cases fail (`Unable to find role="group" and name "properties.fontSize"` / `Unable to find an element by: [data-testid="font-size-…"]`); all pre-existing tests pass.

- [ ] **Step 3: Add the `FONT_SIZES` table**

In `packages/ui/src/PropertiesPanel.tsx`, directly after the `FONT_FAMILIES` constant (ends ~line 25), add:

```ts
// Preset font sizes: [px, i18n label suffix]. 20 matches DEFAULT_FONT_SIZE ("M").
const FONT_SIZES: readonly (readonly [number, string])[] = [
  [16, "s"],
  [20, "m"],
  [28, "l"],
  [36, "xl"],
]
```

- [ ] **Step 4: Derive the common `fontSize`**

Directly after the `fontFamily` derivation (the `const fontFamily = commonValue<FontFamily>(…, "fontFamily")` block, ~lines 139–142), add:

```ts
const fontSize = commonValue<number>(
  textElements as unknown as readonly { [k: string]: unknown }[],
  "fontSize",
)
```

- [ ] **Step 5: Render the font-size row**

In the Text section, after the closing `</div>` of the bold/italic row (the `<div className="mt-1 flex gap-1">` containing `font-bold` and `font-italic`) and before `</Section>`, add:

```tsx
<div className="mt-1 flex gap-1" role="group" aria-label={t("properties.fontSize")}>
  {FONT_SIZES.map(([size, key]) => (
    <button
      key={size}
      type="button"
      data-testid={`font-size-${size}`}
      aria-pressed={fontSize === size}
      onClick={() => onChange({ fontSize: size })}
      className={`h-8 flex-1 rounded border text-xs ${fontSize === size ? "border-accent bg-accent-soft" : "border-panel"}`}
    >
      {t(`properties.fontSize_${key}`)}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/PropertiesPanel.test.tsx`
Expected: PASS (all tests, including the 10 new cases).

- [ ] **Step 7: Write the failing i18n test**

Create `apps/web/test/i18n-font-size.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

// `ensureI18n` initializes a module-level singleton, so tests read through
// `getFixedT(locale)` instead of switching the active language (which is async).

describe("Font size i18n — en", () => {
  it("resolves the font-size label and preset names, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("properties.fontSize")).toBe("Font size")
    expect(t("properties.fontSize_s")).toBe("S")
    expect(t("properties.fontSize_m")).toBe("M")
    expect(t("properties.fontSize_l")).toBe("L")
    expect(t("properties.fontSize_xl")).toBe("XL")
  })
})

describe("Font size i18n — ko", () => {
  it("resolves the font-size label and preset names, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("properties.fontSize")).toBe("글자 크기")
    expect(t("properties.fontSize_s")).toBe("소")
    expect(t("properties.fontSize_m")).toBe("중")
    expect(t("properties.fontSize_l")).toBe("대")
    expect(t("properties.fontSize_xl")).toBe("특대")
  })
})
```

- [ ] **Step 8: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-font-size.test.tsx`
Expected: FAIL — `expected 'properties.fontSize' to be 'Font size'` (raw key returned).

- [ ] **Step 9: Add the locale keys**

In `apps/web/src/locales/en/common.json`, inside `"properties"`, replace:

```json
    "bold": "Bold",
    "italic": "Italic",
```

with:

```json
    "bold": "Bold",
    "italic": "Italic",
    "fontSize": "Font size",
    "fontSize_s": "S",
    "fontSize_m": "M",
    "fontSize_l": "L",
    "fontSize_xl": "XL",
```

In `apps/web/src/locales/ko/common.json`, inside `"properties"`, replace:

```json
    "bold": "굵게",
    "italic": "기울임",
```

with:

```json
    "bold": "굵게",
    "italic": "기울임",
    "fontSize": "글자 크기",
    "fontSize_s": "소",
    "fontSize_m": "중",
    "fontSize_l": "대",
    "fontSize_xl": "특대",
```

(Before editing, confirm with `grep -n '"italic"' apps/web/src/locales/*/common.json` that each file has exactly one `"italic"` key, inside `"properties"`.)

- [ ] **Step 10: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-font-size.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 11: Typecheck and lint both packages**

Run: `pnpm --filter @excalidraw-clone/ui typecheck && pnpm --filter @excalidraw-clone/ui lint && pnpm --filter @excalidraw-clone/web lint`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/test/i18n-font-size.test.tsx
git commit -m "feat(ui,web): add S/M/L/XL font-size presets to the properties panel" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 3: Re-measure standalone text on font changes (`applyPropertiesPatch`) + e2e

**Files:**

- Modify: `apps/web/e2e/text-tool.spec.ts` (append one test at end of file)
- Create: `apps/web/src/driver/applyPropertiesPatch.ts`
- Create: `apps/web/test/apply-properties-patch.test.ts`
- Modify: `apps/web/src/components/App.tsx` — import block (driver imports, ~lines 49–69) and PropertiesPanel `onChange` (~lines 482–490). Do NOT touch the StatsPanel `onChange` (~line 685).

**Interfaces:**

- Consumes: `measureStandaloneText`, `TextMeasureInput`, `MeasuredSize` from `apps/web/src/driver/measureStandaloneText.ts` (Task 1); `ExcalidrawElement` from `@excalidraw-clone/scene`; font-size buttons `font-size-<n>` (Task 2).
- Produces:

  ```ts
  export type Measurer = (input: TextMeasureInput) => MeasuredSize | undefined
  export function applyPropertiesPatch(
    el: ExcalidrawElement,
    patch: Partial<ExcalidrawElement>,
    measure?: Measurer, // default: measureStandaloneText
  ): ExcalidrawElement
  ```

- [ ] **Step 1: Write the failing e2e test**

Append to `apps/web/e2e/text-tool.spec.ts` (it reuses the file's existing `clickCanvas`, `freshCanvas` and `parseStoredScene`):

```ts
test("changing font size to XL grows the text's box so its new area is click-selectable", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello world")
  await page.keyboard.press("Escape")
  await expect(editor).toHaveCount(0)

  type StoredText = {
    type: string
    x: number
    y: number
    width: number
    height: number
    fontSize: number
    isDeleted?: boolean
  }
  const readText = async (): Promise<StoredText> => {
    await page.waitForTimeout(900)
    const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
    const texts = parseStoredScene<StoredText>(sceneJson).elements.filter(
      (e) => e.type === "text" && !e.isDeleted,
    )
    expect(texts).toHaveLength(1)
    return texts[0]!
  }
  const before = await readText()
  expect(before.fontSize).toBe(20)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  const xl = page.locator('[data-testid="font-size-36"]')
  await expect(page.locator('[data-testid="font-size-20"]')).toHaveAttribute("aria-pressed", "true")
  await xl.click()
  await expect(xl).toHaveAttribute("aria-pressed", "true")

  const after = await readText()
  expect(after.fontSize).toBe(36)
  expect(after.width).toBeGreaterThan(before.width * 1.5)
  expect(after.height).toBeGreaterThan(before.height * 1.5)

  // Deselect, then click a point inside the NEW box but outside the OLD one
  // (right of the old right edge, vertically inside both boxes).
  await clickCanvas(page, { x: 700, y: 550 })
  await expect(xl).toHaveCount(0)
  await clickCanvas(page, {
    x: after.x + before.width + (after.width - before.width) / 2,
    y: after.y + before.height / 2,
  })
  await expect(xl).toBeVisible()
  await expect(xl).toHaveAttribute("aria-pressed", "true")
})
```

- [ ] **Step 2: Run the e2e test and confirm it fails**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/text-tool.spec.ts -g "XL grows"`
Expected: FAIL at `expect(after.width).toBeGreaterThan(before.width * 1.5)` — width is unchanged because nothing re-measures on a PropertiesPanel font change (this is the bug). Do not commit yet.

- [ ] **Step 3: Write the failing unit tests**

Create `apps/web/test/apply-properties-patch.test.ts`:

```ts
import {
  newLabelFor,
  newRectangle,
  newText,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockInstance,
  vi,
} from "vitest"
import { applyPropertiesPatch, type Measurer } from "../src/driver/applyPropertiesPatch"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

/** Deterministic fake: width = chars × fontSize × 0.5 (× 1.2 if bold);
 *  height = lines × fontSize × lineHeight. Records every input it sees. */
const fakeMeasure = (): Mock<Measurer> =>
  vi.fn<Measurer>((input) => {
    const lines = input.text.split("\n")
    const widest = Math.max(...lines.map((l) => l.length))
    const bold = (input.fontWeight ?? "normal") === "bold" ? 1.2 : 1
    return {
      width: widest * input.fontSize * 0.5 * bold,
      height: lines.length * input.fontSize * input.lineHeight,
    }
  })

/** A standalone text element carrying a deliberately stale 1×1 box. */
const staleText = (overrides: Partial<ExcalidrawTextElement> = {}): ExcalidrawTextElement => ({
  ...newText({ x: 10, y: 20, text: "hello" }),
  width: 1,
  height: 1,
  ...overrides,
})

describe("applyPropertiesPatch — standalone text + font keys", () => {
  it.each([
    [{ fontSize: 36 }],
    [{ fontFamily: 3 as const }],
    [{ fontWeight: "bold" as const }],
    [{ fontStyle: "italic" as const }],
  ])("re-measures width/height for patch %o", (patch) => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), patch, measure) as ExcalidrawTextElement
    expect(measure).toHaveBeenCalledTimes(1)
    expect(out.width).not.toBe(1)
    expect(out.height).not.toBe(1)
    for (const [k, v] of Object.entries(patch)) {
      expect(out[k as keyof ExcalidrawTextElement]).toBe(v)
    }
  })

  it("measures the PATCHED element, not the pre-patch one", () => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), { fontSize: 36 }, measure)
    expect(measure).toHaveBeenCalledWith(expect.objectContaining({ text: "hello", fontSize: 36 }))
    // "hello": 5 × 36 × 0.5 = 90; 1 line × 36 × 1.25 = 45
    expect(out.width).toBe(90)
    expect(out.height).toBe(45)
  })

  it("keeps every other field (id, x, y, text, colors) unchanged", () => {
    const el = staleText({ strokeColor: "#e03131" })
    const out = applyPropertiesPatch(el, { fontWeight: "bold" }, fakeMeasure())
    expect(out).toEqual({ ...el, fontWeight: "bold", width: 60, height: 25 })
  })

  it("multi-line text: width is the widest line, height scales with line count", () => {
    const el = staleText({ text: "a\na much longer line" })
    const out = applyPropertiesPatch(el, { fontSize: 20 }, fakeMeasure())
    // widest line is 18 chars: 18 × 20 × 0.5 = 180; 2 lines × 20 × 1.25 = 50
    expect(out.width).toBe(180)
    expect(out.height).toBe(50)
  })

  it("legacy element without fontWeight/fontStyle is measured as normal and stays legacy", () => {
    const { fontWeight: _w, fontStyle: _s, ...legacy } = staleText()
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(legacy as ExcalidrawElement, { fontSize: 20 }, measure)
    expect(out.width).toBe(50) // 5 × 20 × 0.5, no bold factor
    expect("fontWeight" in out).toBe(false)
    expect("fontStyle" in out).toBe(false)
  })

  it("applies the patch but keeps the old size when measurement is unavailable", () => {
    const out = applyPropertiesPatch(staleText(), { fontSize: 36 }, () => undefined)
    expect((out as ExcalidrawTextElement).fontSize).toBe(36)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })
})

describe("applyPropertiesPatch — no re-measure", () => {
  it("does not measure a bound label even for a font patch", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = { ...newLabelFor(rect), width: 7, height: 9 }
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(label, { fontSize: 36 }, measure) as ExcalidrawTextElement
    expect(measure).not.toHaveBeenCalled()
    expect(out.fontSize).toBe(36)
    expect(out.width).toBe(7)
    expect(out.height).toBe(9)
  })

  it("does not measure standalone text for a non-font patch", () => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), { strokeColor: "#e03131", opacity: 50 }, measure)
    expect(measure).not.toHaveBeenCalled()
    expect(out.strokeColor).toBe("#e03131")
    expect(out.opacity).toBe(50)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })

  it("passes non-text elements through as a plain merge", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 40, height: 30 })
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(rect, { strokeColor: "#e03131" }, measure)
    expect(measure).not.toHaveBeenCalled()
    expect(out).toEqual({ ...rect, strokeColor: "#e03131" })
  })
})

describe("applyPropertiesPatch — multi-selection behavior", () => {
  it("measures each standalone text from its own content", () => {
    const measure = fakeMeasure()
    const shortEl = staleText({ text: "hi" })
    const longEl = staleText({ text: "hello world" })
    const a = applyPropertiesPatch(shortEl, { fontSize: 36 }, measure)
    const b = applyPropertiesPatch(longEl, { fontSize: 36 }, measure)
    expect(a.width).toBe(36) // 2 × 36 × 0.5
    expect(b.width).toBe(198) // 11 × 36 × 0.5
  })
})

describe("applyPropertiesPatch — default measurer (real measureText via stubbed canvas)", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  it("uses measureStandaloneText by default", () => {
    const out = applyPropertiesPatch(staleText(), { fontSize: 28 })
    // font-aware stub: 5 × 28 × 0.5 = 70; renderer height: 1 × 28 × 1.25 = 35
    expect(out.width).toBe(70)
    expect(out.height).toBe(35)
  })

  it("bold makes the default-measured box wider", () => {
    const normal = applyPropertiesPatch(staleText(), { fontWeight: "normal" })
    const bold = applyPropertiesPatch(staleText(), { fontWeight: "bold" })
    expect(bold.width).toBeGreaterThan(normal.width)
  })
})
```

Arithmetic check for the "keeps every other field" test: `fontWeight: "bold"` on "hello" at the default fontSize 20 → 5 × 20 × 0.5 × 1.2 = 60 wide, 1 × 20 × 1.25 = 25 tall.

- [ ] **Step 4: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/apply-properties-patch.test.ts`
Expected: FAIL — cannot resolve `../src/driver/applyPropertiesPatch`.

- [ ] **Step 5: Implement `applyPropertiesPatch`**

Create `apps/web/src/driver/applyPropertiesPatch.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import {
  type MeasuredSize,
  measureStandaloneText,
  type TextMeasureInput,
} from "./measureStandaloneText"

export type Measurer = (input: TextMeasureInput) => MeasuredSize | undefined

/** Patch keys that change a text element's rendered size without changing its text. */
const FONT_KEYS = ["fontSize", "fontFamily", "fontWeight", "fontStyle"] as const

/** What one selected element becomes when a PropertiesPanel patch is applied.
 *
 *  A free-standing (unbound) text element whose font changes is re-measured
 *  from the *patched* element, so its width/height — and so its hit-test box —
 *  track what is actually rendered. Bound labels are left to reconcileBoundText;
 *  every other element (and every non-font patch) is a plain merge. If
 *  measurement is unavailable the patch still applies and the size is kept. */
export function applyPropertiesPatch(
  el: ExcalidrawElement,
  patch: Partial<ExcalidrawElement>,
  measure: Measurer = measureStandaloneText,
): ExcalidrawElement {
  const merged = { ...el, ...patch } as ExcalidrawElement
  if (merged.type !== "text" || merged.containerId !== null) return merged
  if (!FONT_KEYS.some((key) => key in patch)) return merged
  const size = measure(merged)
  return size ? { ...merged, width: size.width, height: size.height } : merged
}
```

- [ ] **Step 6: Run and confirm unit tests pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/apply-properties-patch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Wire it into App.tsx**

In `apps/web/src/components/App.tsx`, add to the `../driver/*` imports (alphabetically, after `import { startAutoSave } from "../driver/autoSave"`):

```ts
import { applyPropertiesPatch } from "../driver/applyPropertiesPatch"
```

Then in the **PropertiesPanel** `onChange` (~lines 482–490; the one directly under `selectedElements={selectedElements}` inside `<PropertiesPanel`), replace:

```tsx
              onChange={(patch) => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, ...patch } as ExcalidrawElement
                    }
                  }
                })
              }}
```

with:

```tsx
              onChange={(patch) => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = applyPropertiesPatch(draft[i]!, patch)
                    }
                  }
                })
              }}
```

Leave `onDelete` and the StatsPanel `onChange` untouched. `ExcalidrawElement` is still used elsewhere in App.tsx; if `pnpm --filter @excalidraw-clone/web typecheck`/lint flags it as unused, remove it from the `@excalidraw-clone/scene` import (it is expected to still be used, e.g. by the StatsPanel handler).

- [ ] **Step 8: Run the web unit suite, typecheck, lint**

Run: `pnpm --filter @excalidraw-clone/web test && pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: all pass.

- [ ] **Step 9: Re-run the e2e test and confirm it passes**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/text-tool.spec.ts`
Expected: PASS — all tests in the file, including "changing font size to XL grows the text's box so its new area is click-selectable".

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/driver/applyPropertiesPatch.ts apps/web/test/apply-properties-patch.test.ts apps/web/src/components/App.tsx apps/web/e2e/text-tool.spec.ts
git commit -m "fix(web): re-measure standalone text on font changes so its hit-box stays accurate" -m "<co-author trailer from your attribution reminder>"
```

---

## Task 4: Full gate

**Files:** none modified (verification only; fix-forward in the owning task's files if anything fails).

**Interfaces:** Consumes everything above; produces nothing new.

- [ ] **Step 1: Run the full monorepo gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all turbo tasks succeed. If lint output references paths from another worktree, re-run with `pnpm turbo run lint --force`.

- [ ] **Step 2: Run the related e2e specs**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/text-tool.spec.ts e2e/shape-labels.spec.ts e2e/arrow-labels.spec.ts e2e/style-clipboard.spec.ts`
Expected: PASS (labels, which go through the same `onChange`, are unaffected; style-clipboard does not use this path but touches text styling).

- [ ] **Step 3: Run the whole e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS, no new failures versus `main`.

- [ ] **Step 4: Confirm a clean tree**

Run: `git status`
Expected: clean working tree (all work committed in Tasks 1–3). No commit in this task unless a fix-forward was needed; in that case commit it with `fix(web): <what was fixed>` plus the co-author trailer.

---

## Self-Review

Performed after drafting; findings and resolutions:

- **Spec coverage.**
  - Font-size presets S/M/L/XL = 16/20/28/36, matching the font-family buttons' look (`h-8 flex-1 rounded border text-xs`, accent when pressed) and picker semantics (`aria-pressed` on exact match, not a toggle) → Task 2, Steps 3–5.
  - i18n in en + ko, mirroring the `fontFamily_*` pattern inside `"properties"` → Task 2, Steps 7–10. Locale files are actually at `apps/web/src/locales/{en,ko}/common.json` (verified by grep), not under `packages/ui`.
  - Stale hit-box fix for all four font keys, standalone text only → Task 3 (`applyPropertiesPatch` + App.tsx wiring); `it.each` covers each key.
  - Shared measuring helper extracted and TextEditingOverlay refactored onto it → Task 1; existing overlay tests (including the "no getContext for bound labels" assertion) are the refactor's safety net, and the refactor preserves the `containerId === null` gate before any canvas is created.
  - StatsPanel handler, `newText()`, `measureText` untouched → Global Constraints + explicit notes in Task 3 Step 7.
  - E2E for create → select → XL → click-select in the grown area → Task 3 Steps 1–2 (red) and 9 (green).
- **Placeholder scan.** Every code step contains complete code. The only non-literal text is the commit co-author trailer, deliberately deferred to each implementer's own session attribution reminder (the trailer differs per session/model); the commit subject lines are exact.
- **Type consistency.** `TextMeasureInput` / `MeasuredSize` / `measureStandaloneText` (Task 1) are exactly what `Measurer` / `applyPropertiesPatch` (Task 3) import. `Pick<ExcalidrawTextElement, …"fontWeight" | "fontStyle">` preserves those fields' optionality, so legacy elements type-check; passing a full `ExcalidrawTextElement` (or `{ ...el, text: value }`) satisfies it structurally. `applyPropertiesPatch`'s `patch: Partial<ExcalidrawElement>` matches `PropertiesPanelProps.onChange`'s parameter type. The fake measurer in tests is `vi.fn<Measurer>(…)` typed `Mock<Measurer>` (Vitest 2.x function-type generic, same generation as the existing `MockInstance<typeof …getContext>` usage), so it is both callable as a `Measurer` and assertable with `toHaveBeenCalled*`.
- **Review Focus coverage.** (1) bound label not measured → "does not measure a bound label even for a font patch"; (2) patched-not-original measurement → "measures the PATCHED element" (exact 90×45); (3) non-font patch / non-text pass-through → two tests in "no re-measure"; (4) multi-select independent measurement → "measures each standalone text from its own content"; (5) legacy fields + no-context fallback + multi-line width → "legacy element…", "keeps the old size when measurement is unavailable", "multi-line text…", plus `measureStandaloneText`'s null-context test.
- **Issues found and fixed while drafting.**
  - The prompt suggested `FONT_SIZES: readonly number[]`; changed to `readonly (readonly [number, string])[]` (size + label suffix) to mirror `FONT_FAMILIES` and avoid a second lookup table for labels.
  - The prompt's Review Focus mentioned "extremely long text wrapping width correctly": standalone text does not word-wrap in this codebase (`autoResize` is never read; `measureText` splits on `\n` only), so that item was restated as "width = widest `\n` line, height = line count × fontSize × lineHeight" and pinned with a multi-line test.
  - The existing jsdom canvas stub in `TextEditingOverlay.test.tsx` ignores `ctx.font`, so it could not show font changes affecting width; added a font-aware stub (`apps/web/test/fontAwareCanvasStub.ts`) for the new tests instead of modifying the existing test file.
  - Pure TDD ordering for the e2e: it is written and seen failing (Task 3 Step 2) _before_ the fix and committed only with the fix, so no red test is ever committed. (This is why the e2e lives in Task 3 rather than a separate Task 4; Task 4 is the full gate.)
- **Re-verification pass (2026-09-30, against HEAD d353640).** Re-checked: `TextEditingOverlay.tsx` line 2 import and the `commit` measurement block (lines ~81–93); `PropertiesPanel.tsx` `FONT_FAMILIES` (line 21), `textElements`/`fontFamily` derivations (lines 137–142); `App.tsx` driver imports (lines 49–69) and the PropertiesPanel `onChange` inline spread (line 486); locale `"properties"` keys `fontFamily…italic` at lines 82–87 in both en/ko files; `ensureI18n(...).getFixedT` pattern (`apps/web/test/i18n-roughness.test.tsx`); `newLabelFor` exported from `@excalidraw-clone/scene`; `newText` accepts `fontSize`/`fontWeight`; `ExcalidrawTextElement.fontWeight`/`fontStyle` optional, `containerId: string | null`; renderer `fontSpec` = `<style> <weight> <size>px <family>` with code family `"Cascadia Code", …` (so the font-aware stub's parsing holds); `measureText` height = `lines × fontSize × lineHeight`; `MockInstance<typeof HTMLCanvasElement.prototype.getContext>` typing already used in `TextEditingOverlay.test.tsx`; e2e helpers `clickCanvas`/`freshCanvas`/`parseStoredScene` and `excalidraw-scene` localStorage key in `text-tool.spec.ts`; package scripts (`test`, `typecheck`, `lint`, `e2e`). No discrepancies found.
