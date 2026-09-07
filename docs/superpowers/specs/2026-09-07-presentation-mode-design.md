# Presentation Mode — Design Spec

**Status:** approved 2026-09-07
**Branch:** `feat/presentation-mode` (off `develop` @ 6fdd30d)

## Goal

Let a user step through the frames on the current page as fullscreen slides: the
camera animates to fit each frame, arrow keys / space / click advance, Esc exits.
The canvas is read-only while presenting, except the laser pointer stays usable
as a presentation aid.

## Decisions (locked)

| Question             | Decision                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slide source & order | Frames on the **active page only**, in **scene z-order** (back to front — the order `scene.getElements()` returns them). No spatial sorting.                                     |
| Transition           | **Animated** pan/zoom, ~400ms, cubic ease-in-out.                                                                                                                                |
| Entry                | **"Start presentation"** item in the `HamburgerMenu`. Disabled with a tooltip when the active page has 0 frames.                                                                 |
| In-mode controls     | A **minimal auto-fading bottom overlay**: `‹` prev · `N / M` counter · `›` next, plus a laser toggle. Auto-fades after ~3s idle, reappears on mousemove/keypress. Plus keyboard. |
| Fullscreen           | Real `element.requestFullscreen()` on entry; **fall back to an in-page overlay** if it rejects or is exited.                                                                     |
| Empty deck           | Menu item disabled (not a toast).                                                                                                                                                |
| In-mode interaction  | **Read-only** — no select/edit/move/draw. The `laser` tool stays live (ephemeral trail only).                                                                                    |

## Architecture

Nothing touches `Scene`, persistence, undo, export, or the `CanvasRenderer`.
Presentation is a transient view-layer mode.

### 1. Store — `apps/web/src/store/slices/presentation.ts` (new)

```ts
interface PresentationSlice {
  presenting: boolean
  slideIndex: number
  enterPresentation: () => void
  exitPresentation: () => void
  goToSlide: (i: number) => void // caller clamps; slice stores as given
  nextSlide: () => void // slideIndex + 1 (no upper clamp in slice)
  prevSlide: () => void // max(0, slideIndex - 1)
}
```

- `enterPresentation` sets `presenting: true, slideIndex: 0`.
- `exitPresentation` sets `presenting: false, slideIndex: 0`.
- The slice does **not** know the slide count (frames live in the page scene, which
  is React state in `App.tsx`). Upper-bound clamping is the `PresentationHost`'s job
  — it owns `slides`.
- Added to `store/index.ts` `AppState` + `useAppStore`.
- **Not** added to `autoSave.ts` or `hydration.ts`. Presentation state never
  persists and never round-trips a reload.

### 2. `apps/web/src/presentation/animateView.ts` (new)

```ts
export function animateView(
  from: ViewTransform,
  to: ViewTransform,
  durationMs: number,
  onFrame: (v: ViewTransform) => void,
): () => void // returns a cancel fn
```

- `requestAnimationFrame` loop, cubic ease-in-out on `t ∈ [0,1]`, lerps
  `scrollX`, `scrollY`, `zoom` independently.
- Calls `onFrame` every frame including the exact `to` on the final frame.
- The returned cancel fn stops the loop (no further `onFrame`).
- `durationMs <= 0` → single `onFrame(to)`, no rAF.
- Pure of any store/DOM knowledge — testable with fake timers + a stubbed `raf`.

### 3. `apps/web/src/presentation/PresentationHost.tsx` (new)

Rendered by `App.tsx` **only when `presenting`**. Props: `{ scene: Scene }`.

- **`slides`**: `scene.getElements().filter(e => e.type === "frame" && !e.isDeleted)`,
  recomputed whenever `App.tsx` re-renders on a scene mutation (use the same
  scene-subscription / re-render mechanism `App.tsx` already relies on for
  `selectedElements`, `layerElements`, etc. — do not invent a new one). Handles
  frames added/removed while presenting.
- **On mount:**
  - snapshot `{ scrollX, scrollY, zoom }` from the store into a ref (restore target).
  - `void appRootEl.requestFullscreen().catch(() => {})` — the app root is the
    existing `<main>` in `App.tsx` (add a ref or `id`).
  - animate to `slides[0]`.
- **On `slideIndex` change** (and on mount): cancel any in-flight animation, then
  `animateView(currentView, fitToContent(frameBounds(slides[i]), innerW, innerH), 400, store.setView)`.
  `frameBounds` = `{ x, y, width, height }` of the frame element.
- **Clamp:** whenever `slides.length` changes, if `slideIndex > slides.length - 1`
  call `goToSlide(slides.length - 1)`; if `slides.length === 0` call
  `exitPresentation()` (auto-exit).
- **Keyboard** (window listener, `{ capture: true }`, `stopPropagation()` +
  `preventDefault()` on handled keys so app shortcuts and the driver never see them):
  - next: `ArrowRight`, `ArrowDown`, `Space`, `PageDown`
  - prev: `ArrowLeft`, `ArrowUp`, `PageUp`
  - `Home` → slide 0, `End` → last
  - `Escape` → `exitPresentation()`
  - next stops at last slide, prev stops at 0 (no wrap).
