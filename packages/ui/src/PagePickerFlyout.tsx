"use client"
import { useMenuPopup } from "./shared/useMenuPopup"

export interface PagePickerPage {
  id: string
  name: string
}

export interface PagePickerFlyoutProps {
  x: number
  y: number
  pages: readonly PagePickerPage[]
  onSelect: (pageId: string) => void
  onClose: () => void
}

export function PagePickerFlyout({
  x,
  y,
  pages,
  onSelect,
  onClose,
}: PagePickerFlyoutProps): React.ReactElement {
  const { ref: flyoutRef, pos } = useMenuPopup(x, y, onClose)

  return (
    <div
      ref={flyoutRef}
      role="menu"
      data-testid="page-picker-flyout"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-panel py-1 shadow-xl"
    >
      {pages.map((page) => (
        <button
          key={page.id}
          role="menuitem"
          type="button"
          data-testid={`page-picker-item-${page.id}`}
          onClick={() => onSelect(page.id)}
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
        >
          <span>{page.name}</span>
        </button>
      ))}
    </div>
  )
}
