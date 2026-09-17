# Text Tool Empty-Element Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the text tool so a single click (not a drag) reliably opens the new text element for editing instead of silently creating a stray, uncommitted empty text element.

**Confirmed root cause (Phase 1–2 already complete — do not re-investigate):** `packages/tools/src/tools/text.ts`'s `textTool` reducer emits the `startTextEdit` effect synchronously on `pointerDown`. The app driver applies that effect (`apps/web/src/driver/effects.ts`) by calling `setTextEditElementId`, which makes `TextEditingOverlay.tsx` mount a `<textarea>` and focus it via `queueMicrotask`. Because this all happens _while the same native `pointerdown`/`mousedown` event is still being dispatched_, the browser's own default mousedown focus-management (which runs after listeners finish for that event) steals focus back from the textarea before any keystroke lands. By the time `pointerup`/`click` finish, nothing has been typed — the click silently produces a stray empty text element.

`packages/tools/src/tools/note.ts` (`noteTool`) is the working reference: it creates its elements on `pointerDown` (`skipHistory: true`) but defers emitting `startTextEdit` until `pointerUp`, after the click's focus churn has settled. This plan mirrors that pattern for the text tool.

**Second, related gap found during planning (not a re-investigation of the root cause — a necessary completion of the fix):** `apps/web/src/driver/commitTextEdit.ts` only deletes an empty-committed text element when it is a _bound_ label (`el.containerId !== null`). A freshly-placed _standalone_ text element (what the text tool creates; `containerId` is always `null`) is never deleted on an empty commit — it is kept with `text: ""` forever. So even after fixing the timing race, clicking and then blurring/escaping without typing anything would still leave a stray empty element. Task 2 fixes this.

**Architecture / scope:**

