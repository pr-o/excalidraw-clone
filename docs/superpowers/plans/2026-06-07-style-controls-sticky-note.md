# Style Controls + Sticky Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface three latent style fields (stroke style, fill style, edge roundness) into the PropertiesPanel + renderer, and add a `note` (sticky note) tool backed by a minimal bound-text-in-container subsystem.

**Architecture:** Style controls are new `PropertiesPanel` toggle rows that call `onChange` on the selection (existing plumbing); the renderer gains `strokeLineDash` options and a rounded-rect path. The sticky note is two linked elements (a rounded yellow rectangle container + a bound text child) kept in sync by one pure function, `reconcileBoundText`, called inside `Scene.mutate` — so move/resize/delete cascade for free.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, rough.js (canvas), React (UI package), Playwright (e2e). Per-package tests: `pnpm --filter <pkg> test`.

**Spec:** `docs/superpowers/specs/2026-06-07-style-controls-sticky-note-design.md`

**Conventions verified in this codebase:**

- Element factories live in `packages/scene/src/factories.ts`; every element carries `strokeStyle`, `fillStyle`, `roundness`, `boundElements`. Text carries `containerId`.
- `Scene.mutate(fn)` (`packages/scene/src/scene.ts:49`) is the single mutation chokepoint: `const draft=[...elements]; fn(draft); setElements(draft)`. `normalize.ts` is the precedent for a post-mutation pass.
- Tool reducers return `[state, effects]`; effects of kind `mutation | select | switchTool | startTextEdit` are honored by `apps/web/src/driver/effects.ts`.
- Tool unit tests use helpers from `packages/tools/test/test-utils.ts` (`makeCtx`, `point`, `applyMutation`, `withModifiers`). `applyMutation` runs `eff.apply(draft)` directly (does NOT go through `Scene`, so `reconcileBoundText` does NOT run in tool tests — assert tool effects there, assert reconcile behavior in scene tests).

---

## Phase A — Style controls

### Task 1: Renderer honors `strokeStyle` (dashed/dotted)

**Files:**

- Create: `packages/renderer/src/shapes/stroke-dash.ts`
- Modify: `packages/renderer/src/shapes/rectangle.ts`, `ellipse.ts`, `diamond.ts`, `line.ts`, `arrow.ts`
- Test: `packages/renderer/test/stroke-dash.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/test/stroke-dash.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { strokeLineDash } from "../src/shapes/stroke-dash"

describe("strokeLineDash", () => {
  it("solid → no dashes", () => {
    expect(strokeLineDash("solid")).toEqual([])
  })
  it("dashed → [8,8]", () => {
    expect(strokeLineDash("dashed")).toEqual([8, 8])
  })
  it("dotted → [2,6]", () => {
    expect(strokeLineDash("dotted")).toEqual([2, 6])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test stroke-dash`
Expected: FAIL — cannot resolve `../src/shapes/stroke-dash`.

- [ ] **Step 3: Create the shared helper**

Create `packages/renderer/src/shapes/stroke-dash.ts`:

```ts
import type { StrokeStyle } from "@excalidraw-clone/scene"

/** rough.js `strokeLineDash` pattern for each stroke style. */
export const strokeLineDash = (style: StrokeStyle): number[] => {
  switch (style) {
    case "dashed":
      return [8, 8]
    case "dotted":
      return [2, 6]
    default:
      return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer test stroke-dash`
Expected: PASS (3 tests).

- [ ] **Step 5: Apply dash to all shape option builders**

In `packages/renderer/src/shapes/rectangle.ts`, add the import and a `strokeLineDash` entry to the `opts` object in `rectangleOptions`:

```ts
import { strokeLineDash } from "./stroke-dash"
```

```ts
const opts: Options = {
  stroke: e.strokeColor,
  strokeWidth: e.strokeWidth,
  fillStyle: e.fillStyle,
  roughness: e.roughness,
  seed: e.seed,
  strokeLineDash: strokeLineDash(e.strokeStyle),
}
```

Apply the identical change (import + `strokeLineDash: strokeLineDash(e.strokeStyle)` line) to `ellipseOptions` in `ellipse.ts`, `diamondOptions` in `diamond.ts`, `linearOptions` in `line.ts`, and `arrowOptions` in `arrow.ts`. (`arrowOptions` returns an object literal directly — add the same property.)

- [ ] **Step 6: Add an options assertion test**

Append to `packages/renderer/test/stroke-dash.test.ts`:

