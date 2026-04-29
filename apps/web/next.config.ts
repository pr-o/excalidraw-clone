import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@excalidraw-clone/geometry",
    "@excalidraw-clone/scene",
    "@excalidraw-clone/renderer",
    "@excalidraw-clone/tools",
    "@excalidraw-clone/ui",
    "@excalidraw-clone/persistence",
  ],
}

export default config
