"use client"
import { expandIdsToFrameMembers, type Scene, isBoundLabel } from "@excalidraw-clone/scene"
import i18next from "i18next"
import { announce } from "../components/LiveAnnouncer"
import { applyPropertiesPatch } from "../driver/applyPropertiesPatch"
import { replaceElements } from "../driver/patchScene"
import { zoomAboutCentre } from "../driver/zoom"
import { toggleViewMode } from "../driver/viewMode"
import {
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  lockSelection,
  ungroupSelection,
} from "../driver/selectionActions"
import { useAppStore } from "../store"
import { type ChainDirection, createChainedShape } from "./flowchartChain"
import { applyStyle, extractStyle, type StyleClipboard } from "./styleClipboard"
import { toolForKey } from "./toolKeys"

const CHAIN_DIRECTIONS: Record<string, ChainDirection> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
}

interface Bindings {
  scene: Scene
  onNextPage?: () => void
  onPrevPage?: () => void
  onToggleStats?: () => void
  /** Ctrl+S (`saveAs` false) / Ctrl+Shift+S (`saveAs` true). */
  onSave?: (saveAs: boolean) => void
}

/** Ephemeral, app-lifetime style clipboard for Cmd/Ctrl+Alt+C / +V. Module-level
 *  rather than closure-level on purpose: `attachShortcuts` is re-invoked on every
 *  page switch and page CRUD, and a copied style must survive those so it can be
 *  pasted onto an element on another page. Never persisted, never cross-tab. */
let styleClipboard: StyleClipboard | null = null

interface KeyContext {
  e: KeyboardEvent
  /** `e.key` lower-cased. */
  key: string
  /** Ctrl or Cmd. */
  isMeta: boolean
  scene: Scene
  nav: {
    onNextPage?: (() => void) | undefined
    onPrevPage?: (() => void) | undefined
    onToggleStats?: (() => void) | undefined
    onSave?: ((saveAs: boolean) => void) | undefined
  }
}

/** A shortcut. Returns true when it consumed the key press (even if it then had nothing to do),
 *  which stops the remaining rules; false lets the press fall through to the next rule. */
type Rule = (c: KeyContext) => boolean

const store = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()
const selectedIds = (): readonly string[] => store().selectedIds

/** A rule that always calls `preventDefault()` once its `when` matches. */
const command =
  (when: (c: KeyContext) => boolean, run: (c: KeyContext) => void): Rule =>
  (c) => {
    if (!when(c)) return false
    c.e.preventDefault()
    run(c)
    return true
  }

const isCmd = (c: KeyContext, key: string): boolean => c.isMeta && c.key === key

/** Runs `fn` on the current selection, doing nothing when it is empty. */
const withSelection =
  (fn: (ids: readonly string[], c: KeyContext) => void) =>
  (c: KeyContext): void => {
    const ids = selectedIds()
    if (ids.length > 0) fn(ids, c)
  }

// Order matters in both lists: earlier rules win, and several must precede the
// tool-key fallback in the handler, which would otherwise treat the same key as a tool pick.

/** Navigation toggles: available in view mode, so they run before its filter. */
const VIEW_RULES: readonly Rule[] = [
  // `code` covers layouts where Alt+R / Alt+M yield a symbol such as "®" / "µ".
  command(
    (c) => c.e.altKey && !c.isMeta && (c.e.code === "KeyR" || c.key === "r"),
    () => toggleViewMode(),
  ),
  command(
    (c) => c.e.altKey && !c.isMeta && (c.e.code === "KeyM" || c.key === "m"),
    () => store().toggleMinimap(),
  ),
]

/** Saving the drawing to a file: also allowed in view mode (it changes nothing). */
const SAVE_RULE: Rule = command(
  (c) => isCmd(c, "s"),
  (c) => c.nav.onSave?.(c.e.shiftKey),
)

