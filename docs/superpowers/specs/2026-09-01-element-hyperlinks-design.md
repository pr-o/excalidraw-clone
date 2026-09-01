# Element Hyperlinks — Design

**Date:** 2026-09-01
**Status:** Approved, ready for implementation plan

## Summary

Attach an external URL to any single element. A linked element shows a small
clickable link icon at its top-left corner on hover or selection; clicking the
icon — or `Cmd/Ctrl`-clicking the element body — opens the URL in a new tab. The
link is set/edited/removed through a small popover anchored above the element,
reachable via `Cmd/Ctrl+K` or the right-click context menu.

This mirrors Excalidraw's element-link UX, scoped to external URLs only.

## Motivation

The `link: string | null` field already exists on `ExcalidrawElementBase` and is
already persisted, but nothing in the app reads or writes it. This feature is
purely an interaction/UI layer on top of an existing data field.

## Data model

No schema change, no migration, no `SCENE_FORMAT_VERSION` bump.

- `link: string | null` is defined on `ExcalidrawElementBase`
  (`packages/scene/src/types.ts`).
- `newElementBase` in `packages/scene/src/factories.ts` already defaults it to
  `null`.
- Elements loaded from older local storage or imported `.excalidraw` files may
  carry `link === undefined`. There is currently **no element normalization on
  load** (`pagesFromDocument` passes raw parsed elements straight into
  `new Scene(...)`), and this feature does not add one. Instead, every read path
  treats a falsy `link` as "no link" (`el.link` truthiness / `el.link ?? null`).
  This matches how the codebase already handles this late-added optional field.
- Autosave serializes whole elements, so `link` round-trips with no extra work.

## Components

### New files

| File                                      | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `apps/web/src/driver/link.ts`             | Pure helpers (see below)                                 |
| `apps/web/src/store/slices/linkEditor.ts` | `linkEditorElementId` state slice                        |
| `apps/web/src/components/LinkOverlay.tsx` | HTML overlay: editor popover + hover/selection indicator |
| `apps/web/test/link.test.ts`              | Unit tests for `link.ts`                                 |
| `apps/web/e2e/element-links.spec.ts`      | E2E coverage                                             |

### `apps/web/src/driver/link.ts`

Pure, framework-free helpers (all unit-tested):

- `normalizeLinkInput(raw: string): string | null`
  - Trim. Empty → `null`.
  - If it already has a URL scheme (`/^[a-z][a-z0-9+.-]*:/i`), keep as typed.
  - Otherwise prefix `https://` (bare-domain convenience, matches Excalidraw).
- `sanitizeLinkHref(link: string | null | undefined): string | null`
  - Parse with `new URL(...)`; return the href only when the protocol is
    `http:`, `https:`, or `mailto:`. Anything else (`javascript:`, `data:`,
    `file:`, unparseable) → `null`.
  - Used both when rendering the "Open" affordance and immediately before
    `window.open`, so a hand-edited persisted file can never open a dangerous
    scheme.
- `commitElementLink(draft: ExcalidrawElement[], id: string, link: string | null): void`
  - Mutation-draft helper in the style of `commitTextEdit` / `renameFrame`.
  - Finds the element by id; no-op if missing. Sets `draft[i] = { ...el, link }`.
- `openLink(link: string | null | undefined): void`
  - `const href = sanitizeLinkHref(link); if (href) window.open(href, "_blank", "noopener,noreferrer")`.

### `apps/web/src/store/slices/linkEditor.ts`

Direct analogue of the `textEdit` slice:

```ts
export interface LinkEditorSlice {
  linkEditorElementId: string | null
  setLinkEditorElementId: (id: string | null) => void
}
```

Wired into `apps/web/src/store/index.ts` alongside the other slices.

### `apps/web/src/components/LinkOverlay.tsx`

A single HTML overlay component, rendered as a sibling of `<TextEditingOverlay>`
in `App.tsx`. Props: `{ scene: Scene }`.

Reads from the store: `linkEditorElementId`, `selectedIds`, `lastScenePointer`,
`scrollX`, `scrollY`, `zoom`. `App` already calls `useSceneRevision(scene)` in
its body, so every child re-renders on each scene mutation — the overlay tracks
an element being dragged for free.

**Anchor math** (same convention as `TextEditingOverlay`): screen-space top-left
corner of the element is `((el.x + scrollX) * zoom, (el.y + scrollY) * zoom)`.
The icon/popover is placed just above that corner. Element rotation (`angle`) is
ignored in v1 — the anchor is the unrotated top-left corner.

