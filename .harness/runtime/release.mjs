import process from "node:process"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { parseEnv } from "node:util"
import { URL } from "node:url"
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

/** 发布参数拒绝重复与未知字段，本机地址确认必须显式绑定到推导出的地址。 */
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
      ["--e2e", "e2e"],
      ["--confirm-local-base-url", "confirmLocalBaseUrl"]
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

/** 在构建机执行纯 YAML 导出，避免目标平台或宿主 APP_* 环境改变地址推导。 */
function hostGoEnvironment() {
  return {
    ...process.env,
    CGO_ENABLED: "0",
    GOOS: process.platform === "win32" ? "windows" : process.platform,
    GOARCH: process.arch === "x64" ? "amd64" : process.arch
  }
}

/** 只有用户实际输入同意才采用建议；取消、空回答和中断均保持原配置。 */
async function confirmBaseUrl(message, signal) {
  const terminal = createInterface({ input: stdin, output: stdout })
  try {
    return /^(y|yes|是)$/iu.test((await terminal.question(message, { signal })).trim())
  } finally {
    terminal.close()
  }
}

/** 配置确认和实际打包共用同一输入快照，漂移时停止而不替换下一份 ZIP。 */
async function verifyReleaseInputs(sources = []) {
  for (const source of sources) {
    await safePath(source.file)
    if ((await readFile(source.file, "utf8")) !== source.contents)
      throw new Error("发布配置已变化，请重新发布并确认。")
  }
}

/** 先暂存全部环境文件；提交失败或取消时，仅恢复仍属于本次写入的内容。 */
async function writeConfirmedBaseUrl(pending, suggestion, signal) {
  const staged = []
  const committed = []
  try {
    for (const item of pending) {
      const ending = item.contents.includes("\r\n") ? "\r\n" : "\n"
      const assignment = `${item.key}=${suggestion}`
      const contents = item.pattern.test(item.contents)
        ? item.contents.replace(item.pattern, assignment)
        : item.contents +
          (item.contents && !item.contents.endsWith("\n") ? ending : "") +
          assignment +
          ending
      const directory = await mkdtemp(path.join(path.dirname(item.file), ".harness-release-"))
      const update = {
        ...item,
        contents,
        original: item.contents,
        directory,
        temporary: path.join(directory, "production.env")
      }
      staged.push(update)
      await writeFile(update.temporary, contents, {
        flag: "wx",
        mode: (await lstat(item.file)).mode & 0o777
      })
    }
    await verifyReleaseInputs(pending)
    for (const item of staged) {
      signal?.throwIfAborted()
      await rename(item.temporary, item.file)
      committed.push(item)
    }
    signal?.throwIfAborted()
  } catch (error) {
    const failures = []
    for (const item of committed.reverse()) {
      try {
        await safePath(item.file)
        if ((await readFile(item.file, "utf8")) !== item.contents)
          throw new Error(`配置已被其他操作修改，未回写：${item.file}`, { cause: error })
        await writeFile(item.temporary, item.original, {
          flag: "wx",
          mode: (await lstat(item.file)).mode & 0o777
        })
        await rename(item.temporary, item.file)
      } catch (failure) {
        failures.push(failure)
      }
    }
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        "配置写入失败且部分恢复失败，请核对前端正式配置。",
        { cause: error }
      )
    throw error
  } finally {
    for (const item of staged) await rm(item.directory, { recursive: true, force: true })
  }
}

