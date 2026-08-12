import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"

// 定义 PromptDefaults 接口的结构契约。
interface PromptDefaults {
  // 描述 projectType 接口成员的结构契约。
  projectType?: string
  // 描述 name 接口成员的结构契约。
  name?: string
  // 描述 id 接口成员的结构契约。
  id?: string
  // 描述 description 接口成员的结构契约。
  description?: string
  // 描述 brandColor 接口成员的结构契约。
  brandColor?: string
  // 描述 developmentBaseUrl 接口成员的结构契约。
  developmentBaseUrl?: string
  // 描述 testBaseUrl 接口成员的结构契约。
  testBaseUrl?: string
  // 描述 releaseBaseUrl 接口成员的结构契约。
  releaseBaseUrl?: string
}

// 定义 PromptedIdentity 接口的结构契约。
export interface PromptedIdentity {
  // 描述 projectType 接口成员的结构契约。
  projectType: string
  // 描述 name 接口成员的结构契约。
  name: string
  // 描述 id 接口成员的结构契约。
  id: string
  // 描述 description 接口成员的结构契约。
  description: string
  // 描述 brandColor 接口成员的结构契约。
  brandColor: string
  // 描述 developmentBaseUrl 接口成员的结构契约。
  developmentBaseUrl: string
  // 描述 testBaseUrl 接口成员的结构契约。
  testBaseUrl: string
  // 描述 releaseBaseUrl 接口成员的结构契约。
  releaseBaseUrl: string
}

// 执行 slugify 函数的处理逻辑。
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// 执行 promptForIdentity 函数的处理逻辑。
export async function promptForIdentity(defaults: PromptDefaults): Promise<PromptedIdentity> {
  // 保存 prompt 变量供当前逻辑使用。
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    // 保存 projectType 变量供当前逻辑使用。
    let projectType = defaults.projectType
    if (projectType === undefined) {
      // 保存 answer 变量供当前逻辑使用。
      const answer = (await prompt.question("项目类型（1 = Web，2 = Chrome 扩展）：")).trim()
      projectType = answer === "1" ? "web" : answer === "2" ? "extension" : answer
    }

    // 保存 name 变量供当前逻辑使用。
    const name = defaults.name ?? (await prompt.question("项目显示名称：")).trim()
    // 保存 suggestedId 变量供当前逻辑使用。
    const suggestedId = slugify(name)
    // 保存 idAnswer 变量供当前逻辑使用。
    const idAnswer =
      defaults.id ??
      (await prompt.question(`项目 id${suggestedId === "" ? "" : `［${suggestedId}］`}：`)).trim()
    // 保存 id 变量供当前逻辑使用。
    const id = idAnswer === "" ? suggestedId : idAnswer
    // 保存 description 变量供当前逻辑使用。
    const description = defaults.description ?? (await prompt.question("项目描述：")).trim()
    // 保存 colorAnswer 变量供当前逻辑使用。
    const colorAnswer =
      defaults.brandColor ?? (await prompt.question("品牌颜色［#4C6EF5］：")).trim()
    // 保存 developmentBaseUrl 变量供当前逻辑使用。
    const developmentBaseUrl =
      defaults.developmentBaseUrl ??
      (await prompt.question("Development API BaseURL（http/https）：")).trim()
    // 保存 testBaseUrl 变量供当前逻辑使用。
    const testBaseUrl =
      defaults.testBaseUrl ?? (await prompt.question("Test API BaseURL（http/https）：")).trim()
    // 保存 releaseBaseUrl 变量供当前逻辑使用。
    const releaseBaseUrl =
      defaults.releaseBaseUrl ?? (await prompt.question("Release API BaseURL（https）：")).trim()

    return {
      projectType,
      name,
      id,
      description,
      brandColor: colorAnswer === "" ? "#4C6EF5" : colorAnswer,
      developmentBaseUrl,
      testBaseUrl,
      releaseBaseUrl
    }
  } finally {
    prompt.close()
  }
}

// 执行 isInteractiveTerminal 函数的处理逻辑。
export function isInteractiveTerminal(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true
}
