# Phase 1: Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up an empty-but-buildable TurboRepo + pnpm monorepo with all 7 workspaces (1 app + 6 packages), shared TypeScript / ESLint / Prettier / Vitest tooling, the architectural import-boundary rule from the design spec, Husky pre-commit hooks, and a running Next.js 16 + Tailwind v4 page in `apps/web`.

**Architecture:** Domain-split monorepo per design spec section 4. pnpm workspaces with TurboRepo for the task graph. Each package is independently testable via Vitest. `apps/web` runs Next 16 with React 19. ESLint enforces the cross-package dependency rules (`geometry → ø`, `scene → geometry`, `renderer → scene + geometry`, etc.) so a misplaced import fails CI.

**Tech Stack:** pnpm 10, TurboRepo 2, TypeScript 5.7+, Next.js 16.2, React 19, Tailwind CSS v4, Vitest 2, ESLint 9 (flat config), Prettier 3, Husky 9, lint-staged 15.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 4 (package architecture), § 11 (testing strategy), § 12 phase 1.

**Working branch:** `develop`. Each task ends with a commit on `develop`.

---

## Task 1: Initialize pnpm workspace at the repo root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.nvmrc`

- [ ] **Step 1: Create `.nvmrc`**

```
22
```

- [ ] **Step 2: Create `.npmrc`**

```
strict-peer-dependencies=false
auto-install-peers=true
shamefully-hoist=false
prefer-workspace-packages=true
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "excalidraw-clone",
  "version": "0.0.0",
  "private": true,
  "description": "Solo-drawing Excalidraw clone — TurboRepo monorepo",
  "packageManager": "pnpm@10.32.0",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.2",
    "prettier": "^3.4.2"
  }
}
```

- [ ] **Step 5: Run install and verify**

```bash
pnpm install
```

Expected: pnpm reports "Done" and creates `node_modules/` + `pnpm-lock.yaml`. No package errors (workspaces are empty so far).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc .nvmrc pnpm-lock.yaml
git commit -m "Phase 1.1: pnpm workspace skeleton"
```

---

## Task 2: Add TurboRepo configuration

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Create `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": ["*.tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 2: Verify Turbo runs**

```bash
pnpm turbo run lint --dry=json | head -20
```

Expected: JSON output listing zero tasks (no packages have a `lint` script yet). No errors.

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "Phase 1.2: TurboRepo task graph"
```

---

## Task 3: Shared TypeScript base config

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json` (root, references — added later as workspaces grow)

- [ ] **Step 1: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "useDefineForClassFields": true,
    "jsx": "preserve"
  },
  "exclude": ["node_modules", "dist", ".next", ".turbo"]
}
```

- [ ] **Step 2: Create root pass-through `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "include": [],
  "files": []
}
```

- [ ] **Step 3: Verify TS resolves the base config**

```bash
pnpm exec tsc --showConfig --project tsconfig.base.json | head -30
```

Expected: prints the resolved compilerOptions JSON. No "file not found" or syntax errors.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "Phase 1.3: shared TypeScript base config"
```

---

## Task 4: Prettier configuration

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Create `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "always",
  "bracketSpacing": true
}
```

- [ ] **Step 2: Create `.prettierignore`**

```
node_modules
dist
.next
.turbo
coverage
pnpm-lock.yaml
```

- [ ] **Step 3: Verify Prettier runs**

```bash
pnpm format:check
```

Expected: prints "All matched files use Prettier code style!" (or similar). Exit code 0.

