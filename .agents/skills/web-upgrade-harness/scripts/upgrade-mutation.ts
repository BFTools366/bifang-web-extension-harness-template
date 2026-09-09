import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { lstat, realpath } from "node:fs/promises"
import path from "node:path"
import type { UpgradeFileSnapshot } from "./upgrade-types.ts"

/** 描述原子读取或写入前绑定的根目录与仓库相对路径。 */
export interface StablePathIdentity {
  /** 保存不得经符号链接重定向的规范化根目录。 */
  root: string
  /** 保存使用 POSIX 分隔符的规范相对路径。 */
  relativePath: string
  /** 保存根目录设备编号的无损字符串。 */
  rootDev: string
  /** 保存根目录 inode 编号的无损字符串。 */
  rootIno: string
}

/** 描述稳定路径读取的结果。 */
export interface StableFileRead {
  /** 表示路径是否存在。 */
  exists: boolean
  /** 保存存在文件的原始字节。 */
  bytes?: Buffer
  /** 保存存在文件的内容与权限快照。 */
  snapshot?: UpgradeFileSnapshot
}

/** 描述传入独立 Node 进程的受约束文件指令。 */
interface BoundFileInstruction {
  /** 保存读取或写入动作。 */
  operation: "read" | "write"
  /** 保存规范化根目录路径。 */
  root: string
  /** 保存目标文件的相对路径。 */
  relativePath: string
  /** 保存预期根目录设备编号。 */
  rootDev: string
  /** 保存预期根目录 inode。 */
  rootIno: string
  /** 保存写入临时文件名。 */
  temporary: string
  /** 保存预期文件快照；写入时 null 表示必须缺席。 */
  expected: UpgradeFileSnapshot | null
  /** 表示读取时是否强制匹配 expected。 */
  enforceExpected: boolean
  /** 表示读取时是否允许路径缺席。 */
  allowMissing: boolean
  /** 保存写入后的普通权限。 */
  mode: number
  /** 保存写入载荷 SHA-256。 */
  sha256: string
}

