import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { validatePnpmBuildPolicy } from "../.harness/tooling/pnpm-policy.ts"
import {
  assertPackageManagerPins,
  declaredVersionAtLeast,
  declaresMinimumVersion,
  packageManagerVersion,
  parseExactVersion
} from "../.harness/tooling/version.ts"

describe("stable minimum-version gates", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  /** 验证 Node.js 24 的最低边界及更高稳定版本均可进入实际工程检查。 */
  test.each(["24.0.0", "24.0.1", "26.10.0", "27.0.0"])("接受 Node.js 最低声明 >=%s", (minimum) => {
    const errors: string[] = []
    assertPackageManagerPins(
      { engines: { node: `>=${minimum}`, pnpm: ">=12.8.1" }, packageManager: "pnpm@12.8.1" },
      errors
    )
    expect(errors).toEqual([])
  })

  /** 验证 accepts only an uncapped >= engine minimum 场景。 */
  test("accepts only an uncapped >= engine minimum", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(declaresMinimumVersion(">=24.0.0", "24.0.0")).toBe(true)
    expect(declaresMinimumVersion(">=27.0.0", "24.0.0")).toBe(true)
    expect(declaresMinimumVersion(">=23.99.0", "24.0.0")).toBe(false)
    // 保存 declaration 变量供当前逻辑使用。
    for (const declaration of [
      "24.0.0",
      "=24.0.0",
      "^24.0.0",
      "~24.0.0",
      ">=24.0.0 <27.0.0",
      ">=24.0.0-beta.1"
    ]) {
      expect(declaresMinimumVersion(declaration, "24.0.0")).toBe(false)
    }
  })

  /** 验证 allows supported dependency declaration styles only above the floor 场景。 */
  test("allows supported dependency declaration styles only above the floor", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 declaration 变量供当前逻辑使用。
    for (const declaration of ["6.0.3", "^6.1.0", "~6.2.0", ">=7.0.0"]) {
      expect(declaredVersionAtLeast(declaration, "6.0.3")).toBe(true)
    }
    // 保存 declaration 变量供当前逻辑使用。
    for (const declaration of ["6.0.2", "=6.1.0", ">6.1.0", "6.1.0-beta.1"]) {
      expect(declaredVersionAtLeast(declaration, "6.0.3")).toBe(false)
    }
  })

  /** 验证 rejects non-canonical exact versions while preserving an exact package-manager pin 场景。 */
  test("rejects non-canonical exact versions while preserving an exact package-manager pin", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(parseExactVersion("v12.8.1+build.1")).toEqual({ major: 12, minor: 8, patch: 1 })
    expect(parseExactVersion("12.08.1")).toBeUndefined()
    expect(parseExactVersion("12.8.1-beta.1")).toBeUndefined()
    expect(packageManagerVersion("pnpm@12.9.0", "pnpm")).toBe("12.9.0")
    expect(packageManagerVersion("pnpm@>=12.8.1", "pnpm")).toBeUndefined()
  })

  /** 验证 pnpm 12 构建许可完整且不声明多包工作区。 */
  test("requires a single-package pnpm build policy", async () => {
    // 保存 targetRoot 变量供隔离配置测试使用。
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), "pnpm-policy-test-"))
    try {
      // 保存 policyPath 变量供测试写入 pnpm 配置使用。
      const policyPath = path.join(targetRoot, "pnpm-workspace.yaml")
      await writeFile(policyPath, "allowBuilds:\n  esbuild: true\n")
      // 保存 missingAllowlist 变量供缺项断言使用。
      const missingAllowlist: string[] = []
      await validatePnpmBuildPolicy(targetRoot, missingAllowlist)
      expect(missingAllowlist).toContain("pnpm build policy must allow @parcel/watcher")
      expect(missingAllowlist).toContain("pnpm build policy must allow sharp")

      await writeFile(
        policyPath,
        'packages:\n  - "apps/*"\nallowBuilds:\n  "@parcel/watcher": true\n  esbuild: true\n  sharp: true\n'
      )
      // 保存 workspaceErrors 变量供多包声明断言使用。
      const workspaceErrors: string[] = []
      await validatePnpmBuildPolicy(targetRoot, workspaceErrors)
      expect(workspaceErrors).toContain("pnpm build policy must not declare workspace packages")
    } finally {
      await rm(targetRoot, { recursive: true, force: true })
    }
  })
})
