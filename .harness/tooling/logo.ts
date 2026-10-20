import { deflateSync } from "node:zlib"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import type { ProjectType } from "./types.ts"

// 定义 LogoInput 接口的结构契约。
interface LogoInput {
  // 描述 root 接口成员的结构契约。
  root: string
  // 描述 name 接口成员的结构契约。
  name: string
  // 描述 id 接口成员的结构契约。
  id: string
  // 描述 color 接口成员的结构契约。
  color: string
  // 描述 logoPath 接口成员的结构契约。
  logoPath?: string
  /** 使用调用方已冻结的图像字节，避免批准检查与解码之间再次读取可变文件。 */
  logoBytes?: Buffer
}

// 执行 stableHash 函数的处理逻辑。
function stableHash(value: string): number {
  // 保存 hash 变量供当前逻辑使用。
  let hash = 2166136261
  // 保存 character 变量供当前逻辑使用。
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// 执行 generatedSvg 函数的处理逻辑。
function generatedSvg(name: string, id: string, color: string, variant = 1): Buffer {
  // 保存 rotation 变量供当前逻辑使用。
  const rotation = stableHash(`${id}:${name}`) % 90
  // 保存 inset 变量供当前逻辑使用。
  const inset = 220 + (stableHash(id) % 70)
  const symbol =
    variant === 2
      ? `<rect x="280" y="280" width="360" height="360" rx="80"/><rect x="384" y="384" width="360" height="360" rx="80"/>`
      : variant === 3
        ? `<path d="M512 248 776 704H248Z"/><circle cx="512" cy="530" r="76" fill="#fff" stroke="none"/>`
        : `<path d="M${inset} 512 512 ${inset} ${1024 - inset} 512 512 ${1024 - inset}Z"/><circle cx="512" cy="512" r="104" fill="#fff" stroke="none"/>`
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="${color}"/>
  <circle cx="820" cy="204" r="188" fill="#fff" opacity=".12"/>
  <path d="M174 768 512 174l338 594Z" fill="#000" opacity=".08"/>
  <g transform="rotate(${rotation} 512 512)" fill="none" stroke="#fff" stroke-width="88" stroke-linecap="round" stroke-linejoin="round">
    ${symbol}
  </g>
</svg>`)
}

/** 按稳定编号生成三个独立离线候选；生成失败不降级为重复或未展示的母版。 */
export async function createLogoCandidates(
  input: Pick<LogoInput, "name" | "id" | "color">
): Promise<Buffer[]> {
  return Promise.all(
    [1, 2, 3].map((variant) =>
      sharp(generatedSvg(input.name, input.id, input.color, variant))
        .png({ compressionLevel: 9 })
        .toBuffer()
    )
  )
}

// 执行 crc32 函数的处理逻辑。
function crc32(data: Uint8Array): number {
  // 保存 crc 变量供当前逻辑使用。
  let crc = 0xffffffff
  // 保存 byte 变量供当前逻辑使用。
  for (const byte of data) {
    crc ^= byte
    // 保存 bit 变量供当前逻辑使用。
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

// 执行 pngChunk 函数的处理逻辑。
function pngChunk(type: string, data: Buffer): Buffer {
  // 保存 typeBuffer 变量供当前逻辑使用。
  const typeBuffer = Buffer.from(type, "ascii")
  // 保存 length 变量供当前逻辑使用。
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  // 保存 checksum 变量供当前逻辑使用。
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

// 执行 fallbackPng 函数的处理逻辑。
function fallbackPng(color: string): Buffer {
  // 保存 width 变量供当前逻辑使用。
  const width = 1024
  // 保存 height 变量供当前逻辑使用。
  const height = 1024
  // 保存 red 变量供当前逻辑使用。
  const red = Number.parseInt(color.slice(1, 3), 16)
  // 保存 green 变量供当前逻辑使用。
  const green = Number.parseInt(color.slice(3, 5), 16)
  // 保存 blue 变量供当前逻辑使用。
  const blue = Number.parseInt(color.slice(5, 7), 16)
  // 保存 pixels 变量供当前逻辑使用。
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  // 保存 center 变量供当前逻辑使用。
  const center = width / 2

  // 保存 y 变量供当前逻辑使用。
  for (let y = 0; y < height; y += 1) {
    // 保存 row 变量供当前逻辑使用。
    const row = y * (width * 4 + 1)
    // 保存 x 变量供当前逻辑使用。
    for (let x = 0; x < width; x += 1) {
      // 保存 offset 变量供当前逻辑使用。
      const offset = row + 1 + x * 4
      // 保存 diamond 变量供当前逻辑使用。
      const diamond = Math.abs(x - center) + Math.abs(y - center)
      // 保存 white 变量供当前逻辑使用。
      const white = diamond < 210 && diamond > 80
      pixels[offset] = white ? 255 : red
      pixels[offset + 1] = white ? 255 : green
      pixels[offset + 2] = white ? 255 : blue
      pixels[offset + 3] = 255
    }
  }

  // 保存 header 变量供当前逻辑使用。
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ])
}

// 执行 createLogo 函数的处理逻辑。
export async function createLogo(input: LogoInput): Promise<Buffer> {
  if (input.logoPath !== undefined) {
    // 保存 sourcePath 变量供当前逻辑使用。
    const sourcePath = path.isAbsolute(input.logoPath)
      ? input.logoPath
      : path.resolve(input.root, input.logoPath)
    try {
      return await sharp(input.logoBytes ?? sourcePath)
        .resize(1024, 1024, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9 })
        .toBuffer()
    } catch (error) {
      throw new Error(`Unable to prepare uploaded logo at ${sourcePath}`, { cause: error })
    }
  }

  try {
    return await sharp(generatedSvg(input.name, input.id, input.color))
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    return fallbackPng(input.color)
  }
}

// 执行 readLogo 函数的处理逻辑。
export async function readLogo(filePath: string): Promise<Buffer> {
  return readFile(filePath)
}

// 执行 deriveLogoAssets 函数的处理逻辑。
export async function deriveLogoAssets(
  projectType: ProjectType,
  master: Buffer
): Promise<Map<string, Buffer>> {
  if (projectType === "extension") return new Map([["assets/icon.png", master]])
  // 保存 [logo, favicon] 变量供当前逻辑使用。
  const [logo, favicon] = await Promise.all([
    sharp(master).resize(512, 512).png({ compressionLevel: 9 }).toBuffer(),
    sharp(master).resize(64, 64).png({ compressionLevel: 9 }).toBuffer()
  ])
  return new Map([
    ["public/logo.png", logo],
    ["public/favicon.png", favicon]
  ])
}
