import { newImage, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { type FileLoader, renderExportSVG } from "../src/driver/exportSVG"

const noFiles: FileLoader = () => Promise.resolve(undefined)

describe("renderExportSVG", () => {
  it("sizes the SVG from the given elements only (20px padding)", async () => {
    const rect = newRectangle({ x: 10, y: 20, width: 100, height: 50 })
    const svg = await renderExportSVG([rect], { background: "white" }, "#ffffff", noFiles)
    // bbox (10,20)-(110,70) padded by 20 → x -10, y 0, 140 × 90
    expect(svg).toContain('viewBox="-10 0 140 90"')
  })

  it("ignores deleted elements when sizing", async () => {
    const rect = newRectangle({ x: 10, y: 20, width: 100, height: 50 })
    const dead = { ...newRectangle({ x: 900, y: 900, width: 10, height: 10 }), isDeleted: true }
    const svg = await renderExportSVG([rect, dead], { background: "white" }, "#ffffff", noFiles)
    expect(svg).toContain('viewBox="-10 0 140 90"')
  })

  it("loads each exported image file once and embeds it", async () => {
    const img1 = newImage({ x: 0, y: 0, width: 40, height: 40, fileId: "f1" })
    const img2 = newImage({ x: 50, y: 0, width: 40, height: 40, fileId: "f1" })
    const loadFile = vi.fn<FileLoader>(() =>
      Promise.resolve({ dataURL: "data:image/png;base64,AAAA" }),
    )
    const svg = await renderExportSVG([img1, img2], { background: "white" }, "#ffffff", loadFile)
    expect(loadFile).toHaveBeenCalledTimes(1)
    expect(loadFile).toHaveBeenCalledWith("f1")
    expect(svg).toContain('href="data:image/png;base64,AAAA"')
  })

  it("does not load files for images outside the exported set", async () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const loadFile = vi.fn<FileLoader>(() => Promise.resolve(undefined))
    await renderExportSVG([rect], { background: "white" }, "#ffffff", loadFile)
    expect(loadFile).not.toHaveBeenCalled()
  })

  it("paints the canvas background for white and omits it for transparent", async () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const white = await renderExportSVG([rect], { background: "white" }, "#abcdef", noFiles)
    const clear = await renderExportSVG([rect], { background: "transparent" }, "#abcdef", noFiles)
    expect(white).toContain('fill="#abcdef"')
    expect(clear).not.toContain('fill="#abcdef"')
  })
})
