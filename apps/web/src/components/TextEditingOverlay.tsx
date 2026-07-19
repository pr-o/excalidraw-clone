"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef, useState } from "react"
import { commitTextEdit } from "../driver/commitTextEdit"
import { renameFrame } from "../driver/renameFrame"
import { useAppStore } from "../store"

export function TextEditingOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const id = useAppStore((s) => s.textEditElementId)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!id) return
    const el = scene.getElementsIncludingDeleted().find((e) => e.id === id)
    setValue(el?.type === "frame" ? (el.name ?? "") : el?.type === "text" ? el.text : "")
    queueMicrotask(() => ref.current?.focus())
  }, [id, scene])

  if (!id) return null
  const target = scene.getElementsIncludingDeleted().find((e) => e.id === id)
  if (!target) return null

  if (target.type === "frame") {
    const commitName = (): void => {
      const trimmed = value.trim()
      const changed = target.name !== (trimmed === "" ? null : trimmed)
      scene.mutate(
        (draft) => renameFrame(draft, id, value),
        changed ? undefined : { skipHistory: true },
      )
      setId(null)
    }
    return (
      <input
        data-testid="frame-name-input"
        ref={(node) => {
          ref.current = node
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commitName()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            setId(null)
          }
        }}
        style={{
          position: "absolute",
          left: `${(target.x + scrollX) * zoom}px`,
          top: `${(target.y + scrollY) * zoom - 28}px`,
          fontSize: "12px",
          background: "transparent",
          border: "1px solid #999",
          outline: "none",
        }}
        className="z-40"
      />
    )
  }

  if (target.type !== "text") return null
  const el = target

  const left = (el.x + scrollX) * zoom
  const top = (el.y + scrollY) * zoom
  const fontSize = el.fontSize * zoom

  const commit = (): void => {
    const noVisibleChange = value === "" && (el?.text ?? "") === ""
    scene.mutate(
      (draft) => commitTextEdit(draft, id, value),
      noVisibleChange ? { skipHistory: true } : undefined,
    )
    setId(null)
  }

  return (
    <textarea
      ref={(node) => {
        ref.current = node
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          if ((el?.text ?? "") === "") {
            scene.mutate((draft) => commitTextEdit(draft, id, ""), { skipHistory: true })
          }
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
