import { describe, expect, test } from "vitest"
import {
  BUILD_VERSION_PATTERN,
  createBuildCommandPlan,
  formatBuildVersion,
  parseBuildArguments,
  resolveE2eSelection
} from "../.harness/tooling/build.ts"

describe("release build orchestration", /* 执行当前测试分组的验证逻辑。 */ () => {
  test("formats the build version in Asia/Shanghai", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 version 变量供格式断言使用。
    const version = formatBuildVersion(new Date("2026-08-24T04:34:59.000Z"))
    expect(version).toBe("202608241234")
    expect(version).toMatch(BUILD_VERSION_PATTERN)
  })

  test("requires an explicit E2E decision for non-interactive builds", /* 执行当前测试用例的验证逻辑。 */ async () => {
    await expect(resolveE2eSelection(undefined, false)).rejects.toThrow(
      /Non-interactive builds require/
    )
    await expect(resolveE2eSelection("enabled", false)).resolves.toBe("enabled")
    expect(parseBuildArguments(["build", "--e2e=disabled"])).toEqual({
      e2e: "disabled",
      target: "build"
    })
    expect(parseBuildArguments(["build", "--", "--e2e=enabled"])).toEqual({
      e2e: "enabled",
      target: "build"
    })
  })

  test("runs the full unit suite before injecting the Web build version", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 commands 变量供顺序与环境断言使用。
    const commands = createBuildCommandPlan("web", "build", "202608241234")
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
    expect(commands[6]?.env).toEqual({ VITE_BUILD_VERSION: "202608241234" })
    expect(commands[7]?.env).toEqual({ HARNESS_BUILD_VERSION: "202608241234" })
  })

  test("injects the same version into Extension build and package commands", /* 执行当前测试用例的验证逻辑。 */ () => {
    // 保存 build 变量供普通构建断言使用。
    const build = createBuildCommandPlan("extension", "build", "202608241235")
    // 保存 packaged 变量供 zip 构建断言使用。
    const packaged = createBuildCommandPlan("extension", "package", "202608241236")
    expect(build[6]).toMatchObject({
      args: ["exec", "plasmo", "build", "--env=.env.production"],
      env: { PLASMO_PUBLIC_BUILD_VERSION: "202608241235" }
    })
    expect(packaged[6]).toMatchObject({
      args: ["exec", "plasmo", "build", "--zip", "--env=.env.production"],
      env: { PLASMO_PUBLIC_BUILD_VERSION: "202608241236" }
    })
    expect(
      /* 执行非法 Web 打包计划的构造。 */ () =>
        createBuildCommandPlan("web", "package", "202608241237")
    ).toThrow(/Only an Extension/)
  })
})
