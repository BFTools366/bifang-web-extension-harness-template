import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { prepareGoRelease } from "../.agents/skills/web-upgrade-harness/scripts/prepare-go-release.ts"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"
import { startGoFixture } from "./go-identity-support.ts"

const execute = promisify(execFile)

/** 建立私有测试 Git 身份，不配置或提交当前源仓库。 */
async function commitFixture(root: string) {
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture"
    ]
  ])
    await execute("git", args, { cwd: root })
  return (await execute("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim()
}

/** 用真实旧配置资产和自定义业务扩展建立下游；当前源码模板单独冻结供提案读取。 */
async function legacyFixture() {
  const parent = await realpath(await temporaryDirectory("go-release-migration-"))
  const source = path.join(parent, "source"),
    target = path.join(parent, "target")
  await mkdir(path.join(source, ".harness/tooling/templates"), { recursive: true })
  await cp(
    path.join(repositoryRoot, ".harness/tooling/templates/go-config.ts"),
    path.join(source, ".harness/tooling/templates/go-config.ts")
  )
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ type: "module", scripts: { instantiate: "fixture" } })
  )
  const sourceCommit = await commitFixture(source)
  await cp(
    path.join(repositoryRoot, ".agents/skills/go-implement-service/assets/go-service"),
    path.join(target, ".agents/skills/go-implement-service/assets/go-service"),
    { recursive: true }
  )
  await generateGoServer(target, "legacy_server", "legacy_server")
  const server = path.join(target, "legacy_server")
  for (const file of [
    "internal/config/environment.go",
    "internal/config/release.go",
    "internal/config/release_test.go",
    "cmd/release-config",
    "configs/config-prod.yaml"
  ])
    await rm(path.join(server, file), { recursive: true })
  let legacy = (
    await readFile(
      path.join(
        repositoryRoot,
        ".agents/skills/go-implement-service/assets/go-service/internal/config/config.go"
      ),
      "utf8"
    )
  )
    .replaceAll("<project_id>", "legacy_server")
    .replaceAll("project_id", "legacy_server")
  legacy = legacy.replace(
    "type Config struct {",
    'type Config struct {\n Business struct { Mode string `mapstructure:"mode"` } `mapstructure:"business"`'
  )
  legacy = legacy.replace(
    "func (c *Config) Validate() error {",
    'func (c *Config) Validate() error {\n if c.Business.Mode == "" { return errors.New("business mode missing") }'
  )
  legacy = legacy.replace(
    "func setDefaults(instance *viper.Viper) {",
    'func setDefaults(instance *viper.Viper) {\n instance.SetDefault("business.mode", "legacy-default")'
  )
  legacy = legacy.replace(
    "func readInto(instance *viper.Viper, path string) error {",
    'func readInto(instance *viper.Viper, path string) error {\n if value := os.Getenv("APP_CUSTOM_MERGE_SENTINEL"); value != "" { instance.Set("business.private_hook", value) }'
  )
  legacy +=
    '\n// BusinessPolicy 是目标已有的业务辅助函数，不能被默认值迁移截掉。\nfunc BusinessPolicy() string { return "kept-business-code" }\n'
  await writeFile(path.join(server, "internal/config/config.go"), legacy)
  const base =
    (await readFile(path.join(server, "configs/config.yaml"), "utf8")).replace(
      "change-me-in-production-please",
      "private-config-secret-keep-verbatim"
    ) +
    "\nbusiness:\n  # 产品已有注释和值必须保留。\n  enabled: false\n  retries: 0\n  nested:\n    labels: [alpha, beta]\n"
  await writeFile(path.join(server, "configs/config.yaml"), base)
  const router = (await readFile(path.join(server, "internal/api/router.go"), "utf8")).replace(
    "v1.Register(engine, deps)",
    'v1.Register(engine, deps)\n engine.GET("/business-policy", func(c *gin.Context) { c.JSON(200, gin.H{"mode": deps.Config.Business.Mode, "env": deps.Config.App.Env, "policy": config.BusinessPolicy()}) })'
  )
  await writeFile(path.join(server, "internal/api/router.go"), router)
  await cp(path.join(repositoryRoot, ".harness/runtime"), path.join(target, ".harness/runtime"), {
    recursive: true
  })
  await writeFile(
    path.join(target, ".harness/workspace.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "workspace",
      id: "legacy",
      members: [{ type: "server", directory: "legacy_server" }],
      service: { mode: "create", developmentBaseUrl: "http://127.0.0.1:8080" }
    })
  )
  await writeFile(
    path.join(target, "package.json"),
    JSON.stringify({
      name: "legacy",
      private: true,
      type: "module",
      scripts: {
        dev: "node .harness/runtime/workspace.mjs dev",
        "release:server": "node .harness/runtime/workspace.mjs release --member server"
      }
    })
  )
  await writeFile(path.join(target, "pnpm-workspace.yaml"), "packages: []\n")
  await commitFixture(target)
  return { parent, source, target, sourceCommit, server, base, legacy, router }
}

