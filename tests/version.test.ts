import { describe, expect, test } from "vitest"
import {
  declaredVersionAtLeast,
  declaresMinimumVersion,
  packageManagerVersion,
  parseExactVersion
} from "../.harness/tooling/version.ts"

describe("stable minimum-version gates", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  test("accepts only an uncapped >= engine minimum", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(declaresMinimumVersion(">=22.22.2", "22.22.2")).toBe(true)
    expect(declaresMinimumVersion(">=23.0.0", "22.22.2")).toBe(true)
    // 保存 declaration 变量供当前逻辑使用。
    for (const declaration of [
      "22.22.2",
      "=22.22.2",
      "^22.22.2",
      "~22.22.2",
      ">=22.22.2 <23.0.0",
      ">=22.22.2-beta.1"
    ]) {
      expect(declaresMinimumVersion(declaration, "22.22.2")).toBe(false)
    }
  })

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

  test("rejects non-canonical exact versions while preserving an exact package-manager pin", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(parseExactVersion("v10.33.3+build.1")).toEqual({ major: 10, minor: 33, patch: 3 })
    expect(parseExactVersion("10.033.3")).toBeUndefined()
    expect(parseExactVersion("10.33.3-beta.1")).toBeUndefined()
    expect(packageManagerVersion("pnpm@10.34.0", "pnpm")).toBe("10.34.0")
    expect(packageManagerVersion("pnpm@>=10.33.3", "pnpm")).toBeUndefined()
  })
})
