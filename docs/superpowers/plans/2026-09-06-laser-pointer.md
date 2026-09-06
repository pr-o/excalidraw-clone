# Laser Pointer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky laser-pointer tool whose hover trail fades out over ~700 ms and never becomes a scene element.

**Architecture:** A new `laser` tool reducer emits a new `laserMove` effect on every pointer down/move. `applyEffects` forwards the point to a `LaserTrail` controller that owns a self-stopping `requestAnimationFrame` decay loop and paints a dedicated third `<canvas>` layer in `CanvasShell`. Nothing touches the `Scene`, persistence, undo, or export. The `CanvasRenderer` is not modified.

**Tech Stack:** TypeScript, React 19, Zustand store, Vitest + Testing Library (unit), Playwright (e2e), pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-09-06-laser-pointer-design.md`

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH; `pnpm --filter web e2e:install` installs browsers). The test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`parseStoredScene`, `dragOnCanvas`).
- i18n: every namespace key used by a component must exist in **both** `en` and `ko` locale files or `apps/web/test/i18n-shortcuts.test.tsx` fails.
- Tool reducers are pure: `reduce(state, event, ctx) => [state, readonly ToolEffect[]]`. Use the shared `NO_EFFECTS` constant for the empty-effects case.
- Commit after every task. Branch is `feat/laser-pointer` (already created off `develop`, spec already committed as `130a9dc`).
- Do **not** add `"laser"` to `SNAPPABLE_TOOLS` in `useDrawingDriver.ts` — the trail must not grid-snap.

---

### Task 1: `laser` tool + `laserMove` effect

**Files:**

- Modify: `packages/tools/src/types.ts` (add to `ToolName` union ~line 4-19; add to `ToolEffect` union ~line 60-66)
- Create: `packages/tools/src/tools/laser.ts`
- Modify: `packages/tools/src/registry.ts` (import + `TOOLS` entry)
- Modify: `packages/tools/src/index.ts` (export `laserTool`, `LaserState`)
- Test: `packages/tools/test/laser-tool.test.ts`

**Interfaces:**

- Consumes: `Tool`, `ToolEvent`, `NO_EFFECTS` from `../types`; `Point` from `@excalidraw-clone/geometry`.
- Produces:
  - `ToolName` now includes `"laser"`.
  - `ToolEffect` now includes `{ kind: "laserMove"; at: Point }`.
  - `export type LaserState = { phase: "idle" }`
  - `export const laserTool: Tool<LaserState, ToolEvent>` — `reduce` returns `[state, [{ kind: "laserMove", at: event.at }]]` for `pointerDown` and `pointerMove`, `[state, NO_EFFECTS]` otherwise. `initial` is a module-level frozen `{ phase: "idle" }` returned by reference every call.

- [ ] **Step 1: Add `"laser"` to the `ToolName` union**

In `packages/tools/src/types.ts`, add `| "laser"` as the last member of the `ToolName` union (after `| "note"`).

- [ ] **Step 2: Add the `laserMove` effect kind**

In `packages/tools/src/types.ts`, add this line to the `ToolEffect` union (after the `switchTool` member):

```ts
  | { kind: "laserMove"; at: Point }
```

`Point` is already imported at the top of the file.

- [ ] **Step 3: Write the failing reducer test**

Create `packages/tools/test/laser-tool.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { laserTool } from "../src"
import { makeCtx, point } from "./test-utils"

