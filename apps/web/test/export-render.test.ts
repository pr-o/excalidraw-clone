import { beforeEach, describe, expect, it, vi } from "vitest"

const exportToPNG = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(new Blob(["png-bytes"], { type: "image/png" }))),
)
const renderExportSVG = vi.hoisted(() => vi.fn(() => Promise.resolve("<svg></svg>")))
const exportToPDF = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(new Blob(["pdf-bytes"], { type: "application/pdf" }))),
)
vi.mock("../src/driver/exportPNG", () => ({ exportToPNG }))
vi.mock("../src/driver/exportSVG", () => ({ renderExportSVG }))
vi.mock("../src/driver/exportPDF", () => ({ exportToPDF }))

import { renderPageBlob } from "../src/driver/exportRender"

const ELEMENTS: never[] = []
const OPTS = { scale: 1 as const, background: "white" as const, embedScene: false }

beforeEach(() => {
  exportToPNG.mockClear()
  renderExportSVG.mockClear()
  exportToPDF.mockClear()
})

describe("renderPageBlob", () => {
  it("dispatches png to exportToPNG, forwarding pageName", async () => {
    const blob = await renderPageBlob("png", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(exportToPNG).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff", "Page 1")
    expect(renderExportSVG).not.toHaveBeenCalled()
    expect(exportToPDF).not.toHaveBeenCalled()
    expect(blob.type).toBe("image/png")
  })

  it("dispatches svg to renderExportSVG and wraps the string as a Blob", async () => {
    const blob = await renderPageBlob("svg", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(renderExportSVG).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff")
    expect(blob.type).toBe("image/svg+xml")
    expect(await blob.text()).toBe("<svg></svg>")
  })

  it("dispatches pdf to exportToPDF", async () => {
    const blob = await renderPageBlob("pdf", ELEMENTS, OPTS, "#fff", "Page 1")
    expect(exportToPDF).toHaveBeenCalledWith(ELEMENTS, OPTS, "#fff")
    expect(blob.type).toBe("application/pdf")
  })
})