```ts
import { newRectangle } from "@excalidraw-clone/scene"
import { rectangleOptions } from "../src/shapes/rectangle"

describe("shape options carry strokeLineDash", () => {
  it("dashed rectangle passes [8,8]", () => {
    const r = {
      ...newRectangle({ x: 0, y: 0, width: 5, height: 5 }),
      strokeStyle: "dashed" as const,
    }
    expect(rectangleOptions(r).strokeLineDash).toEqual([8, 8])
  })
  it("solid rectangle passes []", () => {
    const r = newRectangle({ x: 0, y: 0, width: 5, height: 5 })
    expect(rectangleOptions(r).strokeLineDash).toEqual([])
  })
})
```

- [ ] **Step 7: Run renderer tests**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS (all renderer tests, including the new ones).

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/shapes/stroke-dash.ts packages/renderer/src/shapes/*.ts packages/renderer/test/stroke-dash.test.ts
git commit -m "renderer: honor strokeStyle via rough strokeLineDash"
```

---

### Task 2: Renderer draws rounded rectangles

**Files:**

- Modify: `packages/renderer/src/shapes/rectangle.ts`
- Test: `packages/renderer/test/shapes-rectangle.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/renderer/test/shapes-rectangle.test.ts`:

```ts
import { RoughGenerator } from "roughjs/bin/generator"

describe("rectangleShape roundness", () => {
  it("sharp (roundness null) calls gen.rectangle", () => {
    const gen = new RoughGenerator()
    const rectSpy = vi.spyOn(gen, "rectangle")
    const pathSpy = vi.spyOn(gen, "path")
    const r = newRectangle({ x: 0, y: 0, width: 30, height: 20 })
    rectangleShape(r, gen)
    expect(rectSpy).toHaveBeenCalledOnce()
    expect(pathSpy).not.toHaveBeenCalled()
  })

  it("round (roundness {type:1}) calls gen.path instead", () => {
    const gen = new RoughGenerator()
    const rectSpy = vi.spyOn(gen, "rectangle")
    const pathSpy = vi.spyOn(gen, "path")
    const r = {
      ...newRectangle({ x: 0, y: 0, width: 30, height: 20 }),
      roundness: { type: 1 as const },
    }
    rectangleShape(r, gen)
    expect(pathSpy).toHaveBeenCalledOnce()
    expect(rectSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test shapes-rectangle`
Expected: FAIL — round case still calls `gen.rectangle`.

- [ ] **Step 3: Implement rounded path branch**

Replace the body of `rectangleShape` in `packages/renderer/src/shapes/rectangle.ts`:

```ts
export const rectangleShape = (
  e: ExcalidrawRectangleElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  if (e.roundness === null) {
    return [gen.rectangle(0, 0, e.width, e.height, rectangleOptions(e))]
  }
  const w = e.width
  const h = e.height
  const r = Math.min(Math.min(w, h) * 0.25, 32)
  const path =
    `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} ` +
    `L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} ` +
    `L ${r} ${h} Q 0 ${h} 0 ${h - r} ` +
    `L 0 ${r} Q 0 0 ${r} 0 Z`
  return [gen.path(path, rectangleOptions(e))]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer test shapes-rectangle`
Expected: PASS.

- [ ] **Step 5: Run full renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/shapes/rectangle.ts packages/renderer/test/shapes-rectangle.test.ts
git commit -m "renderer: draw rounded rectangles when roundness is set"
```

---

### Task 3: PropertiesPanel style rows (stroke style, fill style, roundness)

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Test: `packages/ui/test/PropertiesPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/test/PropertiesPanel.test.tsx` (inside the top-level `describe("PropertiesPanel", ...)` block):

```ts
  it("emits onChange({ strokeStyle }) when a stroke-style button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("stroke-style-dashed"))
    expect(onChange).toHaveBeenCalledWith({ strokeStyle: "dashed" })
  })

  it("emits onChange({ fillStyle }) when a fill-style button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("fill-style-cross-hatch"))
    expect(onChange).toHaveBeenCalledWith({ fillStyle: "cross-hatch" })
  })

  it("emits onChange({ roundness }) when a roundness button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("roundness-round"))
    expect(onChange).toHaveBeenCalledWith({ roundness: { type: 1 } })
  })

  it("mixed strokeStyle selection shows no pressed style button", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeStyle: "solid" as const }
    const b = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeStyle: "dashed" as const }
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("stroke-style-solid")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("stroke-style-dashed")).toHaveAttribute("aria-pressed", "false")
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test PropertiesPanel`
Expected: FAIL — testids `stroke-style-*` etc. not found.

- [ ] **Step 3: Add the three rows to PropertiesPanel**

In `packages/ui/src/PropertiesPanel.tsx`:

Extend the import to include the style types:

```ts
import type {
  ExcalidrawElement,
  FillStyle,
  Roundness,
  StrokeStyle,
  StrokeWidth,
} from "@excalidraw-clone/scene"
```

Add option constants near `STROKE_WIDTHS`:

```ts
const STROKE_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"]
const FILL_STYLES: readonly FillStyle[] = ["hachure", "cross-hatch", "solid"]
```

Inside the component, after the `strokeWidth` derivation, derive the three values:

```ts
const strokeStyle = commonValue<StrokeStyle>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "strokeStyle",
)
const fillStyle = commonValue<FillStyle>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "fillStyle",
)
const roundness = commonValue<Roundness>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "roundness",
)
const isRound = roundness !== undefined && roundness !== null
```

Add three `<Section>` blocks immediately after the existing `strokeWidth` `<Section>`:

```tsx
      <Section label={t("properties.strokeStyle")}>
        <div className="flex gap-1">
          {STROKE_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`stroke-style-${s}`}
              aria-pressed={strokeStyle === s}
              onClick={() => onChange({ strokeStyle: s })}
              className={`h-8 flex-1 rounded border text-xs ${strokeStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              {t(`properties.strokeStyle_${s}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section label={t("properties.fillStyle")}>
        <div className="flex gap-1">
          {FILL_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`fill-style-${s}`}
              aria-pressed={fillStyle === s}
              onClick={() => onChange({ fillStyle: s })}
              className={`h-8 flex-1 rounded border text-xs ${fillStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
            >
              {t(`properties.fillStyle_${s}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section label={t("properties.roundness")}>
        <div className="flex gap-1">
          <button
            type="button"
            data-testid="roundness-sharp"
            aria-pressed={roundness !== undefined && !isRound}
            onClick={() => onChange({ roundness: null })}
            className={`h-8 flex-1 rounded border text-xs ${roundness !== undefined && !isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
          >
            {t("properties.roundness_sharp")}
          </button>
          <button
            type="button"
            data-testid="roundness-round"
            aria-pressed={isRound}
            onClick={() => onChange({ roundness: { type: 1 } })}
            className={`h-8 flex-1 rounded border text-xs ${isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
          >
            {t("properties.roundness_round")}
          </button>
        </div>
      </Section>
```

- [ ] **Step 4: Add i18n keys (en)**

In `apps/web/src/locales/en/common.json`, inside the `"properties"` object (after `"strokeWidth"`), add:

```json
    "strokeStyle": "Stroke style",
    "strokeStyle_solid": "Solid",
    "strokeStyle_dashed": "Dashed",
    "strokeStyle_dotted": "Dotted",
    "fillStyle": "Fill style",
    "fillStyle_hachure": "Hachure",
    "fillStyle_cross-hatch": "Cross",
    "fillStyle_solid": "Solid",
    "roundness": "Edges",
    "roundness_sharp": "Sharp",
    "roundness_round": "Round",
```

- [ ] **Step 5: Add i18n keys (ko)**

In `apps/web/src/locales/ko/common.json`, inside the `"properties"` object (after `"strokeWidth"`), add:

```json
    "strokeStyle": "선 스타일",
    "strokeStyle_solid": "실선",
    "strokeStyle_dashed": "파선",
    "strokeStyle_dotted": "점선",
    "fillStyle": "채움 스타일",
    "fillStyle_hachure": "빗금",
    "fillStyle_cross-hatch": "교차",
    "fillStyle_solid": "단색",
    "roundness": "모서리",
    "roundness_sharp": "각진",
    "roundness_round": "둥근",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test PropertiesPanel`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx packages/ui/test/PropertiesPanel.test.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "ui: PropertiesPanel rows for stroke style, fill style, roundness"
```

---

## Phase B — Bound-text subsystem

### Task 4: `reconcileBoundText` pure function

**Files:**

- Create: `packages/scene/src/reconcile-bound-text.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/test/reconcile-bound-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/reconcile-bound-text.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle, newText } from "../src/factories"
import { NOTE_PADDING, reconcileBoundText } from "../src/reconcile-bound-text"
import type { ExcalidrawElement } from "../src/types"

const makeNotePair = (): { container: ExcalidrawElement; text: ExcalidrawElement } => {
  const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
  const container = {
    ...newRectangle({ x: 100, y: 100, width: 60, height: 40 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  return { container, text }
}

describe("reconcileBoundText", () => {
  it("sizes bound text to container box minus padding and centers it", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft.find((e) => e.id === text.id)!
    expect(t.x).toBe(100 + NOTE_PADDING)
    expect(t.y).toBe(100 + NOTE_PADDING)
    expect(t.width).toBe(60 - 2 * NOTE_PADDING)
    expect(t.height).toBe(40 - 2 * NOTE_PADDING)
    if (t.type === "text") {
      expect(t.textAlign).toBe("center")
      expect(t.verticalAlign).toBe("middle")
    }
  })

  it("marks bound text deleted when its container is deleted", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [{ ...container, isDeleted: true }, text]
    reconcileBoundText(draft)
    expect(draft.find((e) => e.id === text.id)!.isDeleted).toBe(true)
  })

  it("never touches text content", () => {
    const text = newText({ x: 0, y: 0, text: "hello", containerId: "C" })
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft.find((e) => e.id === text.id)!
    if (t.type === "text") expect(t.text).toBe("hello")
  })

  it("is a no-op when there are no bound elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    reconcileBoundText(draft)
    expect(draft[0]).toBe(r)
  })

  it("is idempotent (second pass changes nothing)", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const afterFirst = draft[1]
    reconcileBoundText(draft)
    expect(draft[1]).toBe(afterFirst)
  })

  it("skips a dangling reference whose text is missing", () => {
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      boundElements: [{ id: "missing", type: "text" as const }],
    }
    const draft: ExcalidrawElement[] = [container]
    expect(() => reconcileBoundText(draft)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test reconcile-bound-text`
Expected: FAIL — cannot resolve `../src/reconcile-bound-text`.

- [ ] **Step 3: Implement `reconcileBoundText`**

Create `packages/scene/src/reconcile-bound-text.ts`:

```ts
import type { ExcalidrawElement } from "./types"

/** Padding (px) between a note container's box and its bound text box. */
export const NOTE_PADDING = 8

