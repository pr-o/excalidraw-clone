import { iconHTML } from "./icons"

/** A decorative icon from the static set in icons.ts. */
export function Icon({ name }: { name: string }): React.ReactElement {
  return (
    <span
      aria-hidden
      className="flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: iconHTML(name) }}
    />
  )
}
