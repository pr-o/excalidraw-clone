import type { ToolName } from "@excalidraw-clone/tools"
import { useEffect, useRef, useState } from "react"
import { MoreShapesMenu } from "./MoreShapesMenu"
import { useCloseOnEscape } from "./shared/useCloseOnEscape"
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

/** How many leading groups stay inline at a viewport width; the rest move to
 *  the "more tools" overflow menu so the toolbar stays a single row. */
const inlineGroupCount = (wide: boolean, medium: boolean): number => (wide ? 5 : medium ? 3 : 2)

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia !== "function" || window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(query)
    const onChange = (): void => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])
  return matches
}

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
  const inlineCount = inlineGroupCount(useMinWidth(960), useMinWidth(768))
  const overflow = TOOL_GROUPS.slice(inlineCount)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement | null>(null)
  useCloseOnEscape(overflowOpen, setOverflowOpen)
  useEffect(() => {
    if (!overflowOpen) return
    const onDown = (e: PointerEvent): void => {
      if (!overflowRef.current?.contains(e.target as Node)) setOverflowOpen(false)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [overflowOpen])

  const renderItem = (name: ToolName, inMenu = false): React.ReactElement => (
    <IconButton
      key={name}
      label={t(`toolbar.${name}`)}
      shortcut={(toolKeys?.[name] ?? DEFAULT_TOOL_KEYS[name]).toUpperCase()}
      active={activeTool === name}
      onClick={() => {
        onSelectTool(name)
        if (inMenu) setOverflowOpen(false)
      }}
      data-testid={`toolbar-${name}`}
    >
      <Icon name={name} />
    </IconButton>
  )
  const divider =
    "relative flex items-center gap-0.5 before:absolute before:-left-[6px] before:bottom-2 before:top-2 before:w-px before:bg-panel-active"

  return (
    <div
      // Each group draws its divider in the column gap before it.
      className={`flex items-center justify-center gap-x-[11px] rounded-xl bg-panel p-1 shadow-panel ${className ?? ""}`}
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
      {TOOL_GROUPS.slice(0, inlineCount).map((group, i) => (
        <div key={group[0]} className={divider}>
          {group.map((name) => renderItem(name))}
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
        </div>
      ))}
      {overflow.length > 0 && (
        <div ref={overflowRef} className={divider}>
          <IconButton
            label={t("toolbar.moreTools")}
            active={overflow.some((g) => g.includes(activeTool))}
            onClick={() => setOverflowOpen(!overflowOpen)}
            data-testid="toolbar-more-tools"
            aria-haspopup="true"
            aria-expanded={overflowOpen}
          >
            <Icon name="chevron-down" />
          </IconButton>
          {overflowOpen && (
            <div
              role="menu"
              aria-label={t("toolbar.moreTools")}
              className="absolute right-0 top-11 z-50 flex flex-col gap-1 rounded-xl bg-panel p-1 shadow-panel"
            >
              {overflow.map((group) => (
                <div key={group[0]} className="flex gap-0.5">
                  {group.map((name) => renderItem(name, true))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