- [ ] **Step 4: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "Phase 1.4: Prettier config"
```

---

## Task 5: Shared ESLint flat config (without boundary rule yet)

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (add eslint deps + `lint` script)

- [ ] **Step 1: Add ESLint dev deps to root**

```bash
pnpm add -Dw eslint@^9.17.0 typescript-eslint@^8.18.0 @eslint/js@^9.17.0 globals@^15.14.0 eslint-plugin-import-x@^4.6.1
```

Expected: pnpm installs the four packages and updates `pnpm-lock.yaml`.

- [ ] **Step 2: Create `eslint.config.mjs`**

```js
// eslint.config.mjs
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import importX from "eslint-plugin-import-x"
import globals from "globals"

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
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
)
```

- [ ] **Step 3: Verify the ESLint config loads without error**

```bash
pnpm exec eslint --print-config eslint.config.mjs > /dev/null
```

Expected: exit 0. (We don't run `eslint .` at the root because root-level TS files aren't in a tsconfig and `recommendedTypeChecked` would fail on them. Per-package `lint` scripts handle the actual linting.)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs pnpm-lock.yaml package.json
git commit -m "Phase 1.5: shared ESLint flat config"
```

---

## Task 6: Vitest base config

**Files:**
- Create: `vitest.workspace.ts`
- Modify: root `package.json` (add Vitest dev dep)

- [ ] **Step 1: Add Vitest to root**

```bash
pnpm add -Dw vitest@^2.1.8 @vitest/coverage-v8@^2.1.8
```

- [ ] **Step 2: Create `vitest.workspace.ts`**

```ts
import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/*",
  "apps/*",
])
```

- [ ] **Step 3: Verify Vitest discovers the workspace**

```bash
pnpm exec vitest --no-color list 2>&1 | head -10
```

Expected: prints "No test files found" (no packages exist yet) — no parsing errors. Exit code 1 is acceptable here because there are no tests; we're verifying the workspace config parses.

- [ ] **Step 4: Commit**

```bash
git add vitest.workspace.ts package.json pnpm-lock.yaml
git commit -m "Phase 1.6: Vitest workspace config"
```

---

## Task 7: First package skeleton — `@excalidraw-clone/geometry`

This is the template. We'll repeat for the other 5 packages.

**Files:**
- Create: `packages/geometry/package.json`
- Create: `packages/geometry/tsconfig.json`
- Create: `packages/geometry/vitest.config.ts`
- Create: `packages/geometry/src/index.ts`
- Create: `packages/geometry/src/version.ts`
- Create: `packages/geometry/test/version.test.ts`

- [ ] **Step 1: Create `packages/geometry/package.json`**

```json
{
  "name": "@excalidraw-clone/geometry",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

(Note on `"main": "./src/index.ts"` — this is "internal package, source-only" mode. Consumers import directly from TS source. No build step needed in dev. Next.js will compile it via `transpilePackages`.)

- [ ] **Step 2: Create `packages/geometry/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/geometry/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "geometry",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/geometry/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/geometry" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/geometry/src/index.ts`**

```ts
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
```

- [ ] **Step 6: Create the failing test `packages/geometry/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("geometry package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/geometry")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })
})
```

- [ ] **Step 7: Install workspace dependencies and run the test**

```bash
pnpm install
pnpm --filter @excalidraw-clone/geometry test
```

Expected: 2 tests pass.

- [ ] **Step 8: Verify typecheck passes**

```bash
pnpm --filter @excalidraw-clone/geometry typecheck
```

Expected: exit 0, no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/geometry pnpm-lock.yaml
git commit -m "Phase 1.7: geometry package skeleton with smoke test"
```

---

## Task 8: Repeat skeleton for `@excalidraw-clone/scene`

Same pattern as Task 7. The `scene` package depends on `geometry`.

**Files:**
- Create: `packages/scene/package.json`
- Create: `packages/scene/tsconfig.json`
- Create: `packages/scene/vitest.config.ts`
- Create: `packages/scene/src/index.ts`
- Create: `packages/scene/src/version.ts`
- Create: `packages/scene/test/version.test.ts`

- [ ] **Step 1: Create `packages/scene/package.json`**

```json
{
  "name": "@excalidraw-clone/scene",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/geometry": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/scene/tsconfig.json`** (identical to geometry)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/scene/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "scene",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/scene/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/scene" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/scene/src/index.ts`**

```ts
import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME]
```

(The import from `geometry` exists to verify cross-package resolution works.)

- [ ] **Step 6: Create `packages/scene/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("scene package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/scene")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on @excalidraw-clone/geometry", () => {
    expect(DEPENDS_ON).toContain("@excalidraw-clone/geometry")
  })
})
```

- [ ] **Step 7: Install + run test + typecheck**

```bash
pnpm install
pnpm --filter @excalidraw-clone/scene test
pnpm --filter @excalidraw-clone/scene typecheck
```

Expected: 3 tests pass; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/scene pnpm-lock.yaml
git commit -m "Phase 1.8: scene package skeleton (depends on geometry)"
```

