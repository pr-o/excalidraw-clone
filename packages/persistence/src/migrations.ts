import {
  SCENE_FORMAT_VERSION,
  sanitizeSpans,
  sanitizeTable,
  type ExcalidrawData,
} from "@excalidraw-clone/scene"

interface AnyData {
  type: "excalidraw"
  version: number
  source: string
  elements?: unknown[]
  pages?: unknown[]
  activePageId?: string
  [key: string]: unknown
}

type MigrationFn = (data: AnyData) => AnyData

const v1ToV2: MigrationFn = (data) => ({
  ...data,
  version: 2,
  elements: ((data.elements as Record<string, unknown>[] | undefined) ?? []).map((el) => {
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

const v2ToV3: MigrationFn = (data) => {
  const { elements, ...rest } = data
  const pageId = crypto.randomUUID()
  return {
    ...rest,
    version: 3,
    pages: [{ id: pageId, name: "Page 1", elements: elements ?? [] }],
    activePageId: pageId,
  }
}

const MIGRATIONS: Record<number, MigrationFn> = {
  1: v1ToV2,
  2: v2ToV3,
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
  return normalizePages(cur) as unknown as ExcalidrawData
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** Crop is stored as 0..1 fractions; upstream files use pixels + natural size, or omit it. */
function normalizeCrop(crop: unknown): unknown {
  if (crop === undefined || crop === null) return null
  const c = crop as Record<string, number>
  const { naturalWidth: nw, naturalHeight: nh } = c
  if (typeof nw !== "number" || typeof nh !== "number") return crop
  if (!(nw > 0 && nh > 0 && c.width! > 0 && c.height! > 0)) return null
  const x = clamp01(c.x! / nw)
  const y = clamp01(c.y! / nh)
  return {
    x,
    y,
    width: Math.min(c.width! / nw, 1 - x),
    height: Math.min(c.height! / nh, 1 - y),
  }
}

const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []

/** Guides come from untrusted files: keep only finite numbers, drop anything else. */
function normalizeGuides(guides: unknown): { guides?: { x: number[]; y: number[] } } {
  if (typeof guides !== "object" || guides === null) return {}
  const g = guides as Record<string, unknown>
  return { guides: { x: numbers(g.x), y: numbers(g.y) } }
}

/** Spans come from untrusted files: validate against the text, drop if invalid. */
function normalizeTextSpans(el: Record<string, unknown>): Record<string, unknown> {
  if (!("spans" in el)) return el
  const { spans, ...rest } = el
  const clean = sanitizeSpans(spans, typeof el.text === "string" ? el.text.length : 0)
  return clean ? { ...rest, spans: clean } : rest
}

function normalizePages(data: AnyData): AnyData {
  const pages =
    (data.pages as { elements: Record<string, unknown>[]; guides?: unknown }[] | undefined) ?? []
  return {
    ...data,
    pages: pages.map(({ guides, ...page }) => ({
      ...page,
      ...normalizeGuides(guides),
      elements: page.elements.map((el) =>
        el.type === "image"
          ? { ...el, crop: normalizeCrop(el.crop) }
          : el.type === "text"
            ? normalizeTextSpans(el)
            : el.type === "table"
              ? sanitizeTable(el)
              : el,
      ),
    })),
  }
}

function isAnyData(v: unknown): v is AnyData {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  if (
    obj.type !== "excalidraw" ||
    typeof obj.version !== "number" ||
    typeof obj.source !== "string"
  ) {
    return false
  }
  return Array.isArray(obj.elements) || Array.isArray(obj.pages)
}
