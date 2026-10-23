import process from "node:process"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import path from "node:path"
import { archiveEntries, writeZip } from "./archive.mjs"

export const SERVER_PLATFORMS = [
  "linux/amd64",
  "linux/arm64",
  "windows/amd64",
  "windows/arm64",
  "darwin/amd64",
  "darwin/arm64"
]

/** 发布参数只接受一个成员、一次平台和一次 E2E 选择，拒绝静默忽略拼写错误。 */
export function parseReleaseArguments(argv) {
  const result = {}
  const args = argv.filter((item) => item !== "--")
  for (let index = 0; index < args.length; index++) {
    const item = args[index]
    const separator = item.indexOf("=")
    const key = separator < 0 ? item : item.slice(0, separator)
    const value = separator < 0 ? args[++index] : item.slice(separator + 1)
    const names = new Map([
      ["--member", "member"],
      ["--platform", "platform"],
      ["--e2e", "e2e"]
    ])
    const name = names.get(key)
    if (!name || !value || value.startsWith("--") || result[name] !== undefined)
      throw new Error(`非法或重复发布参数：${item}`)
    result[name] = value
  }
  if (result.member && !["web", "extension", "server"].includes(result.member))
    throw new Error("--member 必须是 web、extension 或 server")
  if (result.platform && !SERVER_PLATFORMS.includes(result.platform))
    throw new Error(`--platform 必须是 ${SERVER_PLATFORMS.join("、")}`)
  if (result.e2e && !["enabled", "disabled"].includes(result.e2e))
    throw new Error("--e2e 必须是 enabled 或 disabled")
  return result
}

/** 发布前先解析所有必要选择，非交互模式不猜测 Server 平台或 E2E。 */
export async function resolveReleaseSelections(args, members, interactive) {
  const selections = { ...args }
  const server = members.some((member) => member.type === "server")
  const frontend = members.some((member) => member.type !== "server")
  if (args.platform && !server) throw new Error("当前发布不包含 server，不能传 --platform")
  if (server && !selections.platform && !interactive)
    throw new Error("Server 发布必须询问用户目标平台；非交互时传入 --platform=<os/arch>")
  if (frontend && !selections.e2e && !interactive)
    throw new Error("非交互发布必须传入 --e2e=enabled|disabled，复用本次发布选择")
  if ((server && !selections.platform) || (frontend && !selections.e2e)) {
    const prompt = createInterface({ input: stdin, output: stdout })
    try {
      while (server && !selections.platform) {
        const answer = (
          await prompt.question(`Server 目标平台（${SERVER_PLATFORMS.join(" / ")}）：`)
        ).trim()
        if (SERVER_PLATFORMS.includes(answer)) selections.platform = answer
        else stdout.write("请明确选择一个 os/arch，不使用本机默认值。\n")
      }
      while (frontend && !selections.e2e) {
        const answer = (await prompt.question("本次发布是否启用 E2E？[y/N] ")).trim()
        if (/^(?:y|yes|是)$/iu.test(answer)) selections.e2e = "enabled"
        else if (answer === "" || /^(?:n|no|否)$/iu.test(answer)) selections.e2e = "disabled"
        else stdout.write("请输入 y 或 n。\n")
      }
    } finally {
      prompt.close()
    }
  }
  return selections
}

/** 仅接受普通目录或文件；链接、特殊文件和真实 IO 错误均不得当成不存在。 */
async function safePath(file, directory = false, optional = false) {
  let status
  try {
    status = await lstat(file)
  } catch (error) {
    if (optional && error.code === "ENOENT") return
    throw error
  }
  if (status.isSymbolicLink() || !(directory ? status.isDirectory() : status.isFile()))
    throw new Error(`发布路径必须是普通${directory ? "目录" : "文件"}：${file}`)
}

