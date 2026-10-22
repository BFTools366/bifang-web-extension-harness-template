import process from "node:process"
import console from "node:console"
import { setTimeout, clearTimeout } from "node:timers"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { parseEnv } from "node:util"
import { URL, fileURLToPath, pathToFileURL } from "node:url"

/** 使用 Node >=24 自带的 Fetch 与取消信号，不引入运行时依赖。 */
const { fetch, AbortSignal } = globalThis

/** 仅解析受管 packages 清单，拒绝注释伪匹配、额外成员与重复声明。 */
function pnpmMembers(policy) {
  const lines = policy.split(/\r?\n/u)
  const headers = lines.filter((line) => /^[ \t]*["']?packages["']?[ \t]*:/u.test(line))
  if (headers.length !== 1 || !/^packages:[ \t]*(?:\[\])?[ \t]*$/u.test(headers[0]))
    throw new Error("pnpm 成员声明必须是唯一的精确清单")
  const header = headers[0]
  const members = []
  for (const line of lines.slice(lines.indexOf(header) + 1)) {
    if (/^[ \t]*(?:#.*)?$/u.test(line)) continue
    if (/^\S/u.test(line)) break
    const item = /^[ \t]+-[ \t]+("(?:[^"\\]|\\.)*")[ \t]*$/u.exec(line)
    if (!item || header.includes("[]")) throw new Error("pnpm 成员清单格式无效")
    members.push(JSON.parse(item[1]))
  }
  return members
}

/** 读取唯一工作区身份并拒绝成员逃逸、链接和重复。 */
export async function readWorkspace(root) {
  const config = JSON.parse(await readFile(path.join(root, ".harness/workspace.json"), "utf8"))
  if (
    config?.kind !== "workspace" ||
    config.schemaVersion !== 1 ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(config.id) ||
    !Array.isArray(config.members) ||
    !config.members.length
  )
    throw new Error("无效的 Workspace 身份")
  const types = new Set()
  for (const member of config.members) {
    if (
      !["web", "extension", "server"].includes(member.type) ||
      types.has(member.type) ||
      member.directory !== `${config.id}_${member.type}`
    )
      throw new Error("无效、重复或越界的 Workspace 成员")
    types.add(member.type)
    const directory = path.join(root, member.directory)
    const status = await lstat(directory)
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      throw new Error("Workspace 成员必须是规范真实目录")
    if ((await readdir(directory)).includes(".git")) throw new Error("成员不能有独立 Git")
    if (member.type !== "server") {
      const identity = JSON.parse(
        await readFile(path.join(directory, ".harness/project.json"), "utf8")
      )
      if (identity.projectType !== member.type || identity.id !== member.directory)
        throw new Error("成员宿主或身份与 Workspace 不一致")
    } else if (
      (await readFile(path.join(directory, "go.mod"), "utf8")).split(/\r?\n/u)[0] !==
      `module ${member.directory}`
    )
      throw new Error("Go module 身份与 Workspace 不一致")
  }
  if (
    !["existing", "create", "none"].includes(config.service?.mode) ||
    (config.service.mode === "create") !== types.has("server")
  )
    throw new Error("服务归属与成员不一致")
  if (config.service.mode === "none") {
    if (config.service.developmentBaseUrl !== "" || config.service.apiContract)
      throw new Error("纯本地项目不应配置服务地址或接口文档")
  } else {
    const base = new URL(config.service.developmentBaseUrl)
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new Error("服务 BaseURL 必须是无凭据的 HTTP(S) 地址")
  }
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
  if (
    manifest.name !== config.id ||
    manifest.private !== true ||
    typeof manifest.scripts?.dev !== "string" ||
    manifest.scripts.instantiate !== undefined
  )
    throw new Error("Workspace package 身份或终端入口无效")
  const workspacePolicy = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")
  const expectedMembers = config.members
    .filter((item) => item.type !== "server")
    .map((item) => item.directory)
  if (JSON.stringify(pnpmMembers(workspacePolicy)) !== JSON.stringify(expectedMembers))
    throw new Error("pnpm 成员清单与 Workspace 不一致")
  for (const member of config.members.filter((item) => item.type !== "server")) {
    const directory = path.join(root, member.directory)
    const packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"))
    if (packageJson.name !== member.directory) throw new Error("成员 package 名称漂移")
    const development = await readFile(path.join(directory, ".env.development"), "utf8")
    const prefix = member.type === "web" ? "VITE" : "PLASMO_PUBLIC"
    const declared = parseEnv(development)[`${prefix}_API_BASE_URL`]
    if (declared !== config.service.developmentBaseUrl)
      throw new Error("前端开发 BaseURL 与 Workspace 漂移")
    for (const file of [".env.test", ".env.production", "src/data/api/client/httpRuntime.ts"]) {
      const contents = await readFile(path.join(directory, file), "utf8")
      if (
        config.service.mode === "none" &&
        file.startsWith(".env") &&
        parseEnv(contents)[`${prefix}_API_BASE_URL`] !== ""
      )
        throw new Error("纯本地成员不应配置服务地址")
    }
  }
  if (config.service.apiContract) {
    if (config.service.apiContract !== "docs/api/source-contract.txt")
      throw new Error("接口契约路径无效")
    await readFile(path.join(root, config.service.apiContract))
  }
  return config
}

/** 子进程只由当前编排器拥有，不接管其他本地服务。 */
const children = new Map()
let stopping = false

/** 停止所属进程树，避免 Go 编译器或浏览器开发进程遗留。 */
function stopChild(child, force = false) {
  if (!child.pid) return
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  else {
    try {
      process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM")
    } catch {
      if (child.exitCode === null) child.kill(force ? "SIGKILL" : "SIGTERM")
    }
  }
}

/** 不经 Shell 启动已声明的工具，每个成员拥有正确 cwd。 */
function launch(command, args, cwd, environment) {
  if (stopping) throw new Error("Workspace 启动已取消")
  const child = spawn(command, args, {
    cwd,
    env: environment ?? process.env,
    stdio: "inherit",
    detached: process.platform !== "win32"
  })
  const done = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      children.delete(child)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      // leader 退出后立即回收该组剩余后代；不要长期保存已退出 PID。
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {
          /* 进程组已结束。 */
        }
      }
      children.delete(child)
      if (code === 0) resolve()
      else reject(new Error(`${command} 退出：${code ?? signal}`))
    })
  })
  children.set(child, done)
  // 开发服务的退出会在完成启动后等待；先安装拒绝处理以避免启动期未处理异常。
  void done.catch(() => undefined)
  return { child, done }
}

