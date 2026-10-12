import { lstat, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { assertKnownOptions, parseArgs } from "../.harness/tooling/args.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import type { PromptDefaults } from "../.harness/tooling/initialization-input.ts"
import {
  confirmInstantiation,
  isInteractiveTerminal,
  type InstantiationSummary,
  type PromptedIdentity
} from "../.harness/tooling/prompts.ts"
import type { InstantiateOptions, ProjectConfig } from "../.harness/tooling/types.ts"

/** 保存唯一公开创建入口允许的参数。 */
const INSTANTIATE_OPTIONS = [
  "type",
  "web-type",
  "name",
  "id",
  "description",
  "identity-i18n",
  "development-base-url",
  "test-base-url",
  "release-base-url",
  "brand-color",
  "logo",
  "policy-mode",
  "confirmed-by",
  "superpowers",
  "user-owned-tasks",
  "parallel-worktree-subagents",
  "acceptance-smoke",
  "e2e-hint"
] as const

/** 保存脚本文件确定的默认 Harness 源根。 */
const DEFAULT_SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url))

/** 描述可注入测试替身的创建入口依赖。 */
export interface InstantiateCliRuntime {
  sourceRoot?: string
  cwd?: string
  interactive?: boolean
  promptIdentity?: (defaults: PromptDefaults) => Promise<PromptedIdentity>
  confirm?: (summary: InstantiationSummary) => Promise<boolean>
  instantiate?: (options: InstantiateOptions) => Promise<ProjectConfig>
  output?: (message: string) => void
}

/** 返回创建命令的稳定用法说明。 */
function usage(): string {
  return "用法：pnpm instantiate -- <absolute-empty-target-outside-harness> --type web|extension [--web-type tool-site|saas-client|saas-admin （Web 必填）] --name <name> --id <id> --policy-mode 预设|自定义 [--description <text> （Extension 必填）] [--identity-i18n <json>] [--development-base-url <url>] [--test-base-url <url>] [--release-base-url <https-url>] [自定义策略参数]"
}

/** 只读解析不存在路径的最近真实祖先，得到用于确认的规范目标。 */
export async function canonicalizeProspectiveTarget(targetRoot: string): Promise<string> {
  let cursor = path.resolve(targetRoot)
  const missingNames: string[] = []
  while (true) {
    try {
      const existingRoot = await realpath(cursor)
      return path.join(existingRoot, ...missingNames.reverse())
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) throw error
      missingNames.push(path.basename(cursor))
      cursor = parent
    }
  }
}

