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
    "### 8.1 功能组合的页面与布局",
    `### 8.1 功能组合的页面与布局\n\n${marker}`
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
    for (const text of [
      "所有表单中支持占位提示的可编辑字段都必须提供 placeholder",
      "占位文案进入既有 i18next",
      "页面只呈现完成当前业务任务所需的内容",
      "Mock/演示模式宣告",
      "保留直接影响当前操作的字段要求、实际错误及恢复动作"
    ])
      expect(document).toContain(text)
    expect(document).not.toContain("Mock 边界用可展开说明")
    for (const text of [styleMarker, "不得把多个语句", "可省略字段用可选属性表达", "双重断言"])
      expect(engineering).toContain(text)
    if (projectType === "web") {
      for (const text of [
        marker,
        "未登录默认进入登录页",
        "开发说明留在交付材料",
        "无需登录的 `/settings`",
        "认证页底部只保留低强调文字设置链接",
        "离开认证页清空输入",
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
      expect(document).not.toContain("### 8.1 功能组合的页面与布局")
      expect(document).not.toContain("### 8.4 导航路由与当前项")
      expect(document).not.toContain("### 8.5 路由布局与插槽")
      expect(document).not.toContain("/app/dashboard")
      expect(engineering).not.toContain("src/routes/")
    }
  }
})

/** 验证列表协议强约定在两宿主原文传播，且 Extension 不依赖 Web 列表状态章节。 */
test("GraphQL 列表强约定按两宿主完整传播", async () => {
  const [dataAccess, mantineUiGuidelines, engineeringRules] = await Promise.all([
    readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"), "utf8")
  ])
  const policy = dataAccess
    .split("#### 列表查询协议强约定\n")[1]
    ?.split("### 1.3 存储机制与选型")[0]
    ?.trim()
  expect(policy).toContain("远端列表查询必须使用 GraphQL")
  for (const projectType of ["web", "extension"] as const) {
    const documents = downstreamGovernanceFiles(
      createProjectConfig(options(repositoryRoot, projectType)),
      { dataAccess, mantineUiGuidelines, engineeringRules }
    )
    const emitted = documents.get("docs/DATA_ACCESS.md")
    expect(emitted).toContain(policy)
    expect(emitted).not.toContain("常规详情/列表")
    expect(documents.get("docs/ENGINEERING_RULES.md")).toContain("GraphQL 强制负责远端列表查询")
    if (projectType === "extension") expect(emitted).not.toContain("### 2.5 React Web 路由列表契约")
  }
})

/** 验证按模块选择只返回自身资源，组合要求与宿主限制都明确且只读。 */
test("capability selection keeps independent modules and explicit recipes", async () => {
  const { selectCapabilities } =
    await import("../.agents/skills/web-compose-capabilities/scripts/capabilities.ts")
  const standalone = selectCapabilities([
    "resolve",
    "--host",
    "extension",
    "--modules",
    "orders"
  ]) as { modules: { id: string }[]; recipe?: unknown }
  expect(standalone.modules.map((item) => item.id)).toEqual(["orders"])
  expect(standalone.recipe).toBeUndefined()
  const combined = selectCapabilities([
    "resolve",
    "--host",
    "web",
    "--recipe",
    "account-workspace"
  ]) as { modules: { id: string }[] }
  expect(combined.modules.map((item) => item.id)).toEqual([
    "identity",
    "organization",
    "permissions"
  ])
  for (const args of [
    ["resolve", "--host", "web", "--modules", "unknown"],
    ["resolve", "--host", "web", "--modules", "identity,identity"],
    ["resolve", "--host", "web", "--modules", "identity", "--recipe", "account-workspace"],
    ["resolve", "--host", "extension", "--recipe", "account-workspace"],
    ["resolve", "--host", "web", "--recipe", "unknown"],
    ["resolve", "--host", "web", "--modules", "identity", "--enable", "yes"]
  ])
    expect(() => selectCapabilities(args)).toThrow()
})
