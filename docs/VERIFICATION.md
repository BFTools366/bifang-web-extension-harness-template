# 验证记录

## 原则

- 只报告真实执行的命令、候选、环境、结果和未覆盖范围；未运行写“未执行”，未验证写 `Unverified`。
- 日常开发只运行本次变化需要的相关非空测试或最小替代检查，不自动追加格式、lint、类型、全仓检查或构建；行为保持的结构重构运行全量测试。
- 源 Harness 完整验收验证 validator、维护 helper、两类源外实例化结果和当前发布规则，不把模板源码、Mock、开发预览或内部函数调用当作最终产物证据。
- Web 最终候选必须是当前源码经唯一 `pnpm build -- --e2e=enabled|disabled` 生成的 Vite `dist`；Extension 还需由同一 Release profile 生成当前 Chrome MV3 zip。
- 每次构建前单独取得当前 E2E 选择；持久 `milestone_e2e` 只提供建议默认值。只有选择启用或用户、产品、安全、渠道存在浏览器硬要求时执行真实 Chrome。
- 有用户要求的活动 Work Plan 时，相关 Todo 必须全部完成；没有 Work Plan 不阻断用户明确要求的完整验收。
- 单元测试可隔离外部依赖，但不能替代真实候选运行。必需门禁失败、超时、取消或已选未执行都会拒绝候选并返回开发循环。
- 发布、push、tag、部署、上传、商店提交和生产副作用仍分别需要明确授权；验证通过不自动授予这些权限。

## 当前矩阵

| 层级             | 必需证据                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| 源结构           | `pnpm validate:harness`：文件、Skills、日期记忆、Markdown 链接、policy、注释、行数与初始化静态契约           |
| 源行为           | `pnpm lint`、`pnpm typecheck`、非空 `pnpm test` 与相关 helper 隔离 Git 回归                                  |
| Web 实例化       | 源外空目录、单一 `projectType=web`、无派生入口、三环境有效、独立 Git 根                                      |
| Extension 实例化 | 源外空目录、单一 `projectType=extension`、最小 MV3 权限、无 Web Router/另一宿主、独立 Git 根                 |
| Web 候选         | 唯一 Release build、版本注入、敏感信息扫描、Vite `dist`，以及当次适用的真实 Chrome 证据                      |
| Extension 候选   | 唯一 Release build、版本/manifest/权限/敏感信息检查、同 profile zip，以及当次适用的真实 Chrome 证据          |
| 源发布           | `Version.md` 为 Shanghai 时间版本 `Released`，提交完整，工作树 clean，`HEAD == origin/master` 且远端回读一致 |

桌面客户端、Rust/Tauri、桌面打包、签名、公证和桌面发布验证不属于本仓库。
