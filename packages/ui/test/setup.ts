import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})

// Polyfill: jsdom doesn't implement HTMLDialogElement.showModal/close.
// Stub them so `<dialog>`-using components don't crash in tests.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (): void {
      this.setAttribute("open", "")
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (): void {
      this.removeAttribute("open")
      this.dispatchEvent(new Event("close"))
    }
  }
}
