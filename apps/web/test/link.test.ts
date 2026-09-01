import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import {
  commitElementLink,
  normalizeLinkInput,
  openLink,
  pickLinkIndicatorTarget,
  sanitizeLinkHref,
} from "../src/driver/link"

describe("normalizeLinkInput", () => {
  it("maps empty / whitespace-only input to null", () => {
    expect(normalizeLinkInput("")).toBeNull()
    expect(normalizeLinkInput("   ")).toBeNull()
  })

  it("prefixes https:// for a bare domain", () => {
    expect(normalizeLinkInput("example.com")).toBe("https://example.com")
  })

  it("trims before prefixing", () => {
    expect(normalizeLinkInput("  example.com  ")).toBe("https://example.com")
  })

  it("leaves an explicit URL scheme untouched", () => {
    expect(normalizeLinkInput("https://x.com")).toBe("https://x.com")
    expect(normalizeLinkInput("http://x.com")).toBe("http://x.com")
    expect(normalizeLinkInput("mailto:a@b.com")).toBe("mailto:a@b.com")
  })
})

describe("sanitizeLinkHref", () => {
  it("returns a normalized href for http(s) and mailto", () => {
    expect(sanitizeLinkHref("https://x.com")).toBe("https://x.com/")
    expect(sanitizeLinkHref("http://x.com/a")).toBe("http://x.com/a")
    expect(sanitizeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com")
  })

  it("rejects dangerous or unparseable values", () => {
    expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull()
    expect(sanitizeLinkHref("data:text/html,x")).toBeNull()
    expect(sanitizeLinkHref("file:///etc/passwd")).toBeNull()
    expect(sanitizeLinkHref("not a url")).toBeNull()
  })

  it("treats null / undefined / empty as no link", () => {
    expect(sanitizeLinkHref(null)).toBeNull()
    expect(sanitizeLinkHref(undefined)).toBeNull()
    expect(sanitizeLinkHref("")).toBeNull()
  })
})

describe("commitElementLink", () => {
  it("sets link on the matching element with a fresh object", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft = [rect]
    commitElementLink(draft, rect.id, "https://a.com")
    expect(draft[0]!.link).toBe("https://a.com")
    expect(draft[0]).not.toBe(rect)
  })

  it("clears link to null", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const draft = [rect]
    commitElementLink(draft, rect.id, null)
    expect(draft[0]!.link).toBeNull()
  })

  it("is a no-op when the id is absent", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft = [rect]
    expect(() => commitElementLink(draft, "nope", "x")).not.toThrow()
    expect(draft[0]).toBe(rect)
  })
})

describe("openLink", () => {
  it("opens a sanitized http(s) link in a new tab", () => {
    const spy = vi.spyOn(window, "open").mockReturnValue(null)
    openLink("https://example.com")
    expect(spy).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer")
    spy.mockRestore()
  })

  it("does nothing for a dangerous, empty, or missing link", () => {
    const spy = vi.spyOn(window, "open").mockReturnValue(null)
    openLink("javascript:alert(1)")
    openLink("")
    openLink(null)
    openLink(undefined)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("pickLinkIndicatorTarget", () => {
  it("returns the single selected element when it has a link", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)?.id).toBe(rect.id)
  })

  it("returns null when the single selected element has no link", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)).toBeNull()
  })

  it("returns null for a multi-selection", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
    const b = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), link: "https://b.com" }
    expect(pickLinkIndicatorTarget([a, b], [a.id, b.id], null)).toBeNull()
  })

  it("falls back to the linked element under the pointer", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
    expect(pickLinkIndicatorTarget([rect], [], { x: 50, y: 50 })?.id).toBe(rect.id)
  })

  it("returns null when the pointer is over an unlinked element", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    expect(pickLinkIndicatorTarget([rect], [], { x: 50, y: 50 })).toBeNull()
  })

  it("returns null when the sole selected element's link is unparseable", () => {
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      link: "https://hello world",
    }
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)).toBeNull()
  })

  it("returns null when the sole selected element's link uses a rejected scheme", () => {
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      link: "javascript:alert(1)",
    }
    expect(pickLinkIndicatorTarget([rect], [rect.id], null)).toBeNull()
  })

  it("returns null when the element under the pointer has an unopenable link", () => {
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }),
      link: "javascript:alert(1)",
    }
    expect(pickLinkIndicatorTarget([rect], [], { x: 50, y: 50 })).toBeNull()
  })
})
