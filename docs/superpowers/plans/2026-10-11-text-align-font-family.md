# Text Align + Font Family for Text and Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can set horizontal text alignment (left / center / right) and font family (Hand-drawn / Normal / Code) on free-standing text **and** on bound labels (shape labels and arrow/line labels), from the PropertiesPanel. Today only free-standing text exposes text styling (family, bold, italic, size); labels have no controls at all, and alignment has no control anywhere.

**Architecture (most of the plumbing already exists, see Researched facts):**

- `packages/scene/src/reconcile-bound-text.ts`: shape containers stop forcing `textAlign: "center"` on their label (they still force `verticalAlign: "middle"` and the inner box). Arrow/line labels keep forced center, because their text box is zero-width and alignment inside it is meaningless.
- `apps/web/src/driver/applyPropertiesPatch.ts`: new `applySelectionPatch(el, patch, selectedIds, measure?)`. It applies the panel patch to selected elements (existing `applyPropertiesPatch`), **and** forwards the text-style subset of the patch (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `textAlign`) to the bound label of every selected container. `App.tsx`'s PropertiesPanel `onChange` calls it instead of the inline ternary.
- `packages/ui/src/PropertiesPanel.tsx`: new optional prop `labelElements` (bound labels of the selected containers, computed in `App.tsx`). The Text section shows when every selected element is text or carries a label; its pressed states read from the text targets (selected text + labels). New Text-align row (`text-align-left|center|right`), hidden when an arrow/line is selected.
- `TextEditingOverlay` gets `textAlign` on its textarea; the style-clipboard paste re-measures free text (stale hit-box fix); en/ko locale keys.

**Tech Stack:** TypeScript, React 19, Vitest 2 (jsdom), Playwright e2e (Chromium), pnpm + turbo monorepo. **No new dependencies, no font files, no network font fetch.**

**Spec:** inline, from the request. Decisions taken by the planner (flagged for the human in "Open decisions" at the end, not reopened by implementers):

1. Font family set stays the existing three (`1` Hand-drawn, `2` Normal, `3` Code) with their existing CSS stacks in `packages/renderer/src/text-metrics.ts`. No new family, no bundled webfont.
2. Text alignment applies to free text and shape labels. Arrow/line labels stay centered and the align row is hidden when an arrow/line is in the selection.
3. Frame names are **out of scope**: a frame's name is `ExcalidrawFrameElement.name`, not a text element, rendered with a hard-coded `fontFamilyName(2)` at 12px (`svg.ts:173`). Styling it needs new frame fields + a migration.
4. Selecting a labelled shape shows the full Text section (family, bold, italic, size, align). Size/bold/italic forwarding to labels comes for free with the same key list and would look broken if only some buttons worked.

## Researched facts (verified 2026-10-11 against `main@2f1e742`, not from memory)

1. **Both fields already exist and are required.** `packages/scene/src/types.ts:146-162`: `ExcalidrawTextElement` has `fontFamily: FontFamily` and `textAlign: TextAlign` (plus optional `fontWeight`/`fontStyle`). `newText` (`factories.ts:170-188`) defaults `fontFamily: DEFAULT_FONT_FAMILY`, `textAlign: "left"`. `newNote`, `newLabelFor`, `newLabelForLinear` and both templates (`templates.ts:39,106`) create labels with `textAlign: "center"`.
2. **No persistence/migration work is needed.** Both fields have been written on every text element since v1; `SCENE_FORMAT_VERSION` is 3 and `packages/persistence/src/migrations.ts` has only v1→v2 (boundElements) and v2→v3 (pages). There is no element validator that strips unknown text fields. Do not bump the format version.
3. **The font-family picker already exists for free text.** `PropertiesPanel.tsx:21-25` `FONT_FAMILIES` (`[1,"handDrawn"],[2,"normal"],[3,"code"]`), rendered at lines ~274-283 as `font-family-1|2|3` inside `{allText && …}`. `allText = selectedElements.every((e) => e.type === "text")` (line 121). i18n keys `properties.fontFamily`, `properties.fontFamily_handDrawn|normal|code` already exist in en/ko (`apps/web/src/locales/{en,ko}/common.json` lines 83-86).
4. **Font changes on free text are already re-measured.** `apps/web/src/driver/applyPropertiesPatch.ts`: `FONT_KEYS = ["fontSize","fontFamily","fontWeight","fontStyle"]`; a free text (`containerId === null`) receiving any of them is re-measured from the **patched** element via `measureStandaloneText`. `textAlign` does not change a free text's size (its box is the widest line), so it correctly needs no re-measure. Bound labels are never measured (reconcile owns their box).
5. **Renderers already honor both fields.**
   - Canvas `packages/renderer/src/shapes/text.ts`: `ctx.font = fontSpec(e.fontSize, e.fontFamily, …)`, `ctx.textAlign = e.textAlign`, x offset `0 | width/2 | width` per align; the `fit` path (labels) wraps/shrinks via `layoutLabel` measured with the element's own family, so a family change re-wraps labels at render time with no stored-size change.
   - SVG `packages/renderer/src/svg.ts:216-270`: `font-family`, `text-anchor` (`start|middle|end`) and x anchor from `textAlign`.
   - The arrow-label occlusion backing (`text.ts:77-86`) is always centered on `width/2`; correct only because arrow labels are forced center (decision 2).
