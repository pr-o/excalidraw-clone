# Multi-Page / Multi-Scene Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single excalidraw-clone document contain multiple pages, each an independent canvas with its own elements, undo/redo history, and pan/zoom viewport, navigable via a new bottom `PagesTabBar`.

**Architecture:** Bump the on-disk/localStorage format to v3 (`ExcalidrawData.pages: ExcalidrawPage[]` + `activePageId`, replacing the flat `elements` array). `Scene` becomes format-agnostic (its `toJSON`/`loadFromJSON` operate on a page-scoped `SceneSnapshot`, not the document type). `App.tsx` holds one `Scene` instance per page inside a `PageRecord[]` array plus `activePageId`; the currently-rendered `scene` is derived from those two pieces of state. Page-list mutations (add/delete/rename/duplicate/reorder/switch) are pure functions in a new `apps/web/src/driver/pages.ts` module, kept separate from React state for testability.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest, Playwright, pnpm/turbo monorepo. No new dependencies.

## Global Constraints

- Full gate (`pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, and the e2e suite under `apps/web/e2e`) must be green after every task's commit — each task lands the app in a fully working state, not a partial one.
- Match existing code style exactly: no semicolons, double quotes, 2-space indent (Prettier-enforced — run `pnpm format` if in doubt).
- Follow TDD: write the failing test first, confirm it fails for the expected reason, then implement.
- No new runtime dependencies. `crypto.randomUUID()` (already used elsewhere in this codebase, e.g. `packages/scene/src/clone.ts`) and `nanoid` (already a dependency of `@excalidraw-clone/scene`, used in `packages/scene/src/factories.ts`) are the only id generators needed.
- Driver files under `apps/web/src/driver/` follow this repo's existing convention of having **no dedicated unit tests** for files that are thin DOM/IO glue (e.g. `hydration.ts`, `openFile.ts`, `saveFile.ts`, `exportPNG.ts`, `autoSave.ts` — none have unit tests today). Do not invent new unit tests for these; their behavior is covered by the e2e suite (Task 4) and by `pnpm typecheck`. Pure-logic modules (`apps/web/src/driver/pages.ts`) DO get full unit test coverage, since they contain real branching logic worth testing in isolation.

---

## Task 1: Multi-page data model & persistence foundation

**Rationale for this task's size:** `ExcalidrawData`'s shape change (flat `elements` → `pages` + `activePageId`) ripples through every layer that touches the document format — `Scene.toJSON`/`loadFromJSON`, migrations, localStorage load, file save/open, and PNG embed — because they all import and rely on the same type. These must land in one commit; splitting them would leave an intermediate commit that doesn't typecheck. This task makes the app work exactly as it does today (still effectively single-page from the user's perspective — no add/switch/delete UI yet) but on the new v3 foundation. Task 3 adds the actual multi-page UX on top of this.

**Files:**

- Modify: `packages/scene/src/types.ts`
- Modify: `packages/scene/src/json.ts`
- Modify: `packages/scene/src/scene.ts`
- Create: `packages/scene/src/pages.ts`
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/test/scene-json.test.ts` (rewrite)
- Test: `packages/scene/test/pages.test.ts` (new)
- Modify: `packages/persistence/src/migrations.ts`
- Modify: `packages/persistence/src/local-store.ts`
- Modify: `packages/persistence/src/file-io.ts`
- Modify: `packages/persistence/src/index.ts`
- Test: `packages/persistence/test/migrations.test.ts` (extend/rewrite)
- Test: `packages/persistence/test/local-store.test.ts` (extend/rewrite)
- Test: `packages/persistence/test/file-io.test.ts` (rewrite)
- Create: `apps/web/src/driver/pages.ts` (foundation subset: `PageRecord`, `DEFAULT_VIEWPORT`, `createPageRecord`, `pagesFromDocument`)
- Test: `apps/web/test/pages-driver.test.ts` (new, foundation subset)
- Modify: `apps/web/src/driver/hydration.ts`
- Modify: `apps/web/src/driver/openFile.ts`
- Modify: `apps/web/src/driver/saveFile.ts`
- Modify: `apps/web/src/driver/exportPNG.ts`
- Modify: `apps/web/src/driver/autoSave.ts`
- Modify: `apps/web/src/components/App.tsx`

**Interfaces:**

- Produces (used by Task 2 and Task 3):
  - `ExcalidrawPage { id: string; name: string; elements: readonly ExcalidrawElement[] }` (`packages/scene`)
  - `SceneSnapshot { elements: readonly ExcalidrawElement[]; appState?: ExcalidrawAppStateSnapshot; files?: ExcalidrawFiles }` (`packages/scene`)
  - `ExcalidrawData { type: "excalidraw"; version: 3; source: string; pages: readonly ExcalidrawPage[]; activePageId: string; appState?; files? }` (`packages/scene`)
  - `newPage(name: string, elements?: readonly ExcalidrawElement[]): ExcalidrawPage` (`packages/scene`)
  - `buildExcalidrawData(pages: readonly ExcalidrawPage[], activePageId: string, appState?, files?): ExcalidrawData` (`packages/scene`)
  - `Scene.toJSON(appState?, files?): SceneSnapshot`, `Scene.loadFromJSON(data: SceneSnapshot): { appState?; files? }` (`packages/scene`)
  - `serializeDocument(pages: readonly DocumentPage[], activePageId: string, appState?, files?): ExcalidrawData` where `DocumentPage { id: string; name: string; scene: Scene }` (`packages/persistence`)
  - `migrate(raw: unknown): ExcalidrawData` — now migrates all the way to v3 (`packages/persistence`, signature unchanged, behavior extended)
  - `PageRecord { id: string; name: string; scene: Scene; viewport: ViewTransform }`, `DEFAULT_VIEWPORT: ViewTransform`, `createPageRecord(name: string, elements?: readonly ExcalidrawElement[]): PageRecord`, `pagesFromDocument(data: ExcalidrawData): { pages: PageRecord[]; activePageId: string }` (`apps/web/src/driver/pages.ts`)
  - `hydratePages(): { pages: PageRecord[]; activePageId: string }` (`apps/web/src/driver/hydration.ts`)
  - `openExcalidrawFromPicker(renderer: CanvasRenderer | null): Promise<ExcalidrawData | null>` (`apps/web/src/driver/openFile.ts`, dropped the `scene` param)
  - `saveAsExcalidraw(pages: readonly PageRecord[], activePageId: string, filename?: string): Promise<void>` (`apps/web/src/driver/saveFile.ts`)
  - `startAutoSave(pages: readonly PageRecord[], activePageId: string): () => void` (`apps/web/src/driver/autoSave.ts`)

### Step 1: Write the failing test for `Scene.toJSON`/`loadFromJSON` on the new `SceneSnapshot` shape

Replace the entire contents of `packages/scene/test/scene-json.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { Scene, newRectangle } from "../src"
import type { SceneSnapshot } from "../src"

describe("Scene.toJSON", () => {
  it("empty scene serializes to an elements-only snapshot", () => {
    const s = new Scene()
    const data = s.toJSON()
    expect(data).toEqual({ elements: [] })
  })

  it("includes appState and files when provided", () => {
    const s = new Scene()
    const appState = { zoom: 2 }
    const files = {
      f1: {
        id: "f1",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,AAAA",
        created: 0,
      },
    }
    const data = s.toJSON(appState, files)
    expect(data.appState).toEqual(appState)
    expect(data.files).toEqual(files)
  })

  it("omits appState/files when not provided", () => {
    const data = new Scene().toJSON()
    expect(data.appState).toBeUndefined()
    expect(data.files).toBeUndefined()
  })
})

describe("Scene.loadFromJSON", () => {
  it("replaces elements", () => {
    const s = new Scene()
    const r = newRectangle({ x: 0, y: 0 })
    const data: SceneSnapshot = { elements: [r] }
    s.loadFromJSON(data)
    expect(s.getElements()).toEqual([r])
  })

  it("returns embedded appState and files opaquely", () => {
    const s = new Scene()
    const data: SceneSnapshot = {
      elements: [],
      appState: { custom: "value" },
      files: { f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 } },
    }
    const out = s.loadFromJSON(data)
    expect(out.appState).toEqual({ custom: "value" })
    expect(out.files?.f1?.id).toBe("f1")
  })

  it("resets history (canUndo false immediately after load)", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    expect(s.canUndo()).toBe(true)
    s.loadFromJSON({ elements: [] })
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})

describe("Scene round-trip", () => {
  it("loadFromJSON(toJSON()) round-trips elements", () => {
    const s1 = new Scene()
    const r1 = newRectangle({ x: 1, y: 2, width: 3, height: 4 })
    const r2 = newRectangle({ x: 5, y: 6 })
    s1.mutate((d) => {
      d.push(r1, r2)
    })
    const data = s1.toJSON()

    const s2 = new Scene()
    s2.loadFromJSON(data)
    expect(s2.getElements()).toEqual([r1, r2])
  })

  it("custom appState round-trips opaquely", () => {
    const original: SceneSnapshot = {
      elements: [],
      appState: { theme: "dark", arbitraryUnknownKey: 42 },
    }
    const s = new Scene()
    const out = s.loadFromJSON(original)
    expect(out.appState).toEqual(original.appState)
    const reSerialized = s.toJSON(out.appState, out.files)
    expect(reSerialized.appState).toEqual(original.appState)
  })
})
```

Create `packages/scene/test/pages.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newPage, newRectangle } from "../src"

describe("newPage", () => {
  it("creates a page with a generated id, the given name, and empty elements by default", () => {
    const page = newPage("Page 1")
    expect(typeof page.id).toBe("string")
    expect(page.id.length).toBeGreaterThan(0)
    expect(page.name).toBe("Page 1")
    expect(page.elements).toEqual([])
  })

  it("accepts initial elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const page = newPage("Page 1", [r])
    expect(page.elements).toEqual([r])
  })

  it("generates unique ids across calls", () => {
    const a = newPage("A")
    const b = newPage("B")
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] Write both test files exactly as above.

### Step 2: Run the new/changed scene tests to confirm they fail

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: FAIL — `scene-json.test.ts` fails because `Scene.toJSON()` still returns the old `{ type, version, source, elements }` shape (extra fields, and `data.appState`/`data.files` checks may pass but the shape assertion `toEqual({ elements: [] })` fails). `pages.test.ts` fails because `newPage` is not exported from `../src` yet.

- [ ] Run the command above and confirm both failure modes.

### Step 3: Update the data model in `packages/scene/src/types.ts`

Add these two new interfaces (place them near `ExcalidrawData`, after `ExcalidrawFiles`):

```ts
export interface ExcalidrawPage {
  id: string
  name: string
  elements: readonly ExcalidrawElement[]
}

export interface SceneSnapshot {
  elements: readonly ExcalidrawElement[]
  appState?: ExcalidrawAppStateSnapshot
  files?: ExcalidrawFiles
}
```

Replace the existing `ExcalidrawData` interface:

```ts
export interface ExcalidrawData {
  type: "excalidraw"
  version: 3
  source: string
  pages: readonly ExcalidrawPage[]
  activePageId: string
  appState?: ExcalidrawAppStateSnapshot
  files?: ExcalidrawFiles
}
```

- [ ] Make this edit.

### Step 4: Update `packages/scene/src/json.ts`

Replace the entire file:

```ts
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawFiles,
  ExcalidrawPage,
} from "./types"

