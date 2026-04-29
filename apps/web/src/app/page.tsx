import { PACKAGE_NAME as GEOMETRY } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as RENDERER } from "@excalidraw-clone/renderer"
import { PACKAGE_NAME as TOOLS } from "@excalidraw-clone/tools"
import { PACKAGE_NAME as UI } from "@excalidraw-clone/ui"
import { PACKAGE_NAME as PERSISTENCE } from "@excalidraw-clone/persistence"

const packages = [GEOMETRY, SCENE, RENDERER, TOOLS, UI, PERSISTENCE]

export default function Home() {
  return (
    <main className="min-h-dvh p-8">
      <h1 className="text-2xl font-semibold">Excalidraw Clone</h1>
      <p className="mt-2 text-sm opacity-70">v1 scaffold — packages wired:</p>
      <ul className="mt-4 list-disc pl-6 text-sm">
        {packages.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </main>
  )
}
