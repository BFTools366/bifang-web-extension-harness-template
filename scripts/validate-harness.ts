import { validateGoAssets } from "./harness-validation/go-assets.ts"
import path from "node:path"
import { readCapabilityCatalog } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"
import { pathToFileURL } from "node:url"
import { inspectProjectChineseComments } from "../.harness/tooling/comment-policy.ts"
import type { HarnessValidationReport } from "./harness-validation/contracts.ts"
import { validateNodeTooling } from "./harness-validation/node-tooling.ts"
import { validateRepositoryLineLimits } from "./harness-validation/line-limits.ts"
import { validateDailyHarnessMemory } from "./harness-validation/memory.ts"
import { validateSourceAgentPolicy } from "./harness-validation/governance-policy.ts"
import { validateAgentsEntrypoint } from "./harness-validation/agents-entrypoint.ts"
import {
  collectFiles,
  governedMarkdownFiles,
  validateRepositoryPaths,
  validateContent,
  validateEventDrivenWorkflow,
  validateListViewSkillContracts,
  validateMarkdownLinks,
  validateSkills
} from "./harness-validation/repository.ts"
import { validateToolingContract } from "./harness-validation/tooling.ts"
import { validateHarnessVersion } from "./harness-validation/version.ts"
import { validateUpgradeOwnership } from "./harness-validation/upgrade-ownership.ts"
import { loadDesignSkillBundle } from "../.harness/tooling/install-design-skill.ts"

/** 执行完整源 Harness 验证并返回稳定统计。 */
export async function validateHarness(rootInput: string): Promise<HarnessValidationReport> {
  const root = path.resolve(rootInput)
  const errors: string[] = []
  const files = await collectFiles(root)
  validateRepositoryPaths(files, errors)
  await validateNodeTooling(root, files, errors)
  const markdownFiles = governedMarkdownFiles(files)
  const skills = await validateSkills(root, errors)
  try {
    await loadDesignSkillBundle(root)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  try {
    readCapabilityCatalog(path.join(root, ".agents/skills/web-compose-capabilities"))
  } catch (error) {
    errors.push(`Capability library: ${error instanceof Error ? error.message : String(error)}`)
  }
  await validateListViewSkillContracts(root, errors)
  await validateAgentsEntrypoint(root, errors)
  await validateEventDrivenWorkflow(root, errors)
  await validateSourceAgentPolicy(root, errors)
  await validateDailyHarnessMemory(root, errors)
  await validateContent(root, markdownFiles, errors)
  const markdownLinks = await validateMarkdownLinks(root, markdownFiles, errors)
  await validateToolingContract(root, errors)
  await validateUpgradeOwnership(root, errors)
  await validateGoAssets(root, errors)
  await validateHarnessVersion(root, errors)
  await validateRepositoryLineLimits(root, files, errors)
  const commentReport = await inspectProjectChineseComments(root)
  errors.push(
    ...commentReport.errors,
    ...commentReport.violations.map(
      (violation) =>
        `${violation.file}:${violation.line}:${violation.column} ${violation.kind} ${violation.name}: ${violation.message}`
    )
  )
  if (errors.length > 0) throw new Error(`Harness 校验失败：\n- ${errors.join("\n- ")}`)
  return { files: files.length, skills, markdownLinks }
}

const executed =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  validateHarness(process.cwd())
    .then((report) => {
      console.log(
        `Harness 校验通过（${report.skills.length} 个 Skills，${report.markdownLinks} 个本地链接）`
      )
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
