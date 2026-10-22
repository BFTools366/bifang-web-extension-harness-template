import { realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assertKnownOptions, parseArgs } from "../.harness/tooling/args.ts"
import { isMainModule } from "../.harness/tooling/files.ts"
import { INIT_OPTIONS, resolveInitOptions } from "../.harness/tooling/cli.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { initializeWorkspace, createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { readRequirementsInput } from "../.harness/tooling/creation-requirements.ts"
import { readFile } from "node:fs/promises"
import { inspectCreationForm } from "../.harness/tooling/initialization-form.ts"
import {
  validateProjectId,
  POLICY_OPTIONS,
  type PromptDefaults
} from "../.harness/tooling/initialization-input.ts"
import {
  confirmInstantiation,
  isInteractiveTerminal,
  type InstantiationSummary,
  type PromptedIdentity
} from "../.harness/tooling/prompts.ts"
import type { InstantiateOptions, ProjectConfig } from "../.harness/tooling/types.ts"

import {
  canonicalizeProspectiveTarget,
  preflightConfirmedTarget,
  validateParentAccess,
  validateInitializationTarget
} from "../.harness/tooling/initialization-target.ts"
export { canonicalizeProspectiveTarget } from "../.harness/tooling/initialization-target.ts"

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
  /** 仅内部递归携带表单已批准事实，公开参数不能覆盖。 */
  approval?: InstantiateOptions["approval"]
}

/** 返回创建命令的稳定用法说明。 */
function usage(): string {
  return "用法：pnpm instantiate -- <parent-outside-harness> --type web|extension --server existing|create|none --name <name> [--requirements-file <md-or-txt-path> | --requirements-text <text>] [--english-name <English translation>] [--id <id>] [--policy-mode 预设|自定义] [--description <text> （Extension 必填）] [--identity-i18n <json>] [--development-base-url <url>] [--test-base-url <url>] [--release-base-url <https-url>] [自定义策略参数]；选择 create 时创建所选前端和 Go 服务；明确不需要服务端则 none，只创建前端，最终目录为父目录/项目标识"
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
  const choices = Object.entries(POLICY_OPTIONS).map(([field, option]) => ({ field, option }))
  const result: Record<string, string> = {
    sourceRoot: "脚本固定 Harness 源入口",
    targetRoot: "命令行父目录位置参数",
    projectType: source("type"),
    serverMode: source("server"),
    apiContract: optionNames.has("api-contract") ? "命令行接口契约" : "所选操作接线前补齐",
    requirementsFile: optionNames.has("requirements-file")
      ? "命令行参数"
      : "未提供，按原有题目继续",
    requirementsText: optionNames.has("requirements-text") ? "命令行直接输入" : "未提供",
    name: source("name"),
    englishName: optionNames.has("english-name") ? "命令行参数" : "未单独提供",
    id: optionNames.has("id") ? "命令行参数" : "英文名称自动生成",
    description: optionNames.has("description") ? "命令行参数" : "默认使用显示名称",
    identityI18n: optionNames.has("identity-i18n") ? "命令行参数" : "默认语言，未提供翻译",
    developmentBaseUrl: optionNames.has("development-base-url")
      ? "命令行参数"
      : "未配置（可后续补齐）",
    testBaseUrl: optionNames.has("test-base-url") ? "命令行参数" : "未配置（可后续补齐）",
    releaseBaseUrl: optionNames.has("release-base-url") ? "命令行参数" : "未配置（可后续补齐）",
    brandColor: optionNames.has("brand-color") ? "命令行参数" : "Harness 默认值",
    logoPath: optionNames.has("logo") ? "命令行参数" : "Harness 确定性生成",
    policyMode: optionNames.has("policy-mode")
      ? "命令行参数"
      : policyMode === "recommended"
        ? "默认预设"
        : "沿用单项策略",
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
      ? "命令行父目录 + 项目标识"
      : `${resolvedInteractiveSources?.targetRoot ?? "交互问答"}父目录 + 项目标识`
  }
}

