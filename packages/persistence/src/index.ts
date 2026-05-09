import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME]

// Binary helpers
export { blobToDataURL, dataURLToBlob, sha256Hex } from "./binary"

// localStorage scene + UI
export { clearLocal, loadScene, loadUI, saveScene, saveUI } from "./local-store"

// IndexedDB image binaries
export {
  addImageFromBlob,
  clearAllFiles,
  deleteFile,
  getAllFiles,
  getFile,
  putFile,
} from "./image-store"

// File I/O
export { download, parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "./file-io"

// Migrations
export { migrate } from "./migrations"

// Auto-save controller
export { createAutoSaver } from "./auto-save"
export type { AutoSaver, AutoSaverOptions } from "./auto-save"
