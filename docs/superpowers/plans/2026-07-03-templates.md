# Built-in Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two built-in, read-only starter templates (Flowchart, Kanban) that drop onto the canvas through the existing library place-flow, with bound connectors that stay attached when nodes move.

**Architecture:** Three layers. (1) Scene: a pure `cloneElementsWithNewIds` primitive that re-IDs elements and rewrites every internal reference, plus a `BUILTIN_TEMPLATES` data constant built from existing factories. (2) Web: `placeLibraryItem` swaps its naive re-ID for `cloneElementsWithNewIds` (fixing a latent binding/note bug for all library items), and `App.tsx` passes `BUILTIN_TEMPLATES` to the panel. (3) UI: `LibraryPanel` grows a read-only TEMPLATES section above MY ITEMS.

**Tech Stack:** TypeScript, React, Zustand, Vitest (unit, in `packages/*/test/`), @testing-library/react (UI unit), Playwright (e2e in `apps/web/e2e/`), pnpm + Turbo monorepo.

## Global Constraints

- Node `>=22.0.0`, pnpm `>=10.0.0` (root `package.json` engines).
- `crypto.randomUUID()` is the id source for placement (browser + Node 22 test env) — matches existing `placeLibraryItem`.
- Scene package is framework-free: no React, no DOM beyond `crypto`. Only depends on `@excalidraw-clone/geometry`.
- `apps/web` has **no** `@testing-library` — React component unit tests MUST live in `packages/ui/test/`. (Confirmed: sticky-note work, Jun 21.)
- Binding shape is `PointBinding = { elementId: string; focus: number; gap: number; fixedPoint?: readonly [number, number] }`. `BoundElement = { id: string; type: "arrow" | "text" }`. `BINDING_GAP = 4`.
- Linear point coords are **relative** to the element's `x`/`y` (`abs = el.x + point.x`). `reconcileBindings` only recomputes arrows with `points.length >= 2`.
- Templates are a code constant — not persisted, not editable/deletable. Two templates only (Flowchart, Kanban). No new thumbnail renderer.
- Follow existing test style: scene tests `import { describe, expect, it } from "vitest"` and import from `../src/...`; UI tests use `render/screen` + `userEvent` with `const t = (key: string): string => key`.

---

### Task 1: `cloneElementsWithNewIds` primitive (scene)

**Files:**

- Create: `packages/scene/src/clone.ts`
- Create: `packages/scene/test/clone.test.ts`
- Modify: `packages/scene/src/index.ts` (add export)

**Interfaces:**

- Consumes: `ExcalidrawElement` union and its member types from `./types`.
- Produces: `cloneElementsWithNewIds(elements: readonly ExcalidrawElement[]): ExcalidrawElement[]` — returns new element objects, each with a fresh `crypto.randomUUID()` id and every **internal** reference (`startBinding.elementId`, `endBinding.elementId`, `boundElements[].id`, `containerId`, `frameId`) rewritten through the old→new id map. References whose target id is not in the set of cloned ids are left unchanged. Does not touch `x`/`y`.

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/clone.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newArrow, newNote, newRectangle } from "../src/factories"
import { cloneElementsWithNewIds } from "../src/clone"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "../src/types"