/**
 * Enforce the container↔bound-text invariant in place on a mutation draft:
 * each non-deleted container with a bound text child keeps that text sized to
 * the container box minus NOTE_PADDING and center/middle aligned; a deleted
 * container cascades isDeleted to its text. Text content is never modified.
 * Idempotent and O(n). Safe to run after every mutation.
 */
export function reconcileBoundText(draft: ExcalidrawElement[]): void {
  for (let i = 0; i < draft.length; i += 1) {
    const container = draft[i]!
    if (!container.boundElements) continue
    const ref = container.boundElements.find((b) => b.type === "text")
    if (!ref) continue
    const ti = draft.findIndex((e) => e.id === ref.id)
    if (ti < 0) continue
    const text = draft[ti]!
    if (text.type !== "text") continue

    if (container.isDeleted) {
      if (!text.isDeleted) draft[ti] = { ...text, isDeleted: true }
      continue
    }

    const x = container.x + NOTE_PADDING
    const y = container.y + NOTE_PADDING
    const width = Math.max(0, container.width - 2 * NOTE_PADDING)
    const height = Math.max(0, container.height - 2 * NOTE_PADDING)
    if (
      text.x !== x ||
      text.y !== y ||
      text.width !== width ||
      text.height !== height ||
      text.textAlign !== "center" ||
      text.verticalAlign !== "middle"
    ) {
      draft[ti] = { ...text, x, y, width, height, textAlign: "center", verticalAlign: "middle" }
    }
  }
}
```

- [ ] **Step 4: Export from the package index**

In `packages/scene/src/index.ts`, add alongside the `normalizeToOrigin` export:

```ts
export { NOTE_PADDING, reconcileBoundText } from "./reconcile-bound-text"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test reconcile-bound-text`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/reconcile-bound-text.ts packages/scene/src/index.ts packages/scene/test/reconcile-bound-text.test.ts
git commit -m "scene: reconcileBoundText keeps bound text glued to its container"
```

