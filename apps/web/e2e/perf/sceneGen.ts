/**
 * Deterministic large-scene generator for perf tests (test-only, not shipped).
 * Produces a v3 document with `n` live elements: rectangles, ellipses,
 * diamonds, labelled shapes, bound arrows, free text, groups, frames and tables.
 */

type El = Record<string, unknown> & { id: string; type: string }

/** mulberry32: a tiny seeded PRNG so every run builds the same scene. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CELL_W = 260
const CELL_H = 200
/** Elements per cell (the cluster built by `cluster`). */
const PER_CELL = 12

function generateScene(n: number, seed = 1): El[] {
  const rand = rng(seed)
  let counter = 0
  const id = (p: string): string => `${p}-${(counter++).toString(36)}`
  const base = (type: string, x: number, y: number, w: number, h: number): El => ({
    id: id(type.slice(0, 3)),
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: rand() < 0.5 ? "transparent" : "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(rand() * 2 ** 31),
    versionNonce: Math.floor(rand() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  })
  const text = (x: number, y: number, s: string, containerId: string | null = null): El => ({
    ...base("text", x, y, s.length * 10, 25),
    text: s,
    originalText: s,
    fontSize: 20,
    fontFamily: 1,
    textAlign: containerId ? "center" : "left",
    verticalAlign: containerId ? "middle" : "top",
    containerId,
    autoResize: true,
    lineHeight: 1.25,
    baseline: 0,
    backgroundColor: "transparent",
  })

  const cells = Math.ceil(n / PER_CELL)
  const cols = Math.ceil(Math.sqrt(cells))
  const out: El[] = []

  for (let c = 0; c < cells && out.length < n; c += 1) {
    const ox = (c % cols) * CELL_W
    const oy = Math.floor(c / cols) * CELL_H
    // Every 8th cell is a frame wrapping its cluster; every 10th gets a table.
    const frame =
      c % 8 === 0
        ? {
            ...base("frame", ox - 5, oy - 5, CELL_W - 10, CELL_H - 10),
            name: `F${c}`,
            isCollapsed: false,
            backgroundColor: "transparent",
          }
        : null
    const cluster: El[] = []

    const a = base("rectangle", ox + 10, oy + 10, 60, 40)
    const b = base("ellipse", ox + 150, oy + 10, 60, 40)
    const arrow: El = {
      ...base("arrow", ox + 74, oy + 30, 72, 0),
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: a.id, focus: 0, gap: 4 },
      endBinding: { elementId: b.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      backgroundColor: "transparent",
    }
    a.boundElements = [{ id: arrow.id, type: "arrow" }]
    b.boundElements = [{ id: arrow.id, type: "arrow" }]
    cluster.push(a, b, arrow)

    const labelled = base("diamond", ox + 10, oy + 70, 80, 50)
    const label = text(ox + 30, oy + 82, `n${c}`, labelled.id)
    labelled.boundElements = [{ id: label.id, type: "text" }]
    cluster.push(labelled, label)

    cluster.push(text(ox + 110, oy + 80, `note ${c} ${Math.floor(rand() * 1000)}`))

    const gid = `g-${c}`
    const g1 = { ...base("rectangle", ox + 10, oy + 140, 30, 30), groupIds: [gid] }
    const g2 = { ...base("ellipse", ox + 50, oy + 140, 30, 30), groupIds: [gid] }
    cluster.push(g1, g2)

    // Filled, so perf drags can grab it by its interior at (ox+120, oy+155).
    cluster.push({ ...base("rectangle", ox + 100, oy + 140, 40, 30), backgroundColor: "#a5d8ff" })
    cluster.push(base("ellipse", ox + 150, oy + 140, 40, 30))
    cluster.push({
      ...base("line", ox + 200, oy + 140, 40, 30),
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 30 },
        { x: 40, y: 0 },
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      backgroundColor: "transparent",
    })
    if (c % 10 === 5) {
      cluster.push({
        ...base("table", ox + 150, oy + 70, 100, 56),
        rows: 2,
        cols: 2,
        colWidths: [50, 50],
        rowHeights: [28, 28],
        cells: [
          ["a", "b"],
          ["c", "d"],
        ],
        headerRow: true,
        fontSize: 20,
        fontFamily: 1,
        textAlign: "left",
      })
    } else {
      cluster.push(base("rectangle", ox + 200, oy + 80, 40, 40))
    }

    if (frame) {
      out.push(frame)
      for (const e of cluster) e.frameId = frame.id
    }
    out.push(...cluster)
  }
  return out.slice(0, n)
}

/** The localStorage value the app hydrates from (`excalidraw-scene`). */
export function sceneDocument(n: number, seed = 1): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 3,
    source: "perf-test",
    pages: [{ id: "page-1", name: "Page 1", elements: generateScene(n, seed) }],
    activePageId: "page-1",
  })
}
