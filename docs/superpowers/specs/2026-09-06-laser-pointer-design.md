# Laser Pointer — Design

**Status:** approved (brainstorm 2026-09-06)
**Branch:** `feat/laser-pointer` (off `develop`)

## Summary

Add a laser pointer tool for presenting and screen-sharing. With the tool
active, moving the mouse over the canvas leaves a glowing red trail that
fades out over roughly three-quarters of a second. The trail is purely
ephemeral: it is never an element, never persisted, never exported, never
undoable. This mirrors upstream Excalidraw's laser pointer (minus the
collaborative broadcast, which this clone has no transport for).

## Decisions (from brainstorm)

| Question                    | Decision                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation                  | On hover — no mouse button required.                                                                                                                      |
| Coordinate space            | Scene space — trail points pan and zoom with the canvas.                                                                                                  |
| Tool stickiness             | Sticky — stays active until another tool is picked or Escape.                                                                                             |
| Trail lifetime              | ~700 ms fade (tune during implementation).                                                                                                                |
| Visual                      | Round-capped red (`#fa5252`) polyline, soft `shadowBlur` glow, width + alpha taper newest→oldest, constant screen-pixel width (does not scale with zoom). |
| Persistence / export / undo | None.                                                                                                                                                     |

## Architecture

The clone's tools are pure reducers that return `[state, effects]`; the
renderer draws current state and is told about transient chrome through
imperative `setX()` calls; the driver short-circuits non-reducer gestures
(pan, library-ghost placement). The laser fits this shape with one new
tool, one new effect kind, and one small controller object.

### Data flow

```
hover mousemove
  → useDrawingDriver.dispatchPointer("pointerMove")
  → laserTool.reduce(state, { type: "pointerMove", at })  ->  [state, [{ kind: "laserMove", at }]]
  → applyEffects(scene, effects, laserTrail)
  → laserTrail.push(at)          // scene point; NO scene.mutate, so no scene redraw
       └─ if the decay loop is idle, start it
       └─ each RAF frame:
            - drop points with age > TTL
            - repaint the laser canvas: for each surviving point convert
              scene→viewport with the *current* view transform, stroke the
              tapered polyline
            - if no points remain, stop the loop
```

`laserMove` never mutates the scene, so hover traffic does not trigger
scene re-renders or autosave. The `LaserTrail` owns its own animation
frame independent of `CanvasRenderer`.

### New pieces

**`packages/tools/src/types.ts`**

- Add `"laser"` to the `ToolName` union.
- Add `{ kind: "laserMove"; at: Point }` to the `ToolEffect` union.

**`packages/tools/src/tools/laser.ts`** (new)

- `LaserState` — minimal (e.g. `{ phase: "idle" }`), never changes.
- `laserTool: Tool<LaserState, ToolEvent>` — `reduce` emits
  `[{ kind: "laserMove", at: event.at }]` for `pointerDown` and
  `pointerMove`; `[state, []]` (via `NO_EFFECTS`) for everything else.
  Returns the same state reference each call.

**`packages/tools/src/registry.ts`** — register `laser: laserTool`.

**`packages/tools/src/index.ts`** — export `laserTool` and `LaserState`.

**`apps/web/src/driver/laserTrail.ts`** (new) — `LaserTrail` class:

- Constructor: `(canvas: HTMLCanvasElement, getView: () => ViewTransform, opts?)`
  where `opts` allows injecting `now`, `raf`, `caf`, `ttlMs` for tests.
- `push(at: Point): void` — append `{ x, y, t: now() }`; start the loop if idle.
- `clear(): void` — empty the point list, cancel the frame, clear the canvas.
- Private `tick()` — prune expired points, `draw()`, reschedule or stop.
- Private `draw()` — `ctx.setTransform(1,0,0,1,0,0)`, clear, then stroke
  segments between consecutive live points using `sceneToViewport(p, getView())`;
  per-segment `globalAlpha` and `lineWidth` scaled by the newer endpoint's
  remaining life; `lineCap`/`lineJoin` round; `shadowColor`/`shadowBlur` for glow.
- Mirrors the existing overlay/ghost drawing convention (identity transform +
  `sceneToViewport`). The pre-existing HiDPI half-scale quirk shared by the
  main canvas, overlay, and library ghost is inherited here and **not** fixed
  in this feature.

**`apps/web/src/driver/effects.ts`**

- `applyEffects(scene, effects, laser: LaserTrail)` — new required parameter.
- `case "laserMove": laser.push(eff.at); break`

**`apps/web/src/driver/useDrawingDriver.ts`**

- Accept `laserRef: RefObject<HTMLCanvasElement | null>` in `DriverOptions`.
- In the effect, after refs are resolved, construct
  `const laser = new LaserTrail(laserCanvas, () => ({ scrollX, scrollY, zoom } from store))`.
