import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { format, resolveConfig } from "prettier"
import sharp from "sharp"
import { afterEach, expect } from "vitest"
import { parseArgs } from "../.harness/tooling/args.ts"
import { refreshBrand } from "../.harness/tooling/brand.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import {
  HARNESS_ONLY_PATHS,
  INSTANTIATION_ONLY_EXCLUDED_PATHS
} from "../.harness/tooling/config.ts"
import { profileFromArgs, validateEnvironmentFiles } from "../.harness/tooling/environment.ts"
import { initializeProject, runPostInitialization } from "../.harness/tooling/init.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { inspectReleaseArtifact } from "../.harness/tooling/release.ts"
import { downstreamGovernanceFiles } from "../.harness/tooling/templates/downstream-docs.ts"
import type { InitOptions, ProjectConfig } from "../.harness/tooling/types.ts"
import { validateProject } from "../.harness/tooling/validate.ts"

// 保存 temporaryRoots 变量供当前逻辑使用。
const temporaryRoots: string[] = []
// 保存 repositoryRoot 变量供当前逻辑使用。
const repositoryRoot = path.resolve(import.meta.dirname, "..")
// 保存 TEST_BASE_URLS 变量供当前逻辑使用。
const TEST_BASE_URLS = {
  developmentBaseUrl: "http://localhost:3000/api",
  testBaseUrl: "https://test-api.example.com/v1",
  releaseBaseUrl: "https://api.example.com/v1"
} as const
/** 保存测试初始化共享的已决 Agent policy。 */
const TEST_AGENT_POLICY = {
  confirmedBy: "test-owner",
  confirmedAt: "2026-09-09T00:00:00.000Z",
  superpowers: "disabled",
  userOwnedTasks: "disabled",
  parallelWorktreeSubagents: "enabled",
  acceptanceSmoke: "enabled",
  e2eHint: "disabled"
} as const
// 保存 OPTIONAL_INTEGRATION_PACKAGES 变量供当前逻辑使用。
const OPTIONAL_INTEGRATION_PACKAGES = [
  "axios",
  "openapi-fetch",
  "openapi-typescript",
  "graphql",
  "graphql-request",
  "@graphql-codegen/cli",
  "@graphql-codegen/client-preset",
  "@apollo/client",
  "eventsource-client",
  "@microsoft/fetch-event-source",
  "rxjs"
] as const
// 保存 PAGINATION_I18N_KEYS 变量供当前逻辑使用。
const PAGINATION_I18N_KEYS = [
  "paginationNavigation",
  "paginationPage",
  "paginationPrevious",
  "paginationNext",
  "paginationPageSize"
] as const

// 执行 expectOptionalIntegrationPackagesNotInstalled 函数的处理逻辑。
function expectOptionalIntegrationPackagesNotInstalled(manifest: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): void {
  // 保存 installed 变量供当前逻辑使用。
  const installed = { ...manifest.dependencies, ...manifest.devDependencies }
  // 保存 dependency 变量供当前逻辑使用。
  for (const dependency of OPTIONAL_INTEGRATION_PACKAGES) {
    expect(installed).not.toHaveProperty(dependency)
  }
}

// 执行 temporaryDirectory 函数的处理逻辑。
async function temporaryDirectory(prefix: string): Promise<string> {
  // 保存 directory 变量供当前逻辑使用。
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(directory)
  return directory
}

