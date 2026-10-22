import { execFileSync } from "node:child_process"
import { readdir, rm, symlink } from "node:fs/promises"
import sharp from "sharp"
import { describe, expect, test } from "vitest"
import { generateCandidatePreviews } from "../.agents/skills/web-prepare-brand-identity/scripts/generate-candidates.ts"
import { createLogoCandidates, deriveLogoAssets } from "../.harness/tooling/logo.ts"
import {
  initializeProject,
  options,
  path,
  readFile,
  repositoryRoot,
  seedTemplateRoot,
  validateProject
} from "./harness-tooling-support.ts"

/** 覆盖三候选预览、选中图导入和正式母版保留的真实生成链。 */
describe("three logo choices", () => {
  /** 相同身份得到三个不同且可复现的规范 PNG，输入错误不生成预览。 */
  test("renders three distinct deterministic candidates and rejects invalid input", async () => {
    const input = { name: "Logo Choices", id: "logo-choices", color: "#4C6EF5" }
    const first = await createLogoCandidates(input)
    expect(first).toHaveLength(3)
    expect(new Set(first.map((image) => image.toString("base64"))).size).toBe(3)
    expect(await createLogoCandidates(input)).toEqual(first)
    for (const image of first) {
      expect(await sharp(image).metadata()).toMatchObject({
        width: 1024,
        height: 1024,
        format: "png"
      })
    }
    for (const args of [
      [],
      ["--name", "Logo", "--id", "logo", "--brand-color", "red"],
      ["--output", "/tmp/target"]
    ]) {
      await expect(generateCandidatePreviews(args)).rejects.toThrow()
    }
  })

  /** 选中第二张后两个宿主只保留该母版与派生；清理预览后终端刷新仍可用。 */
  test.each(["web", "extension"] as const)(
    "imports only chosen image into %s",
    async (projectType) => {
      const previews = await generateCandidatePreviews([
        "--name",
        "Logo Choices",
        "--id",
        "logo-choices"
      ])
      const root = await seedTemplateRoot()
      try {
        expect(previews.candidates.map((candidate) => candidate.choice)).toEqual([1, 2, 3])
        expect(await readdir(previews.directory)).toEqual([
          "logo-1.png",
          "logo-2.png",
          "logo-3.png"
        ])
        const selected = previews.candidates[1]
        if (selected === undefined) throw new Error("第二个候选缺失")
        const chosen = await readFile(selected.path)
        const config = await initializeProject({
          ...options(root, projectType),
          logoPath: selected.path
        })
        expect(config.brand.logoSource).toBe("uploaded")
        expect(JSON.stringify(config)).not.toContain(previews.directory)
        const masterPath = path.join(root, ".harness/brand/logo-1024.png")
        expect(
          await sharp(await readFile(masterPath))
            .raw()
            .toBuffer()
        ).toEqual(await sharp(chosen).raw().toBuffer())
        for (const [asset, bytes] of await deriveLogoAssets(
          projectType,
          await readFile(masterPath)
        )) {
          expect(await readFile(path.join(root, asset))).toEqual(bytes)
        }
        expect(await readdir(path.join(root, ".harness/brand"))).toEqual(["logo-1024.png"])
        await rm(previews.directory, { recursive: true, force: true })
        await symlink(
          path.join(repositoryRoot, "node_modules"),
          path.join(root, "node_modules"),
          "junction"
        )
        const terminalPreview = JSON.parse(
          execFileSync(
            process.execPath,
            [
              path.join(
                root,
                ".agents/skills/web-prepare-brand-identity/scripts/generate-candidates.ts"
              ),
              "--name",
              "Terminal Preview",
              "--id",
              "terminal-preview"
            ],
            { cwd: root, encoding: "utf8" }
          )
        )
        try {
          expect(
            terminalPreview.candidates.map((candidate: { choice: number }) => candidate.choice)
          ).toEqual([1, 2, 3])
          expect(await readdir(terminalPreview.directory)).toHaveLength(3)
        } finally {
          await rm(terminalPreview.directory, { recursive: true, force: true })
        }
        execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            `import { refreshBrand } from ${JSON.stringify(path.join(root, ".harness/tooling/brand.ts"))}; await refreshBrand(${JSON.stringify(root)});`
          ],
          { cwd: root }
        )
        expect(
          await sharp(await readFile(masterPath))
            .raw()
            .toBuffer()
        ).toEqual(await sharp(chosen).raw().toBuffer())
        await expect(validateProject(root)).resolves.toContain(projectType)
      } finally {
        await rm(previews.directory, { recursive: true, force: true })
      }
    },
    60_000
  )
})