/** 真实根 CLI 复用现有发布脚本，只处理 Server；所有主机环境秘密必须留在包外。 */
function release(target: string, environment: Record<string, string> = {}) {
  const platform = `${process.platform === "win32" ? "windows" : process.platform}/${process.arch === "x64" ? "amd64" : process.arch}`
  return execute(
    process.execPath,
    [".harness/runtime/workspace.mjs", "release", "--member=server", `--platform=${platform}`],
    {
      cwd: target,
      env: { ...process.env, ...environment },
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024
    }
  )
}

/** 独立 Go archive/zip 校验 CRC 并解压两个普通条目，不使用被测归档器读取自己。 */
async function unpack(target: string, output: string) {
  const helper = path.join(target, "unpack.go")
  await writeFile(
    helper,
    `package main
import("archive/zip";"io";"os";"path/filepath")
func main(){r,e:=zip.OpenReader(os.Args[1]);if e!=nil{panic(e)};defer r.Close();if len(r.File)!=2{panic("expected binary and config")};for _,f:=range r.File{if filepath.Base(f.Name)!=f.Name{panic("unexpected directory")};v,e:=f.Open();if e!=nil{panic(e)};b,e:=io.ReadAll(v);if e!=nil{panic(e)};v.Close();if e:=os.WriteFile(filepath.Join(os.Args[2],f.Name),b,f.Mode().Perm());e!=nil{panic(e)}}}
`
  )
  await execute("go", ["run", helper, path.join(target, "release/server.zip"), output], {
    env: { ...process.env, GOOS: "", GOARCH: "", CGO_ENABLED: "0" },
    timeout: 30_000
  })
}

