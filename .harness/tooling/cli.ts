import { pathToFileURL } from "node:url"
import path from "node:path"
import { assertKnownOptions, parseArgs, readBooleanOption, readStringOption } from "./args.ts"
import { refreshBrand } from "./brand.ts"
import { assertProjectType } from "./config.ts"
import { rejectInPlaceInitialization } from "./init.ts"
import { isInteractiveTerminal, promptForIdentity } from "./prompts.ts"
import type { InitOptions, ParsedArgs } from "./types.ts"
import { validateProject } from "./validate.ts"

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
  "skip-install",
  "skip-git"
] as const

function usage(): string {
  return `Bifang Web Harness

Project creation (the target must be outside this Harness repository):
  pnpm instantiate -- <absolute-target> --type web|extension --name <name> --id <id> \\
    --description <description> --development-base-url <url> \\
    --test-base-url <url> --release-base-url <https-url> \\
    [--brand-color <#RRGGBB>] [--logo <path>]

Maintenance commands:
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate

In-place initialization is forbidden. Project creation requires exactly one type.
Use --skip-install and --skip-git only in controlled automation.
`
}

export async function resolveInitOptions(args: ParsedArgs, root: string): Promise<InitOptions> {
  assertKnownOptions(args, INIT_OPTIONS)
  const interactive = isInteractiveTerminal()
  const suppliedBrandColor = readStringOption(args, "brand-color")
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
  const required = [
    ["--type", supplied.projectType],
    ["--name", supplied.name],
    ["--id", supplied.id],
    ["--description", supplied.description],
    ["--development-base-url", supplied.developmentBaseUrl],
    ["--test-base-url", supplied.testBaseUrl],
    ["--release-base-url", supplied.releaseBaseUrl]
  ] as const
  const missing = required.filter(([, value]) => value === undefined).map(([flag]) => flag)

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
    skipInstall: readBooleanOption(args, "skip-install"),
    skipGit: readBooleanOption(args, "skip-git")
  }
}

async function runBrand(argv: string[], root: string): Promise<void> {
  const args = parseArgs(argv)
  assertKnownOptions(args, ["logo", "brand-color"])
  if (args.positionals.length !== 1 || args.positionals[0] !== "refresh") {
    throw new Error("Usage: pnpm harness brand refresh [--logo <path>] [--brand-color <color>]")
  }
  const config = await refreshBrand(root, {
    logoPath: readStringOption(args, "logo"),
    brandColor: readStringOption(args, "brand-color")
  })
  console.log(`Refreshed brand assets for ${config.name}`)
}

async function runValidate(argv: string[], root: string): Promise<void> {
  const args = parseArgs(argv)
  assertKnownOptions(args, [])
  if (args.positionals.length > 0) throw new Error("validate does not accept positional arguments")
  const checked = await validateProject(root)
  console.log(`Project validation passed (${checked.join(", ")})`)
}

export async function runCli(argv = process.argv.slice(2), root = process.cwd()): Promise<void> {
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

const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
