import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

const SCENE_KEY = "excalidraw-scene"
const UI_KEY = "excalidraw-ui"

/** Best-effort JSON write to localStorage. Returns false when the write was
 *  rejected (quota exceeded, storage disabled) so callers can tell the user. */
export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Persists the document; false when it could not be stored. */
export function saveScene(data: ExcalidrawData): boolean {
  return saveJSON(SCENE_KEY, data)
}

export function loadScene(): ExcalidrawData | null {
  const raw = localStorage.getItem(SCENE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return migrate(parsed)
  } catch {
    // The next auto-save would overwrite whatever is stored; keep the
    // unreadable text under a side key so it can still be recovered by hand.
    saveRaw(`${SCENE_KEY}-unreadable`, raw)
    return null
  }
}

function saveRaw(key: string, raw: string): void {
  try {
    localStorage.setItem(key, raw)
  } catch {
    // Quota exceeded or storage disabled — nothing more to do.
  }
}

export function saveUI(snapshot: Record<string, unknown>): void {
  saveJSON(UI_KEY, snapshot)
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
