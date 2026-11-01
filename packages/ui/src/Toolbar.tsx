import type { ToolName } from "@excalidraw-clone/tools"
import { MoreShapesMenu } from "./MoreShapesMenu"
import { IconButton } from "./shared/IconButton"
import { Icon } from "./shared/Icon"
import { DEFAULT_TOOL_KEYS } from "./toolKeys"

// Visual groups, separated by dividers: pick | shapes (+ more) | draw | insert | utilities.
const TOOL_GROUPS: readonly (readonly ToolName[])[] = [
  ["selection", "lasso"],
  ["rectangle", "ellipse", "diamond", "triangle", "parallelogram", "hexagon"],
  ["arrow", "line", "freedraw", "text"],
  ["image", "note", "frame"],
  ["eraser", "laser", "comment"],
]
const SHAPES_GROUP = 1
// Narrow screens start the second toolbar row at the insert group.
const ROW_BREAK_GROUP = 3

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
      <Icon name={name} />
    </IconButton>
  )

  return (
    <div
      // Each group draws its divider in the column gap before it. Below 960px the
      // toolbar breaks into two rows before the insert group, which drops its divider.
      className={`flex flex-wrap items-center justify-center gap-x-[11px] gap-y-1 rounded-xl bg-panel p-1 shadow-panel ${className ?? ""}`}
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
        <Icon name={lockActiveTool ? "lock" : "unlock"} />
      </IconButton>
      {TOOL_GROUPS.map((group, i) => [
        i === ROW_BREAK_GROUP && (
          <span key="row-break" className="h-0 basis-full min-[960px]:hidden" aria-hidden />
        ),
        <div
          key={group[0]}
          className={`relative flex items-center gap-0.5 before:absolute before:-left-[6px] before:bottom-2 before:top-2 before:w-px before:bg-panel-active ${
            i === ROW_BREAK_GROUP ? "max-[959px]:before:hidden" : ""
          }`}
        >
          {group.map(renderItem)}
          {i === SHAPES_GROUP && (
            <MoreShapesMenu
              t={t}
              activeTool={activeTool}
              open={moreShapesOpen}
              onOpenChange={onMoreShapesOpenChange}
              onSelectTool={(tool) => onSelectTool(tool)}
              {...(onOpenStickers ? { onOpenStickers } : {})}
            />
          )}
        </div>,
      ])}
    </div>
  )
}
