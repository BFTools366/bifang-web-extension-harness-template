import { readFile, realpath, readdir } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vitest"
import { repositoryRoot } from "./harness-tooling-support.ts"
import { readCapabilityCatalog } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"
import { inspectChineseComments } from "../.harness/tooling/comment-policy.ts"
import { checkExport } from "../.agents/skills/web-document-api/scripts/check-export.ts"

/** 所有可装配源码均须受索引治理，不能遗漏升级资源、声明注释或规模检查。 */
test("opt-in capability assets are indexed, readable and governed as source", async () => {
  const root = path.join(repositoryRoot, ".agents/skills/web-compose-capabilities")
  const recipeRoot = path.join(root, "templates/compositions/account-workspace")
  const catalog = readCapabilityCatalog(root)
  const resources = new Set(
    [...catalog.modules, ...catalog.recipes].flatMap((entry) =>
      entry.templates.map((item) => item.path)
    )
  )
  const assets = JSON.parse(await readFile(path.join(recipeRoot, "assets.json"), "utf8")) as Record<
    string,
    string
  >
  expect(Object.keys(assets).length).toBeGreaterThan(50)
  for (const [target, asset] of Object.entries(assets)) {
    expect(target).toMatch(/^src\//u)
    expect(target.split("/")).not.toContain("..")
    const sourcePath = await realpath(path.join(recipeRoot, asset))
    expect(sourcePath.startsWith(root + path.sep)).toBe(true)
    expect(resources.has(path.relative(root, sourcePath).split(path.sep).join("/"))).toBe(true)
    const source = await readFile(sourcePath, "utf8")
    expect(source).not.toMatch(/毕方小CB|Bifang workspace|Bifang studio/u)
    if (/\.(?:ts|tsx)$/u.test(target)) {
      const report = inspectChineseComments(source, target)
      expect(report.errors, target).toEqual([])
      expect(report.violations, target).toEqual([])
      expect(source.split("\n").length - 1, target).toBeLessThanOrEqual(600)
    }
  }
  /** 防止搬走资产后目录留有未编译且无人索引的旧模板。 */
  async function checkDirectory(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await checkDirectory(file)
      else
        expect(resources.has(path.relative(root, file).split(path.sep).join("/")), file).toBe(true)
    }
  }
  await checkDirectory(recipeRoot)
})

/** 完整示例包维持操作/业务关联，不把离线购买设计混入已模拟API。 */
test("neutral account API example is a complete linked export", async () => {
  const report = await checkExport(
    path.join(
      repositoryRoot,
      ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/api-example"
    )
  )
  expect(report.operations).toBe(13)
})
