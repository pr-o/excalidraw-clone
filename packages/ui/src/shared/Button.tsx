const VARIANTS = {
  secondary: "border border-panel",
  primary: "bg-accent text-white",
  danger: "bg-danger text-white",
} as const

/** A dialog's text button; disabled ones fade. `type` defaults to "button". */
export function Button({
  variant = "secondary",
  className,
  ...rest
}: {
  variant?: keyof typeof VARIANTS
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      type="button"
      className={`rounded px-3 py-1 text-sm disabled:opacity-50 ${VARIANTS[variant]} ${className ?? ""}`}
      {...rest}
    />
  )
}
