import { readFile } from "node:fs/promises"
import path from "node:path"

/** 保存 Version.md 唯一允许的发布状态。 */
const RELEASE_STATUSES = new Set(["Released", "Unreleased"])

/** 判断 12 位上海时间版本是否是合法的自然日分钟。 */
function isValidShanghaiMinute(value: string): boolean {
  const match = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})(?<hour>\d{2})(?<minute>\d{2})$/u.exec(
    value
  )
  if (match?.groups === undefined) return false
  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  const hour = Number(match.groups.hour)
  const minute = Number(match.groups.minute)
  const calendar = new Date(Date.UTC(year, month - 1, day))
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() + 1 === month &&
    calendar.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59
  )
}

/** 校验 Harness 当前版本事实源的唯一字段、格式和值域。 */
export async function validateHarnessVersion(root: string, errors: string[]): Promise<void> {
  const source = (await readFile(path.join(root, "Version.md"), "utf8"))
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
  const versions = [...source.matchAll(/^- 当前版本：`([^`]+)`$/gmu)].map((match) => match[1] ?? "")
  const timezones = [...source.matchAll(/^- 版本时区：`([^`]+)`$/gmu)].map(
    (match) => match[1] ?? ""
  )
  const formats = [...source.matchAll(/^- 版本格式：`([^`]+)`$/gmu)].map((match) => match[1] ?? "")
  const statuses = [...source.matchAll(/^- 发布状态：([^\n]+)$/gmu)].map((match) =>
    (match[1] ?? "").trim()
  )
  const versionFieldCount = [...source.matchAll(/^- 当前版本：/gmu)].length
  const timezoneFieldCount = [...source.matchAll(/^- 版本时区：/gmu)].length
  const formatFieldCount = [...source.matchAll(/^- 版本格式：/gmu)].length
  const statusFieldCount = [...source.matchAll(/^- 发布状态：/gmu)].length

  if (
    versionFieldCount !== 1 ||
    versions.length !== 1 ||
    !isValidShanghaiMinute(versions[0] ?? "")
  ) {
    errors.push("Version.md must contain one valid 12-digit Shanghai minute version")
  }
  if (timezoneFieldCount !== 1 || timezones.length !== 1 || timezones[0] !== "Asia/Shanghai") {
    errors.push("Version.md version timezone must exactly equal Asia/Shanghai")
  }
  if (formatFieldCount !== 1 || formats.length !== 1 || formats[0] !== "YYYYMMDDHHMM") {
    errors.push("Version.md version format must exactly equal YYYYMMDDHHMM")
  }
  if (statusFieldCount !== 1 || statuses.length !== 1 || !RELEASE_STATUSES.has(statuses[0] ?? "")) {
    errors.push("Version.md release status must be exactly Released or Unreleased")
  }
}
