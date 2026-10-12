import { assertKnownOptions, parseArgs, readStringOption } from "./args.ts"
import { parseIdentityI18n } from "./identity.ts"
import { refreshBrand } from "./brand.ts"
import { assertProjectType } from "./config.ts"
import { rejectInPlaceInitialization } from "./init.ts"
import {
  assertWebCreationAvailable,
  parsePolicyMode,
  parseWebCreationType,
  type PromptDefaults,
  type WebCreationType
} from "./initialization-input.ts"
import { isInteractiveTerminal, promptForIdentity, type PromptedIdentity } from "./prompts.ts"
import { recommendedAgentPolicy } from "./agent-policy.ts"
import type { AgentPolicyChoice, AgentPolicySelection, InitOptions, ParsedArgs } from "./types.ts"
import { validateProject } from "./validate.ts"
import { isMainModule } from "./files.ts"

const INIT_OPTIONS = [
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

// 执行 usage 函数的处理逻辑。
function usage(): string {
  return `Bifang Web Harness

创建项目（目标必须位于本 Harness 仓库之外）：
  pnpm instantiate -- <absolute-target> --type web|extension --name <name> --id <id> \\
    [--web-type tool-site|saas-client|saas-admin（Web 必填）] \\
    --policy-mode 预设|自定义 [--development-base-url <url>] \\
    [--test-base-url <url>] [--release-base-url <https-url>] \\
    [--description <description>（Extension 必填）] [--identity-i18n <json>] \\
    [--superpowers enabled|disabled] [--user-owned-tasks enabled|disabled] \\
    [--parallel-worktree-subagents enabled|disabled] \\
    [--acceptance-smoke enabled|disabled] [--e2e-hint enabled|disabled] \\
    [--brand-color <#RRGGBB>] [--logo <path>]

维护命令：
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate

禁止原地初始化；创建项目必须且只能选择一种宿主类型。
Web 类型：1.工具站点（现有流程）；2.SaaS客户端、3.SaaS大后台（选项预留，流程暂未开放）。
`
}

/** 描述初始化参数解析时可注入的交互环境。 */
export interface InitOptionsResolutionRuntime {
  interactive?: boolean
  targetRoot?: string
  promptIdentity?: (defaults: PromptDefaults) => Promise<PromptedIdentity>
  onPolicyModeResolved?: (mode: "recommended" | "custom") => void
  onInputSourcesResolved?: (sources: Readonly<Record<string, string>>) => void
}

/** 将非交互能力参数约束为 enabled 或 disabled。 */
function policyChoice(value: string | undefined, label: string): AgentPolicyChoice {
  if (value === "enabled" || value === "disabled") return value
  throw new Error(`${label} 必须精确为 enabled 或 disabled`)
}

/** 从非交互参数完全解析推荐或自定义 Agent policy。 */
function nonInteractiveAgentPolicy(supplied: {
  policyMode?: string
  confirmedBy?: string
  superpowers?: string
  userOwnedTasks?: string
  parallelWorktreeSubagents?: string
  acceptanceSmoke?: string
  e2eHint?: string
}): AgentPolicySelection {
  const confirmedBy = supplied.confirmedBy?.trim() || "当前用户"
  const policyMode = parsePolicyMode(supplied.policyMode ?? "")
  if (policyMode === "recommended") {
    if (
      supplied.superpowers !== undefined ||
      supplied.userOwnedTasks !== undefined ||
      supplied.parallelWorktreeSubagents !== undefined ||
      supplied.acceptanceSmoke !== undefined ||
      supplied.e2eHint !== undefined
    ) {
      throw new Error("预设策略模式不接受单项策略覆盖")
    }
    return recommendedAgentPolicy(confirmedBy)
  }
  return {
    confirmedBy,
    confirmedAt: new Date().toISOString(),
    superpowers: policyChoice(supplied.superpowers, "--superpowers"),
    userOwnedTasks: policyChoice(supplied.userOwnedTasks, "--user-owned-tasks"),
    parallelWorktreeSubagents: policyChoice(
      supplied.parallelWorktreeSubagents,
      "--parallel-worktree-subagents"
    ),
    acceptanceSmoke: policyChoice(supplied.acceptanceSmoke, "--acceptance-smoke"),
    e2eHint: policyChoice(supplied.e2eHint, "--e2e-hint")
  }
}

/** 判断交互初始化是否仍需收集自定义 Agent policy 条件字段。 */
export function requiresInteractiveAgentPolicyPrompt(supplied: {
  policyMode?: string
  superpowers?: string
  userOwnedTasks?: string
  parallelWorktreeSubagents?: string
  acceptanceSmoke?: string
  e2eHint?: string
}): boolean {
  return (
    supplied.policyMode !== undefined &&
    parsePolicyMode(supplied.policyMode) === "custom" &&
    [
      supplied.userOwnedTasks,
      supplied.superpowers,
      supplied.parallelWorktreeSubagents,
      supplied.acceptanceSmoke,
      supplied.e2eHint
    ].some((value) => value === undefined)
  )
}

// 执行 resolveInitOptions 函数的处理逻辑。
export async function resolveInitOptions(
  args: ParsedArgs,
  root: string,
  runtime: InitOptionsResolutionRuntime = {}
): Promise<InitOptions & { webType?: WebCreationType }> {
  assertKnownOptions(args, INIT_OPTIONS)
  const interactive = runtime.interactive ?? isInteractiveTerminal()
  const suppliedBrandColor = readStringOption(args, "brand-color")
  const supplied = {
    targetRoot: runtime.targetRoot ?? (root === "" ? undefined : root),
    projectType: readStringOption(args, "type"),
    webType: readStringOption(args, "web-type"),
    name: readStringOption(args, "name"),
    id: readStringOption(args, "id"),
    description: readStringOption(args, "description", true),
    identityI18n: readStringOption(args, "identity-i18n", true),
    brandColor: suppliedBrandColor ?? (interactive ? undefined : "#4C6EF5"),
    developmentBaseUrl: readStringOption(args, "development-base-url", true),
    testBaseUrl: readStringOption(args, "test-base-url", true),
    releaseBaseUrl: readStringOption(args, "release-base-url", true),
    policyMode: readStringOption(args, "policy-mode"),
    confirmedBy: readStringOption(args, "confirmed-by", true),
    superpowers: readStringOption(args, "superpowers"),
    userOwnedTasks: readStringOption(args, "user-owned-tasks"),
    parallelWorktreeSubagents: readStringOption(args, "parallel-worktree-subagents"),
    acceptanceSmoke: readStringOption(args, "acceptance-smoke"),
    e2eHint: readStringOption(args, "e2e-hint")
  }
  const required = [
    ["<absolute-target>", supplied.targetRoot],
    ["--type", supplied.projectType],
    ...(supplied.projectType === "web" ? [["--web-type", supplied.webType] as const] : []),
    ["--name", supplied.name],
    ["--id", supplied.id],
    ["--policy-mode", supplied.policyMode]
  ] as const
  const missing = required
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ ([, value]) => value === undefined)
    .map(/* 执行 当前声明 函数的处理逻辑。 */ ([flag]) => flag)

  let identity:
    | (typeof supplied & { agentPolicy?: AgentPolicySelection })
    | Awaited<ReturnType<typeof promptForIdentity>> = supplied
  if (interactive) {
    identity = await (runtime.promptIdentity ?? promptForIdentity)(supplied)
  } else {
    // 明确选择的 Web 预留流程优先结束，不要求补齐不会被采用的基础字段。
    if (supplied.projectType === "web" && supplied.webType !== undefined) {
      assertWebCreationAvailable("web", supplied.webType)
    }
    if (missing.length > 0) {
      throw new Error(
        `Non-interactive initialization is missing required option(s): ${missing.join(", ")}`
      )
    }
  }

  if (identity.projectType === undefined) throw new Error("Project type is required")
  assertProjectType(identity.projectType)
  assertWebCreationAvailable(identity.projectType, identity.webType)
  const agentPolicy =
    "agentPolicy" in identity && identity.agentPolicy !== undefined
      ? identity.agentPolicy
      : nonInteractiveAgentPolicy(supplied)
  runtime.onPolicyModeResolved?.(parsePolicyMode(identity.policyMode ?? ""))
  if ("inputSources" in identity) runtime.onInputSourcesResolved?.(identity.inputSources)

  if (identity.projectType === "extension" && !identity.description?.trim()) {
    throw new Error("Extension project description is required (--description)")
  }
  return {
    root: identity.targetRoot ?? root,
    projectType: identity.projectType,
    webType:
      identity.projectType === "web" ? parseWebCreationType(identity.webType ?? "") : undefined,
    name: identity.name ?? "",
    id: identity.id ?? "",
    description: identity.description?.trim() || identity.name?.trim() || "",
    identityI18n: parseIdentityI18n(identity.identityI18n),
    brandColor: identity.brandColor ?? "",
    developmentBaseUrl: identity.developmentBaseUrl ?? "",
    testBaseUrl: identity.testBaseUrl ?? "",
    releaseBaseUrl: identity.releaseBaseUrl ?? "",
    agentPolicy,
    logoPath: readStringOption(args, "logo")
  }
}