// 执行 seedTemplateRoot 函数的处理逻辑。
async function seedTemplateRoot(): Promise<string> {
  // 保存 root 变量供当前逻辑使用。
  const root = await temporaryDirectory("web-harness-test-")
  await mkdir(path.join(root, "docs"))
  await mkdir(path.join(root, "tests"))
  await mkdir(path.join(root, ".harness/tooling"), { recursive: true })
  await cp(path.join(repositoryRoot, ".agents"), path.join(root, ".agents"), {
    recursive: true
  })
  await cp(path.join(repositoryRoot, ".harness/vendor"), path.join(root, ".harness/vendor"), {
    recursive: true
  })
  await cp(
    path.join(repositoryRoot, ".harness/tooling/design-skill.ts"),
    path.join(root, ".harness/tooling/design-skill.ts")
  )
  await writeFile(
    path.join(root, ".gitignore"),
    await readFile(path.join(repositoryRoot, ".gitignore"), "utf8")
  )
  await writeFile(
    path.join(root, "docs/DATA_ACCESS.md"),
    await readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8")
  )
  await writeFile(
    path.join(root, "docs/MANTINE_UI_GUIDELINES.md"),
    await readFile(path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"), "utf8")
  )
  await writeFile(
    path.join(root, "docs/AGENT_POLICY.md"),
    await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
  )
  for (const module of [
    "identity.ts",
    "extension-targets.ts",
    "files.ts",
    "logo.ts",
    "validate-brand.ts",
    "validate-hosts.ts",
    "validate-helpers.ts"
  ]) {
    await cp(
      path.join(repositoryRoot, ".harness/tooling", module),
      path.join(root, ".harness/tooling", module)
    )
  }
  await writeFile(
    path.join(root, ".harness/tooling/version.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/version.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/environment.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/environment.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/release.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/release.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/skill-validation.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/skill-validation.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/comment-policy.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/comment-policy.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/agent-policy.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/agent-policy.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/source-size-policy.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/source-size-policy.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/project-memory.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/project-memory.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/pnpm-policy.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/pnpm-policy.ts"), "utf8")
  )
  await writeFile(
    path.join(root, "tests/source-size-policy.test.ts"),
    await readFile(path.join(repositoryRoot, "tests/source-size-policy.test.ts"), "utf8")
  )
  await writeFile(
    path.join(root, "package.json"),
    await readFile(path.join(repositoryRoot, "package.json"), "utf8")
  )
  await writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    await readFile(path.join(repositoryRoot, "pnpm-workspace.yaml"), "utf8")
  )
  await writeFile(
    path.join(root, "tsconfig.json"),
    await readFile(path.join(repositoryRoot, "tsconfig.json"), "utf8")
  )
  await writeFile(
    path.join(root, "LICENSE.en.md"),
    "Applicable Project Name: Bifang Web Harness Template. Preserve everything else.\n"
  )
  await writeFile(
    path.join(root, "LICENSE.zh-CN.md"),
    "适用项目名称：Bifang Web Harness Template。保留其余内容。\n"
  )
  return root
}

// 执行 options 函数的处理逻辑。
function options(root: string, projectType: "web" | "extension"): InitOptions {
  return {
    root,
    projectType,
    name: projectType === "web" ? "Aurora Notes" : "Aurora Clipper",
    id: projectType === "web" ? "aurora-notes" : "aurora-clipper",
    description: projectType === "web" ? "A focused notes workspace." : "Clip useful pages.",
    brandColor: "#5B5BD6",
    agentPolicy: TEST_AGENT_POLICY,
    ...TEST_BASE_URLS,
    skipInstall: true,
    skipGit: true
  }
}

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)

export {
  HARNESS_ONLY_PATHS,
  INSTANTIATION_ONLY_EXCLUDED_PATHS,
  PAGINATION_I18N_KEYS,
  TEST_AGENT_POLICY,
  TEST_BASE_URLS,
  cp,
  downstreamGovernanceFiles,
  expect,
  expectOptionalIntegrationPackagesNotInstalled,
  format,
  initializeProject,
  inspectReleaseArtifact,
  instantiateProject,
  mkdir,
  options,
  os,
  parseArgs,
  path,
  profileFromArgs,
  readFile,
  readdir,
  refreshBrand,
  repositoryRoot,
  resolveConfig,
  resolveInitOptions,
  rm,
  runPostInitialization,
  seedTemplateRoot,
  sharp,
  temporaryDirectory,
  validateEnvironmentFiles,
  validateProject,
  writeFile
}
export type { InitOptions, ProjectConfig }