- **`fullscreenchange` listener:** if `presenting` and
  `document.fullscreenElement == null` → `exitPresentation()`.
- **`resize` listener:** recompute `fitToContent` for the current slide and
  `setView` immediately (no animation).
- **On unmount / exit:**
  - cancel in-flight animation
  - `if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})`
  - `store.setView(snapshotRef.current)` (instant restore)
  - the laser trail is already cleared by the driver when the tool changes; also
    force `store.setActiveTool("selection")` if it was `laser`.
- Renders `<PresentationOverlay>`.

### 4. `apps/web/src/presentation/PresentationOverlay.tsx` (new)

Props: `{ index: number; count: number; onPrev; onNext; laserActive: boolean; onToggleLaser; t }`.

- `position: fixed`, bottom-centered, `z-[60]` (above the hidden-chrome layer).
- Buttons: `‹` (disabled at index 0), `N / M` counter (`{index+1} / {count}`),
  `›` (disabled at last), and a laser toggle button (`aria-pressed={laserActive}`).
- `data-testid`: `presentation-overlay`, `presentation-prev`, `presentation-next`,
  `presentation-counter`, `presentation-laser`.
- Idle-fade: a `visible` state, `true` on mount, set `false` after 3s; any
  `mousemove` / `keydown` (window) resets the timer and sets `true`. `opacity`
  transition, `pointer-events: none` while faded.
- Themed via existing tokens (`bg-panel`, `text-*`), works in light + dark.

### 5. `App.tsx` wiring

- Add a ref/id to the root `<main>` for `requestFullscreen`.
- Read `presenting` from the store. Chrome gate becomes
  `{!zenMode && !presenting && ( … )}` — hides `HamburgerMenu`, `Toolbar`,
  `PropertiesPanel`, `LayersPanel`, `PagesTabBar`, zoom widget, everything.
- After the chrome block: `{presenting && <PresentationHost scene={scene} />}`.
- `HamburgerMenu` gets:
  - `canPresent={frames.length > 0}` where
    `frames = scene.getElements().filter(e => e.type === "frame" && !e.isDeleted)`
    (computed in the same App.tsx render pass as the other scene-derived arrays).
  - `onStartPresentation={() => useAppStore.getState().enterPresentation()}`.

### 6. `packages/ui/src/HamburgerMenu.tsx`

- New props: `onStartPresentation: () => void`, `canPresent: boolean`.
- New menu item after "Export image…" (before "Reset the canvas"):
  - enabled → `wrap(props.onStartPresentation)`, label `t("menu.presentation")`.
  - `canPresent === false` → `disabled`, `title={t("menu.presentationHint")}`,
    `aria-disabled`, muted styling (match any existing disabled pattern; if none,
    `opacity-50 cursor-not-allowed` + no `onClick`).
  - `data-testid="menu-presentation"`.

### 7. `useDrawingDriver.ts` — read-only guard

- In `dispatchPointer`: `if (useAppStore.getState().presenting && useAppStore.getState().activeTool !== "laser") return` **before** building the tool event.
- In `onWheel`: `if (useAppStore.getState().presenting) return` before `preventDefault` — wheel pan/zoom is disabled while presenting (camera is driven by slides).
- The `Space`-hold pan handlers: also gate on `!presenting` (Space is a "next" key
  in presentation and the host swallows it anyway, but belt-and-braces).
- No change to `dispatch` (keyboard tool events already can't originate — the host
  swallows keys; app shortcuts are the other path and `attachShortcuts` is
  separate — see 8).

### 8. `apps/web/src/keyboard/shortcuts.ts`

- At the top of the `handler`, after the typing-target guard:
  `if (useAppStore.getState().presenting) return`. The host's capture listener
  already `stopPropagation()`s handled keys, but un-handled keys (e.g. `r`, `v`,
  `Cmd+Z`) would still reach `attachShortcuts` — this makes the whole editor
  keymap inert while presenting.

### 9. i18n — `apps/web/src/locales/{en,ko}/common.json`

Under `menu`:

- `presentation` → "Start presentation" / "발표 시작"
- `presentationHint` → "Add a frame to present" / "발표하려면 프레임을 추가하세요"

Under a new `presentation` object:

- `prev` → "Previous slide" / "이전 슬라이드"
- `next` → "Next slide" / "다음 슬라이드"
- `laser` → "Laser pointer" / "레이저 포인터"
- `exit` → "Exit presentation" / "발표 종료"

### 10. i18n — `apps/web/src/locales/{en,ko}/shortcuts.json` + `HelpDialog.tsx`

- `shortcuts.json`: `presentNext` → "Next slide", `presentPrev` → "Previous slide",
  `presentExit` → "Exit presentation" (+ ko).
- `HelpDialog.tsx` `VIEW_SHORTCUTS`: append
  `{ keys: "→ / Space", label: "shortcuts:presentNext" }`,
  `{ keys: "←", label: "shortcuts:presentPrev" }`,
  `{ keys: "Esc", label: "shortcuts:presentExit" }`.

