import { newFrame, newRectangle, newTable, Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { canvasMenuItems, elementMenuItems } from "../src/components/contextMenuItems"

const at = { x: 5, y: 5 }
const envFor = (scene: Scene, pageCount = 2) => ({
  scene,
  t: (k: string) => k,
  pageCount,
  openMovePicker: () => {},
})
const ids = (items: { id: string }[]): string[] => items.map((i) => i.id)

describe("canvasMenuItems", () => {
  it("offers paste and select-all, and zoom-to-fit only when there is content", () => {
    const empty = new Scene()
    expect(ids(canvasMenuItems(envFor(empty), at))).toEqual(["paste", "select-all"])
    const full = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    expect(ids(canvasMenuItems(envFor(full), at))).toEqual(["paste", "select-all", "zoom-to-fit"])
  })
})

describe("elementMenuItems", () => {
  const rect = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })

  it("a locked element only offers copy and unlock", () => {
    const r = rect(0)
    const scene = new Scene([{ ...r, locked: true }])
    expect(
      ids(elementMenuItems(envFor(scene), { elementIds: [r.id], locked: true, scenePoint: at })),
    ).toEqual(["copy", "unlock"])
  })

  it("a single plain element gets the full set, in order, with link and move-to-page", () => {
    const r = rect(0)
    const scene = new Scene([r])
    expect(
      ids(elementMenuItems(envFor(scene), { elementIds: [r.id], locked: false, scenePoint: at })),
    ).toEqual([
      "copy",
      "cut",
      "paste",
      "duplicate",
      "array-duplicate",
      "flip-horizontal",
      "flip-vertical",
      "move-to-page",
      "create-link",
      "delete",
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
      "lock",
    ])
  })

  it("a linked element offers edit and remove instead of create; no pages hides move-to-page", () => {
    const r = { ...rect(0), link: "https://example.com" }
    const out = ids(
      elementMenuItems(envFor(new Scene([r]), 0), {
        elementIds: [r.id],
        locked: false,
        scenePoint: at,
      }),
    )
    expect(out).toContain("edit-link")
    expect(out).toContain("remove-link")
    expect(out).not.toContain("create-link")
    expect(out).not.toContain("move-to-page")
  })

  it("a multi-selection offers group, and a lone frame offers export-frame", () => {
    const a = rect(0)
    const b = rect(50)
    const multi = ids(
      elementMenuItems(envFor(new Scene([a, b])), {
        elementIds: [a.id, b.id],
        locked: false,
        scenePoint: at,
      }),
    )
    expect(multi).toContain("group")
    expect(multi).not.toContain("create-link")

    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    expect(
      ids(
        elementMenuItems(envFor(new Scene([frame])), {
          elementIds: [frame.id],
          locked: false,
          scenePoint: at,
        }),
      ),
    ).toContain("export-frame")
  })

  it("a table offers row and column operations", () => {
    const table = newTable({ x: 0, y: 0 })
    const out = ids(
      elementMenuItems(envFor(new Scene([table])), {
        elementIds: [table.id],
        locked: false,
        scenePoint: at,
      }),
    )
    expect(out).toEqual(
      expect.arrayContaining([
        "table-insert-row-above",
        "table-insert-row-below",
        "table-insert-col-left",
        "table-insert-col-right",
        "table-delete-row",
        "table-delete-col",
      ]),
    )
  })
})