/** 在稳定 cwd 中逐级绑定真实目录并执行读取或原子替换的子进程程序。 */
const BOUND_FILE_PROGRAM = String.raw`
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const instruction = JSON.parse(process.argv[1])
const payload = fs.readFileSync(0)
const noFollow = fs.constants.O_NOFOLLOW ?? 0
const readFlags = fs.constants.O_RDONLY | noFollow
const fail = (message) => { throw new Error(message) }
const sameIdentity = (status, dev, ino) => String(status.dev) === dev && String(status.ino) === ino
const sameSnapshot = (left, right) => left === null
  ? right === null
  : right !== null && left.sha256 === right.sha256 && left.mode === right.mode
const visited = []
const verifyVisited = () => {
  for (const item of visited) {
    const observed = fs.lstatSync(item.absolute, { bigint: true })
    if (observed.isSymbolicLink() || !observed.isDirectory() || !sameIdentity(observed, item.dev, item.ino)) {
      fail("bound path ancestor changed during traversal")
    }
    if (fs.realpathSync(item.absolute) !== item.absolute) {
      fail("bound path ancestor is no longer canonical")
    }
  }
}
const snapshot = (leaf, allowMissing) => {
  let lexical
  try {
    lexical = fs.lstatSync(leaf, { bigint: true })
  } catch (error) {
    if (allowMissing && error && error.code === "ENOENT") return null
    throw error
  }
  if (lexical.isSymbolicLink() || !lexical.isFile()) fail("bound target is not a regular file")
  let descriptor
  try {
    descriptor = fs.openSync(leaf, readFlags)
  } catch (error) {
    if (allowMissing && error && error.code === "ENOENT") return null
    throw error
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true })
    if (!before.isFile() || !sameIdentity(before, String(lexical.dev), String(lexical.ino))) {
      fail("bound target changed while it was opened")
    }
    const bytes = fs.readFileSync(descriptor)
    const after = fs.fstatSync(descriptor, { bigint: true })
    if (!sameIdentity(after, String(before.dev), String(before.ino)) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.mode !== after.mode) {
      fail("bound target changed while it was read")
    }
    const lexicalAfter = fs.lstatSync(leaf, { bigint: true })
    if (lexicalAfter.isSymbolicLink() || !lexicalAfter.isFile() || !sameIdentity(lexicalAfter, String(after.dev), String(after.ino))) {
      fail("bound target path changed while it was read")
    }
    return {
      bytes,
      value: {
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        mode: Number(after.mode & 0o777n)
      }
    }
  } finally {
    fs.closeSync(descriptor)
  }
}
const emitRead = (observed) => {
  process.stdout.write(JSON.stringify(observed === null
    ? { exists: false }
    : {
        exists: true,
        bytes: observed.bytes.toString("base64"),
        snapshot: observed.value
      }))
}
const rootStatus = fs.statSync(".", { bigint: true })
if (!rootStatus.isDirectory() || !sameIdentity(rootStatus, instruction.rootDev, instruction.rootIno)) {
  fail("bound root directory changed before traversal")
}
const lexicalRoot = fs.realpathSync(instruction.root)
if (lexicalRoot !== instruction.root) fail("bound root path is no longer canonical")
const rootLstat = fs.lstatSync(instruction.root, { bigint: true })
if (rootLstat.isSymbolicLink() || !rootLstat.isDirectory() || !sameIdentity(rootLstat, instruction.rootDev, instruction.rootIno)) {
  fail("bound root path changed before traversal")
}
visited.push({ absolute: instruction.root, dev: instruction.rootDev, ino: instruction.rootIno })
const segments = instruction.relativePath.split("/")
let lexical = instruction.root
for (const segment of segments.slice(0, -1)) {
  let before
  try {
    before = fs.lstatSync(segment, { bigint: true })
  } catch (error) {
    if (instruction.operation === "read" && instruction.allowMissing && error && error.code === "ENOENT") {
      verifyVisited()
      emitRead(null)
      process.exit(0)
    }
    throw error
  }
  if (before.isSymbolicLink() || !before.isDirectory()) fail("bound path parent is not a real directory")
  process.chdir(segment)
  const current = fs.statSync(".", { bigint: true })
  if (!current.isDirectory() || !sameIdentity(current, String(before.dev), String(before.ino))) {
    fail("bound path parent changed during traversal")
  }
  lexical = path.join(lexical, segment)
  visited.push({ absolute: lexical, dev: String(before.dev), ino: String(before.ino) })
  verifyVisited()
}
const leaf = segments.at(-1)
if (!leaf || leaf.includes("/") || leaf.includes("\\")) fail("bound file leaf is invalid")
if (instruction.operation === "read") {
  const observed = snapshot(leaf, instruction.allowMissing)
  verifyVisited()
  if (instruction.enforceExpected && !sameSnapshot(observed === null ? null : observed.value, instruction.expected)) {
    fail("bound file changed after plan verification")
  }
  emitRead(observed)
  process.exit(0)
}
let temporaryCreated = false
try {
  const observed = snapshot(leaf, instruction.expected === null)
  if (!sameSnapshot(observed === null ? null : observed.value, instruction.expected)) {
    fail("bound target changed before mutation")
  }
  const digest = crypto.createHash("sha256").update(payload).digest("hex")
  if (digest !== instruction.sha256) fail("replacement payload digest is invalid")
  const writeFlags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow
  const descriptor = fs.openSync(instruction.temporary, writeFlags, instruction.mode)
  temporaryCreated = true
  try {
    let offset = 0
    while (offset < payload.length) offset += fs.writeSync(descriptor, payload, offset)
    fs.fchmodSync(descriptor, instruction.mode)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  verifyVisited()
  const beforeReplace = snapshot(leaf, instruction.expected === null)
  if (!sameSnapshot(beforeReplace === null ? null : beforeReplace.value, instruction.expected)) {
    fail("bound target changed before replacement")
  }
  fs.renameSync(instruction.temporary, leaf)
  temporaryCreated = false
  const replacement = snapshot(leaf, false)
  if (replacement === null || !sameSnapshot(replacement.value, { sha256: instruction.sha256, mode: instruction.mode })) {
    fail("replacement verification failed")
  }
  if (process.platform !== "win32") {
    const directoryDescriptor = fs.openSync(".", fs.constants.O_RDONLY)
    try { fs.fsyncSync(directoryDescriptor) } finally { fs.closeSync(directoryDescriptor) }
  }
} finally {
  if (temporaryCreated) {
    try { fs.unlinkSync(instruction.temporary) } catch {}
  }
}
`

