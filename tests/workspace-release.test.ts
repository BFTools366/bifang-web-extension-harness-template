import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { setTimeout } from "node:timers/promises"
import { promisify } from "node:util"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises"
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
if(process.env.CHANGE_SERVER_CONFIG)await writeFile('../example_server/configs/config-prod.yaml','server:\\n  port: 8133\\n');
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

/** 为发布编排测试生成真实生产配置导出器，前端构建仍使用明确的编排替身。 */
async function serverFixture(types = ["web", "extension", "server"]) {
  const result = await fixture(types)
  await cp(
    path.join(repositoryRoot, ".agents/skills/go-implement-service/assets/go-service"),
    path.join(result.root, ".agents/skills/go-implement-service/assets/go-service"),
    { recursive: true }
  )
  await rm(path.join(result.root, "example_server"), { recursive: true })
  await generateGoServer(result.root, "example_server", "example_server")
  await writeFile(
    path.join(result.root, "example_server/configs/config-prod.yaml"),
    "app:\n  env: prod\nserver:\n  host: 0.0.0.0\n  port: 8123\n  mode: release\n"
  )
  return result
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
  /** 首次缺地址必须得到明确确认，生产端口优先，既有 ZIP 和其他配置不被重置。 */
  test("首次本机地址建议确认后持久化，后续沿用已有值", async () => {
    const { root, pnpm } = await serverFixture()
    const web = path.join(root, "example_web/.env.production")
    const extension = path.join(root, "example_extension/.env.production")
    const original =
      "# retain comment\r\nVITE_APP_ENV=release\r\nVITE_API_BASE_URL=\r\nVITE_LOG_LEVEL=error\r\nVITE_REQUEST_TIMEOUT_MS=17000\r\n"
    await writeFile(web, original)
    await mkdir(path.join(root, "release"))
    await writeFile(path.join(root, "release/web.zip"), "previous")
    await expect(
      release(root, pnpm, ["--member=web", "--e2e=disabled"], { APP_SERVER_PORT: "9999" })
    ).rejects.toThrow(/--confirm-local-base-url=http:\/\/127\.0\.0\.1:8123/)
    await expect(
      release(root, pnpm, [
        "--member=web",
        "--e2e=disabled",
        "--confirm-local-base-url=http://127.0.0.1:8080"
      ])
    ).rejects.toThrow(/确认不匹配/)
    expect(await readFile(web, "utf8")).toBe(original)
    expect(await readFile(path.join(root, "release/web.zip"), "utf8")).toBe("previous")
    expect(await readdir(path.join(root, "release"))).toEqual(["web.zip"])

    const runtime = pathToFileURL(path.join(root, ".harness/runtime/release.mjs")).href
    const workspace = pathToFileURL(path.join(root, ".harness/runtime/workspace.mjs")).href
    const code = `import {prepareReleaseBaseUrl} from ${JSON.stringify(runtime)};
import {readWorkspace} from ${JSON.stringify(workspace)};
import {execFile} from 'node:child_process'; import {promisify} from 'node:util';
const root=process.cwd(),config=await readWorkspace(root);
await prepareReleaseBaseUrl(root,config,config.members,{},
{go:async(args,cwd,env)=>{await promisify(execFile)('go',args,{cwd,env});}},true);`
    for (const answer of ["n\n", "\n"]) {
      const running = execute(process.execPath, ["--input-type=module", "-e", code], {
        cwd: root,
        timeout: 30_000
      })
      running.child.stdin?.end(answer)
      await expect(running).rejects.toThrow(/未获确认/)
      expect(await readFile(web, "utf8")).toBe(original)
      expect(await readFile(extension, "utf8")).toBe("")
    }
    const cancelled =
      `import {readFileSync} from 'node:fs';\n` +
      code
        .replace(
          "config.members,{},",
          "config.members,{confirmLocalBaseUrl:'http://127.0.0.1:8123'},"
        )
        .replace(
          "{go:async",
          "{signal:{throwIfAborted(){if(readFileSync('example_web/.env.production','utf8').includes('http://127.0.0.1:8123'))throw new Error('test cancellation');}},go:async"
        )
        .replace("}},true);", "}},false);")
    await expect(
      execute(process.execPath, ["--input-type=module", "-e", cancelled], {
        cwd: root,
        timeout: 30_000
      })
    ).rejects.toThrow(/test cancellation/)
    expect(await readFile(web, "utf8")).toBe(original)
    expect(await readFile(extension, "utf8")).toBe("")
    expect(
      (await readdir(path.dirname(web))).some((file) => file.startsWith(".harness-release-"))
    ).toBe(false)
    const running = execute(process.execPath, ["--input-type=module", "-e", code], {
      cwd: root,
      timeout: 30_000
    })
    running.child.stdin?.end("y\n")
    expect((await running).stdout).toContain("http://127.0.0.1:8123")
    expect(await readFile(web, "utf8")).toBe(
      original.replace("VITE_API_BASE_URL=", "VITE_API_BASE_URL=http://127.0.0.1:8123")
    )
    expect(await readFile(extension, "utf8")).toBe(
      "PLASMO_PUBLIC_API_BASE_URL=http://127.0.0.1:8123\n"
    )
    // 现有值无需再次调用导出器，且只发布所选前端。
    await rename(
      path.join(root, "example_server/cmd/release-config"),
      path.join(root, "example_server/cmd/disabled-exporter")
    )
    await release(root, pnpm, ["--member=web", "--e2e=disabled"])
    expect(await readFile(extension, "utf8")).toBe(
      "PLASMO_PUBLIC_API_BASE_URL=http://127.0.0.1:8123\n"
    )
    expect(Object.keys(await inspectZip(root, path.join(root, "release/web.zip")))).toContain(
      "example_web/index.html"
    )
  }, 90_000)

  /** 地址导出只支持真实 HTTP 回环监听，严格验证生产端口且不覆盖已有输出。 */
  test("Go 地址导出覆盖 IPv4、IPv6、默认端口和非法监听", async () => {
    const { root } = await serverFixture(["server"])
    const cwd = path.join(root, "example_server")
    await writeFile(
      path.join(cwd, "cmd/release-config/main_test.go"),
      `package main
import("os";"path/filepath";"testing")
func TestLocalAddress(t *testing.T){
 for _,c:=range []struct{host,port,want string}{
  {"0.0.0.0","8123","http://127.0.0.1:8123\\n"},
  {"127.0.0.1","80","http://127.0.0.1:80\\n"},
  {"localhost","8081","http://127.0.0.1:8081\\n"},
  {"[::]","8124","http://[::1]:8124\\n"},
  {"[::1]","8125","http://[::1]:8125\\n"},
  {"127.0.0.1","0",""},{"127.0.0.1","65536",""},
  {"127.0.0.1","8.5",""},{"127.0.0.1","true",""},
  {"192.168.1.2","8123",""},{"::","8123",""},
 }{
  directory:=t.TempDir(); configuration:=filepath.Join(directory,"config.yaml"); output:=filepath.Join(directory,"url.txt")
  if err:=os.WriteFile(configuration,[]byte("server:\\n  host: \\""+c.host+"\\"\\n  port: "+c.port+"\\n"),0600);err!=nil{t.Fatal(err)}
  err:=writeLocalBaseURL(configuration,output)
  if c.want==""{if err==nil{t.Fatal("invalid listener accepted")};continue}
  if err!=nil{t.Fatal(err)}; actual,err:=os.ReadFile(output);if err!=nil||string(actual)!=c.want{t.Fatalf("unexpected URL: %q %v",actual,err)}
  if err:=writeLocalBaseURL(configuration,output);err==nil{t.Fatal("existing URL overwritten")}
 }
}
`
    )
    await execute("go", ["test", "./cmd/release-config"], {
      cwd,
      env: { ...process.env, GOOS: "", GOARCH: "", CGO_ENABLED: "0", APP_SERVER_PORT: "9999" },
      timeout: 60_000
    })
  }, 90_000)

  /** 非交互确认绑定到实际生产地址；已有值、进程覆盖和无服务项目不被自动替换。 */
  test("非交互显式确认只补选中空地址，且校验旧导出器与生产监听", async () => {
    const { root, pnpm } = await serverFixture()
    const web = path.join(root, "example_web/.env.production")
    const extension = path.join(root, "example_extension/.env.production")
    await writeFile(extension, "PLASMO_PUBLIC_API_BASE_URL=https://kept.example.com\n")
    await release(root, pnpm, ["--member=web", "--e2e=disabled"], {
      VITE_API_BASE_URL: "https://explicit.example.com"
    })
    expect(await readFile(web, "utf8")).toBe("")
    await expect(
      release(root, pnpm, ["--member=web", "--e2e=disabled"], { VITE_API_BASE_URL: "" })
    ).rejects.toThrow(/移除空的进程覆盖/)
    await release(root, pnpm, [
      "--member=web",
      "--e2e=disabled",
      "--confirm-local-base-url=http://127.0.0.1:8123"
    ])
    expect(await readFile(web, "utf8")).toBe("VITE_API_BASE_URL=http://127.0.0.1:8123\n")
    expect(await readFile(extension, "utf8")).toBe(
      "PLASMO_PUBLIC_API_BASE_URL=https://kept.example.com\n"
    )
    await writeFile(web, "")
    const command = path.join(root, "example_server/cmd/release-config/main.go")
    const source = await readFile(command, "utf8")
    await writeFile(
      command,
      source.replace(
        'flag.String("local-base-url-output"',
        'flag.String("old-local-base-url-output"'
      )
    )
    await expect(release(root, pnpm, ["--member=web", "--e2e=disabled"])).rejects.toThrow(
      /新版地址导出接口/
    )
    await writeFile(command, source)
    await writeFile(
      path.join(root, "example_server/configs/config-prod.yaml"),
      "server:\n  port: 0\n"
    )
    await expect(release(root, pnpm, ["--member=web", "--e2e=disabled"])).rejects.toThrow(
      /server.port/
    )
    expect(await readFile(web, "utf8")).toBe("")
    const previousArchive = await readFile(path.join(root, "release/web.zip"))
    await writeFile(
      path.join(root, "example_server/configs/config-prod.yaml"),
      "server:\n  host: 127.0.0.1\n  port: 8123\n"
    )
    await expect(
      release(
        root,
        pnpm,
        ["--member=web", "--e2e=disabled", "--confirm-local-base-url=http://127.0.0.1:8123"],
        { CHANGE_SERVER_CONFIG: "1" }
      )
    ).rejects.toThrow(/发布配置已变化/)
    expect(await readFile(path.join(root, "release/web.zip"))).toEqual(previousArchive)
    expect(await readdir(path.join(root, "release"))).toEqual(["web.zip"])
  }, 90_000)

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