---

### Task 5: Wire `reconcileBoundText` into `Scene.mutate`

**Files:**

- Modify: `packages/scene/src/scene.ts`
- Test: `packages/scene/test/scene-bound-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/scene-bound-text.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle, newText } from "../src/factories"
import { NOTE_PADDING } from "../src/reconcile-bound-text"
import { Scene } from "../src/scene"
import type { ExcalidrawElement } from "../src/types"

const notePair = (): ExcalidrawElement[] => {
  const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
  const container = {
    ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  return [container, text]
}

describe("Scene.mutate reconciles bound text", () => {
  it("moving the container moves its bound text", () => {
    const scene = new Scene(notePair())
    scene.mutate((draft) => {
      const c = draft.find((e) => e.id === "C")!
      const i = draft.indexOf(c)
      draft[i] = { ...c, x: c.x + 50, y: c.y + 30 }
    })
    const text = scene.getElements().find((e) => e.type === "text")!
    expect(text.x).toBe(50 + NOTE_PADDING)
    expect(text.y).toBe(30 + NOTE_PADDING)
  })

  it("deleting the container deletes its bound text", () => {
    const scene = new Scene(notePair())
    scene.mutate((draft) => {
      const c = draft.find((e) => e.id === "C")!
      const i = draft.indexOf(c)
      draft[i] = { ...c, isDeleted: true }
    })
    const text = scene.getElementsIncludingDeleted().find((e) => e.type === "text")!
    expect(text.isDeleted).toBe(true)
  })
})
```

