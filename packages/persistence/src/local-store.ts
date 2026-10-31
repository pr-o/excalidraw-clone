import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { migrate } from "./migrations"

const SCENE_KEY = "excalidraw-scene"
const UI_KEY = "excalidraw-ui"

/** Best-effort JSON write to localStorage. */
export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled — silent. Caller can't do anything useful.
  }
}

export function saveScene(data: ExcalidrawData): void {
  saveJSON(SCENE_KEY, data)
}

export function loadScene(): ExcalidrawData | null {
  const raw = localStorage.getItem(SCENE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return migrate(parsed)
  } catch {
    return null
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
