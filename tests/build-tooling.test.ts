import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  createBuildCommandPlan,
  formatBuildVersion,
  parseBuildArguments,
  readExtensionBuildVersion,
  resolveBuildVersion,
  resolveE2eSelection
} from "../.harness/tooling/build.ts"
import { isValidExtensionVersion, WEB_BUILD_VERSION_PATTERN } from "../.harness/tooling/version.ts"

describe("release build orchestration", /* 执行当前测试分组的验证逻辑。 */ () => {
  /** 验证 Web 按上海时间生成秒级版本且拒绝旧字段顺序。 */
  test("formats the Web build version in Asia/Shanghai", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 version 变量供格式断言使用。
    const version = formatBuildVersion(new Date("2026-08-24T04:34:59.000Z"))
    expect(version).toBe("260824123459")
    expect(formatBuildVersion(new Date("2026-08-24T04:35:00.000Z"))).toBe("260824123500")
    expect(version).toMatch(WEB_BUILD_VERSION_PATTERN)
    expect("202608241234").not.toMatch(WEB_BUILD_VERSION_PATTERN)
  })

  /** 验证 Extension 仅使用 package.json 当前的稳定 SemVer。 */
  test("reads the Extension package version", /* 执行当前测试用例的验证逻辑。 */ async () => {
    const root = await mkdtemp(path.join(tmpdir(), "extension-build-version-"))
    try {
      const manifestPath = path.join(root, "package.json")
      await writeFile(manifestPath, JSON.stringify({ version: "1.2.3" }))
      expect(await readExtensionBuildVersion(root)).toBe("1.2.3")
      expect(
        await resolveBuildVersion("extension", root, new Date("2026-08-24T04:34:59.000Z"))
      ).toBe("1.2.3")
      expect(await resolveBuildVersion("web", root, new Date("2026-08-24T04:34:59.000Z"))).toBe(
        "260824123459"
      )
      expect(isValidExtensionVersion("1.2.3")).toBe(true)
      expect(isValidExtensionVersion("0.0.0")).toBe(false)
      expect(isValidExtensionVersion("65536.0.0")).toBe(false)
      await writeFile(manifestPath, JSON.stringify({ version: "1.2.3-beta.1" }))
      await expect(readExtensionBuildVersion(root)).rejects.toThrow(/stable SemVer/)
      for (const version of ["0.0.0", "65536.0.0"]) {
        await writeFile(manifestPath, JSON.stringify({ version }))
        await expect(readExtensionBuildVersion(root)).rejects.toThrow(/Chrome-compatible/)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  /** 验证 requires an explicit E2E decision for non-interactive builds 场景。 */
  test("requires an explicit E2E decision for non-interactive builds", /* 执行当前测试用例的验证逻辑。 */ async () => {
    await expect(resolveE2eSelection(undefined, false)).rejects.toThrow(
      /Non-interactive builds require/
    )
    await expect(resolveE2eSelection("enabled", false)).resolves.toBe("enabled")
    for (const selection of ["enabled", "disabled"] as const) {
      await expect(resolveE2eSelection(selection, false)).resolves.toBe(selection)
      await expect(resolveE2eSelection(selection, false)).resolves.toBe(selection)
    }
    expect(parseBuildArguments(["build", "--e2e=disabled"])).toEqual({
      e2e: "disabled",
      target: "build"
    })
    expect(parseBuildArguments(["build", "--", "--e2e=enabled"])).toEqual({
      e2e: "enabled",
      target: "build"
    })
  })

  /** 验证 runs the full unit suite before injecting the Web build version 场景。 */
  test("runs the full unit suite before injecting the Web build version", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 commands 变量供顺序与环境断言使用。
    const commands = createBuildCommandPlan("web", "build", "260824123459")
    // 保存 commandLines 变量供可读顺序断言使用。
    const commandLines = commands.map(
      /* 执行当前命令到文本的映射。 */ (command) => `${command.command} ${command.args.join(" ")}`
    )
    expect(commandLines).toEqual([
      "pnpm env:validate --profile release",
      "pnpm harness validate",
      "pnpm format:check",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm exec vite build --mode production",
      "pnpm release:inspect"
    ])
    expect(commands[6]?.env).toEqual({ VITE_BUILD_VERSION: "260824123459" })
    expect(commands[7]?.env).toEqual({ HARNESS_BUILD_VERSION: "260824123459" })
    expect(() => createBuildCommandPlan("web", "build", "202608241234")).toThrow(/YYMMDDHHMMSS/)
  })

  /** 验证 injects the same version into Extension build and package commands 场景。 */
  test("injects the same version into Extension build and package commands", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 build 变量供普通构建断言使用。
    const build = createBuildCommandPlan("extension", "build", "1.2.3")
    // 保存 packaged 变量供 zip 构建断言使用。
    const packaged = createBuildCommandPlan("extension", "package", "1.2.3")
    for (const [index, browser] of ["chrome-mv3", "firefox-mv2"].entries()) {
      const args = [
        "exec",
        "plasmo",
        "build",
        `--target=${browser}`,
        "--tag=prod",
        "--build-path=build",
        "--src-path=src",
        "--env=.env.production"
      ]
      expect(build[index + 6]).toMatchObject({
        args,
        env: { PLASMO_PUBLIC_BUILD_VERSION: "1.2.3" }
      })
      expect(packaged[index + 6]).toMatchObject({
        args: [...args.slice(0, 3), "--zip", ...args.slice(3)],
        env: { PLASMO_PUBLIC_BUILD_VERSION: "1.2.3" }
      })
    }
    expect(build).toHaveLength(9)
    expect(build.filter((command) => command.args[0] === "test")).toHaveLength(1)
    expect(build[8]).toMatchObject({
      args: ["release:inspect"],
      env: { HARNESS_BUILD_VERSION: "1.2.3" }
    })
    expect(
      /* 执行非法 Web 打包计划的构造。 */ () =>
        createBuildCommandPlan("web", "package", "260824123459")
    ).toThrow(/Only an Extension/)
    expect(() => createBuildCommandPlan("extension", "build", "260824123459")).toThrow(
      /stable SemVer/
    )
    expect(() => createBuildCommandPlan("extension", "build", "0.0.0")).toThrow(/Chrome-compatible/)
  })
})
