import { readFile } from "node:fs/promises"
import path from "node:path"
import { inspectChineseComments } from "../../.harness/tooling/comment-policy.ts"
import { pathExists, readJson } from "../../.harness/tooling/files.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "../../.harness/tooling/version.ts"
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

// 保存 FORBIDDEN_TEMPLATE_PATHS 变量供当前逻辑使用。
const FORBIDDEN_TEMPLATE_PATHS = [
  "pnpm-workspace.yaml",
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

// 执行 validateToolingContract 函数的处理逻辑。
export async function validateToolingContract(root: string, errors: string[]): Promise<void> {
  // 保存 requiredExists 变量供当前逻辑使用。
  const requiredExists = await Promise.all(
    REQUIRED_FILES.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (required) => pathExists(path.join(root, required))
    )
  )
  REQUIRED_FILES.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (required, index) => {
      if (!requiredExists[index]) errors.push(`Missing required file: ${required}`)
    }
  )
  // 保存 forbiddenExists 变量供当前逻辑使用。
  const forbiddenExists = await Promise.all(
    FORBIDDEN_TEMPLATE_PATHS.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (forbidden) => pathExists(path.join(root, forbidden))
    )
  )
  FORBIDDEN_TEMPLATE_PATHS.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (forbidden, index) => {
      if (forbiddenExists[index]) errors.push(`Clean template must not contain ${forbidden}`)
    }
  )

  // 保存 manifest 变量供当前逻辑使用。
  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if ("workspaces" in manifest) errors.push("Template package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = manifest.scripts as Record<string, unknown> | undefined
  // 保存 script 变量供当前逻辑使用。
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
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies = manifest.devDependencies as Record<string, unknown> | undefined
  // 保存 [dependency, version] 变量供当前逻辑使用。
  for (const [dependency, version] of [
    ["typescript", "6.0.3"],
    ["vitest", "4.1.10"],
    ["eslint", "10.8.1"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies?.[dependency], version)) {
      errors.push(`${dependency} minimum must not be lower than ${version}`)
    }
  }
  // 保存 cli 变量供当前逻辑使用。
  const cli = await readFile(path.join(root, ".harness/tooling/cli.ts"), "utf8")
  // 保存 cliSourceFile 变量供当前逻辑使用。
  const cliSourceFile = parseTypeScriptSource(cli, ".harness/tooling/cli.ts")
  // 保存 usageText 变量供当前逻辑使用。
  const usageText = directFunctionReturnText(cliSourceFile, "usage")
  if (usageText === undefined || !usageText.includes("pnpm instantiate")) {
    errors.push("Harness CLI is missing the pnpm instantiate help contract")
  }
  if (usageText?.includes("--e2e") === true) {
    errors.push("Harness initialization help must not accept an E2E selection")
  }
  // 保存 runBrand 变量供当前逻辑使用。
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
  // 保存 instantiationEntry 变量供公开创建入口契约校验使用。
  const instantiationEntry = await readFile(path.join(root, "scripts/instantiate.ts"), "utf8")
  if (instantiationEntry.includes("--e2e")) {
    errors.push("Public instantiate entry must not accept an E2E selection")
  }
  if (!instantiationEntry.includes("Release artifacts were not built")) {
    errors.push("Public instantiate entry must report that Release artifacts are deferred")
  }
  // 保存 initializer 变量供当前逻辑使用。
  const initializer = await readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")
  // 保存 initializerSourceFile 变量供当前逻辑使用。
  const initializerSourceFile = parseTypeScriptSource(initializer, ".harness/tooling/init.ts")
  // 保存 initializeProject 变量供当前逻辑使用。
  const initializeProject = findFunctionDeclaration(initializerSourceFile, "initializeProject")
  if (
    initializeProject === undefined ||
    !containsIdentifier(initializeProject, "formatInitializationFiles")
  ) {
    errors.push(
      "Harness initializer must format only its generated or rewritten files before validation"
    )
  }
  // 保存 postInitialization 变量供创建期外部命令契约校验使用。
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
  // 保存 initializationCalls 变量供当前逻辑使用。
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
  // 保存 initializationPositions 变量供当前逻辑使用。
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
  // 保存 downstreamRootGate 变量供当前逻辑使用。
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
  // 保存 finalizer 变量供当前逻辑使用。
  const finalizer = await readFile(path.join(root, ".harness/tooling/finalize.ts"), "utf8")
  // 保存 finalizerSourceFile 变量供当前逻辑使用。
  const finalizerSourceFile = parseTypeScriptSource(finalizer, ".harness/tooling/finalize.ts")
  if (
    propertyAccessCallPositions(finalizerSourceFile, finalizerSourceFile, "JSON", "stringify", [
      "HARNESS_ONLY_PATHS"
    ]).length === 0
  ) {
    errors.push("Downstream config must retain the source-only path tombstones for validation")
  }
  // 保存 terminalBrand 变量供当前逻辑使用。
  const terminalBrand = noSubstitutionTemplateValue(finalizerSourceFile, "TERMINAL_BRAND")
  // 保存 terminalBrandSourceFile 变量供当前逻辑使用。
  const terminalBrandSourceFile =
    terminalBrand === undefined
      ? undefined
      : parseTypeScriptSource(terminalBrand, ".harness/tooling/terminal-brand.ts")
  if (terminalBrandSourceFile === undefined || terminalBrand === undefined) {
    errors.push("Downstream brand template must remain valid TypeScript")
  } else {
    // 保存 terminalBrandComments 变量供静态模板注释门禁使用。
    const terminalBrandComments = inspectChineseComments(terminalBrand, ".harness/tooling/brand.ts")
    if (terminalBrandComments.errors.length > 0 || terminalBrandComments.violations.length > 0) {
      errors.push("Downstream brand template must contain static Chinese structure comments")
    }
  }
  // 保存 manifestTooling 变量供当前逻辑使用。
  const manifestTooling = await readFile(path.join(root, ".harness/tooling/manifest.ts"), "utf8")
  // 保存 manifestToolingSourceFile 变量供当前逻辑使用。
  const manifestToolingSourceFile = parseTypeScriptSource(
    manifestTooling,
    ".harness/tooling/manifest.ts"
  )
  // 保存 commonScripts 变量供当前逻辑使用。
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
  // 保存 buildProjectManifest 变量供当前逻辑使用。
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
  // 保存 downstreamValidator 变量供当前逻辑使用。
  const downstreamValidator = await readFile(
    path.join(root, ".harness/tooling/validate.ts"),
    "utf8"
  )
  // 保存 downstreamValidatorSourceFile 变量供当前逻辑使用。
  const downstreamValidatorSourceFile = parseTypeScriptSource(
    downstreamValidator,
    ".harness/tooling/validate.ts"
  )
  // 保存 validateProject 变量供当前逻辑使用。
  const validateProject = findFunctionDeclaration(downstreamValidatorSourceFile, "validateProject")
  // 保存 assertReleaseOnlyBuildScripts 变量供当前逻辑使用。
  const assertReleaseOnlyBuildScripts = findFunctionDeclaration(
    downstreamValidatorSourceFile,
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
