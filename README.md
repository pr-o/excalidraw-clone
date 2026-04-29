# Excalidraw Clone

A solo-drawing clone of [Excalidraw](https://excalidraw.com/) built with TypeScript, React 19, Next.js 16, and TurboRepo. v1 is single-user only — no collaboration, no accounts.

> Scope decision and full feature inventory live in [`docs/superpowers/exploration/`](./docs/superpowers/exploration/).
> The implementation plan and design spec will live under [`docs/superpowers/specs/`](./docs/superpowers/specs/).

---

## Stack

| Layer               | Choice                                                              | Notes                                                            |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runtime / framework | **Next.js 16** + **React 19**                                       | App Router. Static export supported.                             |
| Language            | **TypeScript**                                                      | Strict mode across all packages.                                 |
| Monorepo            | **TurboRepo** + **pnpm** workspaces                                 | Standard for the toolchain.                                      |
| Styling             | **Tailwind CSS v4**                                                 | First-class Next 16 integration.                                 |
| Drawing engine      | **rough.js**                                                        | Non-negotiable for the hand-drawn look.                          |
| State               | Vanilla store + tool FSMs + **Zustand**                             | See [State Management](#state-management---three-layers) below.  |
| Persistence         | **localStorage** + **IndexedDB** (`idb`)                            | Scene in localStorage; image binaries in IndexedDB.              |
| File format         | `.excalidraw` JSON                                                  | Same shape as upstream → files interop with the real Excalidraw. |
| i18n                | **i18next**                                                         | English + Korean only for v1.                                    |
| Tests               | **Vitest** (unit, per package) + **Playwright** (e2e in `apps/web`) |                                                                  |
| Deploy              | **Vercel** (primary) + static export for self-hosting               |                                                                  |

---

## Architecture — domain-split monorepo

```
apps/
  web/                 ← Next.js 16 app (UI shell, routes, fonts, i18next bootstrap)

packages/
  scene/               ← scene model + history (the source of truth for elements on canvas)
  geometry/            ← math helpers, hit-tests, transforms
  renderer/            ← rough.js + canvas drawing pipeline
  tools/               ← per-tool interaction logic (rectangle, ellipse, draw, text, …)
  ui/                  ← React components (toolbar, properties panel, dialogs, command palette)
  persistence/         ← localStorage + IndexedDB + .excalidraw file I/O
```

### Why six packages instead of two or four?

We considered three layouts — minimal (2 packages), layered (4), and domain-split (6). We picked the domain-split version because:

1. **It mirrors the upstream Excalidraw monorepo layout** (`@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils` etc.). When we need to figure out how the real app does something, the mental map already lines up.
2. **Maximum separation of concerns.** `geometry` is pure math, `scene` knows nothing about how things are drawn, `renderer` knows nothing about pointer events, `tools` translate user intent into scene mutations, `ui` is React-only chrome, `persistence` is storage I/O. Each package answers exactly one question about the system.
3. **Rendering can be swapped.** Because `renderer` consumes `scene` but is consumed only by `apps/web`, we can add an SVG renderer for export without touching anything else. Same for a future server-side PNG renderer.
4. **Cross-package iteration friction is real but manageable.** TurboRepo's caching + pnpm workspace symlinks mean changes propagate instantly during `dev`; we pay the structural cost only at refactor time.

The trade-off vs. the layered (4-package) option: more `package.json` files and more import-path discipline. We accepted that cost in exchange for the clean boundary between `scene` (data model), `geometry` (math), `renderer` (drawing), and `tools` (interaction). Bundling those together would create a "core" package that grows into a god-module.

---

## State Management — three layers

An Excalidraw-style app has three different _kinds_ of state, each best handled differently. Putting them all in one library is a mistake — the performance characteristics, lifecycle, and consumers are different.

### Layer 1 — Scene state (`packages/scene`)

**What it holds:** the actual elements on the canvas. The source of truth for "what's drawn."

**Implementation:** a **vanilla TypeScript `Store` class** with a pub/sub interface. No React, no state library.

**Why:**

- It must be testable without React.
- The SVG/PNG exporter consumes it directly without spinning up a React tree.
- Our render loop must **not** go through React reconciliation — at 60fps on a canvas with hundreds of elements, that's a non-starter. The renderer subscribes once and reads directly.
- Upstream Excalidraw uses the same pattern (their `Scene` class).

### Layer 2 — Tool state machines (`packages/tools`)

**What it holds:** per-tool interaction state — `idle → drawing → finishing`, `idle → dragging → resizing`, etc., driven by pointer/keyboard events.

**Implementation:** **hand-rolled discriminated-union state machines**, one per tool. Each tool exports a reducer `(state, event) → state` plus a commit hook that mutates the scene.

**Why not XState:**

- Each tool has 3–5 states, tightly bound to pointer/keyboard events.
- XState's invocations, parallel states, history states, and visualization are overhead we don't need.
- Discriminated unions give us perfect TS narrowing in switch statements — no library required.
- Tool logic is easier to test as a pure reducer than as a stateful XState machine.

### Layer 3 — UI / chrome state (`apps/web`)

**What it holds:** active tool, current theme, dialog open/closed flags, library panel toggle, zen mode, view mode, grid on/off, snap-to-objects on/off, command-palette open, i18n locale.

**Implementation:** **Zustand** with the slice pattern (one slice per concern: `useToolStore`, `useThemeStore`, `useDialogStore`, …).

**Why Zustand:**

- One store object, no Provider tree, no atom graph.
- Selector subscriptions — components only re-render when the slice they read changes (unlike Context).
- Plays well with React 19's `useSyncExternalStore`.
- About 1.5kB; no ecosystem buy-in beyond the library itself.

**Why not Jotai** (which upstream Excalidraw uses): for our scope, the atomic model is overkill. We have ~10 chrome flags, not a sprawling derived-atom graph.

**Why not Redux Toolkit:** too much ceremony — action types, slices, reducers, immer middleware — for ~10 globals.

**Why not `useReducer + Context`:** every Context update re-renders every consumer in the subtree. Zustand's selector subscriptions don't.

### Diagram

```
┌─ packages/scene ─────────────┐  vanilla Store (pub/sub)
│  Element[], history stack    │  ← single source of truth
└──────────────────────────────┘
            ▲
            │ subscribe() — renderer reads directly, no React
            │
┌─ packages/tools ─────────────┐  discriminated-union state machines
│  RectangleTool, TextTool, …  │  ← pointer/keyboard events in
└──────────────────────────────┘    scene mutations out
            ▲
            │ commits to scene
            │
┌─ apps/web (Zustand) ─────────┐  React-friendly chrome state
│  active tool, theme, modals  │  ← what the UI cares about
└──────────────────────────────┘
```

The arrows are **one-way**: UI tells tools which is active; tools commit to scene; renderer reads scene. The scene never "asks" the UI anything — it just emits change events.

---

## Project status

This README captures decisions made during initial brainstorming on **2026-04-28**. The next deliverables:

1. Design spec — `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md`
2. Implementation plan — to follow once the spec is reviewed.

See [`docs/superpowers/exploration/v1-scope-decision.md`](./docs/superpowers/exploration/v1-scope-decision.md) for the full in/out/deferred feature list.
