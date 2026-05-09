# Phase 6: `@excalidraw-clone/persistence` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Inline execution preferred for this project (per memory). Each task ends with a commit on `develop`. TDD-style: failing test first, then implementation.

**Goal:** Build the storage layer — localStorage auto-save for the scene + UI snapshot, IndexedDB for image binaries, and `.excalidraw` JSON file I/O with versioned migrations. Pure-TS, headless-testable, zero React.

**Architecture:**

- `local-store.ts` — `loadScene()` / `saveScene()` / `loadUI()` / `saveUI()` over localStorage. Synchronous. Hydration-safe (no-throw on parse failure; returns `null`).
- `image-store.ts` — `getFile(id)` / `putFile(file)` / `getAllFiles()` over IndexedDB via `idb`. Async.
- `file-io.ts` — `serialize(scene, appState, files)` → JSON; `download(json, filename)` triggers browser download; `openFile(file: File)` parses + migrates and returns `{ scene-data, files }`.
- `migrations.ts` — versioned pipeline `(data: vN) => vN+1`. v1 ships migrating Excalidraw `version: 1` → `version: 2`.
- `auto-save.ts` — pure debounce controller. `createAutoSaver({ delayMs, flush })` returns `{ schedule, flushNow, dispose }`. UI driver wires Scene/Zustand subscriptions to `schedule`.
- `binary.ts` — utilities: `sha256Hex(blob)`, `blobToDataURL(blob)`, `dataURLToBlob(url)`.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 8 (persistence), § 4 (persistence may import only `scene`), § 11 (testing: `fake-indexeddb`, migration goldens), § 12 step 6.

**Working branch:** `develop`. Every task ends with a commit.

**Boundary rule:** ESLint config (`eslint.config.mjs`) restricts persistence to `@excalidraw-clone/scene`. No `geometry`, no React. New runtime deps allowed: `idb`. New devDeps: `fake-indexeddb`.

**Tech Stack:** TypeScript 5, Vitest, `idb` v8, `fake-indexeddb` v6, Web Crypto API for sha256.

---

## Architectural decisions (locked in for this phase)

### Sync localStorage, async IndexedDB

`local-store.ts` is synchronous because hydration on app boot must run before first render — the UI can't show a flash-of-empty-canvas while it awaits. localStorage is sync by spec.

`image-store.ts` is async because IDB is async-only and image hydration happens _after_ first paint (renderer falls back to a placeholder until the image promise resolves).

### File format owned upstream

`packages/scene` already defines `ExcalidrawData` (in `src/types.ts`) and `buildExcalidrawData` (in `src/json.ts`) with `SCENE_FORMAT_VERSION = 2`. Persistence consumes those — it does **not** redefine the schema. `serialize` is just a thin wrapper that calls `scene.toJSON(appState, files)`.

### Migrations are pure functions, never mutate input

```ts
type MigrationFn = (data: unknown) => unknown
const MIGRATIONS: Record<number, MigrationFn> = { 1: v1ToV2 }
function migrate(raw: unknown): ExcalidrawData {
  /* loop until version === SCENE_FORMAT_VERSION */
}
```

Each migration receives the **previous** version's data and returns the next. Goldens live in `test/fixtures/`. We ship `v1ToV2` (no real schema change yet — just version bump + ensures `boundElements`/`startBinding`/`endBinding` fields exist on linear elements). When v3 ships, we add `v2ToV3` without touching `v1ToV2`.

### Errors surface as `null`, not throws

Boot-time hydration must not crash the app. `loadScene()` and `loadUI()` catch and return `null` on parse error / quota error. The driver in `apps/web` decides whether to toast the user. File-open errors **do** throw — that's an explicit user action with a clear failure point.

### IndexedDB schema

```
DB name:    "excalidraw-clone"
DB version: 1
Stores:
  - "files": keyPath "id"  // ExcalidrawBinaryFile records
```

When schema needs to evolve, bump DB version + add `upgrade` callback. Out of scope for v1.

### What stays out of this phase

- **Scene + UI store wiring.** `auto-save.ts` exports a pure debounce controller. Subscribing to a Scene or Zustand store and calling `schedule()` is `apps/web`'s job (Phase 8).
- **Render-time image fetch.** Renderer pulls `HTMLImageElement` from a `Map<fileId, HTMLImageElement>` cache (built in renderer Phase 4). Phase 6 just stores/retrieves blobs — wiring image hydration into the renderer cache is Phase 8.
- **Image tool reducer.** Belongs in `packages/tools` and was deferred from Phase 5 because it needs `persistence`. We add it as **Task 10** at the end of this phase, then expose it through the tools registry.
- **PNG / SVG export.** Lives in `packages/renderer` (not added in this phase — pulled forward into Phase 8 only if needed for the export dialog UI).

---

## File structure

