# Library Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only IndexedDB-backed library of reusable shape groups with a right-side `LibraryPanel`, click-then-place insertion, and `.excalidrawlib` v2 import/export.

**Architecture:** Three packages cooperate. `packages/scene` defines the `LibraryItem` type and a `normalizeToOrigin` element-translation helper. `packages/persistence` adds a shared `db.ts` (DB_VERSION=2 with `files` and `library_items` stores) and a new `library-store.ts` with CRUD + `.excalidrawlib` v2 serialization. `packages/ui` adds a prop-driven `LibraryPanel`. `apps/web` adds a `LibrarySlice` to the Zustand store for the "pending placement" tool state, wires the panel into `App.tsx`, and hooks the ghost-preview overlay + click-to-place handler into the existing drawing driver.

**Tech Stack:** TypeScript, React, Zustand, idb, vitest + fake-indexeddb (unit), Playwright (e2e), Tailwind (UI), Rough.js + RoughSVG (rendering).

**Spec:** `docs/superpowers/specs/2026-05-27-library-feature-design.md`

---

## Task 1: `LibraryItem` Type In `packages/scene`

**Files:**

- Create: `packages/scene/src/library-item.ts`
- Modify: `packages/scene/src/index.ts`

- [ ] **Step 1: Add the type**

Create `packages/scene/src/library-item.ts`:

```ts
import type { ExcalidrawBinaryFile, ExcalidrawElement } from "./types"

export interface LibraryItem {
  id: string
  name: string
  created: number
  elements: ExcalidrawElement[]
  files?: Record<string, ExcalidrawBinaryFile>
}
```

- [ ] **Step 2: Export it from the package barrel**

Edit `packages/scene/src/index.ts`. Add this export line near the other `export type` lines (alphabetical order if the file is sorted; otherwise just append):

```ts
export type { LibraryItem } from "./library-item"
```

- [ ] **Step 3: Typecheck**

Run from repo root: `pnpm -F @excalidraw-clone/scene typecheck`
Expected: pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/scene/src/library-item.ts packages/scene/src/index.ts
git commit -m "scene: add LibraryItem type"
```

---

## Task 2: `normalizeToOrigin` Helper In `packages/scene`

Translates a group of elements so the group's bounding-box min corner becomes `(0, 0)`. Used by add-from-selection and as the inverse during placement.

**Files:**

- Create: `packages/scene/src/normalize.ts`
- Create: `packages/scene/test/normalize.test.ts`
- Modify: `packages/scene/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/scene/test/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { normalizeToOrigin } from "../src/normalize"
import type { ExcalidrawElement } from "../src/types"

function rect(id: string, x: number, y: number, w: number, h: number): ExcalidrawElement {
  return { id, type: "rectangle", x, y, width: w, height: h } as unknown as ExcalidrawElement
}