- Task 1 changes only `packages/tools/src/tools/text.ts` (+ its test) — pure reducer logic, no app-layer changes, TDD-able entirely with `vitest` in the `tools` package.
- Task 2 changes only `apps/web/src/driver/commitTextEdit.ts` (+ its test) — a one-line widening of an existing, already-tested delete condition, verified not to regress the existing "clearing an existing free text element keeps it empty" behavior.
- Task 3 adds a new Playwright e2e spec that reproduces the original bug with a real browser click (not a synthetic RTL event) and confirms both the "type something" and "type nothing" cases end with the scene in the right state, then runs the full gate and integrates.
- **No renderer, scene-factory, store, or `TextEditingOverlay.tsx` changes are needed.** `TextEditingOverlay.tsx`'s existing `commit()` and `onKeyDown`("Escape") handlers already both funnel through `commitTextEdit`, so Task 2's fix there automatically fixes both the blur-path and the escape-path for free-standing text — no separate overlay change required.
- `TextState`'s exported shape stays a two-member discriminated union on `phase`; only the second variant's name changes (`"editing"` → `"placing"`) and its meaning changes (now "element placed, pointer not yet released" instead of "currently in a live edit session" — the live edit session is now owned entirely by the app store's `textEditElementId`, exactly like `note`/frame/shape-label editing already is). Verified via grep: `TextState` has no consumers outside `packages/tools/src/index.ts`'s re-export, and no code anywhere matches the literal `"editing"` phase for the text tool. Safe to rename.
- The text tool intentionally does **not** switch to the selection tool after placing (unlike `noteTool`) — this is existing, confirmed UX (no `switchTool` effect exists today in `text.ts`, and nothing elsewhere implicitly switches it). Do not add one.
- The tool-reducer `{type:"escape"}` `ToolEvent` is not currently dispatched anywhere in the live app (confirmed via grep of `apps/web/src/driver/useDrawingDriver.ts` and `apps/web/src/keyboard/shortcuts.ts` — no `type: "escape"` dispatch exists there; the global Escape key shortcut only clears selection). `noteTool`'s own `"escape"` handling is exercised by unit tests only today. Task 1 adds analogous escape-cleanup to the text tool for parity and because it's explicitly requested — this is a safety net for future wiring and unit-test correctness, not a currently-observable UI fix.

**Tech Stack:** TypeScript, the hand-rolled `Tool<S, E>` reducer architecture in `packages/tools`, Vitest (unit), Playwright (e2e), pnpm workspaces + Turbo.

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`parseStoredScene` unwraps the v3 `pages[]` document to the active page's `elements`; `dragOnCanvas` does a raw `mouse.down`/`move`/`up` drag). There is no existing single-click canvas helper — define one locally in the new spec file, mirroring the local `dblClickCanvas` helper pattern already used in `apps/web/e2e/shape-labels.spec.ts`.
- No i18n changes are needed anywhere in this plan (no new UI strings).
- Commit after every task with a conventional-commit message. Branch is `fix/text-tool-empty-element`, created off `develop` (see Task 1, Step 0).
- Final task: full gate + full e2e green, then integrate the branch per **superpowers:finishing-a-development-branch** (fast-forward `fix/text-tool-empty-element` → `develop` → `main`, push both, delete the branch, update memory).

---

### Task 1: Defer `startTextEdit` from `pointerDown` to `pointerUp` in the text tool

**Context for a fresh implementer (no prior context needed beyond this):** `packages/tools/src/tools/text.ts` currently emits the `startTextEdit` effect synchronously inside the `pointerDown` handler, in the same reducer call that creates the element. This causes the app to try to focus the editing textarea while the browser's native `mousedown` event is still being dispatched, and the browser's own default focus-management steals focus back before any keystroke can land — so a single click silently creates an empty, never-editable text element. The fix mirrors the already-working `noteTool` (`packages/tools/src/tools/note.ts`): create the element on `pointerDown` with `skipHistory: true`, hold in an intermediate phase, and only emit `startTextEdit` on `pointerUp` (after the click's focus churn has settled). Also add escape-cleanup for the intermediate phase (mirroring `noteTool`'s escape handling), even though the app doesn't currently dispatch `escape` `ToolEvent`s anywhere in production — this is for parity and because a later plan may wire it up.

**Files:**

- Modify: `packages/tools/src/tools/text.ts`
- Modify (full rewrite of test bodies — the current tests encode the buggy behavior and must be rewritten, not just kept passing): `packages/tools/test/text-tool.test.ts`

**Current buggy source** (`packages/tools/src/tools/text.ts`):

```ts
import { newText } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

export type TextState = { phase: "idle" } | { phase: "editing"; elementId: string }

const TEXT_INITIAL: TextState = { phase: "idle" }

export const textTool: Tool<TextState, ToolEvent> = {
  name: "text",
  initial: TEXT_INITIAL,
  reduce(state, event, _ctx: ToolContext): [TextState, readonly ToolEffect[]] {
    void _ctx
    if (state.phase === "idle") {
      if (event.type === "pointerDown") {
        const element = newText({ x: event.at.x, y: event.at.y })
        return [
          { phase: "editing", elementId: element.id },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(element)
              },
            },
            { kind: "startTextEdit", elementId: element.id },
          ],
        ]
      }
      return [state, []]
    }
    if (event.type === "escape") return [{ phase: "idle" }, []]
    return [state, []]
  },
}
```

**Interfaces:**

- `TextState` becomes `{ phase: "idle" } | { phase: "placing"; elementId: string }` (renamed from `"editing"` to `"placing"`; still a two-member discriminated union carrying `elementId: string`, so the exported type shape and the `Tool<TextState, ToolEvent>` contract are unaffected). Confirmed via grep that no code outside `packages/tools/src/tools/text.ts` and its re-export in `packages/tools/src/index.ts` references `TextState` or the `"editing"` phase literal, so this rename is safe.
- `pointerDown` (idle phase): creates the element exactly as before, but the resulting `mutation` effect gets `skipHistory: true` (mirroring `noteTool`'s pending-creation push), and **no `startTextEdit` effect is emitted**. New state: `{ phase: "placing", elementId: element.id }`.
- `pointerUp` (placing phase): emits **only** `{ kind: "startTextEdit", elementId }` — no `mutation`, no `select`, no `switchTool` (the text tool does not select or switch tools after placing; this is existing, intentional behavior — do not add either effect). New state: `{ phase: "idle" }`.
- `pointerMove` (placing phase): ignored — return `[state, []]` unchanged (text has no drag-to-resize gesture, unlike `noteTool`).
- `escape` (placing phase): removes the just-created empty element from the draft (`skipHistory: true`, mirroring `noteTool`'s `removeByIds` cleanup) and returns to idle.

**Steps:**

1. - [ ] **Step 0 (branch setup):** From a clean tree on `develop` (`git switch develop && git pull --ff-only`), create the working branch: `git switch -c fix/text-tool-empty-element`. Confirm `git status` is clean.
2. - [ ] **Write the failing tests.** Replace the entire contents of `packages/tools/test/text-tool.test.ts` with:

   ```ts
   import type { ExcalidrawElement } from "@excalidraw-clone/scene"
   import { describe, expect, it } from "vitest"
   import { textTool } from "../src"
   import { applyMutation, makeCtx, point } from "./test-utils"

   describe("text tool", () => {
     it("pointerDown creates an empty text element and enters placing (no edit yet)", () => {
       const ctx = makeCtx()
       const draft: ExcalidrawElement[] = []
       const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(10, 20) }, ctx)
       applyMutation(r[1], draft)
       expect(draft.length).toBe(1)
       expect(draft[0]?.type).toBe("text")
       expect(r[0]).toEqual({ phase: "placing", elementId: draft[0]?.id })
       expect(r[1].some((e) => e.kind === "startTextEdit")).toBe(false)
     })

     it("pointerMove while placing is ignored", () => {
       const ctx = makeCtx()
       const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
       const move = textTool.reduce(r[0], { type: "pointerMove", at: point(50, 50) }, ctx)
       expect(move).toEqual([r[0], []])
     })

     it("pointerUp while placing commits to idle and starts editing the placed element", () => {
       const ctx = makeCtx()
       const draft: ExcalidrawElement[] = []
       const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
       applyMutation(r[1], draft)
       const elementId = draft[0]!.id
       const up = textTool.reduce(r[0], { type: "pointerUp", at: point(0, 0) }, ctx)
       expect(up[0]).toEqual({ phase: "idle" })
       expect(up[1]).toEqual([{ kind: "startTextEdit", elementId }])
     })

     it("escape while placing discards the pending empty element and returns to idle", () => {
       const ctx = makeCtx()
       const draft: ExcalidrawElement[] = []
       const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
       applyMutation(r[1], draft)
       const esc = textTool.reduce(r[0], { type: "escape" }, ctx)
       applyMutation(esc[1], draft)
       expect(esc[0]).toEqual({ phase: "idle" })
       expect(draft.length).toBe(0)
     })
   })
   ```

3. - [ ] Run `pnpm --filter @excalidraw-clone/tools test -- text-tool` (check the package name in `packages/tools/package.json` if this filter doesn't resolve) — confirm the new tests **FAIL** against the current source (in particular: `r[0].phase` is currently `"editing"` not `"placing"`, and `r[1]` currently contains a `startTextEdit` effect on `pointerDown`).
4. - [ ] **Implement** in `packages/tools/src/tools/text.ts`, replacing the whole file:

   ```ts
   import { newText, type ExcalidrawElement } from "@excalidraw-clone/scene"
   import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"

   export type TextState = { phase: "idle" } | { phase: "placing"; elementId: string }

   const TEXT_INITIAL: TextState = { phase: "idle" }

   const removeById = (draft: ExcalidrawElement[], id: string): void => {
     const i = draft.findIndex((e) => e.id === id)
     if (i >= 0) draft.splice(i, 1)
   }

   export const textTool: Tool<TextState, ToolEvent> = {
     name: "text",
     initial: TEXT_INITIAL,
     reduce(state, event, _ctx: ToolContext): [TextState, readonly ToolEffect[]] {
       void _ctx
       if (state.phase === "idle") {
         if (event.type === "pointerDown") {
           const element = newText({ x: event.at.x, y: event.at.y })
           return [
             { phase: "placing", elementId: element.id },
             [
               {
                 kind: "mutation",
                 apply: (draft) => {
                   draft.push(element)
                 },
                 skipHistory: true,
               },
             ],
           ]
         }
         return [state, []]
       }
       const { elementId } = state
       if (event.type === "pointerUp") {
         return [{ phase: "idle" }, [{ kind: "startTextEdit", elementId }]]
       }
       if (event.type === "escape") {
         return [
           { phase: "idle" },
           [
             {
               kind: "mutation",
               apply: (draft) => removeById(draft, elementId),
               skipHistory: true,
             },
           ],
         ]
       }
       return [state, []]
     },
   }
   ```

5. - [ ] Re-run `pnpm --filter @excalidraw-clone/tools test -- text-tool` — confirm ALL tests PASS.
6. - [ ] Run `pnpm --filter @excalidraw-clone/tools test` (full package suite) to confirm no other test in the `tools` package broke (e.g. any registry/index smoke test that touches `textTool.initial`).
7. - [ ] Run `pnpm turbo run lint typecheck --filter @excalidraw-clone/tools --force` — confirm green.
8. - [ ] Commit: `fix(tools): defer text tool's startTextEdit to pointerUp to avoid focus-steal race`.

---

### Task 2: Delete a freshly-placed, never-typed-in text element on empty commit

**Context for a fresh implementer (no prior context needed beyond this):** `apps/web/src/driver/commitTextEdit.ts` is called by `TextEditingOverlay.tsx` whenever a text edit session ends (on blur, or on Escape when the pre-edit text was empty). Its job is to either save the typed text or, for an empty result, delete the element. Today it only deletes on an empty result when the element is a _bound_ label (`containerId !== null`, e.g. a sticky note's or shape's label) — a free-standing text element (`containerId === null`, which is exactly what the text tool creates) is never deleted on an empty commit; it's left behind in the scene with `text: ""` forever. This is a second, independent piece of the "stray empty text element" bug: even after Task 1's timing fix, a user who clicks with the text tool and blurs (or presses Escape) without typing anything would still get a permanent, invisible, empty text element in the scene. Fix this by widening the delete condition to also cover a free-standing element that **never had any content before this edit either** (i.e. `el.text === ""` before the edit) — this preserves the separate, already-tested, intentional behavior that _clearing out an existing, previously-non-empty_ free text element keeps it (rather than deleting it), since only elements whose pre-edit text was already empty get deleted.

**Files:**

- Modify: `apps/web/src/driver/commitTextEdit.ts`
- Modify: `apps/web/test/commit-text-edit.test.ts`

**Current source** (`apps/web/src/driver/commitTextEdit.ts`):

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Apply the end of a text-edit session to a mutation draft: commit non-empty
 *  text; an empty bound label is deleted and unlinked from its container. */
export function commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const el = draft[i]!
  if (el.type !== "text") return
  if (finalText === "" && el.containerId !== null) {
    draft.splice(i, 1)
    const ci = draft.findIndex((e) => e.id === el.containerId)
    if (ci >= 0) {
      const c = draft[ci]!
      const rest = (c.boundElements ?? []).filter((b) => b.id !== id)
      draft[ci] = { ...c, boundElements: rest.length > 0 ? rest : null }
    }
    return
  }
  draft[i] = { ...el, text: finalText }
}
```

**Existing tests to keep passing unchanged** (`apps/web/test/commit-text-edit.test.ts` — do not modify these three; they encode intentional, still-correct behavior and are the regression guard for this task):

```ts
it("non-empty commit updates the text and keeps the binding", () => {
  /* ...unchanged... */
})
it("empty commit deletes the label and strips the container ref", () => {
  /* ...unchanged... */
})
it("empty commit on a free text element keeps it", () => {
  const free = newText({ x: 0, y: 0, text: "old" })
  const draft: ExcalidrawElement[] = [free]
  commitTextEdit(draft, free.id, "")
  expect(draft).toHaveLength(1)
  expect((draft[0] as ExcalidrawTextElement).text).toBe("")
})
it("unknown id is a no-op", () => {
  /* ...unchanged... */
})
```

Note the third test above uses `newText({ x: 0, y: 0, text: "old" })` — pre-edit text is `"old"` (non-empty), so it must stay kept after this task's fix. Do not touch this test.

**Steps:**

1. - [ ] **Write the failing test.** Add a new `it` block to `apps/web/test/commit-text-edit.test.ts` (after the existing "empty commit on a free text element keeps it" test), using the already-imported `newText`:

   ```ts
   it("empty commit on a freshly-placed free text element (never had content) deletes it", () => {
     const fresh = newText({ x: 0, y: 0 }) // no `text` given -> defaults to ""
     const draft: ExcalidrawElement[] = [fresh]
     commitTextEdit(draft, fresh.id, "")
     expect(draft).toHaveLength(0)
   })
   ```

2. - [ ] Run `pnpm --filter web test -- commit-text-edit` (check the actual package/script name in `apps/web/package.json` if this doesn't resolve) — confirm the new test **FAILS** (`draft` has length 1, not 0) against the current source, and confirm the three existing tests still pass unmodified.
3. - [ ] **Implement** in `apps/web/src/driver/commitTextEdit.ts`, changing only the delete condition and its comment:

   ```ts
   import type { ExcalidrawElement } from "@excalidraw-clone/scene"

   /** Apply the end of a text-edit session to a mutation draft: commit non-empty
    *  text. An empty bound label is always deleted and unlinked from its
    *  container. A free-standing (unbound) text element is deleted on an empty
    *  commit only if it never had content before this edit either (a fresh,
    *  never-typed-in text-tool placement) — clearing out *existing* content on
    *  a free text element keeps it, rather than deleting it. */
   export function commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void {
     const i = draft.findIndex((e) => e.id === id)
     if (i < 0) return
     const el = draft[i]!
     if (el.type !== "text") return
     if (finalText === "" && (el.containerId !== null || el.text === "")) {
       draft.splice(i, 1)
       const ci = draft.findIndex((e) => e.id === el.containerId)
       if (ci >= 0) {
         const c = draft[ci]!
         const rest = (c.boundElements ?? []).filter((b) => b.id !== id)
         draft[ci] = { ...c, boundElements: rest.length > 0 ? rest : null }
       }
       return
     }
     draft[i] = { ...el, text: finalText }
   }
   ```

   (The container-unlink block is unaffected for the new free-text case: `el.containerId` is `null`, so `draft.findIndex((e) => e.id === el.containerId)` finds nothing — `ci` stays `-1` and the unlink block is skipped, exactly as intended.)

4. - [ ] Re-run `pnpm --filter web test -- commit-text-edit` — confirm ALL FOUR tests (three pre-existing + the new one) PASS.
5. - [ ] Run `pnpm --filter web test` (full app test suite) to confirm nothing else regressed (in particular, no test elsewhere relies on a freshly-created, never-edited free text element surviving an empty commit — none was found in this investigation, but re-confirm).
6. - [ ] Run `pnpm turbo run lint typecheck --filter web --force` — confirm green.
7. - [ ] Commit: `fix(web): delete a freshly-placed, never-typed text element on empty commit`.

---

### Task 3: E2E reproduction + full gate + integrate

**Context for a fresh implementer (no prior context needed beyond this):** Tasks 1–2 fix the two mechanisms behind the bug (a focus-steal timing race, and a stray-empty-element persistence gap). This task adds browser-level (Playwright) proof that a _real_ click (not a React Testing Library synthetic event — the whole bug is about genuine browser mousedown default-action timing, which synthetic events don't reproduce) followed by real keystrokes now lands text correctly, and that a click-then-blur-without-typing leaves no stray element. No e2e spec currently exercises the text tool at all (confirmed via grep for `toolbar-text` across `apps/web/e2e` — zero matches), which is why this bug went uncaught.

**Files:**

- Create: `apps/web/e2e/text-tool.spec.ts`
- (verification only) full monorepo gate + full e2e suite

**Important implementation note — avoid a self-inflicted false failure:** the text tool intentionally stays active after placing (no `switchTool` effect — see Task 1). This means clicking on empty canvas to "blur" the textarea (the pattern used in `shape-labels.spec.ts`, where the _selection_ tool is active and stays inert on empty-canvas clicks) would, here, be interpreted as a **second** text-tool click and create a second stray element, corrupting the test. Instead, mirror `apps/web/e2e/sticky-note.spec.ts`'s pattern and call `await editor.blur()` directly on the Playwright locator to commit — this has no canvas side effects.

**Steps:**

1. - [ ] **Write the failing e2e** `apps/web/e2e/text-tool.spec.ts`:

   ```ts
   import { expect, test, type Page } from "@playwright/test"
   import { parseStoredScene } from "./_helpers"

   const clickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
     const canvas = page.locator("canvas").first()
     const box = await canvas.boundingBox()
     if (!box) throw new Error("canvas not found")
     await page.mouse.click(box.x + at.x, box.y + at.y)
   }

   const freshCanvas = async (page: Page): Promise<void> => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
   }

   test("a single click with the text tool, then typing, commits real text (no stray empty element)", async ({
     page,
   }) => {
     await freshCanvas(page)

     await page.locator('[data-testid="toolbar-text"]').click()
     await clickCanvas(page, { x: 200, y: 200 })

     const editor = page.locator("textarea")
     await editor.waitFor({ state: "visible" })
     await page.keyboard.type("hello")
     await editor.blur()
     await page.waitForTimeout(900)

     const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     const data = parseStoredScene<{ type: string; text?: string; isDeleted?: boolean }>(sceneJson)
     const live = data.elements.filter((e) => !e.isDeleted)
     const texts = live.filter((e) => e.type === "text")
     expect(texts).toHaveLength(1)
     expect(texts[0]?.text).toBe("hello")
   })

   test("a single click with the text tool, then blurring without typing, leaves no stray element", async ({
     page,
   }) => {
     await freshCanvas(page)

     await page.locator('[data-testid="toolbar-text"]').click()
     await clickCanvas(page, { x: 200, y: 200 })

     const editor = page.locator("textarea")
     await editor.waitFor({ state: "visible" })
     await editor.blur()
     await page.waitForTimeout(900)

     const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     const data = parseStoredScene<{ type: string; isDeleted?: boolean }>(sceneJson)
     const live = data.elements.filter((e) => !e.isDeleted)
     expect(live).toHaveLength(0)
   })
   ```

2. - [ ] From `apps/web/`, run `pnpm exec playwright test text-tool` against the branch state **before** Tasks 1–2's fixes are present (e.g. temporarily `git stash` those two commits, or run this step first if executing tasks out of order) — confirm both tests **FAIL** for the right reason: the first because `texts[0]?.text` is `""` not `"hello"` (keystrokes were lost to the focus race) or because a second stray element also exists; the second because `live` has length 1, not 0 (the stray empty element persists). Then restore/apply Tasks 1–2 and re-run — confirm both **PASS**.
   - If the first test is flaky in headless CI (browser focus-timing races can be sensitive to machine speed), a small `page.waitForTimeout(50)` between `clickCanvas` and `editor.waitFor` may help stabilize it — but first try without, since the whole point of using `page.mouse.click` + `page.keyboard.type` (real browser events) instead of Playwright's `locator.fill()` is to faithfully reproduce the native mousedown-focus-steal timing described in the root cause; adding delays should only be used if genuinely needed for stability, not to paper over a still-broken fix.
3. - [ ] Commit: `test(web): e2e coverage for text tool click-to-edit (no stray empty elements)`.
4. - [ ] **Full gate:** from repo root run `pnpm turbo run lint typecheck test build --force` — confirm every package is green. Fix any fallout on this branch and re-run until clean.
5. - [ ] **Full e2e:** from `apps/web/` run `pnpm exec playwright test` — confirm the entire suite passes (not just `text-tool.spec.ts`), including `sticky-note.spec.ts` and `shape-labels.spec.ts` (both touch adjacent `commitTextEdit`/`TextEditingOverlay` code paths and are the primary regression risk for Task 2's change).
6. - [ ] **Integrate** per **superpowers:finishing-a-development-branch**:
   - `git switch develop && git merge --ff-only fix/text-tool-empty-element`
   - `git switch main && git merge --ff-only develop`
   - `git push origin develop main`
   - `git branch -d fix/text-tool-empty-element` (and delete the remote branch if one was pushed)
   - Update `/home/sung/.claude/projects/-home-sung-excalidraw-clone/memory/MEMORY.md` with a one-line "Text tool empty-element bug SHIPPED" entry (final commit SHA, all refs aligned, full gate green).

---

## Self-Review — scope → task mapping

| Scope item                                                                                           | Task                            | Notes                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defer `startTextEdit` emission from `pointerDown` to `pointerUp` (the confirmed root cause)          | Task 1                          | Mirrors `noteTool`'s existing pattern exactly, adapted (no drag/resize, no `select`/`switchTool`)                                                                          |
| Rename `TextState`'s second variant `"editing"` → `"placing"`, keep 2-member union shape             | Task 1                          | No consumers outside the package re-export (verified by grep)                                                                                                              |
| Escape-cleanup during the pending phase (mirrors `noteTool`, currently unreachable from the live UI) | Task 1                          | `{type:"escape"}` `ToolEvent` is not dispatched anywhere in `apps/web` today (verified by grep) — added for parity/tests only                                              |
| Rewrite `packages/tools/test/text-tool.test.ts` (old tests encoded buggy behavior)                   | Task 1                          | All 4 tests rewritten, none merely "kept passing"                                                                                                                          |
| Delete a freshly-placed, never-typed free text element on empty commit                               | Task 2                          | One-line widening of `commitTextEdit`'s existing, already-tested delete condition                                                                                          |
| Preserve "clearing existing free text content keeps the element" behavior                            | Task 2                          | Existing test with `text: "old"` pre-edit is left unmodified as the regression guard                                                                                       |
| No changes needed to `TextEditingOverlay.tsx`                                                        | Task 2 (no-change confirmation) | Its `commit()` and Escape handler both already call `commitTextEdit`, so fixing that one function fixes both paths                                                         |
| New e2e spec using real browser events (not RTL/synthetic) to reproduce the original race            | Task 3                          | `page.mouse.click` + `page.keyboard.type`, mirroring `sticky-note.spec.ts`'s `.blur()` commit pattern (not a canvas click, since the text tool stays active after placing) |
| Branch `fix/text-tool-empty-element` off `develop`; commit after every task                          | Task 1 Step 0; Tasks 1–3        |                                                                                                                                                                            |
| Final: full gate + full e2e green, then integrate per finishing-a-development-branch                 | Task 3, Steps 4–6               |                                                                                                                                                                            |

**No-change confirmation:** no files under `packages/scene/`, `packages/renderer/`, the Zustand store slices, `apps/web/src/components/TextEditingOverlay.tsx`, `apps/web/src/driver/effects.ts`, or `apps/web/src/driver/useDrawingDriver.ts` are modified — the effect-application plumbing, overlay mounting/focus logic, and history/persistence machinery are all already correct once the tool reducer emits `startTextEdit` at the right time and `commitTextEdit` discards truly-empty free text.
