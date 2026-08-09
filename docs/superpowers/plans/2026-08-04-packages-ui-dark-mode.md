# Dark Mode for packages/ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every component in `packages/ui/src/` onto the app's existing dark-mode mechanism by replacing 111 hardcoded light-mode Tailwind color-class occurrences across 14 component files with 15 semantic, theme-aware utility classes backed by CSS custom properties, so toggling dark mode repaints every panel, dialog, toolbar, and menu instead of only the app shell.

**Architecture:** `apps/web/src/app/globals.css` already defines `--bg-app`/`--bg-canvas`/`--fg-app`/`--shadow-app` under `:root` and `[data-theme="dark"]`, flipped by `App.tsx` setting `document.documentElement.dataset.theme`. Task 1 extends that same file with 12 new semantic `--color-*` custom properties (light + dark values) and registers them as 15 Tailwind v4 utility classes (`bg-panel`, `border-accent`, `text-danger`, etc.) via the `@utility` directive — see Task 1's implementation note for why `@utility` is used instead of `@theme` color keys. Tasks 2-12 then mechanically swap each hardcoded class in every `packages/ui` component for its semantic equivalent, in dependency order (shared primitives first, then their consumers), with zero behavior change. Task 13 runs the full gate and a manual light/dark/system smoke-check.

**Tech Stack:** TypeScript, React, Tailwind CSS v4, Vitest, Testing Library — matches the rest of the repo, no new dependencies.

## Global Constraints

