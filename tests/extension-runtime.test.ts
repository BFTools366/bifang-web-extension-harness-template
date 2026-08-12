import { describe, expect, test } from "vitest"
import { findExternalizedRuntimeDependencies } from "../.harness/tooling/validate.ts"

describe("extension browser bundle contract", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  test("detects Parcel dependency maps that leave package imports external", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 bundle 变量供当前逻辑使用。
    const bundle = `({entry:[function(require){require("react/jsx-runtime")},{"react/jsx-runtime":"react/jsx-runtime","@mantine/core/styles.css":"@mantine/core/styles.css","jotai":"internal-id"}]})`

    expect(
      findExternalizedRuntimeDependencies(bundle, ["react", "@mantine/core", "jotai"])
    ).toEqual(["@mantine/core/styles.css", "react/jsx-runtime"])
  })

  test("ignores bundled package imports and unrelated self-mappings", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 bundle 变量供当前逻辑使用。
    const bundle = `({entry:[function(require){require("react/jsx-runtime")},{"react/jsx-runtime":"parcel-id","feature":"feature"}]})`

    expect(findExternalizedRuntimeDependencies(bundle, ["react"])).toEqual([])
  })
})