**Editor mode** — active when `linkEditorElementId` is set and the element
exists in the active scene:

- Renders an absolutely-positioned container with:
  - `<input type="text" data-testid="link-editor-input">`, autofocused
    (`queueMicrotask(() => ref.current?.focus())`), value seeded from
    `el.link ?? ""`, `placeholder = t("linkEditor.placeholder")`.
  - An **Open** button (`data-testid="link-editor-open"`), shown only when
    `sanitizeLinkHref(currentValue)` is non-null → `openLink`.
  - An **Unlink** button (`data-testid="link-editor-remove"`), shown only when
    `el.link` is currently truthy → commits `link: null`, closes.
- Key handling on the input:
  - `Enter` → commit `normalizeLinkInput(value)` then close.
  - `Escape` → close without change (`e.preventDefault()`, stop propagation so
    the global Esc-deselect does not also fire).
- `onBlur` of the container → commit then close (guard against blur caused by
  clicking the Open/Unlink buttons — commit is idempotent so this is safe).
- Commit path:
  `scene.mutate((draft) => commitElementLink(draft, id, next), changed ? undefined : { skipHistory: true })`
  where `changed = (el.link ?? null) !== next`.
- If the target element is not found (deleted, or page switched) → render
  `null`, exactly like `TextEditingOverlay`.

**Indicator mode** — active when no editor is open:

- Determine the "link target element":
  1. if exactly one element is selected and it has a truthy `link` → that element;
  2. else if `lastScenePointer` is set and
     `pickElementAtPoint(scene.getElements(), lastScenePointer)` returns an
     element with a truthy `link` → that element;
  3. else → none, render `null`.
- Render a small `<button data-testid="link-indicator">` with a link glyph at
  the element's top-left corner, `title={sanitizeLinkHref(el.link) ?? el.link ?? ""}`.
- Click → `openLink(el.link)`.

Both modes render inside a wrapper with `className="z-40"` (matching
`TextEditingOverlay`) so the controls sit above the canvas and are clickable
(the canvas overlay `<canvas>` is `pointer-events-none`, the base canvas is not,
but the HTML overlay is a separate DOM layer above both).

## Opening links from the canvas (`Cmd/Ctrl`-click)

In `apps/web/src/driver/useDrawingDriver.ts`, inside `onPointerDown`, after the
`e.button !== 0` / context-menu / orphaned-pointer / space-pan / pending-item
guards and **before** `canvas.setPointerCapture` + `dispatchPointer("pointerDown", e)`:

```ts
const store = useAppStore.getState()
if (store.activeTool === "selection" && (e.metaKey || e.ctrlKey)) {
  const at = clientToScene(canvas, view, e)
  const hit = pickElementAtPoint(scene.getElements(), at)
  if (hit && hit.link) {
    openLink(hit.link)
    return
  }
}
```

- Gated to the selection tool so drawing-tool modifier behavior is untouched.
- `Cmd/Ctrl` is otherwise only "bypass snap" (drag-time) and does not change a
  plain selection click, so overriding it here is safe and matches Excalidraw.
- Falls through to normal selection when the hit element has no link.

## Context menu

In `apps/web/src/components/ContextMenuHost.tsx`, element branch, only when
`elementIds.length === 1`. Let `el = selectedElements[0]`:

- If `!el.link`: add
  `{ id: "create-link", label: t("contextMenu.createLink"), perform: () => useAppStore.getState().setLinkEditorElementId(el.id) }`
- If `el.link`: add
  - `{ id: "edit-link", label: t("contextMenu.editLink"), perform: () => useAppStore.getState().setLinkEditorElementId(el.id) }`
  - `{ id: "remove-link", label: t("contextMenu.removeLink"), perform: () => scene.mutate((draft) => commitElementLink(draft, el.id, null)) }`

Placed just after the existing `duplicate` / `move-to-page` items and before
`delete`. Works for locked elements too? No — the locked branch returns a
minimal menu (copy + unlock); leave it that way. Link items only in the unlocked
single-selection path.

## Keyboard + Help

### `apps/web/src/keyboard/shortcuts.ts`

Add, alongside the other `isMeta` shortcuts:

```ts
if (isMeta && key === "k") {
  e.preventDefault()
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 1) useAppStore.getState().setLinkEditorElementId(ids[0]!)
  return
}
```

### `packages/ui/src/HelpDialog.tsx`

Add to `EDITOR_SHORTCUTS`:

