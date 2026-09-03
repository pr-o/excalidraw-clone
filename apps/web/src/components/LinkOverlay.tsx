"use client"
import type { Scene } from "@excalidraw-clone/scene"
import React, { useEffect, useRef, useState } from "react"
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
  const { t } = useTranslation()
  const editorId = useAppStore((s) => s.linkEditorElementId)
  const setEditorId = useAppStore((s) => s.setLinkEditorElementId)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const lastScenePointer = useAppStore((s) => s.lastScenePointer)
  const pointerOverCanvas = useAppStore((s) => s.pointerOverCanvas)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!editorId) return
    const el = scene.getElements().find((e) => e.id === editorId)
    setValue(el?.link ?? "")
    queueMicrotask(() => inputRef.current?.focus())
  }, [editorId, scene])

  if (editorId) {
    const el = scene.getElements().find((e) => e.id === editorId)
    if (!el) return null

    const anchorLeft = (el.x + scrollX) * zoom
    const anchorTop = (el.y + scrollY) * zoom
    const { left, top } = clampLinkOverlayPos(
      {
        left: anchorLeft,
        aboveTop: anchorTop - LINK_EDITOR_OFFSET,
        belowTop: anchorTop + el.height * zoom + LINK_FLIP_GAP,
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
      setEditorId(null)
    }

    return (
      <div
        data-testid="link-editor"
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return
          commit()
        }}
        style={{ position: "absolute", left: `${left}px`, top: `${top}px` }}
        className="z-40 flex items-center gap-1 rounded-md border border-panel bg-panel px-1.5 py-1 shadow-lg"
      >
        <input
          ref={(node) => {
            inputRef.current = node
          }}
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
              setEditorId(null)
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
              setEditorId(null)
            }}
            className="rounded px-1 text-sm hover:bg-accent-soft"
          >
            &#10005;
          </button>
        ) : null}
      </div>
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
      className="z-40 rounded border border-panel bg-panel px-1 py-0.5 text-xs leading-none shadow hover:bg-accent-soft"
    >
      &#128279;
    </button>
  )
}