/** 自建服务首次发布空地址时先展示真实生产端口，确认后仅补齐选中前端的空配置。 */
export async function prepareReleaseBaseUrl(
  root,
  config,
  members,
  args,
  commands,
  interactive,
  confirm = confirmBaseUrl
) {
  if (config.service.mode !== "create") return
  const pending = []
  for (const member of members.filter((item) => item.type !== "server")) {
    const key = `${member.type === "web" ? "VITE" : "PLASMO_PUBLIC"}_API_BASE_URL`
    const file = path.join(root, member.directory, ".env.production")
    await safePath(file)
    const contents = await readFile(file, "utf8")
    if (process.env[key] !== undefined) {
      if (!process.env[key].trim()) throw new Error(`请移除空的进程覆盖 ${key} 后再确认本机地址。`)
      continue
    }
    if ((parseEnv(contents)[key] ?? "").trim()) continue
    const pattern = new RegExp(`^(?:export[ \\t]+)?${key}[ \\t]*=.*$`, "gm")
    if ([...contents.matchAll(pattern)].length > 1)
      throw new Error(`${file} 中 ${key} 重复，请先合并配置。`)
    pending.push({ file, contents, key, pattern })
  }
  if (!pending.length) return
  const server = config.members.find((item) => item.type === "server")
  if (!server) throw new Error("自建服务缺少已登记 Server")
  const cwd = path.join(root, server.directory)
  const sources = []
  for (const relative of [
    "configs/config.yaml",
    "configs/config-prod.yaml",
    "cmd/release-config/main.go"
  ]) {
    const file = path.join(cwd, relative)
    await safePath(file)
    sources.push({ file, contents: await readFile(file, "utf8") })
  }
  const stage = await mkdtemp(path.join(tmpdir(), "harness-release-base-url-"))
  let suggestion
  try {
    const output = path.join(stage, "base-url.txt")
    try {
      await commands.go(
        [
          "run",
          "./cmd/release-config",
          "--output",
          path.join(stage, "config.yaml"),
          "--local-base-url-output",
          output
        ],
        cwd,
        hostGoEnvironment()
      )
    } catch (error) {
      throw new Error(
        "无法推导生产服务本机地址；检查生产监听配置，并按 $web-upgrade-harness 的 Go 发布迁移流程合并新版地址导出接口。",
        { cause: error }
      )
    }
    await safePath(output)
    suggestion = (await readFile(output, "utf8")).trim()
    const url = new URL(suggestion)
    if (
      !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}$/u.test(suggestion) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Server 导出的本机地址无效")
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
  commands.signal?.throwIfAborted()
  const message = `首次发布 BaseURL 未填写，建议采用打包 Server 的本机地址 ${suggestion}。仅适用于浏览器与 Server 在同一台机器；其他部署请填写正式 HTTPS 地址。确认写入 ${pending.map((item) => path.relative(root, item.file)).join("、")}？[y/N] `
  if (args.confirmLocalBaseUrl !== undefined) {
    if (args.confirmLocalBaseUrl !== suggestion)
      throw new Error(`本机地址确认不匹配：实际建议为 ${suggestion}，配置未修改。`)
    stdout.write(`已显式确认本机 BaseURL：${suggestion}\n`)
  } else if (!interactive) {
    throw new Error(
      `${message}\n非交互运行请先确认，再传 --confirm-local-base-url=${suggestion}；配置未修改。`
    )
  } else if (!(await confirm(message, commands.signal))) {
    throw new Error("本机 BaseURL 未获确认，发布取消；配置与既有发布包未修改。")
  }
  commands.signal?.throwIfAborted()
  // 等待用户期间配置可能被编辑；先复核全部输入，再进行任何持久写入。
  await verifyReleaseInputs([...sources, ...pending])
  await writeConfirmedBaseUrl(pending, suggestion, commands.signal)
  return sources
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
        throw new Error(
          `Server 发布配置合同未就绪：${file}；按 $web-upgrade-harness 的 Go 发布迁移流程保留现有配置并补齐导出工具。`,
          {
            cause: error
          }
        )
      }
    }
  }
  const baseUrlSources = await prepareReleaseBaseUrl(
    root,
    config,
    members,
    args,
    commands,
    interactive
  )
  const directory = path.join(root, "release")
  await safePath(directory, true, true)
  await mkdir(directory, { recursive: true })
  await safePath(directory, true)
  for (const member of members) {
    await verifyReleaseInputs(baseUrlSources)
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
        const host = hostGoEnvironment()
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
      await verifyReleaseInputs(baseUrlSources)
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