---

## Task 9: Skeleton for `@excalidraw-clone/renderer`

Depends on `scene` + `geometry`.

- [ ] **Step 1: Create `packages/renderer/package.json`**

```json
{
  "name": "@excalidraw-clone/renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/geometry": "workspace:*",
    "@excalidraw-clone/scene": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/renderer/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/renderer/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "renderer",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/renderer/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/renderer" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/renderer/src/index.ts`**

```ts
import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]
```

- [ ] **Step 6: Create `packages/renderer/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("renderer package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/renderer")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on geometry and scene", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/geometry", "@excalidraw-clone/scene"])
  })
})
```

- [ ] **Step 7: Install + verify**

```bash
pnpm install
pnpm --filter @excalidraw-clone/renderer test
pnpm --filter @excalidraw-clone/renderer typecheck
```

Expected: 3 tests pass; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer pnpm-lock.yaml
git commit -m "Phase 1.9: renderer package skeleton (depends on scene + geometry)"
```

---

## Task 10: Skeleton for `@excalidraw-clone/tools`

Depends on `scene` + `geometry`.

- [ ] **Step 1: Create `packages/tools/package.json`**

```json
{
  "name": "@excalidraw-clone/tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/geometry": "workspace:*",
    "@excalidraw-clone/scene": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/tools/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/tools/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "tools",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/tools/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/tools" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/tools/src/index.ts`**

```ts
import { PACKAGE_NAME as GEOMETRY_NAME } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [GEOMETRY_NAME, SCENE_NAME]
```

- [ ] **Step 6: Create `packages/tools/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("tools package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/tools")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on geometry and scene", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/geometry", "@excalidraw-clone/scene"])
  })
})
```

- [ ] **Step 7: Install + verify**

```bash
pnpm install
pnpm --filter @excalidraw-clone/tools test
pnpm --filter @excalidraw-clone/tools typecheck
```

Expected: 3 tests pass; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/tools pnpm-lock.yaml
git commit -m "Phase 1.10: tools package skeleton (depends on scene + geometry)"
```

---

## Task 11: Skeleton for `@excalidraw-clone/persistence`

Depends only on `scene`.

- [ ] **Step 1: Create `packages/persistence/package.json`**

```json
{
  "name": "@excalidraw-clone/persistence",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/scene": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/persistence/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/persistence/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "persistence",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/persistence/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/persistence" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/persistence/src/index.ts`**

```ts
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME]
```

- [ ] **Step 6: Create `packages/persistence/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("persistence package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/persistence")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on scene only", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/scene"])
  })
})
```

- [ ] **Step 7: Install + verify**

```bash
pnpm install
pnpm --filter @excalidraw-clone/persistence test
pnpm --filter @excalidraw-clone/persistence typecheck
```

Expected: 3 tests pass; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/persistence pnpm-lock.yaml
git commit -m "Phase 1.11: persistence package skeleton (depends on scene)"
```

---

## Task 12: Skeleton for `@excalidraw-clone/ui` (React-coupled)

