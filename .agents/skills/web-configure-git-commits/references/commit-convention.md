# Web Harness Git 提交消息规范

本规范采用 Conventional Commits 主题，并在非简单变化中保留修改意图、行为变化、影响和真实验证事实。编辑器实际显示的注释模板以 [`../assets/commit-template.txt`](../assets/commit-template.txt) 为准。

## 格式

```text
<type>(<scope>): <summary>

Why:
- 为什么要做这次修改；缺陷修复说明根因

Changes:
- 完成了什么行为或契约变化，不要只罗列文件

Impact:
- 对功能、API、数据、性能或兼容性的影响；没有时写 None

Test:
- 实际执行的命令、场景和结果；未执行时写 Not run: <原因>
```

`scope` 可省略。只有已取得对外契约变化批准时，才可使用 `<type>(<scope>)!: <summary>` 或 `BREAKING CHANGE:` footer，并说明迁移影响；不得用 `!` 或 footer 代替产品范围、兼容契约或发布授权。

## Type

| Type       | 用途                           | Web Harness 示例                                    |
| ---------- | ------------------------------ | --------------------------------------------------- |
| `feat`     | 新增用户或维护者可用能力       | `feat(pagination): persist collection page state`   |
| `fix`      | 修复可复现缺陷                 | `fix(auth): prevent duplicate 401 replay`           |
| `refactor` | 不改变可观察行为的结构调整     | `refactor(http): separate language header handling` |
| `perf`     | 具有真实证据的性能优化         | `perf(routes): reduce initial route bundle size`    |
| `ui`       | UI 或交互调整                  | `ui(options): clarify save feedback`                |
| `style`    | 不影响语义的格式或代码风格变化 | `style: apply prettier`                             |
| `docs`     | 文档变化                       | `docs(api): add pagination examples`                |
| `test`     | 测试或测试基础设施变化         | `test(http): cover timeout recovery`                |
| `build`    | 构建系统、依赖或工具链变化     | `build: update Vite compatibility range`            |
| `ci`       | CI/CD 工作流变化               | `ci: run Web checks on pull requests`               |
| `chore`    | 其他明确的工程维护             | `chore: remove unused assets`                       |
| `revert`   | 明确回滚既有提交               | `revert: revert pagination persistence`             |

工具生成的 merge、revert、fixup 或 squash 消息应保留 Git 必要语义；不要为了套模板破坏自动合并、定向回滚或交互式 rebase 流程。

## Summary 与正文

Summary 回答“这次提交完成了什么有意义的变化”，而不是“改了哪些文件”。使用清晰动词，保持单行、具体、可在日志中独立理解；不以 `update`、`fix bug`、`modify file` 等模糊措辞代替结果。

- `Why` 保留动机、约束或根因，这些信息无法从 diff 恢复。
- `Changes` 描述行为、状态转换或契约，不复制文件清单。
- `Impact` 明确兼容性、数据、性能、API 和用户体验；无明显影响时写 `None`。
- `Test` 只陈述真实执行；未执行必须说明原因，不能把计划写成已通过。
- 关联问题、迁移提示或已批准的 `BREAKING CHANGE:` 可作为 footer；正文不得出现凭据、个人数据或敏感载荷。

## 完整示例

```text
feat(pagination): persist collection page state

Why:
- 用户返回集合页面时会丢失当前页码
- 不同项目和集合需要相互隔离

Changes:
- 按项目与集合 scope 持久化 1-based 页码
- 只在当前请求成功且空页时回退到前一页

Impact:
- 改善返回列表时的定位稳定性
- 不改变服务端 API

Test:
- `pnpm test:related src/pagination/useSessionPagination.ts` 通过
- 空页回退与 scope 隔离回归通过
```

```text
fix(auth): prevent duplicate 401 replay

Why:
- 多个并发请求返回 401 时可能重复触发登录处理
- 根因是请求失败路径没有共享单一重放所有者

Changes:
- 同一认证失效窗口内只调用一次登录 handler
- 每个请求仍保留自己的错误结果

Impact:
- 消除重复登录导航，不修改 token 格式

Test:
- 并发 401 场景下 handler 恰好调用一次
```

## 简单提交

非常简单且意图明确的变化可以只写主题，不要为了形式制造空洞正文：

```text
fix(ui): prevent progress text overflow
docs(readme): clarify installation steps
chore: remove unused dependencies
```

## 原子性

一个提交对应一个完整、独立、可解释的变化。分页状态与无关颜色调整应分开；同一 HTTP 契约中的结构、实现与回归测试应保持在同一提交，不按文件机械切碎。

提交前确认：

1. 提交只表达一个主要目的，checkout 后仓库处于合理状态。
2. Summary 在半年后仍能说明结果。
3. `Why` 解释动机；缺陷修复解释根因。
4. `Changes` 描述行为，不是文件清单。
5. `Impact` 与真实兼容/数据/性能/API 影响一致。
6. `Test` 只记录实际执行，没有把未运行写成通过。
7. 没有混入无关格式化、调试代码、秘密、缓存或临时文件。