```
packages/persistence/
  src/
    index.ts            ← public barrel
    binary.ts           ← sha256, blob<->dataURL
    local-store.ts      ← localStorage scene + UI
    image-store.ts      ← idb files store
    file-io.ts          ← .excalidraw download + open
    migrations.ts       ← versioned pipeline
    auto-save.ts        ← debounce controller
    version.ts          ← (already exists) PACKAGE_NAME, PACKAGE_VERSION
  test/
    binary.test.ts
    local-store.test.ts
    image-store.test.ts
    file-io.test.ts
    migrations.test.ts
    auto-save.test.ts
    fixtures/
      v1-rect.json      ← Excalidraw v1 sample
      v2-rect.json      ← expected v2 output
      v2-with-image.json
```

Plus image tool added to `packages/tools` in Task 10:

```
packages/tools/src/tools/image/
  index.ts              ← imageTool reducer
  index.test.ts (under packages/tools/test/...)
```

---

## Task 1: Package setup — add `idb` + `fake-indexeddb`, vitest jsdom env

**Files:**

- Modify: `packages/persistence/package.json`
- Create: `packages/persistence/vitest.config.ts` (currently exists — verify env)
- Modify: `pnpm-lock.yaml` (auto from `pnpm install`)

- [ ] **Step 1: Inspect current `vitest.config.ts`**

Run: `cat packages/persistence/vitest.config.ts`

If it doesn't already set `environment: "jsdom"`, replace it. We need jsdom because `fake-indexeddb` needs `globalThis.indexedDB` and `binary.ts` uses `crypto.subtle`. localStorage tests also need a `window`.

- [ ] **Step 2: Update `vitest.config.ts`**

```ts
// packages/persistence/vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
})
```

- [ ] **Step 3: Create `test/setup.ts` to install `fake-indexeddb` + reset localStorage**

```ts
// packages/persistence/test/setup.ts
import "fake-indexeddb/auto"
import { afterEach, beforeEach } from "vitest"

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  // Wipe IDB between tests by deleting the DB.
  // fake-indexeddb namespaces by global; explicit delete is robust.
  indexedDB.deleteDatabase("excalidraw-clone")
})
```

- [ ] **Step 4: Update `package.json` — add deps**

Replace `dependencies` and `devDependencies`:

```json
"dependencies": {
  "@excalidraw-clone/scene": "workspace:*",
  "idb": "^8.0.0"
},
"devDependencies": {
  "@types/node": "^22.10.0",
  "fake-indexeddb": "^6.0.0",
  "jsdom": "^25.0.0",
  "typescript": "^5.7.2",
  "vitest": "^2.1.8"
}
```

- [ ] **Step 5: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors. The `idb`, `fake-indexeddb`, and `jsdom` packages are added.

- [ ] **Step 6: Verify lint + typecheck still pass**

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint`
Expected: both exit 0. Existing smoke test still passes: `pnpm --filter @excalidraw-clone/persistence test`.

- [ ] **Step 7: Commit**

```bash
git add packages/persistence/package.json packages/persistence/vitest.config.ts packages/persistence/test/setup.ts pnpm-lock.yaml
git commit -m "Phase 6.1: persistence — add idb + fake-indexeddb, jsdom env"
```

---

## Task 2: `binary.ts` — sha256 + dataURL <-> Blob

Image binaries get a content-addressed `id` (sha256 hex of the bytes). `serialize()` ships dataURLs (matching upstream `.excalidraw` format), but `image-store.ts` keeps Blobs to avoid round-tripping through base64 strings.

**Files:**

- Create: `packages/persistence/src/binary.ts`
- Create: `packages/persistence/test/binary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/persistence/test/binary.test.ts
import { describe, expect, it } from "vitest"
import { blobToDataURL, dataURLToBlob, sha256Hex } from "../src/binary"