(If `Scene`'s constructor or accessor names differ, check `packages/scene/src/scene.ts` and existing `packages/scene/test/*.test.ts` for the exact API — `getElements()` / `getElementsIncludingDeleted()` are used elsewhere in the codebase.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test scene-bound-text`
Expected: FAIL — text does not move / is not deleted (reconcile not wired yet).

- [ ] **Step 3: Call reconcile inside `mutate`**

In `packages/scene/src/scene.ts`, add the import at the top:

```ts
import { reconcileBoundText } from "./reconcile-bound-text"
```

Update the `mutate` method to call it after `fn(draft)`:

```ts
  mutate(fn: (draft: ExcalidrawElement[]) => void, opts?: MutateOptions): void {
    const draft = [...this.elements]
    fn(draft)
    reconcileBoundText(draft)
    this.setElements(draft)
    if (!opts?.skipHistory) this.pushHistory(draft)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test scene-bound-text`
Expected: PASS.

- [ ] **Step 5: Run full scene suite (guard against regressions)**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS (all scene tests).

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/scene.ts packages/scene/test/scene-bound-text.test.ts
git commit -m "scene: run reconcileBoundText on every mutation"
```

---

### Task 6: `newNote` factory (container + bound text)

**Files:**

- Modify: `packages/scene/src/factories.ts`, `packages/scene/src/index.ts`
- Test: `packages/scene/test/factories.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/scene/test/factories.test.ts`:

```ts
import { newNote } from "../src/factories"

describe("newNote", () => {
  it("creates a rounded yellow container bound to a centered text child", () => {
    const { container, text } = newNote({ x: 10, y: 20, width: 60, height: 40 })
    expect(container.type).toBe("rectangle")
    expect(container.backgroundColor).toBe("#ffec99")
    expect(container.roundness).toEqual({ type: 1 })
    expect(container.boundElements).toEqual([{ id: text.id, type: "text" }])
    expect(text.type).toBe("text")
    expect(text.containerId).toBe(container.id)
    expect(text.textAlign).toBe("center")
    expect(text.verticalAlign).toBe("middle")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test factories`
Expected: FAIL — `newNote` is not exported.

- [ ] **Step 3: Implement `newNote`**

In `packages/scene/src/factories.ts`, add the import for the padding constant at the top:

```ts
import { NOTE_PADDING } from "./reconcile-bound-text"
```

Add the factory at the end of the file:

```ts
export interface NewNoteInput {
  x: number
  y: number
  width?: number
  height?: number
}

export const NOTE_BG_COLOR = "#ffec99"

export const newNote = (
  input: NewNoteInput,
): { container: ExcalidrawRectangleElement; text: ExcalidrawTextElement } => {
  const w = input.width ?? 0
  const h = input.height ?? 0
  const text = newText({
    x: input.x + NOTE_PADDING,
    y: input.y + NOTE_PADDING,
    width: Math.max(0, w - 2 * NOTE_PADDING),
    height: Math.max(0, h - 2 * NOTE_PADDING),
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
  })
  const container: ExcalidrawRectangleElement = {
    ...newRectangle({
      x: input.x,
      y: input.y,
      width: w,
      height: h,
      backgroundColor: NOTE_BG_COLOR,
    }),
    roundness: { type: 1 },
    boundElements: [{ id: text.id, type: "text" }],
  }
  return { container, text: { ...text, containerId: container.id } }
}
```

- [ ] **Step 4: Export from the package index**

In `packages/scene/src/index.ts`, add `newNote` (and `NOTE_BG_COLOR`) to the existing factories export line, e.g.:

```ts
export { /* ...existing factory exports..., */ newNote, NOTE_BG_COLOR } from "./factories"
```

(Match the existing export style in that file — it may re-export `*` from `./factories`, in which case no change is needed. Verify before editing.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test factories`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/factories.ts packages/scene/src/index.ts packages/scene/test/factories.test.ts
git commit -m "scene: newNote factory creates linked container + bound text"
```

---

## Phase C — Note tool + integration

### Task 7: `note` tool

**Files:**

- Create: `packages/tools/src/tools/note.ts`
- Modify: `packages/tools/src/types.ts` (add `"note"` to `ToolName`), `packages/tools/src/registry.ts`, `packages/tools/src/index.ts`
- Test: `packages/tools/test/note-tool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/note-tool.test.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { noteTool } from "../src"
import type { NoteState } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("note tool", () => {
  it("pointerDown creates a container + bound text and enters drawing", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const [state, effects] = noteTool.reduce(
      noteTool.initial,
      { type: "pointerDown", at: point(10, 20) },
      ctx,
    )
    applyMutation(effects, draft)
    expect(state.phase).toBe("drawing")
    expect(draft.length).toBe(2)
    const container = draft.find((e) => e.type === "rectangle")!
    const text = draft.find((e) => e.type === "text")!
    expect(container.boundElements).toEqual([{ id: text.id, type: "text" }])
  })

  it("pointerUp with a non-zero box selects the container, switches to selection, and edits the text", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    r = noteTool.reduce(r[0], { type: "pointerMove", at: point(60, 40) }, ctx)
    applyMutation(r[1], draft)
    const up = noteTool.reduce(r[0], { type: "pointerUp", at: point(60, 40) }, ctx)
    applyMutation(up[1], draft)
    const container = draft.find((e) => e.type === "rectangle")!
    const text = draft.find((e) => e.type === "text")!
    expect(up[0].phase).toBe("idle")
    expect(up[1].find((e) => e.kind === "select")).toEqual({ kind: "select", ids: [container.id] })
    expect(up[1].find((e) => e.kind === "switchTool")).toEqual({
      kind: "switchTool",
      tool: "selection",
    })
    const edit = up[1].find((e) => e.kind === "startTextEdit")
    expect(edit).toEqual({ kind: "startTextEdit", elementId: text.id })
  })

  it("pointerUp with a zero-size box discards both elements", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(5, 5) }, ctx)
    applyMutation(r[1], draft)
    const up = noteTool.reduce(r[0], { type: "pointerUp", at: point(5, 5) }, ctx)
    applyMutation(up[1], draft)
    expect(draft.length).toBe(0)
    expect(up[1].some((e) => e.kind === "startTextEdit")).toBe(false)
  })

  it("escape during drawing discards both elements", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    const esc = noteTool.reduce(r[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(draft.length).toBe(0)
    expect(esc[0].phase).toBe("idle")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test note-tool`
Expected: FAIL — `noteTool` / `NoteState` not exported.

- [ ] **Step 3: Add `"note"` to `ToolName`**

In `packages/tools/src/types.ts`, add `| "note"` to the `ToolName` union (place it after `"frame"`):

```ts
export type ToolName =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser"
  | "frame"
  | "image"
  | "note"
```

- [ ] **Step 4: Implement the note tool**

Create `packages/tools/src/tools/note.ts`:

```ts
import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, newNote } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { computeBox } from "./shape"

export type NoteState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; containerId: string; textId: string }

const NOTE_INITIAL: NoteState = { phase: "idle" }

const resizeBox = (
  draft: ExcalidrawElement[],
  id: string,
  box: { x: number; y: number; width: number; height: number },
): void => {
  const i = draft.findIndex((e) => e.id === id)
  if (i >= 0) draft[i] = { ...draft[i]!, ...box }
}

const removeByIds = (draft: ExcalidrawElement[], ids: readonly string[]): void => {
  for (let i = draft.length - 1; i >= 0; i -= 1) {
    if (ids.includes(draft[i]!.id)) draft.splice(i, 1)
  }
}

export const noteTool: Tool<NoteState, ToolEvent> = {
  name: "note",
  initial: NOTE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const { container, text } = newNote({ x: event.at.x, y: event.at.y, width: 0, height: 0 })
        return [
          { phase: "drawing", start: event.at, containerId: container.id, textId: text.id },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(container)
                draft.push(text)
              },
              skipHistory: true,
            },
          ],
        ]
      }
      return [state, []]
    }
    const { start, containerId, textId } = state
    switch (event.type) {
      case "pointerMove": {
        const box = computeBox(start, event.at, ctx.modifiers)
        return [
          state,
          [
            {
              kind: "mutation",
              apply: (draft) => resizeBox(draft, containerId, box),
              skipHistory: true,
            },
          ],
        ]
      }
      case "pointerUp": {
        const box = computeBox(start, event.at, ctx.modifiers)
        if (box.width === 0 || box.height === 0) {
          return [
            { phase: "idle" },
            [
              {
                kind: "mutation",
                apply: (draft) => removeByIds(draft, [containerId, textId]),
                skipHistory: true,
              },
            ],
          ]
        }
        return [
          { phase: "idle" },
          [
            { kind: "mutation", apply: (draft) => resizeBox(draft, containerId, box) },
            { kind: "select", ids: [containerId] },
            { kind: "switchTool", tool: "selection" },
            { kind: "startTextEdit", elementId: textId },
          ],
        ]
      }
      case "escape":
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => removeByIds(draft, [containerId, textId]),
              skipHistory: true,
            },
          ],
        ]
      default:
        return [state, []]
    }
  },
}
```

- [ ] **Step 5: Register the tool**

In `packages/tools/src/registry.ts`, add the import and the `note` entry:

```ts
import { noteTool } from "./tools/note"
```

```ts
export const TOOLS: Record<ToolName, Tool<unknown, ToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
  image: imageTool,
  note: noteTool,
}
```

In `packages/tools/src/index.ts`, add the exports near the other tools:

```ts
export { noteTool } from "./tools/note"
export type { NoteState } from "./tools/note"
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/tools test note-tool`
Expected: PASS (4 tests).

- [ ] **Step 7: Run full tools suite**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/tools/note.ts packages/tools/src/types.ts packages/tools/src/registry.ts packages/tools/src/index.ts packages/tools/test/note-tool.test.ts
git commit -m "tools: note tool drags a sticky note and edits its bound text"
```