This is the only package besides `apps/web` that may depend on React.

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@excalidraw-clone/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/scene": "workspace:*",
    "@excalidraw-clone/tools": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/ui/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "ui",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create `packages/ui/src/version.ts`**

```ts
export const PACKAGE_NAME = "@excalidraw-clone/ui" as const
export const PACKAGE_VERSION = "0.0.0" as const
```

- [ ] **Step 5: Create `packages/ui/src/index.ts`**

```ts
import { PACKAGE_NAME as SCENE_NAME } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as TOOLS_NAME } from "@excalidraw-clone/tools"
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export const DEPENDS_ON: readonly string[] = [SCENE_NAME, TOOLS_NAME]
```

- [ ] **Step 6: Create `packages/ui/test/version.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("ui package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/ui")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on scene and tools", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/scene", "@excalidraw-clone/tools"])
  })
})
```

- [ ] **Step 7: Install + verify**

```bash
pnpm install
pnpm --filter @excalidraw-clone/ui test
pnpm --filter @excalidraw-clone/ui typecheck
```

Expected: 3 tests pass; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "Phase 1.12: ui package skeleton (React peer dep, depends on scene + tools)"
```

---

## Task 13: Verify the full workspace runs together

After Tasks 7–12, all 6 packages exist. Run them through TurboRepo to confirm.

- [ ] **Step 1: Run all package tests via Turbo**

```bash
pnpm test
```

Expected: TurboRepo runs `test` in each of the 6 packages. All pass. Total tests: 2 (geometry) + 3 (scene) + 3 (renderer) + 3 (tools) + 3 (persistence) + 3 (ui) = **17 tests**.

- [ ] **Step 2: Run typecheck across all packages**

```bash
pnpm typecheck
```

Expected: all 6 packages typecheck cleanly (exit 0).

- [ ] **Step 3: Run TurboRepo build**

```bash
pnpm build
```

Expected: 6 build tasks run; all succeed (each is a `tsc --noEmit` so emits no artifacts but verifies types).

- [ ] **Step 4: No commit** (this task is verification-only).

---

## Task 14: Scaffold `apps/web` — Next.js 16 + Tailwind v4

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/next-env.d.ts` (auto-generated by Next, but we ship a stub)
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/test/smoke.test.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@excalidraw-clone/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "dev": "next dev --turbopack -p 3000",
    "start": "next start -p 3000",
    "lint": "eslint src test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@excalidraw-clone/geometry": "workspace:*",
    "@excalidraw-clone/persistence": "workspace:*",
    "@excalidraw-clone/renderer": "workspace:*",
    "@excalidraw-clone/scene": "workspace:*",
    "@excalidraw-clone/tools": "workspace:*",
    "@excalidraw-clone/ui": "workspace:*",
    "next": "^16.2.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "src/**/*",
    "test/**/*",
    ".next/types/**/*"
  ],
  "exclude": ["node_modules", ".next", "dist"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```ts
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
```

- [ ] **Step 4: Create `apps/web/postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
```

- [ ] **Step 5: Create `apps/web/src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 6: Create `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Excalidraw Clone",
  description: "Solo-drawing Excalidraw clone — v1 scaffold",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Create `apps/web/src/app/page.tsx`**

```tsx
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
```

- [ ] **Step 8: Create `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 9: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 10: Create `apps/web/test/smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { PACKAGE_NAME as GEOMETRY } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as RENDERER } from "@excalidraw-clone/renderer"
import { PACKAGE_NAME as TOOLS } from "@excalidraw-clone/tools"
import { PACKAGE_NAME as UI } from "@excalidraw-clone/ui"
import { PACKAGE_NAME as PERSISTENCE } from "@excalidraw-clone/persistence"

