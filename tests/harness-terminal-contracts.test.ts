import { describe, test } from "vitest"
import {
  expect,
  initializeProject,
  options,
  path,
  readFile,
  rm,
  seedTemplateRoot,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 终端分页、HTTP 认证与 Web 文件路由的共享合同漂移反例，与身份和 Skill 分发治理分开维护。 */
describe("terminal shared runtime contracts", () => {
  /** 验证 rejects drift from the shared pagination contract 场景。 */
  test("rejects drift from the shared pagination contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replaceAll('getWebStorage("session")', 'getWebStorage("local")')
    )

    await expect(validateProject(root)).rejects.toThrow(/Pagination contract is missing/)
  })

  /** 验证 requires every shared pagination file in Web projects 场景。 */
  test("requires every shared pagination file in Web projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "src/pagination/useSessionPagination.ts"))

    await expect(validateProject(root)).rejects.toThrow(
      /Missing src\/pagination\/useSessionPagination\.ts/
    )
  })

  /** 验证 rejects a pagination empty-page reconciliation drift 场景。 */
  test("rejects a pagination empty-page reconciliation drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replace("result.items.length === 0", "result.items.length > 0")
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination contract is missing result\.items\.length === 0/
    )
  })

  /** 验证 rejects a missing pagination translation 场景。 */
  test("rejects a missing pagination translation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const localePath = path.join(root, "src/i18n/locales/en.ts")
    const locale = await readFile(localePath, "utf8")
    await writeFile(
      localePath,
      locale.replace('paginationNext: "Next page",', 'paginationForward: "Next page",')
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination translations are missing paginationNext/
    )
  })

  /** 验证 rejects drift from the shared HTTP authentication contract 场景。 */
  test("rejects drift from the shared HTTP authentication contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const clientPath = path.join(root, "src/data/api/client/httpContracts.ts")
    const client = await readFile(clientPath, "utf8")
    await writeFile(clientPath, client.replace('authToken: "X-AUTH-TOKEN"', 'authToken: "X-Token"'))

    await expect(validateProject(root)).rejects.toThrow(/HTTP client contract is missing/)
  })

  /** 验证 rejects drift from the Web file-route and code-splitting contract 场景。 */
  test("rejects drift from the Web file-route and code-splitting contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const missingPluginRoot = await seedTemplateRoot()
    await initializeProject(options(missingPluginRoot, "web"))
    const manifestPath = path.join(missingPluginRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    delete manifest.devDependencies["@tanstack/router-plugin"]
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(missingPluginRoot)).rejects.toThrow(
      /missing @tanstack\/router-plugin/
    )

    const disabledSplittingRoot = await seedTemplateRoot()
    await initializeProject(options(disabledSplittingRoot, "web"))
    const viteConfigPath = path.join(disabledSplittingRoot, "vite.config.ts")
    const viteConfig = await readFile(viteConfigPath, "utf8")
    await writeFile(
      viteConfigPath,
      viteConfig.replace("autoCodeSplitting: true", "autoCodeSplitting: false")
    )
    await expect(validateProject(disabledSplittingRoot)).rejects.toThrow(/autoCodeSplitting/)
  })
})
