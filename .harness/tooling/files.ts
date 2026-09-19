import { constants, type Stats } from "node:fs"
import { access, lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

// 执行 pathExists 函数的处理逻辑。
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

// 执行 lstatIfPresent 函数的处理逻辑。
export async function lstatIfPresent(filePath: string): Promise<Stats | undefined> {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

// 定义 WalkFilesOptions 接口的结构契约。
export interface WalkFilesOptions {
  // 描述 exclude 接口成员的结构契约。
  exclude?: (name: string) => boolean
  // 描述 filter 接口成员的结构契约。
  filter?: (name: string) => boolean
}

// 执行 walkFiles 函数的处理逻辑。
export async function walkFiles(root: string, options: WalkFilesOptions = {}): Promise<string[]> {
  // 保存 results 变量供当前逻辑使用。
  const results: string[] = []
  // 执行 walk 函数的处理逻辑。
  async function walk(directory: string): Promise<void> {
    // 保存 entries 变量供当前逻辑使用。
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(
        /* 执行 当前声明 函数的处理逻辑。 */ async (entry) => {
          if (options.exclude?.(entry.name) === true) return
          // 保存 absolute 变量供当前逻辑使用。
          const absolute = path.join(directory, entry.name)
          if (entry.isDirectory()) {
            await walk(absolute)
          } else if (
            entry.isFile() &&
            (options.filter === undefined || options.filter(entry.name))
          ) {
            results.push(absolute)
          }
        }
      )
    )
  }
  await walk(root)
  return results.sort((left, right) => left.localeCompare(right, "en"))
}

// 执行 readJson 函数的处理逻辑。
export async function readJson<T>(filePath: string): Promise<T> {
  // 保存 contents 变量供当前逻辑使用。
  const contents = await readFile(filePath, "utf8")
  return JSON.parse(contents) as T
}

// 执行 writeNew 函数的处理逻辑。
export async function writeNew(filePath: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, { flag: "wx" })
}

// 执行 writeJsonNew 函数的处理逻辑。
export async function writeJsonNew(filePath: string, value: unknown): Promise<void> {
  await writeNew(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

// 执行 writeAtomic 函数的处理逻辑。
export async function writeAtomic(filePath: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  // 保存 temporary 变量供当前逻辑使用。
  const temporary = `${filePath}.harness-${process.pid}-${Date.now()}.tmp`
  await writeFile(temporary, contents)
  await rename(temporary, filePath)
}

// 执行 writeJsonAtomic 函数的处理逻辑。
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

// 执行 assertAbsent 函数的处理逻辑。
export async function assertAbsent(root: string, relativePaths: readonly string[]): Promise<void> {
  // 保存 stats 变量供当前逻辑使用。
  const stats = await Promise.all(
    relativePaths.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) =>
        lstatIfPresent(path.join(root, relativePath))
    )
  )
  // 保存 collisions 变量供当前逻辑使用。
  const collisions = relativePaths.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (_, index) => stats[index] !== undefined
  )
  if (collisions.length > 0) {
    throw new Error(`Refusing to overwrite existing project path(s): ${collisions.join(", ")}`)
  }
}
