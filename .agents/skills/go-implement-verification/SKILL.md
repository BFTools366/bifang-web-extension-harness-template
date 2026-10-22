---
name: go-implement-verification
description: 为自建邮箱注册默认接入验证码；无邮件服务时默认开发模拟投递并在表单显示，真实投递后移除回显，保留真实校验与单次消费。
---

# Web Harness：实施验证码与投递

消费已确认的用户域范围、真实服务归属和[身份生成合同](../web-compose-capabilities/knowledge/identity.md#邮箱注册与验证码的生成合同)，完成后返回调用方。自建邮箱注册默认启用验证码；未配置邮件服务时开发环境默认模拟投递，不再询问。基础登录、找回和短信分别判定；已有外部服务遵循可信合同。

## 实施与配置

首次自建邮箱注册通过 [注册 overlay](scripts/registration.ts) 和 [账号装配器](../go-implement-service/scripts/install-users.ts) 的 --operations register,login,profile,logout,password.change,verification 在同一冻结 Map 校准；不修改带摘要的原始 Go 快照，不覆盖已有业务文件。已存在服务按真实合同增量实施，短信或其他通道不由邮箱资产推断。

- 自建服务选择 register 时自动补齐 verification，生成发码路由、验证码表与页面；仅基础登录不生成。主配置 enabled=true、mock=false，开发配置 mock=true，不要求先提供 SMTP。
- 明确选择验证时安装目标锁、预留状态、验证码模型和真实发码路由，配置 enabled=true。SMTP overlay 使用标准库、STARTTLS/隐式 TLS、超时和可取消连接；服务端配置 provider=smtp、smtp.host/port/from、tls_mode、timeout，账号密码必须同时有或同时无。秘密只在服务端，配置不完整明确报错。
- 未接真实邮件服务时默认只在 dev 使用模拟投递。发送成功后直接在当前表单显示实际验证码及“暂未接通邮件发送”，用户手动输入；到期、更换邮箱、注册成功或卸载后清除。只模拟邮件投递，账号、仓储、用途、限额及单次消费均由真实服务完成，不生成业务 Mock。test/staging/prod 拒绝 Mock，找回拒绝 Mock；交付如实报告未发送真实邮件。配置真实 SMTP 时同时设置 mock=false；真实回执不含 code，页面自动移除回显。
- 非开发环境或真实投递模式缺少 provider/SMTP 配置时明确报错，不回退模拟或固定码。已有服务按可信合同消费；短信或找回需真实通道，不能沿用注册模拟。

## 生命周期与响应

crypto/rand 生成并哈希持久化。规范化 target/type/scene 后首先事务锁定目标，检查重发和每日限额并预留 Delivering 记录及 latest 指针；新邮箱无账号时也必须串行。事务外单次发送，再次锁定并核对 latest 后作废旧码、激活新码。失败或未知保留额度事实，不自动重发，迟到发送不得激活旧预留。绝不向日志、URL 或前端持久存储写明文验证码。

注册发码回执明确 expires_at（Unix 秒）、expires_in/重发间隔（秒）、code_length 和 mock；真实响应必须省略 code。UI 用统一匿名 typed adapter，核对场景、期限、码长及开发边界。注册装配的发码入口规范 scene 后只允许 register，其他用途明确拒绝。独立接线找回时采用 [找回发码辅助](assets/password-reset/internal/api/v1/password_reset.go.txt)，对合法已存在/不存在邮箱使用相同防枚举反馈；先解析规范 scene 再分派，不能通过大小写或空格绕过。

校验与消费分离；消费在账号/组织/owner 或改密的同一事务里，条件同时复核状态、期限和尝试次数。任何资源写入失败都回滚消费。注册成功后由唯一会话显式登录；只重试登录或查询未知结果，不自动重放注册。

## 验证

生成工程使用隔离 SQLite，覆盖成功、缺码/错码/过期/用途/尝试上限、重发作废、同一新邮箱并发限额、并发单次消费和 owner 写入失败回滚；非 dev Mock 拒绝，SMTP 使用本机协议测试。真实通道交付还需经授权收件方证明实际接收与一次消费；开发 Mock 只报告模拟投递，不声称真实邮件已发出。前端覆盖更换邮箱、A→B→A 迟到、取消/卸载、重发倒计时恢复及注册已成功只重试登录。
