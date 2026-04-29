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
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
)
