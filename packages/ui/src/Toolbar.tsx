import type { ToolName } from "@excalidraw-clone/tools"
import { IconButton } from "./shared/IconButton"
import { iconHTML } from "./shared/icons"

const TOOL_ITEMS: ReadonlyArray<{ name: ToolName; shortcut: string }> = [
  { name: "selection", shortcut: "V" },
  { name: "rectangle", shortcut: "R" },
  { name: "ellipse", shortcut: "O" },
  { name: "diamond", shortcut: "D" },
  { name: "triangle", shortcut: "3" },
  { name: "parallelogram", shortcut: "G" },
  { name: "hexagon", shortcut: "6" },
  { name: "line", shortcut: "L" },
  { name: "arrow", shortcut: "A" },
  { name: "freedraw", shortcut: "P" },
  { name: "text", shortcut: "T" },
  { name: "image", shortcut: "9" },
  { name: "eraser", shortcut: "E" },
  { name: "frame", shortcut: "F" },
  { name: "note", shortcut: "N" },
]

export interface ToolbarProps {
  t: (key: string) => string
  activeTool: ToolName
  onSelectTool: (tool: ToolName) => void
  lockActiveTool: boolean
  onToggleLock: (locked: boolean) => void
  className?: string
}

export function Toolbar({
  t,
  activeTool,
  onSelectTool,
  lockActiveTool,
  onToggleLock,
  className,
}: ToolbarProps): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg bg-white p-1 shadow ${className ?? ""}`}
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
      <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />
      {TOOL_ITEMS.map((item) => (
        <IconButton
          key={item.name}
          label={t(`toolbar.${item.name}`)}
          shortcut={item.shortcut}
          active={activeTool === item.name}
          onClick={() => onSelectTool(item.name)}
          data-testid={`toolbar-${item.name}`}
        >
          <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML(item.name) }} />
        </IconButton>
      ))}
    </div>
  )
}