export const SCENE_FORMAT_VERSION = 3 as const
export const SCENE_FORMAT_SOURCE = "https://excalidraw-clone.local"

export const buildExcalidrawData = (
  pages: readonly ExcalidrawPage[],
  activePageId: string,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData => ({
  type: "excalidraw",
  version: SCENE_FORMAT_VERSION,
  source: SCENE_FORMAT_SOURCE,
  pages,
  activePageId,
  ...(appState ? { appState } : {}),
  ...(files ? { files } : {}),
})
```

- [ ] Make this edit.

### Step 5: Create `packages/scene/src/pages.ts`

```ts
import { nanoid } from "nanoid"
import type { ExcalidrawElement, ExcalidrawPage } from "./types"

export const newPage = (
  name: string,
  elements: readonly ExcalidrawElement[] = [],
): ExcalidrawPage => ({
  id: nanoid(),
  name,
  elements,
})
```

- [ ] Create this file.

### Step 6: Update `packages/scene/src/scene.ts`

Change the imports at the top of the file from:

```ts
import { reconcileBindings } from "./bindings"
import { reconcileFrameMembership } from "./frames"
import { buildExcalidrawData } from "./json"
import { reconcileBoundText } from "./reconcile-bound-text"
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawElement,
  ExcalidrawFiles,
} from "./types"
```

to:

```ts
import { reconcileBindings } from "./bindings"
import { reconcileFrameMembership } from "./frames"
import { reconcileBoundText } from "./reconcile-bound-text"
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawElement,
  ExcalidrawFiles,
  SceneSnapshot,
} from "./types"
```

Replace the `toJSON`/`loadFromJSON` methods (currently using `ExcalidrawData`/`buildExcalidrawData`) with:

```ts
  toJSON(appState?: ExcalidrawAppStateSnapshot, files?: ExcalidrawFiles): SceneSnapshot {
    return {
      elements: this.elements,
      ...(appState ? { appState } : {}),
      ...(files ? { files } : {}),
    }
  }

  loadFromJSON(data: SceneSnapshot): {
    appState?: ExcalidrawAppStateSnapshot
    files?: ExcalidrawFiles
  } {
    this.setElements(data.elements)
    this.resetHistory(data.elements)
    return {
      ...(data.appState ? { appState: data.appState } : {}),
      ...(data.files ? { files: data.files } : {}),
    }
  }
```

- [ ] Make this edit.

### Step 7: Update `packages/scene/src/index.ts` exports

Add `newPage` to the factories export block — change:

```ts
export {
  newArrow,
  newDiamond,
  newEllipse,
  newFrame,
  newFreedraw,
  newHexagon,
  newImage,
  newLabelFor,
  newLabelForLinear,
  newLine,
  newNote,
  NOTE_BG_COLOR,
  newOctagon,
  newParallelogram,
  newPentagon,
  newRectangle,
  newText,
  newTriangle,
} from "./factories"
```

Add a new export line right after it:

```ts
export { newPage } from "./pages"
```

In the final `export type { ... } from "./types"` block, add `ExcalidrawPage` and `SceneSnapshot` (alphabetically):

```ts
export type {
  Arrowhead,
  BoundElement,
  ElementType,
  ExcalidrawAppStateSnapshot,
  ExcalidrawArrowElement,
  ExcalidrawBinaryFile,
  ExcalidrawData,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFiles,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawHexagonElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawLinearBase,
  ExcalidrawOctagonElement,
  ExcalidrawPage,
  ExcalidrawParallelogramElement,
  ExcalidrawPentagonElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  ExcalidrawTriangleElement,
  FillStyle,
  FontFamily,
  PointBinding,
  Roughness,
  Roundness,
  SceneSnapshot,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
  VerticalAlign,
} from "./types"
```

- [ ] Make this edit.

### Step 8: Run scene package tests to confirm green

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS — all tests including the two rewritten/new files.

Run: `pnpm --filter @excalidraw-clone/scene typecheck`
Expected: PASS.

- [ ] Run both and confirm.

### Step 9: Write the failing test for migration v2→v3

Replace the entire contents of `packages/persistence/test/migrations.test.ts`:

```ts
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/migrations"

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = async (name: string): Promise<unknown> => {
  const text = await readFile(join(HERE, "fixtures", name), "utf8")
  return JSON.parse(text) as unknown
}

describe("migrate", () => {
  it("v1 input migrates all the way to v3 (through v2's boundElements fix)", async () => {
    const v1 = await fixture("v1-rect.json")
    const v2Expected = (await fixture("v2-rect.json")) as { elements: unknown[] }
    const result = migrate(v1)
    expect(result.version).toBe(3)
    expect(result.pages.length).toBe(1)
    expect(result.pages[0]?.elements).toEqual(v2Expected.elements)
    expect(result.activePageId).toBe(result.pages[0]?.id)
  })

  it("v2 input wraps its flat elements into a single named page", async () => {
    const v2 = (await fixture("v2-rect.json")) as { elements: unknown[] }
    const result = migrate(v2)
    expect(result.version).toBe(3)
    expect(result.pages).toEqual([
      { id: result.activePageId, name: "Page 1", elements: v2.elements },
    ])
  })

  it("v3 input is returned unchanged (already current)", () => {
    const v3 = {
      type: "excalidraw" as const,
      version: 3 as const,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    }
    expect(migrate(v3)).toEqual(v3)
  })

  it("throws on unknown payload shape", () => {
    expect(() => migrate({ foo: "bar" })).toThrow(/unrecognized/i)
  })

  it("throws on version newer than current", () => {
    expect(() =>
      migrate({ type: "excalidraw", version: 99, source: "x", pages: [], activePageId: "x" }),
    ).toThrow(/newer/i)
  })
})
```

- [ ] Write this test file exactly as above.

### Step 10: Run persistence migration tests to confirm they fail

Run: `pnpm --filter @excalidraw-clone/persistence test -- migrations`
Expected: FAIL — no `v2ToV3` migration registered yet; `migrate()` on v1/v2 input still stops at version 2 today, so `result.version`/`result.pages` assertions fail (`pages` is `undefined`).

- [ ] Run and confirm.

### Step 11: Implement the v2→v3 migration in `packages/persistence/src/migrations.ts`

Replace the entire file:

```ts
import { SCENE_FORMAT_VERSION, type ExcalidrawData } from "@excalidraw-clone/scene"

