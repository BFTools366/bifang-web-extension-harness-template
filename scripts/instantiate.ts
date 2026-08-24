import { fileURLToPath } from "node:url"
import path from "node:path"
import { assertKnownOptions, parseArgs } from "../.harness/tooling/args.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"

// 保存 sourceRoot 变量供当前逻辑使用。
const sourceRoot = fileURLToPath(new URL("..", import.meta.url))

// 执行 main 函数的处理逻辑。
async function main(): Promise<void> {
  // 保存 parsed 变量供当前逻辑使用。
  const parsed = parseArgs(process.argv.slice(2))
  assertKnownOptions(parsed, [
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
  ])
  if (parsed.positionals.length !== 1 || parsed.positionals[0] === undefined) {
    throw new Error(
      "Usage: pnpm instantiate -- <empty-target-outside-harness> --type web|extension --name <name> --id <id> --description <description> --development-base-url <url> --test-base-url <url> --release-base-url <https-url> [--e2e enabled|disabled]"
    )
  }

  // 保存 targetRoot 变量供当前逻辑使用。
  const targetRoot = path.resolve(process.cwd(), parsed.positionals[0])
  // 保存 initArgs 变量供当前逻辑使用。
  const initArgs = { ...parsed, positionals: [] }
  // 保存 init 变量供当前逻辑使用。
  const init = await resolveInitOptions(initArgs, targetRoot)
  if (init.logoPath !== undefined) init.logoPath = path.resolve(process.cwd(), init.logoPath)
  // 保存 config 变量供当前逻辑使用。
  const config = await instantiateProject({
    sourceRoot,
    targetRoot,
    init: {
      projectType: init.projectType,
      name: init.name,
      id: init.id,
      description: init.description,
      brandColor: init.brandColor,
      developmentBaseUrl: init.developmentBaseUrl,
      testBaseUrl: init.testBaseUrl,
      releaseBaseUrl: init.releaseBaseUrl,
      logoPath: init.logoPath,
      e2e: init.e2e,
      skipInstall: init.skipInstall,
      skipGit: init.skipGit
    }
  })
  console.log(`Created ${config.projectType} project at ${targetRoot}`)
}

main().catch(
  /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
)
