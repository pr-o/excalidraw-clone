"use client"
import type { Scene } from "@excalidraw-clone/scene"
import { buildPaste, copyPayload, selectableIds } from "../driver/clipboard"
import { isReadOnly } from "../driver/viewMode"
import { useAppStore } from "../store"

interface Bindings {
  scene: Scene
}

const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return (
    el !== null &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true)
  )
}

export function attachClipboard({ scene }: Bindings): () => void {
  const writeSelection = (e: ClipboardEvent): readonly string[] | null => {
    if (isEditableTarget(e.target)) return null
    const ids = useAppStore.getState().selectedIds
    const payload = copyPayload(scene.getElements(), ids)
    if (payload === null || !e.clipboardData) return null
    e.clipboardData.setData("text/plain", payload.text)
    e.preventDefault()
    return payload.ids
  }

  const onCopy = (e: ClipboardEvent): void => {
    writeSelection(e)
  }

  const onCut = (e: ClipboardEvent): void => {
    if (isReadOnly(useAppStore.getState())) return
    const ids = writeSelection(e)
    if (ids === null) return
    const doomed = new Set(ids)
    scene.mutate((draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (doomed.has(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
      }
    })
    useAppStore.getState().setSelection([])
  }

  const onPaste = (e: ClipboardEvent): void => {
    if (isReadOnly(useAppStore.getState())) return
    if (isEditableTarget(e.target)) return
    const text = e.clipboardData?.getData("text/plain") ?? ""
    const store = useAppStore.getState()
    const at = store.lastScenePointer ?? {
      x: window.innerWidth / 2 / store.zoom - store.scrollX,
      y: window.innerHeight / 2 / store.zoom - store.scrollY,
    }
    const pasted = buildPaste(text, at)
    if (pasted.length === 0) return
    e.preventDefault()
    scene.mutate((draft) => {
      draft.push(...pasted)
    })
    store.setSelection(selectableIds(pasted))
  }

  document.addEventListener("copy", onCopy)
  document.addEventListener("cut", onCut)
  document.addEventListener("paste", onPaste)
  return () => {
    document.removeEventListener("copy", onCopy)
    document.removeEventListener("cut", onCut)
    document.removeEventListener("paste", onPaste)
  }
}
