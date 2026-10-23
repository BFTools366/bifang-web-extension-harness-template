import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { setTimeout } from "node:timers/promises"
import { promisify } from "node:util"
import { cp, mkdir, readFile, readdir, realpath, stat, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"
import { startGoFixture } from "./go-identity-support.ts"

const execute = promisify(execFile)

/** 创建可经真实根 CLI 读取的工作区；前端替身只验证编排，不能证明真实前端构建通过。 */
async function fixture(types: string[] = ["web", "extension"]) {
  const root = await realpath(await temporaryDirectory("workspace release "))
  await cp(path.join(repositoryRoot, ".harness/runtime"), path.join(root, ".harness/runtime"), {
    recursive: true
  })
  await writeFile(
    path.join(root, ".harness/workspace.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "workspace",
      id: "example",
      members: types.map((type) => ({ type, directory: `example_${type}` })),
      service: {
        mode: types.includes("server") ? "create" : "existing",
        developmentBaseUrl: "http://127.0.0.1:8080"
      }
    })
  )
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "example", private: true, scripts: { dev: "node runtime.mjs" } })
  )
  await writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:" +
      (types.some((type) => type !== "server")
        ? "\n" +
          types
            .filter((type) => type !== "server")
            .map((type) => `  - "example_${type}"\n`)
            .join("")
        : " []\n")
  )
  for (const type of types) {
    const member = path.join(root, `example_${type}`)
    await mkdir(path.join(member, ".harness"), { recursive: true })
    if (type === "server") {
      await writeFile(path.join(member, "go.mod"), "module example_server\n")
      continue
    }
    await mkdir(path.join(member, "src/data/api/client"), { recursive: true })
    await writeFile(
      path.join(member, ".harness/project.json"),
      JSON.stringify({ id: `example_${type}`, projectType: type })
    )
    await writeFile(path.join(member, "package.json"), JSON.stringify({ name: `example_${type}` }))
    await writeFile(
      path.join(member, ".env.development"),
      `${type === "web" ? "VITE" : "PLASMO_PUBLIC"}_API_BASE_URL=http://127.0.0.1:8080\n`
    )
    for (const file of [".env.test", ".env.production", "src/data/api/client/httpRuntime.ts"])
      await writeFile(path.join(member, file), "")
  }
  const pnpm = path.join(root, "test-pnpm.mjs")
  await writeFile(
    pnpm,
    `import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
const kind=path.basename(process.cwd()).endsWith('_web')?'web':'extension';
await appendFile('../commands.jsonl',JSON.stringify({kind,args:process.argv.slice(2)})+'\\n');
if(process.env.FAIL_TARGET===kind)process.exit(2);
if(kind==='web'){
 await mkdir('dist/empty',{recursive:true}); await writeFile('dist/index.html','<html>release</html>');
 await writeFile('dist/图片.bin',new Uint8Array([0,255,34,88]));
}else for(const [name,mv] of [['chrome-mv3',3],['firefox-mv2',2]]){
 if(process.env.MISSING_FIREFOX && mv===2)continue;
 await mkdir('build/'+name+'-prod',{recursive:true});
 await writeFile('build/'+name+'-prod/manifest.json',JSON.stringify({manifest_version:mv}));
 await writeFile('build/'+name+'-prod/popup.html',kind+name);
}`
  )
  return { root, pnpm }
}

/** 调用实际根发布 CLI，不用直接调用归档函数绕过 Workspace 验证。 */
function release(root: string, pnpm: string, args: string[], env: Record<string, string> = {}) {
  return execute(process.execPath, [".harness/runtime/workspace.mjs", "release", ...args], {
    cwd: root,
    env: { ...process.env, npm_execpath: pnpm, ...env },
    timeout: 120_000
  })
}

/** 用 Go 标准库独立解压并校验 CRC、目录和权限，不依赖归档实现自身读取。 */
async function inspectZip(root: string, file: string, extract = "") {
  const helper = path.join(root, "inspect.go")
  await writeFile(
    helper,
    `package main
import("archive/zip";"encoding/json";"io";"os";"path/filepath")
func main(){r,e:=zip.OpenReader(os.Args[1]);if e!=nil{panic(e)};defer r.Close();out:=map[string]any{};for _,f:=range r.File{v,e:=f.Open();if e!=nil{panic(e)};b,e:=io.ReadAll(v);if e!=nil{panic(e)};v.Close();if len(os.Args)>2 && os.Args[2]!="" {if filepath.Base(f.Name)!=f.Name{panic("expected server files")};if e:=os.WriteFile(filepath.Join(os.Args[2],f.Name),b,f.Mode().Perm());e!=nil{panic(e)}};if len(b)>4096{b=b[:4096]};out[f.Name]=map[string]any{"bytes":b,"mode":uint32(f.Mode().Perm())}};json.NewEncoder(os.Stdout).Encode(out)}
`
  )
  const { stdout } = await execute("go", ["run", helper, file, extract], {
    cwd: root,
    env: { ...process.env, GOOS: "", GOARCH: "", CGO_ENABLED: "0" },
    timeout: 30_000
  })
  return JSON.parse(stdout) as Record<string, { bytes: string; mode: number }>
}