describe("旧 Go 服务发布迁移", () => {
  /** 预演不写目标，已有生产配置和自定义工具均不能被候选覆盖，报告不含秘密。 */
  test("保留已有配置和发布工具，仅生成独立提案", async () => {
    const f = await legacyFixture()
    const production =
      "app:\n  env: prod\nbusiness:\n  mode: product-prod\njwt:\n  secret: keep-private-production-value\n"
    await writeFile(path.join(f.server, "configs/config-prod.yaml"), production)
    const existing = "// existing product exporter\npackage config\n"
    await writeFile(path.join(f.server, "internal/config/release.go"), existing)
    const plan = await prepareGoRelease({
      sourceRoot: f.source,
      sourceCommit: f.sourceCommit,
      targetRoot: f.target,
      output: path.join(f.parent, "proposal")
    })
    expect(plan.targetWritten).toBe(false)
    expect(plan.entries.find((entry) => entry.path.endsWith("config-prod.yaml"))).toMatchObject({
      action: "preserve_existing"
    })
    expect(
      plan.entries.find((entry) => entry.path.endsWith("config-prod.yaml"))?.candidate
    ).toBeUndefined()
    expect(
      plan.entries.find((entry) => entry.path.endsWith("internal/config/release.go"))
    ).toMatchObject({ action: "review_existing" })
    expect(JSON.stringify(plan)).not.toContain("keep-private-production-value")
    expect(await readFile(path.join(f.server, "configs/config-prod.yaml"), "utf8")).toBe(production)
    expect(await readFile(path.join(f.server, "configs/config.yaml"), "utf8")).toBe(f.base)
    expect(await readFile(path.join(f.server, "internal/config/config.go"), "utf8")).toBe(f.legacy)
    expect(await readFile(path.join(f.server, "internal/config/release.go"), "utf8")).toBe(existing)
    await expect(
      stat(path.join(plan.output, "files/legacy_server/configs/config-prod.yaml"))
    ).rejects.toThrow()
  })

  /** 不匹配的源、目标内输出或链接在任何输出创建前失败，不借错误授权写用户文件。 */
  test("拒绝错误来源、输出越界及配置链接", async () => {
    const f = await legacyFixture()
    const options = {
      sourceRoot: f.source,
      sourceCommit: f.sourceCommit,
      targetRoot: f.target,
      output: path.join(f.parent, "proposal")
    }
    await expect(prepareGoRelease({ ...options, sourceCommit: "0".repeat(40) })).rejects.toThrow(
      /commit/
    )
    await expect(
      prepareGoRelease({ ...options, output: path.join(f.target, "proposal") })
    ).rejects.toThrow(/outside/)
    if (process.platform !== "win32") {
      await symlink(
        path.join(f.server, "configs/config.yaml"),
        path.join(f.server, "configs/config-prod.yaml")
      )
      await expect(prepareGoRelease(options)).rejects.toThrow(/regular file/)
    }
    await expect(stat(options.output)).rejects.toThrow()
    expect(await readFile(path.join(f.server, "configs/config.yaml"), "utf8")).toBe(f.base)
  })

  /** 按 Skill 对已审阅旧函数局部合并，实际根发布、独立解压和旧业务启动均通过。 */
  test.each([true, false])(
    "旧服务迁移后可打包并保留业务（已有 prod=%s）",
    async (existingProduction) => {
      const f = await legacyFixture()
      await mkdir(path.join(f.target, "release"))
      const zip = path.join(f.target, "release/server.zip")
      await writeFile(zip, "previous package")
      await expect(release(f.target)).rejects.toThrow(/Go 发布迁移流程/)
      expect(await readFile(zip, "utf8")).toBe("previous package")
      const production =
        "app:\n  env: prod\nserver:\n  mode: release\nbusiness:\n  mode: product-prod\n"
      const expectedMode = existingProduction ? "product-prod" : "legacy-default"
      if (existingProduction)
        await writeFile(path.join(f.server, "configs/config-prod.yaml"), production)
      const plan = await prepareGoRelease({
        sourceRoot: f.source,
        sourceCommit: f.sourceCommit,
        targetRoot: f.target,
        output: path.join(f.parent, "proposal")
      })
      for (const entry of plan.entries) {
        if (entry.action !== "add" || !entry.candidate) continue
        const file = path.join(f.target, entry.path)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, await readFile(path.join(plan.output, entry.candidate.path)), {
          flag: "wx"
        })
      }
      // 仅替换已审阅的 Load 函数；业务 Config、Validate、默认值尾部和自定义函数保留。
      const start = f.legacy.indexOf("func Load(path string, env string)"),
        end = f.legacy.indexOf("// ResolveEnv", start)
      const load = await readFile(path.join(plan.output, plan.reference), "utf8")
      let merged = f.legacy.slice(0, start) + load + f.legacy.slice(end)
      merged = merged
        .replace('DefaultPath = "configs/config.yaml"', 'DefaultPath = ""')
        .replace("return DefaultEnv\n}", 'return ""\n}')
        .replace(
          "return errors.As(err, &pathErr)",
          "return errors.As(err, &pathErr) && errors.Is(err, fs.ErrNotExist)"
        )
        .replace("RateLimit RateLimit\n", 'RateLimit RateLimit `mapstructure:"rate_limit"`\n')
      // 已有值保持原字节，只给缺失键补上旧代码中实际依赖的默认值，再移除该代码默认。
      const migratedBase = f.base.replace("business:\n", "business:\n  mode: legacy-default\n")
      merged = merged
        .replace(' instance.SetDefault("business.mode", "legacy-default")\n', "")
        .replace('\tinstance.SetDefault("database.dsn", "data/app.db")\n', "")
      merged = merged.replace(
        "func (c *Config) Validate() error {",
        'func (c *Config) Validate() error {\n if c.App.IsProd() && c.JWT.Secret == "change-me-in-production-please" { return errors.New("public production secret") }'
      )
      await writeFile(path.join(f.server, "internal/config/config.go"), merged)
      await writeFile(path.join(f.server, "configs/config.yaml"), migratedBase)
      const regression = `package config
import("os";"path/filepath";"testing";"strings")
func TestMigratedBusinessAndEnvironment(t *testing.T){
 t.Setenv("APP_ENV", "");t.Setenv("APP_DATABASE_DSN", "");t.Setenv("APP_JWT_SECRET", "");t.Setenv("APP_BUSINESS_MODE", "")
 cfg,e:=Load("../../configs/config.yaml", "dev");if e!=nil{t.Fatal(e)};if cfg.Business.Mode!="legacy-default"||BusinessPolicy()!="kept-business-code"{t.Fatal("business defaults or code lost")}
 cfg,e=Load("../../configs/config.yaml", "prod");if e!=nil||cfg.Business.Mode!="${expectedMode}"||!cfg.App.IsProd(){t.Fatal("production custom config lost",e)}
 t.Setenv("APP_ENV","test");cfg,e=Load("../../configs/config.yaml", "prod");if e!=nil||cfg.App.Env!="prod"{t.Fatal("explicit environment priority lost",e)}
 if _,e:=Load(filepath.Join(t.TempDir(),"missing.yaml"),"");e==nil{t.Fatal("explicit missing path must fail")}
 out:=filepath.Join(t.TempDir(),"release.yaml");cwd,_:=os.Getwd();if e:=os.Chdir("../..");e!=nil{t.Fatal(e)};defer os.Chdir(cwd)
 t.Setenv("APP_JWT_SECRET","HOST_SECRET_SENTINEL");if e:=WriteRelease(out);e!=nil{t.Fatal(e)};b,_:=os.ReadFile(out);if strings.Contains(string(b),"HOST_SECRET_SENTINEL"){t.Fatal("environment leaked")}
}
`
      await writeFile(
        path.join(f.server, "internal/config/release_migration_test.go"),
        regression,
        {
          flag: "wx"
        }
      )
      // 导出命令不应触发旧业务 config 包的 init，独立运行时用哨兵证明。
      await writeFile(
        path.join(f.server, "internal/config/export_side_effect.go"),
        'package config\nimport "os"\nfunc init(){if os.Getenv("APP_EXPORT_SIDE_EFFECT_GUARD")=="1"{panic("export imported business config")}}\n',
        { flag: "wx" }
      )
      const isolatedExport = path.join(f.parent, "isolated-export.yaml")
      await execute("go", ["run", "./cmd/release-config", "--output", isolatedExport], {
        cwd: f.server,
        env: {
          ...process.env,
          GOOS: "",
          GOARCH: "",
          CGO_ENABLED: "0",
          APP_EXPORT_SIDE_EFFECT_GUARD: "1",
          APP_CUSTOM_MERGE_SENTINEL: "HOST_MERGE_SENTINEL"
        },
        timeout: 30000
      })
      expect(await readFile(isolatedExport, "utf8")).not.toContain("HOST_MERGE_SENTINEL")
      const protectedBefore = await Promise.all(
        [
          "internal/api/router.go",
          "cmd/server/main.go",
          "go.mod",
          "go.sum",
          "configs/config-dev.yaml"
        ].map(async (file) => [file, await readFile(path.join(f.server, file), "utf8")] as const)
      )
      await release(f.target, {
        APP_ENV: "dev",
        APP_DATABASE_DSN: "HOST_DATABASE_SENTINEL",
        APP_JWT_SECRET: "HOST_SECRET_SENTINEL",
        APP_BUSINESS_MODE: "HOST_BUSINESS_SENTINEL",
        APP_CUSTOM_MERGE_SENTINEL: "HOST_MERGE_SENTINEL"
      })
      const unpacked = path.join(f.parent, "unpacked")
      await mkdir(unpacked)
      await unpack(f.target, unpacked)
      const binary = "legacy_server" + (process.platform === "win32" ? ".exe" : "")
      expect((await readdir(unpacked)).sort()).toEqual(["config.yaml", binary].sort())
      const exported = await readFile(path.join(unpacked, "config.yaml"), "utf8")
      for (const sentinel of [
        "HOST_DATABASE_SENTINEL",
        "HOST_SECRET_SENTINEL",
        "HOST_BUSINESS_SENTINEL",
        "HOST_MERGE_SENTINEL",
        "localhost:5173"
      ])
        expect(exported).not.toContain(sentinel)
      expect(exported).toContain(`mode: ${expectedMode}`)
      expect(exported).toMatch(/enabled: false/u)
      expect(exported).toMatch(/retries: 0/u)
      expect(exported).toContain("alpha")
      expect(exported).toContain("beta")
      const database = path.join(unpacked, "data/isolated.db")
      const running = await startGoFixture(unpacked, path.join(unpacked, binary), {
        APP_ENV: "",
        APP_DATABASE_DSN: database
      })
      try {
        const response = await fetch(running.url + "/business-policy")
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          mode: expectedMode,
          env: "prod",
          policy: "kept-business-code"
        })
        expect((await stat(database)).isFile()).toBe(true)
      } finally {
        await running.stop()
      }
      for (const [file, before] of protectedBefore)
        expect(await readFile(path.join(f.server, file), "utf8")).toBe(before)
      expect(await readFile(path.join(f.server, "configs/config-prod.yaml"), "utf8")).toBe(
        existingProduction
          ? production
          : await readFile(
              path.join(plan.output, "files/legacy_server/configs/config-prod.yaml"),
              "utf8"
            )
      )
      expect(await readFile(path.join(f.server, "configs/config.yaml"), "utf8")).toBe(migratedBase)
      expect(await readFile(path.join(f.server, "internal/config/config.go"), "utf8")).toContain(
        'return "kept-business-code"'
      )
    },
    120_000
  )
})
