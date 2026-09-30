/** 生成两个宿主各自持有的品牌色阶与外观切换基础。 */
export function themeFiles(): Map<string, string> {
  return new Map<string, string>([
    [
      "src/theme/brandScale.ts",
      `import type { MantineColorsTuple } from "@mantine/core"

/** 让自动黑白前景色在不透明品牌底色上满足普通文字 4.5:1 对比度。 */
export const BRAND_TEXT_LUMINANCE_THRESHOLD = 0.179

/** 以已校验的品牌色生成不同亮度的十阶主题色。 */
export function createBrandScale(primaryColor: string): MantineColorsTuple {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(primaryColor.slice(offset, offset + 2), 16)
  )
  const average = channels.reduce((sum, channel) => sum + channel, 0) / 3
  const balanced = channels.map((channel) =>
    average < 38
      ? Math.round(channel * 0.7 + 255 * 0.3)
      : average > 217
        ? Math.round(channel * 0.7)
        : channel
  )
  const shade = (target: number, weight: number) =>
    "#" +
    balanced
      .map((channel) =>
        Math.round(channel * (1 - weight) + target * weight)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  return [
    shade(255, 0.94),
    shade(255, 0.84),
    shade(255, 0.7),
    shade(255, 0.54),
    shade(255, 0.36),
    shade(255, 0.18),
    shade(0, 0),
    shade(0, 0.18),
    shade(0, 0.36),
    shade(0, 0.54)
  ]
}
`
    ],
    [
      "src/theme/brandScale.test.ts",
      `import { expect, test } from "vitest"
import { BRAND_TEXT_LUMINANCE_THRESHOLD, createBrandScale } from "./brandScale"

/** 验证中间品牌色和极端输入都生成可区分的十阶色。 */
test("creates distinct light and dark brand shades", () => {
  for (const color of ["#5B5BD6", "#000000", "#FFFFFF"]) {
    const shades = createBrandScale(color)
    expect(shades).toHaveLength(10)
    expect(new Set(shades).size).toBe(10)
    expect(shades.every((shade) => /^#[0-9a-f]{6}$/u.test(shade))).toBe(true)
  }
  expect(createBrandScale("#5B5BD6")[6]).toBe("#5b5bd6")
})

/** 验证合法品牌色的所有填充色阶均可配出 AA 普通文字对比度。 */
test("keeps automatic brand text contrast above 4.5 to 1", () => {
  for (const color of ["#FF0000", "#808080", "#777777", "#000000", "#FFFFFF", "#00FF00", "#0000FF"]) {
    for (const shade of createBrandScale(color)) {
      // 按 WCAG 相对亮度公式独立计算，避免测试复用主题选择实现。
      const linearChannel = (offset: number) => {
        const channel = Number.parseInt(shade.slice(offset, offset + 2), 16) / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      }
      const background =
        linearChannel(1) * 0.2126 + linearChannel(3) * 0.7152 + linearChannel(5) * 0.0722
      const contrast = background > BRAND_TEXT_LUMINANCE_THRESHOLD
        ? (background + 0.05) / 0.05
        : 1.05 / (background + 0.05)
      expect(contrast, color + " " + shade).toBeGreaterThanOrEqual(4.5)
    }
  }
})
`
    ],
    [
      "src/theme/ColorSchemeControl.tsx",
      `import { NativeSelect, SegmentedControl, useMantineColorScheme } from "@mantine/core"
import { useTranslation } from "react-i18next"

/** 限制紧凑外观选择只在 Popup 使用。 */
interface ColorSchemeControlProps {
  compact?: boolean
}

/** 为当前页面提供跟随系统、亮色与暗色的可访问外观选择。 */
export function ColorSchemeControl({ compact = false }: ColorSchemeControlProps) {
  const { t } = useTranslation()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const data = [
    { value: "auto", label: t("colorSchemeAuto") },
    { value: "light", label: t("colorSchemeLight") },
    { value: "dark", label: t("colorSchemeDark") }
  ]
  const selectColorScheme = (value: string) => {
    if (value === "auto" || value === "light" || value === "dark") {
      setColorScheme(value)
    }
  }

  if (compact) {
    return (
      <NativeSelect
        label={t("colorSchemeLabel")}
        size="sm"
        data={data}
        value={colorScheme}
        onChange={(event) => selectColorScheme(event.currentTarget.value)}
      />
    )
  }

  return <SegmentedControl aria-label={t("colorSchemeLabel")} size="xs" value={colorScheme} onChange={selectColorScheme} data={data} />
}
`
    ]
  ])
}
