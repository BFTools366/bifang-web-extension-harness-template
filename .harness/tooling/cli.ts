import { pathToFileURL } from "node:url"
import path from "node:path"
import { assertKnownOptions, parseArgs, readBooleanOption, readStringOption } from "./args.ts"
import { refreshBrand } from "./brand.ts"
import { assertProjectType } from "./config.ts"
import { rejectInPlaceInitialization } from "./init.ts"
import { isInteractiveTerminal, promptForIdentity } from "./prompts.ts"
import type { InitOptions, ParsedArgs } from "./types.ts"
import { validateProject } from "./validate.ts"

// 保存 INIT_OPTIONS 变量供当前逻辑使用。
const INIT_OPTIONS = [
  "type",
  "name",
  "id",
  "description",
  "development-base-url",
  "test-base-url",
  "release-base-url",
  "brand-color",
  "logo",
  "e2e",
  "skip-install",
  "skip-git"
] as const

// 执行 usage 函数的处理逻辑。
function usage(): string {
  return `Bifang Web Harness

Project creation (the target must be outside this Harness repository):
  pnpm instantiate -- <absolute-target> --type web|extension --name <name> --id <id> \\
    --description <description> --development-base-url <url> \\
    --test-base-url <url> --release-base-url <https-url> \\
    [--brand-color <#RRGGBB>] [--logo <path>] [--e2e enabled|disabled]

Maintenance commands:
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate

In-place initialization is forbidden. Project creation requires exactly one type.
Use --skip-install and --skip-git only in controlled automation.
`
}

// 执行 resolveInitOptions 函数的处理逻辑。
export async function resolveInitOptions(args: ParsedArgs, root: string): Promise<InitOptions> {
  assertKnownOptions(args, INIT_OPTIONS)
  // 保存 interactive 变量供当前逻辑使用。
  const interactive = isInteractiveTerminal()
  // 保存 suppliedBrandColor 变量供当前逻辑使用。
  const suppliedBrandColor = readStringOption(args, "brand-color")
  // 保存 supplied 变量供当前逻辑使用。
  const supplied = {
    projectType: readStringOption(args, "type"),
    name: readStringOption(args, "name"),
    id: readStringOption(args, "id"),
    description: readStringOption(args, "description"),
    brandColor: suppliedBrandColor ?? (interactive ? undefined : "#4C6EF5"),
    developmentBaseUrl: readStringOption(args, "development-base-url"),
    testBaseUrl: readStringOption(args, "test-base-url"),
    releaseBaseUrl: readStringOption(args, "release-base-url")
  }
  // 保存 required 变量供当前逻辑使用。
  const required = [
    ["--type", supplied.projectType],
    ["--name", supplied.name],
    ["--id", supplied.id],
    ["--description", supplied.description],
    ["--development-base-url", supplied.developmentBaseUrl],
    ["--test-base-url", supplied.testBaseUrl],
    ["--release-base-url", supplied.releaseBaseUrl]
  ] as const
  // 保存 missing 变量供当前逻辑使用。
  const missing = required
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ ([, value]) => value === undefined)
    .map(/* 执行 当前声明 函数的处理逻辑。 */ ([flag]) => flag)

  // 保存 identity 变量供当前逻辑使用。
  let identity = supplied
  if (missing.length > 0 || (interactive && suppliedBrandColor === undefined)) {
    if (!interactive) {
      throw new Error(
        `Non-interactive initialization is missing required option(s): ${missing.join(", ")}`
      )
    }
    identity = await promptForIdentity(supplied)
  }

  if (identity.projectType === undefined) throw new Error("Project type is required")
  assertProjectType(identity.projectType)
  // 保存 e2e 变量供非交互构建选择校验使用。
  const e2e = readStringOption(args, "e2e")
  if (e2e !== undefined && e2e !== "enabled" && e2e !== "disabled") {
    throw new Error("--e2e must be enabled or disabled")
  }
  // 保存 skipInstall 变量供无需构建的自动化例外使用。
  const skipInstall = readBooleanOption(args, "skip-install")
  if (!interactive && !skipInstall && e2e === undefined) {
    throw new Error("Non-interactive initialization requires --e2e enabled|disabled")
  }
  return {
    root,
    projectType: identity.projectType,
    name: identity.name ?? "",
    id: identity.id ?? "",
    description: identity.description ?? "",
    brandColor: identity.brandColor ?? "",
    developmentBaseUrl: identity.developmentBaseUrl ?? "",
    testBaseUrl: identity.testBaseUrl ?? "",
    releaseBaseUrl: identity.releaseBaseUrl ?? "",
    logoPath: readStringOption(args, "logo"),
    e2e,
    skipInstall,
    skipGit: readBooleanOption(args, "skip-git")
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
