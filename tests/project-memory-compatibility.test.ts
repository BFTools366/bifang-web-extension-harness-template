import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { createSymlinkOrSkip } from "./setup.ts"
import {
  createProjectMemoryRoot,
  writeMemoryFile,
  writeProjectMemoryCompatibilityManifest,
  projectMemoryErrors
} from "./harness-validator-fixture.ts"

/** 验证 project-memory compatibility manifest 的完整回归场景。 */
describe("project-memory compatibility manifest", () => {
  /** 验证缺少兼容清单时完全保留原有规范命名行为。 */
  test("keeps canonical validation unchanged when the manifest is absent", async () => {
    // 保存 root 变量供无清单规范命名测试使用。
    const root = await createProjectMemoryRoot()
    await writeMemoryFile(root, "product_spec", "20260919_product_spec.md")
    await expect(projectMemoryErrors(root)).resolves.toEqual([])

    await writeMemoryFile(root, "project_status", "legacy_status.md")
    await expect(projectMemoryErrors(root)).resolves.toContain(
      "Invalid optional Product Status entry: docs/project_status/legacy_status.md"
    )
  })

  /** 验证只有清单中精确列出的既有正文可以绕过规范命名。 */
  test("grandfathers only the exact listed non-canonical file", async () => {
    // 保存 root 变量供精确路径豁免测试使用。
    const root = await createProjectMemoryRoot()
    await writeMemoryFile(root, "product_spec", "legacy_spec.md")
    await writeProjectMemoryCompatibilityManifest(root, {
      schemaVersion: 1,
      grandfatheredPaths: ["docs/product_spec/legacy_spec.md"]
    })
    await expect(projectMemoryErrors(root)).resolves.toEqual([])

    await writeFile(path.join(root, "docs/product_spec/legacy_copy.md"), "# Copy\n")
    await expect(projectMemoryErrors(root)).resolves.toContain(
      "Invalid optional Product Spec entry: docs/product_spec/legacy_copy.md"
    )
  })

  /** 验证清单 schema 和顶层字段必须精确匹配版本一合同。 */
  test.each([
    [{ schemaVersion: 2, grandfatheredPaths: [] }, /schemaVersion must be 1/],
    [{ schemaVersion: 1 }, /must contain only schemaVersion and grandfatheredPaths/],
    [
      { schemaVersion: 1, grandfatheredPaths: [], extra: true },
      /must contain only schemaVersion and grandfatheredPaths/
    ],
    [{ schemaVersion: 1, grandfatheredPaths: "legacy" }, /must be an array/]
  ])("rejects an invalid manifest shape %#", async (manifest, expected) => {
    // 保存 root 变量供严格 schema 测试使用。
    const root = await createProjectMemoryRoot()
    await writeProjectMemoryCompatibilityManifest(root, manifest)
    await expect(projectMemoryErrors(root)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(expected)])
    )
  })

  /** 验证兼容路径必须唯一、使用 POSIX 仓库相对单层合法分类 Markdown 路径。 */
  test.each([
    [["docs/product_spec/legacy.md", "docs/product_spec/legacy.md"], /Duplicate/],
    [["/docs/product_spec/legacy.md"], /Invalid project-memory compatibility path/],
    [["docs\\product_spec\\legacy.md"], /Invalid project-memory compatibility path/],
    [["docs/product_spec/nested/legacy.md"], /Invalid project-memory compatibility path/],
    [["docs/unknown/legacy.md"], /Invalid project-memory compatibility path/],
    [["docs/product_spec/legacy.txt"], /Invalid project-memory compatibility path/]
  ])("rejects an invalid grandfathered path %#", async (grandfatheredPaths, expected) => {
    // 保存 root 变量供路径语法测试使用。
    const root = await createProjectMemoryRoot()
    await writeMemoryFile(root, "product_spec", "legacy.md")
    await writeProjectMemoryCompatibilityManifest(root, { schemaVersion: 1, grandfatheredPaths })
    await expect(projectMemoryErrors(root)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(expected)])
    )
  })

  /** 验证规范正文、索引和历史卷不能进入兼容清单。 */
  test.each([
    ["docs/product_spec/20260919_product_spec.md", "20260919_product_spec.md"],
    ["docs/product_spec/README.md", "README.md"],
    ["docs/adr/ADR_history.md", "ADR_history.md"]
  ])("rejects reserved path %s", async (grandfatheredPath, filename) => {
    // 保存 root、directory 变量供保留路径测试使用。
    const root = await createProjectMemoryRoot()
    const directory = grandfatheredPath.split("/")[1]
    if (directory === undefined) throw new Error("Missing test directory")
    await writeMemoryFile(root, directory, filename)
    await writeProjectMemoryCompatibilityManifest(root, {
      schemaVersion: 1,
      grandfatheredPaths: [grandfatheredPath]
    })
    await expect(projectMemoryErrors(root)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/cannot be grandfathered/)])
    )
  })

  /** 验证兼容正文必须存在并出现在对应索引中。 */
  test("requires a real indexed file", async () => {
    // 保存 missingRoot 变量供缺失正文测试使用。
    const missingRoot = await createProjectMemoryRoot()
    await mkdir(path.join(missingRoot, "docs/work_plan"), { recursive: true })
    await writeFile(path.join(missingRoot, "docs/work_plan/README.md"), "# Index\n")
    await writeProjectMemoryCompatibilityManifest(missingRoot, {
      schemaVersion: 1,
      grandfatheredPaths: ["docs/work_plan/legacy_plan.md"]
    })
    await expect(projectMemoryErrors(missingRoot)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/Missing or unsafe grandfathered/)])
    )

    // 保存 unindexedRoot 变量供索引遗漏测试使用。
    const unindexedRoot = await createProjectMemoryRoot()
    await writeMemoryFile(unindexedRoot, "project_status", "legacy_status.md", {
      indexed: false
    })
    await writeProjectMemoryCompatibilityManifest(unindexedRoot, {
      schemaVersion: 1,
      grandfatheredPaths: ["docs/project_status/legacy_status.md"]
    })
    await expect(projectMemoryErrors(unindexedRoot)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/missing from index/)])
    )
  })

  /** 验证兼容正文不能通过符号链接逃逸受管目录。 */
  test("rejects a symlinked compatibility file", async (context) => {
    // 保存 symlinkRoot、targetPath 与 linkPath 变量供符号链接拒绝测试使用。
    const symlinkRoot = await createProjectMemoryRoot()
    await mkdir(path.join(symlinkRoot, "docs/changelog"), { recursive: true })
    const targetPath = path.join(symlinkRoot, "target.md")
    const linkPath = path.join(symlinkRoot, "docs/changelog/legacy_changelog.md")
    await writeFile(targetPath, "# Target\n")
    await createSymlinkOrSkip(context, targetPath, linkPath, "file")
    await writeFile(
      path.join(symlinkRoot, "docs/changelog/README.md"),
      "[Legacy](./legacy_changelog.md)\n"
    )
    await writeProjectMemoryCompatibilityManifest(symlinkRoot, {
      schemaVersion: 1,
      grandfatheredPaths: ["docs/changelog/legacy_changelog.md"]
    })
    await expect(projectMemoryErrors(symlinkRoot)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/Missing or unsafe grandfathered/)])
    )
  })
})
