"use client"
import {
  download,
  getAllFiles,
  serializeScene,
  toExcalidrawBlob,
} from "@excalidraw-clone/persistence"
import type { ExcalidrawFiles, Scene } from "@excalidraw-clone/scene"

export async function saveAsExcalidraw(
  scene: Scene,
  filename = "drawing.excalidraw",
): Promise<void> {
  const filesArr = await getAllFiles()
  const filesRecord = Object.fromEntries(filesArr.map((f) => [f.id, f])) as ExcalidrawFiles
  const data = serializeScene(scene, undefined, filesRecord)
  const blob = toExcalidrawBlob(data)
  download(blob, filename)
}
