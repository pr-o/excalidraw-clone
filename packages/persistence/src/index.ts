import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME]

export { blobToDataURL, dataURLToBlob, sha256Hex } from "./binary"
export { clearLocal, loadScene, loadUI, saveScene, saveUI } from "./local-store"
export { clearAllFiles, deleteFile, getAllFiles, getFile, putFile } from "./image-store"
export { migrate } from "./migrations"
export { download, parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "./file-io"
export { createAutoSaver } from "./auto-save"
export type { AutoSaver, AutoSaverOptions } from "./auto-save"
