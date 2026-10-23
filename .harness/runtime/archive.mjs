import { createReadStream } from "node:fs"
import { lstat, readdir, open } from "node:fs/promises"
import path from "node:path"
import { Transform, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createDeflateRaw } from "node:zlib"
import { Buffer } from "node:buffer"

const MAX_UINT32 = 0xffffffff
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})

/** 只收集真实目录中的普通文件，明确拒绝链接和特殊文件，路径统一为 ZIP 的斜杠。 */
export async function archiveEntries(directory, prefix = "") {
  const entries = []
  async function visit(source, name) {
    const status = await lstat(source)
    if (status.isSymbolicLink()) throw new Error(`归档源不能包含符号链接：${source}`)
    if (status.isDirectory()) {
      if (name) entries.push({ name: `${name}/`, mode: 0o40755 })
      for (const child of (await readdir(source)).sort())
        await visit(path.join(source, child), name ? `${name}/${child}` : child)
    } else if (status.isFile()) entries.push({ name, source, mode: status.mode })
    else throw new Error(`归档源必须是普通文件或目录：${source}`)
  }
  await visit(directory, prefix)
  return entries
}

/** 流式写入标准 DEFLATE ZIP，保留 Unix 执行权限；超出 ZIP32 容量时明确失败。 */
export async function writeZip(destination, entries, signal) {
  signal?.throwIfAborted()
  if (!entries.length || entries.length > 65535) throw new Error("归档条目为空或超出 ZIP32 上限")
  const names = new Set()
  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name.includes("\\") ||
      entry.name.includes("\0") ||
      entry.name.startsWith("/") ||
      entry.name.split("/").some((part) => part === "..") ||
      names.has(entry.name) ||
      Buffer.byteLength(entry.name) > 65535
    )
      throw new Error(`非法或重复归档路径：${entry.name}`)
    names.add(entry.name)
    if (entry.source && !(await lstat(entry.source)).isFile())
      throw new Error(`归档源必须是普通文件：${entry.source}`)
  }
  const file = await open(destination, "wx", 0o600)
  let offset = 0
  const central = []
  async function write(bytes) {
    signal?.throwIfAborted()
    if (offset + bytes.length > MAX_UINT32) throw new Error("归档超过 ZIP32 上限")
    await file.writeFile(bytes)
    offset += bytes.length
  }
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name)
      const start = offset
      const header = Buffer.alloc(30)
      header.writeUInt32LE(0x04034b50)
      header.writeUInt16LE(20, 4)
      header.writeUInt16LE(0x0808, 6)
      header.writeUInt16LE(8, 8)
      header.writeUInt16LE(33, 12) // 固定为 1980-01-01，避免主机时区改变归档。
      header.writeUInt16LE(name.length, 26)
      await write(header)
      await write(name)
      let crc = MAX_UINT32
      let size = 0
      let compressed = 0
      if (entry.source) {
        await pipeline(
          createReadStream(entry.source),
          new Transform({
            transform(chunk, _encoding, callback) {
              size += chunk.length
              if (size > MAX_UINT32) return callback(new Error("文件超过 ZIP32 上限"))
              for (const value of chunk) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255]
              callback(null, chunk)
            }
          }),
          createDeflateRaw(),
          new Writable({
            write(chunk, _encoding, callback) {
              compressed += chunk.length
              write(chunk).then(() => callback(), callback)
            }
          }),
          { signal }
        )
      } else {
        const empty = Buffer.from([3, 0])
        compressed = empty.length
        await write(empty)
      }
      crc = (crc ^ MAX_UINT32) >>> 0
      const descriptor = Buffer.alloc(16)
      descriptor.writeUInt32LE(0x08074b50)
      descriptor.writeUInt32LE(crc, 4)
      descriptor.writeUInt32LE(compressed, 8)
      descriptor.writeUInt32LE(size, 12)
      await write(descriptor)
      const record = Buffer.alloc(46)
      record.writeUInt32LE(0x02014b50)
      record.writeUInt16LE(0x0314, 4)
      record.writeUInt16LE(20, 6)
      record.writeUInt16LE(0x0808, 8)
      record.writeUInt16LE(8, 10)
      record.writeUInt16LE(33, 14)
      record.writeUInt32LE(crc, 16)
      record.writeUInt32LE(compressed, 20)
      record.writeUInt32LE(size, 24)
      record.writeUInt16LE(name.length, 28)
      record.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38)
      record.writeUInt32LE(start, 42)
      central.push(record, name)
    }
    const start = offset
    for (const bytes of central) await write(bytes)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(offset - start, 12)
    end.writeUInt32LE(start, 16)
    await write(end)
    signal?.throwIfAborted()
    await file.sync()
  } finally {
    await file.close()
  }
}