describe("normalizeToOrigin", () => {
  it("translates a single element to (0,0)", () => {
    const [out] = normalizeToOrigin([rect("a", 50, 30, 10, 10)])
    expect(out.x).toBe(0)
    expect(out.y).toBe(0)
  })

  it("preserves relative positions across multiple elements", () => {
    const out = normalizeToOrigin([rect("a", 100, 50, 10, 10), rect("b", 130, 80, 10, 10)])
    expect(out[0].x).toBe(0)
    expect(out[0].y).toBe(0)
    expect(out[1].x).toBe(30)
    expect(out[1].y).toBe(30)
  })

  it("handles negative coordinates", () => {
    const out = normalizeToOrigin([rect("a", -20, -10, 10, 10), rect("b", 0, 0, 10, 10)])
    expect(out[0].x).toBe(0)
    expect(out[0].y).toBe(0)
    expect(out[1].x).toBe(20)
    expect(out[1].y).toBe(10)
  })

  it("returns a new array without mutating the input", () => {
    const input = [rect("a", 50, 30, 10, 10)]
    const before = input[0].x
    normalizeToOrigin(input)
    expect(input[0].x).toBe(before)
  })

  it("returns [] for an empty input", () => {
    expect(normalizeToOrigin([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run from repo root: `pnpm -F @excalidraw-clone/scene test -- normalize`
Expected: FAIL with "Cannot find module ../src/normalize".

- [ ] **Step 3: Implement `normalizeToOrigin`**

Create `packages/scene/src/normalize.ts`:

```ts
import type { ExcalidrawElement } from "./types"

export function normalizeToOrigin(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  if (elements.length === 0) return []
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (const el of elements) {
    if (el.x < minX) minX = el.x
    if (el.y < minY) minY = el.y
  }
  return elements.map((el) => ({ ...el, x: el.x - minX, y: el.y - minY }))
}
```

- [ ] **Step 4: Run tests; verify they pass**

Run: `pnpm -F @excalidraw-clone/scene test -- normalize`
Expected: PASS (5 tests).

- [ ] **Step 5: Export from package barrel**

Edit `packages/scene/src/index.ts`, add:

```ts
export { normalizeToOrigin } from "./normalize"
```

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/normalize.ts packages/scene/test/normalize.test.ts packages/scene/src/index.ts
git commit -m "scene: add normalizeToOrigin helper for library items"
```

---

## Task 3: Shared `db.ts` In Persistence; Migrate `image-store`

Factor a single DB module that owns `DB_VERSION = 2` and creates both `files` and `library_items` stores. `image-store.ts` switches to using the shared `getDB()`. Existing image-store tests continue to pass without modification.

**Files:**

- Create: `packages/persistence/src/db.ts`
- Modify: `packages/persistence/src/image-store.ts`

- [ ] **Step 1: Create the shared DB module**

Create `packages/persistence/src/db.ts`:

```ts
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import type { LibraryItem } from "@excalidraw-clone/scene"
import { type IDBPDatabase, openDB } from "idb"

export const DB_NAME = "excalidraw-clone"
export const DB_VERSION = 2
export const FILES_STORE = "files"
export const LIBRARY_STORE = "library_items"

export interface ExcalidrawDB {
  files: { key: string; value: ExcalidrawBinaryFile }
  library_items: { key: string; value: LibraryItem }
}

let dbPromise: Promise<IDBPDatabase<ExcalidrawDB>> | null = null

export function getDB(): Promise<IDBPDatabase<ExcalidrawDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<ExcalidrawDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
          db.createObjectStore(LIBRARY_STORE, { keyPath: "id" })
        }
      },
    })
  }
  return dbPromise
}

/** Test-only: close + drop the cached DB handle so `indexedDB.deleteDatabase()` isn't blocked. */
export async function _resetDBForTesting(): Promise<void> {
  if (dbPromise === null) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}
```

- [ ] **Step 2: Rewrite `image-store.ts` to use shared DB**

Replace `packages/persistence/src/image-store.ts` with:

```ts
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { blobToDataURL, sha256Hex } from "./binary"
import { FILES_STORE, getDB, _resetDBForTesting as _resetSharedDB } from "./db"

export async function putFile(file: ExcalidrawBinaryFile): Promise<void> {
  const db = await getDB()
  await db.put(FILES_STORE, file)
}

export async function getFile(id: string): Promise<ExcalidrawBinaryFile | undefined> {
  const db = await getDB()
  return (await db.get(FILES_STORE, id)) as ExcalidrawBinaryFile | undefined
}

export async function getAllFiles(): Promise<ExcalidrawBinaryFile[]> {
  const db = await getDB()
  return (await db.getAll(FILES_STORE)) as ExcalidrawBinaryFile[]
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(FILES_STORE, id)
}

export async function clearAllFiles(): Promise<void> {
  const db = await getDB()
  await db.clear(FILES_STORE)
}

export async function addImageFromBlob(blob: Blob): Promise<ExcalidrawBinaryFile> {
  const id = await sha256Hex(blob)
  const existing = await getFile(id)
  if (existing) return existing
  const dataURL = await blobToDataURL(blob)
  const file: ExcalidrawBinaryFile = {
    id,
    mimeType: blob.type !== "" ? blob.type : "application/octet-stream",
    dataURL,
    created: Date.now(),
  }
  await putFile(file)
  return file
}

/** Test-only: re-exported from the shared DB module for backward-compat with the existing test setup. */
export const _resetDBForTesting = _resetSharedDB
```

- [ ] **Step 3: Run existing image-store and migration tests**

Run: `pnpm -F @excalidraw-clone/persistence test`
Expected: PASS for all existing tests (33+ tests across 8 files unchanged).

If a migration test for v1 fails because `DB_VERSION` is now 2, that's expected — adjust ONLY the migration-version assertion in `migrations.test.ts` to expect `2`. Do NOT relax any other assertion.

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/db.ts packages/persistence/src/image-store.ts
git commit -m "persistence: factor shared db.ts with DB_VERSION=2 and library_items store"
```

---

## Task 4: `library-store.ts` Local CRUD (TDD)

Local CRUD only — no `.excalidrawlib` import/export yet (Task 5).

**Files:**

- Create: `packages/persistence/src/library-store.ts`
- Create: `packages/persistence/test/library-store.test.ts`
- Modify: `packages/persistence/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/persistence/test/library-store.test.ts`:

```ts
import type { LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  clearLibrary,
  deleteLibraryItem,
  getAllLibraryItems,
  getLibraryItem,
  putLibraryItem,
  renameLibraryItem,
} from "../src/library-store"

function item(id: string, name: string, created: number): LibraryItem {
  return {
    id,
    name,
    created,
    elements: [{ id: `${id}-el`, type: "rectangle", x: 0, y: 0, width: 10, height: 10 } as never],
  }
}

describe("library-store CRUD", () => {
  it("getLibraryItem returns undefined when missing", async () => {
    expect(await getLibraryItem("nope")).toBeUndefined()
  })

  it("putLibraryItem then getLibraryItem round-trips", async () => {
    const a = item("a", "A", 100)
    await putLibraryItem(a)
    expect(await getLibraryItem("a")).toEqual(a)
  })

  it("getAllLibraryItems returns newest-first by created", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 300))
    await putLibraryItem(item("c", "C", 200))
    const all = await getAllLibraryItems()
    expect(all.map((i) => i.id)).toEqual(["b", "c", "a"])
  })

  it("deleteLibraryItem removes a single record", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 200))
    await deleteLibraryItem("a")
    expect(await getLibraryItem("a")).toBeUndefined()
    expect(await getLibraryItem("b")).toBeDefined()
  })

  it("renameLibraryItem mutates only the name field", async () => {
    const a = item("a", "Old", 100)
    await putLibraryItem(a)
    await renameLibraryItem("a", "New")
    const got = await getLibraryItem("a")
    expect(got?.name).toBe("New")
    expect(got?.created).toBe(100)
    expect(got?.elements).toEqual(a.elements)
  })

  it("renameLibraryItem on a missing id is a no-op (does not throw)", async () => {
    await expect(renameLibraryItem("nope", "X")).resolves.toBeUndefined()
  })

  it("clearLibrary wipes the store", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 200))
    await clearLibrary()
    expect(await getAllLibraryItems()).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `pnpm -F @excalidraw-clone/persistence test -- library-store`
Expected: FAIL with "Cannot find module ../src/library-store".

- [ ] **Step 3: Implement `library-store.ts` CRUD**

Create `packages/persistence/src/library-store.ts`:

```ts
import type { LibraryItem } from "@excalidraw-clone/scene"
import { getDB, LIBRARY_STORE } from "./db"

export async function putLibraryItem(item: LibraryItem): Promise<void> {
  const db = await getDB()
  await db.put(LIBRARY_STORE, item)
}

export async function getLibraryItem(id: string): Promise<LibraryItem | undefined> {
  const db = await getDB()
  return (await db.get(LIBRARY_STORE, id)) as LibraryItem | undefined
}

export async function getAllLibraryItems(): Promise<LibraryItem[]> {
  const db = await getDB()
  const items = (await db.getAll(LIBRARY_STORE)) as LibraryItem[]
  return items.sort((a, b) => b.created - a.created)
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(LIBRARY_STORE, id)
}

export async function renameLibraryItem(id: string, name: string): Promise<void> {
  const existing = await getLibraryItem(id)
  if (!existing) return
  await putLibraryItem({ ...existing, name })
}

export async function clearLibrary(): Promise<void> {
  const db = await getDB()
  await db.clear(LIBRARY_STORE)
}
```

- [ ] **Step 4: Run tests; verify they pass**

Run: `pnpm -F @excalidraw-clone/persistence test -- library-store`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from persistence barrel**

Edit `packages/persistence/src/index.ts`. Add after the existing image-store exports:

```ts
// IndexedDB library
export {
  clearLibrary,
  deleteLibraryItem,
  getAllLibraryItems,
  getLibraryItem,
  putLibraryItem,
  renameLibraryItem,
} from "./library-store"
```

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/library-store.ts packages/persistence/test/library-store.test.ts packages/persistence/src/index.ts
git commit -m "persistence: add library-store with CRUD operations"
```

---

## Task 5: `.excalidrawlib` v2 Import & Export (TDD)

Adds `importLibraryFile` and `exportLibraryFile` plus `EXCALIDRAWLIB_VERSION = 2` constant.

**Files:**

- Modify: `packages/persistence/src/library-store.ts`
- Create: `packages/persistence/test/library-import-export.test.ts`
- Modify: `packages/persistence/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/persistence/test/library-import-export.test.ts`:

```ts
import type { ExcalidrawBinaryFile, LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { getAllFiles, putFile } from "../src/image-store"
import {
  exportLibraryFile,
  getAllLibraryItems,
  importLibraryFile,
  putLibraryItem,
} from "../src/library-store"

function item(id: string, fileIds: string[] = []): LibraryItem {
  return {
    id,
    name: `Item ${id}`,
    created: Number(id) || 100,
    elements: fileIds.map(
      (fid, i) =>
        ({
          id: `el-${id}-${i}`,
          type: "image",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fileId: fid,
        }) as never,
    ),
  }
}

const binA: ExcalidrawBinaryFile = {
  id: "binA",
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAAA",
  created: 1,
}

describe("exportLibraryFile", () => {
  it("emits an .excalidrawlib v2 blob with empty libraryItems for an empty store", async () => {
    const blob = await exportLibraryFile()
    const json = JSON.parse(await blob.text())
    expect(json.type).toBe("excalidrawlib")
    expect(json.version).toBe(2)
    expect(json.source).toBe("excalidraw-clone")
    expect(json.libraryItems).toEqual([])
    expect(json.files).toEqual({})
  })

  it("includes all stored items and unions their files", async () => {
    await putFile(binA)
    await putLibraryItem({ ...item("100", ["binA"]), files: { binA } })
    await putLibraryItem(item("200"))
    const blob = await exportLibraryFile()
    const json = JSON.parse(await blob.text())
    expect(json.libraryItems.map((i: LibraryItem) => i.id).sort()).toEqual(["100", "200"])
    expect(json.files.binA).toEqual(binA)
  })
})

describe("importLibraryFile", () => {
  it("adds well-formed items and reports counts", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "excalidraw-clone",
      libraryItems: [item("100"), item("200")],
      files: {},
    }
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" })
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 2, skipped: 0 })
    expect((await getAllLibraryItems()).length).toBe(2)
  })

  it("skips items whose ids already exist locally", async () => {
    await putLibraryItem(item("100"))
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100"), item("200")],
      files: {},
    }
    const blob = new Blob([JSON.stringify(file)])
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 1, skipped: 1 })
  })

  it("writes top-level files map into the canonical files store", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100", ["binA"])],
      files: { binA },
    }
    const blob = new Blob([JSON.stringify(file)])
    await importLibraryFile(blob)
    const all = await getAllFiles()
    expect(all.some((f) => f.id === "binA")).toBe(true)
  })

  it("attaches the referenced subset of files to each imported item row", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100", ["binA"])],
      files: { binA },
    }
    await importLibraryFile(new Blob([JSON.stringify(file)]))
    const items = await getAllLibraryItems()
    expect(items[0].files?.binA).toEqual(binA)
  })

  it("rejects malformed JSON without partial writes", async () => {
    const blob = new Blob(["not json at all"])
    await expect(importLibraryFile(blob)).rejects.toThrow(/parse|JSON/i)
    expect((await getAllLibraryItems()).length).toBe(0)
  })

  it("rejects wrong type or version without partial writes", async () => {
    const blob = new Blob([JSON.stringify({ type: "excalidraw", version: 2, libraryItems: [] })])
    await expect(importLibraryFile(blob)).rejects.toThrow(/excalidrawlib|format|version/i)
    expect((await getAllLibraryItems()).length).toBe(0)
  })

  it("round-trips: export then re-import yields no-op (all skipped)", async () => {
    await putLibraryItem(item("100"))
    await putLibraryItem(item("200"))
    const blob = await exportLibraryFile()
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 0, skipped: 2 })
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `pnpm -F @excalidraw-clone/persistence test -- library-import-export`
Expected: FAIL with "exportLibraryFile is not a function" / "importLibraryFile is not a function".

- [ ] **Step 3: Implement import & export**

Append to `packages/persistence/src/library-store.ts`:

```ts
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { getAllFiles, getFile, putFile } from "./image-store"

export const EXCALIDRAWLIB_VERSION = 2

interface ExcalidrawLibFile {
  type: "excalidrawlib"
  version: number
  source: string
  libraryItems: LibraryItem[]
  files: Record<string, ExcalidrawBinaryFile>
}

export async function exportLibraryFile(): Promise<Blob> {
  const libraryItems = await getAllLibraryItems()
  const files: Record<string, ExcalidrawBinaryFile> = {}
  for (const item of libraryItems) {
    if (!item.files) continue
    for (const [fid, bin] of Object.entries(item.files)) {
      files[fid] = bin
    }
  }
  const payload: ExcalidrawLibFile = {
    type: "excalidrawlib",
    version: EXCALIDRAWLIB_VERSION,
    source: "excalidraw-clone",
    libraryItems,
    files,
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
}

function collectFileIds(item: LibraryItem): string[] {
  const ids: string[] = []
  for (const el of item.elements) {
    const fid = (el as unknown as { fileId?: string }).fileId
    if (typeof fid === "string") ids.push(fid)
  }
  return ids
}

export async function importLibraryFile(blob: Blob): Promise<{ added: number; skipped: number }> {
  const text = await blob.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("importLibraryFile: failed to parse JSON")
  }
  const p = parsed as Partial<ExcalidrawLibFile>
  if (p.type !== "excalidrawlib") {
    throw new Error("importLibraryFile: not an excalidrawlib file")
  }
  if (p.version !== EXCALIDRAWLIB_VERSION) {
    throw new Error(`importLibraryFile: unsupported version ${String(p.version)}`)
  }
  if (!Array.isArray(p.libraryItems)) {
    throw new Error("importLibraryFile: libraryItems is not an array")
  }

  // Write top-level binaries to the canonical files store.
  const files = p.files ?? {}
  for (const bin of Object.values(files)) {
    await putFile(bin)
  }

  let added = 0
  let skipped = 0
  for (const item of p.libraryItems) {
    if (await getLibraryItem(item.id)) {
      skipped++
      continue
    }
    const referencedIds = collectFileIds(item)
    const itemFiles: Record<string, ExcalidrawBinaryFile> = {}
    for (const fid of referencedIds) {
      const bin = files[fid] ?? (await getFile(fid))
      if (bin) itemFiles[fid] = bin
    }
    await putLibraryItem({
      ...item,
      ...(Object.keys(itemFiles).length > 0 ? { files: itemFiles } : {}),
    })
    added++
  }
  return { added, skipped }
}
```

- [ ] **Step 4: Run tests; verify they pass**

Run: `pnpm -F @excalidraw-clone/persistence test -- library-import-export`
Expected: PASS (8 tests).

- [ ] **Step 5: Export from persistence barrel**

Edit `packages/persistence/src/index.ts`. Add to the library section:

```ts
export {
  clearLibrary,
  deleteLibraryItem,
  EXCALIDRAWLIB_VERSION,
  exportLibraryFile,
  getAllLibraryItems,
  getLibraryItem,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
} from "./library-store"
```

(replacing the partial set added in Task 4 step 5.)

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/library-store.ts packages/persistence/test/library-import-export.test.ts packages/persistence/src/index.ts
git commit -m "persistence: add .excalidrawlib v2 import/export"
```

---

## Task 6: `LibrarySlice` In The Zustand Store

The slice owns the in-memory list of items (so the panel re-renders reactively after add/delete/import) plus the `pendingItem` placement tool state. The slice is responsible for calling the persistence API.

**Files:**

- Create: `apps/web/src/store/slices/library.ts`
- Modify: `apps/web/src/store/index.ts`

- [ ] **Step 1: Create the slice**

Create `apps/web/src/store/slices/library.ts`:

```ts
import type { LibraryItem } from "@excalidraw-clone/scene"
import type { StateCreator } from "zustand"

export interface LibrarySlice {
  libraryItems: LibraryItem[]
  pendingItem: LibraryItem | null
  setLibraryItems: (items: LibraryItem[]) => void
  armLibraryItem: (item: LibraryItem) => void
  clearPendingItem: () => void
}

export const createLibrarySlice: StateCreator<LibrarySlice, [], [], LibrarySlice> = (set) => ({
  libraryItems: [],
  pendingItem: null,
  setLibraryItems: (items) => set({ libraryItems: items }),
  armLibraryItem: (item) => set({ pendingItem: item }),
  clearPendingItem: () => set({ pendingItem: null }),
})
```

- [ ] **Step 2: Register the slice in the root store**

Edit `apps/web/src/store/index.ts`:

1. Add the import (alongside the other slice imports):

```ts
import { createLibrarySlice, type LibrarySlice } from "./slices/library"
```

2. Add `LibrarySlice` to the `AppState` intersection:

```ts
export type AppState = ToolSlice &
  ThemeSlice &
  // ... other slices ...
  DispatchSlice &
  LibrarySlice
```

3. Spread `createLibrarySlice(...a)` into the `create()` body:

```ts
export const useAppStore = create<AppState>()((...a) => ({
  // ... existing slices ...
  ...createDispatchSlice(...a),
  ...createLibrarySlice(...a),
}))
```

- [ ] **Step 3: Typecheck**

Run from repo root: `pnpm -F web typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/slices/library.ts apps/web/src/store/index.ts
git commit -m "web: add LibrarySlice for library items and pending placement"
```

---

## Task 7: i18n Keys (en + ko)

Add the panel labels. Korean translations follow the existing pattern in `apps/web/src/locales/ko/common.json` (same key shape, translated values).

**Files:**

- Modify: `apps/web/src/locales/en/common.json`
- Modify: `apps/web/src/locales/ko/common.json`

- [ ] **Step 1: Add English keys**

Edit `apps/web/src/locales/en/common.json`. Add a new `library` block after the `shortcuts` block:

```json
  "library": {
    "title": "Library",
    "toggle": "Toggle library",
    "addFromSelection": "Add from selection",
    "empty": "Library is empty",
    "import": "Import library…",
    "export": "Export library",
    "rename": "Rename",
    "delete": "Delete",
    "imported": "{added} added, {skipped} skipped",
    "importError": "Could not read library file",
    "placing": "Click to place • Esc to cancel"
  }
```

- [ ] **Step 2: Add Korean keys**

Edit `apps/web/src/locales/ko/common.json`. Mirror the same structure:

```json
  "library": {
    "title": "라이브러리",
    "toggle": "라이브러리 열고 닫기",
    "addFromSelection": "선택 항목 추가",
    "empty": "라이브러리가 비어 있습니다",
    "import": "라이브러리 가져오기…",
    "export": "라이브러리 내보내기",
    "rename": "이름 변경",
    "delete": "삭제",
    "imported": "추가 {added}, 건너뜀 {skipped}",
    "importError": "라이브러리 파일을 읽을 수 없습니다",
    "placing": "클릭하여 배치 • Esc로 취소"
  }
```

- [ ] **Step 3: Verify both files are valid JSON**

Run from repo root: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/locales/en/common.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/locales/ko/common.json','utf8')); console.log('ok')"`
Expected output: `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: i18n keys for library feature"
```

---

## Task 8: `LibraryPanel` Component In `packages/ui`

Prop-driven component. Receives `items`, `selectedCount`, callbacks, and `t`. No store coupling — that lives at the app integration layer.

**Files:**

- Create: `packages/ui/src/LibraryPanel.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the component**

Create `packages/ui/src/LibraryPanel.tsx`:

```tsx
import type { LibraryItem } from "@excalidraw-clone/scene"
import { useState } from "react"

export interface LibraryPanelProps {
  t: (key: string, params?: Record<string, string | number>) => string
  open: boolean
  onToggle: () => void
  items: LibraryItem[]
  selectedCount: number
  onAddFromSelection: () => void
  onItemClick: (item: LibraryItem) => void
  onImport: () => void
  onExport: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** Returns inline SVG markup for a thumbnail. App wires this with the renderer. */
  renderThumbnail: (item: LibraryItem) => string
}

export function LibraryPanel(props: LibraryPanelProps): React.ReactElement {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const startRename = (item: LibraryItem): void => {
    setRenamingId(item.id)
    setDraftName(item.name)
    setMenuOpenId(null)
  }
  const commitRename = (id: string): void => {
    const trimmed = draftName.trim()
    if (trimmed !== "") props.onRename(id, trimmed)
    setRenamingId(null)
  }

  return (
    <aside
      aria-label={props.t("library.title")}
      data-testid="library-panel"
      className={`fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
        props.open ? "w-72" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={props.onToggle}
        aria-label={props.t("library.toggle")}
        aria-expanded={props.open}
        data-testid="library-toggle"
        className="flex h-10 w-10 items-center justify-center self-end border-b text-sm"
      >
        {props.open ? "›" : "‹"}
      </button>

      {props.open && (
        <>
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{props.t("library.title")}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={props.onImport}
                data-testid="library-import"
                className="rounded px-2 py-1 text-xs hover:bg-gray-100"
              >
                {props.t("library.import")}
              </button>
              <button
                type="button"
                onClick={props.onExport}
                data-testid="library-export"
                className="rounded px-2 py-1 text-xs hover:bg-gray-100"
              >
                {props.t("library.export")}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={props.selectedCount === 0}
            onClick={props.onAddFromSelection}
            data-testid="library-add"
            className="m-3 rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            + {props.t("library.addFromSelection")}
          </button>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {props.items.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-gray-500">
                {props.t("library.empty")}
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {props.items.map((item) => (
                  <li key={item.id} data-testid={`library-item-${item.id}`} className="relative">
                    <button
                      type="button"
                      onClick={() => props.onItemClick(item)}
                      aria-label={item.name}
                      className="flex h-20 w-full items-center justify-center rounded border bg-gray-50 p-1 hover:border-violet-500"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderer-controlled SVG
                      dangerouslySetInnerHTML={{ __html: props.renderThumbnail(item) }}
                    />
                    {renamingId === item.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitRename(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(item.id)
                          if (e.key === "Escape") setRenamingId(null)
                        }}
                        className="mt-1 w-full rounded border px-1 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        onDoubleClick={() => startRename(item)}
                        className="mt-1 block w-full truncate text-center text-xs"
                      >
                        {item.name}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                      aria-label="more"
                      className="absolute right-0 top-0 px-1 text-xs"
                    >
                      ⋯
                    </button>
                    {menuOpenId === item.id && (
                      <div
                        role="menu"
                        className="absolute right-0 top-5 z-10 rounded bg-white p-1 text-xs shadow"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => startRename(item)}
                          className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                        >
                          {props.t("library.rename")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            props.onDelete(item.id)
                            setMenuOpenId(null)
                          }}
                          className="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50"
                        >
                          {props.t("library.delete")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Export from UI barrel**

Edit `packages/ui/src/index.ts`. Add:

```ts
export { LibraryPanel } from "./LibraryPanel"
export type { LibraryPanelProps } from "./LibraryPanel"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @excalidraw-clone/ui typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/LibraryPanel.tsx packages/ui/src/index.ts
git commit -m "ui: add LibraryPanel component"
```

---

## Task 9: Mount `LibraryPanel` In `App.tsx`; Wire Data + Handlers

Connects panel to store, persistence, and the renderer. Hydrates `libraryItems` from IndexedDB on first render.

**Files:**

- Modify: `apps/web/src/components/App.tsx`

- [ ] **Step 1: Add imports at the top of `App.tsx`**

Open `apps/web/src/components/App.tsx`. Near the existing imports, add:

```tsx
import { LibraryPanel } from "@excalidraw-clone/ui"
import { Scene, normalizeToOrigin, type LibraryItem } from "@excalidraw-clone/scene"
import { renderToSVG } from "@excalidraw-clone/renderer"
import {
  deleteLibraryItem,
  exportLibraryFile,
  getAllLibraryItems,
  getFile,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
  download,
} from "@excalidraw-clone/persistence"
```

If any of these imports already exist, do not duplicate — merge with existing import lines.

- [ ] **Step 2: Add local UI state for the panel**

Inside the `App` component body, alongside the existing `useState` and store reads, add:

```tsx
const [libraryOpen, setLibraryOpen] = useState(false)
const libraryItems = useAppStore((s) => s.libraryItems)
const setLibraryItems = useAppStore((s) => s.setLibraryItems)
const armLibraryItem = useAppStore((s) => s.armLibraryItem)
const selectedIds = useAppStore((s) => s.selectedIds)
```

(Adjust the store-selector property names — `selectedIds`, `libraryItems`, etc. — to whatever the slices currently expose. `selectedIds` already exists in `selection.ts`.)

- [ ] **Step 3: Hydrate the library from IndexedDB on mount**

Add a `useEffect` after the state declarations:

```tsx
useEffect(() => {
  void getAllLibraryItems().then(setLibraryItems)
}, [setLibraryItems])
```

- [ ] **Step 4: Add handler callbacks**

Inside the same component body, add:

```tsx
const refreshLibrary = async (): Promise<void> => {
  setLibraryItems(await getAllLibraryItems())
}

const handleAddFromSelection = async (): Promise<void> => {
  const allEls = scene.getElements()
  const ids = new Set(selectedIds)
  const picked = allEls.filter((e) => ids.has(e.id))
  if (picked.length === 0) return
  const normalized = normalizeToOrigin(picked)
  const fileIds = new Set<string>()
  for (const el of normalized) {
    const fid = (el as { fileId?: string }).fileId
    if (typeof fid === "string") fileIds.add(fid)
  }
  const files: Record<string, NonNullable<LibraryItem["files"]>[string]> = {}
  for (const fid of fileIds) {
    const bin = await getFile(fid)
    if (bin) files[fid] = bin
  }
  const item: LibraryItem = {
    id: crypto.randomUUID(),
    name: `Item ${libraryItems.length + 1}`,
    created: Date.now(),
    elements: normalized,
    ...(Object.keys(files).length > 0 ? { files } : {}),
  }
  await putLibraryItem(item)
  await refreshLibrary()
}

const handleImport = (): void => {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".excalidrawlib,application/json"
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await importLibraryFile(file)
      await refreshLibrary()
    } catch {
      // TODO: surface via toast — for now just log
      console.error("Library import failed")
    }
  }
  input.click()
}

const handleExport = async (): Promise<void> => {
  const blob = await exportLibraryFile()
  const date = new Date().toISOString().slice(0, 10)
  download(blob, `library-${date}.excalidrawlib`)
}

const handleRename = async (id: string, name: string): Promise<void> => {
  await renameLibraryItem(id, name)
  await refreshLibrary()
}

const handleDelete = async (id: string): Promise<void> => {
  await deleteLibraryItem(id)
  await refreshLibrary()
}

const renderThumbnail = (item: LibraryItem): string => {
  const tempScene = new Scene(item.elements)
  return renderToSVG(tempScene, { padding: 4 })
}
```

- [ ] **Step 5: Render the panel in the component's JSX**

Find the JSX return block. After the existing canvas + toolbar markup (before the closing root div / fragment), add:

```tsx
<LibraryPanel
  t={t}
  open={libraryOpen}
  onToggle={() => setLibraryOpen((v) => !v)}
  items={libraryItems}
  selectedCount={selectedIds.length}
  onAddFromSelection={() => void handleAddFromSelection()}
  onItemClick={armLibraryItem}
  onImport={handleImport}
  onExport={() => void handleExport()}
  onRename={(id, name) => void handleRename(id, name)}
  onDelete={(id) => void handleDelete(id)}
  renderThumbnail={renderThumbnail}
/>
```

- [ ] **Step 6: Typecheck and lint**

Run from repo root: `pnpm -F web typecheck && pnpm -F web lint`
Expected: both pass.

- [ ] **Step 7: Smoke test in the browser**

Run: `pnpm dev`
Open `http://localhost:3000`. Click the right-edge toggle → panel expands. Draw a rectangle, select it, click `Add from selection` → an item appears with an SVG thumbnail. Refresh page → item persists. Delete it via the `⋯ → Delete` menu → it disappears.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/App.tsx
git commit -m "web: mount LibraryPanel and wire library handlers"
```

---

## Task 10: Ghost Preview Overlay + Click-To-Place Placement Handler

The drawing driver currently routes pointer events to the active tool. When `pendingItem` is set, intercept canvas clicks before the tool runs: commit placement on click, render a ghost preview on pointer-move, and clear placement on `Escape`, tool switch, or dialog open.

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts`
- Modify: `apps/web/src/components/App.tsx` (clear-on-tool-switch / clear-on-dialog hooks)

- [ ] **Step 1: Read the current `useDrawingDriver` to locate event hooks**

Read `apps/web/src/driver/useDrawingDriver.ts` end-to-end. Identify:

- where pointer events are attached
- where the active tool's handler is invoked
- where the overlay canvas is drawn each frame

Do not modify yet — this read informs Step 2.

- [ ] **Step 2: Branch on `pendingItem` at the top of pointer-event handlers**

In `useDrawingDriver`, subscribe to `pendingItem` and `clearPendingItem` from the store:

```ts
const pendingItem = useAppStore((s) => s.pendingItem)
const clearPendingItem = useAppStore((s) => s.clearPendingItem)
```

In the pointer-down handler, before delegating to the active tool:

```ts
if (pendingItem) {
  // Translate the (deep-cloned, freshly-id'd) elements to the click point, append to scene, select them.
  const { clientX, clientY } = event
  const rect = canvasRef.current?.getBoundingClientRect()
  if (!rect) return
  const x = clientX - rect.left
  const y = clientY - rect.top
  void placeLibraryItem(pendingItem, x, y, scene)
  clearPendingItem()
  return
}
```

Where `placeLibraryItem` is defined in this file or imported from a new helper module. Implementation:

```ts
import { putFile } from "@excalidraw-clone/persistence"
import type { LibraryItem, ExcalidrawElement, Scene } from "@excalidraw-clone/scene"

async function placeLibraryItem(
  item: LibraryItem,
  x: number,
  y: number,
  scene: Scene,
): Promise<void> {
  if (item.files) {
    for (const bin of Object.values(item.files)) {
      await putFile(bin)
    }
  }
  const placed: ExcalidrawElement[] = item.elements.map((el) => ({
    ...el,
    id: crypto.randomUUID(),
    x: el.x + x,
    y: el.y + y,
  }))
  scene.setElements([...scene.getElements(), ...placed], { skipHistory: false })
}
```

Use whatever element-id generator the rest of the codebase uses (grep `crypto.randomUUID\\|nanoid` in `packages/scene` / `packages/tools` first). If neither is dominant, `crypto.randomUUID()` is fine — it's available in all supported browsers and avoids adding a dependency.

If `scene.setElements` is not the exact API exposed, use whatever scene mutator already exists in the driver for tool commits (search for existing `scene.set` / `scene.replace` / `scene.commit` calls in the driver) and use that. **Do not invent a new scene API in this task.**

- [ ] **Step 3: Render ghost preview on pointer-move**

In the pointer-move handler, before tool delegation:

```ts
if (pendingItem) {
  const rect = canvasRef.current?.getBoundingClientRect()
  if (!rect) return
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const overlay = overlayRef.current
  const ctx = overlay?.getContext("2d")
  if (ctx && overlay) {
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.save()
    ctx.globalAlpha = 0.6
    // Draw a simple rectangle outline per element, translated by (x, y).
    for (const el of pendingItem.elements) {
      ctx.strokeStyle = "#6b46c1"
      ctx.strokeRect(el.x + x, el.y + y, el.width ?? 10, el.height ?? 10)
    }
    ctx.restore()
  }
  return
}
```

(A bbox-outline ghost is sufficient for v1; a fully-shaped ghost preview can come later.)

- [ ] **Step 4: Clear placement on Escape, tool-switch, dialog-open**

In `App.tsx`, add a `useEffect` that subscribes to keydown:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") useAppStore.getState().clearPendingItem()
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}, [])
```

Inside the existing tool-change effect (or wherever the active tool name changes), call `clearPendingItem()` so switching tools cancels placement. Same with `setDialogOpen(...)` in the dialog slice — call `clearPendingItem()` whenever a dialog opens. Add a single effect:

```tsx
useEffect(() => {
  if (useAppStore.getState().pendingItem !== null) {
    useAppStore.getState().clearPendingItem()
  }
}, [activeTool, activeDialog])
```

(Replace `activeTool` and `activeDialog` with the actual subscription variable names used elsewhere in `App.tsx`.)

- [ ] **Step 5: Typecheck**

Run: `pnpm -F web typecheck`
Expected: pass.

- [ ] **Step 6: Smoke test in the browser**

Run: `pnpm dev`. Draw a rectangle, select it, `Add from selection`. Click the item — cursor shows a faint outline. Click on the canvas — a new rectangle appears at the click point. Press `Escape` after arming — outline disappears and clicking the canvas no longer places.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts apps/web/src/components/App.tsx
git commit -m "web: ghost preview overlay and click-to-place for library items"
```

