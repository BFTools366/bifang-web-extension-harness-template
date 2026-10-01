import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach } from "vitest"
import { validateOptionalProjectMemory } from "../.harness/tooling/project-memory.ts"

// 保存 temporaryRoots 变量供当前逻辑使用。
export const temporaryRoots: string[] = []
// 保存 repositoryRoot 变量供当前逻辑使用。
export const repositoryRoot = path.resolve(import.meta.dirname, "..")

// 执行 copyRepository 函数的处理逻辑。
export async function copyRepository(): Promise<string> {
  // 保存 targetRoot 变量供当前逻辑使用。
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "web-harness-validator-"))
  temporaryRoots.push(targetRoot)
  await cp(repositoryRoot, targetRoot, {
    recursive: true,
    // 执行 filter 函数的处理逻辑。
    filter(source) {
      // 保存 relative 变量供当前逻辑使用。
      const relative = path.relative(repositoryRoot, source)
      // 保存 topLevel 变量供当前逻辑使用。
      const topLevel = relative.split(path.sep)[0]
      return topLevel !== ".git" && topLevel !== "node_modules"
    }
  })
  return targetRoot
}

// 执行 updateManifest 函数的处理逻辑。
export async function updateManifest(
  root: string,
  update: (manifest: Record<string, unknown>) => void
): Promise<void> {
  // 保存 manifestPath 变量供当前逻辑使用。
  const manifestPath = path.join(root, "package.json")
  // 保存 manifest 变量供当前逻辑使用。
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>
  update(manifest)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 创建一个可按需写入项目记忆和兼容清单的隔离根目录。 */
export async function createProjectMemoryRoot(): Promise<string> {
  // 保存 root 变量供当前测试夹具使用。
  const root = await mkdtemp(path.join(os.tmpdir(), "project-memory-compatibility-"))
  temporaryRoots.push(root)
  await mkdir(path.join(root, ".harness"), { recursive: true })
  return root
}

/** 写入一个项目记忆分类目录、索引和正文文件。 */
export async function writeMemoryFile(
  root: string,
  directory: string,
  filename: string,
  options: { indexed?: boolean } = {}
): Promise<void> {
  // 保存 memoryRoot 变量供测试夹具文件写入使用。
  const memoryRoot = path.join(root, "docs", directory)
  await mkdir(memoryRoot, { recursive: true })
  await writeFile(
    path.join(memoryRoot, "README.md"),
    options.indexed === false ? "# Index\n" : `# Index\n\n- [Entry](./${filename})\n`
  )
  await writeFile(path.join(memoryRoot, filename), "# Memory\n")
}

/** 写入项目记忆兼容清单。 */
export async function writeProjectMemoryCompatibilityManifest(
  root: string,
  value: unknown
): Promise<void> {
  await writeFile(
    path.join(root, ".harness/project-memory-compatibility.json"),
    `${JSON.stringify(value, null, 2)}\n`
  )
}

/** 返回项目记忆验证产生的全部错误。 */
export async function projectMemoryErrors(root: string): Promise<string[]> {
  // 保存 errors 变量供验证器累积错误使用。
  const errors: string[] = []
  await validateOptionalProjectMemory(root, errors)
  return errors
}

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)