/** Editing commands, blocked by the view-mode filter. */
const RULES: readonly Rule[] = [
  command(
    (c) => isCmd(c, "z") && !c.e.shiftKey,
    ({ scene }) => {
      if (scene.canUndo()) announce(i18next.t("a11y.undo"))
      scene.undo()
    },
  ),
  command(
    (c) => c.isMeta && (c.key === "y" || (c.key === "z" && c.e.shiftKey)),
    ({ scene }) => {
      if (scene.canRedo()) announce(i18next.t("a11y.redo"))
      scene.redo()
    },
  ),
  command(
    (c) => isCmd(c, "g") && c.e.shiftKey,
    ({ scene }) => ungroupSelection(scene, selectedIds()),
  ),
  command(
    (c) => isCmd(c, "g"),
    ({ scene }) => groupSelection(scene, selectedIds()),
  ),
  command(
    (c) => isCmd(c, "l") && c.e.shiftKey,
    ({ scene }) => lockSelection(scene, selectedIds()),
  ),
  // Ctrl+Shift+D must precede the tool-key dispatch (see above).
  command(
    (c) => isCmd(c, "d") && c.e.shiftKey,
    withSelection(() => store().setOpenDialog("array-duplicate")),
  ),
  command(
    (c) => isCmd(c, "d") && !c.e.shiftKey && !c.e.altKey,
    ({ scene }) => duplicateSelection(scene, selectedIds()),
  ),
  // Copy / paste style. Only prevents the browser default when there is something to do.
  (c) => {
    if (!(isCmd(c, "c") && c.e.altKey)) return false
    const el = c.scene.getElements().find((x) => x.id === selectedIds()[0])
    if (el) {
      c.e.preventDefault()
      styleClipboard = extractStyle(el)
    }
    return true
  },
  (c) => {
    if (!(isCmd(c, "v") && c.e.altKey)) return false
    const clip = styleClipboard
    const ids = selectedIds()
    if (clip === null || ids.length === 0) return true
    c.e.preventDefault()
    const targets = new Set(ids)
    replaceElements(c.scene, (el) =>
      targets.has(el.id) ? applyPropertiesPatch(el, applyStyle(el, clip)) : undefined,
    )
    return true
  },
  command(
    (c) => isCmd(c, "0"),
    () => zoomAboutCentre(() => 1),
  ),
  command(
    (c) => c.isMeta && (c.key === "+" || c.key === "="),
    () => zoomAboutCentre((z) => z * 1.1),
  ),
  command(
    (c) => isCmd(c, "-"),
    () => zoomAboutCentre((z) => z / 1.1),
  ),
  command(
    (c) => isCmd(c, "'"),
    () => store().toggleGrid(),
  ),
  command(
    (c) => isCmd(c, "/"),
    () => store().setPaletteOpen(true),
  ),
  command(
    (c) => isCmd(c, "f"),
    () => store().setFindOpen(true),
  ),
  command(
    (c) => isCmd(c, "k"),
    ({ scene }) => {
      const ids = selectedIds()
      if (ids.length !== 1) return
      const el = scene.getElements().find((x) => x.id === ids[0])
      if (el && !el.locked) store().setLinkEditorElementId(el.id)
    },
  ),
  command(
    (c) => c.e.altKey && c.key === "pagedown",
    (c) => c.nav.onNextPage?.(),
  ),
  command(
    (c) => c.e.altKey && c.key === "pageup",
    (c) => c.nav.onPrevPage?.(),
  ),
  command(
    (c) => c.e.altKey && c.key === "/",
    (c) => c.nav.onToggleStats?.(),
  ),
  // Escape deliberately does not preventDefault.
  (c) => {
    if (c.key !== "escape") return false
    const s = store()
    // Let the active tool cancel/revert its own in-progress gesture (drag, resize,
    // in-progress shape draw, etc.) before the blanket state below.
    s.dispatchToolEvent?.({ type: "escape" })
    if (s.activeTool === "laser") s.setActiveTool("selection")
    // Crop mode owns Escape (revert the drag, or leave crop); keep the image selected.
    if (s.cropElementId === null) {
      if (s.selectedIds.length > 0) announce(i18next.t("a11y.selectionCleared"))
      s.setSelection([])
    }
    return true
  },
  (c) => {
    if (!(c.key === "?" || (c.e.shiftKey && c.key === "/"))) return false
    store().setOpenDialog("help")
    return true
  },
  (c) => {
    if (c.key !== "delete" && c.key !== "backspace") return false
    const ids = selectedIds()
    if (ids.length > 0) {
      c.e.preventDefault()
      deleteSelection(c.scene, ids)
    }
    return true
  },
  command(
    (c) => isCmd(c, "a"),
    ({ scene }) =>
      store().setSelection(
        scene
          .getElements()
          .filter((el) => !el.locked && !isBoundLabel(el))
          .map((el) => el.id),
      ),
  ),
  // Ctrl+Arrow chains a connected shape; must precede the nudge rule, which has no
  // meta guard. Falls through when there is no single shape to chain from.
  (c) => {
    const direction = c.isMeta ? CHAIN_DIRECTIONS[c.key] : undefined
    if (!direction) return false
    const ids = selectedIds()
    const source =
      ids.length === 1 ? c.scene.getElements().find((el) => el.id === ids[0]) : undefined
    const newId = source ? createChainedShape(c.scene, source, direction) : null
    if (!newId) return false
    c.e.preventDefault()
    store().setSelection([newId])
    return true
  },
  // Arrow keys nudge the selection (Shift: 10px).
  (c) => {
    if (c.isMeta || !(c.key in CHAIN_DIRECTIONS)) return false
    const ids = selectedIds()
    if (ids.length === 0) return true
    c.e.preventDefault()
    const step = c.e.shiftKey ? 10 : 1
    const dx = c.key === "arrowleft" ? -step : c.key === "arrowright" ? step : 0
    const dy = c.key === "arrowup" ? -step : c.key === "arrowdown" ? step : 0
    const moved = new Set(expandIdsToFrameMembers(ids, c.scene.getElements()))
    replaceElements(c.scene, (el) =>
      moved.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : undefined,
    )
    return true
  },
  // Shift+H / Shift+V flip; must precede the tool-key dispatch (Shift+V would pick selection).
  (c) => {
    if (c.isMeta || !c.e.shiftKey || (c.key !== "h" && c.key !== "v")) return false
    const ids = selectedIds()
    if (ids.length > 0) {
      c.e.preventDefault()
      flipSelection(c.scene, ids, c.key === "h" ? "x" : "y")
    }
    return true
  },
  // Must precede the tool-key dispatch: Shift+R would otherwise pick the rectangle.
  command(
    (c) => !c.isMeta && !c.e.altKey && c.e.shiftKey && c.key === "r",
    () => store().toggleRulers(),
  ),
]