/** 由 pnpm 注入的真实入口调用成员，禁止用全局同名构建工具替代项目依赖。 */
function pnpm(args, cwd) {
  if (process.env.npm_execpath) {
    const entry = process.env.npm_execpath
    return /\.(?:cjs|mjs|js)$/i.test(entry)
      ? launch(process.execPath, [entry, ...args], cwd)
      : launch(entry, args, cwd)
  }
  if (process.platform === "win32") throw new Error("请从 pnpm 根脚本运行，以定位跨平台 pnpm 入口")
  return launch("pnpm", args, cwd)
}

/** 等待真实新建服务健康，不把编译完成当成服务已启动。 */
async function waitHealthy(base, processDone, instance) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Workspace 启动已取消")
    const response = await Promise.race([
      fetch(new URL("healthz", base.endsWith("/") ? base : `${base}/`), {
        signal: AbortSignal.timeout(1000)
      }).catch(() => undefined),
      processDone.then(() => {
        throw new Error("Go 服务在健康检查前退出")
      })
    ])
    if (response?.ok && response.headers.get("X-Harness-Instance") === instance) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error("Go 服务未在 30 秒内健康启动")
}

/** 聚合成员操作；构建必须选择具体成员，避免隐式形成多个发布候选。 */
export async function runWorkspace(argv, root) {
  const config = await readWorkspace(root)
  const [action, ...rest] = argv
  const args = rest.filter((item) => item !== "--")
  const index = args.indexOf("--member")
  const target = index >= 0 ? args[index + 1] : undefined
  if (index >= 0) args.splice(index, 2)
  if (!["validate", "dev", "test", "typecheck", "lint", "build"].includes(action))
    throw new Error("未知 Workspace 操作")
  if (target && !config.members.some((item) => item.type === target))
    throw new Error(`未选择的成员：${target}`)
  if (action === "build" && !target) throw new Error("build 必须用 --member 指定发布或编译对象")
  if (index >= 0 && !target) throw new Error("--member 需要已选成员")
  const structureOnly = args.includes("--structure-only")
  if (structureOnly && action !== "validate") throw new Error("--structure-only 仅用于结构校验")
  if (action === "validate" && structureOnly) return
  const members = config.members.filter((item) => !target || item.type === target)
  if (action === "dev") {
    const running = []
    for (const member of [...members].sort((left) => (left.type === "server" ? -1 : 1))) {
      const cwd = path.join(root, member.directory)
      if (member.type === "server") {
        const binary = path.join(
          cwd,
          ".harness-server-dev" + (process.platform === "win32" ? ".exe" : "")
        )
        await launch("go", ["build", "-o", binary, "./cmd/server"], cwd).done
        const instance = randomUUID()
        const server = launch(binary, [], cwd, { ...process.env, APP_HARNESS_INSTANCE: instance })
        running.push(server.done)
        await waitHealthy(config.service.developmentBaseUrl, server.done, instance)
      } else
        running.push(
          pnpm(
            [
              "run",
              "dev",
              ...(member.type === "web"
                ? ["--host", "127.0.0.1", "--port", "5173", "--strictPort"]
                : []),
              ...args
            ],
            cwd
          ).done
        )
    }
    await Promise.race(running)
    return
  }
  for (const member of members) {
    const cwd = path.join(root, member.directory)
    if (member.type === "server") {
      if (action === "validate") continue
      const command =
        action === "test"
          ? ["test", "./..."]
          : action === "lint"
            ? ["vet", "./..."]
            : action === "build"
              ? [
                  "build",
                  "-o",
                  "bin/server" + (process.platform === "win32" ? ".exe" : ""),
                  "./cmd/server"
                ]
              : ["test", "-run", "^$", "./..."]
      await launch("go", command, cwd).done
    } else
      await pnpm(
        action === "validate" ? ["run", "harness", "validate"] : ["run", action, ...args],
        cwd
      ).done
  }
}

const executed =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (executed) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
  let forceStop
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopping = true
      for (const child of children.keys()) stopChild(child)
      forceStop ??= setTimeout(() => {
        for (const child of children.keys()) stopChild(child, true)
      }, 1500).unref()
      process.exitCode = signal === "SIGINT" ? 130 : 143
    })
  runWorkspace(process.argv.slice(2), root)
    .catch((error) => {
      console.error(error.message)
      if (!process.exitCode) process.exitCode = 1
    })
    .finally(async () => {
      clearTimeout(forceStop)
      stopping = true
      for (const child of children.keys()) stopChild(child)
      let deadline
      await Promise.race([
        Promise.allSettled([...children.values()]),
        new Promise((resolve) => {
          deadline = setTimeout(resolve, 1500)
        })
      ])
      clearTimeout(deadline)
      for (const child of children.keys()) stopChild(child, true)
      children.clear()
    })
}
