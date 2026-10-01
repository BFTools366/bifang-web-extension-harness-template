import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"

/** 锁定活动 Work Plan Todo 允许的四种状态。 */
const WORK_PLAN_TODO_STATES = new Set(["pending", "in_progress", "blocked", "done"])

/** 描述从活动 Work Plan 中解析出的一个稳定 Todo。 */
interface WorkPlanTodo {
  /** 保存稳定 Todo ID。 */
  id: string
  /** 保存显式 Todo 状态。 */
  state: string
}

/** 把一个 Markdown 表格行解析成去除外围空白的单元格。 */
function markdownTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim())
}

/** 从当前 Web Work Plan 的表格或兼容标题形式读取 Todo 状态。 */
function parseWorkPlanTodos(source: string): WorkPlanTodo[] {
  const todos: WorkPlanTodo[] = []
  const lines = source.replace(/\r\n?/gu, "\n").split("\n")
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index]
    const separatorLine = lines[index + 1]
    if (headerLine === undefined || separatorLine === undefined) continue
    const header = markdownTableCells(headerLine)
    const separator = markdownTableCells(separatorLine)
    const idIndex = header.indexOf("ID")
    const stateIndex = header.indexOf("状态")
    if (
      idIndex < 0 ||
      stateIndex < 0 ||
      separator.length !== header.length ||
      !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))
    ) {
      continue
    }
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex]
      if (line === undefined) break
      if (!line.trim().startsWith("|")) break
      const cells = markdownTableCells(line)
      const id = cells[idIndex]
      const state = cells[stateIndex]
      if (id !== undefined && state !== undefined && id.length > 0) todos.push({ id, state })
    }
    break
  }

  if (todos.length > 0) return todos
  for (const match of source.matchAll(
    /^###\s+(?<id>[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+).*?[（(](?<state>pending|in_progress|blocked|done)[）)]/gmu
  )) {
    const id = match.groups?.id
    const state = match.groups?.state
    if (id !== undefined && state !== undefined) todos.push({ id, state })
  }
  return todos
}

