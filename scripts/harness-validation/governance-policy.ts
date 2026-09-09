import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  validateAgentPolicyBody,
  validateAgentPolicyDocument
} from "../../.harness/tooling/agent-policy.ts"

/** 校验源 Harness 的唯一 Agent policy schema、默认值和正文契约。 */
export async function validateSourceAgentPolicy(root: string, errors: string[]): Promise<void> {
  const relativePath = "docs/AGENT_POLICY.md"
  const document = await readFile(path.join(root, relativePath), "utf8")
  errors.push(
    ...[
      ...validateAgentPolicyDocument(document, {
        allowPending: true,
        requireSourceDefaults: true
      }),
      ...validateAgentPolicyBody(document)
    ].map((message) => `${relativePath}: ${message}`)
  )
}