describe("sha256Hex", () => {
  it("hashes empty input to known constant", async () => {
    const blob = new Blob([])
    const hex = await sha256Hex(blob)
    expect(hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("hashes 'abc' to known constant", async () => {
    const blob = new Blob(["abc"])
    const hex = await sha256Hex(blob)
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("blob <-> dataURL round-trip", () => {
  it("preserves bytes and mime", async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/png" })
    const url = await blobToDataURL(original)
    expect(url.startsWith("data:image/png;base64,")).toBe(true)
    const restored = dataURLToBlob(url)
    expect(restored.type).toBe("image/png")
    expect(restored.size).toBe(5)
    const buf = new Uint8Array(await restored.arrayBuffer())
    expect([...buf]).toEqual([1, 2, 3, 4, 5])
  })

  it("dataURLToBlob throws on malformed input", () => {
    expect(() => dataURLToBlob("not-a-data-url")).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/binary.test.ts`
Expected: FAIL — `Cannot find module '../src/binary'`.

- [ ] **Step 3: Implement `binary.ts`**

```ts
// packages/persistence/src/binary.ts
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  const bytes = new Uint8Array(digest)
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"))
    reader.readAsDataURL(blob)
  })
}

export function dataURLToBlob(url: string): Blob {
  const match = /^data:([^;]+);base64,(.*)$/.exec(url)
  if (!match) throw new Error("dataURLToBlob: not a base64 data URL")
  const [, mime, b64] = match
  const bin = atob(b64!)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mime! })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/binary.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Re-export from barrel**

Add to `packages/persistence/src/index.ts`:

```ts
export { blobToDataURL, dataURLToBlob, sha256Hex } from "./binary"
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/persistence/src/binary.ts packages/persistence/src/index.ts packages/persistence/test/binary.test.ts
git commit -m "Phase 6.2: persistence — binary helpers (sha256, dataURL)"
```

---

## Task 3: `local-store.ts` — localStorage scene + UI snapshot

**Files:**

- Create: `packages/persistence/src/local-store.ts`
- Create: `packages/persistence/test/local-store.test.ts`

**API surface:**

```ts
const SCENE_KEY = "excalidraw-scene"
const UI_KEY = "excalidraw-ui"

saveScene(data: ExcalidrawData): void
loadScene(): ExcalidrawData | null

saveUI(snapshot: Record<string, unknown>): void
loadUI(): Record<string, unknown> | null

clearLocal(): void   // wipes both keys; used by reset-canvas dialog
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/persistence/test/local-store.test.ts
import { newRectangle, type ExcalidrawData } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { clearLocal, loadScene, loadUI, saveScene, saveUI } from "../src/local-store"

const sampleData = (): ExcalidrawData => ({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw-clone.local",
  elements: [newRectangle({ x: 10, y: 20, width: 100, height: 50 })],
})

describe("local-store: scene", () => {
  it("loadScene returns null when key missing", () => {
    expect(loadScene()).toBeNull()
  })

  it("saveScene then loadScene round-trips", () => {
    const data = sampleData()
    saveScene(data)
    const restored = loadScene()
    expect(restored?.elements.length).toBe(1)
    expect(restored?.elements[0]?.type).toBe("rectangle")
  })

  it("loadScene returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem("excalidraw-scene", "{not-json")
    expect(loadScene()).toBeNull()
  })

  it("loadScene returns null when payload shape is wrong", () => {
    localStorage.setItem("excalidraw-scene", JSON.stringify({ type: "wrong" }))
    expect(loadScene()).toBeNull()
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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/local-store.test.ts`
Expected: FAIL — `Cannot find module '../src/local-store'`.

- [ ] **Step 3: Implement `local-store.ts`**

```ts
// packages/persistence/src/local-store.ts
import { SCENE_FORMAT_VERSION, type ExcalidrawData } from "@excalidraw-clone/scene"

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
    if (!isExcalidrawData(parsed)) return null
    return parsed
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

function isExcalidrawData(v: unknown): v is ExcalidrawData {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    obj.type === "excalidraw" &&
    typeof obj.version === "number" &&
    obj.version === SCENE_FORMAT_VERSION &&
    Array.isArray(obj.elements)
  )
}
```

> **Note on `isExcalidrawData`:** strict on `version === 2` because `loadScene` is for hydration of _our_ writes. File-open uses a different code path (`file-io.ts`) that runs migrations first.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/local-store.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Re-export + verify**

Add to `src/index.ts`:

```ts
export { clearLocal, loadScene, loadUI, saveScene, saveUI } from "./local-store"
```

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/local-store.ts packages/persistence/src/index.ts packages/persistence/test/local-store.test.ts
git commit -m "Phase 6.3: persistence — localStorage scene + UI auto-save"
```

---

## Task 4: `image-store.ts` — IndexedDB binary storage

**Files:**

- Create: `packages/persistence/src/image-store.ts`
- Create: `packages/persistence/test/image-store.test.ts`

**API surface:**

```ts
putFile(file: ExcalidrawBinaryFile): Promise<void>
getFile(id: string): Promise<ExcalidrawBinaryFile | undefined>
getAllFiles(): Promise<ExcalidrawBinaryFile[]>
deleteFile(id: string): Promise<void>
clearAllFiles(): Promise<void>
```

`ExcalidrawBinaryFile` = `{ id, mimeType, dataURL, created }` (already exported from `@excalidraw-clone/scene`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/persistence/test/image-store.test.ts
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { clearAllFiles, deleteFile, getAllFiles, getFile, putFile } from "../src/image-store"

const fileA: ExcalidrawBinaryFile = {
  id: "a",
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAAA",
  created: 1,
}

const fileB: ExcalidrawBinaryFile = {
  id: "b",
  mimeType: "image/jpeg",
  dataURL: "data:image/jpeg;base64,BBBB",
  created: 2,
}

describe("image-store", () => {
  it("getFile returns undefined when missing", async () => {
    expect(await getFile("nope")).toBeUndefined()
  })

  it("putFile then getFile round-trips", async () => {
    await putFile(fileA)
    expect(await getFile("a")).toEqual(fileA)
  })

  it("putFile is idempotent on same id (last write wins)", async () => {
    await putFile(fileA)
    await putFile({ ...fileA, dataURL: "data:image/png;base64,ZZZZ" })
    const got = await getFile("a")
    expect(got?.dataURL).toBe("data:image/png;base64,ZZZZ")
  })

  it("getAllFiles returns every file in store", async () => {
    await putFile(fileA)
    await putFile(fileB)
    const all = await getAllFiles()
    const ids = all.map((f) => f.id).sort()
    expect(ids).toEqual(["a", "b"])
  })

  it("deleteFile removes a single record", async () => {
    await putFile(fileA)
    await putFile(fileB)
    await deleteFile("a")
    expect(await getFile("a")).toBeUndefined()
    expect(await getFile("b")).toEqual(fileB)
  })

  it("clearAllFiles wipes the store", async () => {
    await putFile(fileA)
    await putFile(fileB)
    await clearAllFiles()
    expect(await getAllFiles()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/image-store.test.ts`
Expected: FAIL — `Cannot find module '../src/image-store'`.

- [ ] **Step 3: Implement `image-store.ts`**

```ts
// packages/persistence/src/image-store.ts
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { type IDBPDatabase, openDB } from "idb"

const DB_NAME = "excalidraw-clone"
const DB_VERSION = 1
const STORE = "files"

interface ExcalidrawDB {
  files: {
    key: string
    value: ExcalidrawBinaryFile
  }
}

let dbPromise: Promise<IDBPDatabase<ExcalidrawDB>> | null = null

function getDB(): Promise<IDBPDatabase<ExcalidrawDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<ExcalidrawDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" })
        }
      },
    })
  }
  return dbPromise
}

export async function putFile(file: ExcalidrawBinaryFile): Promise<void> {
  const db = await getDB()
  await db.put(STORE, file)
}

export async function getFile(id: string): Promise<ExcalidrawBinaryFile | undefined> {
  const db = await getDB()
  return db.get(STORE, id)
}

export async function getAllFiles(): Promise<ExcalidrawBinaryFile[]> {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function clearAllFiles(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

/** Test-only: drop the cached DB handle so a re-open after `indexedDB.deleteDatabase()` works. */
export function _resetDBForTesting(): void {
  dbPromise = null
}
```

- [ ] **Step 4: Update `test/setup.ts` to reset cached DB handle between tests**

Edit `packages/persistence/test/setup.ts`:

```ts
import "fake-indexeddb/auto"
import { afterEach, beforeEach } from "vitest"
import { _resetDBForTesting } from "../src/image-store"

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  _resetDBForTesting()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("excalidraw-clone")
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/image-store.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 6: Re-export + verify**

Add to `src/index.ts`:

```ts
export { clearAllFiles, deleteFile, getAllFiles, getFile, putFile } from "./image-store"
```

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/persistence/src/image-store.ts packages/persistence/src/index.ts packages/persistence/test/setup.ts packages/persistence/test/image-store.test.ts
git commit -m "Phase 6.4: persistence — IndexedDB image binary store"
```

---

## Task 5: `migrations.ts` — versioned migration pipeline

**Files:**

- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/test/migrations.test.ts`
- Create: `packages/persistence/test/fixtures/v1-rect.json`
- Create: `packages/persistence/test/fixtures/v2-rect.json`

**API surface:**

```ts
migrate(raw: unknown): ExcalidrawData   // throws if shape unrecognized or version > current
```

- [ ] **Step 1: Create fixtures**

`packages/persistence/test/fixtures/v1-rect.json`:

```json
{
  "type": "excalidraw",
  "version": 1,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "abc",
      "type": "rectangle",
      "x": 10,
      "y": 20,
      "width": 100,
      "height": 50,
      "angle": 0,
      "strokeColor": "#000000",
      "backgroundColor": "transparent",
      "fillStyle": "solid",
      "strokeWidth": 1,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "groupIds": [],
      "frameId": null,
      "roundness": null,
      "seed": 1,
      "version": 1,
      "versionNonce": 0,
      "isDeleted": false,
      "updated": 0,
      "link": null,
      "locked": false
    }
  ]
}
```

`packages/persistence/test/fixtures/v2-rect.json`:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "abc",
      "type": "rectangle",
      "x": 10,
      "y": 20,
      "width": 100,
      "height": 50,
      "angle": 0,
      "strokeColor": "#000000",
      "backgroundColor": "transparent",
      "fillStyle": "solid",
      "strokeWidth": 1,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "groupIds": [],
      "frameId": null,
      "roundness": null,
      "seed": 1,
      "version": 1,
      "versionNonce": 0,
      "isDeleted": false,
      "updated": 0,
      "link": null,
      "locked": false,
      "boundElements": []
    }
  ]
}
```

> **What v1→v2 does in this codebase:** ensures `boundElements` is at least `[]` on every shape element (forward-compat for v1.1 arrow binding). The version bump itself is what we ship.

- [ ] **Step 2: Write the failing test**

```ts
// packages/persistence/test/migrations.test.ts
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/migrations"

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFile(join(HERE, "fixtures", name), "utf8").then(JSON.parse) as Promise<unknown>

describe("migrate", () => {
  it("v1 → v2 adds boundElements to shape elements", async () => {
    const v1 = await fixture("v1-rect.json")
    const expected = await fixture("v2-rect.json")
    expect(migrate(v1)).toEqual(expected)
  })

  it("v2 input is returned unchanged (already current)", async () => {
    const v2 = await fixture("v2-rect.json")
    expect(migrate(v2)).toEqual(v2)
  })

  it("throws on unknown payload shape", () => {
    expect(() => migrate({ foo: "bar" })).toThrow(/unrecognized/i)
  })

  it("throws on version newer than current", () => {
    expect(() => migrate({ type: "excalidraw", version: 99, source: "x", elements: [] })).toThrow(
      /newer/i,
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/migrations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `migrations.ts`**

```ts
// packages/persistence/src/migrations.ts
import { SCENE_FORMAT_VERSION, type ExcalidrawData } from "@excalidraw-clone/scene"

type AnyData = {
  type: "excalidraw"
  version: number
  source: string
  elements: unknown[]
} & Record<string, unknown>

type MigrationFn = (data: AnyData) => AnyData

const v1ToV2: MigrationFn = (data) => ({
  ...data,
  version: 2,
  elements: (data.elements as Record<string, unknown>[]).map((el) => {
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

const MIGRATIONS: Record<number, MigrationFn> = {
  1: v1ToV2,
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
  return (
    obj.type === "excalidraw" &&
    typeof obj.version === "number" &&
    typeof obj.source === "string" &&
    Array.isArray(obj.elements)
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/migrations.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Re-export + verify**

Add to `src/index.ts`:

```ts
export { migrate } from "./migrations"
```

Run typecheck, lint, full test: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/persistence/src/migrations.ts packages/persistence/src/index.ts packages/persistence/test/migrations.test.ts packages/persistence/test/fixtures/
git commit -m "Phase 6.5: persistence — versioned migration pipeline (v1 → v2)"
```

---

## Task 6: `file-io.ts` — `.excalidraw` save + open

**Files:**

- Create: `packages/persistence/src/file-io.ts`
- Create: `packages/persistence/test/file-io.test.ts`

**API surface:**

```ts
serializeScene(scene: Scene, appState?, files?): ExcalidrawData
toExcalidrawBlob(data: ExcalidrawData): Blob
download(blob: Blob, filename: string): void   // triggers browser download via <a download>
parseExcalidrawFile(file: File): Promise<ExcalidrawData>   // parse + migrate
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/persistence/test/file-io.test.ts
import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "../src/file-io"

describe("serializeScene", () => {
  it("returns ExcalidrawData with version 2 and the scene's elements", () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const data = serializeScene(scene)
    expect(data.type).toBe("excalidraw")
    expect(data.version).toBe(2)
    expect(data.elements.length).toBe(1)
  })

  it("includes appState and files when provided", () => {
    const scene = new Scene()
    const data = serializeScene(
      scene,
      { theme: "dark" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 } },
    )
    expect(data.appState).toEqual({ theme: "dark" })
    expect(data.files?.f1?.id).toBe("f1")
  })
})

describe("toExcalidrawBlob", () => {
  it("returns a Blob with type application/json", () => {
    const blob = toExcalidrawBlob({
      type: "excalidraw",
      version: 2,
      source: "x",
      elements: [],
    })
    expect(blob.type).toBe("application/json")
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("parseExcalidrawFile", () => {
  it("parses a v2 file directly", async () => {
    const data = {
      type: "excalidraw",
      version: 2,
      source: "x",
      elements: [],
    }
    const file = new File([JSON.stringify(data)], "test.excalidraw", { type: "application/json" })
    const out = await parseExcalidrawFile(file)
    expect(out).toEqual(data)
  })

  it("migrates a v1 file on open", async () => {
    const data = { type: "excalidraw", version: 1, source: "x", elements: [] }
    const file = new File([JSON.stringify(data)], "old.excalidraw", { type: "application/json" })
    const out = await parseExcalidrawFile(file)
    expect(out.version).toBe(2)
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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/file-io.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `file-io.ts`**

```ts
// packages/persistence/src/file-io.ts
import type {
  ExcalidrawAppStateSnapshot,
  ExcalidrawData,
  ExcalidrawFiles,
  Scene,
} from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

export function serializeScene(
  scene: Scene,
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData {
  return scene.toJSON(appState, files)
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/file-io.test.ts`
Expected: PASS — 7 tests green.

> **`download()` is not unit-tested.** It performs DOM side effects only viable in a real browser; we cover it via Playwright in Phase 8.

- [ ] **Step 5: Re-export + verify**

Add to `src/index.ts`:

```ts
export { download, parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "./file-io"
```

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/file-io.ts packages/persistence/src/index.ts packages/persistence/test/file-io.test.ts
git commit -m "Phase 6.6: persistence — .excalidraw file save/open with migration"
```

---

## Task 7: `auto-save.ts` — debounce controller

A pure scheduler. Caller subscribes to whatever store and calls `schedule()` on each change. Controller flushes at most once per `delayMs`.

**Files:**

- Create: `packages/persistence/src/auto-save.ts`
- Create: `packages/persistence/test/auto-save.test.ts`

**API surface:**

```ts
interface AutoSaver {
  schedule(): void       // arms or rearms the timer
  flushNow(): void       // immediate flush; cancels pending timer
  dispose(): void        // cancels pending timer; no further flushes
}

createAutoSaver(opts: { delayMs: number; flush: () => void }): AutoSaver
```

- [ ] **Step 1: Write the failing test (uses `vi.useFakeTimers`)**

```ts
// packages/persistence/test/auto-save.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAutoSaver } from "../src/auto-save"

describe("createAutoSaver", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces — single flush after delay even with many schedule() calls", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.schedule()
    saver.schedule()
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(499)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("re-arms timer on each schedule()", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    vi.advanceTimersByTime(400)
    saver.schedule()
    vi.advanceTimersByTime(400)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("flushNow() flushes immediately and cancels pending timer", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.flushNow()
    expect(flush).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("flushNow() is a no-op when nothing scheduled", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.flushNow()
    expect(flush).not.toHaveBeenCalled()
  })

  it("dispose() cancels pending timer and prevents further flushes", () => {
    const flush = vi.fn()
    const saver = createAutoSaver({ delayMs: 500, flush })
    saver.schedule()
    saver.dispose()
    vi.advanceTimersByTime(1000)
    expect(flush).not.toHaveBeenCalled()
    saver.schedule()
    vi.advanceTimersByTime(1000)
    expect(flush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/auto-save.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `auto-save.ts`**

```ts
// packages/persistence/src/auto-save.ts
export interface AutoSaver {
  schedule(): void
  flushNow(): void
  dispose(): void
}

export interface AutoSaverOptions {
  delayMs: number
  flush: () => void
}

export function createAutoSaver({ delayMs, flush }: AutoSaverOptions): AutoSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let disposed = false

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule() {
      if (disposed) return
      pending = true
      cancel()
      timer = setTimeout(() => {
        timer = null
        pending = false
        flush()
      }, delayMs)
    },
    flushNow() {
      if (disposed) return
      cancel()
      if (!pending) return
      pending = false
      flush()
    },
    dispose() {
      cancel()
      pending = false
      disposed = true
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/auto-save.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Re-export + verify**

Add to `src/index.ts`:

```ts
export { createAutoSaver } from "./auto-save"
export type { AutoSaver, AutoSaverOptions } from "./auto-save"
```

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/auto-save.ts packages/persistence/src/index.ts packages/persistence/test/auto-save.test.ts
git commit -m "Phase 6.7: persistence — debounced auto-save controller"
```

---

## Task 8: Image upload helper — `addImageFromBlob`

End-to-end glue: takes a Blob, computes its sha256 → fileId, stores in IDB, returns a `{ id, dataURL, mimeType }` ready to plug into an `ExcalidrawImageElement.fileId`.

**Files:**

- Modify: `packages/persistence/src/image-store.ts` (add export)
- Modify: `packages/persistence/test/image-store.test.ts` (add cases)

- [ ] **Step 1: Add failing test cases at the end of `image-store.test.ts`**

```ts
// append to packages/persistence/test/image-store.test.ts
import { addImageFromBlob } from "../src/image-store"

describe("addImageFromBlob", () => {
  it("stores a blob and returns its content-addressed id", async () => {
    const blob = new Blob(["abc"], { type: "image/png" })
    const result = await addImageFromBlob(blob)
    expect(result.id).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(result.mimeType).toBe("image/png")
    expect(result.dataURL.startsWith("data:image/png;base64,")).toBe(true)

    const stored = await getFile(result.id)
    expect(stored).toBeDefined()
    expect(stored?.dataURL).toBe(result.dataURL)
  })

  it("is idempotent on identical content (same id, no duplicate writes)", async () => {
    const blob = new Blob(["abc"], { type: "image/png" })
    const a = await addImageFromBlob(blob)
    const b = await addImageFromBlob(blob)
    expect(a.id).toBe(b.id)
    const all = await getAllFiles()
    expect(all.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/persistence test test/image-store.test.ts`
Expected: FAIL — `addImageFromBlob` not exported.

- [ ] **Step 3: Implement `addImageFromBlob` in `image-store.ts`**

Append to `packages/persistence/src/image-store.ts`:

```ts
import { blobToDataURL, sha256Hex } from "./binary"
import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"

export async function addImageFromBlob(blob: Blob): Promise<ExcalidrawBinaryFile> {
  const id = await sha256Hex(blob)
  const existing = await getFile(id)
  if (existing) return existing
  const dataURL = await blobToDataURL(blob)
  const file: ExcalidrawBinaryFile = {
    id,
    mimeType: blob.type || "application/octet-stream",
    dataURL,
    created: Date.now(),
  }
  await putFile(file)
  return file
}
```

> The `import` lines at the top are merged with the existing imports — do not duplicate.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/persistence test test/image-store.test.ts`
Expected: PASS — 8 tests green total.

- [ ] **Step 5: Re-export + verify**

Add to `src/index.ts`:

```ts
export { addImageFromBlob } from "./image-store"
```

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/image-store.ts packages/persistence/src/index.ts packages/persistence/test/image-store.test.ts
git commit -m "Phase 6.8: persistence — addImageFromBlob (content-addressed image upload)"
```

---

## Task 9: Public barrel cleanup + DEPENDS_ON list

Verify the barrel exports a clean, ordered surface.

**Files:**

- Modify: `packages/persistence/src/index.ts`

- [ ] **Step 1: Rewrite `index.ts` with grouped exports**

```ts
// packages/persistence/src/index.ts
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME]

// Binary helpers
export { blobToDataURL, dataURLToBlob, sha256Hex } from "./binary"

// localStorage scene + UI
export { clearLocal, loadScene, loadUI, saveScene, saveUI } from "./local-store"

// IndexedDB image binaries
export {
  addImageFromBlob,
  clearAllFiles,
  deleteFile,
  getAllFiles,
  getFile,
  putFile,
} from "./image-store"

// File I/O
export { download, parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "./file-io"

// Migrations
export { migrate } from "./migrations"

// Auto-save controller
export { createAutoSaver } from "./auto-save"
export type { AutoSaver, AutoSaverOptions } from "./auto-save"
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @excalidraw-clone/persistence typecheck && pnpm --filter @excalidraw-clone/persistence lint && pnpm --filter @excalidraw-clone/persistence test`
Expected: all green. Existing `smoke.test.ts` (`PACKAGE_NAME`/`PACKAGE_VERSION`) still passes.

- [ ] **Step 3: Whole-monorepo gate**

Run: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/index.ts
git commit -m "Phase 6.9: persistence — final barrel + monorepo gate green"
```

---

## Task 10: Image tool reducer in `@excalidraw-clone/tools`

The image tool is the only Phase 5 deferral that depends on `persistence`. We add it now and register it.

**Files:**

- Create: `packages/tools/src/tools/image/index.ts`
- Create: `packages/tools/test/image.test.ts`
- Modify: `packages/tools/src/registry.ts`
- Modify: `packages/tools/src/index.ts` (export)

> **Boundary check:** `packages/tools` cannot import `@excalidraw-clone/persistence` (per `eslint.config.mjs`). The image tool **does not** call `addImageFromBlob` itself — it consumes `{ fileId, mimeType, width, height }` and emits a `mutation` effect that adds an `ExcalidrawImageElement`. The driver in `apps/web` orchestrates: file picker → `addImageFromBlob` → push tool event with the resulting metadata.

**Tool contract:**

```ts
type ImageEvent =
  | {
      type: "imageReady"
      fileId: string
      mimeType: string
      width: number
      height: number
      at: Point
    }
  | ToolEvent

type ImageState =
  | { phase: "idle" }
  | { phase: "placing"; fileId: string; mimeType: string; aspect: number }
```

Idle → on `imageReady` → placing. While placing, `pointerDown` commits an image element at that scene position with default size (preserving aspect). `escape` returns to idle.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tools/test/image.test.ts
import { newImage, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { imageTool, type ImageEvent } from "../src/tools/image"
import type { ToolContext } from "../src/types"

const ctx: ToolContext = {
  readElements: () => [],
  hitTest: () => null,
  viewTransform: { scrollX: 0, scrollY: 0, zoom: 1 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  selectedIds: [],
}

describe("imageTool", () => {
  it("starts idle", () => {
    expect(imageTool.initial.phase).toBe("idle")
  })

  it("imageReady transitions idle → placing", () => {
    const [next] = imageTool.reducer(
      imageTool.initial,
      {
        type: "imageReady",
        fileId: "abc",
        mimeType: "image/png",
        width: 200,
        height: 100,
        at: { x: 0, y: 0 },
      } as ImageEvent,
      ctx,
    )
    expect(next.phase).toBe("placing")
  })

  it("pointerDown in placing emits a mutation that adds an image element", () => {
    const [, effects] = imageTool.reducer(
      { phase: "placing", fileId: "abc", mimeType: "image/png", aspect: 2 },
      { type: "pointerDown", at: { x: 50, y: 50 } },
      ctx,
    )
    const mutation = effects.find((e) => e.kind === "mutation")
    expect(mutation).toBeDefined()
    const draft: ExcalidrawElement[] = []
    if (mutation && mutation.kind === "mutation") mutation.apply(draft)
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("image")
  })

  it("escape in placing returns to idle", () => {
    const [next] = imageTool.reducer(
      { phase: "placing", fileId: "abc", mimeType: "image/png", aspect: 1 },
      { type: "escape" },
      ctx,
    )
    expect(next.phase).toBe("idle")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test test/image.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the image tool**

```ts
// packages/tools/src/tools/image/index.ts
import { newImage, type ExcalidrawImageElement } from "@excalidraw-clone/scene"
import type { Point } from "@excalidraw-clone/geometry"
import { NO_EFFECTS } from "../../types"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../../types"

export type ImageEvent =
  | {
      type: "imageReady"
      fileId: string
      mimeType: string
      width: number
      height: number
      at: Point
    }
  | ToolEvent

export type ImageState =
  | { phase: "idle" }
  | { phase: "placing"; fileId: string; mimeType: string; aspect: number }

const DEFAULT_PLACED_WIDTH = 200

export const imageTool: Tool<ImageState, ImageEvent> = {
  initial: { phase: "idle" },
  reducer(state, event, _ctx: ToolContext): [ImageState, readonly ToolEffect[]] {
    switch (event.type) {
      case "imageReady": {
        const aspect = event.height === 0 ? 1 : event.width / event.height
        return [
          { phase: "placing", fileId: event.fileId, mimeType: event.mimeType, aspect },
          NO_EFFECTS,
        ]
      }
      case "pointerDown": {
        if (state.phase !== "placing") return [state, NO_EFFECTS]
        const w = DEFAULT_PLACED_WIDTH
        const h = Math.round(w / state.aspect)
        const fileId = state.fileId
        const at = event.at
        const apply = (
          draft: ExcalidrawImageElement["fileId"] extends string ? unknown : never,
        ): void => {
          // typed below in the closure where we know draft is ExcalidrawElement[]
          throw new Error("unreachable")
        }
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                const el = newImage({ x: at.x, y: at.y, width: w, height: h, fileId })
                draft.push(el)
              },
            },
            { kind: "switchTool", tool: "selection" },
          ],
        ]
      }
      case "escape":
        return [{ phase: "idle" }, NO_EFFECTS]
      default:
        return [state, NO_EFFECTS]
    }
  },
}
```

> Note: the apparent `apply` placeholder is never used — only the real arrow-function `apply` inside the effect is invoked. The throw exists to satisfy the discriminator. If the simpler form compiles, drop the dead binding.

**Simplified version (use this instead if `newImage` accepts `{ x, y, width, height, fileId }`):**

```ts
// packages/tools/src/tools/image/index.ts
import { newImage } from "@excalidraw-clone/scene"
import type { Point } from "@excalidraw-clone/geometry"
import { NO_EFFECTS } from "../../types"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../../types"

export type ImageEvent =
  | {
      type: "imageReady"
      fileId: string
      mimeType: string
      width: number
      height: number
      at: Point
    }
  | ToolEvent

export type ImageState =
  | { phase: "idle" }
  | { phase: "placing"; fileId: string; mimeType: string; aspect: number }

const DEFAULT_PLACED_WIDTH = 200

export const imageTool: Tool<ImageState, ImageEvent> = {
  initial: { phase: "idle" },
  reducer(state, event, _ctx: ToolContext): [ImageState, readonly ToolEffect[]] {
    switch (event.type) {
      case "imageReady": {
        const aspect = event.height === 0 ? 1 : event.width / event.height
        return [
          { phase: "placing", fileId: event.fileId, mimeType: event.mimeType, aspect },
          NO_EFFECTS,
        ]
      }
      case "pointerDown": {
        if (state.phase !== "placing") return [state, NO_EFFECTS]
        const w = DEFAULT_PLACED_WIDTH
        const h = Math.round(w / state.aspect)
        const { fileId } = state
        const { at } = event
        return [
          { phase: "idle" },
          [
            {
              kind: "mutation",
              apply: (draft) => {
                draft.push(newImage({ x: at.x, y: at.y, width: w, height: h, fileId }))
              },
            },
            { kind: "switchTool", tool: "selection" },
          ],
        ]
      }
      case "escape":
        return [{ phase: "idle" }, NO_EFFECTS]
      default:
        return [state, NO_EFFECTS]
    }
  },
}
```

> **Verify the `newImage` signature** before writing the impl. Run: `grep -n "export function newImage\|export const newImage" packages/scene/src/factories.ts` and read its `NewImageInput` type. Adapt the args object to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/tools test test/image.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Register in `registry.ts` + export from barrel**

Modify `packages/tools/src/registry.ts`:

```ts
// add the import
import { imageTool } from "./tools/image"

// add the entry to TOOLS — keep the existing Record<ToolName, ...> shape
export const TOOLS = {
  // ...existing entries unchanged
  image: imageTool,
} as const
```

Modify `packages/tools/src/index.ts`:

```ts
export { imageTool } from "./tools/image"
export type { ImageEvent, ImageState } from "./tools/image"
```

> Confirm `"image"` is already in the `ToolName` union at `packages/tools/src/types.ts`. If it isn't, add it (Phase 5 used it in the registry placeholder, so it likely is).

- [ ] **Step 6: Verify whole-monorepo gate**

Run: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/tools/image/ packages/tools/src/registry.ts packages/tools/src/index.ts packages/tools/test/image.test.ts
git commit -m "Phase 6.10: tools — image tool reducer + registry"
```

---

## Phase 6 done — verification

After Task 10 commits:

- [ ] **Run full monorepo gate one more time**

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. Test count: previous baseline + ~30 persistence + ~4 image tool ≈ 256+ tests.

- [ ] **Push to origin**

Confirm with the user before pushing — Phase 6 is several commits and they may want to review locally first.

```bash
git push origin develop
```

---

## Self-review summary

Coverage:

- Spec § 8.1 (auto-save) → Tasks 3 + 7
- Spec § 8.2 (image binaries via IDB) → Tasks 4 + 8
- Spec § 8.3 (file I/O) → Task 6
- Spec § 8.4 (migrations) → Task 5
- Spec § 11 (testing: `fake-indexeddb` + migration goldens) → Task 1 setup + Task 5 fixtures
- Spec § 12 step 6 (deferred image tool) → Task 10

No placeholders. All steps have concrete code, exact paths, exact commands.

Consistency: `migrate(raw: unknown): ExcalidrawData` is referenced from Task 5 (defined) and Task 6 (consumed). `addImageFromBlob` is added in Task 8 and consumed by Phase 8 driver. `newImage` signature should be verified before Task 10 — explicit instruction to grep included.