---

## Task 11: Playwright E2E Spec

**Files:**

- Create: `apps/web/e2e/library.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/library.spec.ts`:

```ts
import { expect, test } from "@playwright/test"

async function drawRect(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("toolbar-rectangle").click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("no canvas bbox")
  await page.mouse.move(box.x + 100, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 180)
  await page.mouse.up()
  await page.getByTestId("toolbar-selection").click()
  await page.mouse.click(box.x + 150, box.y + 140)
}

test("add selection to library and place it on the canvas", async ({ page }) => {
  await page.goto("/")
  await drawRect(page)

  await page.getByTestId("library-toggle").click()
  await page.getByTestId("library-add").click()
  const item = page.locator('[data-testid^="library-item-"]').first()
  await expect(item).toBeVisible()

  await item.locator("button").first().click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("no canvas bbox")
  await page.mouse.click(box.x + 400, box.y + 400)

  const scene = await page.evaluate(() => localStorage.getItem("excalidraw-clone-scene"))
  expect(scene).not.toBeNull()
  const data = JSON.parse(scene as string)
  const rects = (data.elements as Array<{ type: string }>).filter((e) => e.type === "rectangle")
  expect(rects.length).toBeGreaterThanOrEqual(2)
})

test("Escape cancels pending placement", async ({ page }) => {
  await page.goto("/")
  await drawRect(page)

  await page.getByTestId("library-toggle").click()
  await page.getByTestId("library-add").click()
  const item = page.locator('[data-testid^="library-item-"]').first()
  await item.locator("button").first().click()
  await page.keyboard.press("Escape")

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("no canvas bbox")
  await page.mouse.click(box.x + 400, box.y + 400)

  const scene = await page.evaluate(() => localStorage.getItem("excalidraw-clone-scene"))
  const data = JSON.parse(scene as string)
  const rects = (data.elements as Array<{ type: string }>).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(1)
})

test("library item persists across reload", async ({ page }) => {
  await page.goto("/")
  await drawRect(page)
  await page.getByTestId("library-toggle").click()
  await page.getByTestId("library-add").click()
  await expect(page.locator('[data-testid^="library-item-"]')).toHaveCount(1)

  await page.reload()
  await page.getByTestId("library-toggle").click()
  await expect(page.locator('[data-testid^="library-item-"]')).toHaveCount(1)
})
```