- Pass `laser` into every `applyEffects(...)` call (one call site, inside `dispatch`).
- In the existing `useAppStore.subscribe` block: when `s.activeTool !== "laser"
&& prev.activeTool === "laser"` (or simply whenever `activeTool` changed and
  is no longer `laser`), call `laser.clear()`.
- In the cleanup function, call `laser.clear()`.

**`apps/web/src/components/CanvasShell.tsx`**

- Add `const laserRef = useRef<HTMLCanvasElement>(null)`.
- Include `laserRef.current` in the `resize()` loop that sizes
  `[canvas, overlay]` (→ `[canvas, overlay, laser]`).
- Render `<canvas ref={laserRef} className="pointer-events-none absolute inset-0" />`
  after the overlay canvas (so it stacks above it).
- Pass `laserRef` to `useDrawingDriver`.

### Discoverability

**`packages/ui/src/Toolbar.tsx`** — append to `TOOL_ITEMS`:
`{ name: "laser", shortcut: "K" }` (main row, after `note`).

**`packages/ui/src/shared/icons.ts`** — add `ICONS.laser`, a 20×20
`currentColor` SVG in the house style (a small crosshair / beam glyph).

**`packages/ui/src/HelpDialog.tsx`** — append to `TOOL_SHORTCUTS`:
`{ keys: "K", label: "shortcuts:laser" }`.

**`apps/web/src/keyboard/shortcuts.ts`**

- `TOOL_KEYS.k = "laser"` (bare `k`; the `isMeta && key === "k"` branch for
  the link editor already returns earlier and is unaffected).
- Extend the `key === "escape"` branch: if `activeTool === "laser"`, also
  `setActiveTool("selection")` (the driver's tool-change hook then clears
  the trail). Keep the existing `setSelection([])`.

**i18n** — `apps/web/src/locales/{en,ko}/common.json` add `toolbar.laser`
("Laser pointer" / "레이저 포인터"); `.../{en,ko}/shortcuts.json` add
`laser` ("Laser pointer" / "레이저 포인터").

## Testing

- **`packages/tools/test/laser-tool.test.ts`** — `pointerDown` and
  `pointerMove` each yield one `laserMove` effect carrying `event.at`;
  `pointerUp` / `escape` / other yield no effects; state identity is stable.
- **`apps/web/test/laserTrail.test.ts`** — with injected `now`/`raf`/`caf`:
  `push` adds a point and starts the loop; a point past `ttlMs` is pruned on
  the next tick; the loop cancels itself once empty; `clear()` empties the
  list and cancels the frame; `draw` issues `beginPath`/`stroke` against a
  stub context and scales segment count with point count.
- **`apps/web/test/effects.test.ts`** — updated for the new `laser`
  argument; a `laserMove` effect calls `laser.push` with the point and does
  not call `scene.mutate`.
- **`apps/web/e2e/laser.spec.ts`** — pick the laser tool via the toolbar and
  via `k`; sweep the mouse across the canvas; assert the persisted scene has
  **zero elements**; assert the laser tool is still active after the sweep
  (sticky); press `Escape` and assert the active tool is `selection`;
  capture a screenshot for the record.
- Full gate: `pnpm turbo run lint typecheck test build --force` + the full
  Playwright suite.

## Implementation plan (SDD, Opus subagents)

1. **Tool + effect** — `ToolName`/`ToolEffect` additions, `laser.ts` reducer,
   registry, exports, `laser-tool.test.ts`. Gate: tools package tests + typecheck.
2. **`LaserTrail` controller** — `laserTrail.ts` + `laserTrail.test.ts`, pure,
   no wiring. Gate: web unit tests + typecheck.
3. **Driver wiring** — `CanvasShell` third canvas, `effects.ts` signature +
   case, `useDrawingDriver` construct/clear, `effects.test.ts` update. Gate:
   web unit tests + typecheck + build.
4. **Discoverability** — Toolbar item + icon, `TOOL_KEYS`, escape handling,
   HelpDialog entry, i18n, `HelpDialog.test.tsx` + `Toolbar.test.tsx` updates.
   Gate: ui + web unit tests + typecheck.
5. **e2e + full gate** — `laser.spec.ts`, then
   `pnpm turbo run lint typecheck test build --force` + full Playwright suite.

## Out of scope

- Collaborative broadcast of another user's laser (no transport in this clone).
- Touch/stylus-specific tuning beyond what Pointer Events already give.
- Fixing the repo-wide HiDPI canvas half-scale quirk.
- A configurable laser color or a "click to drop a persistent marker" mode.
- Group/multi-selection rotation and other unrelated backlog items.
