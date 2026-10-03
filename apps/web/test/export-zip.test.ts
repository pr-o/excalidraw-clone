import { beforeEach, describe, expect, it, vi } from "vitest"

const renderPageBlob = vi.hoisted(() =>
  vi.fn((format: string, _elements: unknown, _opts: unknown, _canvasBg: string, pageName: string) =>
    Promise.resolve(new Blob([`${format}:${pageName}`], { type: "text/plain" })),
  ),
)
vi.mock("../src/driver/exportRender", () => ({ renderPageBlob }))

import { Scene } from "@excalidraw-clone/scene"
import JSZip from "jszip"
import { buildExportZip } from "../src/driver/exportZip"

const sceneOf = (): Scene => new Scene()
const OPTS = {
  format: "png" as const,
  scale: 1 as const,
  background: "white" as const,
  embedScene: false,
}

beforeEach(() => {
  renderPageBlob.mockClear()
})

describe("buildExportZip", () => {
  it("adds one entry per page, named like a single export", async () => {
    const pages = [
      { name: "Page 1", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
    ]
    const blob = await buildExportZip(pages, OPTS, "#fff")
    expect(blob.type).toBe("application/zip")
    const zip = await JSZip.loadAsync(blob)
    expect(Object.keys(zip.files).sort()).toEqual(["Notes.png", "Page 1.png"])
    expect(await zip.file("Page 1.png")?.async("text")).toBe("png:Page 1")
  })

  it("disambiguates pages that sanitize to the same filename", async () => {
    const pages = [
      { name: "Notes", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
      { name: "Notes", scene: sceneOf() },
    ]
    const zip = await JSZip.loadAsync(await buildExportZip(pages, OPTS, "#fff"))
    expect(Object.keys(zip.files).sort()).toEqual(["Notes (2).png", "Notes (3).png", "Notes.png"])
  })

  it("renders every page with the requested format", async () => {
    await buildExportZip([{ name: "Page 1", scene: sceneOf() }], { ...OPTS, format: "pdf" }, "#fff")
    expect(renderPageBlob).toHaveBeenCalledWith(
      "pdf",
      [],
      expect.objectContaining({ format: "pdf" }),
      "#fff",
      "Page 1",
    )
  })

  it("works with a single page", async () => {
    const zip = await JSZip.loadAsync(
      await buildExportZip([{ name: "Page 1", scene: sceneOf() }], OPTS, "#fff"),
    )
    expect(Object.keys(zip.files)).toEqual(["Page 1.png"])
  })
})
