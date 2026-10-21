---
name: go-implement-verification
description: 在已确认验证或找回需求中实施验证码生命周期与投递；真实 SMTP 为默认，仅用户明确授权时采用 dev 注册模拟，保留真实校验与单次消费。
---

# Web Harness：实施验证码与投递

消费已确认的用户域范围、真实服务归属和[身份生成合同](../web-compose-capabilities/knowledge/identity.md#邮箱注册与验证码的生成合同)，完成后返回调用方。注册验证码、找回和短信分别判定，不从基础登录或邮箱字段自动启用；已有会话中的明确 Mock 选择直接沿用，不再索要 SMTP 或测试收件方。

## 实施与配置

首次自建邮箱注册通过 [注册 overlay](scripts/registration.ts) 和 [账号装配器](../go-implement-service/scripts/install-users.ts) 的 --operations register,login,profile,logout,verification 在同一冻结 Map 校准；不修改带摘要的原始 Go 快照，不覆盖已有业务文件。已存在服务按真实合同增量实施，短信或其他通道不由邮箱资产推断。

- 默认未选验证时 enabled=false、mock=false，页面、发码路由和验证码表均不生成。
- 明确选择验证时安装目标锁、预留状态、验证码模型和真实发码路由，配置 enabled=true。SMTP overlay 使用标准库、STARTTLS/隐式 TLS、超时和可取消连接；服务端配置 provider=smtp、smtp.host/port/from、tls_mode、timeout，账号密码必须同时有或同时无。秘密只在服务端，配置不完整明确报错。
- 用户明确要求先 Mock 时，仅在 dev 配置 enabled=true、mock=true；随机数字码在注册回执可见，UI 标明“开发模拟 · 未发送邮件”并支持填入。它只模拟邮件投递，账号、仓储、用途校验及消费仍由真实服务完成。mock 默认关闭，test/staging/prod 拒绝启动，找回发码拒绝 Mock。切回真实邮件必须显式 mock=false，不能只补 SMTP 配置。
- 未配置真实 provider 且没有明确 Mock 授权时报告缺口并仅询问当前依赖的投递信息；不得暗中启用 Mock、固定码或未配置 Sender。实际短信需求另按授权实现，不沿用邮箱返回假成功。

## 生命周期与响应

crypto/rand 生成并哈希持久化。规范化 target/type/scene 后首先事务锁定目标，检查重发和每日限额并预留 Delivering 记录及 latest 指针；新邮箱无账号时也必须串行。事务外单次发送，再次锁定并核对 latest 后作废旧码、激活新码。失败或未知保留额度事实，不自动重发，迟到发送不得激活旧预留。绝不向日志、URL 或前端持久存储写明文验证码。

注册发码回执明确 expires_at（Unix 秒）、expires_in/重发间隔（秒）、code_length 和 mock；真实响应必须省略 code。UI 用统一匿名 typed adapter，核对场景、期限、码长及开发边界。注册装配的发码入口规范 scene 后只允许 register，其他用途明确拒绝。独立接线找回时采用 [找回发码辅助](assets/password-reset/internal/api/v1/password_reset.go.txt)，对合法已存在/不存在邮箱使用相同防枚举反馈；先解析规范 scene 再分派，不能通过大小写或空格绕过。

校验与消费分离；消费在账号/组织/owner 或改密的同一事务里，条件同时复核状态、期限和尝试次数。任何资源写入失败都回滚消费。注册成功后由唯一会话显式登录；只重试登录或查询未知结果，不自动重放注册。

## 验证

生成工程使用隔离 SQLite，覆盖成功、缺码/错码/过期/用途/尝试上限、重发作废、同一新邮箱并发限额、并发单次消费和 owner 写入失败回滚；非 dev Mock 拒绝，SMTP 使用本机协议测试。真实通道交付还需经授权收件方证明实际接收与一次消费；开发 Mock 只报告模拟投递，不声称真实邮件已发出。前端覆盖更换邮箱、A→B→A 迟到、取消/卸载、重发倒计时恢复及注册已成功只重试登录。
