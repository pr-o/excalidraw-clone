import { HelpDialog } from "@excalidraw-clone/ui"
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import { I18nextProvider, useTranslation } from "react-i18next"
import { ensureI18n } from "../src/i18n"

// jsdom doesn't implement HTMLDialogElement.showModal/close.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (): void {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function (): void {
    this.removeAttribute("open")
    this.dispatchEvent(new Event("close"))
  }
}

function RealHelpDialog(): React.ReactElement {
  const { t } = useTranslation()
  return <HelpDialog t={t} open onClose={() => {}} />
}

describe("HelpDialog — real i18n resolution", () => {
  it("renders translated shortcut row labels, not raw i18n keys", () => {
    const i18n = ensureI18n("en")
    render(
      <I18nextProvider i18n={i18n}>
        <RealHelpDialog />
      </I18nextProvider>,
    )
    expect(screen.getByText("Reset zoom")).toBeDefined()
    expect(screen.getByText("Zoom in")).toBeDefined()
    expect(screen.getByText("Pan")).toBeDefined()
    expect(screen.getByText("Undo")).toBeDefined()
    expect(screen.queryByText(/^shortcuts\./)).toBeNull()
  })
})
