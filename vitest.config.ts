import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { defineConfig } from "vitest/config"

// 执行 testEnvironment 函数的处理逻辑。
function testEnvironment(): Record<string, string> {
  try {
    return Object.fromEntries(
      Object.entries(parseEnv(readFileSync(new URL(".env.test", import.meta.url), "utf8"))).filter(
        // 执行 当前声明 函数的处理逻辑。
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    )
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {}
    throw error
  }
}

export default defineConfig({
  test: {
    env: testEnvironment(),
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000
  }
})