---

### Task 8: Bound text is non-interactive; double-click a note edits its text

**Files:**

- Modify: `packages/tools/src/tools/selection/index.ts` (doubleClick path)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (hitTest skips bound text)
- Test: `packages/tools/test/selection-doubleclick.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/tools/test/selection-doubleclick.test.ts` a case for a container hit resolving to its bound text:

```ts
it("double-click on a note container emits startTextEdit for its bound text", () => {
  const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
  const container = {
    ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  const ctx = makeCtx({ readElements: () => [container, text], hitTest: () => container })
  const r = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(5, 5) },
    ctx,
  )
  const eff = r[1].find((e) => e.kind === "startTextEdit")
  expect(eff).toBeDefined()
  if (eff?.kind === "startTextEdit") expect(eff.elementId).toBe(text.id)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test selection-doubleclick`
Expected: FAIL — container hit currently produces a no-op (no `startTextEdit`).

- [ ] **Step 3: Resolve container → bound text in the doubleClick handler**

In `packages/tools/src/tools/selection/index.ts`, replace the `doubleClick` branch inside `reduceIdle`:

```ts
if (event.type === "doubleClick") {
  const hit = ctx.hitTest(event.at)
  if (hit) {
    if (hit.type === "text") {
      return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: hit.id }]]
    }
    const textRef = hit.boundElements?.find((b) => b.type === "text")
    if (textRef) {
      return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId: textRef.id }]]
    }
  }
  return [{ phase: "idle" }, []]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/tools test selection-doubleclick`
