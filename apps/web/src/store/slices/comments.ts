import type { CommentAnchor } from "@excalidraw-clone/scene"
import type { StateCreator } from "zustand"

export interface CommentsSlice {
  commentsPanelOpen: boolean
  toggleCommentsPanel: () => void
  /** Thread whose popover is open, on the active page. */
  activeCommentId: string | null
  setActiveCommentId: (id: string | null) => void
  /** A just-placed pin awaiting its first comment; nothing is stored until submit. */
  commentDraft: CommentAnchor | null
  setCommentDraft: (anchor: CommentAnchor | null) => void
}

export const createCommentsSlice: StateCreator<CommentsSlice, [], [], CommentsSlice> = (set) => ({
  commentsPanelOpen: false,
  toggleCommentsPanel: () => set((s) => ({ commentsPanelOpen: !s.commentsPanelOpen })),
  activeCommentId: null,
  setActiveCommentId: (id) => set({ activeCommentId: id, commentDraft: null }),
  commentDraft: null,
  setCommentDraft: (anchor) => set({ commentDraft: anchor, activeCommentId: null }),
})