6. **Labels are never selectable.** `apps/web/src/driver/hitTest.ts:17` skips `containerId !== null` text; Ctrl+A (`shortcuts.ts:211`), clipboard and context menu also filter them out. So today no panel patch can ever reach a label; it must be forwarded from the selected container.
7. **`reconcileBoundText` runs inside every `scene.mutate`** (`packages/scene/src/scene.ts:54`) and currently forces `textAlign: "center"` for both shape and linear labels (`reconcile-bound-text.ts:79-96`). Without changing it, any label align patch is silently reverted in the same mutation.
8. **Only one existing test asserts the forced center:** `packages/scene/test/reconcile-bound-text.test.ts:27` (its fixture is a `newText` default, i.e. `"left"`, bound to a rectangle). All persisted labels were created `"center"` by factories and kept center by reconcile, so preserving the field changes nothing for existing documents.
9. **`TextEditingOverlay` does not set `textAlign`.** `apps/web/src/components/TextEditingOverlay.tsx:108-122` sets `fontFamily: fontFamilyName(el.fontFamily)`, weight, style, size; no `textAlign`.
10. **Style clipboard already carries `fontFamily` and `textAlign`** (`apps/web/src/keyboard/styleClipboard.ts:22-25,53-59`), but the paste (`shortcuts.ts:122-130`) does `replaceElements(scene, (el) => (targets.has(el.id) ? applyStyle(el, clip) : undefined))` with **no re-measure**: pasting a different `fontFamily`/`fontSize` onto free text leaves a stale hit-box (the exact bug the font-size work fixed for the panel). It does not carry `fontWeight`/`fontStyle` (left as is, see Open decisions).
11. **Copy/paste needs nothing.** `packages/scene/src/clone.ts` spreads every field and only remaps ids/`containerId`.
12. **Fonts are not bundled.** No `@font-face` or `next/font` anywhere; `"Caveat"` and `"Cascadia Code"` render only if installed locally, otherwise the generic `cursive` / `monospace` fallback. No network fetch exists or is added.
13. **PDF export maps families to the PDF standard 14 fonts.** `svg2pdf.js@2.8.1` (`dist/svg2pdf.es.js:953-984`): `fontAliases` maps `sans-serif`/`arial`→helvetica, `monospace`→courier, `cursive`→**times**; unknown → times. So in PDF: Normal → Helvetica, Code → Courier, Hand-drawn → Times. `text-anchor` is honored by svg2pdf. This is pre-existing and unchanged by this plan (see Risks).
14. **Test harnesses to reuse:** `packages/ui/test/PropertiesPanel.test.tsx` (`t = key => key`, `handlers` object); `apps/web/test/apply-properties-patch.test.ts` (`fakeMeasure`, `staleText`); `apps/web/test/fontAwareCanvasStub.ts` (`createFontAwareStubContext`: width = chars × px × (Cascadia ? 0.6 : 0.5) × (bold ? 1.2 : 1)); `apps/web/test/keyboard-shortcuts.test.ts` `describe("style clipboard shortcuts")` (line ~328, module-level clipboard, order-dependent); `apps/web/test/i18n-font-size.test.tsx` (`ensureI18n(locale).getFixedT(locale, "common")`); e2e `apps/web/e2e/_helpers.ts` (`parseStoredScene`, `dragOnCanvas`), `text-tool.spec.ts` (`clickCanvas`, `freshCanvas`), `shape-labels.spec.ts` (`dblClickCanvas`).

## Global Constraints