describe("Workspace ZIP 发布", () => {
  /** 两个前端归档都读取本次目录，保留资源和空目录，不嵌套 dist 或旧 ZIP。 */
  test("Web 解压目录使用成员名，Extension 同时包含 Chrome 与 Firefox", async () => {
    const { root, pnpm } = await fixture()
    await release(root, pnpm, ["--e2e=disabled"])
    expect((await readdir(path.join(root, "release"))).sort()).toEqual(["extension.zip", "web.zip"])
    const web = await inspectZip(root, path.join(root, "release/web.zip"))
    expect(Object.keys(web).sort()).toEqual([
      "example_web/",
      "example_web/empty/",
      "example_web/index.html",
      "example_web/图片.bin"
    ])
    expect(Buffer.from(web["example_web/图片.bin"]?.bytes ?? "", "base64")).toEqual(
      Buffer.from([0, 255, 34, 88])
    )
    const extension = await inspectZip(root, path.join(root, "release/extension.zip"))
    for (const [browser, version] of [
      ["chrome", 3],
      ["firefox", 2]
    ] as const) {
      const manifest = Buffer.from(
        extension[`${browser}/manifest.json`]?.bytes ?? "",
        "base64"
      ).toString()
      expect(JSON.parse(manifest).manifest_version).toBe(version)
      expect(extension[`${browser}/popup.html`]).toBeDefined()
    }
    const commands = (await readFile(path.join(root, "commands.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(commands).toEqual([
      { kind: "web", args: ["run", "build", "--e2e=disabled"] },
      { kind: "extension", args: ["run", "package", "--e2e=disabled"] }
    ])
  }, 60_000)

  /** 构建失败或缺一个目标时，旧 ZIP 不得被替换，暂存目录必须清理。 */
  test("失败时保留原包并清理本次暂存", async () => {
    const { root, pnpm } = await fixture()
    await mkdir(path.join(root, "release"))
    const archive = path.join(root, "release/extension.zip")
    await writeFile(archive, "previous package")
    await expect(
      release(root, pnpm, ["--member=extension", "--e2e=disabled"], { FAIL_TARGET: "extension" })
    ).rejects.toThrow()
    await expect(
      release(root, pnpm, ["--member=extension", "--e2e=disabled"], { MISSING_FIREFOX: "1" })
    ).rejects.toThrow()
    expect(await readFile(archive, "utf8")).toBe("previous package")
    expect(await readdir(path.join(root, "release"))).toEqual(["extension.zip"])
  })

  /** 在真实流式压缩期间取消根 CLI，既有归档仍保留且暂存不会遗留。 */
  test("压缩期间取消不会替换旧 ZIP", async () => {
    if (process.platform === "win32") return
    const { root, pnpm } = await fixture(["web"])
    await mkdir(path.join(root, "example_web/dist"))
    await writeFile(path.join(root, "example_web/dist/large.bin"), randomBytes(32 * 1024 * 1024))
    await mkdir(path.join(root, "release"))
    const archive = path.join(root, "release/web.zip")
    await writeFile(archive, "previous package")
    const running = release(root, pnpm, ["--e2e=disabled"])
    const result = running.then(
      () => ({ code: 0 }),
      (error: { code: number }) => error
    )
    try {
      const deadline = Date.now() + 10_000
      let compressing = false
      while (Date.now() < deadline) {
        const stage = (await readdir(path.join(root, "release"))).find((file) =>
          file.startsWith(".web-")
        )
        if (stage) {
          const partial = await stat(path.join(root, "release", stage, "web.zip")).catch(
            () => undefined
          )
          if (partial && partial.size > 1024) {
            compressing = true
            break
          }
        }
        await setTimeout(10)
      }
      expect(compressing).toBe(true)
      running.child.kill("SIGINT")
      expect((await result).code).toBe(130)
      expect(await readFile(archive, "utf8")).toBe("previous package")
      expect(await readdir(path.join(root, "release"))).toEqual(["web.zip"])
    } finally {
      if (running.child.exitCode === null) running.child.kill("SIGKILL")
      await result
    }
  }, 20_000)

  /** 所有必要选择在任何构建前完成，未知与原型键不能被静默忽略。 */
  test("拒绝缺失平台、非法参数和重复选择", async () => {
    const { root, pnpm } = await fixture(["server"])
    for (const args of [
      [],
      ["--platform=linux/x64"],
      ["--platform=linux/amd64", "--platform=linux/arm64"],
      ["constructor", "ignored"],
      ["__proto__", "ignored"]
    ])
      await expect(release(root, pnpm, args)).rejects.toThrow()
    await expect(readdir(path.join(root, "release"))).rejects.toThrow()
  })

  /** 交互 Server 发布必须提出平台问题，并采用实际输入而非本机默认平台。 */
  test("交互发布询问 Server 平台", async () => {
    const runtime = pathToFileURL(path.join(repositoryRoot, ".harness/runtime/release.mjs")).href
    const running = execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {resolveReleaseSelections} from ${JSON.stringify(runtime)};
const result = await resolveReleaseSelections({}, [{type:'server'}], true);
process.stdout.write(JSON.stringify(result));`
      ],
      { timeout: 10_000 }
    )
    running.child.stdin?.end("linux/arm64\n")
    const { stdout } = await running
    expect(stdout).toContain("Server 目标平台")
    expect(stdout).toContain('"platform":"linux/arm64"')
    expect(stdout).not.toContain("E2E")
  })

  /** ZIP 不能跟随源或目标链接；原有的 release 中其他文件应受到保护。 */
  test("拒绝归档中的链接和 release 目录链接", async () => {
    if (process.platform === "win32") return
    const { root, pnpm } = await fixture(["web"])
    const outside = await temporaryDirectory("release-outside-")
    await symlink(outside, path.join(root, "release"))
    await expect(release(root, pnpm, ["--e2e=disabled"])).rejects.toThrow(/普通目录/)
    expect(await readdir(outside)).toEqual([])
    const second = await fixture(["web"])
    await mkdir(path.join(second.root, "example_web/dist"))
    await symlink(outside, path.join(second.root, "example_web/dist/leak"))
    await expect(release(second.root, second.pnpm, ["--e2e=disabled"])).rejects.toThrow(/符号链接/)
    expect(await readdir(path.join(second.root, "release"))).toEqual([])
  })

  /** 真实 Go 发布只包含二进制和配置，目标选择影响 Windows 后缀；生产文件不混入开发覆盖。 */
  test("Server 真实交叉编译并生成单份生产配置", async () => {
    const { root, pnpm } = await fixture(["server"])
    await cp(
      path.join(repositoryRoot, ".agents/skills/go-implement-service/assets/go-service"),
      path.join(root, ".agents/skills/go-implement-service/assets/go-service"),
      { recursive: true }
    )
    // 删除结构哨兵，由真正的服务生成器建立所有文件。
    const { rm } = await import("node:fs/promises")
    await rm(path.join(root, "example_server"), { recursive: true })
    await generateGoServer(root, "example_server", "example_server")
    await release(root, pnpm, ["--platform=windows/amd64"])
    const entries = await inspectZip(root, path.join(root, "release/server.zip"))
    expect(Object.keys(entries).sort()).toEqual(["config.yaml", "example_server.exe"])
    expect(
      Buffer.from(entries["example_server.exe"]?.bytes ?? "", "base64")
        .subarray(0, 2)
        .toString()
    ).toBe("MZ")
    expect(entries["example_server.exe"]?.mode).toBe(0o755)
    const yaml = Buffer.from(entries["config.yaml"]?.bytes ?? "", "base64").toString()
    expect(yaml).toMatch(/env: prod/u)
    expect(yaml).toMatch(/mode: release/u)
    expect(yaml).toMatch(/dsn: data\/app.db/u)
    expect(yaml).not.toContain("localhost:5173")
    expect(yaml).not.toContain("change-me-in-production-please")
    const hostOS = process.platform === "win32" ? "windows" : process.platform
    const hostArch = process.arch === "x64" ? "amd64" : process.arch
    await release(root, pnpm, [`--platform=${hostOS}/${hostArch}`])
    const unpacked = path.join(root, "standalone")
    await mkdir(unpacked)
    await inspectZip(root, path.join(root, "release/server.zip"), unpacked)
    expect((await readdir(unpacked)).sort()).toEqual(
      ["config.yaml", process.platform === "win32" ? "example_server.exe" : "example_server"].sort()
    )
    const database = path.join(unpacked, "custom-data/runtime.db")
    const running = await startGoFixture(
      unpacked,
      path.join(unpacked, process.platform === "win32" ? "example_server.exe" : "example_server"),
      {
        APP_ENV: "prod",
        APP_JWT_SECRET: "standalone-production-test-secret",
        APP_DATABASE_DSN: database
      }
    )
    try {
      expect((await fetch(running.url + "/healthz")).status).toBe(200)
      expect((await stat(database)).isFile()).toBe(true)
      await expect(stat(path.join(unpacked, "data/app.db"))).rejects.toThrow()
    } finally {
      await running.stop()
    }
  }, 130_000)
})
