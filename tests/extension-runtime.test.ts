import { describe, expect, test } from "vitest"
import { findExternalizedRuntimeDependencies } from "../.harness/tooling/validate.ts"

describe("extension browser bundle contract", () => {
  test("detects Parcel dependency maps that leave package imports external", () => {
    const bundle = `({entry:[function(require){require("react/jsx-runtime")},{"react/jsx-runtime":"react/jsx-runtime","@mantine/core/styles.css":"@mantine/core/styles.css","jotai":"internal-id"}]})`

    expect(
      findExternalizedRuntimeDependencies(bundle, ["react", "@mantine/core", "jotai"])
    ).toEqual(["@mantine/core/styles.css", "react/jsx-runtime"])
  })

  test("ignores bundled package imports and unrelated self-mappings", () => {
    const bundle = `({entry:[function(require){require("react/jsx-runtime")},{"react/jsx-runtime":"parcel-id","feature":"feature"}]})`

    expect(findExternalizedRuntimeDependencies(bundle, ["react"])).toEqual([])
  })
})
