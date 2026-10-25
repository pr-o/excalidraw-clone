import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as TOOLS_NAME } from "@excalidraw-clone/tools"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME, TOOLS_NAME]

export { Toolbar } from "./Toolbar"
export type { ToolbarProps } from "./Toolbar"

export { PropertiesPanel } from "./PropertiesPanel"
export type { PropertiesPanelProps, TableAction } from "./PropertiesPanel"

export { HamburgerMenu } from "./HamburgerMenu"
export type { HamburgerMenuProps, Locale, Theme } from "./HamburgerMenu"

export { HelpDialog } from "./HelpDialog"
export { ToolKeysDialog } from "./ToolKeysDialog"
export type { ToolKeysDialogProps, ToolKeysRow } from "./ToolKeysDialog"
export type { HelpDialogProps } from "./HelpDialog"

export { CommandPalette } from "./CommandPalette"
export type { CommandPaletteProps, PaletteCommand } from "./CommandPalette"

export { ContextMenu } from "./ContextMenu"
export type { ContextMenuItem, ContextMenuProps } from "./ContextMenu"

export { PagePickerFlyout } from "./PagePickerFlyout"
export type { PagePickerFlyoutProps, PagePickerPage } from "./PagePickerFlyout"

export { ExportDialog } from "./ExportDialog"
export type { ExportDialogProps, ExportOptions, ExportPageOption } from "./ExportDialog"

export { ResetCanvasDialog } from "./ResetCanvasDialog"
export type { ResetCanvasDialogProps } from "./ResetCanvasDialog"
export { SnapshotsDialog } from "./SnapshotsDialog"
export type { SnapshotListItem, SnapshotsDialogProps } from "./SnapshotsDialog"

export { MermaidImportDialog } from "./MermaidImportDialog"
export { MermaidExportDialog } from "./MermaidExportDialog"
export { STICKERS, StickerDialog } from "./StickerDialog"
export type { Sticker, StickerDialogProps } from "./StickerDialog"
export type { MermaidExportDialogProps } from "./MermaidExportDialog"
export type { MermaidImportDialogProps } from "./MermaidImportDialog"

export { LibraryPanel } from "./LibraryPanel"
export type { LibraryPanelProps } from "./LibraryPanel"

export { LayersPanel } from "./LayersPanel"
export type { LayersPanelProps } from "./LayersPanel"

export { HistoryPanel } from "./HistoryPanel"
export type { HistoryPanelProps } from "./HistoryPanel"

export { MoreShapesMenu } from "./MoreShapesMenu"
export type { MoreShapesMenuProps } from "./MoreShapesMenu"

export { PagesTabBar } from "./PagesTabBar"
export type { PagesTabBarProps } from "./PagesTabBar"

export { FindOverlay } from "./FindOverlay"
export type { FindOverlayProps } from "./FindOverlay"

export { StatsPanel } from "./StatsPanel"
export type { StatsPanelProps } from "./StatsPanel"

export { ICONS, iconHTML } from "./shared/icons"

export { ArrayDuplicateDialog } from "./ArrayDuplicateDialog"
export type { ArrayDuplicateDialogProps } from "./ArrayDuplicateDialog"

export { CommentComposer, CommentThread } from "./CommentThread"
export type { CommentComposerProps, CommentThreadProps } from "./CommentThread"
export { CommentsPanel } from "./CommentsPanel"
export type { CommentsPanelProps } from "./CommentsPanel"
