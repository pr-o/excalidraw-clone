import type { Point } from "@excalidraw-clone/geometry"
import { nanoid } from "nanoid"
import type { ExcalidrawElement } from "./types"

/** Where a comment pin sits: a fixed scene point, or an offset from an
 *  element's top-left so the pin follows the element when it moves. */
export type CommentAnchor =
  | { kind: "point"; x: number; y: number }
  | { kind: "element"; elementId: string; dx: number; dy: number }

export interface CommentReply {
  id: string
  text: string
  createdAt: number
}

/** A comment thread. Page scope comes from where it is stored (one list per
 *  page, on that page's Scene), so it carries no pageId of its own. */
export interface Comment {
  id: string
  anchor: CommentAnchor
  text: string
  createdAt: number
  resolved: boolean
  replies: readonly CommentReply[]
}

/** Anchor for a click at `at`: relative to `element` when the click hit one. */
export function commentAnchorAt(at: Point, element: ExcalidrawElement | null): CommentAnchor {
  return element
    ? { kind: "element", elementId: element.id, dx: at.x - element.x, dy: at.y - element.y }
    : { kind: "point", x: at.x, y: at.y }
}

/**
 * Scene position of a comment pin with anchor `a`. Element anchors resolve against the page's
 * elements *including deleted* ones: a deleted element's tombstone keeps its last
 * position, so the pin stays where the element was (and follows it again if the
 * delete is undone). Null only when the element id is unknown to the page.
 */
export function resolveCommentPosition(
  a: CommentAnchor,
  elementsIncludingDeleted: readonly ExcalidrawElement[],
): Point | null {
  if (a.kind === "point") return { x: a.x, y: a.y }
  const el = elementsIncludingDeleted.find((e) => e.id === a.elementId)
  return el ? { x: el.x + a.dx, y: el.y + a.dy } : null
}

/** Appends a comment; blank text is discarded (returns `comments` unchanged). */
export function addComment(
  comments: readonly Comment[],
  anchor: CommentAnchor,
  text: string,
  now = Date.now(),
  id = nanoid(),
): readonly Comment[] {
  const body = text.trim()
  if (!body) return comments
  return [...comments, { id, anchor, text: body, createdAt: now, resolved: false, replies: [] }]
}

export function replyToComment(
  comments: readonly Comment[],
  commentId: string,
  text: string,
  now = Date.now(),
  id = nanoid(),
): readonly Comment[] {
  const body = text.trim()
  if (!body) return comments
  return comments.map((c) =>
    c.id === commentId ? { ...c, replies: [...c.replies, { id, text: body, createdAt: now }] } : c,
  )
}

export function setCommentResolved(
  comments: readonly Comment[],
  commentId: string,
  resolved: boolean,
): readonly Comment[] {
  return comments.map((c) => (c.id === commentId ? { ...c, resolved } : c))
}

export function deleteComment(comments: readonly Comment[], commentId: string): readonly Comment[] {
  return comments.filter((c) => c.id !== commentId)
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === "string"

function sanitizeAnchor(raw: unknown): CommentAnchor | null {
  if (typeof raw !== "object" || raw === null) return null
  const a = raw as Record<string, unknown>
  if (a.kind === "point" && isNum(a.x) && isNum(a.y)) return { kind: "point", x: a.x, y: a.y }
  if (a.kind === "element" && isStr(a.elementId) && isNum(a.dx) && isNum(a.dy)) {
    return { kind: "element", elementId: a.elementId, dx: a.dx, dy: a.dy }
  }
  return null
}

/** Comments come from untrusted files: keep only well-formed threads and replies. */
export function sanitizeComments(raw: unknown): Comment[] {
  if (!Array.isArray(raw)) return []
  const out: Comment[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const c = item as Record<string, unknown>
    const anchor = sanitizeAnchor(c.anchor)
    if (!anchor || !isStr(c.id) || !isStr(c.text) || !isNum(c.createdAt)) continue
    const replies = Array.isArray(c.replies)
      ? c.replies.filter(
          (r): r is CommentReply =>
            typeof r === "object" &&
            r !== null &&
            isStr((r as CommentReply).id) &&
            isStr((r as CommentReply).text) &&
            isNum((r as CommentReply).createdAt),
        )
      : []
    out.push({
      id: c.id,
      anchor,
      text: c.text,
      createdAt: c.createdAt,
      resolved: c.resolved === true,
      replies: replies.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    })
  }
  return out
}
