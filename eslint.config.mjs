import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      ".plasmo/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "src/routeTree.gen.ts"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-console": "error"
    }
  },
  {
    files: ["src/observability/logger.ts", "src/observability/AppErrorBoundary.test.tsx"],
    rules: {
      "no-console": "off"
    }
  }
)
