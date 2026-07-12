# Design: Dark mode completion — element color inversion, canvasBg wiring, system theme, WYSIWYG exports

**Date:** 2026-07-12
**Status:** Approved
**Approach:** Draw-time color transform in the renderer (Approach A)

## Background

Theming is half-built. Already shipped: a `theme` store slice
(`"light" | "dark" | "system"`) with a HamburgerMenu control, `data-theme`
CSS variables for all UI chrome, a themed canvas background/grid/selection in
the renderer (`BACKGROUND[this.theme]`, `GRID_COLOR[theme]`), theme
persistence via `saveUI`/`hydrateUI`, and a light/dark background option on
PNG export.

Three real gaps remain:

1. **Element colors are never remapped.** `drawElement` has no theme
   parameter, so the default ink `#1e1e1e` is drawn onto the `#121212` dark
   background — near-invisible. Dark mode is unusable for actual drawing.
2. **"system" theme is half-broken.** `useDrawingDriver.ts` maps
   `s.theme === "dark" ? "dark" : "light"`, so `system` on a dark OS renders
   dark UI over a light canvas. And the App.tsx effect reads
   `matchMedia("(prefers-color-scheme: dark)")` once, with no `change`
   listener — OS theme flips don't propagate live.
3. **`canvasBg` is dead state.** The canvas-background dialog's color is
   stored, persisted, and hydrated, but nothing in the renderer or exports
   ever reads it. The dialog silently does nothing.

Decisions made during brainstorming: adaptive filter-invert for element
colors (the upstream Excalidraw concept); wire `canvasBg` up and invert it in
dark mode; exports are WYSIWYG with the existing dialog toggle defaulting to
the current theme. Rejected: CSS `filter` on the canvas element
(double-inverts the already-themed background/grid/selection, requires
counter-inverting images, leaves exports unsolved) and lookup-table remapping
of only known palette colors (hand-picked dark strokes would stay invisible).

## 1. Color transform module

New file `packages/renderer/src/theme-colors.ts`:

- `resolveColor(color: string, theme: Theme): string` — the single color
  resolution point for canvas drawing, background fill, and SVG export.
- `theme === "light"` is identity. `"transparent"` passes through untouched
  in both themes.
- Dark transform: parse hex (`#rgb`, `#rrggbb`, `#rrggbbaa`), convert to HSL,
  preserve hue and saturation, invert lightness. Endpoint tuning is pinned by
  unit tests, not prescribed here: default ink `#1e1e1e` must land near
  `#ececec`, pure white near `#1e1e1e`, and lightness inversion must be
  monotonic (darker inputs → lighter outputs, strictly ordered). Alpha is
  preserved.
- Unparseable color strings return the input unchanged — `resolveColor` must
  never throw during a render frame.
- Memoized in a module-level `Map<string, string>` (dark entries only; the
  map is small — scenes use few distinct colors — no eviction needed).
- **Images are never inverted.** The image branch of `drawElement` and SVG
  `<image>` embedding bypass color resolution entirely; photos must not
  become negatives.

## 2. Renderer integration + canvasBg wiring

- `drawElement` gains a `theme` parameter and resolves element stroke and
  background colors through `resolveColor` before handing them to roughjs and
  text fill.
- `ShapeCache` stores roughjs drawables with colors baked in.
  `CanvasRenderer.setTheme()` therefore clears the shape cache; theme flips
  are rare, a full regenerate is acceptable.
- The hardcoded `BACKGROUND: Record<Theme, string>` table is deleted. The
  renderer gains a `canvasBg` constructor option (default `#ffffff`) and a
  `setCanvasBg(color)` method; the background fill becomes
  `resolveColor(canvasBg, theme)`. Default white inverts to today's
  near-`#121212` dark background; a user-picked pale yellow becomes a deep
  warm dark.
- `useDrawingDriver` subscribes `s.canvasBg` → `renderer.setCanvasBg`,
  mirroring the existing theme subscription.
- Grid (`GRID_COLOR[theme]`) and selection chrome keep their existing
  per-theme colors — unchanged.

## 3. System theme resolution

- New store field `resolvedTheme: "light" | "dark"` with setter, maintained
  by the App.tsx theme effect: computed from `theme` + `matchMedia`; when
  `theme === "system"`, a `change` listener keeps it live (detached on
  cleanup and when leaving `system`).
- Both `document.documentElement.dataset.theme` and the driver's
  `renderer.setTheme(...)` read `resolvedTheme`, fixing the
  system-renders-light-canvas bug.
- Persistence still stores the raw `theme` (so `"system"` survives reload);
  `resolvedTheme` is derived state and is never persisted.

## 4. Exports — WYSIWYG with toggle

- **PNG:** the export dialog's existing light/dark choice now defaults to the
  current `resolvedTheme` (today it defaults to light). The chosen theme and
  the user's `canvasBg` are passed into the export `CanvasRenderer`, which
  produces full parity via the same code path as the screen.
- **SVG:** the builder in `svg.ts` gains `theme` and `canvasBg` parameters.
  It emits a background `<rect>` painted with `resolveColor(canvasBg, theme)`
  and resolves every element color through `resolveColor`. Images embed
  as-is. The same dialog toggle drives it.
- No new UI and no new i18n keys expected — the existing dialog control gets
  a theme-aware default.
- Scene data is never mutated: the stored document remains theme-agnostic,
  and a light export from a dark session yields canonical colors.

## 5. Testing

- **Unit — renderer:**
  - `theme-colors.test.ts`: endpoint targets (`#1e1e1e` → ≈`#ececec`,
    white → ≈`#1e1e1e`), hue/saturation preservation, lightness
    monotonicity, `transparent` and unparseable-input passthrough, alpha
    preservation, memoization (repeat calls return identical strings).
  - Draw-level: a dark-theme render invokes roughjs with resolved colors,
    not stored ones.
  - Cache: draw → `setTheme("dark")` → assert shapes regenerate (cache
    invalidated).
  - SVG: dark output contains inverted colors and the background rect; light
    output is untouched relative to today.
- **Unit — web:** system-theme resolution with a jsdom `matchMedia` mock —
  OS flip updates `resolvedTheme` while in `system`; listener detached when
  leaving `system`.
- **e2e (Playwright):** toggle dark via hamburger → canvas background pixel
  is dark and a default-stroke rectangle is visible (light pixels at its
  border); reload → theme persists; PNG export in dark mode → decoded
  image's background pixel is dark.
- Full gate as usual: typecheck, unit, lint, build, e2e.

## Out of scope

- Per-element "locked color" opt-outs from inversion.
- Theming the grid/selection beyond their existing per-theme constants.
- Named CSS colors or `rgb()/hsl()` string parsing in `resolveColor` — the
  palette and color pickers only produce hex; anything else falls back to
  identity passthrough by design.
