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
  const styleMarker = "源码风格章节传播标记"
  const updatedEngineeringRules = engineeringRules.replace(
    "### 3.3 源码可读性与类型化组合",
    `### 3.3 源码可读性与类型化组合\n\n${styleMarker}`
  )
  const updated = mantineUiGuidelines.replace(
    "### 8.1 SaaS 基础设计与页面闭环",
    `### 8.1 SaaS 基础设计与页面闭环\n\n${marker}`
  )
  for (const projectType of ["web", "extension"] as const) {
    const config = createProjectConfig(options(repositoryRoot, projectType))
    const documents = downstreamGovernanceFiles(config, {
      dataAccess,
      mantineUiGuidelines: updated,
      engineeringRules: updatedEngineeringRules
    })
    const document = documents.get("docs/MANTINE_UI_GUIDELINES.md")
    const engineering = documents.get("docs/ENGINEERING_RULES.md")
    for (const text of [styleMarker, "不得把多个语句", "可省略字段用可选属性表达", "双重断言"])
      expect(engineering).toContain(text)
    if (projectType === "web") {
      for (const text of [
        marker,
        "未登录默认进入登录页",
        "演示账号模式",
        "侧栏底部",
        "每个表示独立页面的叶子菜单项拥有独立的规范 URL",
        '每个可见导航区域最多一个 `aria-current="page"`',
        "activeOptions.exact: true",
        "### 8.5 路由布局与插槽",
        "普通菜单切换不重建侧栏",
        "节点身份和局部交互状态持续保留",
        "renderRoot",
        "商品选择、订单管理、钱包管理"
      ])
        expect(document).toContain(text)
    } else {
      expect(document).not.toContain(marker)
      expect(document).not.toContain("### 8.1 SaaS 基础设计与页面闭环")
      expect(document).not.toContain("### 8.4 导航路由与当前项")
      expect(document).not.toContain("### 8.5 路由布局与插槽")
      expect(document).not.toContain("/app/dashboard")
      expect(engineering).not.toContain("src/routes/")
    }
  }
})
