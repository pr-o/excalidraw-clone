"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import { getElementBounds, type ExcalidrawElement, type Scene } from "@excalidraw-clone/scene"
import { FindOverlay } from "@excalidraw-clone/ui"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { collectSearchableItems, filterMatches, isSelectableMatch } from "../driver/findMatches"
import { useSceneRevision } from "../hooks/useSceneRevision"
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

  // The `scene` reference is stable across mutations, so the revision is what
  // makes the searchable set recompute on live edits.
  const sceneRevision = useSceneRevision(scene)

  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const hasJumpedRef = useRef(false)
  const cancelRef = useRef<(() => void) | null>(null)

  const items = useMemo(() => collectSearchableItems(scene.getElements()), [scene, sceneRevision])
  const matches = useMemo(() => filterMatches(items, query), [items, query])

  // A new query restarts the cursor: the next find-next must land on match 1.
  // `scene` is in the deps because each page owns its own Scene instance, so a
  // page switch would otherwise leave the cursor pointing at a match index from
  // the page we just left.
  useEffect(() => {
    setIndex(0)
    hasJumpedRef.current = false
  }, [query, scene])

  const clampedIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1)

  const jumpTo = (i: number): void => {
    const match = matches[i]
    if (!match) return
    const elements = scene.getElements()
    const el = elements.find((e) => e.id === match.id)
    if (!el) return
    const target = resolveTarget(el, elements)

    cancelRef.current?.()
    const view = fitToContent(getElementBounds(target), window.innerWidth, window.innerHeight)
    const { scrollX, scrollY, zoom } = useAppStore.getState()
    cancelRef.current = animateView({ scrollX, scrollY, zoom }, view, JUMP_ANIMATION_MS, (v) =>
      useAppStore.getState().setView(v),
    )

    if (isSelectableMatch(target)) useAppStore.getState().setSelection([target.id])
  }

  const advance = (direction: 1 | -1): void => {
    if (matches.length === 0) return
    // The first press lands on the current match rather than stepping past it.
    if (!hasJumpedRef.current) {
      hasJumpedRef.current = true
      jumpTo(clampedIndex)
      return
    }
    const next = (clampedIndex + direction + matches.length) % matches.length
    setIndex(next)
    jumpTo(next)
  }

  // Re-center on the persisted current match whenever Find (re)opens with an
  // existing query — browser-Ctrl+F parity.
  useEffect(() => {
    if (open && matches.length > 0) {
      hasJumpedRef.current = true
      jumpTo(clampedIndex)
    }
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
