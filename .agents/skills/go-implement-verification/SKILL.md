---
name: go-implement-verification
description: 在需求明确要求邮箱或短信验证、找回密码时实现验证码生命周期与真实投递，不使用上游开发验证码回显或未配置发送器。
---

# Web Harness：实施真实验证码投递

读取用户域合同和 ../go-implement-service/assets/go-service-user-api 的 verifycode、verification、notify 参考。上游 smtp/http 只有 Unconfigured，不能当成真实 provider；必须按已授权通道实现 Sender 并记录配置、超时与失败语义，秘密仅在服务端。

未要求验证时不启用发码/找回流程，不增加问卷；已要求时缺 provider 的事实必须补齐，不能用模拟返回宣称完成。禁止启用 verification.mock 或向响应、日志写验证码。crypto/rand 生成，哈希持久化，场景绑定、到期、尝试上限、重发间隔、日配额和单次事务消费。防账号枚举和重复发送；未知投递结果不自动重发。

测试 provider 可用进程内替身隔离失败；实际交付还需经授权的测试接收方证明真实投递及一次消费。返回调用方。
