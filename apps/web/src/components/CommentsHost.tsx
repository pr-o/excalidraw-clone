"use client"
import { centerViewOn } from "@excalidraw-clone/geometry"
import {
  addComment,
  deleteComment,
  replyToComment,
  resolveCommentPosition,
  setCommentResolved,
  type CommentAnchor,
  type Scene,
} from "@excalidraw-clone/scene"
import { CommentComposer, CommentsPanel, CommentThread } from "@excalidraw-clone/ui"
import React, { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { useAppStore } from "../store"

const PIN = 22

/**
 * Comment pins (a DOM overlay positioned from the camera), the new-comment
 * composer, the thread popover and the side panel. Comments live on the page's
 * Scene outside the undo stack, so every change is a plain `setComments`.
 * Hidden while presenting; read-only in view mode.
 */
export function CommentsHost({ scene }: { scene: Scene }): React.ReactElement | null {
  const { t } = useTranslation()
  useSceneRevision(scene)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const presenting = useAppStore((s) => s.presenting)
  const readOnly = useAppStore((s) => s.viewMode)
  const panelOpen = useAppStore((s) => s.commentsPanelOpen)
  const activeId = useAppStore((s) => s.activeCommentId)
  const draft = useAppStore((s) => s.commentDraft)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // A page switch or opening a file swaps the Scene: drop popovers from the old page.
  useEffect(() => {
    useAppStore.getState().setActiveCommentId(null)
  }, [scene])

  // Clicking anywhere outside the thread popover (other than a pin) closes it.
  useEffect(() => {
    if (!activeId) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null
      if (popoverRef.current?.contains(target) || target?.closest("[data-comment-pin]")) return
      useAppStore.getState().setActiveCommentId(null)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [activeId])

  if (presenting) return null

  const comments = scene.getComments()
  const elements = scene.getElementsIncludingDeleted()
  const toScreen = (p: { x: number; y: number }): { left: number; top: number } => ({
    left: (p.x + scrollX) * zoom,
    top: (p.y + scrollY) * zoom,
  })
  const update = (fn: (list: typeof comments) => typeof comments): void =>
    scene.setComments(fn(scene.getComments()))
  const close = (): void => useAppStore.getState().setActiveCommentId(null)

  const submitDraft = (anchor: CommentAnchor, text: string): void => {
    // Enter and the blur that follows unmounting must not add the comment twice.
    if (useAppStore.getState().commentDraft !== anchor) return
    update((list) => addComment(list, anchor, text))
    useAppStore.getState().setCommentDraft(null)
  }

  const active = comments.find((c) => c.id === activeId)
  const activePos = active ? resolveCommentPosition(active.anchor, elements) : null
  const draftPos = draft ? resolveCommentPosition(draft, elements) : null

  const popoverAt = (p: { x: number; y: number }): React.CSSProperties => {
    const { left, top } = toScreen(p)
    return {
      position: "absolute",
      left: `${Math.max(8, Math.min(left + PIN, window.innerWidth - 272))}px`,
      top: `${Math.max(8, top - PIN)}px`,
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {comments.map((c, i) => {
          const p = resolveCommentPosition(c.anchor, elements)
          if (!p) return null
          const { left, top } = toScreen(p)
          return (
            <button
              key={c.id}
              type="button"
              data-comment-pin
              data-testid={`comment-pin-${i + 1}`}
              aria-label={`${t("comments.pin")} ${i + 1}`}
              aria-pressed={c.id === activeId}
              onClick={() => useAppStore.getState().setActiveCommentId(c.id)}
              style={{ left: left - PIN / 2, top: top - PIN / 2, width: PIN, height: PIN }}
              className={`pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none border-2 border-white bg-accent text-[11px] font-semibold text-white shadow ${c.resolved ? "opacity-40" : ""} ${c.id === activeId ? "ring-2 ring-accent" : ""}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {draft && draftPos && !readOnly && (
        <div style={popoverAt(draftPos)} className="z-40 w-64 rounded-lg bg-panel p-2 shadow-lg">
          <CommentComposer
            placeholder={t("comments.placeholder")}
            submitOnBlur
            onSubmit={(text) => submitDraft(draft, text)}
            onCancel={() => useAppStore.getState().setCommentDraft(null)}
          />
        </div>
      )}

      {active && activePos && (
        <div ref={popoverRef} style={popoverAt(activePos)} className="z-40">
          <CommentThread
            t={t}
            comment={active}
            number={comments.indexOf(active) + 1}
            readOnly={readOnly}
            onReply={(text) => update((list) => replyToComment(list, active.id, text))}
            onToggleResolved={() =>
              update((list) => setCommentResolved(list, active.id, !active.resolved))
            }
            onDelete={() => {
              update((list) => deleteComment(list, active.id))
              close()
            }}
            onClose={close}
          />
        </div>
      )}

      {panelOpen && (
        <CommentsPanel
          t={t}
          comments={comments}
          activeId={activeId}
          readOnly={readOnly}
          onSelect={(id) => {
            const c = comments.find((x) => x.id === id)
            const p = c && resolveCommentPosition(c.anchor, elements)
            const s = useAppStore.getState()
            if (p) {
              const view = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: Math.max(s.zoom, 1) }
              s.setView(centerViewOn(p, view, window.innerWidth, window.innerHeight))
            }
            s.setActiveCommentId(id)
          }}
          onToggleResolved={(id) =>
            update((list) => setCommentResolved(list, id, !list.find((c) => c.id === id)?.resolved))
          }
          onDelete={(id) => {
            update((list) => deleteComment(list, id))
            if (id === activeId) close()
          }}
          onClose={() => useAppStore.getState().toggleCommentsPanel()}
        />
      )}
    </>
  )
}
