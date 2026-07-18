# Frame Labels & Membership — Design

**Date:** 2026-07-19
**Status:** Approved
**Scope:** Frames get a rendered, double-click-editable name and live membership: dragging a frame moves its members, dragging elements in/out re-evaluates membership on every mutation, and deleting a frame releases its members. `isCollapsed` stays out of scope.

## Problem

Frames are the thinnest feature in the app: the frame tool draws a rectangle and stamps `frameId` on fully-contained elements at creation — and nothing else. The `name` field is never rendered or editable, dragging a frame leaves members behind, membership never updates after creation, deleting a frame leaves stale `frameId`s, and `isCollapsed` is dead.

## Decisions

- **Membership is a scene invariant, not an event.** A new `reconcileFrameMembership(draft)` runs in `Scene.mutate` alongside `reconcileBoundText`/`reconcileBindings`: every non-deleted, non-frame element's `frameId` is recomputed as the topmost (last in scene order) non-deleted frame that fully contains its bounds, else `null`. Bound labels (text with `containerId`) are skipped — they follow their container. Deleted frames release members automatically. Idempotent and reference-stable on no-op, like the other reconcilers.
- **The frame tool's `populateFrameMembers` is deleted** — the reconcile covers creation; the tool collapses to a plain `shapeReduce` wrapper.
- **Frame drag moves members.** At selection pointerDown, the drag set (`movedIds`) is expanded through `expandIdsToFrameMembers` (modeled on `expandIdsToGroups`). Selection effects keep un-expanded ids — selecting a frame does not select members. Locked members still translate with their frame (locking guards direct interaction, not derived movement — same as groups).
- **Rename via double-click.** Double-clicking a frame emits `select` + the existing `startTextEdit` effect (no new effect kind); `TextEditingOverlay` branches on frame targets and renders a single-line input at the frame's top-left. Enter/blur commits through a `renameFrame` driver (trimmed, empty → `null`, unchanged → `skipHistory`); Escape cancels with no mutation.
- **Name rendering:** `name ?? "Frame"` drawn above the top-left corner in both renderers — 12px, font family 2 (Helvetica), muted `#868e96` resolved through `resolveColor`, element-local position `(0, -4)` with bottom baseline. Scene-space size (scales with zoom) for canvas/SVG parity. Locale-independent default "Frame" is an accepted simplification.
- **YAGNI:** `isCollapsed` remains a dead field; no frame restyling; no member scaling on frame resize (membership just re-evaluates).

## Testing

Unit TDD per package (scene reconcile/expand, tools drag-expansion + double-click + frame-tool cleanup, renderer canvas/SVG name). New `frames.spec.ts` e2e: membership on create + frame drag moves members + persistence; double-click rename; drag-out clears `frameId` + frame delete releases members. Full gate before merge.

## Out of scope (follow-up candidates)

- Collapse/expand (`isCollapsed`)
- Frame clipping of member rendering
- Member scaling on frame resize
- Frame name in export file lists / navigation UI