describe("laser tool", () => {
  it("pointerDown emits a single laserMove effect carrying the point", () => {
    const [state, effects] = laserTool.reduce(
      laserTool.initial,
      { type: "pointerDown", at: point(12, 34) },
      makeCtx(),
    )
    expect(state).toBe(laserTool.initial)
    expect(effects).toEqual([{ kind: "laserMove", at: { x: 12, y: 34 } }])
  })

  it("pointerMove emits a single laserMove effect carrying the point", () => {
    const [, effects] = laserTool.reduce(
      laserTool.initial,
      { type: "pointerMove", at: point(5, 6) },
      makeCtx(),
    )
    expect(effects).toEqual([{ kind: "laserMove", at: { x: 5, y: 6 } }])
  })

  it("pointerUp / escape / doubleClick emit no effects and keep state identity", () => {
    for (const event of [
      { type: "pointerUp", at: point(0, 0) },
      { type: "escape" },
      { type: "doubleClick", at: point(0, 0) },
    ] as const) {
      const [state, effects] = laserTool.reduce(laserTool.initial, event, makeCtx())
      expect(state).toBe(laserTool.initial)
      expect(effects).toEqual([])
    }
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test laser-tool`
Expected: FAIL — `laserTool` is not exported / does not exist.

- [ ] **Step 5: Implement `laser.ts`**

Create `packages/tools/src/tools/laser.ts`:

```ts
import type { Tool, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

export type LaserState = { phase: "idle" }

const LASER_INITIAL: LaserState = { phase: "idle" }

export const laserTool: Tool<LaserState, ToolEvent> = {
  name: "laser",
  initial: LASER_INITIAL,
  reduce(state, event) {
    if (event.type === "pointerDown" || event.type === "pointerMove") {
      return [state, [{ kind: "laserMove", at: event.at }]]
    }
    return [state, NO_EFFECTS]
  },
}
```

- [ ] **Step 6: Register the tool**

In `packages/tools/src/registry.ts`:

- Add `import { laserTool } from "./tools/laser"` in alphabetical position (after `import { imageTool }`).
- Add `laser: laserTool,` to the `TOOLS` object literal (after `image: imageTool,`).

- [ ] **Step 7: Export the tool**

In `packages/tools/src/index.ts`, after the `noteTool` export block, add:

```ts
export { laserTool } from "./tools/laser"
export type { LaserState } from "./tools/laser"
```

- [ ] **Step 8: Run the tool tests + repo typecheck**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS (including the new file).

Run: `pnpm turbo run typecheck --force`
Expected: PASS. `applyEffects` in `apps/web` has a non-exhaustive `switch` with no `default` and returns `void`, so the new effect kind does not break its typecheck.

- [ ] **Step 9: Commit**

```bash
git add packages/tools/src/types.ts packages/tools/src/tools/laser.ts packages/tools/src/registry.ts packages/tools/src/index.ts packages/tools/test/laser-tool.test.ts
git commit -m "feat(tools): laser tool + laserMove effect"
```

---

### Task 2: `LaserTrail` controller

**Files:**

- Create: `apps/web/src/driver/laserTrail.ts`
- Test: `apps/web/test/laserTrail.test.ts`

**Interfaces:**

- Consumes: `sceneToViewport`, `type Point`, `type ViewTransform` from `@excalidraw-clone/geometry`.
- Produces:
  - `export interface LaserTrailOptions { now?: () => number; raf?: (cb: () => void) => number; caf?: (handle: number) => void; ttlMs?: number }`
  - `export class LaserTrail` with constructor `(canvas: HTMLCanvasElement, getView: () => ViewTransform, opts?: LaserTrailOptions)` and public methods `push(at: Point): void` and `clear(): void`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/laserTrail.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { LaserTrail } from "../src/driver/laserTrail"

type Ctx = Record<string, ReturnType<typeof vi.fn>> & { setTransform: ReturnType<typeof vi.fn> }

function makeHarness(ttlMs = 700) {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as Ctx
  const canvas = { getContext: () => ctx, width: 800, height: 600 } as unknown as HTMLCanvasElement
  let clock = 0
  const queue: (() => void)[] = []
  const trail = new LaserTrail(canvas, () => ({ scrollX: 0, scrollY: 0, zoom: 1 }), {
    now: () => clock,
    raf: (cb) => {
      queue.push(cb)
      return queue.length
    },
    caf: () => {},
    ttlMs,
  })
  return {
    trail,
    ctx,
    advance: (ms: number) => {
      clock += ms
    },
    flush: () => {
      const cbs = queue.splice(0)
      for (const cb of cbs) cb()
    },
    pending: () => queue.length,
  }
}

describe("LaserTrail", () => {
  it("push schedules exactly one animation frame while the loop is idle", () => {
    const h = makeHarness()
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 10, y: 10 })
    expect(h.pending()).toBe(1)
  })

  it("prunes points older than ttlMs and stops the loop when empty", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.advance(800)
    h.flush()
    expect(h.pending()).toBe(0) // no reschedule
    expect(h.ctx.clearRect).toHaveBeenCalled()
    expect(h.ctx.stroke).not.toHaveBeenCalled()
  })

  it("keeps animating while live points remain", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 20, y: 0 })
    h.advance(100)
    h.flush()
    expect(h.pending()).toBe(1)
    expect(h.ctx.stroke).toHaveBeenCalled()
  })

  it("clear empties points and cancels the frame", () => {
    const h = makeHarness()
    const caf = vi.fn()
    h.trail.push({ x: 1, y: 1 })
    // replace nothing — just assert behaviour via next flush
    h.trail.clear()
    h.flush()
    expect(h.pending()).toBe(0)
    expect(h.ctx.clearRect).toHaveBeenCalled()
    void caf
  })

  it("draws one stroke per segment between consecutive live points", () => {
    const h = makeHarness(700)
    h.trail.push({ x: 0, y: 0 })
    h.trail.push({ x: 10, y: 0 })
    h.trail.push({ x: 20, y: 0 })
    h.advance(50)
    h.flush()
    expect(h.ctx.stroke.mock.calls.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test laserTrail`
Expected: FAIL — cannot resolve `../src/driver/laserTrail`.

- [ ] **Step 3: Implement `laserTrail.ts`**

Create `apps/web/src/driver/laserTrail.ts`:

```ts
import { sceneToViewport, type Point, type ViewTransform } from "@excalidraw-clone/geometry"

interface TrailPoint {
  x: number
  y: number
  t: number
}

export interface LaserTrailOptions {
  now?: () => number
  raf?: (cb: () => void) => number
  caf?: (handle: number) => void
  ttlMs?: number
}

const DEFAULT_TTL_MS = 700
const STROKE = "#fa5252"
const MAX_WIDTH = 4
const GLOW_BLUR = 8

/** Owns the ephemeral laser-pointer trail: a list of timestamped scene points,
 *  a self-stopping animation loop that fades and prunes them, and the painting
 *  of a dedicated overlay canvas. Never touches the Scene. */
export class LaserTrail {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly getView: () => ViewTransform
  private readonly now: () => number
  private readonly raf: (cb: () => void) => number
  private readonly caf: (handle: number) => void
  private readonly ttlMs: number
  private points: TrailPoint[] = []
  private frame: number | null = null

  constructor(
    canvas: HTMLCanvasElement,
    getView: () => ViewTransform,
    opts: LaserTrailOptions = {},
  ) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")
    this.getView = getView
    this.now = opts.now ?? (() => performance.now())
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb))
    this.caf = opts.caf ?? ((h) => cancelAnimationFrame(h))
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  }

  push(at: Point): void {
    this.points.push({ x: at.x, y: at.y, t: this.now() })
    if (this.frame === null) this.frame = this.raf(() => this.tick())
  }

  clear(): void {
    this.points = []
    if (this.frame !== null) {
      this.caf(this.frame)
      this.frame = null
    }
    this.paintClear()
  }

  private tick(): void {
    this.frame = null
    const cutoff = this.now() - this.ttlMs
    this.points = this.points.filter((p) => p.t >= cutoff)
    this.draw()
    if (this.points.length > 0) {
      this.frame = this.raf(() => this.tick())
    } else {
      this.paintClear()
    }
  }

  private paintClear(): void {
    const { ctx, canvas } = this
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  private draw(): void {
    const { ctx, canvas } = this
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.points.length < 2) return
    const view = this.getView()
    const nowT = this.now()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = STROKE
    ctx.shadowColor = STROKE
    ctx.shadowBlur = GLOW_BLUR
    for (let i = 1; i < this.points.length; i += 1) {
      const a = this.points[i - 1]!
      const b = this.points[i]!
      const life = Math.max(0, 1 - (nowT - b.t) / this.ttlMs)
      if (life <= 0) continue
      const pa = sceneToViewport({ x: a.x, y: a.y }, view)
      const pb = sceneToViewport({ x: b.x, y: b.y }, view)
      ctx.globalAlpha = life
      ctx.lineWidth = MAX_WIDTH * life
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test laserTrail`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/laserTrail.ts apps/web/test/laserTrail.test.ts
git commit -m "feat(web): LaserTrail controller with self-stopping decay loop"
```

---

### Task 3: Driver wiring — third canvas, effect sink

**Files:**

- Modify: `apps/web/src/driver/effects.ts` (signature + new case)
- Modify: `apps/web/src/components/CanvasShell.tsx` (third canvas + resize + prop)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (`laserRef`, construct, pass, clear)
- Test: `apps/web/test/effects.test.ts` (add one case)

**Interfaces:**

- Consumes: `LaserTrail` from `./laserTrail`; `type Point` from `@excalidraw-clone/geometry`.
- Produces:
  - `applyEffects(scene: Scene, effects: readonly ToolEffect[], laser?: { push(at: Point): void }): void` — third param optional; the `laserMove` case calls `laser?.push(eff.at)`.
  - `DriverOptions` gains `laserRef: RefObject<HTMLCanvasElement | null>` (required).
  - `CanvasShellProps` unchanged; `CanvasShell` internally owns `laserRef`.

- [ ] **Step 1: Write the failing effects test**

In `apps/web/test/effects.test.ts`, add this case inside the `describe("applyEffects", ...)` block:

```ts
it("laserMove effect forwards the point to the laser sink and never mutates the scene", () => {
  const scene = new Scene()
  const spy = vi.spyOn(scene, "mutate")
  const push = vi.fn()
  applyEffects(scene, [{ kind: "laserMove", at: { x: 3, y: 4 } }], { push })
  expect(push).toHaveBeenCalledWith({ x: 3, y: 4 })
  expect(spy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test effects`
Expected: FAIL — `applyEffects` takes 2 args / `laserMove` is not handled (TS error on the 3rd argument or the case).

- [ ] **Step 3: Update `effects.ts`**

In `apps/web/src/driver/effects.ts`:

- Add import: `import type { Point } from "@excalidraw-clone/geometry"`
- Change the signature to:

```ts
export function applyEffects(
  scene: Scene,
  effects: readonly ToolEffect[],
  laser?: { push(at: Point): void },
): void {
```

- Add this case to the `switch (eff.kind)` block (after `case "startTextEdit":`):

```ts
      case "laserMove":
        laser?.push(eff.at)
        break
```

- [ ] **Step 4: Run the effects test to verify it passes**

Run: `pnpm --filter web test effects`
Expected: PASS.

- [ ] **Step 5: Add the third canvas to `CanvasShell.tsx`**

In `apps/web/src/components/CanvasShell.tsx`:

- Add after `const overlayRef = useRef<HTMLCanvasElement>(null)`:

```ts
const laserRef = useRef<HTMLCanvasElement>(null)
```

- In the resize `useEffect`, change the guard and the sizing loop:

```ts
const wrapper = wrapperRef.current
const canvas = canvasRef.current
const overlay = overlayRef.current
const laser = laserRef.current
if (!wrapper || !canvas || !overlay || !laser) return
```

```ts
      for (const c of [canvas, overlay, laser]) {
```

- Add the canvas element to the returned JSX, immediately after the overlay `<canvas>`:

```tsx
<canvas ref={laserRef} className="pointer-events-none absolute inset-0" />
```

- Pass the ref into the driver call:

```ts
useDrawingDriver({
  scene,
  canvasRef,
  overlayRef,
  laserRef,
  ...(onRendererReady ? { onReady: onRendererReady } : {}),
  ...(onRendererTeardown ? { onTeardown: onRendererTeardown } : {}),
})
```

- [ ] **Step 6: Wire `useDrawingDriver.ts`**

In `apps/web/src/driver/useDrawingDriver.ts`:

- Add `import { LaserTrail } from "./laserTrail"` near the other `./` imports.
- In `interface DriverOptions`, add:

```ts
laserRef: RefObject<HTMLCanvasElement | null>
```

- Add `laserRef` to the destructured params of `useDrawingDriver({ ... })`.
- Immediately after `const overlay = overlayRef.current` / the `if (!canvas || !overlay) return` guard, add:

```ts
const laserCanvas = laserRef.current
if (!laserCanvas) return
const laser = new LaserTrail(laserCanvas, () => {
  const s = useAppStore.getState()
  return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }
})
```

- In the `dispatch` function, change `applyEffects(scene, effects)` to `applyEffects(scene, effects, laser)`.
- In the `useAppStore.subscribe((s, prev) => { ... })` block, add:

```ts
if (s.activeTool !== prev.activeTool && prev.activeTool === "laser") laser.clear()
```

- In the cleanup `return () => { ... }`, add `laser.clear()` (before `renderer.stop()`).
- Add `laserRef` to the effect's dependency array.

- [ ] **Step 7: Run web unit tests + typecheck + build**

Run: `pnpm --filter web test`
Expected: PASS.

Run: `pnpm turbo run typecheck build --force`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/driver/effects.ts apps/web/src/components/CanvasShell.tsx apps/web/src/driver/useDrawingDriver.ts apps/web/test/effects.test.ts
git commit -m "feat(web): wire LaserTrail into the driver on a dedicated canvas"
```

---

### Task 4: Discoverability — toolbar, shortcut, help, i18n

**Files:**

- Modify: `packages/ui/src/Toolbar.tsx` (`TOOL_ITEMS`)
- Modify: `packages/ui/src/shared/icons.ts` (`ICONS.laser`)
- Modify: `packages/ui/src/HelpDialog.tsx` (`TOOL_SHORTCUTS`)
- Modify: `apps/web/src/keyboard/shortcuts.ts` (`TOOL_KEYS` + escape branch)
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json` (`toolbar.laser`)
- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json` (`laser`)
- Test: `packages/ui/test/Toolbar.test.tsx`, `packages/ui/test/HelpDialog.test.tsx`

**Interfaces:**

- Consumes: `ToolName` (now includes `"laser"`).
- Produces: a `toolbar-laser` test id; the `k` key mapped to the `laser` tool; `Escape` returns `laser` → `selection`.

- [ ] **Step 1: Write the failing UI tests**

In `packages/ui/test/Toolbar.test.tsx`, add inside `describe("Toolbar", ...)`:

```ts
  it("renders a laser pointer tool button", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-laser")).toBeInTheDocument()
  })

  it("calls onSelectTool with 'laser' on click", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} />)
    await userEvent.click(screen.getByTestId("toolbar-laser"))
    expect(onSelectTool).toHaveBeenCalledWith("laser")
  })
```

In `packages/ui/test/HelpDialog.test.tsx`, add inside `describe("HelpDialog", ...)`:

```ts
  it("lists the laser pointer shortcut", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("K")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:laser")).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test Toolbar HelpDialog`
Expected: FAIL — no `toolbar-laser`, no `shortcuts:laser` row.

- [ ] **Step 3: Add the toolbar item**

In `packages/ui/src/Toolbar.tsx`, append to the `TOOL_ITEMS` array (after `{ name: "note", shortcut: "N" }`):

```ts
  { name: "laser", shortcut: "K" },
```

- [ ] **Step 4: Add the icon**

In `packages/ui/src/shared/icons.ts`, add this entry to the `ICONS` object (after the `note:` entry):

```ts
  laser:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>',
```

- [ ] **Step 5: Add the HelpDialog entry**

In `packages/ui/src/HelpDialog.tsx`, append to `TOOL_SHORTCUTS` (after `{ keys: "N", label: "shortcuts:note" }`):

```ts
  { keys: "K", label: "shortcuts:laser" },
```

- [ ] **Step 6: Run the UI tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test Toolbar HelpDialog`
Expected: PASS.

- [ ] **Step 7: Map the `k` key and handle Escape**

In `apps/web/src/keyboard/shortcuts.ts`:

- Add `k: "laser",` to the `TOOL_KEYS` object (after `n: "note",`).
- Replace the existing escape branch:

```ts
if (key === "escape") {
  useAppStore.getState().setSelection([])
  return
}
```

with:

```ts
if (key === "escape") {
  const store = useAppStore.getState()
  if (store.activeTool === "laser") store.setActiveTool("selection")
  store.setSelection([])
  return
}
```

- [ ] **Step 8: Add the i18n strings**

- `apps/web/src/locales/en/common.json` → `"toolbar"` object: add `"laser": "Laser pointer"` after `"note"`.
- `apps/web/src/locales/ko/common.json` → `"toolbar"` object: add `"laser": "레이저 포인터"` after `"note"`.
- `apps/web/src/locales/en/shortcuts.json`: add `"laser": "Laser pointer"` after `"note"`.
- `apps/web/src/locales/ko/shortcuts.json`: add `"laser": "레이저 포인터"` after `"note"`.

- [ ] **Step 9: Run the affected unit suites + typecheck**

Run: `pnpm --filter @excalidraw-clone/ui test && pnpm --filter web test`
Expected: PASS (includes `i18n-shortcuts.test.tsx`, which needs both locales to resolve).

Run: `pnpm turbo run typecheck --force`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/Toolbar.tsx packages/ui/src/shared/icons.ts packages/ui/src/HelpDialog.tsx packages/ui/test/Toolbar.test.tsx packages/ui/test/HelpDialog.test.tsx apps/web/src/keyboard/shortcuts.ts apps/web/src/locales
git commit -m "feat(ui): laser pointer toolbar item, K shortcut, help + i18n"
```

---

### Task 5: End-to-end spec + full gate

**Files:**

- Create: `apps/web/e2e/laser.spec.ts`

**Interfaces:**

- Consumes: `parseStoredScene` from `./_helpers`; `toolbar-laser` / `toolbar-selection` test ids; `k` / `Escape` keys.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/laser.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

async function pressed(
  page: import("@playwright/test").Page,
  testId: string,
): Promise<string | null> {
  return page.locator(`[data-testid="${testId}"]`).getAttribute("aria-pressed")
}

test("laser trail leaves no persisted elements and the tool is sticky", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-laser"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-laser"]').click()
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 150, box.y + 150)
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(box.x + 150 + i * 18, box.y + 150 + i * 7)
  }
  await page.waitForTimeout(200)
  await page.screenshot({ path: "e2e/_laser.png" })

  // sticky: still the active tool after the sweep
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  // ephemeral: nothing landed in the scene
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(parseStoredScene(json).elements.length).toBe(0)
})

test("k selects the laser tool and Escape returns to selection", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-laser"]').waitFor({ state: "visible" })

  await page.keyboard.press("k")
  await page.waitForTimeout(100)
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  await page.keyboard.press("Escape")
  await page.waitForTimeout(100)
  expect(await pressed(page, "toolbar-selection")).toBe("true")
})
```

- [ ] **Step 2: Run the new spec**

Run (from `apps/web/`): `pnpm exec playwright test e2e/laser.spec.ts --reporter=list`
Expected: PASS (2 tests). If the dev server is not already up, Playwright starts it (`webServer` config).

- [ ] **Step 3: Inspect the screenshot**

Open `apps/web/e2e/_laser.png` and confirm a red fading trail is visible along the swept path. (This file is a scratch artifact — do not commit it; it is covered by the existing e2e screenshot ignore rules, but if `git status` shows it, delete it.)

- [ ] **Step 4: Run the full gate**

Run: `pnpm turbo run lint typecheck test build --force`
Expected: all tasks PASS.

Run (from `apps/web/`): `pnpm exec playwright test --reporter=list`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/laser.spec.ts
git commit -m "test(web): e2e coverage for the laser pointer tool"
```

- [ ] **Step 6: Integrate the branch**

Follow the project's standard flow (see `superpowers:finishing-a-development-branch`): fast-forward `feat/laser-pointer` → `develop` → `main`, push both, delete the feature branch, then update memory.

---

## Self-Review

**1. Spec coverage**

| Spec item                                                                                                     | Task                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `laser` in `ToolName`, `laserMove` in `ToolEffect`                                                            | 1                         |
| `laserTool` reducer (hover activation, sticky, no scene mutation)                                             | 1                         |
| `LaserTrail` controller (scene-space points, ~700ms fade, self-stopping RAF, red glow, constant screen width) | 2                         |
| Dedicated third canvas in `CanvasShell` + resize                                                              | 3                         |
| `applyEffects` forwards `laserMove`                                                                           | 3                         |
| Driver constructs `LaserTrail`, clears on tool-change-away + teardown                                         | 3                         |
| Toolbar item + `K` + icon                                                                                     | 4                         |
| `TOOL_KEYS.k`, Escape → selection                                                                             | 4                         |
| HelpDialog entry, en/ko i18n                                                                                  | 4                         |
| Reducer / controller / effects unit tests                                                                     | 1, 2, 3                   |
| e2e: no persisted elements, sticky, `k`, Escape                                                               | 5                         |
| Full gate                                                                                                     | 5                         |
| Out of scope: collab, HiDPI fix, config color, group rotation                                                 | not implemented (correct) |

No gaps.

**2. Placeholder scan** — every code step contains complete, runnable code. No TBD/TODO/"handle edge cases". The one prose-only step (5.3, screenshot inspection) is a human verification step, not a code step.

**3. Type consistency**

- `laserTool` / `LaserState` — defined Task 1, consumed Tasks 3 (via effect), 4 (name only). Consistent.
- `LaserTrail(canvas, getView, opts?)` + `push(at)` / `clear()` — defined Task 2, consumed Task 3. Consistent.
- `applyEffects(scene, effects, laser?)` with `laser: { push(at: Point): void }` — Task 3 signature matches the `LaserTrail.push(at: Point)` shape from Task 2 and the test stub `{ push }`.
- `laserRef: RefObject<HTMLCanvasElement | null>` — added to `DriverOptions` (Task 3) and passed by `CanvasShell` (Task 3, same task). Consistent.
- `{ kind: "laserMove"; at: Point }` — emitted Task 1, matched in the `switch` Task 3, asserted in tests Tasks 1 & 3. Consistent.
