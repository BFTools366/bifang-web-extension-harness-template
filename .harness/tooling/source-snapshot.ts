import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

/** 描述冻结模板中的单个普通文件。 */
export interface TemplateSnapshotFile {
  /** 保存 POSIX 风格仓库相对路径。 */
  path: string
  /** 保存冻结时读取的完整字节。 */
  contents: Buffer
  /** 保存普通权限位。 */
  mode: number
  /** 保存内容 SHA-256。 */
  sha256: string
}

/** 描述可选 Git 身份与工作区状态绑定。 */
export interface TemplateGitSnapshot {
  /** 保存精确 HEAD OID。 */
  head: string
  /** 保存逐字节稳定的 porcelain 状态。 */
  status: string
}

/** 描述初始化全程复用的源模板冻结事实。 */
export interface TemplateSnapshot {
  /** 保存规范化真实源根。 */
  root: string
  /** 保存按路径排序的精确文件集合。 */
  files: TemplateSnapshotFile[]
  /** 保存 Git 仓库存在时的身份。 */
  git?: TemplateGitSnapshot
  /** 保存 Version.md 存在时的内容摘要。 */
  versionSha256?: string
}

/** 描述源模板路径筛选器。 */
export type TemplatePathFilter = (relativePath: string, name: string) => boolean

/** 保存无 Shell 执行的异步 Git 入口。 */
const execFileAsync = promisify(execFile)

/** 计算字节内容的稳定 SHA-256。 */
function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex")
}

/** 单独绑定不会复制到下游的 Harness Version.md。 */
async function versionSha256(root: string): Promise<string | undefined> {
  const versionPath = path.join(root, "Version.md")
  try {
    const status = await lstat(versionPath)
    if (status.isSymbolicLink() || !status.isFile()) {
      throw new Error("Harness Version.md must be a regular file when present")
    }
    return sha256(await readFile(versionPath))
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  }
}

/** 在 Git 仓库中读取顶层、HEAD 与完整工作区状态。 */
async function readGitSnapshot(root: string): Promise<TemplateGitSnapshot | undefined> {
  try {
    const topLevel = (
      await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" })
    ).stdout.trim()
    if ((await realpath(topLevel)) !== root) {
      return undefined
    }
    const [head, status] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
      execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
        cwd: root,
        encoding: "utf8"
      })
    ])
    return { head: head.stdout.trim(), status: status.stdout }
  } catch (error) {
    const code = (error as { code?: unknown }).code
    const stderr = String((error as { stderr?: unknown }).stderr ?? "")
    if (code === "ENOENT" || code === 128 || stderr.includes("not a git repository"))
      return undefined
    throw error
  }
}

/** 冻结源模板的允许文件、内容、权限、版本和 Git 身份。 */
export async function captureTemplateSnapshot(
  sourceRootInput: string,
  include: TemplatePathFilter
): Promise<TemplateSnapshot> {
  const requestedRoot = path.resolve(sourceRootInput)
  const requestedStatus = await lstat(requestedRoot)
  if (requestedStatus.isSymbolicLink() || !requestedStatus.isDirectory()) {
    throw new Error(`Instantiation source must be a real directory: ${requestedRoot}`)
  }
  const root = await realpath(requestedRoot)
  const rootStatus = await lstat(root)
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new Error(`Instantiation source must be a real directory: ${root}`)
  }
  const files: TemplateSnapshotFile[] = []

  /** 递归读取允许路径且失败关闭特殊文件与符号链接。 */
  async function visit(directory: string, relativeDirectory = ""): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relativePath =
        relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`
      if (!include(relativePath, entry.name)) continue
      const absolutePath = path.join(directory, entry.name)
      const status = await lstat(absolutePath)
      if (status.isSymbolicLink()) {
        throw new Error(`Template contains unsupported symbolic link: ${relativePath}`)
      }
      if (status.isDirectory()) {
        await visit(absolutePath, relativePath)
        continue
      }
      if (!status.isFile()) {
        throw new Error(`Template contains unsupported special file: ${relativePath}`)
      }
      const contents = await readFile(absolutePath)
      const afterRead = await lstat(absolutePath)
      if (
        afterRead.dev !== status.dev ||
        afterRead.ino !== status.ino ||
        afterRead.size !== status.size ||
        afterRead.mtimeMs !== status.mtimeMs
      ) {
        throw new Error(`Template file changed while being frozen: ${relativePath}`)
      }
      files.push({
        path: relativePath,
        contents,
        mode: status.mode & 0o777,
        sha256: sha256(contents)
      })
    }
  }

  await visit(root)
  files.sort((left, right) => left.path.localeCompare(right.path))
  return {
    root,
    files,
    git: await readGitSnapshot(root),
    versionSha256: await versionSha256(root)
  }
}

/** 把冻结字节复制到空 staging，不在复制期间重新遍历源树。 */
export async function copyTemplateSnapshot(
  snapshot: TemplateSnapshot,
  targetRoot: string
): Promise<void> {
  await mkdir(targetRoot, { recursive: true })
  for (const file of snapshot.files) {
    const targetPath = path.join(targetRoot, ...file.path.split("/"))
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, file.contents, { flag: "wx", mode: file.mode })
    await chmod(targetPath, file.mode)
  }
}

/** 证明源文件集合、内容、权限、版本与 Git 身份在发布前均未漂移。 */
export async function assertTemplateSnapshotUnchanged(
  expected: TemplateSnapshot,
  include: TemplatePathFilter
): Promise<void> {
  const current = await captureTemplateSnapshot(expected.root, include)
  const project = (snapshot: TemplateSnapshot) => ({
    files: snapshot.files.map((file) => ({
      path: file.path,
      mode: file.mode,
      sha256: file.sha256
    })),
    git: snapshot.git,
    versionSha256: snapshot.versionSha256
  })
  if (JSON.stringify(project(current)) !== JSON.stringify(project(expected))) {
    throw new Error("Instantiation source changed after its initialization snapshot was frozen")
  }
}