Expected: PASS (all four cases — the existing plain-rectangle no-op still holds because it has no `boundElements`).

- [ ] **Step 5: Make bound text non-interactive in the driver's hitTest**

In `apps/web/src/driver/useDrawingDriver.ts`, update the `hitTest` loop (around line 131) to skip bound text so clicks land on the container:

```ts
        hitTest: (at) => {
          const elements = scene.getElements()
          for (let i = elements.length - 1; i >= 0; i -= 1) {
            const el = elements[i] as ExcalidrawElement
            if (el.type === "text" && el.containerId !== null) continue
            if (hitTestElement(el, at)) return el
          }
          return null
        },
```

- [ ] **Step 6: Run tools suite + web typecheck**

Run: `pnpm --filter @excalidraw-clone/tools test`
Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/tools/selection/index.ts apps/web/src/driver/useDrawingDriver.ts packages/tools/test/selection-doubleclick.test.ts
git commit -m "tools+web: notes select the container; double-click edits bound text"
```

---

### Task 9: UI surfaces — toolbar button, shortcut, help, icon, i18n

**Files:**

- Modify: `packages/ui/src/shared/icons.ts`, `packages/ui/src/Toolbar.tsx`, `packages/ui/src/HelpDialog.tsx`
- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`, `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Test: `packages/ui/test/Toolbar.test.tsx`, `apps/web` keyboard test if present

- [ ] **Step 1: Write the failing test (toolbar)**

Append to `packages/ui/test/Toolbar.test.tsx` (match the file's existing render/handlers setup):

```ts
it("renders a note tool button", () => {
  renderToolbar()
  expect(screen.getByTestId("toolbar-note")).toBeInTheDocument()
})
```

(If the test file uses an inline `render(<Toolbar .../>)` rather than a `renderToolbar()` helper, mirror the existing pattern in that file for the new case.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test Toolbar`
Expected: FAIL — `toolbar-note` not found.

- [ ] **Step 3: Add the note icon**

In `packages/ui/src/shared/icons.ts`, add a `note` entry to the `ICONS` record (before the closing brace):

```ts
  note: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h12v8l-4 4H4z"/><path d="M16 12h-4v4"/></svg>',
```

- [ ] **Step 4: Add the toolbar item**

In `packages/ui/src/Toolbar.tsx`, add to `TOOL_ITEMS` (after `frame`):

```ts
  { name: "note", shortcut: "N" },
```

- [ ] **Step 5: Add the help-dialog row**

In `packages/ui/src/HelpDialog.tsx`, add to `TOOL_SHORTCUTS` (after the `frame` entry):

```ts
  { keys: "N", label: "shortcuts.note" },
```

- [ ] **Step 6: Add the keyboard binding**

In `apps/web/src/keyboard/shortcuts.ts`, add to `TOOL_KEYS`:

```ts
  n: "note",
```

- [ ] **Step 7: Add i18n strings**

