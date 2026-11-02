import { memo } from "react"
import { iconHTML } from "./icons"

// React 19 re-applies dangerouslySetInnerHTML whenever the props object is a
// new one (no __html string compare), rewriting every icon's DOM on each parent
// render. One stable object per icon name lets React skip unchanged icons.
const htmlFor = new Map<string, { __html: string }>()

/** A decorative icon from the static set in icons.ts. */
export const Icon = memo(function Icon({ name }: { name: string }): React.ReactElement {
  let html = htmlFor.get(name)
  if (!html) {
    html = { __html: iconHTML(name) }
    htmlFor.set(name, html)
  }
  return (
    <span aria-hidden className="flex items-center justify-center" dangerouslySetInnerHTML={html} />
  )
})
