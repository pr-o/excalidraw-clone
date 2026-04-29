// eslint.config.mjs
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import importX from "eslint-plugin-import-x"
import globals from "globals"

const ALLOWED_DEPS = {
  "@excalidraw-clone/geometry": [],
  "@excalidraw-clone/scene": ["@excalidraw-clone/geometry"],
  "@excalidraw-clone/renderer": ["@excalidraw-clone/geometry", "@excalidraw-clone/scene"],
  "@excalidraw-clone/tools": ["@excalidraw-clone/geometry", "@excalidraw-clone/scene"],
  "@excalidraw-clone/persistence": ["@excalidraw-clone/scene"],
  "@excalidraw-clone/ui": ["@excalidraw-clone/scene", "@excalidraw-clone/tools"],
}

const FORBIDDEN_FOR_NON_UI = ["react", "react-dom", "react/jsx-runtime"]

const allWorkspacePackages = Object.keys(ALLOWED_DEPS)

function packageRules(pkgName, allowedDeps) {
  const forbiddenWorkspaceDeps = allWorkspacePackages.filter(
    (p) => p !== pkgName && !allowedDeps.includes(p),
  )
  const forbiddenReact = pkgName === "@excalidraw-clone/ui" ? [] : FORBIDDEN_FOR_NON_UI
  const allForbidden = [...forbiddenWorkspaceDeps, ...forbiddenReact]

  return {
    files: [`packages/${pkgName.replace("@excalidraw-clone/", "")}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: allForbidden.map((name) => ({
            name,
            message: `${pkgName} is not allowed to import ${name}. See design spec § 4.`,
          })),
        },
      ],
    },
  }
}

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "import-x": importX },
    rules: {
      "import-x/no-cycle": ["error", { maxDepth: 10 }],
      "import-x/no-self-import": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Per-package boundary rules
  ...Object.entries(ALLOWED_DEPS).map(([pkg, deps]) => packageRules(pkg, deps)),
)
