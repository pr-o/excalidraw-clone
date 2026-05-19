"use client"
import dynamic from "next/dynamic"

const App = dynamic(() => import("../components/App").then((m) => m.App), {
  ssr: false,
})

export default function Page(): React.ReactElement {
  return <App />
}
