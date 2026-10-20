import { readFile } from "node:fs/promises"
import path from "node:path"
import { validateOwnershipManifest } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { ownershipPatternsOverlap } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-glob.ts"
import type {
  OwnershipManifest,
  OwnershipMode
} from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-types.ts"

/** 独立锚定升级所有权下限，避免运行时规则与清单同时弱化时绕过源门禁。 */
export const REQUIRED_UPGRADE_RULES: Readonly<Record<string, OwnershipMode>> = {
  ".agents/skills/go-test-service/**": "managed",
  ".harness/tooling/workspace-context.ts": "managed",
  ".harness/tooling/workspace-http.ts": "tombstone",
  "tests/application-test-adapters.ts": "tombstone",
  "tests/fixtures/application-api/**": "tombstone",
  ".agents/skills/workspace-implement-audit/**": "managed",
  ".agents/skills/go-implement-external-command/**": "managed",
  ".agents/skills/go-implement-file-operations/**": "managed",
  ".agents/skills/workspace-implement-wallet/**": "managed",
  ".agents/skills/workspace-implement-feature/**": "managed",
  ".agents/skills/go-implement-persistence/**": "managed",
  ".agents/skills/workspace-implement-users/**": "managed",
  ".agents/skills/workspace-implement-organizations/**": "managed",
  ".agents/skills/workspace-implement-orders/**": "managed",
  ".agents/skills/workspace-implement-permissions/**": "managed",
  ".agents/skills/go-implement-graphql/**": "managed",
  ".agents/skills/workspace-implement-catalog/**": "managed",
  ".agents/skills/go-implement-service/**": "managed",
  ".agents/skills/go-build-local/**": "managed",
  ".agents/skills/go-implement-verification/**": "managed",
  ".harness/tooling/workspace-skills.ts": "managed",
  "docs/WORKSPACE_TEMPLATE.md": "managed",
  "docs/GO_SERVICE.md": "managed",
  "docs/GO_CLIENT_CONTRACT.md": "managed",
  "tests/go-identity-contract.test.ts": "tombstone",
  "tests/go-identity-support.ts": "tombstone",
  "tests/fixtures/go-identity.test.ts.txt": "tombstone",
  ".harness/workspace.json": "protected",
  ".harness/tooling/workspace.ts": "tombstone",
  ".harness/tooling/workspace-selection.ts": "tombstone",
  ".harness/tooling/workspace-documents.ts": "tombstone",
  ".harness/tooling/workspace-server.ts": "tombstone",
  ".harness/runtime/**": "tombstone",
  "tests/workspace.test.ts": "tombstone",
  "tests/workspace-runtime.test.ts": "tombstone",
  "tests/workspace-server.test.ts": "tombstone",
  "tests/creation-api-contract.test.ts": "tombstone",

  ".agents/skills/design-taste-frontend/**": "protected",
  ".harness/tooling/design-skill.ts": "managed",
  ".harness/tooling/install-design-skill.ts": "tombstone",
  ".harness/vendor/design-taste-frontend/**": "tombstone",
  "tests/design-skill-installation.test.ts": "tombstone",
  ".agents/skills/web-check-development-environment/**": "managed",
  ".agents/skills/web-configure-git-commits/**": "managed",
  ".agents/skills/web-connect-http-service/**": "managed",
  ".agents/skills/web-implement-auth-session/**": "managed",
  ".agents/skills/web-implement-access-control/**": "managed",
  ".agents/skills/web-implement-browser-storage/**": "managed",
  ".agents/skills/web-implement-event-stream/**": "managed",
  ".agents/skills/web-implement-write-recovery/**": "managed",
  ".agents/skills/web-manage-user-tasks/**": "managed",
  ".agents/skills/web-review-api-contract/**": "managed",
  ".agents/skills/web-review-module-boundaries/**": "managed",
  ".agents/skills/web-audit-worktrees/**": "managed",
  ".agents/skills/web-preview-harness-upgrade/**": "managed",
  ".agents/skills/web-review-extension-compatibility/**": "conditional",
  ".agents/skills/web-define-product/**": "managed",
  ".agents/skills/web-design-prototype/**": "managed",
  ".agents/skills/web-compose-capabilities/**": "managed",
  ".agents/skills/web-document-api/**": "managed",
  ".agents/skills/web-extract-i18n-strings/**": "managed",
  ".agents/skills/web-implement-change/**": "managed",
  ".agents/skills/web-implement-list-view/**": "conditional",
  ".agents/skills/web-implement-saas-auth/**": "tombstone",
  ".agents/skills/web-implement-saas-admin/**": "tombstone",
  ".agents/skills/web-implement-saas-commerce/**": "tombstone",
  ".agents/skills/web-plan-change/**": "managed",
  ".agents/skills/web-prepare-brand-identity/**": "managed",
  ".agents/skills/web-prepare-release/**": "managed",
  ".agents/skills/web-refactor-code/**": "managed",
  ".agents/skills/web-run-parallel-worktrees/**": "managed",
  ".agents/skills/web-summarize-development-history/**": "managed",
  ".agents/skills/web-test-final-artifact-e2e/**": "managed",
  ".agents/skills/web-verify-delivery/**": "managed",
  ".agents/skills/web-upgrade-harness/**": "managed-self",
  ".harness/tooling/agent-policy.ts": "managed",
  ".harness/tooling/args.ts": "managed",
  ".harness/tooling/brand.ts": "managed",
  ".harness/tooling/identity.ts": "managed",
  ".harness/tooling/extension-targets.ts": "managed",
  "locales/**": "protected",
  "tests/identity-localization.test.ts": "tombstone",
  "tests/http-foundation.test.ts": "tombstone",
  "tests/harness-http-governance.test.ts": "tombstone",
  ".harness/tooling/build.ts": "managed",
  ".harness/tooling/cli.ts": "managed",
  ".harness/tooling/comment-policy.ts": "managed",
  ".harness/tooling/config.ts": "managed",
  ".harness/tooling/environment.ts": "managed",
  ".harness/tooling/files.ts": "managed",
  ".harness/tooling/logo.ts": "managed",
  ".harness/tooling/project-memory.ts": "managed",
  ".harness/tooling/pnpm-policy.ts": "managed",
  ".harness/tooling/release.ts": "managed",
  ".harness/tooling/skill-validation.ts": "managed",
  ".harness/tooling/source-size-policy.ts": "managed",
  ".harness/tooling/types.ts": "managed",
  ".harness/tooling/validate.ts": "managed",
  ".harness/tooling/validate-http.ts": "managed",
  ".harness/tooling/version.ts": "managed",
  "tests/build-tooling.test.ts": "managed",
  "tests/comment-policy.test.ts": "managed",
  "tests/git-commit-configuration.test.ts": "managed",
  "tests/harness-upgrade.test.ts": "managed",
  "tests/parallel-worktrees.test.ts": "managed",
  "tests/release-inspection.test.ts": "managed",
  "tests/setup.ts": "managed",
  "tests/source-size-policy.test.ts": "managed",
  "tests/version.test.ts": "managed",
  "AGENTS.md": "merge-sections",
  "README.md": "merge-sections",
  "docs/API.md": "merge-sections",
  "docs/DATA_ACCESS.md": "merge-sections",
  "docs/ENGINEERING_RULES.md": "merge-sections",
  "docs/LOGGING.md": "managed",
  "docs/MANTINE_UI_GUIDELINES.md": "merge-sections",
  "docs/RELEASE.md": "merge-sections",
  "docs/RUNTIME_CONFIGURATION.md": "merge-sections",
  "package.json": "merge-sections",
  "pnpm-workspace.yaml": "merge-sections",
  ".prettierignore": "merge-sections",
  ".prettierrc.json": "merge-sections",
  "eslint.config.mjs": "merge-sections",
  "tsconfig.json": "merge-sections",
  "vite.config.ts": "merge-sections",
  "vitest.config.ts": "merge-sections",
  ".env.development": "conditional",
  ".env.test": "conditional",
  ".env.production": "conditional",
  ".harness/project.json": "protected",
  ".harness/initial-creation.json": "protected",
  ".harness/project-memory-compatibility.json": "protected",
  ".harness/release-policy.json": "protected",
  ".harness/brand/**": "protected",
  ".harness/upstream-lock.json": "protected",
  ".gitignore": "protected",
  "pnpm-lock.yaml": "protected",
  "docs/AGENT_POLICY.md": "protected",
  "docs/product_spec/**": "protected",
  "docs/prototypes/**": "protected",
  "docs/api/**": "protected",
  "docs/project_status/**": "protected",
  "docs/work_plan/**": "protected",
  "docs/adr/**": "protected",
  "docs/changelog/**": "protected",
  "docs/TECH_DEBT.md": "protected",
  "docs/VERIFICATION.md": "protected",
  "docs/verification/**": "protected",
  "LICENSE.en.md": "protected",
  "LICENSE.zh-CN.md": "protected",
  "src/**": "protected",
  "public/**": "protected",
  "assets/**": "protected",
  ".agents/skills/initialize-web-project/**": "tombstone",
  ".agents/skills/instantiate-project/**": "tombstone",
  ".agents/skills/web-instantiate-project/**": "tombstone",
  ".agents/skills/web-curate-harness-memory/**": "tombstone",
  ".agents/skills/manage-project-surfaces/**": "tombstone",
  ".harness/tooling/init.ts": "tombstone",
  ".harness/tooling/instantiate.ts": "tombstone",
  ".harness/tooling/manifest.ts": "tombstone",
  ".harness/tooling/process.ts": "tombstone",
  ".harness/tooling/prompts.ts": "tombstone",
  ".harness/tooling/initialization-input.ts": "tombstone",
  ".harness/tooling/initialization-form.ts": "tombstone",
  ".harness/tooling/initialization-target.ts": "tombstone",
  "scripts/initialization-form.ts": "tombstone",
  "tests/initialization-form.test.ts": "tombstone",
  ".harness/tooling/saas-commerce-choice.ts": "tombstone",
  ".harness/tooling/source-snapshot.ts": "tombstone",
  ".harness/tooling/templates/**": "tombstone",
  ".harness/tooling/finalize.ts": "tombstone",
  "scripts/instantiate.ts": "tombstone",
  "scripts/validate-harness.ts": "tombstone",
  "scripts/harness-validation/**": "tombstone",
  "tests/agent-policy.test.ts": "tombstone",
  "tests/extension-runtime.test.ts": "tombstone",
  "tests/harness-agents-entrypoint.test.ts": "tombstone",
  "tests/harness-governance.test.ts": "tombstone",
  "tests/harness-initialization.test.ts": "tombstone",
  "tests/initialization-guidance.test.ts": "tombstone",
  "tests/saas-foundation-guidance.test.ts": "tombstone",
  "tests/web-routing-policy.test.ts": "tombstone",
  "tests/saas-creation.test.ts": "tombstone",
  "tests/capability-assets.test.ts": "tombstone",
  "tests/application-wiring-fixture.ts": "tombstone",
  "tests/application-wiring.test.ts": "tombstone",
  "tests/application-capabilities.test.ts": "tombstone",
  "tests/capability-source-reference.test.ts": "tombstone",
  "tests/application-content.test.ts": "tombstone",
  "tests/application-shell.test.ts": "tombstone",
  "tests/application-settings.test.ts": "tombstone",
  "tests/application-organization.test.ts": "tombstone",
  "tests/application-management.test.ts": "tombstone",
  "tests/application-readonly.test.ts": "tombstone",
  "tests/harness-instantiation.test.ts": "tombstone",
  "tests/harness-memory.test.ts": "tombstone",
  "tests/harness-ownership-validation.test.ts": "tombstone",
  "tests/harness-tooling-support.ts": "tombstone",
  "tests/harness-tooling.test.ts": "tombstone",
  "tests/harness-validator.test.ts": "tombstone",
  "tests/initialization-atomicity.test.ts": "tombstone",
  "tests/line-limits.test.ts": "tombstone",
  "docs/HARNESS_ENGINEERING.md": "tombstone",
  "docs/harness_engineering/**": "tombstone",
  "docs/TS_WEB_TEMPLATE.md": "tombstone",
  "Version.md": "tombstone",
  ".harness/tooling/instantiate-target.ts": "tombstone",
  "tests/harness-project-validation.test.ts": "tombstone",
  "tests/harness-terminal-governance.test.ts": "tombstone",
  "tests/harness-initialization-web.test.ts": "tombstone",
  "tests/harness-initialization-extension.test.ts": "tombstone",
  "tests/harness-instantiation-fixture.ts": "tombstone",
  "tests/harness-instantiation-terminal.test.ts": "tombstone",
  "tests/harness-validator-fixture.ts": "tombstone",
  "tests/harness-skill-validation.test.ts": "tombstone",
  "tests/harness-saas-commerce-reference.test.ts": "tombstone",
  "tests/project-memory-compatibility.test.ts": "tombstone",
  "tests/initialization-atomicity-fixture.ts": "tombstone",
  "tests/initialization-source-boundary.test.ts": "tombstone",
  ".harness/tooling/creation-requirements.ts": "tombstone",
  "tests/creation-requirements.test.ts": "tombstone",
  "tests/path-containment.test.ts": "tombstone",
  "tests/node-tooling.test.ts": "tombstone",
  "tests/prototype-workflow.test.ts": "tombstone",
  "tests/harness-api-document-export.test.ts": "tombstone",
  ".harness/tooling/validate-helpers.ts": "managed",
  ".harness/tooling/validate-brand.ts": "managed",
  ".harness/tooling/validate-hosts.ts": "managed",
  "tests/harness-upgrade-fixture.ts": "managed",
  "tests/harness-upgrade-ownership.test.ts": "managed",
  "tests/harness-upgrade-cli.test.ts": "managed",
  "tests/parallel-worktree-fixture.ts": "managed",
  "tests/parallel-worktree-recovery.test.ts": "managed"
}