- `{ keys: "Cmd/Ctrl+K", label: "shortcuts:link" }`
- `{ keys: "Cmd/Ctrl+click", label: "shortcuts:openLink" }`

## Page switch

`App.tsx`'s page-switch path (`switchToPage` / wherever `activePageId` changes)
must call `useAppStore.getState().setLinkEditorElementId(null)` so a stale editor
id from the previous page does not linger. (The overlay already renders `null`
when the id is not found in the active scene, so this is belt-and-suspenders, but
keeps store state honest — the same reasoning the codebase applies to
`textEditElementId`.)

## i18n

Both `apps/web/src/locales/en/` and `apps/web/src/locales/ko/`.

`common.json`:

```jsonc
"contextMenu": {
  // ...existing...
  "createLink": "Create link",      // ko: "링크 만들기"
  "editLink": "Edit link",          // ko: "링크 편집"
  "removeLink": "Remove link"       // ko: "링크 제거"
},
"linkEditor": {
  "placeholder": "Paste or type a link",   // ko: "링크를 붙여넣거나 입력하세요"
  "open": "Open link",                     // ko: "링크 열기"
  "remove": "Remove link"                  // ko: "링크 제거"
}
```

`shortcuts.json`:

```jsonc
"link": "Add or edit link",              // ko: "링크 추가/편집"
"openLink": "Open element link"           // ko: "요소 링크 열기"
```

(Korean strings above are the intended translations; implementer should keep them
consistent with the existing tone in `ko/common.json`.)

## Modified files (summary)

- `packages/ui/src/HelpDialog.tsx` — two shortcut rows
- `apps/web/src/store/index.ts` — wire `linkEditor` slice
- `apps/web/src/components/App.tsx` — render `<LinkOverlay scene={scene} />`;
  clear `linkEditorElementId` on page switch
- `apps/web/src/components/ContextMenuHost.tsx` — create/edit/remove link items
- `apps/web/src/keyboard/shortcuts.ts` — `Cmd/Ctrl+K`
- `apps/web/src/driver/useDrawingDriver.ts` — `Cmd/Ctrl`-click to open
- `apps/web/src/locales/{en,ko}/common.json` — `contextMenu.*`, `linkEditor.*`
- `apps/web/src/locales/{en,ko}/shortcuts.json` — `link`, `openLink`

## Testing

### Unit — `apps/web/test/link.test.ts`

- `normalizeLinkInput`:
  - `""` / `"   "` → `null`
  - `"example.com"` → `"https://example.com"`
  - `"https://x.com"` → unchanged
  - `"mailto:a@b.com"` → unchanged
  - `"http://x.com"` → unchanged
- `sanitizeLinkHref`:
  - `"https://x.com"` → `"https://x.com/"` (or exact href) — non-null
  - `"mailto:a@b.com"` → non-null
  - `"javascript:alert(1)"` → `null`
  - `"data:text/html,x"` → `null`
  - `null` / `undefined` / `"not a url"` → `null`
- `commitElementLink`:
  - sets `link` on the matching element
  - clears `link` to `null`
  - no-op when id is absent (draft unchanged, no throw)

### E2E — `apps/web/e2e/element-links.spec.ts`

Follow `_helpers.ts` conventions (as used by `context-menu.spec.ts`).

1. **Create + persist**: draw a rectangle, select it, press `Meta+K`, type
   `https://example.com`, press `Enter`. Assert `link-indicator` is visible.
   Reload the page; select the rectangle again; assert the indicator still shows
   (autosave round-trip).
2. **Open via Cmd/Ctrl+click**: with the linked rectangle present,
   `page.waitForEvent("popup")` while `Meta`-clicking the rectangle; assert the
   popup URL is `https://example.com/`.
3. **Open via indicator**: same, clicking `link-indicator`.
4. **Remove via context menu**: right-click the linked rectangle → "Remove
   link"; assert `link-indicator` no longer visible.
5. **No link UI for multi-selection**: select two elements, press `Meta+K`;
   assert no `link-editor-input` appears.

### Full gate

`turbo run typecheck lint test` + `pnpm --filter web test:e2e` all green before
merge. Run `turbo run lint --force` if cache looks stale.

## Scope cuts (YAGNI)

- No internal links (to another element / frame / page). External `http(s)` /
  `mailto` only.
- No link UI on multi-selection.
- Indicator/popover ignore element rotation (anchored to unrotated top-left).
- No hover preview card — just the icon plus a native `title` tooltip.
- No dedicated toolbar button — `Cmd/Ctrl+K` and the context menu are the entry
  points.
