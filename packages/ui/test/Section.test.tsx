import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Section } from "../src/properties/controls"

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("properties Section", () => {
  it("is expanded by default and collapses on a label click, remembered per viewer", async () => {
    const { unmount } = render(
      <Section label="Stroke">
        <button type="button">red</button>
      </Section>,
    )
    const header = screen.getByRole("button", { name: "Stroke" })
    expect(header).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "red" })).toBeInTheDocument()

    await userEvent.click(header)
    expect(header).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "red" })).toBeNull()
    unmount()

    // A later selection remounts the panel with the section still collapsed.
    render(
      <Section label="Stroke">
        <button type="button">red</button>
      </Section>,
    )
    expect(screen.queryByRole("button", { name: "red" })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Stroke" }))
    expect(screen.getByRole("button", { name: "red" })).toBeInTheDocument()
    expect(localStorage.getItem("excalidraw-properties-collapsed")).toBe("[]")
  })

  it("still collapses when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(
      <Section label="Opacity">
        <span>body</span>
      </Section>,
    )
    expect(screen.getByText("body")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Opacity" }))
    expect(screen.queryByText("body")).toBeNull()
  })
})