/** 解析、确认并执行唯一的源外项目创建入口。 */
export async function runInstantiateCli(
  argv = process.argv.slice(2),
  runtime: InstantiateCliRuntime = {}
): Promise<ProjectConfig> {
  const parsed = parseArgs(argv)
  if (parsed.options.has("form")) {
    if (parsed.options.size !== 1 || parsed.positionals.length !== 0) {
      throw new Error("--form 不接受其他参数覆盖已确认输入")
    }
    const file = parsed.options.get("form")
    if (typeof file !== "string" || !path.isAbsolute(file))
      throw new Error("--form 必须是绝对 JSON 路径")
    const form = await inspectCreationForm(
      runtime.sourceRoot ?? DEFAULT_SOURCE_ROOT,
      JSON.parse(await readFile(file, "utf8"))
    )
    if (form.phase !== "authorized" || !form.argv)
      throw new Error(form.issue ?? `完整创建未授权：${form.phase}`)
    return runInstantiateCli(form.argv, { ...runtime, interactive: false, approval: form.approval })
  }
  assertKnownOptions(parsed, INIT_OPTIONS)
  if (parsed.positionals.length > 1) {
    throw new Error(usage())
  }

  const cwd = runtime.cwd ?? process.cwd()
  const rawSourceRoot = runtime.sourceRoot ?? DEFAULT_SOURCE_ROOT
  const sourceRoot = path.resolve(rawSourceRoot)
  const interactive = runtime.interactive ?? isInteractiveTerminal()
  const positionalParentRoot = parsed.positionals[0]
  if (positionalParentRoot === undefined && !interactive) throw new Error(usage())
  const initArgs = { ...parsed, positionals: [] }
  let policyMode: "recommended" | "custom" = "recommended"
  let resolvedInteractiveSources: Readonly<Record<string, string>> | undefined
  let promptedParentRoot: string | undefined
  const init = await resolveInitOptions(initArgs, positionalParentRoot ?? "", {
    interactive,
    cwd,
    targetRoot: positionalParentRoot,
    promptIdentity: runtime.promptIdentity,
    validateTarget: (values) => validateInitializationTarget(sourceRoot, values),
    onPolicyModeResolved: (resolved) => {
      policyMode = resolved
    },
    onInputSourcesResolved: (resolved) => {
      resolvedInteractiveSources = resolved
    },
    onParentInputResolved: (raw) => {
      promptedParentRoot = raw
    }
  })
  const rawParentRoot = promptedParentRoot ?? positionalParentRoot ?? init.root
  const parentRoot = path.resolve(cwd, init.root)
  validateProjectId(init.id)
  const rawTargetRoot = path.join(parentRoot, init.id)
  const targetRoot = path.normalize(rawTargetRoot)
  if (init.apiContract) init.apiContract = path.resolve(cwd, init.apiContract)
  if (init.logoPath !== undefined) init.logoPath = path.resolve(cwd, init.logoPath)
  if (init.requirementsFile) init.requirementsFile = path.resolve(cwd, init.requirementsFile)
  const requirements = await readRequirementsInput(init)

  await validateParentAccess(parentRoot)
  const canonicalSourceRoot = await realpath(sourceRoot)
  const canonicalTargetRoot = await canonicalizeProspectiveTarget(targetRoot)
  await preflightConfirmedTarget(targetRoot, canonicalTargetRoot, canonicalSourceRoot, init.id)
  const needsPathConfirmation = !path.isAbsolute(rawParentRoot)
  if (needsPathConfirmation && !interactive && !runtime.confirm) {
    throw new Error(
      `相对路径已解析为 ${canonicalTargetRoot}；需要确认是否保存到此位置。请在交互终端使用同一命令确认，或通过 --form 提交已确认表单，无需重新输入绝对路径。`
    )
  }
  if (interactive || needsPathConfirmation) {
    const summary: InstantiationSummary = {
      rawSourceRoot,
      canonicalSourceRoot,
      rawParentRoot,
      pathBaseRoot: path.resolve(cwd),
      rawTargetRoot,
      canonicalTargetRoot,
      policyMode,
      requirements:
        requirements === undefined
          ? undefined
          : {
              sourcePath: init.requirementsFile ?? "直接输入或 Word 提取的需求文本",
              sha256: requirements.sha256,
              byteLength: Buffer.byteLength(requirements.content, "utf8")
            },
      inputSources: inputSources(
        new Set(parsed.options.keys()),
        interactive,
        policyMode,
        init.projectType,
        positionalParentRoot !== undefined,
        resolvedInteractiveSources
      ),
      init
    }
    const confirmed = await (runtime.confirm ?? confirmInstantiation)(summary)
    if (!confirmed) throw new Error("Project creation cancelled before any target write")
  }

  if (requirements !== undefined) {
    const current = await readRequirementsInput(init)
    if (current?.sha256 !== requirements.sha256) {
      throw new Error("需求文档在确认期间发生变化；请重新读取并确认后再创建")
    }
  }

  createWorkspaceConfig(init)
  const instantiate =
    runtime.instantiate ??
    ((options: InstantiateOptions) => instantiateProject(options, initializeWorkspace))
  const config = await instantiate({
    sourceRoot,
    targetRoot,
    requirements,
    approval: runtime.approval,
    init: {
      projectType: init.projectType,
      workspaceMembers: init.workspaceMembers,
      serverMode: init.serverMode,
      apiContract: init.apiContract,
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
  output(`工程事务完成（ENGINEERING_READY），已创建 Workspace：${targetRoot}`)
  output(
    requirements === undefined
      ? "工程事务完成（ENGINEERING_READY）。下一步：在新项目澄清或复用真实首版范围，再继续 PRD → 固定设计原型 → 页面功能接线 → 开发走查；工程成功不是完整创建完成。"
      : `需求原文：${path.join(targetRoot, "docs/requirements/source.txt")}；下一步由 Agent 澄清或复用真实完整创建授权，在下游继续 PRD → 固定原型 → 页面功能 → 开发走查。CLI 不执行语义分析或装配业务功能。`
  )
  const workspace = createWorkspaceConfig(init)
  for (const member of workspace.members) {
    output(`成员：${path.join(targetRoot, member.directory)}`)
    if (member.type !== "server")
      output(
        `Logo 母版：${path.join(targetRoot, member.directory, ".harness/brand/logo-1024.png")} (1024×1024 PNG)`
      )
  }
  output(
    "未构建正式产物。前端需要时运行 `pnpm build -- --member web|extension（复用本次 E2E 选择）`；服务本地编译运行 `pnpm build:server`。"
  )
  return config
}

/** 执行命令行入口并把失败转为非零退出码。 */
async function main(): Promise<void> {
  await runInstantiateCli()
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
