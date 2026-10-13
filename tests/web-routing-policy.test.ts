import { rename } from "node:fs/promises"
import { test } from "vitest"
import { validateWebRouteFiles } from "../.harness/tooling/validate-hosts.ts"
import {
  expect,
  initializeProject,
  mkdir,
  options,
  path,
  readFile,
  rm,
  seedTemplateRoot,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 验证产品用真实子路由替换初始化首页后仍可通过终端门禁。 */
test("accepts a Web product without the initial index route", async () => {
  const root = await seedTemplateRoot()
  await initializeProject(options(root, "web"))
  const viteSource = await readFile(path.join(root, "vite.config.ts"), "utf8")
  const literal = /routeFileIgnorePattern:\s*("(?:\\.|[^"\\])*")/u.exec(viteSource)?.[1]
  if (literal === undefined) throw new Error("Missing generated route ignore pattern")
  const patternValue: unknown = JSON.parse(literal)
  if (typeof patternValue !== "string") throw new Error("Invalid route ignore pattern")
  const ignorePattern = new RegExp(patternValue)
  expect(ignorePattern.test("workspace.test.tsx")).toBe(true)
  expect(ignorePattern.test("workspace/page.spec.ts")).toBe(true)
  expect(ignorePattern.test("workspace/test.tsx")).toBe(false)
  expect(ignorePattern.test("workspace/latest.tsx")).toBe(false)
  await mkdir(path.join(root, "src/routes/workspace"), { recursive: true })
  await rename(
    path.join(root, "src/routes/index.tsx"),
    path.join(root, "src/routes/workspace/dashboard.tsx")
  )
  await writeFile(
    path.join(root, "src/routes/workspace/dashboard.tsx"),
    `import { createFileRoute } from "@tanstack/react-router"
import { WelcomePage } from "../../features/welcome/WelcomePage"
/** 声明中性工作区页面，首页不作为永久产品要求。 */
export const Route = createFileRoute("/workspace/dashboard")({ component: WelcomePage })
`
  )
  await expect(validateProject(root)).resolves.toContain("web")
})

/** 验证生产测试页面不会因文件命名同时进入 Router 与 Vitest。 */
test.each(["workspace.test.tsx", "workspace.spec.ts", "nested/page.test.tsx"])(
  "rejects a route colliding with test discovery: %s",
  async (filename) => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const routePath = path.join(root, "src/routes", filename)
    await mkdir(path.dirname(routePath), { recursive: true })
    await writeFile(routePath, "export const Route = {}\n")
    await expect(validateProject(root)).rejects.toThrow(
      /route filename conflicts with test discovery/
    )
  }
)

/** 验证根布局及声明/忽略文件不能冒充可访问路由，合法 test URL 段仍被接受。 */
test("requires a non-root route and accepts nested test segments", async () => {
  const root = await seedTemplateRoot()
  await mkdir(path.join(root, "src/routes"), { recursive: true })
  await writeFile(path.join(root, "src/routes/__root.tsx"), "export const Route = {}\n")
  await writeFile(path.join(root, "src/routes/types.d.ts"), "export interface RouteData {}\n")
  await writeFile(path.join(root, "src/routes/-ignored.tsx"), "export const ignored = true\n")
  for (const filename of [
    ".hidden.tsx",
    ".hidden/page.tsx",
    "-ignored/page.tsx",
    "types.d.mts",
    "unsupported.mts",
    "unsupported.cts",
    "unsupported.mjs",
    "unsupported.cjs"
  ]) {
    const file = path.join(root, "src/routes", filename)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "export const ignored = true\n")
  }
  const emptyErrors: string[] = []
  await validateWebRouteFiles(root, emptyErrors)
  expect(emptyErrors).toEqual([
    "Web file routes must contain a non-root route module beyond __root"
  ])
  await rm(path.join(root, "src/routes/types.d.ts"))
  await mkdir(path.join(root, "src/routes/workspace"))
  await writeFile(path.join(root, "src/routes/workspace/test.tsx"), "export const Route = {}\n")
  const validErrors: string[] = []
  await validateWebRouteFiles(root, validErrors)
  expect(validErrors).toEqual([])
})