/** 在最终汇总前只读验证目标名称、位置、类型与空目录约束。 */
async function preflightConfirmedTarget(
  targetRoot: string,
  canonicalTargetRoot: string,
  canonicalSourceRoot: string,
  projectId: string
): Promise<void> {
  if (path.basename(targetRoot) !== projectId) {
    throw new Error(`Target directory name must exactly match project id "${projectId}"`)
  }
  const relativeToSource = path.relative(canonicalSourceRoot, canonicalTargetRoot)
  if (
    relativeToSource === "" ||
    (!relativeToSource.startsWith("..") && !path.isAbsolute(relativeToSource))
  ) {
    throw new Error("Target must be outside the Harness template directory")
  }
  try {
    const status = await lstat(targetRoot)
    if (status.isSymbolicLink())
      throw new Error(`Target must not be a symbolic link: ${targetRoot}`)
    if (!status.isDirectory()) throw new Error(`Target is not a directory: ${targetRoot}`)
    if ((await readdir(targetRoot)).length > 0) {
      throw new Error(`Target directory must be empty: ${targetRoot}`)
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error
  }
}

/** 标记每个初始化字段来自命令行、交互表单、默认值或预设。 */
function inputSources(
  optionNames: ReadonlySet<string>,
  interactive: boolean,
  policyMode: "recommended" | "custom",
  projectType: ProjectConfig["projectType"],
  targetWasPositional: boolean,
  resolvedInteractiveSources?: Readonly<Record<string, string>>
): Record<string, string> {
  const source = (option: string): string =>
    optionNames.has(option) ? "命令行参数" : interactive ? "交互表单" : "缺失"
  const choices = [
    { field: "userOwnedTasks", option: "user-owned-tasks" },
    { field: "superpowers", option: "superpowers" },
    { field: "parallelWorktreeSubagents", option: "parallel-worktree-subagents" },
    { field: "acceptanceSmoke", option: "acceptance-smoke" },
    { field: "e2eHint", option: "e2e-hint" }
  ]
  const result: Record<string, string> = {
    sourceRoot: "脚本固定 Harness 源入口",
    targetRoot: "命令行绝对位置参数",
    projectType: source("type"),
    webType: projectType === "web" ? source("web-type") : "不适用",
    name: source("name"),
    id: source("id"),
    description: optionNames.has("description") ? "命令行参数" : "默认使用显示名称",
    identityI18n: optionNames.has("identity-i18n") ? "命令行参数" : "默认语言，未提供翻译",
    developmentBaseUrl: optionNames.has("development-base-url")
      ? "命令行参数"
      : "未配置（可后续补齐）",
    testBaseUrl: optionNames.has("test-base-url") ? "命令行参数" : "未配置（可后续补齐）",
    releaseBaseUrl: optionNames.has("release-base-url") ? "命令行参数" : "未配置（可后续补齐）",
    brandColor: optionNames.has("brand-color") ? "命令行参数" : "Harness 默认值",
    logoPath: optionNames.has("logo") ? "命令行参数" : "Harness 确定性生成",
    policyMode: source("policy-mode"),
    confirmedBy: optionNames.has("confirmed-by") ? "命令行参数" : "当前用户（自动记录）"
  }
  for (const choice of choices) {
    result[choice.field] =
      policyMode === "recommended"
        ? "recommended 确定性预设"
        : optionNames.has(choice.option)
          ? "命令行参数"
          : interactive
            ? "交互条件问询"
            : "缺失"
  }
  return {
    ...result,
    ...resolvedInteractiveSources,
    targetRoot: targetWasPositional
      ? "命令行绝对位置参数"
      : (resolvedInteractiveSources?.targetRoot ?? "交互问答")
  }
}

/** 解析、确认并执行唯一的源外项目创建入口。 */
export async function runInstantiateCli(
  argv = process.argv.slice(2),
  runtime: InstantiateCliRuntime = {}
): Promise<ProjectConfig> {
  const parsed = parseArgs(argv)
  assertKnownOptions(parsed, INSTANTIATE_OPTIONS)
  if (parsed.positionals.length > 1) {
    throw new Error(usage())
  }

  const cwd = runtime.cwd ?? process.cwd()
  const rawSourceRoot = runtime.sourceRoot ?? DEFAULT_SOURCE_ROOT
  const sourceRoot = path.resolve(rawSourceRoot)
  const interactive = runtime.interactive ?? isInteractiveTerminal()
  const positionalTargetRoot = parsed.positionals[0]
  if (positionalTargetRoot === undefined && !interactive) throw new Error(usage())
  if (positionalTargetRoot !== undefined && !path.isAbsolute(positionalTargetRoot)) {
    throw new Error(
      `Instantiation target must be provided as an absolute path: ${positionalTargetRoot}`
    )
  }
  const initArgs = { ...parsed, positionals: [] }
  let policyMode: "recommended" | "custom" = "recommended"
  let resolvedInteractiveSources: Readonly<Record<string, string>> | undefined
  const init = await resolveInitOptions(initArgs, positionalTargetRoot ?? "", {
    interactive,
    targetRoot: positionalTargetRoot,
    promptIdentity: runtime.promptIdentity,
    onPolicyModeResolved: (resolved) => {
      policyMode = resolved
    },
    onInputSourcesResolved: (resolved) => {
      resolvedInteractiveSources = resolved
    }
  })
  const rawTargetRoot = positionalTargetRoot ?? init.root
  if (!path.isAbsolute(rawTargetRoot)) {
    throw new Error(`Instantiation target must be provided as an absolute path: ${rawTargetRoot}`)
  }
  const targetRoot = path.normalize(rawTargetRoot)
  if (init.logoPath !== undefined) init.logoPath = path.resolve(cwd, init.logoPath)

  const canonicalSourceRoot = await realpath(sourceRoot)
  const canonicalTargetRoot = await canonicalizeProspectiveTarget(targetRoot)
  await preflightConfirmedTarget(targetRoot, canonicalTargetRoot, canonicalSourceRoot, init.id)
  if (interactive) {
    const summary: InstantiationSummary = {
      rawSourceRoot,
      canonicalSourceRoot,
      rawTargetRoot,
      canonicalTargetRoot,
      policyMode,
      inputSources: inputSources(
        new Set(parsed.options.keys()),
        interactive,
        policyMode,
        init.projectType,
        positionalTargetRoot !== undefined,
        resolvedInteractiveSources
      ),
      init
    }
    const confirmed = await (runtime.confirm ?? confirmInstantiation)(summary)
    if (!confirmed) throw new Error("Project creation cancelled before any target write")
  }

  const instantiate = runtime.instantiate ?? instantiateProject
  const config = await instantiate({
    sourceRoot,
    targetRoot,
    init: {
      projectType: init.projectType,
      webType: init.webType,
      name: init.name,
      id: init.id,
      description: init.description,
      identityI18n: init.identityI18n,
      brandColor: init.brandColor,
      developmentBaseUrl: init.developmentBaseUrl,
      testBaseUrl: init.testBaseUrl,
      releaseBaseUrl: init.releaseBaseUrl,
      logoPath: init.logoPath,
      agentPolicy: init.agentPolicy
    }
  })
  const output = runtime.output ?? console.log
  output(`已创建 ${config.projectType} 项目：${targetRoot}`)
  if (init.webType !== undefined) {
    output(`Web 类型：${init.webType}；已记录在 README.md 的“创建交接”中。`)
    output(
      "下一步：切换到新项目，复用创建选择执行需求确认 → 原型选择 → 实施；SOP 见项目 README.md。"
    )
  }
  output(`Logo 母版：${path.join(targetRoot, ".harness/brand/logo-1024.png")} (1024×1024 PNG)`)
  output(
    config.projectType === "web"
      ? "品牌资产：public/logo.png (512×512), public/favicon.png (64×64)"
      : "品牌资产：assets/icon.png (1024×1024); Plasmo 在构建时派生 manifest 所需的图标尺寸"
  )
  output("未构建正式产物。需要时在项目中运行 `pnpm build`。")
  return config
}

/** 执行命令行入口并把失败转为非零退出码。 */
async function main(): Promise<void> {
  await runInstantiateCli()
}

/** 保存当前 Node 入口路径以避免测试 import 时自动执行。 */
const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
