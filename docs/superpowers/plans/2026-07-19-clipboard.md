# Clipboard Copy/Paste/Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ctrl+C/X/V for elements via native ClipboardEvents with cursor-targeted paste and plain-text fallback, plus Ctrl+A select-all, arrow-key nudge, and a Duplicate-button fix through a shared copy-closure helper.

**Architecture:** A scene helper (`expandIdsToCopyClosure`) expands a selection to bound labels + frame members. Web drivers (`copyPayload`/`buildPaste` in `apps/web/src/driver/clipboard.ts`) serialize/deserialize a JSON envelope carried as `text/plain`. `attachClipboard` (beside `attachShortcuts`) handles native `copy`/`cut`/`paste` document events; paste lands at the last pointer scene position tracked in a new store slice. Select-all and nudge extend `shortcuts.ts`.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest (jsdom for web), Playwright. Spec: `docs/superpowers/specs/2026-07-19-clipboard-design.md`.

## Global Constraints

- Envelope: `{ "type": "excalidraw-clone/clipboard", "version": 1, "elements": [...] }` as `text/plain`. Non-envelope, non-blank text pastes as one `newText` element at the cursor; blank text is ignored.
- Bound labels (`type === "text" && containerId !== null`) are never directly selectable: exclude them from select-all and from post-paste/post-duplicate selection.
- Editable-target guard everywhere: skip clipboard handling when `e.target` is INPUT, TEXTAREA, or contentEditable (same guard as `shortcuts.ts:31-37`).
- `exactOptionalPropertyTypes` is on — new optional interface props receiving possibly-undefined values need `| undefined`.
- RTK: `>/dev/null 2>&1 && echo PASS || echo FAIL`; `rtk proxy` for details. Lint from repo root. Commits: `<package>: <what>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: scene — `expandIdsToCopyClosure`

**Files:**

- Modify: `packages/scene/src/clone.ts`, `packages/scene/src/index.ts`
- Test: `packages/scene/test/copy-closure.test.ts` (create)

**Interfaces:**

- Consumes: `expandIdsToFrameMembers(ids, elements): string[]` from `./frames`.
- Produces: `expandIdsToCopyClosure(ids: readonly string[], elements: readonly ExcalidrawElement[]): ExcalidrawElement[]` — non-deleted elements of the closure (selection + frame members + bound labels of everything included), in scene order. Tasks 2–4 import it from `@excalidraw-clone/scene`.

- [ ] **Step 1: Write failing tests** — create `packages/scene/test/copy-closure.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  expandIdsToCopyClosure,
  newFrame,
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
} from "../src"

