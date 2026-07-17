"use client"
import type { ExcalidrawTextElement, Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef, useState } from "react"
import { commitTextEdit } from "../driver/commitTextEdit"
import { useAppStore } from "../store"

export function TextEditingOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const id = useAppStore((s) => s.textEditElementId)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
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
      ref={ref}
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
