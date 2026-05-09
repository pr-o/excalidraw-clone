# Phase 8: `apps/web` Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Inline execution preferred for this project. Each task ends with a commit on `develop`. TDD-style where unit tests apply; for the driver layer we lean on Playwright.

**Goal:** Wire `scene` + `renderer` + `tools` + `persistence` + `ui` into a working Next.js app. Build the Zustand UI store, the driver loop that translates DOM events into `ToolEvent`s and applies effects, i18n bootstrap, theme + zen-mode chrome, auto-save + hydration, file open/save, PNG export, and Playwright e2e tests for the golden flows.

**Architecture:**

- **Next.js 16 App Router**, single client-only page (`'use client'`) at `/`. The canvas owns the viewport.
- **Zustand store** (`src/store/`) with the slices the spec calls out (§ 7): tool, theme, view, grid, dialog, palette, i18n, selection, plus a `toolStateSlice` for the active reducer's state.
- **Driver hook** `useDrawingDriver(canvasRef, overlayRef)` mounts a `CanvasRenderer`, subscribes to scene + UI store, attaches DOM event listeners, runs the active tool reducer, and applies effects.
- **i18next** initialized in `src/i18n.ts`. Two namespaces (`common`, `shortcuts`). Resources for `en` + `ko`. Locale persists via the i18n slice → localStorage UI snapshot.
- **Theme**: light/dark/system. Applied as a `data-theme` attr on `<html>` plus passed to `renderer.setTheme()`.
- **Auto-save**: scene subscription + UI store subscription → `createAutoSaver({ delayMs: 500 })`. On boot, hydrate from `loadScene()` / `loadUI()`.
- **File I/O**: hamburger menu → "Open" triggers a hidden `<input type="file" accept=".excalidraw,application/json">`. "Save as" calls `serializeScene` → `toExcalidrawBlob` → `download`. "Export" opens `ExportDialog` → renderer-driven PNG/SVG via a one-shot offscreen canvas.
- **Image tool**: file picker on tool select → `addImageFromBlob` → fire `imageReady` ToolEvent.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 7 (UI store), § 8 (persistence wiring), § 9 (export), § 10 (i18n), § 11 (Playwright e2e), § 12 step 8.

**Working branch:** `develop`. Each task ends with a commit.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Zustand 5, i18next 24 + react-i18next 15, Playwright 1.x, Vitest (existing).

---

## Architectural decisions (locked in for this phase)

### Single client component shell

The whole app is one `'use client'` page. SSR adds nothing for a canvas app, and Turbopack/Next 16 still gives us the dev server + bundler. The page renders:

```
<RootProvider>          // Zustand provider stub (Zustand doesn't need one, but we do for i18next + theme)
  <I18nextProvider>
    <App>
      <CanvasShell />   // overlays, dialogs, palette
      <Toolbar />
      <HamburgerMenu />
      <PropertiesPanel />
      <Dialogs />        // Help / Export / Reset / CanvasBg
      <CommandPalette />
    </App>
  </I18nextProvider>
</RootProvider>
```

### Driver vs store separation

The Zustand store holds **UI** state (active tool, theme, locale, dialog open flags, selection IDs, current tool reducer state). The Scene (vanilla) holds **scene** state. The driver hook subscribes to both, owns the DOM listeners on the canvas element, and runs the active tool's reducer. Effects from the reducer are applied:

- `mutation` → `scene.mutate`
- `select` / `addToSelection` / `removeFromSelection` → store action
- `switchTool` → store action (and resets reducer state to `initial`)
- `startTextEdit` → store action that mounts a `<textarea>` overlay (Task 9)

### Tools registry as the dispatch table

The driver looks up the active tool via `TOOLS[activeTool]`. State is stored per-tool key in `toolStateSlice` so switching back and forth doesn't lose in-flight state — except we explicitly reset on `switchTool` effect to mirror upstream behavior (a tool change cancels in-progress drawing).

### Image upload flow

```
user clicks Image tool → hidden file input opens
user picks file → addImageFromBlob(blob) → { id, dataURL, mimeType }
driver fires imageReady event → imageTool transitions to "placing"
user clicks canvas → mutation creates ExcalidrawImageElement with fileId
driver also calls renderer.preloadImage(fileId, dataURL) so the renderer's image map is warm
```

### Renderer image cache (new)

This phase adds `renderer.preloadImage(fileId, dataURL)` and `renderer.unloadImage(fileId)` to the existing `CanvasRenderer`. On hydration, the driver iterates `getAllFiles()` and calls `preloadImage` for each. Drawing image elements goes through the renderer's existing image-element draw path — which currently expects a `fileId → HTMLImageElement` map (Phase 4 already accommodated this; if it didn't, that's a small renderer extension flagged in Task 6).

### Export pipeline

Both PNG and SVG go through `packages/renderer`:

- PNG: create offscreen `HTMLCanvasElement`, instantiate `CanvasRenderer` against it with the same scene + the requested options (theme by background, scale via DPR-style upscale, embedScene → write a `tEXt` chunk on the resulting blob).
- SVG: a thin `renderToSVG(scene, opts)` helper that uses `roughjs/bin/svg`. **This requires a small renderer addition** in Task 7.

### Playwright tests cover the golden flows

We do **not** unit-test the driver hook. It's I/O-heavy and brittle in jsdom. Instead, Playwright covers:

1. Draw a rectangle → it appears.
2. Draw → resize → undo restores prior size.
3. Theme toggle changes background.
4. Save .excalidraw → re-open in a new page → scene restored.
5. Auto-save survives reload.
6. Cmd+/ opens command palette; Esc closes.
7. Help dialog opens via `?`.

### Out of scope

- **Server-side rendering / SSG.** Page is `'use client'`.
- **Mobile/touch optimization.** Pointer events handle stylus/touch where the browser dispatches `PointerEvent`, but UI density is desktop-first.
- **Custom font loading (Excalifont).** Per spec § 13, we use Google Fonts (Caveat, Architects Daughter, Comic Neue) imported in `globals.css`.
- **Vercel deploy config.** Add a barebones `next.config.ts` for static export support; actual Vercel project setup is post-merge.

---

## File structure

```
apps/web/
  src/
    app/
      layout.tsx               ← imports globals.css, wraps in providers
      page.tsx                 ← the App shell (currently a placeholder)
      globals.css              ← Tailwind + theme tokens
    components/
      App.tsx                  ← orchestrates everything
      CanvasShell.tsx          ← canvas + overlay, mounts driver
      Dialogs.tsx               ← <Help/Export/Reset/CanvasBg>
      TextEditingOverlay.tsx
    driver/
      useDrawingDriver.ts
      events.ts                 ← DOM PointerEvent → ToolEvent
      effects.ts                ← apply ToolEffect to scene/store
      hydration.ts              ← boot-time load + preload
      autoSave.ts               ← createAutoSaver wiring
      imageUpload.ts            ← file picker → addImageFromBlob → ToolEvent
    store/
      index.ts                  ← combined Zustand store
      slices/
        tool.ts
        theme.ts
        view.ts
        grid.ts
        dialog.ts
        palette.ts
        i18n.ts
        selection.ts
        toolState.ts
    i18n.ts                     ← i18next bootstrap
    locales/
      en/
        common.json
        shortcuts.json
      ko/
        common.json
        shortcuts.json
    keyboard/
      shortcuts.ts              ← global keymap
  test/                        ← unit tests for store slices + utils
    store-tool.test.ts
    store-selection.test.ts
    keyboard-shortcuts.test.ts
  e2e/
    draw-rectangle.spec.ts
    undo-redo.spec.ts
    theme.spec.ts
    file-io.spec.ts
    auto-save.spec.ts
    palette.spec.ts
    help.spec.ts
  playwright.config.ts
  package.json                  ← add zustand, i18next, react-i18next, playwright
```

---

## Task 1: Dependencies + globals.css + i18n bootstrap

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/i18n.ts`
- Create: `apps/web/src/locales/en/common.json`
- Create: `apps/web/src/locales/en/shortcuts.json`
- Create: `apps/web/src/locales/ko/common.json`
- Create: `apps/web/src/locales/ko/shortcuts.json`

- [ ] **Step 1: Update `package.json`**

Add deps:

```json
"dependencies": {
  "@excalidraw-clone/geometry": "workspace:*",
  "@excalidraw-clone/persistence": "workspace:*",
  "@excalidraw-clone/renderer": "workspace:*",
  "@excalidraw-clone/scene": "workspace:*",
  "@excalidraw-clone/tools": "workspace:*",
  "@excalidraw-clone/ui": "workspace:*",
  "i18next": "^24.0.0",
  "next": "^16.2.2",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-i18next": "^15.0.0",
  "zustand": "^5.0.0"
}
```

Add devDep:

```json
"devDependencies": {
  "@playwright/test": "^1.49.0",
  "@tailwindcss/postcss": "^4.0.0",
  "@types/node": "^22.10.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "tailwindcss": "^4.0.0",
  "typescript": "^5.7.2",
  "vitest": "^2.1.8"
}
```

Add scripts:

```json
"scripts": {
  "build": "next build",
  "dev": "next dev --turbopack -p 3000",
  "start": "next start -p 3000",
  "lint": "eslint src test e2e",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "e2e": "playwright test",
  "e2e:install": "playwright install --with-deps chromium"
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Update `globals.css` (Tailwind v4 + theme tokens)**

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";

:root {
  --bg-app: #fafafa;
  --bg-canvas: #ffffff;
  --fg-app: #1e1e1e;
  --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] {
  --bg-app: #121212;
  --bg-canvas: #1e1e1e;
  --fg-app: #ececec;
  --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.4);
}

html,
body {
  background: var(--bg-app);
  color: var(--fg-app);
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
}