interface AnyData {
  type: "excalidraw"
  version: number
  source: string
  elements?: unknown[]
  pages?: unknown[]
  activePageId?: string
  [key: string]: unknown
}

type MigrationFn = (data: AnyData) => AnyData

const v1ToV2: MigrationFn = (data) => ({
  ...data,
  version: 2,
  elements: ((data.elements as Record<string, unknown>[] | undefined) ?? []).map((el) => {
    if (
      el.type === "rectangle" ||
      el.type === "diamond" ||
      el.type === "ellipse" ||
      el.type === "frame"
    ) {
      return { ...el, boundElements: el.boundElements ?? [] }
    }
    return el
  }),
})

const v2ToV3: MigrationFn = (data) => {
  const { elements, ...rest } = data
  const pageId = crypto.randomUUID()
  return {
    ...rest,
    version: 3,
    pages: [{ id: pageId, name: "Page 1", elements: elements ?? [] }],
    activePageId: pageId,
  }
}

const MIGRATIONS: Record<number, MigrationFn> = {
  1: v1ToV2,
  2: v2ToV3,
}

export function migrate(raw: unknown): ExcalidrawData {
  if (!isAnyData(raw)) {
    throw new Error("migrate: unrecognized .excalidraw payload")
  }
  if (raw.version > SCENE_FORMAT_VERSION) {
    throw new Error(
      `migrate: file version ${raw.version} is newer than supported ${SCENE_FORMAT_VERSION}`,
    )
  }
  let cur: AnyData = raw
  while (cur.version < SCENE_FORMAT_VERSION) {
    const fn = MIGRATIONS[cur.version]
    if (!fn) throw new Error(`migrate: no migration registered for version ${cur.version}`)
    cur = fn(cur)
  }
  return cur as unknown as ExcalidrawData
}

function isAnyData(v: unknown): v is AnyData {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  if (
    obj.type !== "excalidraw" ||
    typeof obj.version !== "number" ||
    typeof obj.source !== "string"
  ) {
    return false
  }
  return Array.isArray(obj.elements) || Array.isArray(obj.pages)
}
```

- [ ] Make this edit.

### Step 12: Run persistence migration tests to confirm green

Run: `pnpm --filter @excalidraw-clone/persistence test -- migrations`
Expected: PASS.

- [ ] Run and confirm.

### Step 13: Write the failing test for `local-store.ts` migrate-on-load

Replace the entire contents of `packages/persistence/test/local-store.test.ts`:

```ts
import { newRectangle, type ExcalidrawData } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { clearLocal, loadScene, loadUI, saveScene, saveUI } from "../src/local-store"

const sampleData = (): ExcalidrawData => ({
  type: "excalidraw",
  version: 3,
  source: "https://excalidraw-clone.local",
  pages: [
    {
      id: "p1",
      name: "Page 1",
      elements: [newRectangle({ x: 10, y: 20, width: 100, height: 50 })],
    },
  ],
  activePageId: "p1",
})

describe("local-store: scene", () => {
  it("loadScene returns null when key missing", () => {
    expect(loadScene()).toBeNull()
  })

  it("saveScene then loadScene round-trips", () => {
    const data = sampleData()
    saveScene(data)
    const restored = loadScene()
    expect(restored?.pages.length).toBe(1)
    expect(restored?.pages[0]?.elements[0]?.type).toBe("rectangle")
  })

  it("loadScene returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem("excalidraw-scene", "{not-json")
    expect(loadScene()).toBeNull()
  })

  it("loadScene returns null when payload shape is wrong", () => {
    localStorage.setItem("excalidraw-scene", JSON.stringify({ type: "wrong" }))
    expect(loadScene()).toBeNull()
  })

  it("loadScene migrates an older (v2) saved scene instead of discarding it", () => {
    const v2 = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw-clone.local",
      elements: [newRectangle({ x: 0, y: 0, width: 10, height: 10 })],
    }
    localStorage.setItem("excalidraw-scene", JSON.stringify(v2))
    const restored = loadScene()
    expect(restored?.version).toBe(3)
    expect(restored?.pages[0]?.elements.length).toBe(1)
  })
})

describe("local-store: ui", () => {
  it("saveUI then loadUI round-trips", () => {
    saveUI({ theme: "dark", zenMode: true })
    expect(loadUI()).toEqual({ theme: "dark", zenMode: true })
  })

  it("loadUI returns null on parse error", () => {
    localStorage.setItem("excalidraw-ui", "garbage")
    expect(loadUI()).toBeNull()
  })
})

describe("local-store: clearLocal", () => {
  it("removes both keys", () => {
    saveScene(sampleData())
    saveUI({ theme: "dark" })
    clearLocal()
    expect(loadScene()).toBeNull()
    expect(loadUI()).toBeNull()
  })
})
```

- [ ] Write this test file exactly as above.

### Step 14: Run local-store tests to confirm they fail

Run: `pnpm --filter @excalidraw-clone/persistence test -- local-store`
Expected: FAIL — `sampleData()` no longer matches what `loadScene()`'s strict version check accepts in the old implementation (in fact it will currently pass since version literal matches, but the NEW "migrates an older (v2) saved scene" test fails: today's `loadScene()` returns `null` for a `version: 2` payload instead of migrating it).

- [ ] Run and confirm the migrate-on-load test specifically fails.

### Step 15: Fix `packages/persistence/src/local-store.ts`

Replace the entire file:

```ts
import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

const SCENE_KEY = "excalidraw-scene"
const UI_KEY = "excalidraw-ui"

export function saveScene(data: ExcalidrawData): void {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage disabled — silent. Caller can't do anything useful.
  }
}

export function loadScene(): ExcalidrawData | null {
  const raw = localStorage.getItem(SCENE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return migrate(parsed)
  } catch {
    return null
  }
}

export function saveUI(snapshot: Record<string, unknown>): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore
  }
}

