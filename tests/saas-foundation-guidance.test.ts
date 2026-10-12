import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vitest"
import { downstreamGovernanceFiles } from "../.harness/tooling/templates/downstream-docs.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { options, repositoryRoot } from "./harness-tooling-support.ts"

/** 验证 SaaS 布局正文只从权威 Web 章节传播，不泄漏到 Extension。 */
test("SaaS 基础设计按宿主传播", async () => {
  const [dataAccess, mantineUiGuidelines, engineeringRules] = await Promise.all([
    readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"), "utf8")
  ])
  const marker = "SaaS 基础章节传播标记"
  const updated = mantineUiGuidelines.replace(
    "### 8.1 SaaS 基础设计与页面闭环",
    `### 8.1 SaaS 基础设计与页面闭环\n\n${marker}`
  )
  for (const projectType of ["web", "extension"] as const) {
    const config = createProjectConfig(options(repositoryRoot, projectType))
    const document = downstreamGovernanceFiles(config, {
      dataAccess,
      mantineUiGuidelines: updated,
      engineeringRules
    }).get("docs/MANTINE_UI_GUIDELINES.md")
    if (projectType === "web") {
      for (const text of [
        marker,
        "未登录默认进入登录页",
        "演示账号模式",
        "侧栏底部",
        "商品选择、订单管理、钱包管理"
      ])
        expect(document).toContain(text)
    } else {
      expect(document).not.toContain(marker)
      expect(document).not.toContain("### 8.1 SaaS 基础设计与页面闭环")
    }
  }
})
