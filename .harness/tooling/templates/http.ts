import type { ProjectConfig } from "../types.ts"
import { HTTP_CLIENT_SOURCE } from "./http-client.ts"
import { HTTP_CONTRACTS_SOURCE } from "./http-contracts.ts"
import { HTTP_PROTOCOL_SOURCE } from "./http-protocol.ts"
import { HTTP_CLIENT_TEST } from "./http-client-test.ts"
import { HTTP_TRANSPORT_TEST } from "./http-transport-test.ts"
import { HTTP_TEST_FIXTURES } from "./http-test-fixtures.ts"
import { HTTP_AUTH_TEST } from "./http-auth-test.ts"
import { httpUiTest } from "./http-ui-test.ts"
import { languageSource, languageTest } from "./http-language.ts"
import { HTTP_ERRORS_SOURCE, HTTP_FEEDBACK_SOURCE, HTTP_RUNTIME_SOURCE } from "./http-errors.ts"
import { HTTP_ERROR_VIEW_SOURCE, EXTENSION_HTTP_ROUTE_SOURCE } from "./http-ui.ts"

// 执行 httpFiles 函数的处理逻辑。
export function httpFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    ["src/i18n/language.ts", languageSource()],
    ["src/i18n/language.test.ts", languageTest(config)],
    ["src/data/api/client/httpClient.ts", HTTP_CLIENT_SOURCE],
    ["src/data/api/client/httpContracts.ts", HTTP_CONTRACTS_SOURCE],
    ["src/data/api/client/httpProtocol.ts", HTTP_PROTOCOL_SOURCE],
    ["src/data/api/client/httpClient.test.ts", HTTP_CLIENT_TEST],
    ["src/data/api/client/httpTransport.test.ts", HTTP_TRANSPORT_TEST],
    ["src/data/api/client/httpTestFixtures.ts", HTTP_TEST_FIXTURES],
    ["src/data/api/client/httpInterception.test.ts", HTTP_AUTH_TEST],
    ["src/data/api/client/httpUi.test.tsx", httpUiTest(config.projectType)],
    ["src/data/api/client/httpErrors.ts", HTTP_ERRORS_SOURCE],
    ["src/data/api/client/httpFeedback.ts", HTTP_FEEDBACK_SOURCE],
    ["src/data/api/client/httpRuntime.ts", HTTP_RUNTIME_SOURCE],
    ["src/data/api/client/HttpErrorView.tsx", HTTP_ERROR_VIEW_SOURCE],
    ...(config.projectType === "extension"
      ? [
          ["src/data/api/client/ExtensionRouteErrorPage.tsx", EXTENSION_HTTP_ROUTE_SOURCE] as [
            string,
            string
          ]
        ]
      : [])
  ])
}
