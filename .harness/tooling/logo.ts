import { deflateSync } from "node:zlib"
import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import type { ProjectType } from "./types.ts"

interface LogoInput {
  root: string
  name: string
  id: string
  color: string
  logoPath?: string
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function generatedSvg(name: string, id: string, color: string): Buffer {
  const rotation = stableHash(`${id}:${name}`) % 90
  const inset = 220 + (stableHash(id) % 70)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="${color}"/>
  <circle cx="820" cy="204" r="188" fill="#fff" opacity=".12"/>
  <path d="M174 768 512 174l338 594Z" fill="#000" opacity=".08"/>
  <g transform="rotate(${rotation} 512 512)" fill="none" stroke="#fff" stroke-width="88" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${inset} 512 512 ${inset} ${1024 - inset} 512 512 ${1024 - inset}Z"/>
    <circle cx="512" cy="512" r="104" fill="#fff" stroke="none"/>
  </g>
</svg>`)
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

function fallbackPng(color: string): Buffer {
  const width = 1024
  const height = 1024
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  const center = width / 2

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4
      const diamond = Math.abs(x - center) + Math.abs(y - center)
      const white = diamond < 210 && diamond > 80
      pixels[offset] = white ? 255 : red
      pixels[offset + 1] = white ? 255 : green
      pixels[offset + 2] = white ? 255 : blue
      pixels[offset + 3] = 255
    }
  }

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

export async function createLogo(input: LogoInput): Promise<Buffer> {
  if (input.logoPath !== undefined) {
    const sourcePath = path.isAbsolute(input.logoPath)
      ? input.logoPath
      : path.resolve(input.root, input.logoPath)
    try {
      return await sharp(sourcePath)
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

export async function readLogo(filePath: string): Promise<Buffer> {
  return readFile(filePath)
}

export async function deriveLogoAssets(
  projectType: ProjectType,
  master: Buffer
): Promise<Map<string, Buffer>> {
  if (projectType === "extension") return new Map([["assets/icon.png", master]])
  const [logo, favicon] = await Promise.all([
    sharp(master).resize(512, 512).png({ compressionLevel: 9 }).toBuffer(),
    sharp(master).resize(64, 64).png({ compressionLevel: 9 }).toBuffer()
  ])
  return new Map([
    ["public/logo.png", logo],
    ["public/favicon.png", favicon]
  ])
}
