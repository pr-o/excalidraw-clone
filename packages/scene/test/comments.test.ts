import { describe, expect, it, vi } from "vitest"
import {
  addComment,
  commentAnchorAt,
  deleteComment,
  replyToComment,
  resolveCommentPosition,
  sanitizeComments,
  setCommentResolved,
  type Comment,
} from "../src/comments"
import { newRectangle } from "../src/factories"
import { Scene } from "../src/scene"

const point = { kind: "point", x: 5, y: 6 } as const

describe("comment model", () => {
  it("adds, replies, resolves and deletes", () => {
    let list = addComment([], point, "  hello ", 1, "c1")
    expect(list).toEqual([
      { id: "c1", anchor: point, text: "hello", createdAt: 1, resolved: false, replies: [] },
    ])
    list = replyToComment(list, "c1", "re", 2, "r1")
    expect(list[0]!.replies).toEqual([{ id: "r1", text: "re", createdAt: 2 }])
    list = setCommentResolved(list, "c1", true)
    expect(list[0]!.resolved).toBe(true)
    expect(deleteComment(list, "c1")).toEqual([])
  })

  it("discards blank text", () => {
    const list = addComment([], point, "c", 1, "c1")
    expect(addComment(list, point, "   ")).toBe(list)
    expect(replyToComment(list, "c1", "\n")).toBe(list)
  })

  it("anchors to a hit element by offset, else to the point", () => {
    const rect = newRectangle({ x: 10, y: 20, width: 50, height: 50 })
    expect(commentAnchorAt({ x: 15, y: 30 }, rect)).toEqual({
      kind: "element",
      elementId: rect.id,
      dx: 5,
      dy: 10,
    })
    expect(commentAnchorAt({ x: 1, y: 2 }, null)).toEqual({ kind: "point", x: 1, y: 2 })
  })

  it("element-anchored pins follow the element and stay at a deleted element's last spot", () => {
    const rect = newRectangle({ x: 10, y: 20, width: 50, height: 50 })
    const [c] = addComment([], commentAnchorAt({ x: 15, y: 30 }, rect), "x") as Comment[]
    expect(resolveCommentPosition(c!.anchor, [rect])).toEqual({ x: 15, y: 30 })
    const moved = { ...rect, x: 100, y: 200 }
    expect(resolveCommentPosition(c!.anchor, [moved])).toEqual({ x: 105, y: 210 })
    expect(resolveCommentPosition(c!.anchor, [{ ...moved, isDeleted: true }])).toEqual({
      x: 105,
      y: 210,
    })
    expect(resolveCommentPosition(c!.anchor, [])).toBeNull()
  })

  it("sanitizes untrusted comment data", () => {
    const good = {
      id: "a",
      anchor: { kind: "element", elementId: "e", dx: 1, dy: 2 },
      text: "t",
      createdAt: 3,
      resolved: true,
      replies: [{ id: "r", text: "x", createdAt: 4, extra: 1 }, { id: 5 }],
    }
    expect(
      sanitizeComments([good, { id: "b", anchor: { kind: "point", x: "1", y: 2 } }, null, 7]),
    ).toEqual([{ ...good, replies: [{ id: "r", text: "x", createdAt: 4 }] }])
    expect(sanitizeComments("nope")).toEqual([])
  })
})

describe("Scene comments", () => {
  it("setComments notifies without touching undo history", () => {
    const scene = new Scene()
    expect(scene.getComments()).toEqual([])
    const fn = vi.fn()
    scene.subscribe(fn)
    const list = addComment([], point, "hi")
    scene.setComments(list)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(scene.canUndo()).toBe(false)
    expect(new Scene([], undefined, list).getComments()).toBe(list)
  })
})
