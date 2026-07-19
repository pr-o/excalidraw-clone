# Clipboard Copy/Paste/Cut — Design

**Date:** 2026-07-19
**Status:** Approved
**Scope:** Ctrl+C/X/V for elements via the system clipboard, cursor-targeted paste, plain-text paste as a text element, plus Ctrl+A select-all and arrow-key nudge. The Duplicate button is rerouted through the new copy-closure helper, fixing its latent bound-label bug.

## Problem

The app has no clipboard at all: the only way to replicate elements is the PropertiesPanel Duplicate button, which offsets by +12/+12 and — because it clones only `selectedIds` — leaves a duplicated shape's `boundElements` pointing at the _original_ label (labels and frame members are never part of the selection). Nothing can move elements across tabs, and there is no select-all or keyboard nudge.

## Decisions

- **Transport is native `ClipboardEvent`s, not the async API.** A new `attachClipboard({ scene })` (beside `attachShortcuts`) listens for `copy`/`cut`/`paste` on `document`, with the same input/textarea/contentEditable guard as shortcuts. These events are the system clipboard with synchronous `e.clipboardData` access — no permissions, no Safari quirks, and they fire on Ctrl+C/X/V in Chromium under Playwright. `e.preventDefault()` after handling.
- **Payload is a JSON envelope as `text/plain`:** `{ "type": "excalidraw-clone/clipboard", "version": 1, "elements": [...] }`. Survives tabs and reloads; pasting into a text editor shows the JSON (accepted).
- **Copy closure is a scene helper.** `expandIdsToCopyClosure(ids, elements)` in `packages/scene` expands a selection to include bound labels (`boundElements` entries of type `"text"`) and frame members (via `expandIdsToFrameMembers`), returning matching non-deleted elements in scene order. A web driver `copyPayload(scene, selectedIds)` (in `apps/web/src/driver/clipboard.ts`, alongside `buildPaste`) serializes that closure into the envelope; the Duplicate button switches to the same closure helper too.
- **Paste clones at paste time.** `buildPaste(text, at)` in `apps/web/src/driver/` parses the envelope; on success it runs `cloneElementsWithNewIds` (fresh ids per paste → repeated paste works; ids never collide when pasting into another tab) and translates all elements so the payload's bounding-box center lands at `at`. Pasted elements are appended and become the selection. Frame membership re-resolves via the existing mutate invariant.
- **Non-envelope text pastes as a text element:** a single `newText({ x: at.x, y: at.y, text })` — exactly what the text tool + `commitTextEdit` produce today, inheriting existing free-text behavior (no measurement work). Empty/whitespace-only clipboard text is ignored.
- **Cut = copy + delete:** same closure written to the clipboard, then one mutation marking the closure `isDeleted`, then clear selection.
- **Paste targets the cursor.** The drawing driver records the last pointer _scene_ position in a new store slice on every pointer event it already processes; paste reads it via `getState()`. Fallback when the pointer has never been over the canvas: the viewport center converted through `scrollX`/`scrollY`/`zoom`.
- **Ctrl+A** (in `shortcuts.ts`) selects all non-deleted, non-locked element ids, skipping bound labels (they are never directly selectable).
- **Arrow-key nudge** (in `shortcuts.ts`): when the selection is non-empty, Arrow keys translate the selection by 1px, Shift+Arrow by 10px, through `scene.mutate` on the frame-member-expanded id set (same expansion as drag). Undo/redo covers clipboard and nudge automatically since everything is a normal mutation.
- **YAGNI:** no image paste, no HTML/SVG clipboard flavors, no paste-in-place shortcut, no cross-app Excalidraw-format compatibility.

## Testing

Unit TDD per package: scene closure expansion (labels, frame members, order, deleted skipped); web `copyPayload`/`buildPaste` round-trip, offset math, plain-text branch, envelope rejection on bad JSON/type. New `clipboard.spec.ts` e2e: (1) draw two rects → Ctrl+A → Ctrl+C → move mouse → Ctrl+V doubles the rects centered at the cursor; (2) Ctrl+X removes originals and Ctrl+V restores them; (3) copying a labeled shape brings the label with remapped `containerId`/`boundElements`; (4) writing plain text into the clipboard and pasting creates a text element. Full gate before merge.

## Out of scope (follow-up candidates)

- Image paste (routing through the existing image upload path)
- Copy-as-PNG/SVG to the clipboard
- Paste-in-place / paste-at-original-position variant
- Interop with real Excalidraw's clipboard format
