import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { preload } from "react-dom"
import "./globals.css"

export const metadata: Metadata = {
  title: "Excalidraw Clone",
  description:
    "A hand-drawn style whiteboard: sketch diagrams, flowcharts and notes in the browser.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome follows the app background in either theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  colorScheme: "light dark",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // React 19 resource preloading: emits <link rel="preload"> in <head>, so the
  // hand-drawn font is ready by the first canvas frame instead of text being drawn
  // in a fallback font and re-fitted once Caveat arrives (Latin subset, upright).
  preload("/fonts/caveat-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" })
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
