import { readFile } from "node:fs/promises"
import path from "node:path"
import { TextDecoder } from "node:util"

/** 锁定根 Agent 入口允许的最大 UTF-8 字节数。 */
export const AGENTS_MAX_UTF8_BYTES = 20_000
/** 锁定根 Agent 入口允许的最大物理行数。 */
export const AGENTS_MAX_LINES = 120

/** 锁定轻量入口必须按顺序保留的稳定路由章节。 */
export const AGENTS_REQUIRED_HEADINGS = [
  "## 项目使命",
  "## 启动门禁",
  "## 按任务渐进读取",
  "## 始终生效的边界",
  "## Skills 地图",
  "## 约束地图",
  "## 每次任务的最小闭环"
] as const

/** 锁定入口必须表达的渐进读取、源范围与最小闭环语义。 */
export const AGENTS_REQUIRED_FRAGMENTS = [
  "先判定任务类型",
  "只读取下表命中的事实来源",
  "冲突或缺失时才扩大读取",
  "不一次加载全部文档、历史或 Skills",
  "命中后必须完整读取对应 `SKILL.md`",
  "只接受 Harness 自身维护",
  "产品目的、业务功能、产品专属 UI/文案/数据",
  "不得在模板源中接收、分析、记录或实施",
  "`superpowers: disabled`",
  "`Task {序号} | {当前进度} | {单一结果}`",
  "`user_owned_tasks: disabled`",
  "`已分配`、`运行中`、`检查中`、`已完成`",
  "对“完成”“可用”或“已验证”的声明",
  "不覆盖或撤销用户",
  "$web-instantiate-project",
  "$web-upgrade-harness",
  "只读取路由命中的最少事实与 Skills",
  "只运行本次变化需要的测试或最小替代检查",
  "只更新被独立事件触发的权威记录",
  "实际验证、未执行项和剩余风险",
  "`pnpm validate:harness`"
] as const

/** 拒绝把权威文档中的实现级配方重新复制到轻量入口。 */
export const AGENTS_FORBIDDEN_DETAIL_FRAGMENTS = [
  "## 硬约束",
  "`pnpm install --no-frozen-lockfile --prefer-offline`",
  "必须生成 `.env.development`、`.env.test`、`.env.production`",
  "Web 仅公开 `VITE_` 四键",
  "Extension 仅公开 `PLASMO_PUBLIC_` 四键",
  "初始化器生成原生 Fetch、1-based 分页",
  "只在 staging 内定向格式化、验证、执行一次",
  "成功目标无远端且不含 `dist/`、`build/` 或 zip",
  "`build:release` 和 Extension `package` 自动运行 `release:inspect`"
] as const

/** 统计文本物理行数且不把末尾换行计作额外空行。 */
function physicalLineCount(source: string): number {
  if (source.length === 0) return 0
  const normalized = source.replace(/\r\n?/gu, "\n")
  return normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0)
}

/** 校验根 AGENTS.md 保持轻量、可解码并渐进路由到唯一事实源。 */
export async function validateAgentsEntrypoint(root: string, errors: string[]): Promise<void> {
  const relativePath = "AGENTS.md"
  const absolutePath = path.join(root, relativePath)
  let payload: Buffer
  try {
    payload = await readFile(absolutePath)
  } catch (error) {
    errors.push(`cannot read AGENTS entrypoint ${relativePath}: ${String(error)}`)
    return
  }

  let source: string
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(payload)
  } catch (error) {
    errors.push(`AGENTS entrypoint must be UTF-8: ${relativePath}: ${String(error)}`)
    return
  }

  if (payload.byteLength > AGENTS_MAX_UTF8_BYTES) {
    errors.push(
      `AGENTS entrypoint exceeds UTF-8 byte budget: ${relativePath} has ${payload.byteLength} bytes, limit ${AGENTS_MAX_UTF8_BYTES}`
    )
  }
  const lineCount = physicalLineCount(source)
  if (lineCount > AGENTS_MAX_LINES) {
    errors.push(
      `AGENTS entrypoint exceeds line budget: ${relativePath} has ${lineCount} lines, limit ${AGENTS_MAX_LINES}`
    )
  }
  if (!source.startsWith("# AGENTS.md\n") && !source.startsWith("# AGENTS.md\r\n")) {
    errors.push("AGENTS entrypoint must start with '# AGENTS.md': AGENTS.md")
  }

  const positions: number[] = []
  for (const heading of AGENTS_REQUIRED_HEADINGS) {
    const occurrences = source.split(heading).length - 1
    if (occurrences !== 1) {
      errors.push(
        `AGENTS entrypoint heading must appear exactly once: ${heading} (observed ${occurrences})`
      )
    } else {
      positions.push(source.indexOf(heading))
    }
  }
  if (
    positions.length === AGENTS_REQUIRED_HEADINGS.length &&
    positions.some((position, index) => {
      const previous = positions[index - 1]
      return previous !== undefined && position < previous
    })
  ) {
    errors.push("AGENTS entrypoint headings are out of order: AGENTS.md")
  }

  for (const fragment of AGENTS_REQUIRED_FRAGMENTS) {
    if (!source.includes(fragment)) {
      errors.push(`AGENTS progressive-disclosure contract missing: ${fragment}`)
    }
  }
  if (!/^\|\s*约束或事实\s*\|\s*唯一来源\s*\|\s*何时读取\s*\|$/mu.test(source)) {
    errors.push("AGENTS progressive-disclosure contract missing: constraints source map")
  }
  for (const fragment of AGENTS_FORBIDDEN_DETAIL_FRAGMENTS) {
    if (source.includes(fragment)) {
      errors.push(`AGENTS entrypoint duplicates detailed governed rules: ${fragment}`)
    }
  }
}
