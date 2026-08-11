import { constants, type Stats } from "node:fs"
import { access, lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function lstatIfPresent(filePath: string): Promise<Stats | undefined> {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

export interface WalkFilesOptions {
  exclude?: (name: string) => boolean
  filter?: (name: string) => boolean
}

export async function walkFiles(root: string, options: WalkFilesOptions = {}): Promise<string[]> {
  const results: string[] = []
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        if (options.exclude?.(entry.name) === true) return
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(absolute)
        } else if (entry.isFile() && (options.filter === undefined || options.filter(entry.name))) {
          results.push(absolute)
        }
      })
    )
  }
  await walk(root)
  return results
}

export async function readJson<T>(filePath: string): Promise<T> {
  const contents = await readFile(filePath, "utf8")
  return JSON.parse(contents) as T
}

export async function writeNew(filePath: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, { flag: "wx" })
}

export async function writeJsonNew(filePath: string, value: unknown): Promise<void> {
  await writeNew(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writeAtomic(filePath: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.harness-${process.pid}-${Date.now()}.tmp`
  await writeFile(temporary, contents)
  await rename(temporary, filePath)
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function assertAbsent(root: string, relativePaths: readonly string[]): Promise<void> {
  const stats = await Promise.all(
    relativePaths.map((relativePath) => lstatIfPresent(path.join(root, relativePath)))
  )
  const collisions = relativePaths.filter((_, index) => stats[index] !== undefined)
  if (collisions.length > 0) {
    throw new Error(`Refusing to overwrite existing project path(s): ${collisions.join(", ")}`)
  }
}
