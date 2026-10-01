import { pathToFileURL } from "node:url"
import path from "node:path"
import { assertKnownOptions, parseArgs, readStringOption } from "./args.ts"
import { parseIdentityI18n } from "./identity.ts"
import { refreshBrand } from "./brand.ts"
import { assertProjectType } from "./config.ts"
import { rejectInPlaceInitialization } from "./init.ts"
import {
  isInteractiveTerminal,
  parsePolicyMode,
  promptForIdentity,
  type PromptDefaults,
  type PromptedIdentity
} from "./prompts.ts"
import { recommendedAgentPolicy } from "./agent-policy.ts"
import type { AgentPolicyChoice, AgentPolicySelection, InitOptions, ParsedArgs } from "./types.ts"
import { validateProject } from "./validate.ts"

// 保存 INIT_OPTIONS 变量供当前逻辑使用。
const INIT_OPTIONS = [
  "type",
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

Project creation (the target must be outside this Harness repository):
  pnpm instantiate -- <absolute-target> --type web|extension --name <name> --id <id> \\
    --policy-mode 预设|自定义 [--development-base-url <url>] \\
    [--test-base-url <url>] [--release-base-url <https-url>] \\
    [--description <description> (required for extension)] [--identity-i18n <json>] \\
    [--superpowers enabled|disabled] [--user-owned-tasks enabled|disabled] \\
    [--parallel-worktree-subagents enabled|disabled] \\
    [--acceptance-smoke enabled|disabled] [--e2e-hint enabled|disabled] \\
    [--brand-color <#RRGGBB>] [--logo <path>]

Maintenance commands:
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate

In-place initialization is forbidden. Project creation requires exactly one type.
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
  throw new Error(`${label} must be exactly enabled or disabled`)
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
      throw new Error("Recommended policy mode does not accept individual policy overrides")
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
): Promise<InitOptions> {
  assertKnownOptions(args, INIT_OPTIONS)
  // 保存 interactive 变量供当前逻辑使用。
  const interactive = runtime.interactive ?? isInteractiveTerminal()
  // 保存 suppliedBrandColor 变量供当前逻辑使用。
  const suppliedBrandColor = readStringOption(args, "brand-color")
  // 保存 supplied 变量供当前逻辑使用。
  const supplied = {
    targetRoot: runtime.targetRoot ?? (root === "" ? undefined : root),
    projectType: readStringOption(args, "type"),
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
  // 保存 required 变量供当前逻辑使用。
  const required = [
    ["<absolute-target>", supplied.targetRoot],
    ["--type", supplied.projectType],
    ["--name", supplied.name],
    ["--id", supplied.id],
    ["--policy-mode", supplied.policyMode]
  ] as const
  // 保存 missing 变量供当前逻辑使用。
  const missing = required
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ ([, value]) => value === undefined)
    .map(/* 执行 当前声明 函数的处理逻辑。 */ ([flag]) => flag)

  // 保存 identity 变量供当前逻辑使用。
  let identity:
    | (typeof supplied & { agentPolicy?: AgentPolicySelection })
    | Awaited<ReturnType<typeof promptForIdentity>> = supplied
  if (interactive) {
    identity = await (runtime.promptIdentity ?? promptForIdentity)(supplied)
  } else if (missing.length > 0) {
    throw new Error(
      `Non-interactive initialization is missing required option(s): ${missing.join(", ")}`
    )
  }

  const agentPolicy =
    "agentPolicy" in identity && identity.agentPolicy !== undefined
      ? identity.agentPolicy
      : nonInteractiveAgentPolicy(supplied)
  runtime.onPolicyModeResolved?.(parsePolicyMode(identity.policyMode ?? ""))
  if ("inputSources" in identity) runtime.onInputSourcesResolved?.(identity.inputSources)

  if (identity.projectType === undefined) throw new Error("Project type is required")
  assertProjectType(identity.projectType)
  if (identity.projectType === "extension" && !identity.description?.trim()) {
    throw new Error("Extension project description is required (--description)")
  }
  return {
    root: identity.targetRoot ?? root,
    projectType: identity.projectType,
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
  // 保存 args 变量供当前逻辑使用。
  const args = parseArgs(argv)
  assertKnownOptions(args, ["logo", "brand-color"])
  if (args.positionals.length !== 1 || args.positionals[0] !== "refresh") {
    throw new Error("Usage: pnpm harness brand refresh [--logo <path>] [--brand-color <color>]")
  }
  // 保存 config 变量供当前逻辑使用。
  const config = await refreshBrand(root, {
    logoPath: readStringOption(args, "logo"),
    brandColor: readStringOption(args, "brand-color")
  })
  console.log(`Refreshed brand assets for ${config.name}`)
}

// 执行 runValidate 函数的处理逻辑。
async function runValidate(argv: string[], root: string): Promise<void> {
  // 保存 args 变量供当前逻辑使用。
  const args = parseArgs(argv)
  assertKnownOptions(args, [])
  if (args.positionals.length > 0) throw new Error("validate does not accept positional arguments")
  // 保存 checked 变量供当前逻辑使用。
  const checked = await validateProject(root)
  console.log(`Project validation passed (${checked.join(", ")})`)
}

// 执行 runCli 函数的处理逻辑。
export async function runCli(argv = process.argv.slice(2), root = process.cwd()): Promise<void> {
  // 保存 [command, ...rest] 变量供当前逻辑使用。
  const [command, ...rest] = argv
  if (command === "init") return rejectInPlaceInitialization()
  if (command === "brand") return runBrand(rest, root)
  if (command === "validate") return runValidate(rest, root)
  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    console.log(usage())
    return
  }
  throw new Error(`Unknown Harness command: ${command}\n\n${usage()}`)
}

// 保存 executedPath 变量供当前逻辑使用。
const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  runCli().catch(
    /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  )
}
