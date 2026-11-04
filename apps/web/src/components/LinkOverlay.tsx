"use client"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  clampLinkOverlayPos,
  commitElementLink,
  LINK_EDITOR_OFFSET,
  LINK_EDITOR_WIDTH,
  LINK_FLIP_GAP,
  LINK_INDICATOR_OFFSET,
  LINK_INDICATOR_WIDTH,
  normalizeLinkInput,
  openLink,
  pickLinkIndicatorTarget,
  sanitizeLinkHref,
} from "../driver/link"
import { useAppStore } from "../store"

export function LinkOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const editorId = useAppStore((s) => s.linkEditorElementId)
  const setEditorId = useAppStore((s) => s.setLinkEditorElementId)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const lastScenePointer = useAppStore((s) => s.lastScenePointer)
  const pointerOverCanvas = useAppStore((s) => s.pointerOverCanvas)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  if (editorId) {
    const el = scene.getElements().find((e) => e.id === editorId)
    if (!el) return null
    // Keyed by element: each edit session mounts fresh, with the field filled from
    // the element's current link — no effect copying props into state.
    return (
      <LinkEditor
        key={el.id}
        scene={scene}
        el={el}
        anchor={{ left: (el.x + scrollX) * zoom, top: (el.y + scrollY) * zoom }}
        zoom={zoom}
        onDone={() => setEditorId(null)}
      />
    )
  }

  const target = pickLinkIndicatorTarget(
    scene.getElements(),
    selectedIds,
    pointerOverCanvas ? lastScenePointer : null,
  )
  if (!target) return null

  const anchorLeft = (target.x + scrollX) * zoom
  const anchorTop = (target.y + scrollY) * zoom
  const { left, top } = clampLinkOverlayPos(
    {
      left: anchorLeft,
      aboveTop: anchorTop - LINK_INDICATOR_OFFSET,
      belowTop: anchorTop + LINK_FLIP_GAP,
    },
    LINK_INDICATOR_WIDTH,
    window.innerWidth,
  )

  return (
    <button
      type="button"
      data-testid="link-indicator"
      title={sanitizeLinkHref(target.link) ?? ""}
      onClick={() => openLink(target.link)}
      style={{ position: "absolute", left: `${left}px`, top: `${top}px` }}
      className="z-40 rounded border border-panel bg-panel px-1 py-0.5 text-xs leading-none shadow-panel hover:bg-accent-soft"
    >
      &#128279;
    </button>
  )
}

function LinkEditor({
  scene,
  el,
  anchor,
  zoom,
  onDone,
}: {
  scene: Scene
  el: ExcalidrawElement
  /** The element's top-left corner, in screen px. */
  anchor: { left: number; top: number }
  zoom: number
  onDone: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const [value, setValue] = useState(el.link ?? "")

  const { left, top } = clampLinkOverlayPos(
    {
      left: anchor.left,
      aboveTop: anchor.top - LINK_EDITOR_OFFSET,
      belowTop: anchor.top + el.height * zoom + LINK_FLIP_GAP,
    },
    LINK_EDITOR_WIDTH,
    window.innerWidth,
  )

  const commit = (): void => {
    const next = normalizeLinkInput(value)
    const changed = (el.link ?? null) !== next
    scene.mutate(
      (draft) => commitElementLink(draft, el.id, next),
      changed ? undefined : { skipHistory: true },
    )
    onDone()
  }

  return (
    <div
      data-testid="link-editor"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        commit()
      }}
      style={{ position: "absolute", left: `${left}px`, top: `${top}px` }}
      className="z-40 flex items-center gap-1 rounded-md border border-panel bg-panel px-1.5 py-1 shadow-panel"
    >
      <input
        autoFocus
        type="text"
        data-testid="link-editor-input"
        value={value}
        placeholder={t("linkEditor.placeholder")}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
            onDone()
          }
        }}
        className="w-56 bg-transparent text-sm outline-none"
      />
      {sanitizeLinkHref(value) !== null && (
        <button
          type="button"
          data-testid="link-editor-open"
          title={t("linkEditor.open")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openLink(value)}
          className="rounded px-1 text-sm hover:bg-accent-soft"
        >
          &#8599;
        </button>
      )}
      {el.link ? (
        <button
          type="button"
          data-testid="link-editor-remove"
          title={t("linkEditor.remove")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            scene.mutate((draft) => commitElementLink(draft, el.id, null))
            onDone()
          }}
          className="rounded px-1 text-sm hover:bg-accent-soft"
        >
          &#10005;
        </button>
      ) : null}
    </div>
  )
}
