import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { Icon } from "../shared/Icon"

export type T = (key: string) => string
export type OnChange = (patch: Partial<ExcalidrawElement>) => void

export const ACTION =
  "flex h-8 flex-1 items-center justify-center rounded-md border border-panel px-1 text-xs hover:bg-panel-hover"

/** Hairline between groups of related sections. */
export function Divider(): React.ReactElement {
  return <hr className="border-panel-subtle" />
}

/** Square icon-only action with its name as accessible label and tooltip. */
export function IconAction({
  label,
  icon,
  danger,
  ...rest
}: {
  label: string
  icon: string
  danger?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-8 flex-1 items-center justify-center rounded-md border disabled:pointer-events-none disabled:opacity-40 ${
        danger
          ? "border-danger text-danger hover:bg-danger-soft"
          : "border-panel hover:bg-panel-hover"
      }`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}

const CHECKER =
  "linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)"

// Chromium-only; the button is simply absent elsewhere.
interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>
}
const eyeDropperCtor = (): (new () => EyeDropperApi) | undefined =>
  (globalThis as { EyeDropper?: new () => EyeDropperApi }).EyeDropper

export function commonValue<V>(items: readonly object[], key: string): V | undefined {
  if (items.length === 0) return undefined
  const get = (item: object): unknown => (item as Record<string, unknown>)[key]
  const first = get(items[0] as object)
  return items.every((item) => get(item) === first) ? (first as V) : undefined
}

export function Section({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className={className}>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
  )
}

export function Choice({
  pressed,
  // flex-auto: longer labels (e.g. "Cartoonist") take more of the row instead of truncating.
  className = "h-8 min-w-0 flex-auto truncate px-1.5 text-xs",
  ...rest
}: { pressed: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`rounded-md border ${className} ${pressed ? "border-accent bg-accent-soft" : "border-panel hover:bg-panel-hover"}`}
      {...rest}
    />
  )
}

/** A row of mutually exclusive buttons, each patching `field` with its value. */
export function ChoiceRow<V>({
  field,
  items,
  group,
  from,
  onChange,
}: {
  field: string
  items: readonly (readonly [value: V, testId: string, label: React.ReactNode])[]
  group?: string | undefined
  from: readonly object[]
  onChange: OnChange
}): React.ReactElement {
  const current = commonValue<V>(from, field)
  return (
    <div
      className={`flex gap-1${group ? " mt-1" : ""}`}
      role={group ? "group" : undefined}
      aria-label={group}
    >
      {items.map(([value, testId, label]) => (
        <Choice
          key={testId}
          data-testid={testId}
          pressed={current === value}
          onClick={() => onChange({ [field]: value })}
        >
          {label}
        </Choice>
      ))}
    </div>
  )
}

/** Colour swatches plus, where supported, an eyedropper that picks from the screen. */
export function Swatches({
  t,
  colors,
  current,
  pick,
  prefix,
}: {
  t: T
  colors: readonly string[]
  current: string | undefined
  pick: (color: string) => void
  prefix: string
}): React.ReactElement {
  return (
    <div className="flex gap-1">
      {colors.map((c) => (
        <Swatch
          key={c}
          color={c}
          active={current === c}
          testId={`${prefix}-${c === "transparent" ? "none" : c.replace("#", "")}`}
          onClick={() => pick(c)}
        />
      ))}
      {eyeDropperCtor() && (
        <button
          type="button"
          data-testid={`${prefix}-eyedropper`}
          aria-label={t("properties.eyedropper")}
          title={t("properties.eyedropper")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-panel text-muted hover:bg-panel-hover"
          onClick={() => {
            const Ctor = eyeDropperCtor()
            // Escape rejects the promise; nothing to apply.
            void new Ctor!()
              .open()
              .then(({ sRGBHex }) => pick(sRGBHex))
              .catch(() => {})
          }}
        >
          <Icon name="eyedropper" />
        </button>
      )}
    </div>
  )
}

function Swatch({
  color,
  active,
  testId,
  onClick,
}: {
  color: string
  active: boolean
  testId: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      aria-label={color}
      className={`h-7 w-7 rounded-md border-2 ${active ? "border-accent" : "border-panel-subtle"}`}
      style={{
        backgroundColor: color === "transparent" ? "white" : color,
        backgroundImage: color === "transparent" ? CHECKER : undefined,
        backgroundSize: color === "transparent" ? "8px 8px" : undefined,
        backgroundPosition: color === "transparent" ? "0 0, 4px 4px" : undefined,
      }}
    />
  )
}
