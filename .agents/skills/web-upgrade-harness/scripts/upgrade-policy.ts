import type { OwnershipMode, UpgradeClassification } from "./upgrade-types.ts"

/** 保存树扫描时明确排除的外部或最终产物目录。 */
export const EXCLUDED_DIRECTORIES = new Set([".plasmo", "build", "dist", "node_modules"])

/** 保存所有权合法值。 */
export const OWNERSHIP_MODES = new Set<OwnershipMode>([
  "managed",
  "managed-self",
  "merge-sections",
  "conditional",
  "protected",
  "tombstone"
])

/** 保存会阻断任何自动升级写入的计划分类。 */
export const BLOCKING_UPGRADE_CLASSIFICATIONS = new Set<UpgradeClassification>([
  "blocked",
  "bootstrap_conflict",
  "collision",
  "conflict"
])

/** 保存必须由人工逐路径收敛的计划分类。 */
export const MANUAL_UPGRADE_CLASSIFICATIONS = new Set<UpgradeClassification>([
  "add",
  "delete",
  "manual_add",
  "manual_merge"
])

/** 保存终端目标内唯一受信任的所有权清单相对路径。 */
export const OWNERSHIP_RELATIVE_PATH =
  ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"

/** 保存终端目标内唯一受信任的上游锁相对路径。 */
export const UPSTREAM_LOCK_RELATIVE_PATH = ".harness/upstream-lock.json"

/** 保存所有权清单不可弱化的关键规则。 */
export const MINIMUM_OWNERSHIP_RULES: Readonly<Record<string, OwnershipMode>> = {
  ".agents/skills/web-configure-git-commits/**": "managed",
  ".agents/skills/web-run-parallel-worktrees/**": "managed",
  ".agents/skills/web-summarize-development-history/**": "managed",
  ".agents/skills/web-upgrade-harness/**": "managed-self",
  ".harness/tooling/agent-policy.ts": "managed",
  ".harness/tooling/args.ts": "managed",
  ".harness/tooling/brand.ts": "managed",
  ".harness/tooling/build.ts": "managed",
  ".harness/tooling/cli.ts": "managed",
  ".harness/tooling/comment-policy.ts": "managed",
  ".harness/tooling/config.ts": "managed",
  ".harness/tooling/environment.ts": "managed",
  ".harness/tooling/files.ts": "managed",
  ".harness/tooling/logo.ts": "managed",
  ".harness/tooling/project-memory.ts": "managed",
  ".harness/tooling/release.ts": "managed",
  ".harness/tooling/source-size-policy.ts": "managed",
  ".harness/tooling/types.ts": "managed",
  ".harness/tooling/validate.ts": "managed",
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
  "docs/ENGINEERING_RULES.md": "merge-sections",
  "docs/RELEASE.md": "merge-sections",
  "package.json": "merge-sections",
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
  ".harness/project-memory-compatibility.json": "protected",
  ".harness/release-policy.json": "protected",
  ".harness/brand/**": "protected",
  ".harness/upstream-lock.json": "protected",
  ".gitignore": "protected",
  "pnpm-lock.yaml": "protected",
  "docs/AGENT_POLICY.md": "protected",
  "docs/product_spec/**": "protected",
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
  "tests/harness-instantiation.test.ts": "tombstone",
  "tests/harness-memory.test.ts": "tombstone",
  "tests/harness-tooling-support.ts": "tombstone",
  "tests/harness-tooling.test.ts": "tombstone",
  "tests/harness-validator.test.ts": "tombstone",
  "tests/initialization-atomicity.test.ts": "tombstone",
  "tests/line-limits.test.ts": "tombstone",
  "docs/HARNESS_ENGINEERING.md": "tombstone",
  "docs/harness_engineering/**": "tombstone",
  "docs/TS_WEB_TEMPLATE.md": "tombstone",
  "Version.md": "tombstone"
}

/** 保存必须继续声明 required=true 的精确合并规则。 */
export const MINIMUM_REQUIRED_OWNERSHIP_PATTERNS = new Set([
  "AGENTS.md",
  "README.md",
  "package.json"
])

/** 保存必须从 source 精确传播到候选的关键 managed 文件。 */
export const REQUIRED_MANAGED_SOURCE_PATHS = [
  ".agents/skills/web-configure-git-commits/SKILL.md",
  ".agents/skills/web-configure-git-commits/agents/openai.yaml",
  ".agents/skills/web-configure-git-commits/assets/commit-template.txt",
  ".agents/skills/web-configure-git-commits/references/commit-convention.md",
  ".agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts",
  ".agents/skills/web-run-parallel-worktrees/SKILL.md",
  ".agents/skills/web-run-parallel-worktrees/agents/openai.yaml",
  ".agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts",
  ".agents/skills/web-summarize-development-history/SKILL.md",
  ".agents/skills/web-summarize-development-history/agents/openai.yaml",
  ".harness/tooling/agent-policy.ts",
  ".harness/tooling/args.ts",
  ".harness/tooling/comment-policy.ts",
  ".harness/tooling/environment.ts",
  ".harness/tooling/files.ts",
  ".harness/tooling/logo.ts",
  ".harness/tooling/project-memory.ts",
  ".harness/tooling/release.ts",
  ".harness/tooling/source-size-policy.ts",
  ".harness/tooling/validate.ts",
  ".harness/tooling/version.ts",
  "tests/comment-policy.test.ts",
  "tests/git-commit-configuration.test.ts",
  "tests/harness-upgrade.test.ts",
  "tests/parallel-worktrees.test.ts",
  "tests/release-inspection.test.ts",
  "tests/source-size-policy.test.ts",
  "tests/version.test.ts"
] as const
