import os from "node:os"
import { readFile, readdir, cp, mkdtemp, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vitest"
import { repositoryRoot } from "./harness-tooling-support.ts"
import { readCapabilityCatalog } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"
import { inspectChineseComments } from "../.harness/tooling/comment-policy.ts"
import { countSourceLines, SOURCE_SIZE_HARD_LIMIT } from "../.harness/tooling/source-size-policy.ts"
import { checkExport } from "../.agents/skills/web-document-api/scripts/check-export.ts"

/** 所有可装配源码均须受索引治理，不能遗漏升级资源、声明注释或规模检查。 */
test("opt-in capability assets are indexed, readable and governed as source", async () => {
  const root = path.join(repositoryRoot, ".agents/skills/web-compose-capabilities")
  const recipeRoot = path.join(root, "templates/compositions/account-workspace")
  const catalog = readCapabilityCatalog(root)
  const resources = new Set([
    ...catalog.application.map((item) => item.path),
    ...[...catalog.modules, ...catalog.recipes].flatMap((entry) =>
      entry.templates.map((item) => item.path)
    )
  ])
  for (const retired of [
    "files.ts",
    "assets.json",
    "session.ts.txt",
    "app",
    "routes",
    "features",
    "i18n"
  ])
    await expect(readdir(path.join(recipeRoot, retired))).rejects.toMatchObject({ code: "ENOENT" })
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
  await checkDirectory(path.join(root, "templates/application"))
  for (const relative of resources) {
    if (!relative.startsWith("templates/") || !/\.tsx?(?:\.txt)?$/u.test(relative)) continue
    const source = await readFile(path.join(root, relative), "utf8")
    expect(source).not.toMatch(/毕方小CB|Bifang workspace|Bifang studio/u)
    const report = inspectChineseComments(source, relative.replace(/\.txt$/u, ""))
    expect(report.errors, relative).toEqual([])
    expect(report.violations, relative).toEqual([])
    expect(countSourceLines(source), relative).toBeLessThanOrEqual(SOURCE_SIZE_HARD_LIMIT)
  }
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

/** 损坏依赖、遗漏宿主代码或越界资源在任何下游装配前失败。 */
test("rejects damaged operation graphs and missing fixed assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "capability-contract-"))
  try {
    await cp(path.join(repositoryRoot, ".agents/skills/web-compose-capabilities"), root, {
      recursive: true
    })
    const original = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"))
    for (const mode of ["cycle", "missing-operation", "missing-host", "escape"] as const) {
      const catalog = structuredClone(original)
      if (mode === "cycle")
        catalog.modules.find(
          (item: { id: string }) => item.id === "identity"
        ).operations[0].requires = ["permissions.enforce"]
      if (mode === "missing-operation")
        catalog.modules[0].operations[0].requires = ["unknown.operation"]
      if (mode === "missing-host")
        catalog.modules[0].templates = catalog.modules[0].templates.map(
          (item: { hosts: string[] }) => ({ ...item, hosts: ["web"] })
        )
      if (mode === "escape") catalog.application[0].path = "../outside.ts"
      await writeFile(path.join(root, "catalog.json"), JSON.stringify(catalog))
      expect(() => readCapabilityCatalog(root), mode).toThrow()
    }
    await writeFile(path.join(root, "catalog.json"), JSON.stringify(original))
    await rm(path.join(root, "templates/identity/design.md"))
    expect(() => readCapabilityCatalog(root)).toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