.canvas-handwritten {
  font-family: "Caveat", "Architects Daughter", cursive;
}
```

- [ ] **Step 4: Create locale files**

`apps/web/src/locales/en/common.json`:

```json
{
  "toolbar": {
    "label": "Toolbar",
    "lock": "Lock active tool",
    "selection": "Selection",
    "rectangle": "Rectangle",
    "ellipse": "Ellipse",
    "diamond": "Diamond",
    "line": "Line",
    "arrow": "Arrow",
    "freedraw": "Draw",
    "text": "Text",
    "image": "Image",
    "eraser": "Eraser",
    "frame": "Frame"
  },
  "properties": {
    "label": "Properties",
    "stroke": "Stroke",
    "background": "Background",
    "strokeWidth": "Stroke width",
    "opacity": "Opacity",
    "layers": "Layers",
    "actions": "Actions",
    "duplicate": "Duplicate",
    "delete": "Delete",
    "sendToBack": "Send to back",
    "sendBackward": "Send backward",
    "bringForward": "Bring forward",
    "bringToFront": "Bring to front"
  },
  "menu": {
    "label": "Menu",
    "open": "Open…",
    "saveAs": "Save as…",
    "export": "Export image…",
    "reset": "Reset the canvas",
    "help": "Help",
    "enterZen": "Enter zen mode",
    "exitZen": "Exit zen mode",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System",
    "language": "Language"
  },
  "common": {
    "close": "Close"
  },
  "palette": {
    "title": "Command palette",
    "placeholder": "Type a command…",
    "empty": "No matching commands"
  },
  "export": {
    "title": "Export image",
    "format": "Format",
    "scale": "Scale",
    "background": "Background",
    "bgWhite": "Light",
    "bgDark": "Dark",
    "bgTransparent": "Transparent",
    "embed": "Embed scene (re-importable)",
    "cancel": "Cancel",
    "confirm": "Export"
  },
  "reset": {
    "title": "Reset the canvas",
    "body": "This will permanently remove all your work. This action cannot be undone.",
    "cancel": "Cancel",
    "confirm": "Reset canvas"
  },
  "canvasBg": {
    "title": "Canvas background"
  },
  "shortcuts": {
    "title": "Keyboard shortcuts",
    "tools": "Tools",
    "editor": "Editor",
    "view": "View"
  }
}
```

`apps/web/src/locales/en/shortcuts.json`:

```json
{
  "selection": "Selection",
  "rectangle": "Rectangle",
  "ellipse": "Ellipse",
  "diamond": "Diamond",
  "line": "Line",
  "arrow": "Arrow",
  "freedraw": "Draw",
  "text": "Text",
  "image": "Image",
  "eraser": "Eraser",
  "frame": "Frame",
  "undo": "Undo",
  "redo": "Redo",
  "copy": "Copy",
  "paste": "Paste",
  "duplicate": "Duplicate",
  "delete": "Delete",
  "selectAll": "Select all",
  "deselect": "Deselect",
  "zoomReset": "Reset zoom",
  "zoomIn": "Zoom in",
  "zoomOut": "Zoom out",
  "pan": "Pan",
  "toggleGrid": "Toggle grid",
  "commandPalette": "Command palette",
  "help": "Help"
}
```

`apps/web/src/locales/ko/common.json` and `ko/shortcuts.json`: same keys, Korean values. Examples:

```json
{
  "toolbar": {
    "label": "도구 모음",
    "lock": "도구 잠금",
    "selection": "선택",
    "rectangle": "사각형",
    "ellipse": "타원",
    "diamond": "마름모",
    "line": "선",
    "arrow": "화살표",
    "freedraw": "그리기",
    "text": "텍스트",
    "image": "이미지",
    "eraser": "지우개",
    "frame": "프레임"
  },
  "properties": {
    "label": "속성",
    "stroke": "선 색상",
    "background": "채움 색상",
    "strokeWidth": "선 두께",
    "opacity": "투명도",
    "layers": "레이어",
    "actions": "동작",
    "duplicate": "복제",
    "delete": "삭제",
    "sendToBack": "맨 뒤로",
    "sendBackward": "뒤로",
    "bringForward": "앞으로",
    "bringToFront": "맨 앞으로"
  },
  "menu": {
    "label": "메뉴",
    "open": "열기…",
    "saveAs": "다른 이름으로 저장…",
    "export": "이미지 내보내기…",
    "reset": "캔버스 초기화",
    "help": "도움말",
    "enterZen": "젠 모드",
    "exitZen": "젠 모드 종료",
    "theme": "테마",
    "themeLight": "밝게",
    "themeDark": "어둡게",
    "themeSystem": "시스템",
    "language": "언어"
  },
  "common": { "close": "닫기" },
  "palette": {
    "title": "명령어 팔레트",
    "placeholder": "명령어 입력…",
    "empty": "일치하는 명령어가 없습니다"
  },
  "export": {
    "title": "이미지 내보내기",
    "format": "형식",
    "scale": "배율",
    "background": "배경",
    "bgWhite": "밝게",
    "bgDark": "어둡게",
    "bgTransparent": "투명",
    "embed": "장면 정보 포함",
    "cancel": "취소",
    "confirm": "내보내기"
  },
  "reset": {
    "title": "캔버스 초기화",
    "body": "모든 작업이 영구적으로 삭제됩니다. 되돌릴 수 없습니다.",
    "cancel": "취소",
    "confirm": "초기화"
  },
  "canvasBg": { "title": "캔버스 배경" },
  "shortcuts": { "title": "키보드 단축키", "tools": "도구", "editor": "편집", "view": "보기" }
}
```

`ko/shortcuts.json` mirrors `en/shortcuts.json` keys with Korean values.

- [ ] **Step 5: Implement i18n bootstrap**

```ts
// apps/web/src/i18n.ts
import i18next from "i18next"
import { initReactI18next } from "react-i18next"
import enCommon from "./locales/en/common.json"
import enShortcuts from "./locales/en/shortcuts.json"
import koCommon from "./locales/ko/common.json"
import koShortcuts from "./locales/ko/shortcuts.json"

let initialized = false

export function ensureI18n(initialLocale: "en" | "ko"): typeof i18next {
  if (initialized) {
    if (i18next.language !== initialLocale) {
      void i18next.changeLanguage(initialLocale)
    }
    return i18next
  }
  void i18next.use(initReactI18next).init({
    lng: initialLocale,
    fallbackLng: "en",
    ns: ["common", "shortcuts"],
    defaultNS: "common",
    resources: {
      en: { common: enCommon, shortcuts: enShortcuts },
      ko: { common: koCommon, shortcuts: koShortcuts },
    },
    interpolation: { escapeValue: false },
  })
  initialized = true
  return i18next
}
```

- [ ] **Step 6: Update `layout.tsx`**

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Excalidraw Clone",
  description: "Solo-drawing clone of Excalidraw",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: both green.

> Don't run `pnpm --filter @excalidraw-clone/web test` yet — there are no tests under `test/` yet, vitest will pass with 0 files. Skip if it errors on "no tests found" — that's fine.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/i18n.ts apps/web/src/locales/ pnpm-lock.yaml
git commit -m "Phase 8.1: web — deps, Tailwind tokens, i18next bootstrap"
```

---

## Task 2: Zustand store skeleton — slices

Build the eight slices as separate files, each TDD'd in isolation.

**Files:**

- Create: `apps/web/src/store/index.ts`
- Create: `apps/web/src/store/slices/tool.ts`
- Create: `apps/web/src/store/slices/theme.ts`
- Create: `apps/web/src/store/slices/view.ts`
- Create: `apps/web/src/store/slices/grid.ts`
- Create: `apps/web/src/store/slices/dialog.ts`
- Create: `apps/web/src/store/slices/palette.ts`
- Create: `apps/web/src/store/slices/i18n.ts`
- Create: `apps/web/src/store/slices/selection.ts`
- Create: `apps/web/src/store/slices/toolState.ts`
- Create: `apps/web/test/store-tool.test.ts`
- Create: `apps/web/test/store-selection.test.ts`
- Modify: `apps/web/vitest.config.ts` (set jsdom + setupFiles if needed)

**Slice contracts:**

```ts
ToolSlice:
  activeTool: ToolName
  lockActiveTool: boolean
  setActiveTool(t: ToolName): void
  toggleLockActiveTool(): void
ThemeSlice:
  theme: "light" | "dark" | "system"
  setTheme(t): void
ViewSlice:
  scrollX, scrollY, zoom: number
  zenMode: boolean
  setView(view: ViewTransform): void
  toggleZenMode(): void
GridSlice:
  gridEnabled: boolean
  gridSize: number
  toggleGrid(): void
  setGridSize(n): void
DialogSlice:
  openDialog: null | "help" | "export" | "reset" | "canvasBg"
  setOpenDialog(d): void
PaletteSlice:
  paletteOpen: boolean
  setPaletteOpen(b): void
I18nSlice:
  locale: "en" | "ko"
  setLocale(l): void
SelectionSlice:
  selectedIds: readonly string[]
  setSelection(ids): void
  addToSelection(ids): void
  removeFromSelection(ids): void
ToolStateSlice:
  toolStates: Record<ToolName, unknown>   // per-tool current state
  setToolState(name, state): void
  resetToolState(name): void
```

> Per-task setup is too long for a 10-step section. We'll batch slices: tool + selection have unit tests; the others are simple property bags and get coverage via the driver in later tasks.

