import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  seedTemplateRoot,
  initializeProject,
  options,
  readFile,
  writeFile,
  validateProject
} from "./harness-tooling-support.ts"

describe("HTTP foundation governance", () => {
  for (const projectType of ["web", "extension"] as const) {
    /** 两宿主都必须保留真实反馈接线、显式登录写入和 owner 读取入口。 */
    test("requires integrated authentication and feedback in " + projectType, async () => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const mutations: Array<[string, string, string]> = [
        ["src/api/client/httpProtocol.ts", 'code: "access_forbidden"', 'code: "missing_forbidden"'],
        ["src/api/client/httpRuntime.ts", 'feedback: "owner"', 'feedback: "global"'],
        [
          projectType === "web" ? "src/app/AppProviders.tsx" : "src/providers.tsx",
          "<HttpFeedback />",
          ""
        ],
        [
          projectType === "web" ? "src/app/router.tsx" : "src/extension-router.tsx",
          projectType === "web"
            ? "...routeStateDefaults"
            : "defaultErrorComponent: ExtensionRouteErrorPage,",
          ""
        ]
      ]
      for (const [relativePath, original, replacement] of mutations) {
        const target = path.join(root, relativePath)
        const source = await readFile(target, "utf8")
        expect(source).toContain(original)
        await writeFile(target, source.replace(original, replacement))
        await expect(validateProject(root)).rejects.toThrow(
          /HTTP (client|feedback) contract is missing/
        )
        await writeFile(target, source)
      }
    })

    /** 验证两宿主拒绝缺失/降版的 Ky 运行时依赖及传输层隐式重试。 */
    test("requires the shared Ky transport in " + projectType, async () => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const manifestPath = path.join(root, "package.json")
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        dependencies: Record<string, string>
        devDependencies: Record<string, string>
      }
      for (const version of [undefined, "2.0.0"]) {
        if (version === undefined) delete manifest.dependencies.ky
        else manifest.dependencies.ky = version
        manifest.devDependencies.ky = "2.1.0"
        await writeFile(manifestPath, JSON.stringify(manifest))
        await expect(validateProject(root)).rejects.toThrow(/ky runtime dependency minimum/)
      }
      manifest.dependencies.ky = "2.1.0"
      delete manifest.devDependencies.ky
      await writeFile(manifestPath, JSON.stringify(manifest))
      const clientPath = path.join(root, "src/api/client/httpProtocol.ts")
      const source = await readFile(clientPath, "utf8")
      await writeFile(clientPath, source.replace("retry: 0", "retry: 1"))
      await expect(validateProject(root)).rejects.toThrow(
        /HTTP client contract is missing retry: 0/
      )
    })
  }
})
