import { createHash } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

/** 验证固定来源资产字节，适配代码必须放在装配器而不是改写上游快照。 */
export async function validateGoAssets(root: string, errors: string[]): Promise<void> {
  try {
    const base = path.join(root, ".agents/skills/go-implement-service/assets")
    const manifest = JSON.parse(await readFile(path.join(base, "UPSTREAM.json"), "utf8")) as {
      repository: string
      commit: string
      files: Record<string, string>
    }
    if (
      manifest.repository !== "https://github.com/BFTools366/bifang-golang-harness-template" ||
      !/^[a-f0-9]{40}$/u.test(manifest.commit) ||
      !manifest.files ||
      Object.keys(manifest.files).length < 50
    )
      throw new Error("Go 来源元数据不完整")
    for (const [file, expected] of Object.entries(manifest.files)) {
      if (
        path.isAbsolute(file) ||
        file.split(/[\\/]/u).includes("..") ||
        !/^[a-f0-9]{64}$/u.test(expected)
      )
        throw new Error("Go 资产路径或摘要无效")
      let current = base
      for (const segment of file.split("/")) {
        current = path.join(current, segment)
        if ((await lstat(current)).isSymbolicLink()) throw new Error("Go 资产不能包含链接")
      }
      if (!(await lstat(current)).isFile()) throw new Error("Go 资产必须是普通文件")
      if (
        createHash("sha256")
          .update(await readFile(current))
          .digest("hex") !== expected
      )
        throw new Error("Go 资产摘要漂移：" + file)
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
}
