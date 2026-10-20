import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inspectCreationForm } from "../.harness/tooling/initialization-form.ts"

/** 将源外临时 JSON 输入转换为下一问题或当前汇总，全程只读并输出 JSON。 */
async function main(): Promise<void> {
  const [file, ...rest] = process.argv.slice(2)
  if (!file || !path.isAbsolute(file) || rest.length)
    throw new Error("用法：pnpm exec tsx scripts/initialization-form.ts <absolute-input-json>")
  const source = fileURLToPath(new URL("..", import.meta.url))
  console.log(
    JSON.stringify(
      await inspectCreationForm(source, JSON.parse(await readFile(file, "utf8"))),
      null,
      2
    )
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
