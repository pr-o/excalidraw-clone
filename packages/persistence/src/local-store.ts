import { SCENE_FORMAT_VERSION, type ExcalidrawData } from "@excalidraw-clone/scene"

const SCENE_KEY = "excalidraw-scene"
const UI_KEY = "excalidraw-ui"

export function saveScene(data: ExcalidrawData): void {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage disabled — silent. Caller can't do anything useful.
  }
}

export function loadScene(): ExcalidrawData | null {
  const raw = localStorage.getItem(SCENE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isExcalidrawData(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveUI(snapshot: Record<string, unknown>): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore
  }
}

export function loadUI(): Record<string, unknown> | null {
  const raw = localStorage.getItem(UI_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function clearLocal(): void {
  localStorage.removeItem(SCENE_KEY)
  localStorage.removeItem(UI_KEY)
}

function isExcalidrawData(v: unknown): v is ExcalidrawData {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    obj.type === "excalidraw" &&
    typeof obj.version === "number" &&
    obj.version === SCENE_FORMAT_VERSION &&
    Array.isArray(obj.elements)
  )
}
