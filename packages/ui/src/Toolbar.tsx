import type { ToolName } from "@excalidraw-clone/tools"
import { MoreShapesMenu } from "./MoreShapesMenu"
import { IconButton } from "./shared/IconButton"
import { iconHTML } from "./shared/icons"
import { DEFAULT_TOOL_KEYS } from "./toolKeys"

const TOOL_ITEMS: readonly ToolName[] = [
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "parallelogram",
  "hexagon",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
  "eraser",
  "frame",
  "note",
  "lasso",
  "laser",
  "comment",
]

const HEXAGON_INDEX = TOOL_ITEMS.indexOf("hexagon")

export interface ToolbarProps {
  t: (key: string) => string
  activeTool: ToolName
  onSelectTool: (tool: ToolName) => void
  lockActiveTool: boolean
  onToggleLock: (locked: boolean) => void
  moreShapesOpen: boolean
  onMoreShapesOpenChange: (open: boolean) => void
  onOpenStickers?: () => void
  /** Effective tool keys (tool name -> key) for the tooltip hints; defaults otherwise. */
  toolKeys?: Readonly<Record<string, string>>
  className?: string
}

export function Toolbar({
  t,
  activeTool,
  onSelectTool,
  lockActiveTool,
  onToggleLock,
  moreShapesOpen,
  onMoreShapesOpenChange,
  onOpenStickers,
  toolKeys,
  className,
}: ToolbarProps): React.ReactElement {
  const renderItem = (name: ToolName): React.ReactElement => (
    <IconButton
      key={name}
      label={t(`toolbar.${name}`)}
      shortcut={(toolKeys?.[name] ?? DEFAULT_TOOL_KEYS[name]).toUpperCase()}
      active={activeTool === name}
      onClick={() => onSelectTool(name)}
      data-testid={`toolbar-${name}`}
    >
      <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML(name) }} />
    </IconButton>
  )

  return (
    <div
      className={`flex items-center gap-1 rounded-lg bg-panel p-1 shadow ${className ?? ""}`}
      role="toolbar"
      aria-label={t("toolbar.label")}
    >
      <IconButton
        label={t("toolbar.lock")}
        shortcut="Q"
        active={lockActiveTool}
        onClick={() => onToggleLock(!lockActiveTool)}
        data-testid="toolbar-lock"
      >
        <span aria-hidden>{lockActiveTool ? "🔒" : "🔓"}</span>
      </IconButton>
      <span className="mx-1 h-6 w-px bg-panel-active" aria-hidden />
      {TOOL_ITEMS.slice(0, HEXAGON_INDEX + 1).map(renderItem)}
      <MoreShapesMenu
        t={t}
        activeTool={activeTool}
        open={moreShapesOpen}
        onOpenChange={onMoreShapesOpenChange}
        onSelectTool={(tool) => onSelectTool(tool)}
        {...(onOpenStickers ? { onOpenStickers } : {})}
      />
      {TOOL_ITEMS.slice(HEXAGON_INDEX + 1).map(renderItem)}
    </div>
  )
}