const labeledRect = () => {
  const rect = newRectangle({ x: 10, y: 10, width: 50, height: 40 })
  const label = { ...newLabelFor(rect), text: "hi" }
  return {
    rect: { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  }
}

describe("expandIdsToCopyClosure", () => {
  it("includes a selected shape's bound label", () => {
    const { rect, label } = labeledRect()
    const out = expandIdsToCopyClosure([rect.id], [rect, label])
    expect(out.map((e) => e.id)).toEqual([rect.id, label.id])
  })

  it("includes a selected frame's members and their labels, in scene order", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const { rect, label } = labeledRect()
    const member = { ...rect, frameId: frame.id }
    const elements: ExcalidrawElement[] = [member, label, frame]
    const out = expandIdsToCopyClosure([frame.id], elements)
    expect(out.map((e) => e.id)).toEqual([member.id, label.id, frame.id])
  })

  it("skips deleted elements and unknown ids", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), isDeleted: true }
    const out = expandIdsToCopyClosure([a.id, dead.id, "nope"], [a, dead])
    expect(out.map((e) => e.id)).toEqual([a.id])
  })

  it("plain ids pass through without duplicates", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const out = expandIdsToCopyClosure([a.id, b.id, a.id], [a, b])
    expect(out.map((e) => e.id)).toEqual([a.id, b.id])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/scene && pnpm vitest run test/copy-closure.test.ts`
Expected: FAIL — `expandIdsToCopyClosure` is not exported.

- [ ] **Step 3: Implement** — append to `packages/scene/src/clone.ts`:

```ts
import { expandIdsToFrameMembers } from "./frames"

/**
 * Expands a selection to its copyable closure: frame members of any selected
 * frame, plus bound labels of everything included. Returns the matching
 * non-deleted elements in scene order, without duplicates.
 */
export function expandIdsToCopyClosure(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const withMembers = new Set(expandIdsToFrameMembers(ids, elements))
  const closure = new Set(withMembers)
  for (const el of elements) {
    if (el.isDeleted || !withMembers.has(el.id)) continue
    for (const b of el.boundElements ?? []) {
      if (b.type === "text") closure.add(b.id)
    }
  }
  return elements.filter((el) => !el.isDeleted && closure.has(el.id))
}
```

(Move the `expandIdsToFrameMembers` import to the top of the file with the existing imports.) Add to `packages/scene/src/index.ts` beside the `cloneElementsWithNewIds` export:

```ts
export { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
```

- [ ] **Step 4: Run to verify green**

Run: `cd packages/scene && pnpm vitest run`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/scene
git commit -m "scene: expandIdsToCopyClosure — selection closure over labels and frame members"
```

### Task 2: web — clipboard payload builders

**Files:**

- Create: `apps/web/src/driver/clipboard.ts`
- Test: `apps/web/test/clipboard-driver.test.ts` (create)

**Interfaces:**

- Consumes: `expandIdsToCopyClosure`, `cloneElementsWithNewIds`, `getElementBounds`, `newText` from `@excalidraw-clone/scene` (Task 1).
- Produces (Task 3 imports these):
  - `CLIPBOARD_TYPE = "excalidraw-clone/clipboard"`
  - `copyPayload(elements: readonly ExcalidrawElement[], selectedIds: readonly string[]): { text: string; ids: readonly string[] } | null` — envelope JSON + closure ids; `null` when the closure is empty.
  - `buildPaste(text: string, at: { x: number; y: number }): ExcalidrawElement[]` — fresh-id clones centered at `at`; `[newText]` for non-envelope text; `[]` for blank/unusable input.

- [ ] **Step 1: Write failing tests** — create `apps/web/test/clipboard-driver.test.ts`:

```ts
import {
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { buildPaste, CLIPBOARD_TYPE, copyPayload } from "../src/driver/clipboard"

const labeledRect = () => {
  const rect = newRectangle({ x: 100, y: 100, width: 40, height: 40 })
  const label = { ...newLabelFor(rect), text: "hi" }
  return {
    rect: { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  }
}

describe("copyPayload", () => {
  it("serializes the closure into the envelope and reports closure ids", () => {
    const { rect, label } = labeledRect()
    const out = copyPayload([rect, label], [rect.id])!
    expect(out.ids).toEqual([rect.id, label.id])
    const parsed = JSON.parse(out.text) as { type: string; elements: ExcalidrawElement[] }
    expect(parsed.type).toBe(CLIPBOARD_TYPE)
    expect(parsed.elements.map((e) => e.id)).toEqual([rect.id, label.id])
  })

  it("returns null for an empty selection", () => {
    expect(copyPayload([], [])).toBeNull()
    expect(copyPayload([newRectangle({ x: 0, y: 0, width: 5, height: 5 })], [])).toBeNull()
  })
})

describe("buildPaste", () => {
  it("round-trips with fresh ids, remapped refs, and bbox centered at the target", () => {
    const { rect, label } = labeledRect()
    const { text } = copyPayload([rect, label], [rect.id])!
    const pasted = buildPaste(text, { x: 500, y: 300 })
    expect(pasted).toHaveLength(2)
    const [r, l] = pasted as [ExcalidrawElement, ExcalidrawTextElement]
    expect(r.id).not.toBe(rect.id)
    expect(l.containerId).toBe(r.id)
    expect(r.boundElements).toEqual([{ id: l.id, type: "text" }])
    // source bbox center is (120, 120) → offset (+380, +180)
    expect(r.x).toBe(480)
    expect(r.y).toBe(280)
  })

  it("two pastes of the same payload produce distinct ids", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const { text } = copyPayload([rect], [rect.id])!
    const a = buildPaste(text, { x: 50, y: 50 })
    const b = buildPaste(text, { x: 50, y: 50 })
    expect(a[0]!.id).not.toBe(b[0]!.id)
  })

  it("non-envelope text becomes a text element at the cursor", () => {
    const pasted = buildPaste("hello canvas", { x: 30, y: 40 })
    expect(pasted).toHaveLength(1)
    const t = pasted[0] as ExcalidrawTextElement
    expect(t.type).toBe("text")
    expect(t.text).toBe("hello canvas")
    expect(t.x).toBe(30)
    expect(t.y).toBe(40)
  })

  it("blank text and empty envelopes produce nothing", () => {
    expect(buildPaste("   ", { x: 0, y: 0 })).toEqual([])
    expect(
      buildPaste(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [] }), {
        x: 0,
        y: 0,
      }),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/clipboard-driver.test.ts`
Expected: FAIL — module `../src/driver/clipboard` does not exist.

- [ ] **Step 3: Implement** — create `apps/web/src/driver/clipboard.ts`:

```ts
import {
  cloneElementsWithNewIds,
  expandIdsToCopyClosure,
  getElementBounds,
  newText,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"

export const CLIPBOARD_TYPE = "excalidraw-clone/clipboard"

interface ClipboardEnvelope {
  type: typeof CLIPBOARD_TYPE
  version: 1
  elements: ExcalidrawElement[]
}

/** Serialize the copy closure of a selection into the clipboard envelope.
 *  Returns the JSON text plus the closure's ids (cut deletes those), or
 *  null when there is nothing to copy. */
export function copyPayload(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): { text: string; ids: readonly string[] } | null {
  const closure = expandIdsToCopyClosure(selectedIds, elements)
  if (closure.length === 0) return null
  const envelope: ClipboardEnvelope = { type: CLIPBOARD_TYPE, version: 1, elements: closure }
  return { text: JSON.stringify(envelope), ids: closure.map((el) => el.id) }
}

const parseEnvelope = (text: string): ClipboardEnvelope | null => {
  try {
    const parsed = JSON.parse(text) as unknown
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === CLIPBOARD_TYPE &&
      Array.isArray((parsed as { elements?: unknown }).elements)
    ) {
      return parsed as ClipboardEnvelope
    }
  } catch {
    // not JSON — fall through to plain text
  }
  return null
}

/** Turn clipboard text into elements to append: envelope → fresh-id clones
 *  whose bounding-box center lands at `at`; other non-blank text → one text
 *  element at `at`; blank/empty → nothing. */
export function buildPaste(text: string, at: { x: number; y: number }): ExcalidrawElement[] {
  if (text.trim() === "") return []
  const envelope = parseEnvelope(text)
  if (envelope === null) {
    return [newText({ x: at.x, y: at.y, text })]
  }
  if (envelope.elements.length === 0) return []
  const clones = cloneElementsWithNewIds(envelope.elements)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of clones) {
    const b = getElementBounds(el)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  const dx = at.x - (minX + maxX) / 2
  const dy = at.y - (minY + maxY) / 2
  return clones.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }))
}
```

- [ ] **Step 4: Run to verify green**

Run: `cd apps/web && pnpm vitest run test/clipboard-driver.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/clipboard.ts apps/web/test/clipboard-driver.test.ts
git commit -m "web: clipboard payload builders (copyPayload/buildPaste)"
```

### Task 3: web — pointer tracking, attachClipboard, Duplicate fix

**Files:**

- Create: `apps/web/src/store/slices/pointer.ts`, `apps/web/src/keyboard/clipboard.ts`
- Modify: `apps/web/src/store/index.ts`, `apps/web/src/driver/useDrawingDriver.ts` (`dispatchPointer`, ~line 178), `apps/web/src/components/App.tsx` (`onDuplicate` handler ~line 293 and attach effect ~line 67)
- Test: `apps/web/test/clipboard-attach.test.ts` (create)

**Interfaces:**

- Consumes: `copyPayload`, `buildPaste` (Task 2); `expandIdsToCopyClosure` (Task 1).
- Produces: `attachClipboard({ scene }): () => void`; store gains `lastScenePointer: { x: number; y: number } | null` and `setLastScenePointer(p)`.

- [ ] **Step 1: Write failing tests** — create `apps/web/test/clipboard-attach.test.ts`:

```ts
import { newLabelFor, newRectangle, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CLIPBOARD_TYPE, copyPayload } from "../src/driver/clipboard"
import { attachClipboard } from "../src/keyboard/clipboard"
import { useAppStore } from "../src/store"

const clipboardEvent = (
  type: "copy" | "cut" | "paste",
  data: Record<string, string>,
): ClipboardEvent => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(e, "clipboardData", {
    value: {
      getData: (k: string) => data[k] ?? "",
      setData: (k: string, v: string) => {
        data[k] = v
      },
    },
  })
  return e
}

describe("attachClipboard", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachClipboard({ scene })
    useAppStore.getState().setSelection([])
  })
  afterEach(() => detach())

  it("copy writes the envelope for the selection closure", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(rect)
    })
    useAppStore.getState().setSelection([rect.id])
    const data: Record<string, string> = {}
    document.dispatchEvent(clipboardEvent("copy", data))
    expect(data["text/plain"]).toContain(CLIPBOARD_TYPE)
    expect(data["text/plain"]).toContain(rect.id)
  })

  it("cut copies then deletes the closure including bound labels", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 50, height: 40 })
    const label = { ...newLabelFor(rect), text: "hi" }
    const linked = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    scene.mutate((d) => {
      d.push(linked, label)
    })
    useAppStore.getState().setSelection([rect.id])
    const data: Record<string, string> = {}
    document.dispatchEvent(clipboardEvent("cut", data))
    expect(data["text/plain"]).toContain(CLIPBOARD_TYPE)
    expect(scene.getElements()).toHaveLength(0)
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("paste appends fresh-id clones at the tracked pointer and selects them", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const { text } = copyPayload([rect], [rect.id])!
    useAppStore.getState().setLastScenePointer({ x: 200, y: 100 })
    document.dispatchEvent(clipboardEvent("paste", { "text/plain": text }))
    const els = scene.getElements()
    expect(els).toHaveLength(1)
    expect(els[0]!.id).not.toBe(rect.id)
    expect(els[0]!.x).toBe(195) // bbox center (5,5) → (200,100)
    expect(useAppStore.getState().selectedIds).toEqual([els[0]!.id])
  })

  it("plain-text paste creates a text element", () => {
    useAppStore.getState().setLastScenePointer({ x: 40, y: 50 })
    document.dispatchEvent(clipboardEvent("paste", { "text/plain": "hello" }))
    const els = scene.getElements()
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe("text")
  })

  it("events targeting an input are ignored", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(rect)
    })
    useAppStore.getState().setSelection([rect.id])
    const input = document.createElement("input")
    document.body.appendChild(input)
    const data: Record<string, string> = {}
    input.dispatchEvent(clipboardEvent("copy", data))
    expect(data["text/plain"]).toBeUndefined()
    input.remove()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/clipboard-attach.test.ts`
Expected: FAIL — `../src/keyboard/clipboard` does not exist.

- [ ] **Step 3: Implement the store slice** — create `apps/web/src/store/slices/pointer.ts`:

```ts
import type { StateCreator } from "zustand"

export interface PointerSlice {
  lastScenePointer: { x: number; y: number } | null
  setLastScenePointer: (p: { x: number; y: number }) => void
}

export const createPointerSlice: StateCreator<PointerSlice, [], [], PointerSlice> = (set) => ({
  lastScenePointer: null,
  setLastScenePointer: (p) => set({ lastScenePointer: p }),
})
```

Wire it into `apps/web/src/store/index.ts` following the existing pattern: import `createPointerSlice, type PointerSlice`, add `PointerSlice` to the `AppState` intersection, and spread `...createPointerSlice(...a)` in the store creator.

- [ ] **Step 4: Record the pointer in the driver** — in `apps/web/src/driver/useDrawingDriver.ts`, inside `dispatchPointer` after `const event = pointerEventToToolEvent(...)`:

```ts
if ("at" in event) store.setLastScenePointer(event.at)
```

(`store` is already `useAppStore.getState()` in that function.)

- [ ] **Step 5: Implement attachClipboard** — create `apps/web/src/keyboard/clipboard.ts`:

```ts
"use client"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import { buildPaste, copyPayload } from "../driver/clipboard"
import { useAppStore } from "../store"

interface Bindings {
  scene: Scene
}

const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return (
    el !== null &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true)
  )
}

const selectableIds = (els: readonly ExcalidrawElement[]): string[] =>
  els.filter((el) => !(el.type === "text" && el.containerId !== null)).map((el) => el.id)

export function attachClipboard({ scene }: Bindings): () => void {
  const writeSelection = (e: ClipboardEvent): readonly string[] | null => {
    if (isEditableTarget(e.target)) return null
    const ids = useAppStore.getState().selectedIds
    const payload = copyPayload(scene.getElements(), ids)
    if (payload === null || !e.clipboardData) return null
    e.clipboardData.setData("text/plain", payload.text)
    e.preventDefault()
    return payload.ids
  }

  const onCopy = (e: ClipboardEvent): void => {
    writeSelection(e)
  }

  const onCut = (e: ClipboardEvent): void => {
    const ids = writeSelection(e)
    if (ids === null) return
    const doomed = new Set(ids)
    scene.mutate((draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (doomed.has(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
      }
    })
    useAppStore.getState().setSelection([])
  }

  const onPaste = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target)) return
    const text = e.clipboardData?.getData("text/plain") ?? ""
    const store = useAppStore.getState()
    const at = store.lastScenePointer ?? {
      x: window.innerWidth / 2 / store.zoom - store.scrollX,
      y: window.innerHeight / 2 / store.zoom - store.scrollY,
    }
    const pasted = buildPaste(text, at)
    if (pasted.length === 0) return
    e.preventDefault()
    scene.mutate((draft) => {
      draft.push(...pasted)
    })
    store.setSelection(selectableIds(pasted))
  }

  document.addEventListener("copy", onCopy)
  document.addEventListener("cut", onCut)
  document.addEventListener("paste", onPaste)
  return () => {
    document.removeEventListener("copy", onCopy)
    document.removeEventListener("cut", onCut)
    document.removeEventListener("paste", onPaste)
  }
}
```

- [ ] **Step 6: Attach in App and fix Duplicate** — in `apps/web/src/components/App.tsx`:

Add beside the existing shortcuts effect (~line 66):

```ts
useEffect(() => {
  return attachClipboard({ scene })
}, [scene])
```

with `import { attachClipboard } from "../keyboard/clipboard"`. Then replace the `onDuplicate` handler body (~line 293) so the closure comes along and bound labels stay out of the selection:

```ts
onDuplicate={() => {
  const picked = expandIdsToCopyClosure(selectedIds, scene.getElements())
  const copies = cloneElementsWithNewIds(picked).map((el) => ({
    ...el,
    x: el.x + 12,
    y: el.y + 12,
  }))
  scene.mutate((draft) => {
    draft.push(...copies)
  })
  useAppStore.getState().setSelection(
    copies
      .filter((c) => !(c.type === "text" && c.containerId !== null))
      .map((c) => c.id),
  )
}}
```

Add `expandIdsToCopyClosure` to the existing `@excalidraw-clone/scene` import in App.tsx.

- [ ] **Step 7: Run to verify green**

Run: `cd apps/web && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src apps/web/test/clipboard-attach.test.ts
git commit -m "web: Ctrl+C/X/V via native clipboard events; duplicate uses copy closure"
```

### Task 4: web — Ctrl+A select-all and arrow-key nudge

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Test: `apps/web/test/keyboard-shortcuts.test.ts`

**Interfaces:**

- Consumes: `expandIdsToFrameMembers` from `@excalidraw-clone/scene`; existing `attachShortcuts` structure.
- Produces: no new exports — behavior only.

- [ ] **Step 1: Write failing tests** — append to `apps/web/test/keyboard-shortcuts.test.ts` (inside the existing describe; `newText` joins the existing `@excalidraw-clone/scene` import):

```ts
it("Ctrl+A selects all unlocked elements, skipping bound labels", () => {
  const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const locked = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), locked: true }
  const label = { ...newText({ x: 2, y: 2, text: "hi" }), containerId: r.id }
  scene.mutate((draft) => {
    draft.push(r, locked, label)
  })
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }))
  expect(useAppStore.getState().selectedIds).toEqual([r.id])
})

it("ArrowRight nudges the selection by 1px; Shift+ArrowDown by 10px", () => {
  const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(r)
  })
  useAppStore.getState().setSelection([r.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
  expect(scene.getElements()[0]!.x).toBe(6)
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }))
  expect(scene.getElements()[0]!.y).toBe(15)
})

it("arrow keys with empty selection leave the scene untouched", () => {
  const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(r)
  })
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
  expect(scene.getElements()[0]!.x).toBe(5)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/keyboard-shortcuts.test.ts`
Expected: 3 new tests FAIL (Ctrl+A currently does nothing; arrows do nothing).

- [ ] **Step 3: Implement** — in `apps/web/src/keyboard/shortcuts.ts`, add `expandIdsToFrameMembers` to the `@excalidraw-clone/scene` import, then insert after the delete/backspace branch (before the trailing tool-key mapping):

```ts
if (isMeta && key === "a") {
  e.preventDefault()
  const all = scene
    .getElements()
    .filter((el) => !el.locked && !(el.type === "text" && el.containerId !== null))
    .map((el) => el.id)
  useAppStore.getState().setSelection(all)
  return
}
if (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright") {
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 0) return
  e.preventDefault()
  const step = e.shiftKey ? 10 : 1
  const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0
  const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0
  const moved = new Set(expandIdsToFrameMembers(ids, scene.getElements()))
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const el = draft[i]!
      if (moved.has(el.id)) draft[i] = { ...el, x: el.x + dx, y: el.y + dy }
    }
  })
  return
}
```

(`key` is already lowercased at the top of the handler.)

- [ ] **Step 4: Run to verify green**

Run: `cd apps/web && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts
git commit -m "web: Ctrl+A select-all and arrow-key nudge"
```

### Task 5: e2e + full gate

**Files:**

- Create: `apps/web/e2e/clipboard.spec.ts`

**Interfaces:** consumes everything above through the running app; no new exports.

- [ ] **Step 1: Write the spec** — create `apps/web/e2e/clipboard.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.use({ permissions: ["clipboard-read", "clipboard-write"] })

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  text?: string
  containerId?: string | null
  boundElements?: { id: string; type: string }[] | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const moveMouseOnCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + at.x, box.y + at.y)
}

const drawRect = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

test("select-all, copy, paste at the cursor doubles the rects", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 140, y: 140 })
  await drawRect(page, { x: 180, y: 100 }, { x: 220, y: 140 })

  await page.keyboard.press("Control+KeyA")
  await page.keyboard.press("Control+KeyC")
  await moveMouseOnCanvas(page, { x: 500, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(4)
  // payload bbox (100,100)-(220,140), center (160,120) → pasted at (500,300): offset (+340,+180)
  const xs = rects.map((r) => Math.round(r.x)).sort((a, b) => a - b)
  expect(xs).toEqual([100, 180, 440, 520])
})

test("cut removes the originals and paste restores them", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 150, y: 150 })

  await page.keyboard.press("Control+KeyA")
  await page.keyboard.press("Control+KeyX")
  await page.waitForTimeout(300)
  expect((await readScene(page)).filter((e) => e.type === "rectangle").length).toBe(0)

  await moveMouseOnCanvas(page, { x: 400, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)
  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(1)
  expect(Math.round(rects[0]!.x)).toBe(375)
  expect(Math.round(rects[0]!.y)).toBe(275)
})

test("copying a labeled shape brings the label with remapped ids", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 180 })

  const canvas = page.locator("canvas").first()
  const box = (await canvas.boundingBox())!
  await page.mouse.dblclick(box.x + 150, box.y + 140)
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("hi")
  await page.mouse.click(box.x + 500, box.y + 400)
  await page.waitForTimeout(300)

  await dragOnCanvas(page, { x: 150, y: 140 }, { x: 150, y: 140 }) // click-select the rect
  await page.waitForTimeout(120)
  await page.keyboard.press("Control+KeyC")
  await moveMouseOnCanvas(page, { x: 450, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const rects = els.filter((e) => e.type === "rectangle")
  const texts = els.filter((e) => e.type === "text")
  expect(rects.length).toBe(2)
  expect(texts.length).toBe(2)
  const newRect = rects.find((r) => Math.round(r.x) !== 100)!
  const newText = texts.find((t) => t.containerId === newRect.id)!
  expect(newText.text).toBe("hi")
  expect(newRect.boundElements?.[0]?.id).toBe(newText.id)
})

test("pasting plain text creates a text element at the cursor", async ({ page }) => {
  await freshCanvas(page)
  await page.evaluate(() => navigator.clipboard.writeText("hello canvas"))
  await moveMouseOnCanvas(page, { x: 300, y: 200 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const texts = (await readScene(page)).filter((e) => e.type === "text")
  expect(texts.length).toBe(1)
  expect(texts[0]!.text).toBe("hello canvas")
  expect(Math.round(texts[0]!.x)).toBe(300)
  expect(Math.round(texts[0]!.y)).toBe(200)
})
```

Contingency: if a real `Control+KeyV` press does not deliver clipboard content in headless CI, replace the press with a synthetic event carrying the same data:

```ts
await page.evaluate((text) => {
  const dt = new DataTransfer()
  dt.setData("text/plain", text)
  document.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
  )
}, payloadText)
```

(get `payloadText` via `navigator.clipboard.readText()` after the copy press).

- [ ] **Step 2: Run the spec**

Run: `cd apps/web && pnpm exec playwright test e2e/clipboard.spec.ts`
Expected: 4 tests PASS.

- [ ] **Step 3: Full gate**

Run from repo root: `rtk lint`, `pnpm turbo typecheck`, `pnpm turbo test`, then `cd apps/web && pnpm exec playwright test`.
Expected: all PASS (41 e2e total: 37 existing + 4 new).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/clipboard.spec.ts
git commit -m "web: clipboard e2e — copy/paste, cut, labeled closure, plain text"
```

---

## After all tasks

superpowers:finishing-a-development-branch — FF-merge `develop` → `main`, push both, record memory.