export function loadUI(): Record<string, unknown> | null {
  const raw = localStorage.getItem(UI_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function clearLocal(): void {
  localStorage.removeItem(SCENE_KEY)
  localStorage.removeItem(UI_KEY)
}
```

This removes the old `isExcalidrawData` strict-version guard entirely — `migrate()` already validates structural shape and throws on anything unrecognized, which the surrounding `try/catch` turns into `null`, exactly matching prior externally-observable behavior for garbage input while now also handling the "valid but older version" case correctly instead of silently discarding it.

- [ ] Make this edit.

### Step 16: Run persistence tests to confirm green

Run: `pnpm --filter @excalidraw-clone/persistence test -- local-store`
Expected: PASS.

- [ ] Run and confirm.

### Step 17: Write the failing test for `serializeDocument`

Replace the entire contents of `packages/persistence/test/file-io.test.ts`:

```ts
import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { parseExcalidrawFile, serializeDocument, toExcalidrawBlob } from "../src/file-io"

describe("serializeDocument", () => {
  it("returns ExcalidrawData v3 with one page per DocumentPage entry", () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const data = serializeDocument([{ id: "p1", name: "Page 1", scene }], "p1")
    expect(data.type).toBe("excalidraw")
    expect(data.version).toBe(3)
    expect(data.activePageId).toBe("p1")
    expect(data.pages).toEqual([
      { id: "p1", name: "Page 1", elements: scene.getElementsIncludingDeleted() },
    ])
  })

  it("includes appState and files when provided", () => {
    const scene = new Scene()
    const data = serializeDocument(
      [{ id: "p1", name: "Page 1", scene }],
      "p1",
      { theme: "dark" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 } },
    )
    expect(data.appState).toEqual({ theme: "dark" })
    expect(data.files?.f1?.id).toBe("f1")
  })

  it("serializes multiple pages in order", () => {
    const s1 = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const s2 = new Scene()
    const data = serializeDocument(
      [
        { id: "p1", name: "Page 1", scene: s1 },
        { id: "p2", name: "Page 2", scene: s2 },
      ],
      "p2",
    )
    expect(data.pages.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(data.activePageId).toBe("p2")
  })
})

describe("toExcalidrawBlob", () => {
  it("returns a Blob with type application/json", () => {
    const blob = toExcalidrawBlob({
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    })
    expect(blob.type).toBe("application/json")
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("parseExcalidrawFile", () => {
  it("parses a v3 file directly", async () => {
    const data = {
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    }
    const file = new File([JSON.stringify(data)], "test.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out).toEqual(data)
  })

  it("migrates a v1 file on open, all the way to v3", async () => {
    const data = { type: "excalidraw", version: 1, source: "x", elements: [] }
    const file = new File([JSON.stringify(data)], "old.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out.version).toBe(3)
    expect(out.pages.length).toBe(1)
  })

  it("rejects malformed JSON", async () => {
    const file = new File(["{not-json"], "bad.excalidraw", { type: "application/json" })
    await expect(parseExcalidrawFile(file)).rejects.toThrow(/parse/i)
  })

  it("rejects non-excalidraw shape", async () => {
    const file = new File([JSON.stringify({ foo: "bar" })], "bad.excalidraw", {
      type: "application/json",
    })
    await expect(parseExcalidrawFile(file)).rejects.toThrow(/unrecognized/i)
  })
})
```

- [ ] Write this test file exactly as above.

### Step 18: Run persistence file-io tests to confirm they fail

Run: `pnpm --filter @excalidraw-clone/persistence test -- file-io`
Expected: FAIL — `serializeDocument` is not exported from `../src/file-io` yet (only `serializeScene` exists).

- [ ] Run and confirm.

### Step 19: Implement `serializeDocument` in `packages/persistence/src/file-io.ts`

Replace the entire file:

```ts
import {
  buildExcalidrawData,
  type ExcalidrawAppStateSnapshot,
  type ExcalidrawData,
  type ExcalidrawFiles,
  type Scene,
} from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

export interface DocumentPage {
  id: string
  name: string
  scene: Scene
}

export function serializeDocument(
  pages: readonly DocumentPage[],
  activePageId: string,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData {
  const pageData = pages.map((p) => ({
    id: p.id,
    name: p.name,
    elements: p.scene.getElementsIncludingDeleted(),
  }))
  return buildExcalidrawData(pageData, activePageId, appState, files)
}

export function toExcalidrawBlob(data: ExcalidrawData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function parseExcalidrawFile(file: File): Promise<ExcalidrawData> {
  let text: string
  try {
    text = await file.text()
  } catch (err) {
    throw new Error(`parseExcalidrawFile: failed to read file: ${String(err)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("parseExcalidrawFile: failed to parse JSON")
  }
  return migrate(parsed)
}
```

- [ ] Make this edit.

### Step 20: Update `packages/persistence/src/index.ts` exports

Change:

```ts
// File I/O
export { download, parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "./file-io"
```

to:

```ts
// File I/O
export { download, parseExcalidrawFile, serializeDocument, toExcalidrawBlob } from "./file-io"
export type { DocumentPage } from "./file-io"
```

- [ ] Make this edit.

### Step 21: Run persistence tests and typecheck to confirm green

Run: `pnpm --filter @excalidraw-clone/persistence test`
Expected: PASS (all files).

Run: `pnpm --filter @excalidraw-clone/persistence typecheck`
Expected: PASS.

- [ ] Run both and confirm.

### Step 22: Write the failing test for the `apps/web` page-record foundation

Create `apps/web/test/pages-driver.test.ts`:

```ts
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { createPageRecord, DEFAULT_VIEWPORT, pagesFromDocument } from "../src/driver/pages"

describe("createPageRecord", () => {
  it("creates a page record with a fresh Scene, a generated id, and the given name", () => {
    const record = createPageRecord("Page 1")
    expect(record.name).toBe("Page 1")
    expect(typeof record.id).toBe("string")
    expect(record.scene.getElements()).toEqual([])
    expect(record.viewport).toEqual(DEFAULT_VIEWPORT)
  })

  it("seeds the Scene with the given elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const record = createPageRecord("Page 1", [r])
    expect(record.scene.getElements()).toEqual([r])
  })
})

describe("pagesFromDocument", () => {
  it("builds one PageRecord per page in the document, preserving order and activePageId", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const data = {
      type: "excalidraw" as const,
      version: 3 as const,
      source: "x",
      pages: [
        { id: "p1", name: "Page 1", elements: [r] },
        { id: "p2", name: "Page 2", elements: [] },
      ],
      activePageId: "p2",
    }
    const { pages, activePageId } = pagesFromDocument(data)
    expect(pages.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(pages[0]?.name).toBe("Page 1")
    expect(pages[0]?.scene.getElements()).toEqual([r])
    expect(activePageId).toBe("p2")
  })
})
```

- [ ] Write this test file exactly as above.

### Step 23: Run the new test to confirm it fails

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: FAIL — `../src/driver/pages` does not exist yet.

- [ ] Run and confirm.

### Step 24: Create `apps/web/src/driver/pages.ts` (foundation subset)

```ts
"use client"
import type { ViewTransform } from "@excalidraw-clone/geometry"
import {
  newPage,
  Scene,
  type ExcalidrawData,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"

export interface PageRecord {
  id: string
  name: string
  scene: Scene
  viewport: ViewTransform
}

export const DEFAULT_VIEWPORT: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

export function createPageRecord(
  name: string,
  elements: readonly ExcalidrawElement[] = [],
): PageRecord {
  const page = newPage(name, elements)
  return {
    id: page.id,
    name: page.name,
    scene: new Scene(page.elements),
    viewport: DEFAULT_VIEWPORT,
  }
}

export function pagesFromDocument(data: ExcalidrawData): {
  pages: PageRecord[]
  activePageId: string
} {
  const pages = data.pages.map((p) => ({
    id: p.id,
    name: p.name,
    scene: new Scene(p.elements),
    viewport: DEFAULT_VIEWPORT,
  }))
  return { pages, activePageId: data.activePageId }
}
```

- [ ] Create this file.

### Step 25: Run the pages-driver test to confirm green

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: PASS.

- [ ] Run and confirm.

### Step 26: Update `apps/web/src/driver/hydration.ts`

Replace the entire file:

```ts
"use client"
import { getAllFiles, loadScene, loadUI } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ToolName } from "@excalidraw-clone/tools"
import type { Locale } from "../store/slices/i18n"
import type { Theme } from "../store/slices/theme"
import { useAppStore } from "../store"
import { createPageRecord, pagesFromDocument, type PageRecord } from "./pages"

export function hydratePages(): { pages: PageRecord[]; activePageId: string } {
  const data = loadScene()
  if (!data) {
    const page = createPageRecord("Page 1")
    return { pages: [page], activePageId: page.id }
  }
  return pagesFromDocument(data)
}

export function hydrateUI(): void {
  const ui = loadUI()
  if (!ui) return
  const store = useAppStore.getState()
  if (typeof ui.theme === "string") store.setTheme(ui.theme as Theme)
  if (typeof ui.locale === "string") store.setLocale(ui.locale as Locale)
  if (typeof ui.gridEnabled === "boolean" && ui.gridEnabled !== store.gridEnabled) {
    store.toggleGrid()
  }
  if (typeof ui.canvasBg === "string") store.setCanvasBg(ui.canvasBg)
  if (typeof ui.zenMode === "boolean" && ui.zenMode !== store.zenMode) store.toggleZenMode()
  if (typeof ui.activeTool === "string") store.setActiveTool(ui.activeTool as ToolName)
}

export async function preloadFiles(renderer: CanvasRenderer | null): Promise<void> {
  if (!renderer) return
  const files = await getAllFiles()
  for (const f of files) {
    void renderer.preloadImage(f.id, f.dataURL)
  }
}
```

- [ ] Make this edit.

### Step 27: Update `apps/web/src/driver/openFile.ts`

Replace the entire file:

```ts
"use client"
import {
  extractTextChunk,
  migrate,
  parseExcalidrawFile,
  PNG_EXCALIDRAW_KEYWORD,
  putFile,
} from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ExcalidrawData } from "@excalidraw-clone/scene"

export async function openExcalidrawFromPicker(
  renderer: CanvasRenderer | null,
): Promise<ExcalidrawData | null> {
  const file = await pickFile(".excalidraw,.png,application/json,image/png")
  if (!file) return null
  const data = await readSceneFromFile(file)
  if (!data) return null
  if (data.files) {
    for (const id of Object.keys(data.files)) {
      const f = data.files[id]!
      await putFile(f)
      void renderer?.preloadImage(id, f.dataURL)
    }
  }
  return data
}

async function readSceneFromFile(file: File): Promise<ExcalidrawData | null> {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
  if (!isPng) return parseExcalidrawFile(file)

  const text = await extractTextChunk(file, PNG_EXCALIDRAW_KEYWORD)
  if (!text) {
    throw new Error("openFile: PNG has no embedded Excalidraw scene")
  }
  return migrate(JSON.parse(text))
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
```

The caller (`App.tsx`, Step 30) is now responsible for rebuilding `pages`/`activePageId` state from the returned `ExcalidrawData`, rather than this function mutating an existing `Scene` in place — opening a file replaces the whole document, not just the active page.

- [ ] Make this edit.

### Step 28: Update `apps/web/src/driver/saveFile.ts`

Replace the entire file:

```ts
"use client"
import {
  download,
  getAllFiles,
  serializeDocument,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawFiles } from "@excalidraw-clone/scene"
import type { PageRecord } from "./pages"

export async function saveAsExcalidraw(
  pages: readonly PageRecord[],
  activePageId: string,
  filename = "drawing.excalidraw",
): Promise<void> {
  const filesArr = await getAllFiles()
  const filesRecord = Object.fromEntries(filesArr.map((f) => [f.id, f])) as ExcalidrawFiles
  const data = serializeDocument(pages, activePageId, undefined, filesRecord)
  const blob = toExcalidrawBlob(data)
  download(blob, filename)
}
```

- [ ] Make this edit.

### Step 29: Update `apps/web/src/driver/exportPNG.ts` and `apps/web/src/driver/autoSave.ts`

In `exportPNG.ts`, change the imports from:

```ts
import {
  embedTextChunk,
  getFile,
  PNG_EXCALIDRAW_KEYWORD,
  serializeScene,
} from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
```

to:

```ts
import { embedTextChunk, getFile, PNG_EXCALIDRAW_KEYWORD } from "@excalidraw-clone/persistence"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import { buildExcalidrawData, newPage, type Scene } from "@excalidraw-clone/scene"
```

Change the `embedScene` block at the end of `exportToPNG` from:

```ts
if (opts.embedScene) {
  const json = JSON.stringify(serializeScene(scene))
  return embedTextChunk(blob, PNG_EXCALIDRAW_KEYWORD, json)
}
return blob
```

to:

```ts
if (opts.embedScene) {
  const page = newPage("Page 1", scene.getElementsIncludingDeleted())
  const json = JSON.stringify(buildExcalidrawData([page], page.id))
  return embedTextChunk(blob, PNG_EXCALIDRAW_KEYWORD, json)
}
return blob
```

A PNG export only ever rasterizes the single active page, so its embedded round-trip data is deliberately a fresh single-page document (a new page id is synthesized on export) — opening a PNG later restores exactly what it visually represents, one page. This keeps `exportToPNG`'s public signature (`scene, opts, canvasBg`) completely unchanged, so `apps/web/src/components/Dialogs.tsx` (its only caller) needs no changes.

Replace the entire contents of `apps/web/src/driver/autoSave.ts`:

```ts
"use client"
import {
  createAutoSaver,
  saveScene,
  saveUI,
  serializeDocument,
} from "@excalidraw-clone/persistence"
import { useAppStore } from "../store"
import type { PageRecord } from "./pages"

export function startAutoSave(pages: readonly PageRecord[], activePageId: string): () => void {
  const saver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      saveScene(serializeDocument(pages, activePageId))
      const s = useAppStore.getState()
      saveUI({
        theme: s.theme,
        locale: s.locale,
        gridEnabled: s.gridEnabled,
        gridSize: s.gridSize,
        canvasBg: s.canvasBg,
        zenMode: s.zenMode,
        activeTool: s.activeTool,
      })
    },
  })

  const unsubScenes = pages.map((p) => p.scene.subscribe(() => saver.schedule()))
  const unsubStore = useAppStore.subscribe(() => saver.schedule())

  const onBeforeUnload = (): void => saver.flushNow()
  window.addEventListener("beforeunload", onBeforeUnload)

  return () => {
    for (const unsub of unsubScenes) unsub()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    saver.dispose()
  }
}
```

- [ ] Make all of these edits.

### Step 30: Update `apps/web/src/components/App.tsx`

Change the driver imports (lines 44-50) from:

```ts
import { startAutoSave } from "../driver/autoSave"
import { hydrateScene, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { openExcalidrawFromPicker } from "../driver/openFile"
import { patchScene } from "../driver/patchScene"
import { saveAsExcalidraw } from "../driver/saveFile"
```

to:

```ts
import { startAutoSave } from "../driver/autoSave"
import { hydratePages, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import { pagesFromDocument, type PageRecord } from "../driver/pages"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { openExcalidrawFromPicker } from "../driver/openFile"
import { patchScene } from "../driver/patchScene"
import { saveAsExcalidraw } from "../driver/saveFile"
```

Inside `Inner()`, replace:

```ts
const scene = useMemo(() => hydrateScene(), [])
useEffect(() => {
  hydrateUI()
}, [])
useEffect(() => {
  return startAutoSave(scene)
}, [scene])
useEffect(() => {
  return attachShortcuts({ scene })
}, [scene])
useEffect(() => {
  return attachClipboard({ scene })
}, [scene])
```

with:

```ts
const initialDoc = useMemo(() => hydratePages(), [])
const [pages, setPages] = useState<PageRecord[]>(initialDoc.pages)
const [activePageId, setActivePageId] = useState<string>(initialDoc.activePageId)
const scene = useMemo(() => pages.find((p) => p.id === activePageId)!.scene, [pages, activePageId])
useEffect(() => {
  hydrateUI()
}, [])
useEffect(() => {
  return startAutoSave(pages, activePageId)
}, [pages, activePageId])
useEffect(() => {
  return attachShortcuts({ scene })
}, [scene])
useEffect(() => {
  return attachClipboard({ scene })
}, [scene])
```

Update the `onOpenFile` and `onSaveFile` callbacks passed to `HamburgerMenu`. Change:

```ts
              onOpenFile={() => {
                void openExcalidrawFromPicker(scene, renderer)
              }}
              onSaveFile={() => {
                void saveAsExcalidraw(scene)
              }}
```

to:

```ts
              onOpenFile={() => {
                void (async () => {
                  const data = await openExcalidrawFromPicker(renderer)
                  if (!data) return
                  const opened = pagesFromDocument(data)
                  setPages(opened.pages)
                  setActivePageId(opened.activePageId)
                })()
              }}
              onSaveFile={() => {
                void saveAsExcalidraw(pages, activePageId)
              }}
```

Nothing else in `App.tsx` changes in this task: `PropertiesPanel`, `LayersPanel`, `LibraryPanel`, the zoom controls, `Dialogs`, `PaletteHost`, and `TextEditingOverlay` all keep consuming the same `scene` variable they did before — it's just now derived from `pages`/`activePageId` instead of being a single `useMemo`.

- [ ] Make these edits.

### Step 31: Run the full repo-wide gate to confirm Task 1 is green

Run: `pnpm typecheck`
Expected: PASS (13/13 packages).

Run: `pnpm test`
Expected: PASS (all unit tests across all packages).

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS — all existing e2e specs still pass unchanged (this task must not change any user-visible behavior; it's a pure internal refactor to the new data model).

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all four and confirm green. Fix any fallout before proceeding.

### Step 32: Commit

```bash
git add packages/scene/src/types.ts packages/scene/src/json.ts packages/scene/src/scene.ts \
  packages/scene/src/pages.ts packages/scene/src/index.ts \
  packages/scene/test/scene-json.test.ts packages/scene/test/pages.test.ts \
  packages/persistence/src/migrations.ts packages/persistence/src/local-store.ts \
  packages/persistence/src/file-io.ts packages/persistence/src/index.ts \
  packages/persistence/test/migrations.test.ts packages/persistence/test/local-store.test.ts \
  packages/persistence/test/file-io.test.ts \
  apps/web/src/driver/pages.ts apps/web/test/pages-driver.test.ts \
  apps/web/src/driver/hydration.ts apps/web/src/driver/openFile.ts \
  apps/web/src/driver/saveFile.ts apps/web/src/driver/exportPNG.ts \
  apps/web/src/driver/autoSave.ts apps/web/src/components/App.tsx
git commit -m "scene+persistence+web: multi-page data model (v3 format), Scene decoupled from document shape"
```

- [ ] Commit.

---

## Task 2: `PagesTabBar` UI component

**Files:**

- Create: `packages/ui/src/PagesTabBar.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/test/PagesTabBar.test.tsx`

**Interfaces:**

- Consumes: nothing from Task 1 beyond plain data (`{ id: string; name: string }[]`) — no dependency on `PageRecord`, `Scene`, or any scene-package type. This keeps the component pure UI, matching how `LayersPanel`/`MoreShapesMenu` take plain props.
- Produces (used by Task 3): `PagesTabBar` component with props `{ t, pages: readonly {id,name}[], activePageId: string, onSwitch: (id: string) => void, onAdd: () => void, onDelete: (id: string) => void, onRename: (id: string, name: string) => void, onDuplicate: (id: string) => void, onReorder: (id: string, direction: "left"|"right") => void, className?: string }`.

### Step 1: Write the failing test

Create `packages/ui/test/PagesTabBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PagesTabBar } from "../src/PagesTabBar"

const t = (key: string): string => key

const pages = [
  { id: "p1", name: "Page 1" },
  { id: "p2", name: "Page 2" },
]

const handlers = {
  onSwitch: vi.fn(),
  onAdd: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onReorder: vi.fn(),
}

describe("PagesTabBar", () => {
  it("renders one tab per page", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-tab-p1")).toBeInTheDocument()
    expect(screen.getByTestId("page-tab-p2")).toBeInTheDocument()
  })

  it("clicking a tab calls onSwitch with its id", async () => {
    const onSwitch = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onSwitch={onSwitch} />)
    await userEvent.click(screen.getByTestId("page-switch-p2"))
    expect(onSwitch).toHaveBeenCalledWith("p2")
  })

  it("clicking + calls onAdd", async () => {
    const onAdd = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onAdd={onAdd} />)
    await userEvent.click(screen.getByTestId("page-add"))
    expect(onAdd).toHaveBeenCalled()
  })

  it("delete is disabled when only one page remains", () => {
    render(<PagesTabBar t={t} pages={[pages[0]!]} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-delete-p1")).toBeDisabled()
  })

  it("delete is enabled with multiple pages and calls onDelete with the id", async () => {
    const onDelete = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDelete={onDelete} />)
    await userEvent.click(screen.getByTestId("page-delete-p2"))
    expect(onDelete).toHaveBeenCalledWith("p2")
  })

  it("clicking duplicate calls onDuplicate with the id", async () => {
    const onDuplicate = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDuplicate={onDuplicate} />,
    )
    await userEvent.click(screen.getByTestId("page-duplicate-p1"))
    expect(onDuplicate).toHaveBeenCalledWith("p1")
  })

  it("reorder-left is disabled for the first tab, reorder-right disabled for the last", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-reorder-left-p1")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p2")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p1")).not.toBeDisabled()
  })

  it("clicking reorder-right calls onReorder with the id and direction", async () => {
    const onReorder = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onReorder={onReorder} />,
    )
    await userEvent.click(screen.getByTestId("page-reorder-right-p1"))
    expect(onReorder).toHaveBeenCalledWith("p1", "right")
  })

  it("double-clicking a tab name enters rename mode, Enter commits via onRename", async () => {
    const onRename = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onRename={onRename} />)
    await userEvent.dblClick(screen.getByTestId("page-switch-p1"))
    const input = screen.getByTestId("page-rename-input-p1")
    await userEvent.clear(input)
    await userEvent.type(input, "Renamed{Enter}")
    expect(onRename).toHaveBeenCalledWith("p1", "Renamed")
  })
})
```

- [ ] Write this test file exactly as above.

### Step 2: Run test to confirm it fails

Run: `pnpm --filter @excalidraw-clone/ui test -- PagesTabBar`
Expected: FAIL with "Cannot find module '../src/PagesTabBar'".

- [ ] Run and confirm.

### Step 3: Create `packages/ui/src/PagesTabBar.tsx`

```tsx
import { useState } from "react"

export interface PagesTabBarProps {
  t: (key: string) => string
  pages: readonly { id: string; name: string }[]
  activePageId: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: "left" | "right") => void
  className?: string
}

export function PagesTabBar({
  t,
  pages,
  activePageId,
  onSwitch,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
  onReorder,
  className,
}: PagesTabBarProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")

  const startRename = (id: string, currentName: string): void => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string): void => {
    if (draftName.trim().length > 0) onRename(id, draftName.trim())
    setEditingId(null)
  }

  return (
    <nav
      aria-label={t("pages.title")}
      data-testid="pages-tab-bar"
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-1 overflow-x-auto bg-white px-2 py-1 shadow-lg ${className ?? ""}`}
    >
      {pages.map((page, index) => {
        const active = page.id === activePageId
        const editing = editingId === page.id
        return (
          <div
            key={page.id}
            data-testid={`page-tab-${page.id}`}
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs ${
              active ? "bg-violet-100" : "hover:bg-gray-50"
            }`}
          >
            <button
              type="button"
              data-testid={`page-reorder-left-${page.id}`}
              aria-label={t("pages.moveLeft")}
              disabled={index === 0}
              onClick={() => onReorder(page.id, "left")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ◀
            </button>

            {editing ? (
              <input
                autoFocus
                data-testid={`page-rename-input-${page.id}`}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => commitRename(page.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(page.id)
                  if (e.key === "Escape") setEditingId(null)
                }}
                className="w-24 rounded border border-gray-300 px-1"
              />
            ) : (
              <button
                type="button"
                data-testid={`page-switch-${page.id}`}
                onClick={() => onSwitch(page.id)}
                onDoubleClick={() => startRename(page.id, page.name)}
                className="max-w-[8rem] truncate"
              >
                {page.name}
              </button>
            )}

            <button
              type="button"
              data-testid={`page-reorder-right-${page.id}`}
              aria-label={t("pages.moveRight")}
              disabled={index === pages.length - 1}
              onClick={() => onReorder(page.id, "right")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ▶
            </button>

            <button
              type="button"
              data-testid={`page-duplicate-${page.id}`}
              aria-label={t("pages.duplicate")}
              title={t("pages.duplicate")}
              onClick={() => onDuplicate(page.id)}
              className="rounded px-0.5 hover:bg-gray-100"
            >
              ⧉
            </button>

            <button
              type="button"
              data-testid={`page-delete-${page.id}`}
              aria-label={t("pages.delete")}
              title={t("pages.delete")}
              disabled={pages.length === 1}
              onClick={() => onDelete(page.id)}
              className="rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        )
      })}

      <button
        type="button"
        data-testid="page-add"
        aria-label={t("pages.add")}
        title={t("pages.add")}
        onClick={onAdd}
        className="shrink-0 rounded px-2 py-1 text-xs hover:bg-gray-100"
      >
        +
      </button>
    </nav>
  )
}
```

- [ ] Create this file.

### Step 4: Export from `packages/ui/src/index.ts`

Add at the end of the file:

```ts
export { PagesTabBar } from "./PagesTabBar"
export type { PagesTabBarProps } from "./PagesTabBar"
```

- [ ] Make this edit.

### Step 5: Run tests to confirm green

Run: `pnpm --filter @excalidraw-clone/ui test -- PagesTabBar`
Expected: PASS (all 9 tests).

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

- [ ] Run both and confirm.

### Step 6: Commit

```bash
git add packages/ui/src/PagesTabBar.tsx packages/ui/src/index.ts packages/ui/test/PagesTabBar.test.tsx
git commit -m "ui: add PagesTabBar component"
```

- [ ] Commit.

---

## Task 3: Wire multi-page UX into the app (switch/add/delete/rename/duplicate/reorder + shortcuts + i18n)

**Files:**

- Modify: `apps/web/src/driver/pages.ts` (add page-list operations)
- Test: `apps/web/test/pages-driver.test.ts` (extend)
- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (extend)
- Modify: `apps/web/src/components/App.tsx`
- Modify: `packages/ui/src/HelpDialog.tsx`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`

**Interfaces:**

- Consumes: `PageRecord`, `DEFAULT_VIEWPORT`, `createPageRecord` (Task 1); `PagesTabBar` (Task 2).
- Produces (used by Task 4's e2e test): `data-testid`s `pages-tab-bar`, `page-tab-{id}`, `page-switch-{id}`, `page-add`, `page-delete-{id}`, `page-duplicate-{id}`, `page-reorder-left-{id}`, `page-reorder-right-{id}`, `page-rename-input-{id}` (all from Task 2's component, now actually rendered); the keyboard shortcuts Alt+PageDown / Alt+PageUp.

### Step 1: Write the failing tests for the new page-list operations

First, change the existing top-of-file import from `../src/driver/pages` in `apps/web/test/pages-driver.test.ts` (written in Task 1, Step 22) from:

```ts
import { createPageRecord, DEFAULT_VIEWPORT, pagesFromDocument } from "../src/driver/pages"
```

to:

```ts
import {
  addPage,
  createPageRecord,
  cyclePageId,
  DEFAULT_VIEWPORT,
  deletePage,
  duplicatePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
} from "../src/driver/pages"
```

Then append these new `describe` blocks after the existing ones (do not add any other new `import` statements — everything they need, including `newRectangle`, is already imported at the top of this file from Task 1):

```ts
describe("addPage", () => {
  it("appends a new page named 'Page N' where N is the next count", () => {
    const a = createPageRecord("Page 1")
    const result = addPage([a])
    expect(result.length).toBe(2)
    expect(result[1]?.name).toBe("Page 2")
    expect(result[0]).toBe(a)
  })
})

describe("deletePage", () => {
  it("removes the page with the given id", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = deletePage([a, b], a.id)
    expect(result).toEqual([b])
  })

  it("refuses to delete the last remaining page", () => {
    const a = createPageRecord("Page 1")
    const result = deletePage([a], a.id)
    expect(result).toEqual([a])
  })
})

describe("renamePage", () => {
  it("renames only the matching page", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = renamePage([a, b], a.id, "Notes")
    expect(result[0]?.name).toBe("Notes")
    expect(result[1]?.name).toBe("Page 2")
  })
})

describe("duplicatePage", () => {
  it("inserts a clone with fresh ids right after the source page", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const a = createPageRecord("Page 1", [r])
    const b = createPageRecord("Page 2")
    const result = duplicatePage([a, b], a.id)
    expect(result.length).toBe(3)
    expect(result[1]?.name).toBe("Page 1 copy")
    expect(result[1]?.id).not.toBe(a.id)
    expect(result[1]?.scene.getElements()[0]?.id).not.toBe(r.id)
    expect(result[1]?.scene.getElements()[0]?.type).toBe("rectangle")
    expect(result[2]).toBe(b)
  })
})

describe("reorderPage", () => {
  it("swaps with the previous page when direction is 'left'", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = reorderPage([a, b], b.id, "left")
    expect(result).toEqual([b, a])
  })

  it("swaps with the next page when direction is 'right'", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = reorderPage([a, b], a.id, "right")
    expect(result).toEqual([b, a])
  })

  it("is a no-op past either edge", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(reorderPage([a, b], a.id, "left")).toEqual([a, b])
    expect(reorderPage([a, b], b.id, "right")).toEqual([a, b])
  })
})

describe("withViewport", () => {
  it("updates only the matching page's viewport", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const viewport = { scrollX: 10, scrollY: 20, zoom: 2 }
    const result = withViewport([a, b], a.id, viewport)
    expect(result[0]?.viewport).toEqual(viewport)
    expect(result[1]?.viewport).toEqual(DEFAULT_VIEWPORT)
  })
})

describe("cyclePageId", () => {
  it("returns the next page's id, wrapping past the end", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(cyclePageId([a, b], a.id, "next")).toBe(b.id)
    expect(cyclePageId([a, b], b.id, "next")).toBe(a.id)
  })

  it("returns the previous page's id, wrapping before the start", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(cyclePageId([a, b], a.id, "prev")).toBe(b.id)
    expect(cyclePageId([a, b], b.id, "prev")).toBe(a.id)
  })
})
```

Also add `cloneElementsWithNewIds` to the scene import at the top of the test file's existing import from `@excalidraw-clone/scene` (it already imports `newRectangle`; add `cloneElementsWithNewIds` is NOT needed in the test — only in the implementation. No test-file import changes beyond adding the new named imports from `../src/driver/pages` shown above).

- [ ] Add these test blocks.

### Step 2: Run to confirm failure

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: FAIL — `addPage`, `deletePage`, `renamePage`, `duplicatePage`, `reorderPage`, `withViewport`, `cyclePageId` are not exported from `../src/driver/pages` yet.

- [ ] Run and confirm.

### Step 3: Add the page-list operations to `apps/web/src/driver/pages.ts`

Change the import line to add `cloneElementsWithNewIds`:

```ts
import {
  cloneElementsWithNewIds,
  newPage,
  Scene,
  type ExcalidrawData,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
```

Append these functions to the end of the file:

```ts
export function addPage(pages: readonly PageRecord[]): PageRecord[] {
  return [...pages, createPageRecord(`Page ${pages.length + 1}`)]
}

export function deletePage(pages: readonly PageRecord[], id: string): PageRecord[] {
  if (pages.length <= 1) return [...pages]
  return pages.filter((p) => p.id !== id)
}

export function renamePage(pages: readonly PageRecord[], id: string, name: string): PageRecord[] {
  return pages.map((p) => (p.id === id ? { ...p, name } : p))
}

export function duplicatePage(pages: readonly PageRecord[], id: string): PageRecord[] {
  const index = pages.findIndex((p) => p.id === id)
  if (index === -1) return [...pages]
  const source = pages[index]!
  const copy = createPageRecord(
    `${source.name} copy`,
    cloneElementsWithNewIds(source.scene.getElements()),
  )
  const next = [...pages]
  next.splice(index + 1, 0, copy)
  return next
}

export function reorderPage(
  pages: readonly PageRecord[],
  id: string,
  direction: "left" | "right",
): PageRecord[] {
  const index = pages.findIndex((p) => p.id === id)
  const swapWith = direction === "left" ? index - 1 : index + 1
  if (index === -1 || swapWith < 0 || swapWith >= pages.length) return [...pages]
  const next = [...pages]
  const tmp = next[index]!
  next[index] = next[swapWith]!
  next[swapWith] = tmp
  return next
}

export function withViewport(
  pages: readonly PageRecord[],
  id: string,
  viewport: ViewTransform,
): PageRecord[] {
  return pages.map((p) => (p.id === id ? { ...p, viewport } : p))
}

export function cyclePageId(
  pages: readonly PageRecord[],
  activePageId: string,
  direction: "next" | "prev",
): string {
  const index = pages.findIndex((p) => p.id === activePageId)
  if (index === -1) return activePageId
  const delta = direction === "next" ? 1 : -1
  const nextIndex = (index + delta + pages.length) % pages.length
  return pages[nextIndex]!.id
}
```

- [ ] Make this edit.

### Step 4: Run to confirm green

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: PASS (all cases).

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

- [ ] Run both and confirm.

### Step 5: Write the failing test for keyboard shortcuts

Append to `apps/web/test/keyboard-shortcuts.test.ts` (inside the existing top-level `describe("keyboard shortcuts", ...)` block, as new `it`s — do not touch the existing `beforeEach`/`afterEach`):

```ts
it("Alt+PageDown calls onNextPage when provided", () => {
  detach()
  const onNextPage = vi.fn()
  detach = attachShortcuts({ scene, onNextPage })
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", altKey: true }))
  expect(onNextPage).toHaveBeenCalledTimes(1)
})

it("Alt+PageUp calls onPrevPage when provided", () => {
  detach()
  const onPrevPage = vi.fn()
  detach = attachShortcuts({ scene, onPrevPage })
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", altKey: true }))
  expect(onPrevPage).toHaveBeenCalledTimes(1)
})

it("Alt+PageDown without a handler does not throw", () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", altKey: true }))
})
```

Need `vi` imported in that test file already (`import { afterEach, beforeEach, describe, expect, it } from "vitest"` — add `vi`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
```

- [ ] Make these edits.

### Step 6: Run to confirm failure

Run: `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts`
Expected: FAIL — `attachShortcuts({ scene, onNextPage })` doesn't typecheck yet (`Bindings` has no `onNextPage` field), and Alt+PageDown/Alt+PageUp aren't handled.

- [ ] Run and confirm.

### Step 7: Implement Alt+PageDown/Alt+PageUp in `apps/web/src/keyboard/shortcuts.ts`

Change the `Bindings` interface from:

```ts
interface Bindings {
  scene: Scene
}
```

to:

```ts
interface Bindings {
  scene: Scene
  onNextPage?: () => void
  onPrevPage?: () => void
}
```

Change the function signature and add the new key handling. Change:

```ts
export function attachShortcuts({ scene }: Bindings): () => void {
```

to:

```ts
export function attachShortcuts({ scene, onNextPage, onPrevPage }: Bindings): () => void {
```

Add this block right after the `isMeta && key === "'"` (toggleGrid) block, before the `escape` check:

```ts
if (e.altKey && key === "pagedown") {
  e.preventDefault()
  onNextPage?.()
  return
}
if (e.altKey && key === "pageup") {
  e.preventDefault()
  onPrevPage?.()
  return
}
```

- [ ] Make this edit.

### Step 8: Run to confirm green

Run: `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts`
Expected: PASS.

- [ ] Run and confirm.

### Step 9: Add i18n strings

In `apps/web/src/locales/en/common.json`, add a new `pages` block right after the existing `layers` block (currently the last key in the file):

```json
  },
  "pages": {
    "title": "Pages",
    "add": "Add page",
    "rename": "Rename page",
    "delete": "Delete page",
    "duplicate": "Duplicate page",
    "moveLeft": "Move page left",
    "moveRight": "Move page right"
  }
}
```

(This replaces the file's final `  }\n}` with the block above — the `layers` object's closing `}` becomes the start of this snippet.)

In `apps/web/src/locales/ko/common.json`, the `layers` block is a single-line entry; add a `pages` block after it in the same style:

```json
  "layers": {
    "title": "레이어",
    "toggle": "레이어 패널 열고 닫기"
  },
  "pages": {
    "title": "페이지",
    "add": "페이지 추가",
    "rename": "페이지 이름 변경",
    "delete": "페이지 삭제",
    "duplicate": "페이지 복제",
    "moveLeft": "페이지 왼쪽으로 이동",
    "moveRight": "페이지 오른쪽으로 이동"
  }
```

In `apps/web/src/locales/en/shortcuts.json`, add two keys before the final closing brace:

```json
  "commandPalette": "Command palette",
  "help": "Help",
  "nextPage": "Next page",
  "prevPage": "Previous page"
}
```

In `apps/web/src/locales/ko/shortcuts.json`:

```json
  "commandPalette": "명령어 팔레트",
  "help": "도움말",
  "nextPage": "다음 페이지",
  "prevPage": "이전 페이지"
}
```

- [ ] Make all four edits.

### Step 10: Add the shortcut row to `HelpDialog`

In `packages/ui/src/HelpDialog.tsx`, add two entries to the end of `VIEW_SHORTCUTS`:

```ts
const VIEW_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Cmd/Ctrl+0", label: "shortcuts:zoomReset" },
  { keys: "Cmd/Ctrl++", label: "shortcuts:zoomIn" },
  { keys: "Cmd/Ctrl+-", label: "shortcuts:zoomOut" },
  { keys: "Space (hold)", label: "shortcuts:pan" },
  { keys: "Cmd/Ctrl+'", label: "shortcuts:toggleGrid" },
  { keys: "Cmd/Ctrl+/", label: "shortcuts:commandPalette" },
  { keys: "?", label: "shortcuts:help" },
  { keys: "Alt+PageDown", label: "shortcuts:nextPage" },
  { keys: "Alt+PageUp", label: "shortcuts:prevPage" },
]
```

- [ ] Make this edit.

### Step 11: Run the i18n/HelpDialog test to confirm nothing broke

Run: `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts`
Expected: PASS (unchanged — this test asserts specific translated strings are present, not an exact count, so adding two more rows doesn't affect it).

- [ ] Run and confirm.

### Step 12: Wire `PagesTabBar` and page-switching into `App.tsx`

Add to the import block from `@excalidraw-clone/ui` (currently `HamburgerMenu, LayersPanel, LibraryPanel, PropertiesPanel, Toolbar`):

```ts
import {
  HamburgerMenu,
  LayersPanel,
  LibraryPanel,
  PagesTabBar,
  PropertiesPanel,
  Toolbar,
} from "@excalidraw-clone/ui"
```

Change the import from `../driver/pages` (added in Task 1, Step 30) to also pull in the new operations:

```ts
import {
  addPage,
  cyclePageId,
  deletePage,
  DEFAULT_VIEWPORT,
  duplicatePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
  type PageRecord,
} from "../driver/pages"
```

Add `switchToPage` right after the `scene` derivation (from Task 1, Step 30):

```ts
const switchToPage = useCallback(
  (targetId: string): void => {
    if (targetId === activePageId) return
    const s = useAppStore.getState()
    setPages(
      withViewport(pages, activePageId, { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }),
    )
    const target = pages.find((p) => p.id === targetId)
    s.setView(target?.viewport ?? DEFAULT_VIEWPORT)
    setActivePageId(targetId)
    s.setSelection([])
  },
  [activePageId, pages],
)
```

Change the `attachShortcuts` effect from:

```ts
useEffect(() => {
  return attachShortcuts({ scene })
}, [scene])
```

to:

```ts
useEffect(() => {
  return attachShortcuts({
    scene,
    onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
    onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
  })
}, [scene, pages, activePageId, switchToPage])
```

Add the `PagesTabBar` element right after the closing `</LibraryPanel>` tag, still inside the `{!zenMode && (...)}` block:

```tsx
<PagesTabBar
  t={t}
  pages={pages}
  activePageId={activePageId}
  onSwitch={switchToPage}
  onAdd={() => {
    const updated = addPage(pages)
    setPages(updated)
    setActivePageId(updated[updated.length - 1]!.id)
  }}
  onDelete={(id) => {
    if (id === activePageId) {
      const fallback = pages.find((p) => p.id !== id)
      if (fallback) switchToPage(fallback.id)
    }
    setPages(deletePage(pages, id))
  }}
  onRename={(id, name) => setPages(renamePage(pages, id, name))}
  onDuplicate={(id) => {
    const updated = duplicatePage(pages, id)
    setPages(updated)
    const index = pages.findIndex((p) => p.id === id)
    setActivePageId(updated[index + 1]!.id)
  }}
  onReorder={(id, direction) => setPages(reorderPage(pages, id, direction))}
/>
```

- [ ] Make these edits.

### Step 13: Run the full repo-wide gate

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS (existing specs — the new `PagesTabBar` is now visible in the running app, but no existing e2e spec asserts on its absence, so nothing should break; if any spec's canvas-area click coordinates now land on the bottom tab bar, adjust that spec's coordinates, but none of the existing specs draw within ~40px of the viewport bottom edge).

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all four and confirm green.

### Step 14: Commit

```bash
git add apps/web/src/driver/pages.ts apps/web/test/pages-driver.test.ts \
  apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts \
  apps/web/src/components/App.tsx packages/ui/src/HelpDialog.tsx \
  apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json \
  apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json
git commit -m "web: wire PagesTabBar (add/delete/rename/duplicate/reorder/switch) and Alt+PageUp/Down shortcuts"
```

- [ ] Commit.

---

## Task 4: E2E test

**Files:**

- Create: `apps/web/e2e/pages.spec.ts`

**Interfaces:**

- Consumes: all `data-testid`s from Task 2/3 (`page-tab-{id}`, `page-switch-{id}`, `page-add`, `page-delete-{id}`, `page-rename-input-{id}`), the `excalidraw-scene` localStorage key's v3 shape (`{ pages: [...], activePageId }`) from Task 1, and the `dragOnCanvas` helper from `./_helpers` (already used by `layers-panel.spec.ts`).

### Step 1: Write the e2e spec

Create `apps/web/e2e/pages.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneDoc = {
  pages: {
    id: string
    name: string
    elements: { id: string; type: string; isDeleted?: boolean }[]
  }[]
  activePageId: string
}

const readDoc = async (page: Page): Promise<SceneDoc | null> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  if (json === null) return null
  return JSON.parse(json) as SceneDoc
}

test("pages: add, switch, rename, delete-guard, and localStorage round-trip", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Starts with exactly one page tab, delete disabled.
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  await expect(page.locator(`[data-testid="page-delete-${firstId}"]`)).toBeDisabled()

  // Draw a rectangle on page 1.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  // Add page 2; it auto-activates.
  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  const doc1 = await readDoc(page)
  const page2Id = doc1!.pages[1]!.id
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(page2Id)

  // Draw on page 2.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages.find((p) => p.id === page2Id)?.elements.filter((e) => !e.isDeleted).length
    })
    .toBe(1)

  // Switch back to page 1: its rectangle is still there.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(firstId)
  const docBack = await readDoc(page)
  const page1Elements = docBack!.pages
    .find((p) => p.id === firstId)!
    .elements.filter((e) => !e.isDeleted)
  expect(page1Elements.length).toBe(1)

  // Rename page 1.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).dblclick()
  const input = page.locator(`[data-testid="page-rename-input-${firstId}"]`)
  await input.fill("Notes")
  await input.press("Enter")
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages.find((p) => p.id === firstId)?.name
    })
    .toBe("Notes")

  // Alt+PageDown cycles to page 2.
  await page.keyboard.press("Alt+PageDown")
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(page2Id)

  // Reload: both pages, the rename, and the active page survive (localStorage round-trip).
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  const docAfterReload = await readDoc(page)
  expect(docAfterReload?.activePageId).toBe(page2Id)
  expect(docAfterReload?.pages.find((p) => p.id === firstId)?.name).toBe("Notes")

  // Delete guard: delete page 2 down to one page, then delete is disabled again.
  await page.locator(`[data-testid="page-delete-${page2Id}"]`).click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  await expect(page.locator(`[data-testid="page-delete-${firstId}"]`)).toBeDisabled()
})
```

- [ ] Create this file.

### Step 2: Run the new e2e spec to confirm it fails (or passes for the wrong reason) before Task 1-3 land

This spec is written last, after Tasks 1-3 are already committed, so it should pass on first run against the real implementation. Run it once to confirm:

Run: `pnpm --filter @excalidraw-clone/web exec playwright test pages.spec.ts`
Expected: PASS. If it fails, debug against the real app (`pnpm --filter @excalidraw-clone/web dev` and manually reproduce each step) rather than loosening the assertions.

- [ ] Run and confirm PASS.

### Step 3: Run the full e2e suite to confirm no regressions

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS — all specs including the new one.

- [ ] Run and confirm.

### Step 4: Run the full repo-wide gate one final time

Run: `pnpm typecheck && pnpm test && pnpm format:check`
Expected: PASS across the board.

- [ ] Run and confirm.

### Step 5: Commit

```bash
git add apps/web/e2e/pages.spec.ts
git commit -m "web: e2e coverage for multi-page add/switch/rename/delete/reorder and localStorage round-trip"
```

- [ ] Commit.

---

## Final verification (after Task 4)

Run the complete gate one more time from a clean state:

```bash
pnpm typecheck
pnpm test
pnpm --filter @excalidraw-clone/web exec playwright test
pnpm lint
pnpm format:check
```

All must exit 0. Then write the SDD-style completion report and update project memory noting: full gate status, which of the two prior deferred non-blocking follow-ups (PNG-embed-is-single-page-only behavior; no page thumbnails) are intentionally out of scope per the design spec, and the final commit hash.
