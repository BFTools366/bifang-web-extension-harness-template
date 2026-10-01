import { cp, path, repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"

/** 锁定 React Web 列表页 Skill 必须完整分发的资产与参考资料。 */
export const LIST_VIEW_REQUIRED_FILES = [
  ".agents/skills/web-implement-list-view/assets/ListPage.contracts.test.ts",
  ".agents/skills/web-implement-list-view/assets/listPageState.ts",
  ".agents/skills/web-implement-list-view/references/checklist.md",
  ".agents/skills/web-implement-list-view/references/mantine-api.md",
  ".agents/skills/web-implement-list-view/references/offset-list-pattern.md",
  ".agents/skills/web-implement-list-view/assets/listPageStorage.ts",
  ".agents/skills/web-implement-list-view/assets/listColumnPreferences.ts"
] as const

/** 复制不含 Git 与依赖目录的源 Harness，供破坏性验证器负例隔离使用。 */
export async function copyRepositoryForValidation(): Promise<string> {
  const parent = await temporaryDirectory("web-harness-list-view-validator-")
  const targetRoot = path.join(parent, "repository")
  await cp(repositoryRoot, targetRoot, {
    recursive: true,
    /** 排除不属于模板验证输入的 Git 元数据与项目依赖目录。 */
    filter(source) {
      const relative = path.relative(repositoryRoot, source)
      const topLevel = relative.split(path.sep)[0]
      return topLevel !== ".git" && topLevel !== "node_modules"
    }
  })
  return targetRoot
}