// 执行 runBrand 函数的处理逻辑。
async function runBrand(argv: string[], root: string): Promise<void> {
  const args = parseArgs(argv)
  assertKnownOptions(args, ["logo", "brand-color"])
  if (args.positionals.length !== 1 || args.positionals[0] !== "refresh") {
    throw new Error("用法：pnpm harness brand refresh [--logo <path>] [--brand-color <color>]")
  }
  const config = await refreshBrand(root, {
    logoPath: readStringOption(args, "logo"),
    brandColor: readStringOption(args, "brand-color")
  })
  console.log(`已刷新品牌资产：${config.name}`)
}

// 执行 runValidate 函数的处理逻辑。
async function runValidate(argv: string[], root: string): Promise<void> {
  const args = parseArgs(argv)
  assertKnownOptions(args, [])
  if (args.positionals.length > 0) throw new Error("validate 不接受位置参数")
  const checked = await validateProject(root)
  console.log(`项目校验通过 (${checked.join(", ")})`)
}

// 执行 runCli 函数的处理逻辑。
export async function runCli(argv = process.argv.slice(2), root = process.cwd()): Promise<void> {
  const [command, ...rest] = argv
  if (command === "init") return rejectInPlaceInitialization()
  if (command === "brand") return runBrand(rest, root)
  if (command === "validate") return runValidate(rest, root)
  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    console.log(usage())
    return
  }
  throw new Error(`未知的 Harness 命令：${command}\n\n${usage()}`)
}

if (isMainModule(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