In `apps/web/src/locales/en/common.json` `"toolbar"` object add `"note": "Sticky note"`.
In `apps/web/src/locales/ko/common.json` `"toolbar"` object add `"note": "메모"`.
In `apps/web/src/locales/en/shortcuts.json` add `"note": "Sticky note"` (after `"frame"`).
In `apps/web/src/locales/ko/shortcuts.json` add `"note": "메모"` (after `"frame"`).

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test Toolbar`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/shared/icons.ts packages/ui/src/Toolbar.tsx packages/ui/src/HelpDialog.tsx apps/web/src/keyboard/shortcuts.ts apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json packages/ui/test/Toolbar.test.tsx
git commit -m "ui+web: sticky-note toolbar button, N shortcut, help row, i18n"
```

---

## Phase D — End-to-end + verification

### Task 10: Playwright e2e — sticky note happy path + dashed stroke

**Files:**

- Create: `apps/web/e2e/sticky-note.spec.ts` (match the directory of the existing snap-to-grid spec — find it via `git ls-files | grep e2e`)

- [ ] **Step 1: Locate the existing e2e setup**

Run: `git ls-files | grep -i 'e2e\|playwright\|\.spec\.'`
Read one existing spec (e.g. the snap-to-grid spec) to copy its app-launch/setup boilerplate (base URL, localStorage reset, how it selects tools and dispatches pointer events).

- [ ] **Step 2: Write the e2e test**

Create `apps/web/e2e/sticky-note.spec.ts`, following the existing spec's setup. Core assertions:

```ts
import { expect, test } from "@playwright/test"

test("draw a sticky note, type into it, move it — text follows", async ({ page }) => {
  await page.goto("/")
  // select the note tool (button or "n" key — mirror how the existing spec selects tools)
  await page.getByTestId("toolbar-note").click()
  // drag out the note on the canvas
  const canvas = page.locator("canvas").first()
  await canvas.hover({ position: { x: 200, y: 200 } })
  await page.mouse.down()
  await page.mouse.move(320, 300)
  await page.mouse.up()
  // a textarea editor should appear (TextEditingOverlay)
  const editor = page.locator("textarea")
  await expect(editor).toBeVisible()
  await editor.fill("hello")
  await editor.blur()
  // reload-independent assertion: the scene persists 2 elements (container + text)
  // (use the same localStorage key the existing spec asserts on)
})

test("toggling stroke style to dashed updates the selected shape", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("toolbar-rectangle").click()
  const canvas = page.locator("canvas").first()
  await canvas.hover({ position: { x: 150, y: 150 } })
  await page.mouse.down()
  await page.mouse.move(260, 240)
  await page.mouse.up()
  // shape auto-selects after draw; the properties panel shows style rows
  await page.getByTestId("stroke-style-dashed").click()
  await expect(page.getByTestId("stroke-style-dashed")).toHaveAttribute("aria-pressed", "true")
})
```

Adjust selectors/persistence assertions to match the existing spec's conventions (the snap-to-grid spec is the closest reference). Keep the happy path only — no edge cases.

- [ ] **Step 3: Run the e2e suite**

Run the project's e2e command (check `apps/web/package.json` scripts — likely `pnpm --filter @excalidraw-clone/web test:e2e` or a root `playwright test`).
Expected: PASS. If the dev server must be running, follow the existing spec's documented setup.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/sticky-note.spec.ts
git commit -m "web: e2e for sticky note happy path and dashed stroke"
```

---

### Task 11: Full gate + integration

- [ ] **Step 1: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS. Fix any type errors before continuing.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS across all packages.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Format check**

Run: `pnpm format:check`
Expected: PASS (run `pnpm format` and amend if it flags files).

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run the app (`pnpm dev`), press `N`, drag a sticky note, type, click away, then drag the note and confirm the text moves with it. Toggle a rectangle to dashed/dotted and to round edges and confirm the canvas updates.

- [ ] **Step 7: Final integration commit (if any format/lint fixups were needed)**

```bash
git add -A
git commit -m "chore: v1.4 style controls + sticky note gate fixups"
```

---

## Self-review notes

- **Spec coverage:** Section 1 → Tasks 1–3. Section 2 (`reconcileBoundText` + mutate wiring) → Tasks 4–5. Section 3 (tool, factory, rendering-by-reuse, editing, toolbar/shortcut/help) → Tasks 6–9. Section 4 (testing) → tests embedded in every task + Task 10 e2e. Gate → Task 11.
- **Rendering** needs no new shape code: the container is a rounded rect (Task 2) and bound text renders via the existing centered-text path; reconcile (Task 5) keeps them aligned — covered, no separate task required.
- **Out of scope** (auto-wrap, arrowhead picker, binding connectors) — intentionally no tasks.