/** 独立锚定必须保留 required=true 的合并规则。 */
export const REQUIRED_UPGRADE_REQUIRED_PATTERNS = new Set([
  "AGENTS.md",
  "README.md",
  "package.json"
])

/** 校验生产升级器以外的所有权下限与前置遮蔽。 */
function validateIndependentOwnershipBoundary(manifest: OwnershipManifest): void {
  const observed = new Map(manifest.rules.map((rule) => [rule.pattern, rule]))
  for (const rule of manifest.rules) {
    if (!(rule.pattern in REQUIRED_UPGRADE_RULES)) {
      throw new Error(`Independent ownership rule is not anchored: ${rule.pattern}`)
    }
  }
  for (const [pattern, mode] of Object.entries(REQUIRED_UPGRADE_RULES)) {
    if (observed.get(pattern)?.mode !== mode) {
      throw new Error(`Independent ownership rule weakened: ${pattern} must be ${mode}`)
    }
    const ruleIndex = manifest.rules.findIndex((rule) => rule.pattern === pattern)
    const shadowingRule = manifest.rules
      .slice(0, ruleIndex)
      .find((rule) => ownershipPatternsOverlap(rule.pattern, pattern))
    if (shadowingRule !== undefined) {
      throw new Error(
        `Independent ownership rule shadowed: ${shadowingRule.pattern} precedes ${pattern}`
      )
    }
  }
  for (const pattern of REQUIRED_UPGRADE_REQUIRED_PATTERNS) {
    if (observed.get(pattern)?.required !== true) {
      throw new Error(`Independent ownership required path weakened: ${pattern}`)
    }
  }
}

/** 在日常 Harness 门禁中复用生产升级器的所有权清单校验。 */
export async function validateUpgradeOwnership(root: string, errors: string[]): Promise<void> {
  const manifestPath = path.join(
    root,
    ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
  )
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"))
    validateIndependentOwnershipBoundary(validateOwnershipManifest(value))
  } catch (error) {
    errors.push(
      `upgrade ownership contract is invalid: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
