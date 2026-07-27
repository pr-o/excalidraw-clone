import { useEffect } from "react"
import { IconButton } from "./shared/IconButton"
import { iconHTML } from "./shared/icons"

export interface MoreShapesMenuProps {
  t: (key: string) => string
  activeTool: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTool: (tool: "pentagon" | "octagon") => void
  className?: string
}

export function MoreShapesMenu(props: MoreShapesMenuProps): React.ReactElement {
  const { open, onOpenChange } = props

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  const select = (tool: "pentagon" | "octagon") => (): void => {
    props.onSelectTool(tool)
    onOpenChange(false)
  }

  const isActive = props.activeTool === "pentagon" || props.activeTool === "octagon"

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <IconButton
        label={props.t("toolbar.moreShapes")}
        active={isActive}
        onClick={() => onOpenChange(!open)}
        data-testid="toolbar-more-shapes"
      >
        <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("more-shapes") }} />
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-50 flex gap-1 rounded-lg bg-white p-2 shadow-lg"
        >
          <IconButton
            label={props.t("toolbar.pentagon")}
            active={props.activeTool === "pentagon"}
            onClick={select("pentagon")}
            data-testid="toolbar-pentagon"
          >
            <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("pentagon") }} />
          </IconButton>
          <IconButton
            label={props.t("toolbar.octagon")}
            active={props.activeTool === "octagon"}
            onClick={select("octagon")}
            data-testid="toolbar-octagon"
          >
            <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("octagon") }} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