/** 判断计划正文是否写入了候选验收或发布就绪的肯定结论。 */
function hasAcceptanceOrReadinessVerdict(source: string): boolean {
  const patterns = [
    /^\s*(?:[-*]\s*)?(?:(?:当前)?(?:候选|完整|技术)?验收|候选|发布)(?:状态|结论)\s*[：:]\s*`?(?:(?:Technically|Milestone)\s+accepted|accepted|ready|passed|已验收|已通过|通过|已就绪|可发布)(?=\s|`|[。；;，,]|$)/imu,
    /^\s*(?:[-*]\s*)?发布就绪\s*[：:]\s*`?(?:ready|passed|已就绪|可发布)(?=\s|`|[。；;，,]|$)/imu,
    /^\s*(?:[-*]\s*)?(?:Candidate|Acceptance|Release)\s+(?:status|verdict|readiness)\s*[：:]\s*`?(?:(?:Technically|Milestone)\s+accepted|accepted|ready|passed)(?=\s|`|[。；;，,]|$)/imu,
    /^\s*(?:[-*]\s*)?(?:Milestone|Candidate|Release)\s+(?:accepted|ready|passed)\s*`?\s*$/imu
  ]
  return patterns.some((pattern) => pattern.test(source))
}

/** 校验活动 Work Plan 的稳定 Todo 状态与候选结论不会互相矛盾。 */
async function validateWorkPlanTodoSemantics(planPath: string, errors: string[]): Promise<void> {
  const source = await readFile(planPath, "utf8")
  if (!source.includes("## Todo")) {
    errors.push(`active Work Plan has no Todo section: ${planPath}`)
    return
  }
  const todos = parseWorkPlanTodos(source)
  if (todos.length === 0) {
    errors.push(`active Work Plan has no stable Todo IDs: ${planPath}`)
    return
  }
  const duplicates = [...new Set(todos.map((todo) => todo.id))].filter(
    (id) => todos.filter((todo) => todo.id === id).length > 1
  )
  if (duplicates.length > 0) {
    errors.push(`active Work Plan contains duplicate Todo IDs: ${duplicates.sort().join(", ")}`)
  }
  for (const todo of todos) {
    if (!WORK_PLAN_TODO_STATES.has(todo.state)) {
      errors.push(`Work Plan Todo ${todo.id} has invalid state: ${todo.state}`)
    }
  }
  if (todos.some((todo) => todo.state !== "done") && hasAcceptanceOrReadinessVerdict(source)) {
    errors.push(
      `active Work Plan with unfinished Todo must not record an acceptance/readiness verdict: ${planPath}`
    )
  }
}

/** 描述一种按日 Harness 记忆的目录、命名和索引契约。 */
interface DailyMemoryContract {
  /** 保存 docs 下的目录名。 */
  directory: string
  /** 保存日期正文的唯一合法文件名。 */
  pattern: RegExp
  /** 保存人类可读记忆类型。 */
  label: string
  /** 保存索引必须表达的稳定规则。 */
  indexFragments: readonly string[]
  /** 保存当前允许的非日期历史卷。 */
  historyFiles?: readonly string[]
}

/** 锁定五类按日项目记忆的命名和触发语义。 */
const DAILY_MEMORY_CONTRACTS: readonly DailyMemoryContract[] = [
  {
    directory: "product_spec",
    pattern: /^\d{8}_product_spec\.md$/u,
    label: "Product Spec",
    indexFragments: [
      "同一天只维护一份产品规格",
      "产品目标、公开边界、约束或成功标准真实变化时",
      "只保留日期最新的规格文件"
    ]
  },
  {
    directory: "project_status",
    pattern: /^\d{8}_product_status\.md$/u,
    label: "Product Status",
    indexFragments: [
      "重要阻断、跨会话交接、真实发布完成或用户明确要求时",
      "同一天只维护一份产品状态",
      "只保留日期最新的状态文件"
    ]
  },
  {
    directory: "work_plan",
    pattern: /^\d{8}_work_plan\.md$/u,
    label: "Work Plan",
    indexFragments: [
      "用户明确要求持久计划、任务需要跨会话交接",
      "多步骤、多模块、中等风险或可并行本身不构成准入",
      "只保留当前活动计划"
    ]
  },
  {
    directory: "adr",
    pattern: /^\d{8}_ADR\.md$/u,
    label: "ADR",
    indexFragments: ["长期重要且难以逆转", "同一天只维护一份", "$web-curate-harness-memory"],
    historyFiles: ["ADR_history.md"]
  },
  {
    directory: "changelog",
    pattern: /^\d{8}_CHANGELOG\.md$/u,
    label: "Changelog",
    indexFragments: [
      "同一天的实际变化持续更新同一文件",
      "普通缺陷修复、行为保持重构",
      "$web-curate-harness-memory"
    ],
    historyFiles: ["CHANGELOG_history.md"]
  }
]

/** 判断八位日期前缀是真实公历日期。 */
function validDatePrefix(filename: string): boolean {
  const match = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})/u.exec(filename)
  if (match?.groups === undefined) return false
  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** 校验五类当前记忆都只有一个完整日期快照且索引一致。 */
export async function validateDailyHarnessMemory(root: string, errors: string[]): Promise<void> {
  const docsRoot = path.join(root, "docs")
  for (const legacy of [
    "CHANGELOG.md",
    "docs/DECISIONS.md",
    "docs/PRODUCT_SPEC.md",
    "docs/PROJECT_STATUS.md",
    "docs/WORK_PLAN.md"
  ]) {
    const absolute = path.join(root, legacy)
    await lstat(absolute).then(
      () => errors.push(`legacy growing memory path must be removed: ${legacy}`),
      (error: unknown) => {
        if ((error as { code?: unknown }).code !== "ENOENT") throw error
      }
    )
  }
  for (const contract of DAILY_MEMORY_CONTRACTS) {
    const directory = path.join(docsRoot, contract.directory)
    const status = await lstat(directory).catch((error: unknown) => {
      if ((error as { code?: unknown }).code === "ENOENT") return undefined
      throw error
    })
    if (status === undefined || status.isSymbolicLink() || !status.isDirectory()) {
      errors.push(`missing or unsafe daily ${contract.label} directory: docs/${contract.directory}`)
      continue
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      errors.push(`cannot read daily ${contract.label} directory: docs/${contract.directory}`)
      throw error
    })
    const indexEntry = entries.find((entry) => entry.name === "README.md" && entry.isFile())
    if (indexEntry === undefined) {
      errors.push(`missing daily ${contract.label} index: docs/${contract.directory}/README.md`)
    }
    const dated: string[] = []
    for (const entry of entries) {
      if (!entry.isFile() || entry.name === "README.md") continue
      if (contract.historyFiles?.includes(entry.name) === true) continue
      if (!contract.pattern.test(entry.name) || !validDatePrefix(entry.name)) {
        errors.push(
          `invalid daily ${contract.label} filename: docs/${contract.directory}/${entry.name}`
        )
      } else {
        dated.push(entry.name)
      }
    }
    dated.sort()
    // Work Plan 只在存在活动计划时保留一份，其余记忆类型固定保留一份当前快照。
    const minimum = contract.directory === "work_plan" ? 0 : 1
    if (dated.length < minimum || dated.length > 1) {
      errors.push(
        `daily ${contract.label} must retain ${minimum === 0 ? "at most" : "exactly"} one current snapshot: docs/${contract.directory}`
      )
    }
    if (indexEntry !== undefined) {
      const index = await readFile(path.join(directory, "README.md"), "utf8")
      for (const fragment of contract.indexFragments) {
        if (!index.includes(fragment)) {
          errors.push(`daily ${contract.label} index is missing rule: ${fragment}`)
        }
      }
      for (const filename of dated) {
        if (!index.includes(filename)) {
          errors.push(`daily ${contract.label} index does not link current file: ${filename}`)
        }
      }
    }
    if (contract.directory === "work_plan") {
      for (const filename of dated) {
        await validateWorkPlanTodoSemantics(path.join(directory, filename), errors)
      }
    }
  }
}
