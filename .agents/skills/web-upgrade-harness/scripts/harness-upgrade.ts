import { isMainModule } from "../../../../.harness/tooling/files.ts"
import {
  applyUpgradePath,
  createUpgradePlan,
  recordUpgradeBaseline,
  writeUpgradePlan
} from "./upgrade-core.ts"
import { migrateOwnership } from "./upgrade-ownership-delta.ts"
import type { HarnessUpgradePlan } from "./upgrade-types.ts"

/** 枚举升级 CLI 的唯一命令。 */
type UpgradeCommand = "plan" | "apply" | "record" | "migrate-ownership"

/** 描述严格解析后的命令行输入。 */
interface UpgradeCliOptions {
  /** 保存唯一命令。 */
  command: UpgradeCommand
  /** 保存不允许重复的键值选项。 */
  values: Map<string, string>
  /** 保存可重复的人工合并路径。 */
  resolvedManual: string[]
  /** 表示 record 正在建立首份核验基线。 */
  bootstrap: boolean
}

/** 保存各命令允许的单值选项。 */
const VALUE_OPTIONS = {
  plan: new Set([
    "--source-root",
    "--source-version",
    "--source-commit",
    "--candidate-root",
    "--target-root",
    "--ownership",
    "--lock",
    "--output"
  ]),
  apply: new Set(["--plan", "--path", "--approval"]),
  record: new Set(["--plan", "--source-version", "--source-commit", "--approval"]),
  "migrate-ownership": new Set(["--target-ownership", "--approval"])
} as const

/** 保存各命令缺一不可的单值选项，plan 的输出文件保持可选。 */
const REQUIRED_VALUE_OPTIONS = {
  plan: [
    "--source-root",
    "--source-version",
    "--source-commit",
    "--candidate-root",
    "--target-root",
    "--ownership",
    "--lock"
  ],
  apply: ["--plan", "--path", "--approval"],
  record: ["--plan", "--source-version", "--source-commit", "--approval"],
  "migrate-ownership": ["--target-ownership"]
} as const

/** 返回命令缺一不可的选项。 */
function requiredOptions(command: UpgradeCommand): readonly string[] {
  return REQUIRED_VALUE_OPTIONS[command]
}

/** 严格解析位置命令、值参数、重复路径和 bootstrap 标记。 */
function parseCli(argv: readonly string[]): UpgradeCliOptions {
  const [commandInput, ...tokens] = argv
  if (
    commandInput !== "plan" &&
    commandInput !== "apply" &&
    commandInput !== "record" &&
    commandInput !== "migrate-ownership"
  ) {
    throw new Error("用法：harness-upgrade <plan|apply|record|migrate-ownership> [参数]")
  }
  const command = commandInput
  const values = new Map<string, string>()
  const resolvedManual: string[] = []
  let bootstrap = false
  for (let index = 0; index < tokens.length; index += 1) {
    const option = tokens[index]
    if (option === "--bootstrap") {
      if (command !== "record" || bootstrap)
        throw new Error(`选项不适用于当前命令或重复提供：${option}`)
      bootstrap = true
      continue
    }
    if (option === "--resolved-manual") {
      if (command !== "record") throw new Error(`选项不适用于当前命令：${option}`)
      const value = tokens[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${option} 需要一个路径`)
      }
      resolvedManual.push(value)
      index += 1
      continue
    }
    if (option === undefined || !VALUE_OPTIONS[command].has(option as never)) {
      throw new Error(`未知或不适用的选项： ${option ?? "<missing>"}`)
    }
    if (values.has(option)) throw new Error(`选项重复：${option}`)
    const value = tokens[index + 1]
    if (value === undefined || value.startsWith("--")) throw new Error(`${option} 需要提供值`)
    values.set(option, value)
    index += 1
  }
  const missing = requiredOptions(command).filter((option) => !values.has(option))
  if (missing.length > 0) throw new Error(`缺少必需选项： ${missing.join(", ")}`)
  return { command, values, resolvedManual, bootstrap }
}

/** 读取已经由严格解析证明存在的单值选项。 */
function value(options: UpgradeCliOptions, name: string): string {
  const result = options.values.get(name)
  if (result === undefined) throw new Error(`缺少必需选项： ${name}`)
  return result
}

/** 执行升级命令并返回机器可读结果。 */
export async function runUpgradeCli(argv: readonly string[]): Promise<unknown> {
  const options = parseCli(argv)
  if (options.command === "plan") {
    const plan = await createUpgradePlan({
      sourceRoot: value(options, "--source-root"),
      sourceVersion: value(options, "--source-version"),
      sourceCommit: value(options, "--source-commit"),
      candidateRoot: value(options, "--candidate-root"),
      targetRoot: value(options, "--target-root"),
      ownershipPath: value(options, "--ownership"),
      lockPath: value(options, "--lock")
    })
    const output = options.values.get("--output")
    if (output !== undefined) await writeUpgradePlan(plan, output)
    return plan
  }
  if (options.command === "apply") {
    return applyUpgradePath({
      planPath: value(options, "--plan"),
      path: value(options, "--path"),
      approval: value(options, "--approval")
    })
  }
  if (options.command === "migrate-ownership") {
    const approval = options.values.get("--approval")
    return migrateOwnership({
      targetOwnershipPath: value(options, "--target-ownership"),
      ...(approval === undefined ? {} : { approval })
    })
  }
  return recordUpgradeBaseline({
    planPath: value(options, "--plan"),
    sourceVersion: value(options, "--source-version"),
    sourceCommit: value(options, "--source-commit"),
    bootstrap: options.bootstrap,
    approval: value(options, "--approval"),
    resolvedManual: options.resolvedManual
  })
}

/** 以递归键排序生成单个稳定 JSON，避免 CLI 输出受对象构造顺序影响。 */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested === null || typeof nested !== "object" || Array.isArray(nested)) return nested
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([left], [right]) =>
        left === right ? 0 : left < right ? -1 : 1
      )
    )
  })
}

/** 判断命令结果是否为明确阻断的升级计划。 */
function isBlockedPlan(value: unknown): value is HarnessUpgradePlan {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Partial<HarnessUpgradePlan>).schemaVersion === 2 &&
    (value as Partial<HarnessUpgradePlan>).blocked === true
  )
}

/** 在直接执行时打印 JSON 或单一失败信息。 */
async function main(): Promise<void> {
  try {
    const result = await runUpgradeCli(process.argv.slice(2))
    process.stdout.write(`${stableJson(result)}\n`)
    if (isBlockedPlan(result)) process.exitCode = 2
  } catch (error) {
    process.stderr.write(
      `${stableJson({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`
    )
    process.exitCode = 2
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
