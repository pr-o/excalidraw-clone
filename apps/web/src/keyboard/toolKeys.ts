import type { ToolName } from "@excalidraw-clone/tools"

/** Default single-key tool shortcuts, in Help/settings display order. */
export const DEFAULT_TOOL_KEYS = {
  selection: "v",
  rectangle: "r",
  ellipse: "o",
  diamond: "d",
  triangle: "3",
  parallelogram: "g",
  hexagon: "6",
  pentagon: "5",
  octagon: "8",
  table: "7",
  line: "l",
  arrow: "a",
  freedraw: "p",
  text: "t",
  image: "9",
  eraser: "e",
  frame: "f",
  note: "n",
  lasso: "s",
  laser: "k",
  comment: "c",
} as const satisfies Record<ToolName, string>

export type ToolKeyMap = Record<ToolName, string>
export type ToolKeyOverrides = Partial<ToolKeyMap>

/** Plain keys the editor handles itself (help, space-pan); never bindable to a tool. */
export const RESERVED_KEYS: readonly string[] = ["?", "/", " "]

export type ToolKeyError = "modifier" | "notPrintable" | "reserved" | "taken"

export function effectiveToolKeys(overrides: ToolKeyOverrides): ToolKeyMap {
  return { ...DEFAULT_TOOL_KEYS, ...overrides }
}

export function toolForKey(key: string, overrides: ToolKeyOverrides): ToolName | undefined {
  const map = effectiveToolKeys(overrides)
  return (Object.keys(map) as ToolName[]).find((tool) => map[tool] === key)
}

/** Why `key` cannot be bound to `tool`, or null when it can. `key` is a KeyboardEvent.key. */
export function validateToolKey(
  tool: ToolName,
  key: string,
  withModifier: boolean,
  overrides: ToolKeyOverrides,
): ToolKeyError | null {
  if (withModifier) return "modifier"
  if ([...key].length !== 1) return "notPrintable"
  const k = key.toLowerCase()
  if (RESERVED_KEYS.includes(k)) return "reserved"
  const owner = toolForKey(k, overrides)
  if (owner !== undefined && owner !== tool) return "taken"
  return null
}

/** Applies a binding; binding a tool back to its default key drops the override. */
export function setToolKey(
  overrides: ToolKeyOverrides,
  tool: ToolName,
  key: string | null,
): ToolKeyOverrides {
  const next = { ...overrides }
  if (key === null || key.toLowerCase() === DEFAULT_TOOL_KEYS[tool]) delete next[tool]
  else next[tool] = key.toLowerCase()
  return next
}

const STORAGE_KEY = "excalidraw-tool-keys"

/** Persisted overrides; malformed or unavailable storage yields no overrides. */
export function loadToolKeyOverrides(): ToolKeyOverrides {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    if (!raw || typeof raw !== "object") return {}
    const out: ToolKeyOverrides = {}
    for (const [tool, key] of Object.entries(raw)) {
      if (tool in DEFAULT_TOOL_KEYS && typeof key === "string" && [...key].length === 1) {
        out[tool as ToolName] = key.toLowerCase()
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveToolKeyOverrides(overrides: ToolKeyOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Storage blocked or full: the binding still applies for this session.
  }
}
