"use client"
import type { Point } from "@excalidraw-clone/geometry"
import {
  addImageFromBlob,
  getAllLibraryItems,
  importLibraryFile,
} from "@excalidraw-clone/persistence"
import { preloadSharedImage } from "@excalidraw-clone/renderer"
import { newImage, type ExcalidrawData, type Scene } from "@excalidraw-clone/scene"
import i18next from "i18next"
import { notify } from "../components/LiveAnnouncer"
import { useAppStore } from "../store"
import { measureImage } from "./imageUpload"
import { openSceneFile, pngHasEmbeddedScene } from "./openFile"
import { isReadOnly } from "./viewMode"

/** Image types the canvas can draw. */
const IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
])

/** A pasted or dropped picture is inserted at its natural size, but no larger than this. */
export const MAX_INSERTED_SIZE = 600

export const isInsertableImage = (blob: Blob): boolean => IMAGE_TYPES.has(blob.type)

/** Natural size scaled down (never up) to fit `max` × `max`. */
export function fitImageSize(
  natural: { width: number; height: number },
  max = MAX_INSERTED_SIZE,
): { width: number; height: number } {
  const { width, height } = natural
  if (width <= 0 || height <= 0) return { width: max / 2, height: max / 2 }
  const k = Math.min(1, max / width, max / height)
  return { width: Math.round(width * k), height: Math.round(height * k) }
}

/**
 * Stores `blob` and inserts it as an image element centred on `at` (one undo step),
 * then selects it. Returns the new element id, or null when nothing was inserted
 * (read-only mode, or not a supported image).
 */
export async function insertImageBlob(scene: Scene, blob: Blob, at: Point): Promise<string | null> {
  if (isReadOnly(useAppStore.getState()) || !isInsertableImage(blob)) return null
  const file = await addImageFromBlob(blob)
  void preloadSharedImage(file.id, file.dataURL)
  const { width, height } = fitImageSize(await measureImage(file.dataURL))
  const image = newImage({
    x: at.x - width / 2,
    y: at.y - height / 2,
    width,
    height,
    fileId: file.id,
  })
  scene.mutate((draft) => {
    draft.push(image)
  })
  const store = useAppStore.getState()
  store.setActiveTool("selection")
  store.setSelection([image.id])
  return image.id
}

/** How the app reacts to a dropped file. */
export type DropKind = "library" | "scene" | "image" | "unsupported"

/** Classifies a dropped file; a PNG counts as a scene only when it embeds one. */
export async function classifyDroppedFile(file: File): Promise<DropKind> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".excalidrawlib")) return "library"
  if (name.endsWith(".excalidraw") || file.type === "application/json") return "scene"
  if (file.type === "image/png" && (await pngHasEmbeddedScene(file))) return "scene"
  return isInsertableImage(file) ? "image" : "unsupported"
}

export interface DropTarget {
  scene: Scene
  /** Replaces the open document (after the user confirmed, when it has content). */
  openDocument: (data: ExcalidrawData) => void
  /** Whether the open document has anything a replacement would discard. */
  hasContent: () => boolean
}

/**
 * Handles files dropped on the app: images are inserted where they were dropped (fanned
 * out a little when there are several), a drawing (`.excalidraw`, or a PNG with an
 * embedded scene) replaces the open document after confirming, and a `.excalidrawlib`
 * is added to the library. Failures are reported, not thrown.
 */
export async function handleDroppedFiles(
  files: readonly File[],
  at: Point,
  target: DropTarget,
): Promise<void> {
  if (isReadOnly(useAppStore.getState())) return
  let offset = 0
  for (const file of files) {
    try {
      const kind = await classifyDroppedFile(file)
      if (kind === "image") {
        await insertImageBlob(target.scene, file, { x: at.x + offset, y: at.y + offset })
        offset += 24
      } else if (kind === "scene") {
        if (target.hasContent() && !window.confirm(i18next.t("drop.confirmReplace"))) continue
        const data = await openSceneFile(file)
        if (data) target.openDocument(data)
      } else if (kind === "library") {
        const { added, skipped } = await importLibraryFile(file)
        useAppStore.getState().setLibraryItems(await getAllLibraryItems())
        notify(i18next.t("library.imported", { added, skipped }))
      } else {
        notify(i18next.t("drop.unsupported", { name: file.name }))
      }
    } catch {
      notify(i18next.t("a11y.openFailed"))
    }
  }
}