If the localStorage key name `excalidraw-clone-scene` differs in the running app, grep for the actual key in `packages/persistence/src/local-store.ts` and update the spec to match.

- [ ] **Step 2: Run the e2e suite**

Run from repo root: `pnpm -F web exec playwright test library.spec.ts`
Expected: all 3 tests pass.

If a test fails because of localStorage timing, add `await page.waitForFunction(...)` after the click and re-run.

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

Run: `pnpm -F web exec playwright test`
Expected: all specs (existing 7 + new 1 = 8 files) pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/library.spec.ts
git commit -m "web: playwright e2e for library add/place/persist"
```

---

## Task 12: Full Monorepo Gate

Final verification that the whole repo is green.

- [ ] **Step 1: Typecheck everything**

Run: `pnpm typecheck`
Expected: pass across all packages.

- [ ] **Step 2: Lint everything**

Run: `pnpm lint`
Expected: pass across all packages.

- [ ] **Step 3: Run all unit tests**

Run: `pnpm test`
Expected: pass for all packages (persistence test count grows by ~15; scene by ~5).

- [ ] **Step 4: Run all Playwright specs**

Run: `pnpm -F web exec playwright test`
Expected: pass for all e2e specs.

- [ ] **Step 5: Smoke test the acceptance criteria from the spec**

Run: `pnpm dev`. In the browser:

1. Draw a rectangle and a circle, select both, click **Add from selection** → item with SVG thumbnail appears.
2. Click the item, click on canvas → copy appears at click point and is selected.
3. Reload → library item still present.
4. **Export library** → file downloads.
5. Open the app in a fresh browser profile (or an incognito window), click **Import library**, pick the downloaded file → item is restored.

- [ ] **Step 6: Tag the work as a feature commit on `develop`**

Verify the commit log:

```bash
git log origin/develop..develop --oneline
```

Confirm the planned commits are in place (scene types, normalize, db.ts, library-store CRUD, import/export, slice, i18n, panel, app integration, ghost preview, e2e, gate). No final commit needed for this step — push when ready.

---

## Out-of-scope reminders (do NOT implement)

- Drag-from-panel insertion
- Multi-item selection inside the panel
- Item categorization, tags, or search
- Remote library catalog browsing
- Virtualization of the panel grid (acceptable: add a single `// TODO: virtualize` comment if grid > 50 items is sluggish)