describe("cloneElementsWithNewIds", () => {
  it("gives every element a fresh id distinct from all originals", () => {
    const els = [
      newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      newRectangle({ x: 20, y: 0, width: 10, height: 10 }),
    ]
    const oldIds = new Set(els.map((e) => e.id))
    const cloned = cloneElementsWithNewIds(els)
    expect(cloned).toHaveLength(2)
    for (const c of cloned) {
      expect(oldIds.has(c.id)).toBe(false)
    }
    expect(new Set(cloned.map((c) => c.id)).size).toBe(2)
  })

  it("rewrites arrow start/end bindings to the cloned node ids", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 100, y: 0, width: 10, height: 10 })
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      startBinding: { elementId: a.id, focus: 0, gap: 4 },
      endBinding: { elementId: b.id, focus: 0, gap: 4 },
    }
    const cloned = cloneElementsWithNewIds([a, b, arrow])
    const [ca, cb, carrow] = cloned as [
      ExcalidrawElement,
      ExcalidrawElement,
      ExcalidrawArrowElement,
    ]
    expect(carrow.startBinding?.elementId).toBe(ca.id)
    expect(carrow.endBinding?.elementId).toBe(cb.id)
    expect(carrow.startBinding?.elementId).not.toBe(a.id)
  })

  it("keeps a note's container<->text references mutually consistent", () => {
    const note = newNote({ x: 0, y: 0, width: 80, height: 80 })
    const cloned = cloneElementsWithNewIds([note.container, note.text])
    const container = cloned.find((e) => e.type === "rectangle")!
    const text = cloned.find((e) => e.type === "text")!
    expect(text.type === "text" ? text.containerId : null).toBe(container.id)
    expect(container.boundElements?.some((b) => b.id === text.id)).toBe(true)
  })

  it("leaves an unmapped external reference unchanged", () => {
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      startBinding: { elementId: "external-id-not-in-set", focus: 0, gap: 4 },
      endBinding: null,
    }
    const [carrow] = cloneElementsWithNewIds([arrow]) as [ExcalidrawArrowElement]
    expect(carrow.startBinding?.elementId).toBe("external-id-not-in-set")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test clone`
Expected: FAIL — cannot resolve `../src/clone` / `cloneElementsWithNewIds` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `packages/scene/src/clone.ts`:

```ts
import type { ExcalidrawElement } from "./types"

/**
 * Deep-clones elements with fresh ids, rewriting every internal reference
 * (bindings, bound elements, container, frame) through the old->new id map.
 * References to ids outside the given set are left as-is. Positions are
 * untouched — callers offset separately.
 */
export function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const idMap = new Map<string, string>()
  for (const el of elements) {
    idMap.set(el.id, crypto.randomUUID())
  }
  const remap = (id: string): string => idMap.get(id) ?? id

  return elements.map((el) => {
    const next = { ...el, id: remap(el.id) } as ExcalidrawElement

    if (next.frameId != null) {
      next.frameId = remap(next.frameId)
    }
    if (next.boundElements != null) {
      next.boundElements = next.boundElements.map((b) => ({ ...b, id: remap(b.id) }))
    }
    if (next.type === "arrow" || next.type === "line") {
      if (next.startBinding) {
        next.startBinding = { ...next.startBinding, elementId: remap(next.startBinding.elementId) }
      }
      if (next.endBinding) {
        next.endBinding = { ...next.endBinding, elementId: remap(next.endBinding.elementId) }
      }
    }
    if (next.type === "text" && next.containerId != null) {
      next.containerId = remap(next.containerId)
    }
    return next
  })
}
```

- [ ] **Step 4: Add the export**

In `packages/scene/src/index.ts`, after the `export { normalizeToOrigin } from "./normalize"` line (line 37), add:

```ts
export { cloneElementsWithNewIds } from "./clone"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test clone`
Expected: PASS — 4 tests.

- [ ] **Step 6: Typecheck the scene package**

Run: `pnpm --filter @excalidraw-clone/scene typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/clone.ts packages/scene/test/clone.test.ts packages/scene/src/index.ts
git commit -m "scene: add cloneElementsWithNewIds id-remap primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `BUILTIN_TEMPLATES` data (scene)

**Files:**

- Create: `packages/scene/src/templates.ts`
- Create: `packages/scene/test/templates.test.ts`
- Modify: `packages/scene/src/index.ts` (add export)

**Interfaces:**

- Consumes: `newArrow`, `newDiamond`, `newRectangle`, `newText`, `newNote` from `./factories`; `BINDING_GAP` from `./bindings`; `LibraryItem` from `./library-item`; element types from `./types`.
- Produces: `BUILTIN_TEMPLATES: LibraryItem[]` — two well-formed `LibraryItem`s (`id: "builtin-flowchart"` name `"Flowchart"`; `id: "builtin-kanban"` name `"Kanban board"`), each with `created: 0` and a self-consistent `elements` array (arrow bindings resolve within the item; text `containerId` resolves to a container whose `boundElements` includes that text).

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { BUILTIN_TEMPLATES } from "../src/templates"
import type { ExcalidrawElement } from "../src/types"

