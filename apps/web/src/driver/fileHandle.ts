"use client"
import {
  download,
  getAllFiles,
  serializeDocument,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawFiles } from "@excalidraw-clone/scene"
import i18next from "i18next"
import { notify } from "../components/LiveAnnouncer"
import type { PageRecord } from "./pages"
import { referencedFileIds } from "./saveFile"

/**
 * "Save" writes back to the file the drawing came from, as a desktop app does, using the
 * File System Access API (Chromium browsers). Elsewhere it falls back to a download.
 *
 * Only the members this module uses are typed: the pickers are not in TypeScript's DOM lib.
 */
interface PickerType {
  description: string
  accept: Record<string, string[]>
}
interface FileSystemAccess {
  showSaveFilePicker(options: {
    suggestedName?: string
    types?: PickerType[]
  }): Promise<FileSystemFileHandle>
  showOpenFilePicker(options: {
    types?: PickerType[]
    multiple?: false
  }): Promise<FileSystemFileHandle[]>
}

const DEFAULT_NAME = "drawing.excalidraw"
const SCENE_TYPE: PickerType = {
  description: "Excalidraw drawing",
  accept: { "application/json": [".excalidraw"] },
}
const OPEN_TYPES: PickerType[] = [
  SCENE_TYPE,
  { description: "PNG with an embedded drawing", accept: { "image/png": [".png"] } },
]

const fsa = (): Partial<FileSystemAccess> =>
  typeof window === "undefined" ? {} : (window as unknown as Partial<FileSystemAccess>)

export const canSaveToFile = (): boolean => typeof fsa().showSaveFilePicker === "function"
export const canPickFileHandle = (): boolean => typeof fsa().showOpenFilePicker === "function"

/** The file "Save" writes to; null until the drawing was opened from or saved to one. */
let current: FileSystemFileHandle | null = null

/** Remembers where the open drawing lives. A PNG is never written back (it would lose
 *  its image), so a drawing opened from one is saved to a new .excalidraw file. */
export function setCurrentFile(handle: FileSystemFileHandle | null): void {
  current = handle && handle.name.toLowerCase().endsWith(".png") ? null : handle
}

export const currentFileName = (): string | null => current?.name ?? null

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === "AbortError"

/** Lets the user pick a drawing to open; the file it came from becomes the save target.
 *  Null when the picker was dismissed. Only call when `canPickFileHandle()`. */
export async function pickDrawingFile(): Promise<File | null> {
  try {
    const [handle] = await fsa().showOpenFilePicker!({ types: OPEN_TYPES })
    if (!handle) return null
    setCurrentFile(handle)
    return await handle.getFile()
  } catch (err) {
    if (isAbort(err)) return null
    throw err
  }
}

async function documentBlob(pages: readonly PageRecord[], activePageId: string): Promise<Blob> {
  // Only the images this document uses: the browser store also holds pictures from
  // deleted elements and other drawings, which must not leak into a shared file.
  const used = referencedFileIds(pages)
  const files = (await getAllFiles()).filter((f) => used.has(f.id))
  const record = Object.fromEntries(files.map((f) => [f.id, f])) as ExcalidrawFiles
  return toExcalidrawBlob(serializeDocument(pages, activePageId, undefined, record))
}

async function write(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const stream = await handle.createWritable()
  await stream.write(blob)
  await stream.close()
}

/**
 * Saves the drawing. Without `saveAs` it writes to the current file when there is one;
 * otherwise (or with `saveAs`) it asks where to save and remembers the choice. Browsers
 * without the File System Access API download the file instead. Returns false when the
 * user cancelled.
 */
export async function saveDrawing(
  pages: readonly PageRecord[],
  activePageId: string,
  { saveAs = false }: { saveAs?: boolean } = {},
): Promise<boolean> {
  const blob = await documentBlob(pages, activePageId)
  if (!canSaveToFile()) {
    download(blob, current?.name ?? DEFAULT_NAME)
    return true
  }
  try {
    let target = saveAs ? null : current
    if (target) {
      try {
        await write(target, blob)
      } catch (err) {
        // The file moved, or write permission was revoked: ask for a location instead.
        if (isAbort(err)) return false
        target = null
      }
    }
    if (!target) {
      target = await fsa().showSaveFilePicker!({
        suggestedName: current?.name ?? DEFAULT_NAME,
        types: [SCENE_TYPE],
      })
      await write(target, blob)
      setCurrentFile(target)
    }
    notify(i18next.t("file.saved", { name: target.name }))
    return true
  } catch (err) {
    if (isAbort(err)) return false
    notify(i18next.t("file.saveFailed"))
    return false
  }
}
