import { SCENE_FORMAT_VERSION, type ExcalidrawData } from "@excalidraw-clone/scene"

interface AnyData {
  type: "excalidraw"
  version: number
  source: string
  elements: unknown[]
  [key: string]: unknown
}

type MigrationFn = (data: AnyData) => AnyData

const v1ToV2: MigrationFn = (data) => ({
  ...data,
  version: 2,
  elements: (data.elements as Record<string, unknown>[]).map((el) => {
    if (
      el.type === "rectangle" ||
      el.type === "diamond" ||
      el.type === "ellipse" ||
      el.type === "frame"
    ) {
      return { ...el, boundElements: el.boundElements ?? [] }
    }
    return el
  }),
})

const MIGRATIONS: Record<number, MigrationFn> = {
  1: v1ToV2,
}

export function migrate(raw: unknown): ExcalidrawData {
  if (!isAnyData(raw)) {
    throw new Error("migrate: unrecognized .excalidraw payload")
  }
  if (raw.version > SCENE_FORMAT_VERSION) {
    throw new Error(
      `migrate: file version ${raw.version} is newer than supported ${SCENE_FORMAT_VERSION}`,
    )
  }
  let cur: AnyData = raw
  while (cur.version < SCENE_FORMAT_VERSION) {
    const fn = MIGRATIONS[cur.version]
    if (!fn) throw new Error(`migrate: no migration registered for version ${cur.version}`)
    cur = fn(cur)
  }
  return cur as unknown as ExcalidrawData
}

function isAnyData(v: unknown): v is AnyData {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    obj.type === "excalidraw" &&
    typeof obj.version === "number" &&
    typeof obj.source === "string" &&
    Array.isArray(obj.elements)
  )
}