describe("BUILTIN_TEMPLATES", () => {
  it("exposes exactly the flowchart and kanban templates", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual(["builtin-flowchart", "builtin-kanban"])
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.created).toBe(0)
      expect(t.elements.length).toBeGreaterThan(0)
    }
  })

  it("resolves every arrow binding to an element in the same template", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const ids = new Set(t.elements.map((e) => e.id))
      for (const el of t.elements) {
        if (el.type !== "arrow") continue
        if (el.startBinding) expect(ids.has(el.startBinding.elementId)).toBe(true)
        if (el.endBinding) expect(ids.has(el.endBinding.elementId)).toBe(true)
      }
    }
  })

  it("keeps every bound text consistent with its container", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const byId = new Map<string, ExcalidrawElement>(t.elements.map((e) => [e.id, e]))
      for (const el of t.elements) {
        if (el.type !== "text" || el.containerId == null) continue
        const container = byId.get(el.containerId)
        expect(container).toBeDefined()
        expect(container!.boundElements?.some((b) => b.id === el.id)).toBe(true)
      }
    }
  })

  it("has at least one fully bound arrow in the flowchart", () => {
    const flow = BUILTIN_TEMPLATES.find((t) => t.id === "builtin-flowchart")!
    const bound = flow.elements.filter((e) => e.type === "arrow" && e.startBinding && e.endBinding)
    expect(bound.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test templates`
Expected: FAIL — cannot resolve `../src/templates`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/scene/src/templates.ts`:

```ts
import { BINDING_GAP } from "./bindings"
import { newArrow, newDiamond, newNote, newRectangle, newText } from "./factories"
import type { LibraryItem } from "./library-item"
import type {
  BoundElement,
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
} from "./types"

const HEADER_BG = "#e9ecef"

type NodeEl = ExcalidrawRectangleElement | ExcalidrawDiamondElement

/** Builds a labeled node (container + bound text) and registers the back-ref. */
function makeNode(
  kind: "rectangle" | "diamond",
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  rounded: boolean,
  addRef: (nodeId: string, ref: BoundElement) => void,
  labels: ExcalidrawTextElement[],
): NodeEl {
  const node: NodeEl =
    kind === "diamond"
      ? newDiamond({ x, y, width: w, height: h })
      : { ...newRectangle({ x, y, width: w, height: h }), roundness: rounded ? { type: 1 } : null }
  const text = newText({
    x,
    y: y + h / 2 - 10,
    width: w,
    height: 20,
    text: label,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: node.id,
  })
  labels.push(text)
  addRef(node.id, { id: text.id, type: "text" })
  return node
}

function buildFlowchart(): ExcalidrawElement[] {
  const refs = new Map<string, BoundElement[]>()
  const addRef = (nodeId: string, ref: BoundElement): void => {
    const arr = refs.get(nodeId) ?? []
    arr.push(ref)
    refs.set(nodeId, arr)
  }
  const labels: ExcalidrawTextElement[] = []
  const arrows: ExcalidrawArrowElement[] = []

  const start = makeNode("rectangle", 0, 0, 160, 60, "Start", true, addRef, labels)
  const process = makeNode("rectangle", 0, 120, 160, 60, "Process", false, addRef, labels)
  const decision = makeNode("diamond", 0, 240, 160, 80, "Decision?", false, addRef, labels)
  const end = makeNode("rectangle", 0, 400, 160, 60, "End", true, addRef, labels)
  const nodes: NodeEl[] = [start, process, decision, end]

  const connect = (from: NodeEl, to: NodeEl): void => {
    const sx = from.x + from.width / 2
    const sy = from.y + from.height
    const ex = to.x + to.width / 2
    const ey = to.y
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: sx, y: sy }),
      x: sx,
      y: sy,
      width: Math.abs(ex - sx),
      height: Math.abs(ey - sy),
      points: [
        { x: 0, y: 0 },
        { x: ex - sx, y: ey - sy },
      ],
      startBinding: { elementId: from.id, focus: 0, gap: BINDING_GAP },
      endBinding: { elementId: to.id, focus: 0, gap: BINDING_GAP },
    }
    arrows.push(arrow)
    addRef(from.id, { id: arrow.id, type: "arrow" })
    addRef(to.id, { id: arrow.id, type: "arrow" })
  }
  connect(start, process)
  connect(process, decision)
  connect(decision, end)

  const boundNodes = nodes.map((n) => ({ ...n, boundElements: refs.get(n.id) ?? null }))
  return [...boundNodes, ...labels, ...arrows]
}

function buildKanban(): ExcalidrawElement[] {
  const els: ExcalidrawElement[] = []
  const columns = ["To do", "Doing", "Done"]
  columns.forEach((title, i) => {
    const x = i * 180
    const header = newRectangle({ x, y: 0, width: 140, height: 40, backgroundColor: HEADER_BG })
    const label = newText({
      x,
      y: 10,
      width: 140,
      height: 20,
      text: title,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: header.id,
    })
    els.push({ ...header, boundElements: [{ id: label.id, type: "text" }] }, label)
    const note = newNote({ x, y: 60, width: 140, height: 80 })
    els.push(note.container, note.text)
  })
  return els
}

export const BUILTIN_TEMPLATES: LibraryItem[] = [
  { id: "builtin-flowchart", name: "Flowchart", created: 0, elements: buildFlowchart() },
  { id: "builtin-kanban", name: "Kanban board", created: 0, elements: buildKanban() },
]
```

- [ ] **Step 4: Add the export**

In `packages/scene/src/index.ts`, directly after the `export { cloneElementsWithNewIds } from "./clone"` line added in Task 1, add:

```ts
export { BUILTIN_TEMPLATES } from "./templates"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test templates`
Expected: PASS — 4 tests.

- [ ] **Step 6: Typecheck the scene package**

Run: `pnpm --filter @excalidraw-clone/scene typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/templates.ts packages/scene/test/templates.test.ts packages/scene/src/index.ts
git commit -m "scene: add BUILTIN_TEMPLATES (flowchart, kanban)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: LibraryPanel templates section (ui)

**Files:**

- Modify: `packages/ui/src/LibraryPanel.tsx`
- Create: `packages/ui/test/LibraryPanel.test.tsx`

**Interfaces:**

- Consumes: `LibraryItem` (from `@excalidraw-clone/scene`), existing `LibraryPanelProps`.
- Produces: `LibraryPanelProps` gains `templates: LibraryItem[]`. Renders a read-only **TEMPLATES** section (header `t("library.templates")`) with tiles `data-testid={`template-item-${item.id}`}` above the existing **MY ITEMS** section (header `t("library.myItems")`). Template tiles call `onItemClick` but render no `⋯` menu (no `role="menu"`, no rename/delete). User-item tiles keep all existing behavior.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/LibraryPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { LibraryPanel } from "../src/LibraryPanel"

const t = (key: string): string => key

const template: LibraryItem = {
  id: "builtin-flowchart",
  name: "Flowchart",
  created: 0,
  elements: [],
}
const userItem: LibraryItem = { id: "u1", name: "My shape", created: 1, elements: [] }

function renderPanel(over: Partial<React.ComponentProps<typeof LibraryPanel>> = {}) {
  const props = {
    t,
    open: true,
    onToggle: () => {},
    items: [] as LibraryItem[],
    templates: [] as LibraryItem[],
    selectedCount: 0,
    onAddFromSelection: () => {},
    onItemClick: vi.fn(),
    onImport: () => {},
    onExport: () => {},
    onRename: () => {},
    onDelete: () => {},
    renderThumbnail: () => "<svg></svg>",
    ...over,
  }
  render(<LibraryPanel {...props} />)
  return props
}

describe("LibraryPanel templates section", () => {
  it("lists built-in templates under the TEMPLATES header", () => {
    renderPanel({ templates: [template] })
    expect(screen.getByText("library.templates")).toBeInTheDocument()
    expect(screen.getByTestId("template-item-builtin-flowchart")).toBeInTheDocument()
  })

  it("calls onItemClick when a template tile is clicked", async () => {
    const props = renderPanel({ templates: [template] })
    await userEvent.click(
      screen.getByTestId("template-item-builtin-flowchart").querySelector("button")!,
    )
    expect(props.onItemClick).toHaveBeenCalledWith(template)
  })

  it("renders no rename/delete menu on template tiles", async () => {
    renderPanel({ templates: [template] })
    const tile = screen.getByTestId("template-item-builtin-flowchart")
    expect(tile.querySelector('[aria-label="more"]')).toBeNull()
  })

  it("still renders user items with their menu", async () => {
    renderPanel({ items: [userItem] })
    const tile = screen.getByTestId("library-item-u1")
    expect(tile.querySelector('[aria-label="more"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test LibraryPanel`
Expected: FAIL — `templates` prop type error / no TEMPLATES header rendered.

- [ ] **Step 3: Refactor LibraryPanel — extract `ItemTile` and add the templates section**

Replace the entire contents of `packages/ui/src/LibraryPanel.tsx` with:

```tsx
import type { LibraryItem } from "@excalidraw-clone/scene"
import { useState } from "react"

export interface LibraryPanelProps {
  t: (key: string) => string
  open: boolean
  onToggle: () => void
  items: LibraryItem[]
  templates: LibraryItem[]
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

interface ItemTileProps {
  item: LibraryItem
  testId: string
  readOnly: boolean
  renderThumbnail: (item: LibraryItem) => string
  onItemClick: (item: LibraryItem) => void
  renamingId: string | null
  draftName: string
  setDraftName: (v: string) => void
  startRename: (item: LibraryItem) => void
  commitRename: (id: string) => void
  cancelRename: () => void
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onDelete: (id: string) => void
  t: (key: string) => string
}

function ItemTile(props: ItemTileProps): React.ReactElement {
  const { item } = props
  return (
    <li data-testid={props.testId} className="relative">
      <button
        type="button"
        onClick={() => props.onItemClick(item)}
        aria-label={item.name}
        className="flex h-20 w-full items-center justify-center rounded border bg-gray-50 p-1 hover:border-violet-500"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: renderer-controlled SVG
        dangerouslySetInnerHTML={{ __html: props.renderThumbnail(item) }}
      />
      {!props.readOnly && props.renamingId === item.id ? (
        <input
          autoFocus
          value={props.draftName}
          onChange={(e) => props.setDraftName(e.target.value)}
          onBlur={() => props.commitRename(item.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.commitRename(item.id)
            if (e.key === "Escape") props.cancelRename()
          }}
          className="mt-1 w-full rounded border px-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => !props.readOnly && props.startRename(item)}
          className="mt-1 block w-full truncate text-center text-xs"
        >
          {item.name}
        </button>
      )}
      {!props.readOnly && (
        <>
          <button
            type="button"
            onClick={() => props.setMenuOpenId(props.menuOpenId === item.id ? null : item.id)}
            aria-label="more"
            className="absolute right-0 top-0 px-1 text-xs"
          >
            ⋯
          </button>
          {props.menuOpenId === item.id && (
            <div
              role="menu"
              className="absolute right-0 top-5 z-10 rounded bg-white p-1 text-xs shadow"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => props.startRename(item)}
                className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
              >
                {props.t("library.rename")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onDelete(item.id)
                  props.setMenuOpenId(null)
                }}
                className="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50"
              >
                {props.t("library.delete")}
              </button>
            </div>
          )}
        </>
      )}
    </li>
  )
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
  const cancelRename = (): void => setRenamingId(null)

  const tileCommon = {
    renderThumbnail: props.renderThumbnail,
    onItemClick: props.onItemClick,
    renamingId,
    draftName,
    setDraftName,
    startRename,
    commitRename,
    cancelRename,
    menuOpenId,
    setMenuOpenId,
    onDelete: props.onDelete,
    t: props.t,
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
            {props.templates.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase text-gray-500">
                  {props.t("library.templates")}
                </p>
                <ul className="grid grid-cols-3 gap-2">
                  {props.templates.map((item) => (
                    <ItemTile
                      key={item.id}
                      item={item}
                      testId={`template-item-${item.id}`}
                      readOnly
                      {...tileCommon}
                    />
                  ))}
                </ul>
              </>
            )}

            <p className="px-1 pb-1 pt-3 text-xs font-medium uppercase text-gray-500">
              {props.t("library.myItems")}
            </p>
            {props.items.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-gray-500">
                {props.t("library.empty")}
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {props.items.map((item) => (
                  <ItemTile
                    key={item.id}
                    item={item}
                    testId={`library-item-${item.id}`}
                    readOnly={false}
                    {...tileCommon}
                  />
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/ui test LibraryPanel`
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck the ui package**

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/LibraryPanel.tsx packages/ui/test/LibraryPanel.test.tsx
git commit -m "ui: add read-only TEMPLATES section to LibraryPanel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Binding-aware placement (web)

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts` (lines 45-50 inside `placeLibraryItem`; import at lines 5-10)

**Interfaces:**

- Consumes: `cloneElementsWithNewIds` from `@excalidraw-clone/scene` (Task 1).
- Produces: no new export. `placeLibraryItem` now remaps internal references so placed flowcharts keep their bindings and placed notes keep their container↔text link. Verified by the new e2e (Task 6) and by existing `library.spec.ts` staying green.

- [ ] **Step 1: Add the import**

In `apps/web/src/driver/useDrawingDriver.ts`, add `cloneElementsWithNewIds` to the existing `@excalidraw-clone/scene` import block (currently lines 5-10):

```ts
import {
  cloneElementsWithNewIds,
  hitTestElement,
  type ExcalidrawElement,
  type LibraryItem,
  type Scene,
} from "@excalidraw-clone/scene"
```

- [ ] **Step 2: Rewrite the element-cloning line in `placeLibraryItem`**

Replace the current body (lines 45-50):

```ts
const placed: ExcalidrawElement[] = item.elements.map((el) => ({
  ...el,
  id: crypto.randomUUID(),
  x: el.x + x,
  y: el.y + y,
}))
```

with:

```ts
const placed: ExcalidrawElement[] = cloneElementsWithNewIds(item.elements).map((el) => ({
  ...el,
  x: el.x + x,
  y: el.y + y,
}))
```

- [ ] **Step 3: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: no errors. (`ExcalidrawElement` import is still used by the annotation.)

- [ ] **Step 4: Regression-check existing library e2e**

Run: `pnpm --filter web e2e library`
Expected: PASS — the 3 existing library tests still pass (place/cancel/persist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts
git commit -m "web: place library items via cloneElementsWithNewIds

Preserves bindings and note container links on placement; fixes the
latent re-ID bug for user items containing bound arrows or notes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire BUILTIN_TEMPLATES into the app (web)

**Files:**

- Modify: `apps/web/src/components/App.tsx` (import near line 10; `<LibraryPanel>` at lines 334-347)
- Modify: `apps/web/src/locales/en/common.json` (`library` block, lines 94-106)
- Modify: `apps/web/src/locales/ko/common.json` (`library` block, lines 85-97)

**Interfaces:**

- Consumes: `BUILTIN_TEMPLATES` from `@excalidraw-clone/scene` (Task 2); `templates` prop on `LibraryPanel` (Task 3).
- Produces: the running app shows the TEMPLATES section with Flowchart + Kanban tiles. Two new i18n keys: `library.templates`, `library.myItems` (en + ko).

- [ ] **Step 1: Import `BUILTIN_TEMPLATES` in App.tsx**

In `apps/web/src/components/App.tsx`, the scene import is a multi-line block (lines 4-9). Add `BUILTIN_TEMPLATES` as the first member:

```ts
import {
  BUILTIN_TEMPLATES,
  type ExcalidrawElement,
  type LibraryItem,
  normalizeToOrigin,
  Scene,
} from "@excalidraw-clone/scene"
```

- [ ] **Step 2: Pass the `templates` prop**

In the `<LibraryPanel ... />` element (lines 334-347), add the `templates` prop directly after `items={libraryItems}`:

```tsx
items = { libraryItems }
templates = { BUILTIN_TEMPLATES }
```

- [ ] **Step 3: Add en i18n strings**

In `apps/web/src/locales/en/common.json`, inside the `"library"` object, add two keys after `"placing"` (add a comma to the `"placing"` line):

```json
    "placing": "Click to place • Esc to cancel",
    "templates": "Templates",
    "myItems": "My items"
```

- [ ] **Step 4: Add ko i18n strings**

In `apps/web/src/locales/ko/common.json`, inside the `"library"` object, add two keys after `"placing"` (add a comma to the `"placing"` line):

```json
    "placing": "클릭하여 배치 • Esc로 취소",
    "templates": "템플릿",
    "myItems": "내 항목"
```

- [ ] **Step 5: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/App.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: wire BUILTIN_TEMPLATES into LibraryPanel + i18n

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end templates flow + full gate

**Files:**

- Create: `apps/web/e2e/templates.spec.ts`

**Interfaces:**

- Consumes: the full stack from Tasks 1-5. Uses `dragOnCanvas` from `./_helpers`, the `template-item-builtin-flowchart` testid, and the persisted `excalidraw-scene` localStorage key.
- Produces: an e2e proof that placing the flowchart yields bound arrows and that dragging a node reflows its bound arrow.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/templates.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  points?: { x: number; y: number }[]
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const boundArrows = (els: SceneEl[]): SceneEl[] =>
  els.filter((e) => e.type === "arrow" && e.startBinding != null && e.endBinding != null)

const firstPointAbs = (a: SceneEl): { x: number; y: number } => ({
  x: a.x + a.points![0]!.x,
  y: a.y + a.points![0]!.y,
})

test("place a flowchart template, keep bindings, reflow on node drag", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="library-toggle"]').waitFor({ state: "visible" })

  // Open the library and place the flowchart template on the canvas.
  await page.locator('[data-testid="library-toggle"]').click()
  const tile = page.locator('[data-testid="template-item-builtin-flowchart"]')
  await expect(tile).toBeVisible()
  await tile.locator("button").first().click()

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 300, box.y + 150)
  await page.mouse.click(box.x + 300, box.y + 150)
  await page.waitForTimeout(800)

  // Bindings survived placement: the flowchart has fully-bound arrows.
  const placed = await readScene(page)
  const arrows = boundArrows(placed)
  expect(arrows.length).toBeGreaterThanOrEqual(3)

  // Pick the first bound arrow and the node its start is bound to.
  const arrow = arrows[0]!
  const startNode = placed.find((e) => e.id === arrow.startBinding!.elementId)!
  const p0Before = firstPointAbs(arrow)

  // Drag that node to the right; its bound arrow endpoint must follow.
  await page.locator('[data-testid="toolbar-selection"]').click()
  const nodeCenter = { x: startNode.x + startNode.width / 2, y: startNode.y + startNode.height / 2 }
  await dragOnCanvas(page, nodeCenter, { x: nodeCenter.x + 160, y: nodeCenter.y })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  const arrowAfter = after.find((e) => e.id === arrow.id)!
  const p0After = firstPointAbs(arrowAfter)
  expect(Math.abs(p0After.x - p0Before.x)).toBeGreaterThan(20)
})
```

- [ ] **Step 2: Run the new e2e test**

Run: `pnpm --filter web e2e templates`
Expected: PASS — 1 test. If the node-drag assertion is flaky on which arrow binds where, confirm via a screenshot that the flowchart placed; the binding/reflow logic itself is covered by scene unit tests.

- [ ] **Step 3: Run the full monorepo gate**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all green across every package (typecheck, unit tests, lint, build).

- [ ] **Step 4: Run the full e2e suite**

Run: `pnpm --filter web e2e`
Expected: all specs pass (existing 14 + new templates spec).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/templates.spec.ts
git commit -m "web: e2e — place flowchart template, verify bindings + reflow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** clone primitive (Task 1) ✓; template data w/ flowchart bound labels+arrows and kanban headers+notes (Task 2) ✓; binding-aware placement fix (Task 4) ✓; read-only TEMPLATES section w/ `ItemTile` refactor + `readOnly` flag + testids + no menu (Task 3) ✓; App wiring + `library.templates`/`library.myItems` i18n en+ko (Task 5) ✓; e2e place+bindings+drag-reflow (Task 6) ✓. Testing strategy: clone unit tests, template well-formedness tests, LibraryPanel RTL tests, e2e — all present.
- **Type consistency:** `cloneElementsWithNewIds(readonly ExcalidrawElement[]): ExcalidrawElement[]` used identically in Tasks 1/4. `templates: LibraryItem[]` prop consistent across Tasks 3/5. `BINDING_GAP` (4) matches `PointBinding.gap`. Testids `template-item-${id}` consistent across Tasks 3/5/6.
- **Scope guards honored:** two templates only; no persistence; reuses `renderThumbnail`; clone handles exactly today's ref fields (`startBinding`, `endBinding`, `boundElements`, `containerId`, `frameId`).
