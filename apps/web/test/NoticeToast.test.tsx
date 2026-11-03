import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NoticeToast, notify } from "../src/components/LiveAnnouncer"
import { ensureI18n } from "../src/i18n"

const renderToast = () =>
  render(
    <I18nextProvider i18n={ensureI18n("en")}>
      <NoticeToast />
    </I18nextProvider>,
  )

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("notify / NoticeToast", () => {
  it("shows nothing until notified, then shows the message and can be dismissed", () => {
    renderToast()
    expect(screen.queryByTestId("notice-toast")).toBeNull()
    act(() => notify("Could not save"))
    expect(screen.getByTestId("notice-toast").textContent).toContain("Could not save")
    fireEvent.click(screen.getByRole("button"))
    expect(screen.queryByTestId("notice-toast")).toBeNull()
  })

  it("disappears by itself after a few seconds", () => {
    vi.useFakeTimers()
    renderToast()
    act(() => notify("Could not open"))
    expect(screen.queryByTestId("notice-toast")).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(screen.queryByTestId("notice-toast")).toBeNull()
  })
})
