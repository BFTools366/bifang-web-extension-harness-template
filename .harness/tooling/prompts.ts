import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"

interface PromptDefaults {
  projectType?: string
  name?: string
  id?: string
  description?: string
  brandColor?: string
  developmentBaseUrl?: string
  testBaseUrl?: string
  releaseBaseUrl?: string
}

export interface PromptedIdentity {
  projectType: string
  name: string
  id: string
  description: string
  brandColor: string
  developmentBaseUrl: string
  testBaseUrl: string
  releaseBaseUrl: string
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function promptForIdentity(defaults: PromptDefaults): Promise<PromptedIdentity> {
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    let projectType = defaults.projectType
    if (projectType === undefined) {
      const answer = (await prompt.question("项目类型（1 = Web，2 = Chrome 扩展）：")).trim()
      projectType = answer === "1" ? "web" : answer === "2" ? "extension" : answer
    }

    const name = defaults.name ?? (await prompt.question("项目显示名称：")).trim()
    const suggestedId = slugify(name)
    const idAnswer =
      defaults.id ??
      (await prompt.question(`项目 id${suggestedId === "" ? "" : `［${suggestedId}］`}：`)).trim()
    const id = idAnswer === "" ? suggestedId : idAnswer
    const description = defaults.description ?? (await prompt.question("项目描述：")).trim()
    const colorAnswer =
      defaults.brandColor ?? (await prompt.question("品牌颜色［#4C6EF5］：")).trim()
    const developmentBaseUrl =
      defaults.developmentBaseUrl ??
      (await prompt.question("Development API BaseURL（http/https）：")).trim()
    const testBaseUrl =
      defaults.testBaseUrl ?? (await prompt.question("Test API BaseURL（http/https）：")).trim()
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

export function isInteractiveTerminal(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true
}