describe("apps/web wiring smoke", () => {
  it("imports all six packages by name", () => {
    expect([GEOMETRY, SCENE, RENDERER, TOOLS, UI, PERSISTENCE]).toEqual([
      "@excalidraw-clone/geometry",
      "@excalidraw-clone/scene",
      "@excalidraw-clone/renderer",
      "@excalidraw-clone/tools",
      "@excalidraw-clone/ui",
      "@excalidraw-clone/persistence",
    ])
  })
})
```

- [ ] **Step 11: Install dependencies**

```bash
pnpm install
```

Expected: pnpm installs Next 16, React 19, Tailwind 4, and links workspace packages.

- [ ] **Step 12: Run the test**

```bash
pnpm --filter @excalidraw-clone/web test
```

Expected: 1 test passes.

- [ ] **Step 13: Run typecheck**

```bash
pnpm --filter @excalidraw-clone/web typecheck
```

Expected: exit 0. (If `next-env.d.ts` reference errors appear, run `pnpm --filter @excalidraw-clone/web exec next telemetry status` once to let Next initialize, then re-run.)

- [ ] **Step 14: Run dev server briefly to confirm it boots**

```bash
timeout 15 pnpm --filter @excalidraw-clone/web dev 2>&1 | tee /tmp/next-dev.log || true
grep -E "Ready in|Local:" /tmp/next-dev.log
```

Expected: log contains "Ready in <ms>" or "Local: http://localhost:3000".

- [ ] **Step 15: Run production build**

```bash
pnpm --filter @excalidraw-clone/web build
```

Expected: Next compiles successfully; output includes "Compiled successfully" and route table for `/`.

- [ ] **Step 16: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "Phase 1.13: Next.js 16 + Tailwind v4 web app skeleton"
```

---

## Task 15: Add the architectural import-boundary rule

This is what makes the monorepo's contract from spec § 4 enforceable.

**Files:**
- Modify: `eslint.config.mjs`
- Create: `eslint-rules/no-cross-boundary-imports.mjs` (custom rule check via `import-x/no-restricted-paths`)

We use `eslint-plugin-import-x`'s `no-restricted-paths` to encode the dependency graph:

```
geometry → ø
scene → geometry
renderer → scene + geometry
tools → scene + geometry
persistence → scene
ui → scene + tools (+ react peer)
apps/web → all
```

- [ ] **Step 1: Modify `eslint.config.mjs` to add the boundary rules**

Replace the file with:

```js
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
  const forbiddenWorkspaceDeps = allWorkspacePackages.filter((p) => p !== pkgName && !allowedDeps.includes(p))
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
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Per-package boundary rules
  ...Object.entries(ALLOWED_DEPS).map(([pkg, deps]) => packageRules(pkg, deps)),
)
```

- [ ] **Step 2: Run lint across all packages — should pass**

```bash
pnpm lint
```

Expected: every package's `lint` script runs (eslint src test) and exits 0. No boundary violations because nothing is misplaced yet.

- [ ] **Step 3: Verify the rule by writing an intentional violation**

Add a temporary forbidden import in `packages/geometry/src/index.ts`:

```ts
// TEMP — verify boundary rule
import { PACKAGE_NAME } from "@excalidraw-clone/scene"
console.log(PACKAGE_NAME)
```

Then run:

```bash
pnpm --filter @excalidraw-clone/geometry lint
```

Expected: lint **fails** with the message "@excalidraw-clone/geometry is not allowed to import @excalidraw-clone/scene. See design spec § 4."

- [ ] **Step 4: Revert the violation**

Restore `packages/geometry/src/index.ts` to:

```ts
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
```

Verify lint passes again:

```bash
pnpm --filter @excalidraw-clone/geometry lint
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs
git commit -m "Phase 1.14: enforce cross-package import boundaries via ESLint"
```

---

## Task 16: Add Husky + lint-staged pre-commit hook

**Files:**
- Modify: root `package.json` (add husky + lint-staged + `prepare` script + `lint-staged` config)
- Create: `.husky/pre-commit`

- [ ] **Step 1: Install husky + lint-staged**

