# Zoom & Pan Navigation — Design

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Implement viewport navigation end-to-end: wheel-pan, Ctrl/Cmd+wheel zoom anchored at the cursor, Space+drag pan, the three zoom keyboard shortcuts already documented (but unwired) in the Help dialog, and a zoom indicator/control widget. `scrollX`/`scrollY`/`zoom` state and renderer sync already exist; no user-facing interaction currently touches them.

## Problem

The store (`ViewSlice`) and renderer (`setViewTransform`) already support an arbitrary scroll/zoom transform, and `HelpDialog.tsx` documents `Cmd/Ctrl+0`, `Cmd/Ctrl++`, `Cmd/Ctrl+-`, and `Space (hold)` as shortcuts — but none of them are wired in `shortcuts.ts`, there's no wheel handling anywhere, and there's no zoom UI. The canvas is effectively fixed at 100% with no way to navigate a scene larger than the viewport.

## Decisions

- **Zoom math is a pure function** (`zoomToPoint` in `packages/geometry/src/transform.ts`, alongside the existing `sceneToViewport`/`viewportToScene`): given a `ViewTransform`, a viewport-space anchor point, a target zoom, and `{ min, max }` bounds, it clamps the zoom and solves for the `scrollX`/`scrollY` that keep the scene point under the anchor fixed on screen. No DOM/React dependency — same derivation style as the existing transform functions.
- **Zoom bounds:** `ZOOM_MIN = 0.1` (10%), `ZOOM_MAX = 5` (500%), exported as constants next to `zoomToPoint`.
- **Wheel semantics** (new listener in `useDrawingDriver.ts`, sibling to the existing pointer listeners, bypassing the tool-reducer system the same way theme/grid changes already do):
  - Plain wheel → pan: `scrollX -= deltaX / zoom`, `scrollY -= deltaY / zoom`.
  - `ctrlKey` wheel (covers both an explicit Ctrl/Cmd+wheel and browser trackpad-pinch, which arrives as a synthetic `ctrlKey: true` wheel event) → zoom via `zoomToPoint`, anchored at the cursor's viewport position, factor `1.04 ** -deltaY`.
  - No separate pinch-gesture handling needed — the ctrlKey-wheel convention already covers it.
- **Space+drag pan:** `useDrawingDriver.ts` tracks whether Space is currently held via its own keydown/keyup listeners (added/removed in the same effect as the pointer listeners), ignored when an input/textarea/contentEditable has focus — same guard `shortcuts.ts` already uses. The held-state lives in a local ref inside the hook, not the Zustand store (transient UI state, not app state). While held, `onPointerDown/Move/Up` short-circuits before reaching the active tool's reducer and instead drags the scroll offset directly. The canvas wrapper gets a `grab`/`grabbing` cursor class driven off the same ref.
- **Keyboard shortcuts** (`shortcuts.ts`): `Ctrl/Cmd+0` resets zoom to 100% anchored at the canvas viewport center; `Ctrl/Cmd++`/`Ctrl/Cmd+=` zooms in one step (×1.1) anchored at center; `Ctrl/Cmd+-` zooms out one step, same anchor. (Space-hold-to-pan is handled by the driver's pointer-intercept above, not this keydown handler, since it's a hold-state rather than a discrete action.)
- **UI:** a small zoom widget bottom-right, matching the existing bottom-left "unlock all" pill styling (`rounded-lg bg-white shadow`) — `−` button, a clickable `NN%` readout that resets zoom to 100%, `+` button. Buttons step by the same ×1.1 factor as the keyboard shortcut, anchored at the canvas viewport center; clamped to the same 10–500% bounds (buttons disable at the clamp).
- **No persistence in this pass.** `scrollX`/`scrollY`/`zoom` reset to defaults (0, 0, 1) on reload, matching today's behavior — nothing view-related is currently saved. Easy follow-up if wanted later.
- **YAGNI:** no zoom-to-fit / zoom-to-selection, no minimap, no touch/multi-touch gesture handling beyond what the ctrlKey-wheel convention already covers, no per-scene saved zoom.

## Testing

Unit TDD: `zoomToPoint` in `packages/geometry` — anchor point stays fixed under zoom in/out, clamping at min/max bounds, identity when `newZoom === view.zoom`. E2e `zoom-pan.spec.ts`: wheel-zoom changes rendered element scale with the cursor position preserved; `Ctrl+0`/`Ctrl++`/`Ctrl+-` change the zoom indicator; plain wheel pans the scene; Space+drag pans without invoking the active tool; zoom widget readout/reset/clamping at bounds. Full gate before merge.

## Out of scope (follow-up candidates)

- Zoom-to-fit / zoom-to-selection
- Persisting scroll/zoom across reload
- Minimap
- Touch/multi-touch pan-zoom gestures beyond the ctrlKey-wheel trackpad-pinch convention
