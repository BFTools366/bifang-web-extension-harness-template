import { execFileSync } from "node:child_process"
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

/** 在隔离副本内生成真实 gqlgen 代码，失败不会留下半装配的账号服务。 */
export async function generateAccountPlan(
  root: string,
  planned: ReadonlyMap<string, string>
): Promise<Map<string, string>> {
  const stage = await mkdtemp(path.join(tmpdir(), "harness-account-"))
  try {
    await cp(root, stage, {
      recursive: true,
      /** 排除运行数据和制品，拒绝把链接带入可执行生成目录。 */
      async filter(source) {
        const relative = path.relative(root, source)
        if (relative.split(path.sep).some((part) => ["data", "logs", "bin", ".git"].includes(part)))
          return false
        if ((await lstat(source)).isSymbolicLink()) throw new Error("账号生成拒绝链接：" + relative)
        return true
      }
    })
    for (const [name, source] of planned) {
      await mkdir(path.dirname(path.join(stage, name)), { recursive: true })
      await writeFile(path.join(stage, name), source)
    }
    const options = {
      cwd: stage,
      stdio: "pipe" as const,
      timeout: 120_000,
      env: { ...process.env, GOTOOLCHAIN: "local" }
    }
    execFileSync("go", ["mod", "tidy"], options)
    execFileSync("go", ["run", "-mod=mod", "github.com/99designs/gqlgen", "generate"], options)
    const result = new Map(planned)
    for (const name of new Set([...planned.keys(), "go.mod", "go.sum"])) {
      const source = await readFile(path.join(stage, name), "utf8")
      if (name.endsWith(".resolvers.go") && /not implemented/u.test(source))
        throw new Error("GraphQL 留有未实现解析器：" + name)
      result.set(name, source)
    }
    return result
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
