import { createHash } from "node:crypto"
import path from "node:path"
import { expect, test } from "vitest"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import {
  options,
  readdir,
  repositoryRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 契约快照保持原始 BOM、换行及摘要，随后发生的失败仍完整回滚。 */
test.each(["", "\uFEFF"])("接口契约原文字节保留 %#", async (bom) => {
  const parent = await temporaryDirectory("api-contract-encoding-")
  const apiContract = path.join(parent, "contract.txt")
  const content = bom + "openapi: 3.1.0\r\n"
  await writeFile(apiContract, content)
  const targetRoot = path.join(parent, "example")
  const supplied = { ...options(targetRoot, "web"), id: "example" }
  await expect(
    instantiateProject(
      { sourceRoot: repositoryRoot, targetRoot, init: { ...supplied, apiContract } },
      async (staged) => {
        expect(staged.apiContractSnapshot).toEqual({
          content,
          sha256: createHash("sha256").update(content).digest("hex")
        })
        throw new Error("已验证快照，回收测试事务")
      }
    )
  ).rejects.toThrow("已验证快照，回收测试事务")
  expect(await readdir(parent)).toEqual(["contract.txt"])
})

/** 非法 UTF-8 在任何目标写入前拒绝，不用替换字符改写契约。 */
test("接口契约拒绝非法 UTF-8", async () => {
  const parent = await temporaryDirectory("api-contract-invalid-")
  const apiContract = path.join(parent, "contract.txt")
  await writeFile(apiContract, Buffer.from([0xff]))
  const targetRoot = path.join(parent, "example")
  await expect(
    instantiateProject({
      sourceRoot: repositoryRoot,
      targetRoot,
      init: { ...options(targetRoot, "web"), apiContract }
    })
  ).rejects.toThrow(/encoded|encoding/i)
  expect(await readdir(parent)).toEqual(["contract.txt"])
})
