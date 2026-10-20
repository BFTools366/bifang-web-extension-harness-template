import { readFile } from "node:fs/promises"
import path from "node:path"
import { inspectChineseComments } from "../../.harness/tooling/comment-policy.ts"
import { pathExists, readJson } from "../../.harness/tooling/files.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "../../.harness/tooling/version.ts"
import { validatePnpmBuildPolicy } from "../../.harness/tooling/pnpm-policy.ts"
import { REQUIRED_FILES } from "./contracts.ts"
import {
  containsIdentifier,
  containsStringLiteral,
  directAwaitedCallPosition,
  directFunctionReturnText,
  findFunctionDeclaration,
  hasCommandReturnDispatch,
  hasDirectThrow,
  hasNamedImport,
  hasStringProperty,
  identifierCallPositions,
  noSubstitutionTemplateValue,
  parseTypeScriptSource,
  propertyAccessCallPositions,
  requirePathsContains
} from "./typescript-contracts.ts"

const FORBIDDEN_TEMPLATE_PATHS = [
  "apps",
  "packages",
  ".harness/project.json",
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
  ".env.production",
  ".env.production.local"
] as const

/** 判断文本是否把当次候选 `--e2e` 选择混入初始化入口，而不是策略字段 `--e2e-hint`。 */
function mentionsInstantiationE2eSelection(source: string): boolean {
  return /(?:^|[\s"',]|\[|\])--e2e(?:[=\s"',|]|\[|\]|$)/u.test(source)
}

// 执行 validateToolingContract 函数的处理逻辑。
export async function validateToolingContract(root: string, errors: string[]): Promise<void> {
  const requiredExists = await Promise.all(
    REQUIRED_FILES.map((required) => pathExists(path.join(root, required)))
  )
  REQUIRED_FILES.forEach((required, index) => {
    if (!requiredExists[index]) errors.push(`Missing required file: ${required}`)
  })
  const forbiddenExists = await Promise.all(
    FORBIDDEN_TEMPLATE_PATHS.map((forbidden) => pathExists(path.join(root, forbidden)))
  )
  FORBIDDEN_TEMPLATE_PATHS.forEach((forbidden, index) => {
    if (forbiddenExists[index]) errors.push(`Clean template must not contain ${forbidden}`)
  })

  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if ("workspaces" in manifest) errors.push("Template package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  await validatePnpmBuildPolicy(root, errors)
  const scripts = manifest.scripts as Record<string, unknown> | undefined
  for (const script of ["harness", "instantiate", "validate:harness", "comments:check", "lint"]) {
    if (typeof scripts?.[script] !== "string")
      errors.push(`package.json is missing script ${script}`)
  }
  if (scripts?.["harness:init"] !== undefined) {
    errors.push("Source Harness must not expose the in-place harness:init script")
  }
  if (scripts?.harness !== "tsx .harness/tooling/cli.ts") {
    errors.push("Source Harness script harness must use the governed CLI")
  }
  if (scripts?.instantiate !== "tsx scripts/instantiate.ts") {
    errors.push("Source Harness script instantiate must use the governed downstream creator")
  }
  if (scripts?.["comments:check"] !== "tsx .harness/tooling/comment-policy.ts check") {
    errors.push("Source Harness script comments:check must use the governed comment policy")
  }
  if (scripts?.lint !== "eslint . && pnpm comments:check") {
    errors.push("Source Harness script lint must enforce the governed comment policy")
  }
  const devDependencies = manifest.devDependencies as Record<string, unknown> | undefined
  for (const [dependency, version] of [
    ["typescript", "6.0.3"],
    ["vitest", "5.0.2"],
    ["eslint", "10.11.0"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies?.[dependency], version)) {
      errors.push(`${dependency} minimum must not be lower than ${version}`)
    }
  }
  const cli = await readFile(path.join(root, ".harness/tooling/cli.ts"), "utf8")
  const cliSourceFile = parseTypeScriptSource(cli, ".harness/tooling/cli.ts")
  const usageText = directFunctionReturnText(cliSourceFile, "usage")
  if (usageText === undefined || !usageText.includes("pnpm instantiate")) {
    errors.push("Harness CLI is missing the pnpm instantiate help contract")
  }
  if (mentionsInstantiationE2eSelection(usageText ?? "")) {
    errors.push("Harness initialization help must not accept an E2E selection")
  }
  // 公开创建入口复用 INIT_OPTIONS，参数清单的门禁随清单留在 CLI。
  if (mentionsInstantiationE2eSelection(cli)) {
    errors.push("Harness initialization options must not accept an E2E selection")
  }
  const runBrand = findFunctionDeclaration(cliSourceFile, "runBrand")
  if (
    runBrand === undefined ||
    !containsStringLiteral(runBrand, "refresh") ||
    !containsIdentifier(runBrand, "refreshBrand")
  ) {
    errors.push("Harness CLI is missing the brand refresh command contract")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "init", "rejectInPlaceInitialization", [])) {
    errors.push("Harness CLI must structurally reject the init command")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "brand", "runBrand", ["rest", "root"])) {
    errors.push("Harness CLI is missing the brand command dispatch")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "validate", "runValidate", ["rest", "root"])) {
    errors.push("Harness CLI is missing the validate command dispatch")
  }
  if (containsIdentifier(cliSourceFile, "initializeProject")) {
    errors.push("Harness CLI must not dispatch directly to initializeProject")
  }
  const instantiationEntry = await readFile(path.join(root, "scripts/instantiate.ts"), "utf8")
  if (mentionsInstantiationE2eSelection(instantiationEntry)) {
    errors.push("Public instantiate entry must not accept an E2E selection")
  }
  if (!instantiationEntry.includes("未构建正式产物")) {
    errors.push("Public instantiate entry must report that Release artifacts are deferred")
  }
  const initializer = await readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")
  const initializerSourceFile = parseTypeScriptSource(initializer, ".harness/tooling/init.ts")
  const initializeProject = findFunctionDeclaration(initializerSourceFile, "initializeProject")
  if (
    initializeProject === undefined ||
    !containsIdentifier(initializeProject, "formatInitializationFiles")
  ) {
    errors.push(
      "Harness initializer must format only its generated or rewritten files before validation"
    )
  }
  const postInitialization = findFunctionDeclaration(initializerSourceFile, "runPostInitialization")
  if (
    postInitialization === undefined ||
    !containsStringLiteral(postInitialization, "pnpm") ||
    !containsStringLiteral(postInitialization, "install") ||
    !containsStringLiteral(postInitialization, "--no-frozen-lockfile") ||
    !containsStringLiteral(postInitialization, "--prefer-offline") ||
    !containsStringLiteral(postInitialization, "git") ||
    !containsStringLiteral(postInitialization, "init")
  ) {
    errors.push("Harness initializer is missing the single install and Git initialization contract")
  }
  if (
    postInitialization !== undefined &&
    (containsStringLiteral(postInitialization, "format") ||
      containsStringLiteral(postInitialization, "build"))
  ) {
    errors.push("Harness initializer must not run format or build commands after installation")
  }
  const initializationCalls = [
    {
      callee: "assertDownstreamInitializationRoot",
      args: ["root"],
      contract: "await assertDownstreamInitializationRoot(root)"
    },
    {
      callee: "validateProject",
      args: ["root"],
      contract: "await validateProject(root)"
    },
    {
      callee: "runPostInitialization",
      args: ["resolvedOptions", "commandRunner"],
      contract: "await runPostInitialization(resolvedOptions, commandRunner)"
    }
  ] as const
  const initializationPositions = initializationCalls.map(
    /* 提取初始化函数中顶层 await 调用的位置。 */ ({ callee, args }) =>
      directAwaitedCallPosition(initializeProject, initializerSourceFile, callee, args)
  )
  initializationCalls.forEach(
    /* 报告任何被删除或仅留在注释中的初始化门禁。 */ ({ contract }, index) => {
      if (initializationPositions[index] === undefined) {
        errors.push(`Harness initializer is missing ${contract} downstream-only gate`)
      }
    }
  )
  if (
    initializationPositions.every(
      /* 确认全部关键调用都已解析到真实位置。 */ (position) => position !== undefined
    ) &&
    !initializationPositions.every(
      /* 确认根门禁、校验与后置命令保持安全顺序。 */ (position, index, positions) =>
        index === 0 || (positions[index - 1] as number) < (position as number)
    )
  ) {
    errors.push("Harness initializer must await root gate, validation, and post checks in order")
  }
  const downstreamRootGate = findFunctionDeclaration(
    initializerSourceFile,
    "assertDownstreamInitializationRoot"
  )
  if (
    downstreamRootGate === undefined ||
    !containsIdentifier(downstreamRootGate, "SOURCE_HARNESS_ROOT") ||
    !containsIdentifier(downstreamRootGate, "rejectInPlaceInitialization") ||
    !hasDirectThrow(initializerSourceFile, "rejectInPlaceInitialization")
  ) {
    errors.push("Harness initializer is missing its executable source-root rejection contract")
  }
  const finalizer = await readFile(path.join(root, ".harness/tooling/finalize.ts"), "utf8")
  const finalizerSourceFile = parseTypeScriptSource(finalizer, ".harness/tooling/finalize.ts")
  if (
    propertyAccessCallPositions(finalizerSourceFile, finalizerSourceFile, "JSON", "stringify", [
      "HARNESS_ONLY_PATHS"
    ]).length === 0
  ) {
    errors.push("Downstream config must retain the source-only path tombstones for validation")
  }
  const terminalBrand = noSubstitutionTemplateValue(finalizerSourceFile, "TERMINAL_BRAND")
  const terminalBrandSourceFile =
    terminalBrand === undefined
      ? undefined
      : parseTypeScriptSource(terminalBrand, ".harness/tooling/terminal-brand.ts")
  if (terminalBrandSourceFile === undefined || terminalBrand === undefined) {
    errors.push("Downstream brand template must remain valid TypeScript")
  } else {
    const terminalBrandComments = inspectChineseComments(terminalBrand, ".harness/tooling/brand.ts")
    if (terminalBrandComments.errors.length > 0 || terminalBrandComments.violations.length > 0) {
      errors.push("Downstream brand template must contain static Chinese structure comments")
    }
  }
  const manifestTooling = await readFile(path.join(root, ".harness/tooling/manifest.ts"), "utf8")
  const manifestToolingSourceFile = parseTypeScriptSource(
    manifestTooling,
    ".harness/tooling/manifest.ts"
  )
  const commonScripts = findFunctionDeclaration(manifestToolingSourceFile, "commonScripts")
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "comments:check",
      "tsx .harness/tooling/comment-policy.ts check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing comments:check")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "source-size:check",
      "tsx .harness/tooling/source-size-policy.ts check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing source-size:check")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "lint",
      "eslint . && pnpm comments:check && pnpm source-size:check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing lint")
  }
  if (commonScripts === undefined || !hasStringProperty(commonScripts, "test", "vitest run")) {
    errors.push("Downstream manifest tooling is missing the full test script")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(commonScripts, "test:related", "vitest related --run")
  ) {
    errors.push("Downstream manifest tooling is missing test:related")
  }
  const buildProjectManifest = findFunctionDeclaration(
    manifestToolingSourceFile,
    "buildProjectManifest"
  )
  if (
    buildProjectManifest === undefined ||
    containsStringLiteral(buildProjectManifest, "build:development") ||
    containsStringLiteral(buildProjectManifest, "build:test")
  ) {
    errors.push("Downstream manifest tooling must not generate non-Release build scripts")
  }
  // 遍历终端产物脚本并锁定唯一 Release 构建链。
  for (const [name, value] of [
    ["build", "pnpm build:release"],
    ["build:release", "tsx .harness/tooling/build.ts build"],
    ["package", "tsx .harness/tooling/build.ts package"]
  ] as const) {
    if (
      buildProjectManifest === undefined ||
      !hasStringProperty(buildProjectManifest, name, value)
    ) {
      errors.push(`Downstream manifest tooling is missing governed ${name}`)
    }
  }
  const downstreamValidator = await readFile(
    path.join(root, ".harness/tooling/validate.ts"),
    "utf8"
  )
  const downstreamValidatorSourceFile = parseTypeScriptSource(
    downstreamValidator,
    ".harness/tooling/validate.ts"
  )
  const validateProject = findFunctionDeclaration(downstreamValidatorSourceFile, "validateProject")
  /** 保存按职责拆分后的共享构建脚本验证源。 */
  const helperSourceFile = parseTypeScriptSource(
    await readFile(path.join(root, ".harness/tooling/validate-helpers.ts"), "utf8"),
    ".harness/tooling/validate-helpers.ts"
  )
  const assertReleaseOnlyBuildScripts = findFunctionDeclaration(
    helperSourceFile,
    "assertReleaseOnlyBuildScripts"
  )
  if (
    !hasNamedImport(
      downstreamValidatorSourceFile,
      "./comment-policy.ts",
      "inspectProjectChineseComments"
    )
  ) {
    errors.push("Downstream validator is missing the comment policy import")
  }
  if (
    validateProject === undefined ||
    !requirePathsContains(validateProject, ".harness/tooling/comment-policy.ts")
  ) {
    errors.push("Downstream validator is missing .harness/tooling/comment-policy.ts")
  }
  if (
    validateProject === undefined ||
    !requirePathsContains(validateProject, ".harness/tooling/source-size-policy.ts")
  ) {
    errors.push("Downstream validator is missing .harness/tooling/source-size-policy.ts")
  }
  if (
    validateProject === undefined ||
    identifierCallPositions(
      validateProject,
      downstreamValidatorSourceFile,
      "inspectProjectChineseComments",
      ["root"]
    ).length === 0
  ) {
    errors.push("Downstream validator is missing inspectProjectChineseComments(root)")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "comments:check",
      "tsx .harness/tooling/comment-policy.ts check"
    )
  ) {
    errors.push("Downstream validator is missing comments:check")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "source-size:check",
      "tsx .harness/tooling/source-size-policy.ts check"
    )
  ) {
    errors.push("Downstream validator is missing source-size:check")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "lint",
      "eslint . && pnpm comments:check && pnpm source-size:check"
    )
  ) {
    errors.push("Downstream validator is missing lint")
  }
  if (
    assertReleaseOnlyBuildScripts === undefined ||
    !hasNamedImport(
      downstreamValidatorSourceFile,
      "./validate-helpers.ts",
      "assertReleaseOnlyBuildScripts"
    ) ||
    validateProject === undefined ||
    identifierCallPositions(
      validateProject,
      downstreamValidatorSourceFile,
      "assertReleaseOnlyBuildScripts",
      ["scripts", "errors"]
    ).length === 0
  ) {
    errors.push("Downstream validator is missing the Release-only build-script gate")
  }
}

// 执行 validateHarness 函数的处理逻辑。
