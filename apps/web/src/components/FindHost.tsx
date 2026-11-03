"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import { getElementBounds, type ExcalidrawElement, type Scene } from "@excalidraw-clone/scene"
import { FindOverlay } from "@excalidraw-clone/ui"
import React, {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  collectSearchableItems,
  filterMatches,
  isSelectableMatch,
  JUMP_MAX_ZOOM,
} from "../driver/findMatches"
import { useSceneElements } from "../hooks/useScene"
import { animateView } from "../presentation/animateView"
import { useAppStore } from "../store"

/** Duration of the camera glide to a matched element. Shorter than
 *  presentation's slide glide (400ms) — this is a "snap to" jump, not a
 *  scripted slide transition. */
const JUMP_ANIMATION_MS = 300

/**
 * The element a match should actually land on and select.
 *
 * `collectSearchableItems` keys a bound label (a `text` element with a
 * container) on the label's own id, which is right for searching but wrong as a
 * jump/selection target: a bound label is never independently selectable in
 * this app (select-all and hit-testing both skip it), and its tight text bounds
 * would crop the shape it sits in. So a bound label resolves to its container.
 * A container that cannot be found (defensive — the scene should never hold a
 * dangling `containerId`) falls back to the label itself.
 */
function resolveTarget(
  el: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement {
  if (el.type !== "text" || el.containerId === null) return el
  return elements.find((e) => e.id === el.containerId) ?? el
}

/**
 * Drives find-on-canvas: searches the live scene for the current query, keeps
 * the 1-based match cursor, and glides the camera to (and selects) each match
 * as the user cycles through them. Locked elements are jumped to but never
 * selected.
 */
export function FindHost({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.findOpen)
  const setOpen = useAppStore((s) => s.setFindOpen)

  // Recomputes the searchable set on live edits.
  const elements = useSceneElements(scene)

  const [query, setQuery] = useState("")
  // The match cursor belongs to one search (query + page): it is stored with the
  // search it was moved in, and a different search reads it as fresh (match 1,
  // nothing jumped to yet) without an effect resetting state after the fact.
  // Each page owns its own Scene, so a page switch is a new search too.
  const [cursor, setCursor] = useState({ query, scene, index: 0, hasJumped: false })
  const sameSearch = cursor.query === query && cursor.scene === scene
  const index = sameSearch ? cursor.index : 0
  const hasJumped = sameSearch && cursor.hasJumped
  const moveCursor = (next: number): void =>
    setCursor({ query, scene, index: next, hasJumped: true })
  const cancelRef = useRef<(() => void) | null>(null)

  // Closed: nothing to search, so skip the O(n) collect on every scene edit.
  const items = useMemo(() => (open ? collectSearchableItems(elements) : []), [elements, open])
  // On a large drawing, filtering every searchable element per keystroke can lag the
  // input; the deferred query lets typing stay responsive while results catch up.
  const deferredQuery = useDeferredValue(query)
  const matches = useMemo(() => filterMatches(items, deferredQuery), [items, deferredQuery])

  const clampedIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1)

  const jumpTo = (i: number): void => {
    const match = matches[i]
    if (!match) return
    const elements = scene.getElements()
    const el = elements.find((e) => e.id === match.id)
    if (!el) return
    const target = resolveTarget(el, elements)

    cancelRef.current?.()
    const view = fitToContent(
      getElementBounds(target),
      window.innerWidth,
      window.innerHeight,
      JUMP_MAX_ZOOM,
    )
    const { scrollX, scrollY, zoom } = useAppStore.getState()
    cancelRef.current = animateView({ scrollX, scrollY, zoom }, view, JUMP_ANIMATION_MS, (v) =>
      useAppStore.getState().setView(v),
    )

    if (isSelectableMatch(target)) useAppStore.getState().setSelection([target.id])
  }

  const advance = (direction: 1 | -1): void => {
    if (matches.length === 0) return
    // The first press lands on the current match rather than stepping past it.
    if (!hasJumped) {
      moveCursor(clampedIndex)
      jumpTo(clampedIndex)
      return
    }
    const next = (clampedIndex + direction + matches.length) % matches.length
    moveCursor(next)
    jumpTo(next)
  }

  // Re-center on the persisted current match whenever Find (re)opens with an
  // existing query — browser-Ctrl+F parity. An Effect Event: it reads the latest
  // matches, but only opening Find (not every keystroke) fires it.
  // The cursor is marked as "on the current match" while rendering the opening
  // (adjusting state on a prop change), so the next find-next steps past it; the
  // effect below only performs the camera jump.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && matches.length > 0) moveCursor(clampedIndex)
  }
  const recenterOnOpen = useEffectEvent(() => {
    if (matches.length > 0) jumpTo(clampedIndex)
  })
  useEffect(() => {
    if (open) recenterOnOpen()
  }, [open])

  // An in-flight glide must not outlive the host.
  useEffect(
    () => () => {
      cancelRef.current?.()
      cancelRef.current = null
    },
    [],
  )

  return (
    <FindOverlay
      t={t}
      open={open}
      onClose={() => setOpen(false)}
      query={query}
      onQueryChange={setQuery}
      matchIndex={matches.length === 0 ? 0 : clampedIndex + 1}
      matchCount={matches.length}
      onNext={() => advance(1)}
      onPrev={() => advance(-1)}
    />
  )
}