/** 只收集本次已通过成员 Release 门禁的目录，不复用可能过期的浏览器 ZIP。 */
export async function frontendEntries(root, member) {
  const cwd = path.join(root, member.directory)
  if (member.type === "web") {
    const dist = path.join(cwd, "dist")
    await safePath(dist, true)
    await safePath(path.join(dist, "index.html"))
    return archiveEntries(dist, member.directory)
  }
  const entries = []
  for (const [browser, target] of [
    ["chrome", "chrome-mv3"],
    ["firefox", "firefox-mv2"]
  ]) {
    const source = path.join(cwd, "build", `${target}-prod`)
    await safePath(source, true)
    await safePath(path.join(source, "manifest.json"))
    entries.push(...(await archiveEntries(source, browser)))
  }
  return entries
}

/** 复用成员构建门禁并逐个原子发布 ZIP；本地打包不会执行上传、部署或商店发布。 */
export async function releaseWorkspace(root, config, argv, commands, interactive) {
  const args = parseReleaseArguments(argv)
  const members = config.members.filter((member) => !args.member || member.type === args.member)
  if (!members.length) throw new Error(`未选择的成员：${args.member}`)
  const selections = await resolveReleaseSelections(args, members, interactive)
  commands.signal?.throwIfAborted()
  for (const member of members.filter((item) => item.type === "server")) {
    for (const file of ["cmd/release-config/main.go", "configs/config-prod.yaml"]) {
      try {
        await safePath(path.join(root, member.directory, file))
      } catch (error) {
        throw new Error(`Server 发布配置合同未就绪：${file}；既有服务须先迁移配置与导出工具。`, {
          cause: error
        })
      }
    }
  }
  const directory = path.join(root, "release")
  await safePath(directory, true, true)
  await mkdir(directory, { recursive: true })
  await safePath(directory, true)
  for (const member of members) {
    const destination = path.join(directory, `${member.type}.zip`)
    await safePath(destination, false, true)
    const stage = await mkdtemp(path.join(directory, `.${member.type}-`))
    try {
      const cwd = path.join(root, member.directory)
      let entries
      if (member.type === "server") {
        const [goos, goarch] = selections.platform.split("/")
        const binaryName = member.directory + (goos === "windows" ? ".exe" : "")
        const binary = path.join(stage, binaryName)
        const configuration = path.join(stage, "config.yaml")
        const host = {
          ...process.env,
          CGO_ENABLED: "0",
          GOOS: process.platform === "win32" ? "windows" : process.platform,
          GOARCH: process.arch === "x64" ? "amd64" : process.arch
        }
        await commands.go(["test", "./..."], cwd, host)
        await commands.go(["run", "./cmd/release-config", "--output", configuration], cwd, host)
        await commands.go(["build", "-trimpath", "-o", binary, "./cmd/server"], cwd, {
          ...host,
          GOOS: goos,
          GOARCH: goarch
        })
        await safePath(binary)
        await safePath(configuration)
        entries = [
          { name: binaryName, source: binary, mode: 0o100755 },
          { name: "config.yaml", source: configuration, mode: 0o100600 }
        ]
      } else {
        await commands.pnpm(
          ["run", member.type === "extension" ? "package" : "build", `--e2e=${selections.e2e}`],
          cwd
        )
        entries = await frontendEntries(root, member)
      }
      const archive = path.join(stage, `${member.type}.zip`)
      await writeZip(archive, entries, commands.signal)
      await safePath(destination, false, true)
      commands.signal?.throwIfAborted()
      await rename(archive, destination)
      stdout.write(
        `已生成 ${destination}${member.type === "server" ? `（${selections.platform}，仅编译；目标运行未验证）` : ""}\n`
      )
    } finally {
      await rm(stage, { recursive: true, force: true })
    }
  }
  if (members.some((member) => member.type !== "server"))
    stdout.write(
      selections.e2e === "enabled"
        ? "E2E 待执行：将本次精确目录与 ZIP 交给 $web-verify-delivery；打包成功不表示验收通过。\n"
        : "本次 E2E：Not run。\n"
    )
}
