import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  assertKnownOptions,
  parseArgs,
  readStringOption
} from "../../../../.harness/tooling/args.ts"
import { normalizeColor } from "../../../../.harness/tooling/config.ts"
import { isMainModule } from "../../../../.harness/tooling/files.ts"
import { createLogoCandidates } from "../../../../.harness/tooling/logo.ts"

/** 保存三选一预览的临时路径；它们不是正式项目资产。 */
export interface LogoCandidatePreview {
  directory: string
  source: "offline-geometric"
  candidates: { choice: number; label: string; path: string }[]
}

/** 只在系统临时目录写三个候选，校验失败或生成失败均不保留半套预览。 */
export async function generateCandidatePreviews(argv: string[]): Promise<LogoCandidatePreview> {
  const args = parseArgs(argv)
  assertKnownOptions(args, ["name", "id", "brand-color"])
  if (args.positionals.length > 0) throw new Error("候选生成不接受目标路径或位置参数")
  const name = readStringOption(args, "name")
  const id = readStringOption(args, "id")
  if (name === undefined || id === undefined) throw new Error("必须提供 --name 与 --id")
  const color = normalizeColor(readStringOption(args, "brand-color") ?? "#4C6EF5")
  const images = await createLogoCandidates({ name, id, color })
  const directory = await mkdtemp(path.join(os.tmpdir(), "harness-logo-candidates-"))
  try {
    const labels = ["棱形环", "交叠方环", "三角徽记"]
    const candidates = []
    for (const [index, image] of images.entries()) {
      const label = labels[index]
      if (label === undefined) throw new Error("离线生成器必须恰好返回三个候选")
      const filePath = path.join(directory, `logo-${index + 1}.png`)
      await writeFile(filePath, image, { flag: "wx" })
      candidates.push({ choice: index + 1, label, path: filePath })
    }
    return { directory, source: "offline-geometric", candidates }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

if (isMainModule(import.meta.url)) {
  generateCandidatePreviews(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