- No `dark:` Tailwind variants introduced anywhere in this change — the spec deliberately chose the CSS-custom-property + `@theme`/`@utility` approach instead.
- Pure styling substitution only — no component logic, props, or interface changes in any of the 15 files.
- `text-white` (3 occurrences: `shared/IconButton.tsx:31`, `ExportDialog.tsx:99`, `ResetCanvasDialog.tsx:39`) and `bg-black/40` / `backdrop:bg-black/40` (2 occurrences: `CommandPalette.tsx:73`, `shared/Dialog.tsx:40`) stay literal, unchanged — they are the spec's two explicit non-tokenized exceptions.
- The two `testId: "bg-white"` / `testId: "bg-dark"` string literals in `ExportDialog.tsx` (lines 74-75) are test-id strings for the export-background-color picker, not CSS classes — never touch them.
- No new automated tests are introduced by this migration (per the spec's Testing section) — the existing Testing Library suite in `packages/ui` (115 tests across 15 test files) is the regression guard.
- Full gate (`npm run typecheck`, `npm test`, `npm run format:check`, `npm run lint` from repo root) must be green after every task; a final manual dev-server pass (light/dark/system) is the real correctness check, done once at the end in Task 13.
- Commit message prefixes follow this repo's convention: package name touched, e.g. `ui: add dark-mode tokens to globals.css`, `ui: dark mode for Toolbar and MoreShapesMenu`. Note `globals.css` lives in `apps/web`, so Task 1's commit prefix is `web:`.

## Token reference (from the approved design spec)

| Token                     | Light     | Dark                     | Utility class(es)                                       |
| ------------------------- | --------- | ------------------------ | ------------------------------------------------------- |
| `--color-panel-bg`        | `#ffffff` | `#2a2a2a`                | `bg-panel`                                              |
| `--color-panel-bg-subtle` | `#f9fafb` | `#242424`                | `bg-panel-subtle`                                       |
| `--color-panel-hover`     | `#f3f4f6` | `#3a3a3a`                | `bg-panel-hover` (used as `hover:bg-panel-hover`)       |
| `--color-panel-active`    | `#e5e7eb` | `#454545`                | `bg-panel-active`                                       |
| `--color-border`          | `#d1d5db` | `#4d4d4d`                | `border-panel`                                          |
| `--color-border-subtle`   | `#e5e7eb` | `#3a3a3a`                | `border-panel-subtle`                                   |
| `--color-text-muted`      | `#6b7280` | `#a3a3a3`                | `text-muted`                                            |
| `--color-accent`          | `#7c3aed` | `#8b5cf6`                | `bg-accent`, `border-accent`                            |
| `--color-accent-soft`     | `#ede9fe` | `rgb(139 92 246 / .18)`  | `bg-accent-soft`, `border-accent-soft` (see note below) |
| `--color-danger`          | `#dc2626` | `#f87171`                | `text-danger`, `bg-danger`                              |
| `--color-danger-soft`     | `#fef2f2` | `rgb(248 113 113 / .15)` | `bg-danger-soft`                                        |
| `--color-danger-border`   | `#fca5a5` | `rgb(248 113 113 / .4)`  | `border-danger`                                         |

**Flagged deviation (per spec instruction to flag rather than silently invent):** the design spec's Decisions table maps `border-violet-300` (`LayersPanel.tsx:69`, the grouped-item left border) to `--color-accent-soft`, but the spec's enumerated utility-class list only registers `bg-accent-soft` (no border-side utility). Task 1 therefore registers one utility beyond the spec's literal 14-name list: `border-accent-soft`, consuming the already-approved `--color-accent-soft` value as a `border-color`. This isn't a new color or a new mapping — it's the missing border-side accessor for a token the spec already approved, needed because that token is consumed by both a background (`bg-violet-100`/`bg-violet-500` → `bg-accent-soft`) and a border (`border-violet-300` → `border-accent-soft`) in the real code.

## Task decomposition

- Task 1 — Foundation: `apps/web/src/app/globals.css`
- Task 2: `packages/ui/src/shared/IconButton.tsx`, `packages/ui/src/shared/Dialog.tsx`
- Task 3: `packages/ui/src/Toolbar.tsx`, `packages/ui/src/MoreShapesMenu.tsx`
- Task 4: `packages/ui/src/CanvasBgDialog.tsx`, `packages/ui/src/ResetCanvasDialog.tsx`, `packages/ui/src/HelpDialog.tsx`
- Task 5: `packages/ui/src/ExportDialog.tsx`
- Task 6: `packages/ui/src/CommandPalette.tsx`
- Task 7: `packages/ui/src/ContextMenu.tsx`
- Task 8: `packages/ui/src/HamburgerMenu.tsx`
- Task 9: `packages/ui/src/LayersPanel.tsx`
- Task 10: `packages/ui/src/PagesTabBar.tsx`
- Task 11: `packages/ui/src/LibraryPanel.tsx`
- Task 12: `packages/ui/src/PropertiesPanel.tsx`
- Task 13 — Final verification: no file changes expected; full gate + manual smoke-check.

---

### Task 1: Foundation — dark-mode tokens and utility classes in `globals.css`

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Context:** This task adds the 12 semantic CSS custom properties (light + dark values) to the existing `:root` / `[data-theme="dark"]` blocks, and registers 15 Tailwind v4 utility classes that consume them. No component files change in this task — Tasks 2-12 are the ones that actually use these classes.

**Implementation note — why `@utility`, not bare `@theme` color keys:** Tailwind v4's `@theme` namespace generates a utility for **every** color-accepting property (`bg-*`, `text-*`, `border-*`, `ring-*`, etc.) from a single theme key, all sharing the _same_ resolved value. That works fine when a token is only ever consumed by one property (e.g. `text-muted`), or when two properties genuinely want the identical value (e.g. `bg-accent` and `border-accent` are both meant to be the same purple). It breaks down for two pairs in this migration: `bg-panel` needs `--color-panel-bg` (white/`#2a2a2a`) while `border-panel` needs the different `--color-border` (`#d1d5db`/`#4d4d4d`) — they can't both be produced from one `@theme` key named `panel`. Same problem for `bg-danger`/`text-danger` (`--color-danger`) vs. `border-danger` (the separate, lighter `--color-danger-border`). The fix is Tailwind v4's `@utility` directive: it declares a utility's exact CSS body by hand (still fully variant-aware — `hover:`, `focus:`, etc. all work automatically), so each of the 15 classes below explicitly references the correct custom property. The runtime behavior the spec wants is unaffected: these are still just CSS custom-property lookups, so every utility still repaints automatically the instant `[data-theme="dark"]` overrides the referenced variable — nothing about using `@utility` instead of `@theme` changes that.

- [ ] **Step 1: Add the 12 new custom properties to `:root`**

  Current (`apps/web/src/app/globals.css` lines 4-9):

  ```css
  :root {
    --bg-app: #fafafa;
    --bg-canvas: #ffffff;
    --fg-app: #1e1e1e;
    --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  ```

  New:

  ```css
  :root {
    --bg-app: #fafafa;
    --bg-canvas: #ffffff;
    --fg-app: #1e1e1e;
    --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.08);

    --color-panel-bg: #ffffff;
    --color-panel-bg-subtle: #f9fafb;
    --color-panel-hover: #f3f4f6;
    --color-panel-active: #e5e7eb;
    --color-border: #d1d5db;
    --color-border-subtle: #e5e7eb;
    --color-text-muted: #6b7280;
    --color-accent: #7c3aed;
    --color-accent-soft: #ede9fe;
    --color-danger: #dc2626;
    --color-danger-soft: #fef2f2;
    --color-danger-border: #fca5a5;
  }
  ```

- [ ] **Step 2: Add the 12 dark overrides to `[data-theme="dark"]`**

  Current (lines 11-16, after Step 1's edit these shift down by 12 lines but the text itself is unchanged going in):

  ```css
  [data-theme="dark"] {
    --bg-app: #121212;
    --bg-canvas: #1e1e1e;
    --fg-app: #ececec;
    --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
  ```

  New:

  ```css
  [data-theme="dark"] {
    --bg-app: #121212;
    --bg-canvas: #1e1e1e;
    --fg-app: #ececec;
    --shadow-app: 0 1px 3px rgba(0, 0, 0, 0.4);

    --color-panel-bg: #2a2a2a;
    --color-panel-bg-subtle: #242424;
    --color-panel-hover: #3a3a3a;
    --color-panel-active: #454545;
    --color-border: #4d4d4d;
    --color-border-subtle: #3a3a3a;
    --color-text-muted: #a3a3a3;
    --color-accent: #8b5cf6;
    --color-accent-soft: rgb(139 92 246 / 0.18);
    --color-danger: #f87171;
    --color-danger-soft: rgb(248 113 113 / 0.15);
    --color-danger-border: rgb(248 113 113 / 0.4);
  }
  ```

- [ ] **Step 3: Register the 15 utility classes**

  Insert this new block immediately after the `[data-theme="dark"]` block from Step 2, and before the existing `html, body { ... }` rule:

  ```css
  @utility bg-panel {
    background-color: var(--color-panel-bg);
  }

  @utility bg-panel-subtle {
    background-color: var(--color-panel-bg-subtle);
  }

  @utility bg-panel-hover {
    background-color: var(--color-panel-hover);
  }

  @utility bg-panel-active {
    background-color: var(--color-panel-active);
  }

  @utility border-panel {
    border-color: var(--color-border);
  }

  @utility border-panel-subtle {
    border-color: var(--color-border-subtle);
  }

  @utility text-muted {
    color: var(--color-text-muted);
  }

  @utility bg-accent {
    background-color: var(--color-accent);
  }

  @utility border-accent {
    border-color: var(--color-accent);
  }

  @utility bg-accent-soft {
    background-color: var(--color-accent-soft);
  }

  @utility border-accent-soft {
    border-color: var(--color-accent-soft);
  }

  @utility text-danger {
    color: var(--color-danger);
  }

  @utility bg-danger {
    background-color: var(--color-danger);
  }

  @utility bg-danger-soft {
    background-color: var(--color-danger-soft);
  }

  @utility border-danger {
    border-color: var(--color-danger-border);
  }
  ```

  `border-panel` and `border-panel-subtle` are deliberately not named bare `border` — Tailwind v4's unsuffixed `border` utility reads a separate `--default-border-color` theme key, not an arbitrary custom property, so a bare-`border` utility here would silently do nothing.

- [ ] **Step 4: Verify — no unit tests exist for CSS, so this task's "test cycle" is a build/compile check, not TDD**

  Run (from repo root): `npm run typecheck`
  Expected: PASS (no TypeScript surface changed, this just guards against an unrelated regression).

  Run (from `apps/web`): `npm run dev`
  Expected: the dev server starts and compiles with no Tailwind/PostCSS errors in the terminal output (watch for `@utility` or unknown-at-rule errors specifically, since that's the one syntax construct this task introduces that the rest of the codebase doesn't use yet). Open `http://localhost:3000` (or whatever port is printed) and confirm the page renders normally — no visual change is expected yet since no component consumes the new classes until Task 2. Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/app/globals.css
  git commit -m "web: add dark-mode tokens to globals.css"
  ```

---

### Task 2: `shared/IconButton.tsx` and `shared/Dialog.tsx`

**Files:**

- Modify: `packages/ui/src/shared/IconButton.tsx`
- Modify: `packages/ui/src/shared/Dialog.tsx`

**Context:** Fixed first because 6 of the other 13 components (`Toolbar.tsx`, `CanvasBgDialog.tsx`, `HelpDialog.tsx`, `ResetCanvasDialog.tsx`, `ExportDialog.tsx`, `MoreShapesMenu.tsx`) render through one or both of these, so fixing the shared pair de-risks that portion of the migration.

- [ ] **Step 1: Make the change**

  `packages/ui/src/shared/IconButton.tsx`, line 31 — current:

  ```tsx
  active ? "bg-violet-600 text-white" : "hover:bg-gray-100"
  ```

  New (`bg-violet-600` → `bg-accent`; `text-white` stays literal — it's one of the spec's two exceptions; `hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  active ? "bg-accent text-white" : "hover:bg-panel-hover"
  ```

  `packages/ui/src/shared/Dialog.tsx`, line 40 — no change. This line only contains `backdrop:bg-black/40`, which is the spec's other explicit exception (a translucent-black modal scrim, correct over both themes). Confirming it verbatim so it's clear it was checked, not missed:

  ```tsx
        className={`rounded-lg p-0 backdrop:bg-black/40 ${className ?? ""}`}
  ```

  Note: this file has no hardcoded panel-background class on the `<dialog>` element itself (it relies on the browser's native `<dialog>` background, which the spec's inventory doesn't flag as an occurrence to migrate — nothing to swap here, confirmed by grep). Line 43 (`border-b`) and line 50 below are the only other className strings in the file; `border-b` is a bare, colorless border-width utility and is out of scope (not in the spec's inventory).

  `packages/ui/src/shared/Dialog.tsx`, line 50 — current:

  ```tsx
  className = "rounded p-1 text-xl leading-none hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded p-1 text-xl leading-none hover:bg-panel-hover"
  ```

- [ ] **Step 2: Run the regression check**

  `IconButton` has no dedicated test file in `packages/ui/test/` (confirmed via directory listing — it's exercised indirectly through `Toolbar.test.tsx`, `MoreShapesMenu.test.tsx`, and others). `Dialog` has `packages/ui/test/Dialog.test.tsx`.

  Run (from `packages/ui`): `npx vitest run test/Dialog.test.tsx`
  Expected: PASS.

  Run (from `packages/ui`): `npx vitest run`
  Expected: PASS, full suite — this is the regression guard for `IconButton` since it has no direct test file, and doubles as a check for `Dialog`.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/shared/IconButton.tsx packages/ui/src/shared/Dialog.tsx
  git commit -m "ui: dark mode for shared IconButton and Dialog"
  ```

---

### Task 3: `Toolbar.tsx` and `MoreShapesMenu.tsx`

**Files:**

- Modify: `packages/ui/src/Toolbar.tsx`
- Modify: `packages/ui/src/MoreShapesMenu.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/Toolbar.tsx`, line 62 — current:

  ```tsx
      className={`flex items-center gap-1 rounded-lg bg-white p-1 shadow ${className ?? ""}`}
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
      className={`flex items-center gap-1 rounded-lg bg-panel p-1 shadow ${className ?? ""}`}
  ```

  `packages/ui/src/Toolbar.tsx`, line 75 — current:

  ```tsx
  <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />
  ```

  New (`bg-gray-200` → `bg-panel-active`, per the token table):

  ```tsx
  <span className="mx-1 h-6 w-px bg-panel-active" aria-hidden />
  ```

  `packages/ui/src/MoreShapesMenu.tsx`, line 49 — current:

  ```tsx
  className = "absolute left-0 top-11 z-50 flex gap-1 rounded-lg bg-white p-2 shadow-lg"
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
  className = "absolute left-0 top-11 z-50 flex gap-1 rounded-lg bg-panel p-2 shadow-lg"
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/Toolbar.test.tsx test/MoreShapesMenu.test.tsx`
  Expected: PASS, both files.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/Toolbar.tsx packages/ui/src/MoreShapesMenu.tsx
  git commit -m "ui: dark mode for Toolbar and MoreShapesMenu"
  ```

---

### Task 4: `CanvasBgDialog.tsx`, `ResetCanvasDialog.tsx`, `HelpDialog.tsx`

**Files:**

- Modify: `packages/ui/src/CanvasBgDialog.tsx`
- Modify: `packages/ui/src/ResetCanvasDialog.tsx`
- Modify: `packages/ui/src/HelpDialog.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/CanvasBgDialog.tsx`, line 43 — current:

  ```tsx
              className={`h-10 w-10 rounded border-2 ${value === c ? "border-violet-600" : "border-gray-300"}`}
  ```

  New (`border-violet-600` → `border-accent`; `border-gray-300` → `border-panel`):

  ```tsx
              className={`h-10 w-10 rounded border-2 ${value === c ? "border-accent" : "border-panel"}`}
  ```

  `packages/ui/src/ResetCanvasDialog.tsx`, line 27 — current:

  ```tsx
  <p className="mb-4 text-sm text-gray-700">{t("reset.body")}</p>
  ```

  New (`text-gray-700` → `text-muted`):

  ```tsx
  <p className="mb-4 text-sm text-muted">{t("reset.body")}</p>
  ```

  `packages/ui/src/ResetCanvasDialog.tsx`, line 32 — current:

  ```tsx
  className = "rounded border border-gray-300 px-3 py-1 text-sm"
  ```

  New (`border-gray-300` → `border-panel`):

  ```tsx
  className = "rounded border border-panel px-3 py-1 text-sm"
  ```

  `packages/ui/src/ResetCanvasDialog.tsx`, line 39 — current:

  ```tsx
  className = "rounded bg-red-600 px-3 py-1 text-sm text-white"
  ```

  New (`bg-red-600` → `bg-danger`; `text-white` stays literal):

  ```tsx
  className = "rounded bg-danger px-3 py-1 text-sm text-white"
  ```

  `packages/ui/src/HelpDialog.tsx`, line 95 — current:

  ```tsx
  <dt className="text-gray-700">{t(s.label)}</dt>
  ```

  New (`text-gray-700` → `text-muted`):

  ```tsx
  <dt className="text-muted">{t(s.label)}</dt>
  ```

  `packages/ui/src/HelpDialog.tsx`, line 97 — current:

  ```tsx
                <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">
  ```

  New (`border-gray-300` → `border-panel`; `bg-gray-50` → `bg-panel-subtle`):

  ```tsx
                <kbd className="rounded border border-panel bg-panel-subtle px-1.5 py-0.5 font-mono text-xs">
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/CanvasBgDialog.test.tsx test/ResetCanvasDialog.test.tsx test/HelpDialog.test.tsx`
  Expected: PASS, all three files.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/CanvasBgDialog.tsx packages/ui/src/ResetCanvasDialog.tsx packages/ui/src/HelpDialog.tsx
  git commit -m "ui: dark mode for CanvasBgDialog, ResetCanvasDialog, and HelpDialog"
  ```

---

### Task 5: `ExportDialog.tsx`

**Files:**

- Modify: `packages/ui/src/ExportDialog.tsx`

**Do not touch:** lines 74-75 (`testId: "bg-white"`, `testId: "bg-dark"`) — these are `data-testid` string literals for the export-background color picker's Toggle options, not Tailwind classes. They happen to contain the substrings `bg-white`/`bg-dark`, which is coincidental; leave them exactly as-is.

- [ ] **Step 1: Make the change**

  `packages/ui/src/ExportDialog.tsx`, line 92 — current:

  ```tsx
  className = "rounded border border-gray-300 px-3 py-1 text-sm"
  ```

  New (`border-gray-300` → `border-panel`):

  ```tsx
  className = "rounded border border-panel px-3 py-1 text-sm"
  ```

  `packages/ui/src/ExportDialog.tsx`, line 99 — current:

  ```tsx
  className = "rounded bg-violet-600 px-3 py-1 text-sm text-white"
  ```

  New (`bg-violet-600` → `bg-accent`; `text-white` stays literal):

  ```tsx
  className = "rounded bg-accent px-3 py-1 text-sm text-white"
  ```

  `packages/ui/src/ExportDialog.tsx`, line 118 — current:

  ```tsx
  <span className="text-sm font-medium text-gray-700">{label}</span>
  ```

  New (`text-gray-700` → `text-muted`):

  ```tsx
  <span className="text-sm font-medium text-muted">{label}</span>
  ```

  `packages/ui/src/ExportDialog.tsx`, line 142 — current:

  ```tsx
            className={`rounded border px-2 py-1 text-xs ${value === opt.value ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New (`border-violet-600 bg-violet-100` → `border-accent bg-accent-soft`; `border-gray-300` → `border-panel`):

  ```tsx
            className={`rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/ExportDialog.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/ExportDialog.tsx
  git commit -m "ui: dark mode for ExportDialog"
  ```

---

### Task 6: `CommandPalette.tsx`

**Files:**

- Modify: `packages/ui/src/CommandPalette.tsx`

**Do not touch:** line 73's `bg-black/40` — the modal-overlay scrim, one of the spec's two literal exceptions.

- [ ] **Step 1: Make the change**

  `packages/ui/src/CommandPalette.tsx`, line 73 — no change (confirmed, left literal):

  ```tsx
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-32 ${className ?? ""}`}
  ```

  `packages/ui/src/CommandPalette.tsx`, line 80 — current:

  ```tsx
  className = "w-[480px] rounded-lg bg-white shadow-xl"
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
  className = "w-[480px] rounded-lg bg-panel shadow-xl"
  ```

  `packages/ui/src/CommandPalette.tsx`, line 90 — current:

  ```tsx
  className = "w-full border-b border-gray-200 px-4 py-3 text-sm outline-none"
  ```

  New (`border-gray-200` → `border-panel-subtle`):

  ```tsx
  className = "w-full border-b border-panel-subtle px-4 py-3 text-sm outline-none"
  ```

  `packages/ui/src/CommandPalette.tsx`, line 94 — current:

  ```tsx
  <li className="px-4 py-2 text-sm text-gray-500">{t("palette.empty")}</li>
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
  <li className="px-4 py-2 text-sm text-muted">{t("palette.empty")}</li>
  ```

  `packages/ui/src/CommandPalette.tsx`, line 106 — current:

  ```tsx
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === highlight ? "bg-violet-100" : ""}`}
  ```

  New (`bg-violet-100` → `bg-accent-soft`):

  ```tsx
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === highlight ? "bg-accent-soft" : ""}`}
  ```

  `packages/ui/src/CommandPalette.tsx`, line 109 — current:

  ```tsx
  {
    c.hint && <kbd className="font-mono text-xs text-gray-500">{c.hint}</kbd>
  }
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
  {
    c.hint && <kbd className="font-mono text-xs text-muted">{c.hint}</kbd>
  }
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/CommandPalette.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/CommandPalette.tsx
  git commit -m "ui: dark mode for CommandPalette"
  ```

---

### Task 7: `ContextMenu.tsx`

**Files:**

- Modify: `packages/ui/src/ContextMenu.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/ContextMenu.tsx`, line 52 — current:

  ```tsx
  className = "z-50 min-w-[180px] rounded-lg bg-white py-1 shadow-xl"
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
  className = "z-50 min-w-[180px] rounded-lg bg-panel py-1 shadow-xl"
  ```

  `packages/ui/src/ContextMenu.tsx`, line 64 — current:

  ```tsx
  className =
    "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-violet-100"
  ```

  New (`hover:bg-violet-100` → `hover:bg-accent-soft`):

  ```tsx
  className =
    "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
  ```

  `packages/ui/src/ContextMenu.tsx`, line 67 — current:

  ```tsx
  {
    item.hint && <kbd className="font-mono text-xs text-gray-500">{item.hint}</kbd>
  }
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
  {
    item.hint && <kbd className="font-mono text-xs text-muted">{item.hint}</kbd>
  }
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/ContextMenu.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/ContextMenu.tsx
  git commit -m "ui: dark mode for ContextMenu"
  ```

---

### Task 8: `HamburgerMenu.tsx`

**Files:**

- Modify: `packages/ui/src/HamburgerMenu.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/HamburgerMenu.tsx`, line 50 — current:

  ```tsx
  className = "flex h-9 w-9 items-center justify-center rounded bg-white shadow hover:bg-gray-100"
  ```

  New (`bg-white` → `bg-panel`; `hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className =
    "flex h-9 w-9 items-center justify-center rounded bg-panel shadow hover:bg-panel-hover"
  ```

  `packages/ui/src/HamburgerMenu.tsx`, line 58 — current:

  ```tsx
  className = "absolute left-0 top-11 z-50 w-56 rounded-lg bg-white p-2 shadow-lg"
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
  className = "absolute left-0 top-11 z-50 w-56 rounded-lg bg-panel p-2 shadow-lg"
  ```

  `packages/ui/src/HamburgerMenu.tsx`, line 118 — current:

  ```tsx
        className={`block w-full rounded px-3 py-2 text-left text-sm ${variant === "danger" ? "text-red-600 hover:bg-red-50" : "hover:bg-gray-100"}`}
  ```

  New (`text-red-600 hover:bg-red-50` → `text-danger hover:bg-danger-soft`; `hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
        className={`block w-full rounded px-3 py-2 text-left text-sm ${variant === "danger" ? "text-danger hover:bg-danger-soft" : "hover:bg-panel-hover"}`}
  ```

  `packages/ui/src/HamburgerMenu.tsx`, line 126 — current:

  ```tsx
  return <div className="mt-2 px-3 py-1 text-xs font-medium text-gray-500">{children}</div>
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
  return <div className="mt-2 px-3 py-1 text-xs font-medium text-muted">{children}</div>
  ```

  `packages/ui/src/HamburgerMenu.tsx`, line 130 — current:

  ```tsx
  return <div className="my-1 h-px bg-gray-200" aria-hidden />
  ```

  New (`bg-gray-200` → `bg-panel-active`):

  ```tsx
  return <div className="my-1 h-px bg-panel-active" aria-hidden />
  ```

  `packages/ui/src/HamburgerMenu.tsx`, line 151 — current:

  ```tsx
            className={`flex-1 rounded border px-2 py-1 text-xs ${value === opt.value ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New (`border-violet-600 bg-violet-100` → `border-accent bg-accent-soft`; `border-gray-300` → `border-panel`):

  ```tsx
            className={`flex-1 rounded border px-2 py-1 text-xs ${value === opt.value ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/HamburgerMenu.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/HamburgerMenu.tsx
  git commit -m "ui: dark mode for HamburgerMenu"
  ```

---

### Task 9: `LayersPanel.tsx`

**Files:**

- Modify: `packages/ui/src/LayersPanel.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/LayersPanel.tsx`, line 38 — current:

  ```tsx
      className={`fixed left-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
      className={`fixed left-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-panel shadow-lg transition-all ${
  ```

  `packages/ui/src/LayersPanel.tsx`, line 68 — current:

  ```tsx
  selected ? "bg-violet-100" : "hover:bg-gray-50"
  ```

  New (`bg-violet-100` → `bg-accent-soft`; `hover:bg-gray-50` → `hover:bg-panel-subtle`):

  ```tsx
  selected ? "bg-accent-soft" : "hover:bg-panel-subtle"
  ```

  `packages/ui/src/LayersPanel.tsx`, line 69 — current:

  ```tsx
                  } ${element.groupIds.length > 0 ? "border-l-2 border-violet-300 pl-1" : ""}`}
  ```

  New (`border-violet-300` → `border-accent-soft`, per the flagged deviation in the Token reference section above):

  ```tsx
                  } ${element.groupIds.length > 0 ? "border-l-2 border-accent-soft pl-1" : ""}`}
  ```

  `packages/ui/src/LayersPanel.tsx`, lines 97, 107, 117, 127 — current (identical on all four lines, one per z-order button: send-to-back, send-backward, bring-forward, bring-to-front):

  ```tsx
  className = "rounded px-0.5 hover:bg-gray-100"
  ```

  New on all four lines (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded px-0.5 hover:bg-panel-hover"
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/LayersPanel.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/LayersPanel.tsx
  git commit -m "ui: dark mode for LayersPanel"
  ```

---

### Task 10: `PagesTabBar.tsx`

**Files:**

- Modify: `packages/ui/src/PagesTabBar.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/PagesTabBar.tsx`, line 99 — current:

  ```tsx
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-1 overflow-x-auto bg-white px-2 py-1 shadow-lg ${className ?? ""}`}
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-1 overflow-x-auto bg-panel px-2 py-1 shadow-lg ${className ?? ""}`}
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 105 — current:

  ```tsx
  className = "pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-violet-500"
  ```

  New (`bg-violet-500` → `bg-accent-soft`, per the token table):

  ```tsx
  className = "pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-accent-soft"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 121 — current:

  ```tsx
  active ? "bg-violet-100" : "hover:bg-gray-50"
  ```

  New (`bg-violet-100` → `bg-accent-soft`; `hover:bg-gray-50` → `hover:bg-panel-subtle`):

  ```tsx
  active ? "bg-accent-soft" : "hover:bg-panel-subtle"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 140 — current:

  ```tsx
  className = "h-[33px] w-[46px] shrink-0 rounded-sm border border-gray-200 object-contain"
  ```

  New (`border-gray-200` → `border-panel-subtle`):

  ```tsx
  className = "h-[33px] w-[46px] shrink-0 rounded-sm border border-panel-subtle object-contain"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 146 — current:

  ```tsx
  className = "h-[33px] w-[46px] shrink-0 rounded-sm border border-gray-200 bg-gray-50"
  ```

  New (`border-gray-200` → `border-panel-subtle`; `bg-gray-50` → `bg-panel-subtle`):

  ```tsx
  className = "h-[33px] w-[46px] shrink-0 rounded-sm border border-panel-subtle bg-panel-subtle"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 161 — current:

  ```tsx
  className = "w-24 rounded border border-gray-300 px-1"
  ```

  New (`border-gray-300` → `border-panel`):

  ```tsx
  className = "w-24 rounded border border-panel px-1"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 192 — current:

  ```tsx
  className = "rounded px-0.5 hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded px-0.5 hover:bg-panel-hover"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 204 — current:

  ```tsx
  className = "rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded px-0.5 hover:bg-panel-hover disabled:opacity-30"
  ```

  `packages/ui/src/PagesTabBar.tsx`, line 218 — current:

  ```tsx
  className = "shrink-0 rounded px-2 py-1 text-xs hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "shrink-0 rounded px-2 py-1 text-xs hover:bg-panel-hover"
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/PagesTabBar.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/PagesTabBar.tsx
  git commit -m "ui: dark mode for PagesTabBar"
  ```

---

### Task 11: `LibraryPanel.tsx`

**Files:**

- Modify: `packages/ui/src/LibraryPanel.tsx`

- [ ] **Step 1: Make the change**

  `packages/ui/src/LibraryPanel.tsx`, line 47 — current:

  ```tsx
  className =
    "flex h-20 w-full items-center justify-center rounded border bg-gray-50 p-1 hover:border-violet-500"
  ```

  New (`bg-gray-50` → `bg-panel-subtle`; `hover:border-violet-500` → `hover:border-accent`):

  ```tsx
  className =
    "flex h-20 w-full items-center justify-center rounded border bg-panel-subtle p-1 hover:border-accent"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 85 — current:

  ```tsx
  className = "absolute right-0 top-5 z-10 rounded bg-white p-1 text-xs shadow"
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
  className = "absolute right-0 top-5 z-10 rounded bg-panel p-1 text-xs shadow"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 91 — current:

  ```tsx
  className = "block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "block w-full rounded px-2 py-1 text-left hover:bg-panel-hover"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 102 — current:

  ```tsx
  className = "block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50"
  ```

  New (`text-red-600 hover:bg-red-50` → `text-danger hover:bg-danger-soft`):

  ```tsx
  className = "block w-full rounded px-2 py-1 text-left text-danger hover:bg-danger-soft"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 150 — current:

  ```tsx
      className={`fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-white shadow-lg transition-all ${
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
      className={`fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] flex-col bg-panel shadow-lg transition-all ${
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 174 — current:

  ```tsx
  className = "rounded px-2 py-1 text-xs hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded px-2 py-1 text-xs hover:bg-panel-hover"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 182 — current:

  ```tsx
  className = "rounded px-2 py-1 text-xs hover:bg-gray-100"
  ```

  New (`hover:bg-gray-100` → `hover:bg-panel-hover`):

  ```tsx
  className = "rounded px-2 py-1 text-xs hover:bg-panel-hover"
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 202 — current:

  ```tsx
                <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase text-gray-500">
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
                <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase text-muted">
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 219 — current:

  ```tsx
            <p className="px-1 pb-1 pt-3 text-xs font-medium uppercase text-gray-500">
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
            <p className="px-1 pb-1 pt-3 text-xs font-medium uppercase text-muted">
  ```

  `packages/ui/src/LibraryPanel.tsx`, line 223 — current:

  ```tsx
              <p className="px-2 py-4 text-center text-sm text-gray-500">
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
              <p className="px-2 py-4 text-center text-sm text-muted">
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/LibraryPanel.test.tsx`
  Expected: PASS.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/LibraryPanel.tsx
  git commit -m "ui: dark mode for LibraryPanel"
  ```

---

### Task 12: `PropertiesPanel.tsx`

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`

**Do not touch:** nothing in this file is a literal exception, but note the `text-white` global exception doesn't appear in this file at all — the spec's Problem section description mentioning `PropertiesPanel.tsx` alongside the `text-white` inventory refers to its danger-styled Delete button, which in this codebase's actual `PropertiesPanel.tsx` uses `text-red-600` (a _text_ color) rather than a solid `bg-red-600`/`text-white` pairing — see line 386 below, which maps to `text-danger`, not the literal exception.

- [ ] **Step 1: Make the change**

  `packages/ui/src/PropertiesPanel.tsx`, line 126 — current:

  ```tsx
      className={`flex w-56 flex-col gap-3 rounded-lg bg-white p-3 shadow ${className ?? ""}`}
  ```

  New (`bg-white` → `bg-panel`):

  ```tsx
      className={`flex w-56 flex-col gap-3 rounded-lg bg-panel p-3 shadow ${className ?? ""}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 166 — current:

  ```tsx
              className={`h-8 w-8 rounded border ${strokeWidth === w ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New (`border-violet-600 bg-violet-100` → `border-accent bg-accent-soft`; `border-gray-300` → `border-panel`):

  ```tsx
              className={`h-8 w-8 rounded border ${strokeWidth === w ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 183 — current:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${strokeStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${strokeStyle === s ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 200 — current:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${fillStyle === s ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${fillStyle === s ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 217 — current:

  ```tsx
              <span className="w-8 text-[10px] text-gray-500">
  ```

  New (`text-gray-500` → `text-muted`):

  ```tsx
              <span className="w-8 text-[10px] text-muted">
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 230 — current:

  ```tsx
                    className={`flex h-6 w-6 items-center justify-center rounded border ${value === kind ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
                    className={`flex h-6 w-6 items-center justify-center rounded border ${value === kind ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 249 — current:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${elbowed === false ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${elbowed === false ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 258 — current:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${elbowed === true ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${elbowed === true ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 273 — current:

  ```tsx
            className={`h-8 flex-1 rounded border text-xs ${roundness !== undefined && !isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
            className={`h-8 flex-1 rounded border text-xs ${roundness !== undefined && !isRound ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 282 — current:

  ```tsx
            className={`h-8 flex-1 rounded border text-xs ${isRound ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
            className={`h-8 flex-1 rounded border text-xs ${isRound ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 298 — current:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${opacity === o ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
  ```

  New:

  ```tsx
              className={`h-8 flex-1 rounded border text-xs ${opacity === o ? "border-accent bg-accent-soft" : "border-panel"}`}
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 314 — current:

  ```tsx
  className = "flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
  ```

  New (`border-gray-300` → `border-panel`):

  ```tsx
  className = "flex-1 rounded border border-panel p-1 text-xs disabled:opacity-40"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 323 — current:

  ```tsx
  className = "flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
  ```

  New:

  ```tsx
  className = "flex-1 rounded border border-panel p-1 text-xs disabled:opacity-40"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 341 — current:

  ```tsx
  className = "rounded border border-gray-300 p-1 text-xs"
  ```

  New:

  ```tsx
  className = "rounded border border-panel p-1 text-xs"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 356 — current:

  ```tsx
  className = "flex-1 rounded border border-gray-300 p-1 text-xs disabled:opacity-40"
  ```

  New:

  ```tsx
  className = "flex-1 rounded border border-panel p-1 text-xs disabled:opacity-40"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 369 — current:

  ```tsx
  className = "w-full rounded border border-gray-300 p-1 text-xs"
  ```

  New:

  ```tsx
  className = "w-full rounded border border-panel p-1 text-xs"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 379 — current:

  ```tsx
  className = "flex-1 rounded border border-gray-300 p-1 text-xs"
  ```

  New:

  ```tsx
  className = "flex-1 rounded border border-panel p-1 text-xs"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 386 — current:

  ```tsx
  className = "flex-1 rounded border border-red-300 p-1 text-xs text-red-600 hover:bg-red-50"
  ```

  New (`border-red-300` → `border-danger`; `text-red-600 hover:bg-red-50` → `text-danger hover:bg-danger-soft`):

  ```tsx
  className = "flex-1 rounded border border-danger p-1 text-xs text-danger hover:bg-danger-soft"
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 405 — current:

  ```tsx
  <div className="mb-1 text-xs font-medium text-gray-600">{label}</div>
  ```

  New (`text-gray-600` → `text-muted`):

  ```tsx
  <div className="mb-1 text-xs font-medium text-muted">{label}</div>
  ```

  `packages/ui/src/PropertiesPanel.tsx`, line 472 — current:

  ```tsx
      className={`h-7 w-7 rounded border-2 ${active ? "border-violet-600" : "border-gray-300"}`}
  ```

  New (`border-violet-600` → `border-accent`; `border-gray-300` → `border-panel`):

  ```tsx
      className={`h-7 w-7 rounded border-2 ${active ? "border-accent" : "border-panel"}`}
  ```

- [ ] **Step 2: Run the regression check**

  Run (from `packages/ui`): `npx vitest run test/PropertiesPanel.test.tsx`
  Expected: PASS — this is the largest single file changed (20 lines), so pay particular attention to this run.

  Run (from repo root): `npm run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/PropertiesPanel.tsx
  git commit -m "ui: dark mode for PropertiesPanel"
  ```

---

### Task 13: Final verification

**Files:** none expected — this task is verification only.

- [ ] **Step 1: Run the full gate**

  Run (from repo root): `npm run typecheck && npm test && npm run format:check && npm run lint`
  Expected: all green. This exercises every file touched across Tasks 1-12 together for the first time, plus the full 115-test `packages/ui` suite and every other package's suite.

- [ ] **Step 2: Manual dev-server smoke-check across light, dark, and system themes**

  Run (from `apps/web`): `npm run dev`, then open the app in a browser.

  Theme is controlled by `apps/web/src/store/slices/theme.ts`'s `ThemeSlice.setTheme` (`"light" | "dark" | "system"`), already wired into the UI: open the hamburger menu (`packages/ui/src/HamburgerMenu.tsx`, the button with `aria-label={t("menu.label")}` in the top-left toolbar area) and click the theme row's three buttons — `data-testid="theme-light"`, `data-testid="theme-dark"`, `data-testid="theme-system"`. (Equivalently, from the browser devtools console: `useAppStore.getState().setTheme("dark")` if `useAppStore` is reachable, or just use the menu buttons — the menu path is simpler and is what a real user does.)

  For each of the three theme states, visually inspect every one of the following for legible contrast and no near-invisible text or borders (this is the full file inventory from this migration):
  - Toolbar (`Toolbar.tsx`) and its More Shapes flyout (`MoreShapesMenu.tsx`)
  - Hamburger menu (`HamburgerMenu.tsx`), including the theme/locale choice rows and the red "Reset" item
  - Canvas background dialog (`CanvasBgDialog.tsx`)
  - Reset canvas confirmation dialog (`ResetCanvasDialog.tsx`)
  - Help / shortcuts dialog (`HelpDialog.tsx`)
  - Export dialog (`ExportDialog.tsx`), including the format/scale/background toggle rows
  - Command palette (`Cmd/Ctrl+/`, `CommandPalette.tsx`)
  - Right-click context menu on an element and on empty canvas (`ContextMenu.tsx`)
  - Layers panel (`LayersPanel.tsx`), including a grouped element's left accent border and the z-order hover buttons
  - Pages tab bar (`PagesTabBar.tsx`), including the drag-drop indicator line and page thumbnails
  - Library panel (`LibraryPanel.tsx`), including a tile's `⋯` menu and the red Delete item
  - Properties panel (`PropertiesPanel.tsx`) with an element selected — stroke/background swatches, width/style/fill/roundness/opacity rows, arrowheads (if a line/arrow is selected), group/arrange sections, and the red Delete button

  Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 3: Commit, if needed**

  If the smoke-check in Step 2 surfaces no issues, there is nothing to commit — Tasks 1-12 already committed every change, and this task is verification-only. State explicitly that no commit was made, rather than inventing one.

  If the smoke-check does surface a legibility problem (e.g. a class that should have been swapped but was missed), fix it in the relevant file, re-run that file's test command from its task above, then:

  ```bash
  git add <fixed file(s)>
  git commit -m "ui: fix dark-mode contrast issue found in final smoke-check"
  ```