/** View mode: only navigation, find, help and the laser survive. */
function allowedInViewMode(c: KeyContext): boolean {
  const { e, key, isMeta } = c
  return (
    (isMeta && ["0", "+", "=", "-", "/", "f"].includes(key)) ||
    (e.altKey && (key === "pagedown" || key === "pageup")) ||
    (!isMeta && !e.altKey && toolForKey(key, store().toolKeyOverrides) === "laser") ||
    key === "escape" ||
    key === "?" ||
    (e.shiftKey && key === "/")
  )
}

const isTypingTarget = (target: HTMLElement | null): boolean =>
  target !== null &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

export function attachShortcuts({
  scene,
  onNextPage,
  onPrevPage,
  onToggleStats,
  onSave,
}: Bindings): () => void {
  const nav: KeyContext["nav"] = { onNextPage, onPrevPage, onToggleStats, onSave }
  const handler = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target as HTMLElement | null)) return
    // Presentation mode is read-only: every editor shortcut below is inert.
    // PresentationHost owns the presentation keys (nav / Escape) on a
    // capture-phase window listener, so nothing here needs to handle them.
    if (store().presenting) return

    const c: KeyContext = {
      e,
      key: e.key.toLowerCase(),
      isMeta: e.metaKey || e.ctrlKey,
      scene,
      nav,
    }

    if (VIEW_RULES.some((rule) => rule(c)) || SAVE_RULE(c)) return
    if (store().viewMode && !allowedInViewMode(c)) return
    if (RULES.some((rule) => rule(c))) return

    // Modified keys are commands (Ctrl+C copies, Ctrl+L…), never tool picks.
    if (c.isMeta || e.altKey) return
    // Read at keypress time so rebinding applies without re-attaching.
    const tool = toolForKey(c.key, store().toolKeyOverrides)
    if (tool) store().setActiveTool(tool)
  }

  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}
