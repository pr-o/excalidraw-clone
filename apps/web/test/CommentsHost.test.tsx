import { addComment, Scene } from "@excalidraw-clone/scene"
import { act, cleanup, render, screen } from "@testing-library/react"
import React from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it } from "vitest"
import { CommentsHost } from "../src/components/CommentsHost"
import { ensureI18n } from "../src/i18n"
import { useAppStore } from "../src/store"

afterEach(() => {
  cleanup()
  act(() => useAppStore.setState({ presenting: false, commentsPanelOpen: false }))
})

describe("CommentsHost", () => {
  it("hides pins, threads and the panel while presenting", () => {
    const scene = new Scene([], undefined, addComment([], { kind: "point", x: 10, y: 10 }, "hi"))
    const id = scene.getComments()[0]!.id
    act(() => useAppStore.setState({ presenting: false, commentsPanelOpen: true }))
    render(
      <I18nextProvider i18n={ensureI18n("en")}>
        <CommentsHost scene={scene} />
      </I18nextProvider>,
    )
    act(() => useAppStore.getState().setActiveCommentId(id))
    expect(screen.getByTestId("comment-pin-1")).toBeTruthy()
    expect(screen.getByTestId("comment-thread")).toBeTruthy()
    expect(screen.getByTestId("comments-panel")).toBeTruthy()

    act(() => useAppStore.setState({ presenting: true }))
    expect(screen.queryByTestId("comment-pin-1")).toBeNull()
    expect(screen.queryByTestId("comment-thread")).toBeNull()
    expect(screen.queryByTestId("comments-panel")).toBeNull()

    act(() => useAppStore.setState({ presenting: false }))
    expect(screen.getByTestId("comment-pin-1")).toBeTruthy()
  })
})
