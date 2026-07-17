import { Dialog } from "./shared/Dialog"

interface Shortcut {
  keys: string
  label: string
}

const TOOL_SHORTCUTS: readonly Shortcut[] = [
  { keys: "V", label: "shortcuts.selection" },
  { keys: "R", label: "shortcuts.rectangle" },
  { keys: "O", label: "shortcuts.ellipse" },
  { keys: "D", label: "shortcuts.diamond" },
  { keys: "3", label: "shortcuts.triangle" },
  { keys: "G", label: "shortcuts.parallelogram" },
  { keys: "6", label: "shortcuts.hexagon" },
  { keys: "L", label: "shortcuts.line" },
  { keys: "A", label: "shortcuts.arrow" },
  { keys: "P", label: "shortcuts.freedraw" },
  { keys: "T", label: "shortcuts.text" },
  { keys: "9", label: "shortcuts.image" },
  { keys: "E", label: "shortcuts.eraser" },
  { keys: "F", label: "shortcuts.frame" },
  { keys: "N", label: "shortcuts.note" },
]

const EDITOR_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Cmd/Ctrl+Z", label: "shortcuts.undo" },
  { keys: "Cmd/Ctrl+Shift+Z", label: "shortcuts.redo" },
  { keys: "Cmd/Ctrl+C", label: "shortcuts.copy" },
  { keys: "Cmd/Ctrl+V", label: "shortcuts.paste" },
  { keys: "Cmd/Ctrl+D", label: "shortcuts.duplicate" },
  { keys: "Cmd/Ctrl+G", label: "shortcuts.group" },
  { keys: "Cmd/Ctrl+Shift+G", label: "shortcuts.ungroup" },
  { keys: "Double-click", label: "shortcuts.addLabel" },
  { keys: "Delete", label: "shortcuts.delete" },
  { keys: "Cmd/Ctrl+A", label: "shortcuts.selectAll" },
  { keys: "Esc", label: "shortcuts.deselect" },
  { keys: "Hold Cmd/Ctrl", label: "shortcuts.bypassSnap" },
]

const VIEW_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Cmd/Ctrl+0", label: "shortcuts.zoomReset" },
  { keys: "Cmd/Ctrl++", label: "shortcuts.zoomIn" },
  { keys: "Cmd/Ctrl+-", label: "shortcuts.zoomOut" },
  { keys: "Space (hold)", label: "shortcuts.pan" },
  { keys: "Cmd/Ctrl+'", label: "shortcuts.toggleGrid" },
  { keys: "Cmd/Ctrl+/", label: "shortcuts.commandPalette" },
  { keys: "?", label: "shortcuts.help" },
]

export interface HelpDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  className?: string
}

export function HelpDialog({ t, open, onClose, className }: HelpDialogProps): React.ReactElement {
  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("shortcuts.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Group title={t("shortcuts.tools")} items={TOOL_SHORTCUTS} t={t} />
        <Group title={t("shortcuts.editor")} items={EDITOR_SHORTCUTS} t={t} />
        <Group title={t("shortcuts.view")} items={VIEW_SHORTCUTS} t={t} />
      </div>
    </Dialog>
  )
}

function Group({
  title,
  items,
  t,
}: {
  title: string
  items: readonly Shortcut[]
  t: (k: string) => string
}): React.ReactElement {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="space-y-1 text-sm">
        {items.map((s) => (
          <div key={`${s.keys}-${s.label}`} className="flex items-center justify-between">
            <dt className="text-gray-700">{t(s.label)}</dt>
            <dd>
              <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">
                {s.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