- **No new dependencies, font files, `@font-face`, or network font fetches.** Keep `FAMILY_NAMES` in `text-metrics.ts` unchanged.
- **No persistence change.** Do not bump `SCENE_FORMAT_VERSION`, do not add a migration.
- **Bound labels are never measured.** Forwarded label patches go through `applyPropertiesPatch`, whose `containerId !== null` guard returns a plain merge; the measurer must not be invoked for a label (`TextEditingOverlay`'s "no getContext for bound labels" test must still pass).
- **Only text-style keys reach labels:** exactly `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `textAlign`. A container's `strokeColor`/`opacity`/etc. patch must not touch its label.
- **Arrow/line labels stay centered:** reconcile keeps forcing `textAlign: "center"` on the linear branch; the panel hides the align row whenever an `arrow` or `line` is selected.
- **Shape labels keep forced `verticalAlign: "middle"`** and the inner box; only `textAlign` is released.
- **Do not touch frame names**, the StatsPanel `onChange`, or `styleClipboard.ts` field lists.
- **`labelElements` is optional and defaults to `[]`**, so every existing `PropertiesPanel` test and caller is unchanged.
- TDD: write the failing test first, run the exact command, confirm the stated failure, then implement.
- Commit after each task with the exact subject given. Trailer: `Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>` — each commit credits whichever model actually wrote it.
- Test commands:
  - `pnpm --filter @excalidraw-clone/scene exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/renderer exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Before any Playwright run, make sure nothing else listens on port 3000 (`ss -ltnp | grep :3000`); `reuseExistingServer: true` would silently test another checkout.

  Full gate: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`, or `pnpm turbo run build lint typecheck test --force` if lint output cites another worktree's paths.

- Lint is `typescript-eslint` `recommendedTypeChecked` + `import-x`: `import type` for type-only imports, relative imports alphabetical by path, no floating promises.
- `noUncheckedIndexedAccess` is on: use `!` / guards on indexed reads in tests.

## Review Focus

Most likely failure modes, most likely first, each pinned by a named test:

1. **Label align patch silently reverted by reconcile** (forgot Task 1, or released it on the linear branch too).
   - Task 1: "keeps a shape label's own textAlign" and "still forces an arrow label to center"; Task 7 e2e "a labelled rectangle's label takes font family and alignment from the panel".
2. **Container patch leaks to its label** (e.g. a rectangle's `strokeColor` recolors the label) or a label patch hits labels of **unselected** containers.
   - Task 2: "does not forward non-text keys to a label" and "leaves labels of unselected containers alone".
3. **A label gets measured / resized by the forward path** (overwriting reconcile's inner box).
   - Task 2: "forwards text-style keys to a selected container's label without measuring it" (measure mock not called, width/height unchanged).
4. **Stale free-text hit-box after a family change** via the panel (existing, must stay green) or via style-clipboard paste (new fix).
   - Existing `apply-properties-patch.test.ts`; Task 6 "Ctrl+Alt+V re-measures a free text whose font family changes"; Task 7 e2e width assertion.
5. **Panel shows wrong pressed state for labels** (reads the container instead of the label) or shows the Text section for an unlabelled shape.
   - Task 3: "marks the label's font family and alignment as pressed for a labelled shape", existing "hides the Text section for a mixed text + shape selection".
6. **Align row offered for arrow labels.**
   - Task 3: "hides the align row when an arrow is selected".

---

### Task 1: Shape labels keep their own `textAlign` in `reconcileBoundText`

**Files:**

- Modify: `packages/scene/src/reconcile-bound-text.ts`
- Test: `packages/scene/test/reconcile-bound-text.test.ts`
- Test: `packages/renderer/test/svg.test.ts`

**Interfaces:** Produces the invariant "a shape label's `textAlign` survives every mutation". Consumed by Tasks 2, 3, 7.

- [ ] **Step 1: Write the failing tests**

In `packages/scene/test/reconcile-bound-text.test.ts`:

1. Change the import line to add `newArrow`:

```ts
import { newArrow, newRectangle, newText, newTriangle } from "../src/factories"
```

2. In the first test ("sizes bound text to container box minus padding and centers it"), rename it to `"sizes bound text to container box minus padding and middle-aligns it"` and replace

```ts
expect(t.textAlign).toBe("center")
```

with

```ts
expect(t.textAlign).toBe("left") // shape labels keep their own textAlign
```

3. Add inside the `describe`:

```ts
it("keeps a shape label's own textAlign", () => {
  const text = newText({ x: 0, y: 0, text: "hi", containerId: "C", textAlign: "right" })
  const container = {
    ...newRectangle({ x: 0, y: 0, width: 100, height: 60 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  const draft: ExcalidrawElement[] = [container, text]
  reconcileBoundText(draft)
  const t = draft.find((e) => e.id === text.id)!
  expect(t.type === "text" && t.textAlign).toBe("right")
  expect(t.type === "text" && t.verticalAlign).toBe("middle")
})

it("still forces an arrow label to center", () => {
  const text = newText({ x: 0, y: 0, text: "hi", containerId: "A", textAlign: "left" })
  const arrow = {
    ...newArrow({ x: 0, y: 0, width: 100, height: 0 }),
    id: "A",
    points: [
      [0, 0],
      [100, 0],
    ] as const,
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  const draft: ExcalidrawElement[] = [arrow, text]
  reconcileBoundText(draft)
  const t = draft.find((e) => e.id === text.id)!
  expect(t.type === "text" && t.textAlign).toBe("center")
})
```

(If `newArrow`'s input type rejects `width`/`height` or `points` as written, mirror whatever `packages/scene/test/elbow-reconcile.test.ts` does to build an arrow with points; the assertion is what matters.)

In `packages/renderer/test/svg.test.ts`, next to "emits no backing rect for a shape label", add (pins that a non-center label renders with the right anchor; no renderer code change expected):

```ts
it("anchors a right-aligned shape label at the end of its box", () => {
  const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
  const label = {
    ...newText({ x: 8, y: 8, width: 84, height: 64, text: "box", textAlign: "right" }),
    containerId: rect.id,
  }
  const scene = new Scene([
    { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  ])
  const svg = renderToSVG(scene, { measure: stubMeasure })
  expect(svg).toContain('text-anchor="end"')
  expect(svg).toContain('x="84"')
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/scene exec vitest run test/reconcile-bound-text.test.ts`
Expected: FAIL — "keeps a shape label's own textAlign" gets `"center"`; the renamed first test gets `"center"` instead of `"left"`. "still forces an arrow label to center" passes already.

Run: `pnpm --filter @excalidraw-clone/renderer exec vitest run test/svg.test.ts`
Expected: PASS (renderer already honors `textAlign`; this is a regression pin).

- [ ] **Step 3: Implement**

In `packages/scene/src/reconcile-bound-text.ts`, replace the shape-container tail of `reconcileBoundText`:

```ts
const { x, y, width, height } = innerBoxFor(container)
if (
  text.x !== x ||
  text.y !== y ||
  text.width !== width ||
  text.height !== height ||
  text.verticalAlign !== "middle"
) {
  // textAlign is the user's choice for shape labels; only the box and vertical centering are owned here.
  draft[ti] = { ...text, x, y, width, height, verticalAlign: "middle" }
}
```

Leave the arrow/line branch unchanged. Update the JSDoc sentence "each non-deleted shape container keeps its bound text sized to the shape-aware inner label box and center/middle aligned" to "…sized to the shape-aware inner label box and vertically centered (its textAlign is left to the user)".

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/scene exec vitest run`
Expected: PASS (whole scene package, including `labels.test.ts` and `factories.test.ts`, which assert factory defaults, not reconcile).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/reconcile-bound-text.ts packages/scene/test/reconcile-bound-text.test.ts packages/renderer/test/svg.test.ts
git commit -m "feat(scene): let shape labels keep their own textAlign

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 2: Forward text-style patches to selected containers' labels

**Files:**

- Modify: `apps/web/src/driver/applyPropertiesPatch.ts`
- Modify: `apps/web/src/components/App.tsx` (PropertiesPanel `onChange`, ~line 475)
- Test: `apps/web/test/apply-properties-patch.test.ts`

**Interfaces:**

- Consumes: `applyPropertiesPatch`, `Measurer` (same file).
- Produces: `applySelectionPatch(el: ExcalidrawElement, patch: Partial<ExcalidrawElement>, selectedIds: readonly string[], measure?: Measurer): ExcalidrawElement | undefined` — `undefined` means "leave untouched", matching `replaceElements`' callback contract.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/apply-properties-patch.test.ts`, change the import to:

```ts
import {
  applyPropertiesPatch,
  applySelectionPatch,
  type Measurer,
} from "../src/driver/applyPropertiesPatch"
```

Append:

```ts
describe("applySelectionPatch", () => {
  const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 60 }), id: "R" }
  const label = { ...newLabelFor(rect), width: 7, height: 9 }

  it("patches a selected element like applyPropertiesPatch", () => {
    const measure = fakeMeasure()
    const out = applySelectionPatch(staleText({ id: "T" }), { fontSize: 36 }, ["T"], measure)
    expect(out).toEqual(applyPropertiesPatch(staleText({ id: "T" }), { fontSize: 36 }, measure))
  })

  it("forwards text-style keys to a selected container's label without measuring it", () => {
    const measure = fakeMeasure()
    const out = applySelectionPatch(
      label,
      { fontFamily: 3, textAlign: "right" },
      ["R"],
      measure,
    ) as ExcalidrawTextElement
    expect(out.fontFamily).toBe(3)
    expect(out.textAlign).toBe("right")
    expect([out.width, out.height]).toEqual([7, 9])
    expect(measure).not.toHaveBeenCalled()
  })

  it("does not forward non-text keys to a label", () => {
    expect(applySelectionPatch(label, { strokeColor: "#e03131" }, ["R"])).toBeUndefined()
  })

  it("leaves labels of unselected containers alone", () => {
    expect(applySelectionPatch(label, { fontFamily: 3 }, ["OTHER"])).toBeUndefined()
  })

  it("leaves unselected non-label elements alone", () => {
    expect(applySelectionPatch(rect, { fontFamily: 3 }, ["OTHER"])).toBeUndefined()
  })
})
```

(`newLabelFor(rect)` sets `containerId: "R"`; `staleText` takes overrides including `id`.)

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/apply-properties-patch.test.ts`
Expected: FAIL — `applySelectionPatch` is not exported (typecheck/import error or `is not a function`).

- [ ] **Step 3: Implement**

Append to `apps/web/src/driver/applyPropertiesPatch.ts`:

```ts
/** Patch keys a selected container forwards to its bound label. */
const LABEL_KEYS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "textAlign"] as const

/** One element's result for a PropertiesPanel patch over the selection, or
 *  undefined to leave it untouched. Selected elements get the full patch.
 *  Labels are not selectable, so a selected container passes the text-style
 *  part of the patch on to its bound label (never measured: reconcile owns it). */
export function applySelectionPatch(
  el: ExcalidrawElement,
  patch: Partial<ExcalidrawElement>,
  selectedIds: readonly string[],
  measure: Measurer = measureStandaloneText,
): ExcalidrawElement | undefined {
  if (selectedIds.includes(el.id)) return applyPropertiesPatch(el, patch, measure)
  if (el.type !== "text" || el.containerId === null || !selectedIds.includes(el.containerId)) {
    return undefined
  }
  const labelPatch = Object.fromEntries(
    LABEL_KEYS.filter((key) => key in patch).map((key) => [key, patch[key as keyof typeof patch]]),
  ) as Partial<ExcalidrawElement>
  return Object.keys(labelPatch).length > 0
    ? applyPropertiesPatch(el, labelPatch, measure)
    : undefined
}
```

In `apps/web/src/components/App.tsx`, change the import `import { applyPropertiesPatch } from "../driver/applyPropertiesPatch"` to `import { applySelectionPatch } from "../driver/applyPropertiesPatch"` (confirm `applyPropertiesPatch` has no other use in App.tsx first: `grep -n applyPropertiesPatch apps/web/src/components/App.tsx`), and replace the PropertiesPanel `onChange` body:

```tsx
              onChange={(patch) =>
                replaceElements(scene, (el) => applySelectionPatch(el, patch, selectedIds))
              }
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/apply-properties-patch.test.ts test/TextEditingOverlay.test.tsx`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/applyPropertiesPatch.ts apps/web/src/components/App.tsx apps/web/test/apply-properties-patch.test.ts
git commit -m "feat(web): forward text-style patches to selected shapes' labels

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 3: PropertiesPanel — Text section for labels + Text-align row

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`
- Modify: `apps/web/src/components/App.tsx` (compute + pass `labelElements`)
- Test: `packages/ui/test/PropertiesPanel.test.tsx`

**Interfaces:**

- Consumes: Task 2's forwarding (App).
- Produces: prop `labelElements?: readonly ExcalidrawTextElement[]`; buttons `data-testid="text-align-left" | "text-align-center" | "text-align-right"` in a `role="group"` with `aria-label={t("properties.textAlign")}`; clicking emits `onChange({ textAlign })`. Labels `t("properties.textAlign_left|center|right")`. Task 4 adds the locale strings; Task 7 drives the testids.

- [ ] **Step 1: Write the failing tests**

In `packages/ui/test/PropertiesPanel.test.tsx`, add `newLabelFor` to the scene import:

```ts
import { newArrow, newLabelFor, newLine, newRectangle, newText } from "@excalidraw-clone/scene"
```

Add after "hides the Text section for a mixed text + shape selection":

```ts
  it("shows the Text section for a labelled shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = { ...newLabelFor(rect), text: "hi" }
    render(
      <PropertiesPanel t={t} selectedElements={[rect]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-1")).toBeInTheDocument()
    expect(screen.getByTestId("text-align-center")).toBeInTheDocument()
  })

  it("marks the label's font family and alignment as pressed for a labelled shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = { ...newLabelFor(rect), text: "hi", fontFamily: 3 as const, textAlign: "right" as const }
    render(
      <PropertiesPanel t={t} selectedElements={[rect]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-3")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("text-align-right")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("text-align-center")).toHaveAttribute("aria-pressed", "false")
  })

  it.each(["left", "center", "right"] as const)(
    "emits onChange({ textAlign: %s }) from its labelled button",
    async (align) => {
      const el = newText({ x: 0, y: 0, text: "a" })
      const onChange = vi.fn()
      render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
      const button = screen.getByTestId(`text-align-${align}`)
      expect(button).toHaveTextContent(`properties.textAlign_${align}`)
      await userEvent.click(button)
      expect(onChange).toHaveBeenCalledWith({ textAlign: align })
    },
  )

  it("groups the align buttons under an accessible label", () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByRole("group", { name: "properties.textAlign" })).toBeInTheDocument()
  })

  it("hides the align row when an arrow is selected", () => {
    const arrow = newArrow({ x: 0, y: 0, width: 100, height: 0 })
    const label = { ...newText({ x: 0, y: 0, text: "hi" }), containerId: arrow.id }
    render(
      <PropertiesPanel t={t} selectedElements={[arrow]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-1")).toBeInTheDocument()
    expect(screen.queryByTestId("text-align-left")).toBeNull()
  })
```

(Match `newArrow`'s actual input shape as used elsewhere in this test file.)

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/PropertiesPanel.test.tsx`
Expected: FAIL — no `labelElements` prop (typecheck in IDE; at runtime the labelled-shape tests find no `font-family-1`), no `text-align-*` buttons.

- [ ] **Step 3: Implement**

In `packages/ui/src/PropertiesPanel.tsx`:

1. Add `ExcalidrawTextElement` and `TextAlign` to the type import from `@excalidraw-clone/scene` (both are exported there; `TextAlign` is used by `factories.ts`). If `TextAlign` is not re-exported from the package index, use `ExcalidrawTextElement["textAlign"]` instead.
2. Below `FONT_SIZES` add:

```ts
const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"]
```

3. Add to `PropertiesPanelProps`:

```ts
  /** Bound labels of the selected containers (labels are not selectable). */
  labelElements?: readonly ExcalidrawTextElement[]
```

and destructure `labelElements = [],` in the component signature.

4. Replace

```ts
const allText = selectedElements.every((e) => e.type === "text")
const textElements = selectedElements.flatMap((e) => (e.type === "text" ? [e] : []))
```

with

```ts
const labelled = new Set(labelElements.map((l) => l.containerId))
// Text section: every selected element is text or carries a bound label.
const allText = selectedElements.every((e) => e.type === "text" || labelled.has(e.id))
const textElements = [
  ...selectedElements.flatMap((e) => (e.type === "text" ? [e] : [])),
  ...labelElements,
]
// Arrow/line labels are zero-width and always centered.
const canAlignText = !selectedElements.some((e) => e.type === "arrow" || e.type === "line")
```

(`isBold`/`isItalic` already read `textElements`, so they now include labels.)

5. Give `row` an optional source so text rows read the text targets:

```ts
  const row = <V,>(
    field: string,
    items: readonly (readonly [value: V, testId: string, label: React.ReactNode])[],
    group?: string,
    from: readonly object[] = selectedElements,
  ): React.ReactElement => {
    const current = commonValue<V>(from, field)
```

(replacing `const current = common<V>(field)`).

6. In the Text section pass `textElements` as the 4th argument to the `fontFamily` and `fontSize` rows, and add the align row after the font-size row:

```tsx
{
  canAlignText &&
    row(
      "textAlign",
      TEXT_ALIGNS.map((a) => [a, `text-align-${a}`, t(`properties.textAlign_${a}`)]),
      t("properties.textAlign"),
      textElements,
    )
}
```

In `apps/web/src/components/App.tsx`, next to the `selectedElements` memo (~line 272):

```ts
const selectedLabels = useMemo(() => {
  const ids = new Set(selectedIds)
  return scene
    .getElements()
    .filter(
      (e): e is ExcalidrawTextElement =>
        e.type === "text" && e.containerId !== null && ids.has(e.containerId),
    )
}, [selectedIds, scene, sceneRevision])
```

(add `type ExcalidrawTextElement` to App's existing `@excalidraw-clone/scene` import) and pass `labelElements={selectedLabels}` to `<PropertiesPanel>`.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/ui exec vitest run test/PropertiesPanel.test.tsx`
Expected: PASS, including the unchanged "hides the Text section for a mixed text + shape selection" and "hides the Text section for a non-text selection" (no labels passed).

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/components/App.tsx
git commit -m "feat(ui): text-align row and label text styling in PropertiesPanel

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 4: en/ko locale strings for text align

**Files:**

- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Test: create `apps/web/test/i18n-text-align.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/i18n-text-align.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { ensureI18n } from "../src/i18n"

describe("Text align i18n — en", () => {
  it("resolves the text-align label and options, not raw keys", () => {
    const t = ensureI18n("en").getFixedT("en", "common")
    expect(t("properties.textAlign")).toBe("Text align")
    expect(t("properties.textAlign_left")).toBe("Left")
    expect(t("properties.textAlign_center")).toBe("Center")
    expect(t("properties.textAlign_right")).toBe("Right")
  })
})

describe("Text align i18n — ko", () => {
  it("resolves the text-align label and options, not raw keys", () => {
    const t = ensureI18n("ko").getFixedT("ko", "common")
    expect(t("properties.textAlign")).toBe("텍스트 정렬")
    expect(t("properties.textAlign_left")).toBe("왼쪽")
    expect(t("properties.textAlign_center")).toBe("가운데")
    expect(t("properties.textAlign_right")).toBe("오른쪽")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-text-align.test.tsx`
Expected: FAIL — raw keys returned.

- [ ] **Step 3: Implement**

In both locale files, inside `"properties"`, insert directly after `"fontSize_xl"`:

en:

```json
    "textAlign": "Text align",
    "textAlign_left": "Left",
    "textAlign_center": "Center",
    "textAlign_right": "Right",
```

ko:

```json
    "textAlign": "텍스트 정렬",
    "textAlign_left": "왼쪽",
    "textAlign_center": "가운데",
    "textAlign_right": "오른쪽",
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/i18n-text-align.test.tsx test/i18n-font-size.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/test/i18n-text-align.test.tsx
git commit -m "feat(i18n): en/ko strings for text alignment

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 5: TextEditingOverlay honors `textAlign`

**Files:**

- Modify: `apps/web/src/components/TextEditingOverlay.tsx`
- Test: `apps/web/test/TextEditingOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

After "styles the textarea with the element's font family, weight, and style":

```tsx
it("aligns the textarea like the element", async () => {
  const scene = new Scene()
  const text = newText({ x: 10, y: 10, text: "a\nlonger", textAlign: "right" })
  scene.mutate((d) => d.push(text))
  useAppStore.getState().setTextEditElementId(text.id)

  const { container } = renderOverlay(scene)
  const textarea = await focusedTextarea(container)

  expect(textarea.style.textAlign).toBe("right")
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/TextEditingOverlay.test.tsx`
Expected: FAIL — `textAlign` is `""`.

- [ ] **Step 3: Implement**

In the textarea `style` object, after `fontStyle: el.fontStyle ?? "normal",` add:

```ts
        textAlign: el.textAlign,
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/TextEditingOverlay.test.tsx`
Expected: PASS (including "does not measure a bound label").

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/TextEditingOverlay.tsx apps/web/test/TextEditingOverlay.test.tsx
git commit -m "feat(web): text editor overlay follows the element's alignment

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 6: Style-clipboard paste re-measures free text

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts` (~line 129)
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (`describe("style clipboard shortcuts")`)

- [ ] **Step 1: Write the failing test**

Add `import { createFontAwareStubContext } from "./fontAwareCanvasStub"` (after the `../src/store` import) and `type ExcalidrawTextElement` to the scene import. Append this test at the **end** of `describe("style clipboard shortcuts")` (the clipboard is module-level and order-dependent; appending keeps earlier tests' assumptions):

```ts
it("Ctrl+Alt+V re-measures a free text whose font family changes", () => {
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => createFontAwareStubContext())
  try {
    const source = newText({ x: 0, y: 0, text: "src", fontFamily: 3, fontSize: 20 })
    const target = {
      ...newText({ x: 0, y: 50, text: "hello", fontFamily: 1, fontSize: 20 }),
      width: 1,
      height: 1,
    }
    scene.mutate((draft) => {
      draft.push(source, target)
    })
    useAppStore.getState().setSelection([source.id])
    copy()
    useAppStore.getState().setSelection([target.id])
    paste()
    const out = scene.getElements().find((e) => e.id === target.id) as ExcalidrawTextElement
    expect(out.fontFamily).toBe(3)
    // stub: 5 chars × 20px × 0.6 (Cascadia) = 60
    expect(out.width).toBe(60)
  } finally {
    getContextSpy.mockRestore()
  }
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/keyboard-shortcuts.test.ts`
Expected: FAIL — width stays `1`.

- [ ] **Step 3: Implement**

In `apps/web/src/keyboard/shortcuts.ts` add `import { applyPropertiesPatch } from "../driver/applyPropertiesPatch"` (sorts before `../driver/patchScene`) and change the paste line to:

```ts
replaceElements(scene, (el) =>
  targets.has(el.id) ? applyPropertiesPatch(el, applyStyle(el, clip)) : undefined,
)
```

(`applyStyle` returns the restyled element; passing it as the patch makes `applyPropertiesPatch` re-measure free text when it carries font keys and plain-merge everything else.)

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @excalidraw-clone/web exec vitest run test/keyboard-shortcuts.test.ts test/styleClipboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts
git commit -m "fix(web): re-measure free text when pasting a style that changes its font

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 7: e2e — free text and shape label styling

**Files:**

- Create: `apps/web/e2e/text-styling.spec.ts`

- [ ] **Step 1: Write the e2e tests**

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type TextEl = {
  id: string
  type: string
  width: number
  text?: string
  fontFamily?: number
  textAlign?: string
  containerId?: string | null
  isDeleted?: boolean
}

const readTexts = async (page: Page): Promise<TextEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<TextEl>(json).elements.filter((e) => e.type === "text" && !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
}

const canvasPoint = async (page: Page, at: { x: number; y: number }) => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + at.x, y: box.y + at.y }
}

test("free text takes font family (re-measured) and alignment from the panel", async ({ page }) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-text"]').click()
  const p = await canvasPoint(page, { x: 200, y: 200 })
  await page.mouse.click(p.x, p.y)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello world")
  await editor.blur()
  await expect(editor).toHaveCount(0)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.waitForTimeout(900)
  const before = (await readTexts(page))[0]!

  await page.locator('[data-testid="font-family-3"]').click()
  await page.locator('[data-testid="text-align-right"]').click()
  await expect(page.locator('[data-testid="font-family-3"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.locator('[data-testid="text-align-right"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.waitForTimeout(900)
  const after = (await readTexts(page))[0]!
  expect(after.fontFamily).toBe(3)
  expect(after.textAlign).toBe("right")
  // monospace fallback measures differently from the hand-drawn (cursive) fallback
  expect(after.width).not.toBe(before.width)
  expect(after.width).toBeGreaterThan(0)
})

test("a labelled rectangle's label takes font family and alignment from the panel", async ({
  page,
}) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 200 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  const mid = await canvasPoint(page, { x: 200, y: 150 })
  await page.mouse.dblclick(mid.x, mid.y)
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Hi")
  await page.mouse.click(500, 400)
  await expect(textarea).toHaveCount(0)

  // Ctrl/Cmd+A selects the rectangle (labels are filtered out of selection).
  await page.keyboard.press("ControlOrMeta+a")
  await expect(page.locator('[data-testid="text-align-center"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.locator('[data-testid="font-family-3"]').click()
  await page.locator('[data-testid="text-align-left"]').click()
  await expect(page.locator('[data-testid="text-align-left"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.waitForTimeout(900)
  let label = (await readTexts(page))[0]!
  expect(label.containerId).not.toBeNull()
  expect(label.fontFamily).toBe(3)
  expect(label.textAlign).toBe("left")

  // survives reload (and the reconcile that runs on every later mutation)
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
  label = (await readTexts(page))[0]!
  expect(label.textAlign).toBe("left")
})
```

- [ ] **Step 2: Run**

Run: `ss -ltnp | grep :3000` (must be empty), then `pnpm --filter @excalidraw-clone/web exec playwright test e2e/text-styling.spec.ts`
Expected: PASS (Tasks 1-6 are in). If the width assertion is flaky because both fallbacks resolve to the same metrics in CI Chromium, replace `"hello world"` with `"iiiiiiii"` (proportional vs monospace differ strongly) rather than deleting the assertion.

- [ ] **Step 3: Run the neighbouring specs**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/text-tool.spec.ts e2e/shape-labels.spec.ts e2e/arrow-labels.spec.ts e2e/style-clipboard.spec.ts e2e/sticky-note.spec.ts e2e/templates.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/text-styling.spec.ts
git commit -m "test(e2e): font family and alignment for free text and shape labels

Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>"
```

---

### Task 8: Full gate

- [ ] **Step 1:** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` (or `pnpm turbo run build lint typecheck test --force` if lint cites another worktree). Expected: all green.
- [ ] **Step 2:** `ss -ltnp | grep :3000` empty, then `pnpm --filter @excalidraw-clone/web e2e` (full Playwright suite). Expected: all green; `export.spec.ts` PDF tests unchanged.
- [ ] **Step 3:** `git log --oneline -8` shows the seven task commits; `git status` clean. No commit for this task unless a gate fix was needed (then `fix: <what>` with the trailer).

---

## Open decisions / risks for the human

1. **PDF fonts (pre-existing, unchanged):** jsPDF has only the standard 14 fonts and svg2pdf maps `cursive` → Times. Hand-drawn text exports to PDF in **Times**; Normal → Helvetica, Code → Courier. Alignment survives (svg2pdf honors `text-anchor`), but widths differ from the canvas, so wrapped/shrunk label layout can look slightly off in PDF. A faithful hand-drawn PDF needs an embedded TTF (`pdf.addFileToVFS`/`addFont`) — i.e. bundling a font file (license + ~100KB+), which this plan deliberately does not do.
2. **Fonts are not bundled at all (pre-existing):** "Caveat"/"Cascadia Code" render only if installed; otherwise generic `cursive`/`monospace`. Measured widths therefore differ per machine, and a doc's stored free-text widths can be stale when opened elsewhere. Bundling Caveat via `@font-face` (local file, no network) would fix both canvas and consistency but is a new asset; not done here.
3. **Arrow/line labels: family yes, align no** (decision 2). If wanted, linear labels would need a real measured width and an align-aware occlusion rect.
4. **Frame names not styleable** (decision 3).
5. **Style clipboard still omits `fontWeight`/`fontStyle`, and pasting a text style onto a labelled shape does not restyle its label.** Left as is to keep scope; both are small follow-ups (`styleClipboard.ts` field list; `applySelectionPatch`-style forwarding in the paste).
6. **Overlay for bound labels:** the textarea has no fixed width, so `textAlign` only visibly matters for multi-line editing; the rendered label is correct regardless.
