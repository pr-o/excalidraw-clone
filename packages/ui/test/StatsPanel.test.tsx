import type { Stats } from "@excalidraw-clone/scene"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { StatsPanel } from "../src/StatsPanel"

const t = (key: string): string => key

const sceneStats: Stats = { kind: "scene", elementCount: 3 }
const singleStats: Stats = {
  kind: "single",
  id: "el1",
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  angleDeg: 0,
}
const multiStats: Stats = { kind: "multi", count: 2, x: 0, y: 0, width: 100, height: 50 }

describe("StatsPanel", () => {
  it("renders nothing when closed", () => {
    render(<StatsPanel t={t} open={false} stats={sceneStats} onChange={vi.fn()} />)
    expect(screen.queryByTestId("stats-panel")).not.toBeInTheDocument()
  })

  it("scene kind shows the live element count and no numeric fields", () => {
    render(<StatsPanel t={t} open stats={sceneStats} onChange={vi.fn()} />)
    expect(screen.getByTestId("stats-element-count")).toHaveTextContent("3")
    expect(screen.queryByTestId("stats-x")).not.toBeInTheDocument()
  })

  it("multi kind shows a read-only bounding box; inputs are disabled", () => {
    render(<StatsPanel t={t} open stats={multiStats} onChange={vi.fn()} />)
    expect(screen.getByTestId("stats-multi-count")).toHaveTextContent("2")
    const widthInput = screen.getByTestId("stats-width")
    expect(widthInput).toBeDisabled()
    expect(widthInput).toHaveValue("100")
    expect(screen.queryByTestId("stats-angle")).not.toBeInTheDocument()
  })

  it("single kind shows all five editable fields with the element's live values", () => {
    render(<StatsPanel t={t} open stats={singleStats} onChange={vi.fn()} />)
    expect(screen.getByTestId("stats-x")).toHaveValue("10")
    expect(screen.getByTestId("stats-y")).toHaveValue("20")
    expect(screen.getByTestId("stats-width")).toHaveValue("30")
    expect(screen.getByTestId("stats-height")).toHaveValue("40")
    expect(screen.getByTestId("stats-angle")).toHaveValue("0")
    expect(screen.getByTestId("stats-width")).not.toBeDisabled()
  })

  it("typing a new width and blurring commits onChange with the typed value", async () => {
    const onChange = vi.fn()
    render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
    const input = screen.getByTestId("stats-width")
    await userEvent.clear(input)
    await userEvent.type(input, "75")
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ width: 75 })
  })

  it("Enter commits the same way as blur", async () => {
    const onChange = vi.fn()
    render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
    const input = screen.getByTestId("stats-x")
    await userEvent.clear(input)
    await userEvent.type(input, "99{Enter}")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ x: 99 })
  })

  it("Escape reverts the typed value without committing", async () => {
    const onChange = vi.fn()
    render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
    const input = screen.getByTestId("stats-height")
    await userEvent.clear(input)
    await userEvent.type(input, "999")
    await userEvent.keyboard("{Escape}")
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue("40")
  })

  it("typing 0 or a negative width clamps to a minimum of 1 before committing", async () => {
    const onChange = vi.fn()
    render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
    const input = screen.getByTestId("stats-width")
    await userEvent.clear(input)
    await userEvent.type(input, "-5")
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ width: 1 })
  })

  it("committing the angle field converts typed degrees back to radians", async () => {
    const onChange = vi.fn()
    render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
    const input = screen.getByTestId("stats-angle")
    await userEvent.clear(input)
    await userEvent.type(input, "90")
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ angle: Math.PI / 2 })
  })
})
