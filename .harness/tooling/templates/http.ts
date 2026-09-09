import type { ProjectConfig } from "../types.ts"
import { HTTP_CLIENT_SOURCE } from "./http-client.ts"
import { HTTP_CLIENT_TEST } from "./http-client-test.ts"
import { languageSource, languageTest } from "./http-language.ts"

// 执行 httpFiles 函数的处理逻辑。
export function httpFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    ["src/i18n/language.ts", languageSource()],
    ["src/i18n/language.test.ts", languageTest(config)],
    ["src/api/client/httpClient.ts", HTTP_CLIENT_SOURCE],
    ["src/api/client/httpClient.test.ts", HTTP_CLIENT_TEST]
  ])
}