/** 校验一个规范、安全且非根的 POSIX 相对文件路径。 */
function normalizeRelativePath(relativePath: string): string {
  const segments = relativePath.split("/")
  if (
    relativePath === "" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Bound file path must be one normalized repo-relative path: ${relativePath}`)
  }
  return relativePath
}

/** 绑定规范化根目录及其下的相对文件路径。 */
export async function captureStablePath(
  rootPath: string,
  relativePath: string
): Promise<StablePathIdentity> {
  const requested = path.resolve(rootPath)
  const status = await lstat(requested, { bigint: true })
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error("Bound file root must be a real directory")
  }
  const canonical = await realpath(requested)
  return {
    root: canonical,
    relativePath: normalizeRelativePath(relativePath),
    rootDev: String(status.dev),
    rootIno: String(status.ino)
  }
}

/** 解析子进程失败并保留稳定的首个 Error 原因。 */
function mutationFailure(stderr: string): Error {
  const stderrLines = stderr.trim().split("\n")
  const detail =
    stderrLines.find((line) => line.startsWith("Error: ")) ??
    stderrLines.at(-1) ??
    "unknown failure"
  return new Error(`Bound file operation rejected: ${detail}`)
}

/** 在已绑定根目录中执行逐级无链接遍历和同目录原子替换。 */
export function runBoundAtomicMutation(
  identity: StablePathIdentity,
  contents: Buffer,
  expected: UpgradeFileSnapshot | null,
  mode: number,
  sha256: string
): void {
  const instruction: BoundFileInstruction = {
    operation: "write",
    ...identity,
    temporary: `.harness-upgrade-${randomUUID()}.tmp`,
    expected,
    enforceExpected: true,
    allowMissing: expected === null,
    mode,
    sha256
  }
  const result = spawnSync(
    process.execPath,
    ["-e", BOUND_FILE_PROGRAM, JSON.stringify(instruction)],
    {
      cwd: identity.root,
      input: contents,
      encoding: "utf8",
      maxBuffer: Math.max(64 * 1024 * 1024, contents.length + 1024 * 1024)
    }
  )
  if (result.error !== undefined) {
    throw new Error(`Bound file process failed: ${result.error.message}`, {
      cause: result.error
    })
  }
  if (result.status !== 0) throw mutationFailure(result.stderr)
}

/** 在已绑定根目录中读取普通文件并返回同一次描述符快照。 */
export function runBoundFileRead(
  identity: StablePathIdentity,
  expected?: UpgradeFileSnapshot,
  allowMissing = false
): StableFileRead {
  const instruction: BoundFileInstruction = {
    operation: "read",
    ...identity,
    temporary: "unused",
    expected: expected ?? null,
    enforceExpected: expected !== undefined,
    allowMissing,
    mode: 0,
    sha256: ""
  }
  const result = spawnSync(
    process.execPath,
    ["-e", BOUND_FILE_PROGRAM, JSON.stringify(instruction)],
    {
      cwd: identity.root,
      input: Buffer.alloc(0),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  )
  if (result.error !== undefined) {
    throw new Error(`Bound file process failed: ${result.error.message}`, {
      cause: result.error
    })
  }
  if (result.status !== 0) throw mutationFailure(result.stderr)
  const parsed = JSON.parse(result.stdout) as {
    exists: boolean
    bytes?: string
    snapshot?: UpgradeFileSnapshot
  }
  if (!parsed.exists) return { exists: false }
  if (
    typeof parsed.bytes !== "string" ||
    parsed.snapshot === undefined ||
    !/^[0-9a-f]{64}$/u.test(parsed.snapshot.sha256) ||
    !Number.isSafeInteger(parsed.snapshot.mode)
  ) {
    throw new Error("Bound file read returned an invalid result")
  }
  return {
    exists: true,
    bytes: Buffer.from(parsed.bytes, "base64"),
    snapshot: parsed.snapshot
  }
}

/** 捕获根目录后安全读取一个既有或可选普通文件。 */
export async function readBoundFileStable(
  rootPath: string,
  relativePath: string,
  expected?: UpgradeFileSnapshot,
  allowMissing = false
): Promise<StableFileRead> {
  return runBoundFileRead(await captureStablePath(rootPath, relativePath), expected, allowMissing)
}

/** 捕获根目录后安全完成一个目标树内的原子文件写入。 */
export async function writeBoundFileAtomic(
  rootPath: string,
  relativePath: string,
  contents: Buffer,
  expected: UpgradeFileSnapshot | null,
  mode: number,
  sha256: string
): Promise<void> {
  const identity = await captureStablePath(rootPath, relativePath)
  runBoundAtomicMutation(identity, contents, expected, mode, sha256)
}