```bash
pnpm add -Dw husky@^9.1.7 lint-staged@^15.3.0
```

- [ ] **Step 2: Modify root `package.json`**

Add `"prepare": "husky"` to `scripts`, and add a top-level `"lint-staged"` config:

```json
{
  "scripts": {
    "prepare": "husky",
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,json,md,css,yaml,yml}": ["prettier --write"]
  }
}
```

- [ ] **Step 3: Initialize Husky and create the hook**

```bash
pnpm exec husky init
```

This creates `.husky/pre-commit` with default content. Replace it with:

```bash
pnpm exec lint-staged
```

(The file should contain just that one line. No shebang needed for husky v9.)

- [ ] **Step 4: Verify the hook fires**

Stage a no-op change and commit:

```bash
echo "// hook test" >> packages/geometry/src/index.ts
git add packages/geometry/src/index.ts
git commit -m "test: verify husky hook fires"
```

Expected: lint-staged runs ESLint + Prettier on the staged file. The commit succeeds. The trailing comment is harmless.

- [ ] **Step 5: Clean up the test commit**

```bash
git reset --soft HEAD~1
git restore --staged packages/geometry/src/index.ts
git restore packages/geometry/src/index.ts
```

Expected: working tree is clean again.

- [ ] **Step 6: Commit Husky + lint-staged setup**

```bash
git add package.json pnpm-lock.yaml .husky/pre-commit
git commit -m "Phase 1.15: Husky pre-commit hook with lint-staged"
```

---

## Task 17: Final integration check

- [ ] **Step 1: Clean install from scratch**

```bash
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install
```

Expected: clean install succeeds with no peer-dep warnings.

- [ ] **Step 2: Run the full pipeline**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: every command exits 0. Vitest reports **18 tests passing** total (17 from packages + 1 from apps/web). Next builds the `/` route. Turbo prints a green summary.

- [ ] **Step 3: Verify directory structure**

```bash
find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.turbo/*' -not -path '*/.git/*' | sort
```

Expected: a tree matching:

```
.
./.husky
./apps
./apps/web
./apps/web/src
./apps/web/test
./docs
./docs/superpowers
./packages
./packages/geometry
./packages/geometry/src
./packages/geometry/test
./packages/persistence
./packages/persistence/src
./packages/persistence/test
./packages/renderer
./packages/renderer/src
./packages/renderer/test
./packages/scene
./packages/scene/src
./packages/scene/test
./packages/tools
./packages/tools/src
./packages/tools/test
./packages/ui
./packages/ui/src
./packages/ui/test
```

- [ ] **Step 4: Commit any cleanup needed (typically none)**

If steps 1–3 produced no diffs, skip this step. Otherwise:

```bash
git add -A
git commit -m "Phase 1.16: integration cleanup"
```

- [ ] **Step 5: Push the branch**

```bash
git push origin develop
```

Expected: all Phase 1 commits land on `origin/develop`.

---

## Done criteria

Phase 1 is complete when:

1. `pnpm install` is reproducible (lockfile committed, no warnings).
2. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass on a clean checkout.
3. `pnpm --filter @excalidraw-clone/web dev` serves a page at `localhost:3000` listing the 6 wired packages.
4. The boundary rule rejects an import from a package outside its allow-list (verified with the throwaway violation in Task 15.3).
5. The Husky pre-commit hook runs lint-staged on staged files (verified in Task 16.4).
6. All 17 commits land on `origin/develop`.

## What is intentionally NOT in Phase 1

- Actual canvas rendering, scene model, tool logic — those are Phase 2 onward.
- Playwright e2e tests — added in Phase 8 when there's UI to test.
- CI workflow (.github/workflows/ci.yml) — deferred until first remote PR; runs the same `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pipeline.
- shadcn / Lucide / any UI library — added in Phase 7 when we build the chrome.
- Storybook — out of scope for v1.
- i18next setup — added in Phase 8 with apps/web wiring.