## Data flow

```
menu "Start presentation" click
  → enterPresentation()  (presenting=true, slideIndex=0)
  → App.tsx hides chrome, mounts <PresentationHost scene>
      → snapshot viewport
      → requestFullscreen(appRoot).catch(noop)
      → animateView(current → fit(slides[0]))  via store.setView
      → render <PresentationOverlay index=0 count=N>
  → user ArrowRight
      → host swallows key, nextSlide()  (slideIndex=1)
      → effect: cancel anim, animateView(current → fit(slides[1]))
  → user Escape
      → exitPresentation()  (presenting=false)
      → host cleanup: cancel anim, exitFullscreen, setView(snapshot), tool→selection
      → App.tsx unmounts host, restores chrome
```

## Edge cases

| Case                                                         | Handling                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Frame added/removed while presenting                         | `slides` re-derives from scene version; `slideIndex` clamped to `[0, len-1]`; `len === 0` → auto-exit.                      |
| Window resize while presenting                               | recompute `fitToContent` for current slide, `setView` instantly.                                                            |
| User exits browser fullscreen (F11/Esc at OS level)          | `fullscreenchange` → `document.fullscreenElement == null` → `exitPresentation()`.                                           |
| `requestFullscreen()` rejects (headless, iframe, permission) | `.catch(() => {})` — overlay-only presentation, all navigation still works.                                                 |
| Page-switch shortcut (Alt+PageUp/Down) while presenting      | `shortcuts.ts` early-returns on `presenting`; host also swallows PageUp/PageDown.                                           |
| Rapid slide advance (spam ArrowRight)                        | each change cancels the prior `animateView` and starts a new one from the _current interpolated_ view.                      |
| Laser toggle                                                 | overlay button flips `activeTool` between `"laser"` and `"selection"`; driver lets `laser` pointer events through.          |
| Enter presentation with a non-selection tool active          | host forces nothing on entry; driver blocks all non-laser tools; on exit, tool reset to `selection` only if it was `laser`. |

## Testing

### Unit — `apps/web/test/animateView.test.ts`

- fake timers + stub `requestAnimationFrame`: from→to over 400ms calls `onFrame`
  with monotonic progress, final frame is exactly `to`.
- `durationMs = 0` → one `onFrame(to)`, no rAF scheduled.
- cancel fn → no further `onFrame` after cancel.

### Unit — `apps/web/test/presentation-slice.test.ts`

- `enterPresentation` → `presenting`, `slideIndex 0`.
- `nextSlide` / `prevSlide` → index math, `prevSlide` floors at 0.
- `exitPresentation` → resets both fields.

### Component — `apps/web/test/PresentationHost.test.tsx` (RTL)

- mock scene with 3 frames; mock `requestFullscreen`/`exitFullscreen`, stub rAF to
  run synchronously.
- renders `presentation-counter` "1 / 3".
- `ArrowRight` (window keydown) → counter "2 / 3" and `store.setView` called with a
  transform near `fitToContent(frame1)`.
- `ArrowLeft` at slide 0 stays "1 / 3".
- `Escape` → `presenting` is `false`, `setView` called with the pre-entry snapshot.
- deleting all frames from the scene → `presenting` flips to `false`.

### Component — `packages/ui/test/HamburgerMenu.test.tsx`

- `canPresent` true → `menu-presentation` enabled, click fires `onStartPresentation`.
- `canPresent` false → `menu-presentation` `aria-disabled`, click does nothing.

### E2E — `apps/web/e2e/presentation.spec.ts`

- draw two frames (frame tool `f`, two drags).
- open `HamburgerMenu`, click `menu-presentation`.
- assert `presentation-overlay` visible, `presentation-counter` = "1 / 2",
  toolbar (`toolbar-selection`) **not** visible (chrome hidden).
- `page.keyboard.press("ArrowRight")` → counter "2 / 2".
- `page.keyboard.press("ArrowRight")` again → still "2 / 2" (no wrap).
- `page.keyboard.press("Escape")` → toolbar visible again; the stored scene is
  unchanged (no element mutation from the whole flow).
- (fullscreen is not asserted — headless Chromium may not grant it; the overlay
  path is what matters.)

## Global constraints for implementation

- pnpm + Turbo. Full gate: `pnpm turbo run lint typecheck test build --force`.
- Playwright from `apps/web/`: `pnpm exec playwright test`.
- Scene localStorage key `"excalidraw-scene"`. E2E helpers in `apps/web/e2e/_helpers.ts`
  (`dragOnCanvas`, `parseStoredScene`).
- i18n: every key in **both** `en` and `ko` or `apps/web/test/i18n-shortcuts.test.tsx` fails.
- Commit after every task. Branch `feat/presentation-mode` off `develop`.
- Final task: full gate + full e2e green, then integrate per
  `superpowers:finishing-a-development-branch` (ff → develop → main, push both,
  delete branch, update memory).