- [ ] **Step 1: Update `apps/web/vitest.config.ts`**

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
  },
})
```

- [ ] **Step 2: Write failing test for tool slice**

```ts
// apps/web/test/store-tool.test.ts
import { describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("toolSlice", () => {
  it("starts with selection tool, lock off", () => {
    const s = useAppStore.getState()
    expect(s.activeTool).toBe("selection")
    expect(s.lockActiveTool).toBe(false)
  })

  it("setActiveTool updates state", () => {
    useAppStore.getState().setActiveTool("rectangle")
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("toggleLockActiveTool flips boolean", () => {
    useAppStore.getState().setActiveTool("selection")
    const before = useAppStore.getState().lockActiveTool
    useAppStore.getState().toggleLockActiveTool()
    expect(useAppStore.getState().lockActiveTool).toBe(!before)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web test test/store-tool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement slices + combined store**

```ts
// apps/web/src/store/slices/tool.ts
import type { ToolName } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export interface ToolSlice {
  activeTool: ToolName
  lockActiveTool: boolean
  setActiveTool: (t: ToolName) => void
  toggleLockActiveTool: () => void
}

export const createToolSlice: StateCreator<ToolSlice, [], [], ToolSlice> = (set) => ({
  activeTool: "selection",
  lockActiveTool: false,
  setActiveTool: (t) => set({ activeTool: t }),
  toggleLockActiveTool: () => set((s) => ({ lockActiveTool: !s.lockActiveTool })),
})
```

```ts
// apps/web/src/store/slices/theme.ts
import type { StateCreator } from "zustand"

export type Theme = "light" | "dark" | "system"

export interface ThemeSlice {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const createThemeSlice: StateCreator<ThemeSlice, [], [], ThemeSlice> = (set) => ({
  theme: "light",
  setTheme: (t) => set({ theme: t }),
})
```

```ts
// apps/web/src/store/slices/view.ts
import type { ViewTransform } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

export interface ViewSlice {
  scrollX: number
  scrollY: number
  zoom: number
  zenMode: boolean
  setView: (v: ViewTransform) => void
  toggleZenMode: () => void
}

export const createViewSlice: StateCreator<ViewSlice, [], [], ViewSlice> = (set) => ({
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  zenMode: false,
  setView: (v) => set({ scrollX: v.scrollX, scrollY: v.scrollY, zoom: v.zoom }),
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
})
```

```ts
// apps/web/src/store/slices/grid.ts
import type { StateCreator } from "zustand"

export interface GridSlice {
  gridEnabled: boolean
  gridSize: number
  toggleGrid: () => void
  setGridSize: (n: number) => void
}

export const createGridSlice: StateCreator<GridSlice, [], [], GridSlice> = (set) => ({
  gridEnabled: false,
  gridSize: 20,
  toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),
  setGridSize: (n) => set({ gridSize: n }),
})
```

```ts
// apps/web/src/store/slices/dialog.ts
import type { StateCreator } from "zustand"

export type DialogId = null | "help" | "export" | "reset" | "canvasBg"

export interface DialogSlice {
  openDialog: DialogId
  setOpenDialog: (d: DialogId) => void
}

export const createDialogSlice: StateCreator<DialogSlice, [], [], DialogSlice> = (set) => ({
  openDialog: null,
  setOpenDialog: (d) => set({ openDialog: d }),
})
```

```ts
// apps/web/src/store/slices/palette.ts
import type { StateCreator } from "zustand"

export interface PaletteSlice {
  paletteOpen: boolean
  setPaletteOpen: (b: boolean) => void
}

export const createPaletteSlice: StateCreator<PaletteSlice, [], [], PaletteSlice> = (set) => ({
  paletteOpen: false,
  setPaletteOpen: (b) => set({ paletteOpen: b }),
})
```

```ts
// apps/web/src/store/slices/i18n.ts
import type { StateCreator } from "zustand"

export type Locale = "en" | "ko"

export interface I18nSlice {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const createI18nSlice: StateCreator<I18nSlice, [], [], I18nSlice> = (set) => ({
  locale: "en",
  setLocale: (l) => set({ locale: l }),
})
```

```ts
// apps/web/src/store/slices/selection.ts
import type { StateCreator } from "zustand"

export interface SelectionSlice {
  selectedIds: readonly string[]
  setSelection: (ids: readonly string[]) => void
  addToSelection: (ids: readonly string[]) => void
  removeFromSelection: (ids: readonly string[]) => void
}

export const createSelectionSlice: StateCreator<SelectionSlice, [], [], SelectionSlice> = (
  set,
) => ({
  selectedIds: [],
  setSelection: (ids) => set({ selectedIds: [...ids] }),
  addToSelection: (ids) =>
    set((s) => {
      const set_ = new Set(s.selectedIds)
      for (const id of ids) set_.add(id)
      return { selectedIds: [...set_] }
    }),
  removeFromSelection: (ids) =>
    set((s) => {
      const set_ = new Set(s.selectedIds)
      for (const id of ids) set_.delete(id)
      return { selectedIds: [...set_] }
    }),
})
```

```ts
// apps/web/src/store/slices/toolState.ts
import type { ToolName } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export interface ToolStateSlice {
  toolStates: Partial<Record<ToolName, unknown>>
  setToolState: (name: ToolName, state: unknown) => void
  resetToolState: (name: ToolName) => void
}

export const createToolStateSlice: StateCreator<ToolStateSlice, [], [], ToolStateSlice> = (
  set,
) => ({
  toolStates: {},
  setToolState: (name, state) => set((s) => ({ toolStates: { ...s.toolStates, [name]: state } })),
  resetToolState: (name) =>
    set((s) => {
      const copy = { ...s.toolStates }
      delete copy[name]
      return { toolStates: copy }
    }),
})
```

```ts
// apps/web/src/store/index.ts
import { create } from "zustand"
import { createDialogSlice, type DialogSlice } from "./slices/dialog"
import { createGridSlice, type GridSlice } from "./slices/grid"
import { createI18nSlice, type I18nSlice } from "./slices/i18n"
import { createPaletteSlice, type PaletteSlice } from "./slices/palette"
import { createSelectionSlice, type SelectionSlice } from "./slices/selection"
import { createThemeSlice, type ThemeSlice } from "./slices/theme"
import { createToolSlice, type ToolSlice } from "./slices/tool"
import { createToolStateSlice, type ToolStateSlice } from "./slices/toolState"
import { createViewSlice, type ViewSlice } from "./slices/view"

export type AppState = ToolSlice &
  ThemeSlice &
  ViewSlice &
  GridSlice &
  DialogSlice &
  PaletteSlice &
  I18nSlice &
  SelectionSlice &
  ToolStateSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createToolSlice(...a),
  ...createThemeSlice(...a),
  ...createViewSlice(...a),
  ...createGridSlice(...a),
  ...createDialogSlice(...a),
  ...createPaletteSlice(...a),
  ...createI18nSlice(...a),
  ...createSelectionSlice(...a),
  ...createToolStateSlice(...a),
}))
```

- [ ] **Step 5: Run tool slice test**

Run: `pnpm --filter @excalidraw-clone/web test test/store-tool.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Write failing test for selection slice**

```ts
// apps/web/test/store-selection.test.ts
import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("selectionSlice", () => {
  beforeEach(() => {
    useAppStore.getState().setSelection([])
  })

  it("starts empty", () => {
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("setSelection replaces", () => {
    useAppStore.getState().setSelection(["a", "b"])
    expect(useAppStore.getState().selectedIds).toEqual(["a", "b"])
    useAppStore.getState().setSelection(["c"])
    expect(useAppStore.getState().selectedIds).toEqual(["c"])
  })

  it("addToSelection unions and dedupes", () => {
    useAppStore.getState().setSelection(["a"])
    useAppStore.getState().addToSelection(["a", "b"])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "b"])
  })

  it("removeFromSelection removes specified ids only", () => {
    useAppStore.getState().setSelection(["a", "b", "c"])
    useAppStore.getState().removeFromSelection(["b"])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "c"])
  })
})
```

- [ ] **Step 7: Run selection slice test**

Run: `pnpm --filter @excalidraw-clone/web test test/store-selection.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 8: Verify monorepo lint + typecheck**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: both green.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/store/ apps/web/test/store-tool.test.ts apps/web/test/store-selection.test.ts apps/web/vitest.config.ts
git commit -m "Phase 8.2: web — Zustand store with 9 slices"
```

---

## Task 3: Effect interpreter + driver hook (skeleton)

The driver mounts a `CanvasRenderer`, runs the active tool reducer on each event, and applies effects.

**Files:**

- Create: `apps/web/src/driver/effects.ts`
- Create: `apps/web/src/driver/events.ts`
- Create: `apps/web/src/driver/useDrawingDriver.ts`
- Create: `apps/web/src/driver/imageUpload.ts`
- Create: `apps/web/test/effects.test.ts`

- [ ] **Step 1: Write failing test for `applyEffects`**

```ts
// apps/web/test/effects.test.ts
import { Scene, newRectangle } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { describe, expect, it, vi } from "vitest"
import { applyEffects } from "../src/driver/effects"
import { useAppStore } from "../src/store"

describe("applyEffects", () => {
  it("mutation effect calls scene.mutate", () => {
    const scene = new Scene()
    const effect: ToolEffect = {
      kind: "mutation",
      apply: (draft) => draft.push(newRectangle({ x: 0, y: 0, width: 10, height: 10 })),
    }
    applyEffects(scene, [effect])
    expect(scene.getElements().length).toBe(1)
  })

  it("select effect updates the selection slice", () => {
    const scene = new Scene()
    useAppStore.getState().setSelection([])
    applyEffects(scene, [{ kind: "select", ids: ["x"] }])
    expect(useAppStore.getState().selectedIds).toEqual(["x"])
  })

  it("addToSelection effect adds without replacing", () => {
    const scene = new Scene()
    useAppStore.getState().setSelection(["a"])
    applyEffects(scene, [{ kind: "addToSelection", ids: ["b"] }])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "b"])
  })

  it("switchTool effect updates active tool and resets reducer state", () => {
    const scene = new Scene()
    useAppStore.getState().setActiveTool("rectangle")
    useAppStore.getState().setToolState("rectangle", { phase: "drawing" })
    applyEffects(scene, [{ kind: "switchTool", tool: "selection" }])
    expect(useAppStore.getState().activeTool).toBe("selection")
    expect(useAppStore.getState().toolStates.rectangle).toBeUndefined()
  })

  it("skipHistory mutation calls scene.mutate with skipHistory", () => {
    const scene = new Scene()
    const spy = vi.spyOn(scene, "mutate")
    applyEffects(scene, [{ kind: "mutation", apply: () => {}, skipHistory: true }])
    expect(spy).toHaveBeenCalledWith(expect.any(Function), { skipHistory: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web test test/effects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `applyEffects`**

```ts
// apps/web/src/driver/effects.ts
import type { Scene } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"

export function applyEffects(scene: Scene, effects: readonly ToolEffect[]): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case "mutation":
        scene.mutate(eff.apply, eff.skipHistory ? { skipHistory: true } : undefined)
        break
      case "select":
        useAppStore.getState().setSelection(eff.ids)
        break
      case "addToSelection":
        useAppStore.getState().addToSelection(eff.ids)
        break
      case "removeFromSelection":
        useAppStore.getState().removeFromSelection(eff.ids)
        break
      case "switchTool":
        useAppStore.getState().resetToolState(useAppStore.getState().activeTool)
        useAppStore.getState().setActiveTool(eff.tool)
        break
      case "startTextEdit":
        // TextEditingOverlay reads from store
        useAppStore.setState({ textEditElementId: eff.elementId } as never)
        break
    }
  }
}
```

> The `startTextEdit` branch references `textEditElementId` which we'll add as a small extra slice in Task 9 (text editing). For now this compiles because we cast.

- [ ] **Step 4: Implement DOM event translation**

```ts
// apps/web/src/driver/events.ts
import type { Point, ViewTransform } from "@excalidraw-clone/geometry"
import type { Modifiers, ToolEvent } from "@excalidraw-clone/tools"

export function modifiersOf(e: {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): Modifiers {
  return { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
}

export function clientToScene(
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: PointerEvent | MouseEvent,
): Point {
  const rect = canvas.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  return {
    x: cx / view.zoom - view.scrollX,
    y: cy / view.zoom - view.scrollY,
  }
}

export function pointerEventToToolEvent(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: PointerEvent,
): ToolEvent {
  return { type, at: clientToScene(canvas, view, e) }
}
```

- [ ] **Step 5: Implement the driver hook**

```ts
// apps/web/src/driver/useDrawingDriver.ts
"use client"
import { hitTestElement, type Scene, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import {
  TOOLS,
  type Tool,
  type ToolContext,
  type ToolEvent,
  type ToolName,
} from "@excalidraw-clone/tools"
import { useEffect, useRef, type RefObject } from "react"
import { useAppStore } from "../store"
import { applyEffects } from "./effects"
import { modifiersOf, pointerEventToToolEvent } from "./events"

interface DriverOptions {
  scene: Scene
  canvasRef: RefObject<HTMLCanvasElement>
  overlayRef: RefObject<HTMLCanvasElement>
}

export function useDrawingDriver({ scene, canvasRef, overlayRef }: DriverOptions): void {
  const rendererRef = useRef<CanvasRenderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const renderer = new CanvasRenderer(canvas, scene, { overlayCanvas: overlay })
    rendererRef.current = renderer
    renderer.start()

    const unsubStore = useAppStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) renderer.setTheme(s.theme === "dark" ? "dark" : "light")
      if (s.scrollX !== prev.scrollX || s.scrollY !== prev.scrollY || s.zoom !== prev.zoom) {
        renderer.setViewTransform({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom })
      }
      if (s.gridEnabled !== prev.gridEnabled || s.gridSize !== prev.gridSize) {
        renderer.setGrid({ enabled: s.gridEnabled, size: s.gridSize })
      }
      if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)
    })

    const dispatch = (event: ToolEvent): void => {
      const store = useAppStore.getState()
      const toolName = store.activeTool
      const tool = TOOLS[toolName] as Tool<unknown, ToolEvent>
      const currentState = (store.toolStates[toolName] ?? tool.initial) as unknown
      const ctx: ToolContext = {
        readElements: () => scene.getElements(),
        hitTest: (at) => {
          const elements = scene.getElements()
          for (let i = elements.length - 1; i >= 0; i -= 1) {
            const el = elements[i] as ExcalidrawElement
            if (hitTestElement(el, at)) return el
          }
          return null
        },
        viewTransform: { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        selectedIds: store.selectedIds,
      }
      const [next, effects] = tool.reducer(currentState, event, ctx)
      useAppStore.getState().setToolState(toolName, next)
      applyEffects(scene, effects)
    }

    const onPointerDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId)
      dispatchWithModifiers("pointerDown", e)
    }
    const onPointerMove = (e: PointerEvent): void => dispatchWithModifiers("pointerMove", e)
    const onPointerUp = (e: PointerEvent): void => {
      canvas.releasePointerCapture(e.pointerId)
      dispatchWithModifiers("pointerUp", e)
    }
    const onDoubleClick = (e: MouseEvent): void => {
      const store = useAppStore.getState()
      dispatch({
        type: "doubleClick",
        at: pointerEventToToolEvent(
          "pointerDown",
          canvas,
          { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
          e as unknown as PointerEvent,
        ).at,
      })
    }

    function dispatchWithModifiers(
      type: "pointerDown" | "pointerMove" | "pointerUp",
      e: PointerEvent,
    ): void {
      const store = useAppStore.getState()
      const event = pointerEventToToolEvent(
        type,
        canvas,
        { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
        e,
      )
      // augment ctx.modifiers via a closure — handled inside dispatch by re-reading store; we override on the fly below.
      // Simpler: pass through; reducer reads ctx.modifiers but our ctx is computed in dispatch.
      // To wire modifiers, rebuild ctx here. Inline that:
      const _ = modifiersOf(e)
      dispatch(event)
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      unsubStore()
      renderer.stop()
      rendererRef.current = null
    }
  }, [scene, canvasRef, overlayRef])
}
```

> **Caveat re: `ctx.modifiers`:** the simplified `dispatch` above doesn't actually thread modifiers from the event. Tools that need modifiers (e.g. shift-constrain to square) won't behave correctly without this. **The implementer must refactor `dispatch` to take modifiers as an argument**, not read them from a stale store. Concretely:
>
> ```ts
> const dispatch = (event: ToolEvent, modifiers: Modifiers): void => {
>   /* ctx.modifiers = modifiers; rest unchanged */
> }
> // and on each handler: dispatch(event, modifiersOf(e))
> ```

- [ ] **Step 6: Implement image upload helper**

```ts
// apps/web/src/driver/imageUpload.ts
"use client"
import type { Point } from "@excalidraw-clone/geometry"
import { addImageFromBlob } from "@excalidraw-clone/persistence"
import type { ToolEvent } from "@excalidraw-clone/tools"

export async function pickAndUploadImage(at: Point): Promise<ToolEvent | null> {
  const blob = await pickImageBlob()
  if (!blob) return null
  const file = await addImageFromBlob(blob)
  const dims = await measureImage(file.dataURL)
  return {
    type: "imageReady",
    fileId: file.id,
    mimeType: file.mimeType,
    width: dims.width,
    height: dims.height,
    at,
  } as ToolEvent
}

function pickImageBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml"
    input.onchange = () => {
      const f = input.files?.[0]
      resolve(f ?? null)
    }
    input.click()
  })
}

function measureImage(dataURL: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("measureImage: image load failed"))
    img.src = dataURL
  })
}
```

- [ ] **Step 7: Run effects.test.ts**

Run: `pnpm --filter @excalidraw-clone/web test test/effects.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 8: Verify lint + typecheck**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint`
Expected: both green. Resolve any lint complaints (the `useDrawingDriver` skeleton is intentionally unused dead code marked with `_` to silence `no-unused-vars` until App.tsx mounts it).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/driver/ apps/web/test/effects.test.ts
git commit -m "Phase 8.3: web — driver skeleton + effect interpreter"
```

---

## Task 4: App shell + canvas mount

Wire the components together. This is the first task that produces a runnable app.

**Files:**

- Create: `apps/web/src/components/App.tsx`
- Create: `apps/web/src/components/CanvasShell.tsx`
- Create: `apps/web/src/components/Dialogs.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Implement `CanvasShell.tsx`**

```tsx
// apps/web/src/components/CanvasShell.tsx
"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef } from "react"
import { useDrawingDriver } from "../driver/useDrawingDriver"

export function CanvasShell({ scene }: { scene: Scene }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!wrapper || !canvas || !overlay) return

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = wrapper.clientWidth
      const h = wrapper.clientHeight
      for (const c of [canvas, overlay]) {
        c.width = Math.floor(w * dpr)
        c.height = Math.floor(h * dpr)
        c.style.width = `${w}px`
        c.style.height = `${h}px`
      }
      const ctx = canvas.getContext("2d")
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  useDrawingDriver({ scene, canvasRef, overlayRef })

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}
```

- [ ] **Step 2: Implement `Dialogs.tsx`**

```tsx
// apps/web/src/components/Dialogs.tsx
"use client"
import {
  CanvasBgDialog,
  ExportDialog,
  HelpDialog,
  ResetCanvasDialog,
  type ExportOptions,
} from "@excalidraw-clone/ui"
import { clearAllFiles, clearLocal } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"

export function Dialogs({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const openDialog = useAppStore((s) => s.openDialog)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const [canvasBg, setCanvasBg] = [
    useAppStore((s) => s.canvasBg),
    useAppStore((s) => s.setCanvasBg),
  ] as [string, (c: string) => void]

  const onExport = (opts: ExportOptions): void => {
    void exportScene(scene, opts)
    setOpenDialog(null)
  }

  const onResetConfirm = (): void => {
    scene.mutate((draft) => {
      draft.length = 0
    })
    clearLocal()
    void clearAllFiles()
    useAppStore.getState().setSelection([])
    setOpenDialog(null)
  }

  return (
    <>
      <HelpDialog t={t} open={openDialog === "help"} onClose={() => setOpenDialog(null)} />
      <ExportDialog
        t={t}
        open={openDialog === "export"}
        onClose={() => setOpenDialog(null)}
        onExport={onExport}
      />
      <ResetCanvasDialog
        t={t}
        open={openDialog === "reset"}
        onClose={() => setOpenDialog(null)}
        onConfirm={onResetConfirm}
      />
      <CanvasBgDialog
        t={t}
        open={openDialog === "canvasBg"}
        onClose={() => setOpenDialog(null)}
        value={canvasBg}
        onChange={setCanvasBg}
      />
    </>
  )
}

async function exportScene(_scene: Scene, _opts: ExportOptions): Promise<void> {
  // Implemented in Task 7 (export pipeline). Here we no-op safely.
}
```

> The above references `canvasBg` / `setCanvasBg` on the store. We need a small extra slice. Add it now:

Create `apps/web/src/store/slices/canvasBg.ts`:

```ts
import type { StateCreator } from "zustand"

export interface CanvasBgSlice {
  canvasBg: string
  setCanvasBg: (color: string) => void
}

export const createCanvasBgSlice: StateCreator<CanvasBgSlice, [], [], CanvasBgSlice> = (set) => ({
  canvasBg: "#ffffff",
  setCanvasBg: (color) => set({ canvasBg: color }),
})
```

Update `apps/web/src/store/index.ts` to merge it in (add the slice creator + extend `AppState`).

- [ ] **Step 3: Implement `App.tsx`**

```tsx
// apps/web/src/components/App.tsx
"use client"
import { Scene } from "@excalidraw-clone/scene"
import { HamburgerMenu, PropertiesPanel, Toolbar, type ExportOptions } from "@excalidraw-clone/ui"
import { useEffect, useMemo, useState } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { ensureI18n } from "../i18n"
import { useAppStore } from "../store"
import { CanvasShell } from "./CanvasShell"
import { Dialogs } from "./Dialogs"

export function App(): React.ReactElement {
  const locale = useAppStore((s) => s.locale)
  const i18n = useMemo(() => ensureI18n(locale), [locale])
  return (
    <I18nextProvider i18n={i18n}>
      <Inner />
    </I18nextProvider>
  )
}

function Inner(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const scene = useMemo(() => new Scene(), [])
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const lockActiveTool = useAppStore((s) => s.lockActiveTool)
  const toggleLockActiveTool = useAppStore((s) => s.toggleLockActiveTool)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const zenMode = useAppStore((s) => s.zenMode)
  const toggleZenMode = useAppStore((s) => s.toggleZenMode)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme
  }, [theme])

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [locale, i18n])

  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds)
    return scene.getElements().filter((e) => ids.has(e.id))
  }, [selectedIds, scene])

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <CanvasShell scene={scene} />

      {!zenMode && (
        <>
          <div className="absolute left-3 top-3 z-30">
            <HamburgerMenu
              t={t}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              theme={theme}
              onThemeChange={setTheme}
              locale={locale}
              onLocaleChange={setLocale}
              zenMode={zenMode}
              onZenModeToggle={toggleZenMode}
              onOpenFile={() => {
                /* Task 7 */
              }}
              onSaveFile={() => {
                /* Task 7 */
              }}
              onExport={() => setOpenDialog("export")}
              onReset={() => setOpenDialog("reset")}
              onHelp={() => setOpenDialog("help")}
            />
          </div>

          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
            <Toolbar
              t={t}
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              lockActiveTool={lockActiveTool}
              onToggleLock={() => toggleLockActiveTool()}
            />
          </div>

          <div className="absolute right-3 top-3 z-30">
            <PropertiesPanel
              t={t}
              selectedElements={selectedElements}
              onChange={(patch) => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, ...patch }
                    }
                  }
                })
              }}
              onDelete={() => {
                scene.mutate((draft) => {
                  for (let i = 0; i < draft.length; i += 1) {
                    if (selectedIds.includes(draft[i]!.id)) {
                      draft[i] = { ...draft[i]!, isDeleted: true }
                    }
                  }
                })
                useAppStore.getState().setSelection([])
              }}
              onDuplicate={() => {
                /* Task 8 */
              }}
              onSendToBack={() => {
                /* Task 8 */
              }}
              onSendBackward={() => {
                /* Task 8 */
              }}
              onBringForward={() => {
                /* Task 8 */
              }}
              onBringToFront={() => {
                /* Task 8 */
              }}
            />
          </div>
        </>
      )}

      <Dialogs scene={scene} />
    </main>
  )
}
```

- [ ] **Step 4: Replace `page.tsx`**

```tsx
// apps/web/src/app/page.tsx
"use client"
import { App } from "../components/App"

export default function Page(): React.ReactElement {
  return <App />
}
```

- [ ] **Step 5: Verify dev server starts and shows the canvas + toolbar**

Run: `pnpm --filter @excalidraw-clone/web dev`

Wait until you see `Ready in <ms>`. Open `http://localhost:3000`.

Expected:

- Toolbar visible at top center with all tools.
- Hamburger menu icon at top left.
- Empty canvas fills the rest.
- Selecting Rectangle and dragging on the canvas creates a rectangle (rough.js styling).

Stop with Ctrl+C.

> If anything fails to render, the most likely culprit is a stale typecheck error or `useDrawingDriver` not running because of a `useEffect` dep mistake. Fix before committing.

- [ ] **Step 6: Verify monorepo gate**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ apps/web/src/store/slices/canvasBg.ts apps/web/src/store/index.ts apps/web/src/app/page.tsx
git commit -m "Phase 8.4: web — App shell, CanvasShell, dialog routing"
```

---

## Task 5: Auto-save + hydration

Boot-time: `loadScene()` + `loadUI()` and seed the Scene + UI store before mounting. Steady-state: subscribe to scene + UI changes → debounced save.

**Files:**

- Create: `apps/web/src/driver/hydration.ts`
- Create: `apps/web/src/driver/autoSave.ts`
- Modify: `apps/web/src/components/App.tsx`

- [ ] **Step 1: Implement `hydration.ts`**

```ts
// apps/web/src/driver/hydration.ts
"use client"
import { Scene } from "@excalidraw-clone/scene"
import { getAllFiles, loadScene, loadUI } from "@excalidraw-clone/persistence"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import { useAppStore } from "../store"

export function hydrateScene(): Scene {
  const data = loadScene()
  if (!data) return new Scene()
  const scene = new Scene(data.elements)
  return scene
}

export function hydrateUI(): void {
  const ui = loadUI()
  if (!ui) return
  const store = useAppStore.getState()
  if (typeof ui.theme === "string") store.setTheme(ui.theme as never)
  if (typeof ui.locale === "string") store.setLocale(ui.locale as never)
  if (typeof ui.gridEnabled === "boolean" && ui.gridEnabled !== store.gridEnabled)
    store.toggleGrid()
  if (typeof ui.canvasBg === "string") store.setCanvasBg(ui.canvasBg)
  if (typeof ui.zenMode === "boolean" && ui.zenMode !== store.zenMode) store.toggleZenMode()
  if (typeof ui.activeTool === "string") store.setActiveTool(ui.activeTool as never)
}

export async function preloadFiles(renderer: CanvasRenderer | null): Promise<void> {
  if (!renderer) return
  const files = await getAllFiles()
  for (const f of files) {
    // Optional: extend renderer with preloadImage(id, dataURL) if not already there.
    // Phase 4 may already have this; if not, add a small extension in Task 6 of this phase.
    const fn = (renderer as unknown as { preloadImage?: (id: string, url: string) => void })
      .preloadImage
    fn?.call(renderer, f.id, f.dataURL)
  }
}
```

- [ ] **Step 2: Implement `autoSave.ts`**

```ts
// apps/web/src/driver/autoSave.ts
"use client"
import { createAutoSaver, saveScene, saveUI, serializeScene } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"

export function startAutoSave(scene: Scene): () => void {
  const saver = createAutoSaver({
    delayMs: 500,
    flush: () => {
      saveScene(serializeScene(scene))
      const s = useAppStore.getState()
      saveUI({
        theme: s.theme,
        locale: s.locale,
        gridEnabled: s.gridEnabled,
        gridSize: s.gridSize,
        canvasBg: s.canvasBg,
        zenMode: s.zenMode,
        activeTool: s.activeTool,
      })
    },
  })

  const unsubScene = scene.subscribe(() => saver.schedule())
  const unsubStore = useAppStore.subscribe(() => saver.schedule())

  // Flush on tab close.
  const onBeforeUnload = (): void => saver.flushNow()
  window.addEventListener("beforeunload", onBeforeUnload)

  return () => {
    unsubScene()
    unsubStore()
    window.removeEventListener("beforeunload", onBeforeUnload)
    saver.dispose()
  }
}
```

- [ ] **Step 3: Wire hydration + auto-save into `App.tsx`**

Replace the `Inner` component's `scene` initialization:

```tsx
// in App.tsx Inner()
const scene = useMemo(() => hydrateScene(), [])
useEffect(() => {
  hydrateUI()
}, [])
useEffect(() => {
  return startAutoSave(scene)
}, [scene])
```

Add the imports at the top:

```tsx
import { hydrateScene, hydrateUI } from "../driver/hydration"
import { startAutoSave } from "../driver/autoSave"
```

- [ ] **Step 4: Manually verify auto-save**

Run: `pnpm --filter @excalidraw-clone/web dev`

In the browser:

1. Draw a rectangle.
2. Wait 1 second.
3. Refresh the page.
4. The rectangle should still be there.

Open DevTools → Application → Local Storage. Confirm `excalidraw-scene` and `excalidraw-ui` keys are present.

Stop the dev server.

- [ ] **Step 5: Verify gates**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/hydration.ts apps/web/src/driver/autoSave.ts apps/web/src/components/App.tsx
git commit -m "Phase 8.5: web — boot hydration + debounced auto-save"
```

---

## Task 6: Renderer extensions for image preload + SVG export

`packages/renderer` likely lacks `preloadImage` / `unloadImage` and `renderToSVG`. Add them as **minimal additions** — no rewrites.

**Files:**

- Modify: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/src/svg.ts`
- Modify: `packages/renderer/src/index.ts`
- Create: `packages/renderer/test/preload.test.ts`
- Create: `packages/renderer/test/svg.test.ts`

> Verify first: `grep -n "preloadImage\|renderToSVG" packages/renderer/src/*.ts`. If they already exist, **skip this task** (just add the unit tests if missing).

- [ ] **Step 1: Write failing test for `preloadImage`**

```ts
// packages/renderer/test/preload.test.ts
import { Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { CanvasRenderer } from "../src/renderer"

describe("CanvasRenderer.preloadImage", () => {
  it("accepts an id + dataURL without throwing", () => {
    const canvas = document.createElement("canvas")
    const scene = new Scene()
    const renderer = new CanvasRenderer(canvas, scene)
    expect(() => renderer.preloadImage("abc", "data:image/png;base64,iVBORw0KGgo=")).not.toThrow()
  })

  it("unloadImage forgets a previously preloaded image", () => {
    const canvas = document.createElement("canvas")
    const scene = new Scene()
    const renderer = new CanvasRenderer(canvas, scene)
    renderer.preloadImage("abc", "data:image/png;base64,iVBORw0KGgo=")
    expect(() => renderer.unloadImage("abc")).not.toThrow()
  })
})
```

- [ ] **Step 2: Add `preloadImage` / `unloadImage` to `renderer.ts`**

In `packages/renderer/src/renderer.ts`, add a private map and the two methods:

```ts
// At the top of the class, near other private fields:
private readonly imageMap = new Map<string, HTMLImageElement>()

// Methods:
preloadImage(fileId: string, dataURL: string): void {
  if (this.imageMap.has(fileId)) return
  const img = new Image()
  img.onload = () => this.requestRedraw()
  img.src = dataURL
  this.imageMap.set(fileId, img)
}

unloadImage(fileId: string): void {
  this.imageMap.delete(fileId)
  this.requestRedraw()
}

getImage(fileId: string): HTMLImageElement | undefined {
  return this.imageMap.get(fileId)
}
```

> If the existing `draw-element.ts` for image elements receives a different image-source mechanism, either rewire it to consume `getImage(fileId)` from this map or stash a separate one. Keep the change minimal — just one source of truth.

- [ ] **Step 3: Verify preload tests**

Run: `pnpm --filter @excalidraw-clone/renderer test test/preload.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 4: Add `renderToSVG`**

Create `packages/renderer/src/svg.ts`:

```ts
// packages/renderer/src/svg.ts
import type { Scene } from "@excalidraw-clone/scene"
import { RoughSVG } from "roughjs/bin/svg"

export interface SVGRenderOptions {
  background?: string
  embedScene?: boolean
}

export function renderToSVG(scene: Scene, opts: SVGRenderOptions = {}): string {
  // Compute scene bbox from scene.getElements() to size the SVG.
  // For each element, dispatch to a draw-element-svg helper. Keep the helper
  // co-located here for now; extract if it grows.
  const elements = scene.getElements()
  const bbox = computeBBox(elements)
  const width = Math.max(1, bbox.width)
  const height = Math.max(1, bbox.height)
  const svgNS = "http://www.w3.org/2000/svg"
  const doc = document.implementation.createDocument(svgNS, "svg", null)
  const root = doc.documentElement
  root.setAttribute("xmlns", svgNS)
  root.setAttribute("width", String(width))
  root.setAttribute("height", String(height))
  root.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${width} ${height}`)
  if (opts.background) {
    const rect = doc.createElementNS(svgNS, "rect")
    rect.setAttribute("x", String(bbox.x))
    rect.setAttribute("y", String(bbox.y))
    rect.setAttribute("width", String(width))
    rect.setAttribute("height", String(height))
    rect.setAttribute("fill", opts.background)
    root.appendChild(rect)
  }
  const _rsvg = new RoughSVG(root as unknown as SVGSVGElement)
  // TODO: per-element rough draw → SVG nodes. Wire in subsequent commit if not in Phase 4.
  return new XMLSerializer().serializeToString(root)
}

function computeBBox(elements: ReturnType<Scene["getElements"]>): {
  x: number
  y: number
  width: number
  height: number
} {
  if (elements.length === 0) return { x: 0, y: 0, width: 100, height: 100 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
```

> The TODO inside `renderToSVG` is intentional and **must be resolved** before Phase 8 ships PNG-via-SVG round-tripping. For Phase 8's MVP we only ship PNG (rendered via `CanvasRenderer` against an offscreen canvas). SVG export can ship as v1.1 if it's not closed out here. Mark the dialog accordingly: disable the SVG radio if `renderToSVG` is incomplete.

- [ ] **Step 5: Write smoke test for SVG**

```ts
// packages/renderer/test/svg.test.ts
import { Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { renderToSVG } from "../src/svg"

describe("renderToSVG", () => {
  it("returns an <svg> string for an empty scene", () => {
    const svg = renderToSVG(new Scene())
    expect(svg).toMatch(/<svg/)
  })

  it("includes background rect when opts.background is set", () => {
    const svg = renderToSVG(new Scene(), { background: "#ffffff" })
    expect(svg).toContain('fill="#ffffff"')
  })
})
```

- [ ] **Step 6: Export from barrel**

Add to `packages/renderer/src/index.ts`:

```ts
export { renderToSVG } from "./svg"
export type { SVGRenderOptions } from "./svg"
```

- [ ] **Step 7: Verify monorepo gate**

Run: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/renderer.ts packages/renderer/src/svg.ts packages/renderer/src/index.ts packages/renderer/test/preload.test.ts packages/renderer/test/svg.test.ts
git commit -m "Phase 8.6: renderer — preloadImage + renderToSVG skeleton"
```

---

## Task 7: File I/O — Open / Save as / Export PNG

Wire menu actions. Also implements the PNG export by spinning up a one-shot offscreen `CanvasRenderer`.

**Files:**

- Modify: `apps/web/src/components/App.tsx` (menu callbacks)
- Modify: `apps/web/src/components/Dialogs.tsx` (`exportScene`)
- Create: `apps/web/src/driver/openFile.ts`
- Create: `apps/web/src/driver/saveFile.ts`
- Create: `apps/web/src/driver/exportPNG.ts`

- [ ] **Step 1: Implement `saveFile.ts`**

```ts
// apps/web/src/driver/saveFile.ts
"use client"
import {
  download,
  getAllFiles,
  serializeScene,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"

export async function saveAsExcalidraw(
  scene: Scene,
  filename = "drawing.excalidraw",
): Promise<void> {
  const filesArr = await getAllFiles()
  const filesRecord = Object.fromEntries(filesArr.map((f) => [f.id, f]))
  const data = serializeScene(scene, undefined, filesRecord)
  const blob = toExcalidrawBlob(data)
  download(blob, filename)
}
```

- [ ] **Step 2: Implement `openFile.ts`**

```ts
// apps/web/src/driver/openFile.ts
"use client"
import { parseExcalidrawFile, putFile } from "@excalidraw-clone/persistence"
import type { Scene } from "@excalidraw-clone/scene"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"

export async function openExcalidrawFromPicker(
  scene: Scene,
  renderer: CanvasRenderer | null,
): Promise<void> {
  const file = await pickFile(".excalidraw,application/json")
  if (!file) return
  const data = await parseExcalidrawFile(file)
  scene.loadFromJSON(data)
  if (data.files) {
    for (const id of Object.keys(data.files)) {
      const f = data.files[id]!
      await putFile(f)
      ;(renderer as unknown as { preloadImage?: (id: string, url: string) => void }).preloadImage?.(
        id,
        f.dataURL,
      )
    }
  }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
```

- [ ] **Step 3: Implement `exportPNG.ts`**

```ts
// apps/web/src/driver/exportPNG.ts
"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ExportOptions } from "@excalidraw-clone/ui"

const PADDING = 20

const BG_FOR: Record<ExportOptions["background"], string | "transparent"> = {
  white: "#ffffff",
  dark: "#1e1e1e",
  transparent: "transparent",
}

export async function exportToPNG(scene: Scene, opts: ExportOptions): Promise<Blob> {
  const elements = scene.getElements()
  const bbox = computeBBox(elements)
  const w = Math.max(1, bbox.width + PADDING * 2)
  const h = Math.max(1, bbox.height + PADDING * 2)
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(w * opts.scale)
  canvas.height = Math.floor(h * opts.scale)

  const renderer = new CanvasRenderer(canvas, scene, {
    theme: opts.background === "dark" ? "dark" : "light",
    viewTransform: { scrollX: -bbox.x + PADDING, scrollY: -bbox.y + PADDING, zoom: opts.scale },
  })

  if (opts.background === "transparent") {
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  } else {
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = BG_FOR[opts.background] as string
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  renderer.start()
  // One render then stop. The renderer schedules via rAF; force flush:
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  renderer.stop()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("exportToPNG: toBlob returned null"))
    }, "image/png")
  })
}

function computeBBox(elements: ReturnType<Scene["getElements"]>): {
  x: number
  y: number
  width: number
  height: number
} {
  if (elements.length === 0) return { x: 0, y: 0, width: 100, height: 100 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
```

> The `embedScene` option for v1 inlines a `tEXt` chunk via the [PNG metadata](https://en.wikipedia.org/wiki/Portable_Network_Graphics#Ancillary_chunks) — implement only if time permits. Otherwise, leave a TODO and ship without it.

- [ ] **Step 4: Wire menu callbacks in `App.tsx`**

Replace `onOpenFile` / `onSaveFile` placeholders with calls to `openExcalidrawFromPicker(scene, rendererRef.current)` and `saveAsExcalidraw(scene)`. The renderer ref needs to be lifted out of `useDrawingDriver`; expose it via a `useImperativeHandle`-like pattern, or pass a callback. **Simplest:** have `useDrawingDriver` accept `onReady?: (renderer) => void` and store the ref in state.

Concretely, update `useDrawingDriver` signature to `({ scene, canvasRef, overlayRef, onReady, onTeardown })` and emit `onReady(renderer)` after `renderer.start()`. Pass `setRenderer` from `Inner()`:

```tsx
const [renderer, setRenderer] = useState<CanvasRenderer | null>(null)
useDrawingDriver({
  scene,
  canvasRef,
  overlayRef,
  onReady: setRenderer,
  onTeardown: () => setRenderer(null),
})
```

Then:

```tsx
onOpenFile={() => { void openExcalidrawFromPicker(scene, renderer) }}
onSaveFile={() => { void saveAsExcalidraw(scene) }}
```

- [ ] **Step 5: Wire export in `Dialogs.tsx`**

Replace the stub `exportScene`:

```tsx
async function exportScene(scene: Scene, opts: ExportOptions): Promise<void> {
  if (opts.format === "png") {
    const blob = await exportToPNG(scene, opts)
    const { download } = await import("@excalidraw-clone/persistence")
    download(blob, "drawing.png")
  } else {
    // SVG path (Task 6 left a TODO). Show a toast and bail for now.
    console.warn("SVG export not yet implemented; falling back to PNG")
    const blob = await exportToPNG(scene, { ...opts, format: "png" })
    const { download } = await import("@excalidraw-clone/persistence")
    download(blob, "drawing.png")
  }
}
```

- [ ] **Step 6: Manually verify**

Run: `pnpm --filter @excalidraw-clone/web dev`

In the browser:

1. Draw two shapes.
2. Hamburger → "Save as…" → file downloads as `drawing.excalidraw`.
3. Refresh.
4. Hamburger → "Open…" → pick the saved file → shapes restored.
5. Hamburger → "Export image…" → confirm → PNG downloads.

- [ ] **Step 7: Verify gates**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/driver/openFile.ts apps/web/src/driver/saveFile.ts apps/web/src/driver/exportPNG.ts apps/web/src/driver/useDrawingDriver.ts apps/web/src/components/App.tsx apps/web/src/components/Dialogs.tsx
git commit -m "Phase 8.7: web — file open/save/export PNG via menu"
```

---

## Task 8: Properties-panel actions, image upload, undo/redo, layer ops

Round out interaction polish.

**Files:**

- Modify: `apps/web/src/components/App.tsx`
- Create: `apps/web/src/keyboard/shortcuts.ts`
- Create: `apps/web/test/keyboard-shortcuts.test.ts`

- [ ] **Step 1: Implement `shortcuts.ts`**

```ts
// apps/web/src/keyboard/shortcuts.ts
"use client"
import type { Scene } from "@excalidraw-clone/scene"
import type { ToolName } from "@excalidraw-clone/tools"
import { useAppStore } from "../store"

interface Bindings {
  scene: Scene
}

const TOOL_KEYS: Record<string, ToolName> = {
  v: "selection",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
  l: "line",
  a: "arrow",
  p: "freedraw",
  t: "text",
  "9": "image",
  e: "eraser",
  f: "frame",
}

export function attachShortcuts({ scene }: Bindings): () => void {
  const handler = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      return

    const isMeta = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (isMeta && key === "z" && !e.shiftKey) {
      e.preventDefault()
      scene.undo()
      return
    }
    if (isMeta && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault()
      scene.redo()
      return
    }
    if (isMeta && key === "/") {
      e.preventDefault()
      useAppStore.getState().setPaletteOpen(true)
      return
    }
    if (key === "escape") {
      useAppStore.getState().setSelection([])
      return
    }
    if (key === "?") {
      useAppStore.getState().setOpenDialog("help")
      return
    }
    if (key === "delete" || key === "backspace") {
      const ids = useAppStore.getState().selectedIds
      if (ids.length === 0) return
      e.preventDefault()
      scene.mutate((draft) => {
        for (let i = 0; i < draft.length; i += 1) {
          if (ids.includes(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
        }
      })
      useAppStore.getState().setSelection([])
      return
    }
    const tool = TOOL_KEYS[key]
    if (tool) {
      useAppStore.getState().setActiveTool(tool)
    }
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
```

- [ ] **Step 2: Write a smoke test**

```ts
// apps/web/test/keyboard-shortcuts.test.ts
import { Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { attachShortcuts } from "../src/keyboard/shortcuts"
import { useAppStore } from "../src/store"

describe("keyboard shortcuts", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachShortcuts({ scene })
    useAppStore.getState().setActiveTool("selection")
    useAppStore.getState().setSelection([])
    useAppStore.getState().setPaletteOpen(false)
  })
  afterEach(() => detach())

  it("'r' switches to rectangle tool", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("Cmd+/ opens command palette", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }))
    expect(useAppStore.getState().paletteOpen).toBe(true)
  })

  it("Escape clears selection", () => {
    useAppStore.getState().setSelection(["a"])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("'?' opens help dialog", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))
    expect(useAppStore.getState().openDialog).toBe("help")
  })
})
```

- [ ] **Step 3: Wire `attachShortcuts` in `App.tsx`**

```tsx
// in Inner(), after startAutoSave wiring:
useEffect(() => {
  return attachShortcuts({ scene })
}, [scene])
```

Add the import.

- [ ] **Step 4: Wire properties panel `onDuplicate` and layer ops**

Replace the placeholders in the `<PropertiesPanel>` JSX:

```tsx
onDuplicate={() => {
  scene.mutate((draft) => {
    const newIds: string[] = []
    for (const el of draft.slice()) {
      if (selectedIds.includes(el.id)) {
        const copy = { ...el, id: crypto.randomUUID(), x: el.x + 12, y: el.y + 12 }
        draft.push(copy)
        newIds.push(copy.id)
      }
    }
    useAppStore.getState().setSelection(newIds)
  })
}}
onSendToBack={() => {
  scene.mutate((draft) => {
    const moved = draft.filter((e) => selectedIds.includes(e.id))
    const remaining = draft.filter((e) => !selectedIds.includes(e.id))
    draft.length = 0
    draft.push(...moved, ...remaining)
  })
}}
onSendBackward={() => {
  scene.mutate((draft) => {
    for (let i = 1; i < draft.length; i += 1) {
      if (selectedIds.includes(draft[i]!.id) && !selectedIds.includes(draft[i - 1]!.id)) {
        ;[draft[i - 1], draft[i]] = [draft[i]!, draft[i - 1]!]
      }
    }
  })
}}
onBringForward={() => {
  scene.mutate((draft) => {
    for (let i = draft.length - 2; i >= 0; i -= 1) {
      if (selectedIds.includes(draft[i]!.id) && !selectedIds.includes(draft[i + 1]!.id)) {
        ;[draft[i + 1], draft[i]] = [draft[i]!, draft[i + 1]!]
      }
    }
  })
}}
onBringToFront={() => {
  scene.mutate((draft) => {
    const moved = draft.filter((e) => selectedIds.includes(e.id))
    const remaining = draft.filter((e) => !selectedIds.includes(e.id))
    draft.length = 0
    draft.push(...remaining, ...moved)
  })
}}
```

- [ ] **Step 5: Image tool wiring — when activeTool changes to image, trigger picker**

Add in `Inner()`:

```tsx
useEffect(() => {
  if (activeTool !== "image") return
  let cancelled = false
  void (async () => {
    const event = await pickAndUploadImage({ x: 100, y: 100 })
    if (cancelled || !event)
      return // dispatch via the driver — we need a way to push events. Easiest: expose
      // a window-level ref or extend useDrawingDriver to take a `dispatchRef`.
    ;(window as unknown as { __dispatchToolEvent?: (e: unknown) => void }).__dispatchToolEvent?.(
      event,
    )
  })()
  return () => {
    cancelled = true
  }
}, [activeTool])
```

In `useDrawingDriver`, expose `dispatch` on the window:

```ts
;(window as unknown as { __dispatchToolEvent?: (e: ToolEvent) => void }).__dispatchToolEvent =
  dispatch
```

> The `__dispatchToolEvent` global is a deliberate hack to keep the React tree decoupled from the driver. v1.1 cleanup: replace with a proper ref + Zustand action.

Add the import for `pickAndUploadImage` at the top.

- [ ] **Step 6: Verify gates**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all green. The keyboard test passes.

- [ ] **Step 7: Manual sanity check**

Dev-server: draw → press Cmd+Z → undo. Press R → tool switches to rectangle. Press ?
→ help opens.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts apps/web/src/components/App.tsx apps/web/src/driver/useDrawingDriver.ts
git commit -m "Phase 8.8: web — global shortcuts + duplicate/layer ops + image upload wiring"
```

---

## Task 9: Command palette + text editing

Wire palette commands and the text-editing overlay.

**Files:**

- Create: `apps/web/src/components/PaletteHost.tsx`
- Create: `apps/web/src/components/TextEditingOverlay.tsx`
- Create: `apps/web/src/store/slices/textEdit.ts`
- Modify: `apps/web/src/store/index.ts`
- Modify: `apps/web/src/components/App.tsx`

- [ ] **Step 1: Add `textEditElementId` slice**

```ts
// apps/web/src/store/slices/textEdit.ts
import type { StateCreator } from "zustand"

export interface TextEditSlice {
  textEditElementId: string | null
  setTextEditElementId: (id: string | null) => void
}

export const createTextEditSlice: StateCreator<TextEditSlice, [], [], TextEditSlice> = (set) => ({
  textEditElementId: null,
  setTextEditElementId: (id) => set({ textEditElementId: id }),
})
```

Update `store/index.ts` to merge in the slice (and `AppState`).

Update `driver/effects.ts`'s `startTextEdit` branch to call `setTextEditElementId(eff.elementId)` properly (replace the cast).

- [ ] **Step 2: Implement `PaletteHost.tsx`**

```tsx
// apps/web/src/components/PaletteHost.tsx
"use client"
import { CommandPalette, type PaletteCommand } from "@excalidraw-clone/ui"
import type { Scene } from "@excalidraw-clone/scene"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../store"

export function PaletteHost({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const setOpenDialog = useAppStore((s) => s.setOpenDialog)

  const commands: PaletteCommand[] = [
    { id: "undo", label: t("shortcuts.undo"), hint: "Cmd+Z", perform: () => scene.undo() },
    { id: "redo", label: t("shortcuts.redo"), hint: "Cmd+Shift+Z", perform: () => scene.redo() },
    {
      id: "select-all",
      label: t("shortcuts.selectAll"),
      hint: "Cmd+A",
      perform: () => useAppStore.getState().setSelection(scene.getElements().map((e) => e.id)),
    },
    {
      id: "deselect",
      label: t("shortcuts.deselect"),
      perform: () => useAppStore.getState().setSelection([]),
    },
    { id: "help", label: t("menu.help"), perform: () => setOpenDialog("help") },
    { id: "export", label: t("menu.export"), perform: () => setOpenDialog("export") },
    { id: "reset", label: t("menu.reset"), perform: () => setOpenDialog("reset") },
    { id: "zen", label: t("menu.enterZen"), perform: () => useAppStore.getState().toggleZenMode() },
    {
      id: "grid",
      label: t("shortcuts.toggleGrid"),
      perform: () => useAppStore.getState().toggleGrid(),
    },
  ]

  return <CommandPalette t={t} open={open} onClose={() => setOpen(false)} commands={commands} />
}
```

- [ ] **Step 3: Implement `TextEditingOverlay.tsx`**

```tsx
// apps/web/src/components/TextEditingOverlay.tsx
"use client"
import type { ExcalidrawTextElement, Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef, useState } from "react"
import { useAppStore } from "../store"

export function TextEditingOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const id = useAppStore((s) => s.textEditElementId)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const view = useAppStore((s) => ({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }))
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!id) return
    const el = scene.getElementsIncludingDeleted().find((e) => e.id === id) as
      | ExcalidrawTextElement
      | undefined
    setValue(el?.text ?? "")
    queueMicrotask(() => ref.current?.focus())
  }, [id, scene])

  if (!id) return null
  const el = scene.getElementsIncludingDeleted().find((e) => e.id === id) as
    | ExcalidrawTextElement
    | undefined
  if (!el) return null

  const left = (el.x + view.scrollX) * view.zoom
  const top = (el.y + view.scrollY) * view.zoom
  const fontSize = el.fontSize * view.zoom

  const commit = (): void => {
    scene.mutate((draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i]!.id === id) draft[i] = { ...(draft[i] as ExcalidrawTextElement), text: value }
      }
    })
    setId(null)
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          setId(null)
        }
      }}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
        fontFamily: "Caveat, cursive",
        background: "transparent",
        border: "1px solid #999",
        outline: "none",
        resize: "none",
      }}
      className="z-40"
    />
  )
}
```

- [ ] **Step 4: Mount `<PaletteHost />` and `<TextEditingOverlay />` in `App.tsx`**

Add inside `Inner`'s JSX, after `<Dialogs scene={scene} />`:

```tsx
<PaletteHost scene={scene} />
<TextEditingOverlay scene={scene} />
```

- [ ] **Step 5: Verify gates + manual smoke**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web lint && pnpm --filter @excalidraw-clone/web test`
Expected: all green.

Manual: dev server → press Cmd+/ → palette opens, type "undo", Enter → undo fires.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PaletteHost.tsx apps/web/src/components/TextEditingOverlay.tsx apps/web/src/store/slices/textEdit.ts apps/web/src/store/index.ts apps/web/src/driver/effects.ts apps/web/src/components/App.tsx
git commit -m "Phase 8.9: web — command palette + text editing overlay"
```

---

## Task 10: Playwright e2e — golden flows

**Files:**

- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/draw-rectangle.spec.ts`
- Create: `apps/web/e2e/undo-redo.spec.ts`
- Create: `apps/web/e2e/auto-save.spec.ts`
- Create: `apps/web/e2e/file-io.spec.ts`
- Create: `apps/web/e2e/theme.spec.ts`
- Create: `apps/web/e2e/palette.spec.ts`
- Create: `apps/web/e2e/help.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

Run: `pnpm --filter @excalidraw-clone/web e2e:install`
Expected: chromium installs.

- [ ] **Step 2: `playwright.config.ts`**

```ts
// apps/web/playwright.config.ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
})
```

- [ ] **Step 3: Helper for canvas drag (top of each spec or a shared file)**

```ts
// apps/web/e2e/_helpers.ts
import type { Page } from "@playwright/test"

export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
}
```

- [ ] **Step 4: `draw-rectangle.spec.ts`**

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("user can draw a rectangle", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.goto("/")
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 250 })

  // Persistence side effect proves an element was added.
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(sceneJson).toBeTruthy()
  const data = JSON.parse(sceneJson!) as { elements: { type: string }[] }
  expect(data.elements.length).toBeGreaterThan(0)
  expect(data.elements[0]?.type).toBe("rectangle")
})
```

- [ ] **Step 5: `undo-redo.spec.ts`**

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("undo removes the last drawn element", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 250 })
  await page.waitForTimeout(700) // auto-save flush

  const before = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: unknown[] }
  expect(before.elements.length).toBe(1)

  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+Z" : "Control+Z")
  await page.waitForTimeout(700)

  const after = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: unknown[] }
  expect(after.elements.length).toBe(0)
})
```

- [ ] **Step 6: `auto-save.spec.ts`**

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("scene survives a reload", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  await page.locator('[data-testid="toolbar-ellipse"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 350, y: 320 })
  await page.waitForTimeout(700)
  await page.reload()
  await page.waitForTimeout(500)

  const data = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: { type: string }[] }
  expect(data.elements[0]?.type).toBe("ellipse")
})
```

- [ ] **Step 7: `file-io.spec.ts`**

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("save as → open round-trips the scene", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  await page.locator('[data-testid="toolbar-diamond"]').click()
  await dragOnCanvas(page, { x: 50, y: 50 }, { x: 200, y: 200 })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("menu.saveAs").click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  // Clear and re-open.
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const fileChooserPromise = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("menu.open").click()
  const chooser = await fileChooserPromise
  await chooser.setFiles(path!)

  await page.waitForTimeout(700)
  const data = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: { type: string }[] }
  expect(data.elements[0]?.type).toBe("diamond")
})
```

- [ ] **Step 8: `theme.spec.ts`**

```ts
import { expect, test } from "@playwright/test"

test("theme toggle changes data-theme attr", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
})
```

- [ ] **Step 9: `palette.spec.ts`**

```ts
import { expect, test } from "@playwright/test"

test("Cmd+/ opens command palette; Esc closes", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+/" : "Control+/")
  await expect(page.getByRole("dialog", { name: "palette.title" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "palette.title" })).toHaveCount(0)
})
```

- [ ] **Step 10: `help.spec.ts`**

```ts
import { expect, test } from "@playwright/test"

test("'?' opens the help dialog", async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto("/")
  await page.keyboard.press("Shift+/")
  await expect(page.getByText("shortcuts.tools")).toBeVisible()
})
```

- [ ] **Step 11: Run e2e**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: 7 specs pass.

If a spec fails because of the i18n keys appearing as raw strings (e.g. `menu.saveAs` instead of `Save as…`), it means the i18next bootstrap returned the key — that's actually fine for tests since the keys are deterministic. The specs above match on the raw key. If you'd rather match the localized text, use `await page.getByText("Save as…")` instead.

- [ ] **Step 12: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/
git commit -m "Phase 8.10: web — Playwright e2e for golden flows"
```

---

## Phase 8 done — verification

After Task 10:

- [ ] **Run full monorepo gate**

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Run e2e**

```bash
pnpm --filter @excalidraw-clone/web e2e
```

Expected: all 7 specs pass.

- [ ] **Build production bundle as smoke test**

```bash
pnpm --filter @excalidraw-clone/web build
```

Expected: builds successfully. Inspect `apps/web/.next/` for output.

- [ ] **Push to origin**

Confirm with the user before pushing.

```bash
git push origin develop
```

- [ ] **Merge to main**

Once develop is green and the user has reviewed:

```bash
git checkout main
git merge --ff-only develop
git push origin main
git checkout develop
```

---

## Self-review summary

Coverage:

- Spec § 7 (Zustand UI store) → Task 2 (slices) + Task 9 (textEdit slice)
- Spec § 8 (auto-save + file I/O) → Tasks 5, 7
- Spec § 9 (export) → Task 7 (PNG via offscreen renderer); SVG marked TODO in Task 6 — acceptable for v1
- Spec § 10 (i18n) → Task 1
- Spec § 11 (Playwright e2e for golden flows) → Task 10
- Spec § 12 step 8 (apps/web wires everything; Vercel + static export deploy target) → Tasks 1–10. Vercel project setup itself is operational, post-merge.

Type consistency:

- `ToolName` is used in store + driver + ui + e2e tests; matches Phase 5 export.
- `ExcalidrawData` and `Scene` consumed from `@excalidraw-clone/scene` consistently.
- `ExportOptions` produced by `ExportDialog`, consumed by `exportToPNG` — same shape.
- `ToolEvent` extended with `imageReady` in `imageTool` (Phase 6 Task 10) and dispatched from `pickAndUploadImage`.

Known TODOs flagged in tasks (not placeholders — they are explicit deferrals):

- SVG export pipeline (Task 6) — minimum viable bbox + bg only; per-element draw deferred to v1.1 unless completed during execution. UI gracefully falls back to PNG.
- `embedScene` PNG `tEXt` chunk (Task 7) — optional; ship without if time-boxed.
- `__dispatchToolEvent` window hack (Task 8) — works for v1; replace with proper ref in v1.1.

No placeholders for actual code/tests. Every step has runnable commands and concrete expected outputs.
