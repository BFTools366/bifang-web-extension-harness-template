---
name: go-build-local
description: 按当前请求在 Workspace _server 编译本机 Go 开发制品，报告真实二进制和启动方式，不自动形成正式发布、标签或部署。
---

# Web Harness：编译 Go 本地制品

在服务成员 cwd 执行 go build -o bin/server ./cmd/server（Windows 使用 .exe），复用成员声明依赖；相关行为测试在此前或本次按需要执行。根可用 pnpm build:server 包装同一操作。报告文件、宿主、实际结果和启动参数；未验证的平台标记 Unverified。正式服务发布明确目标平台、配置秘密与部署责任后走根发布合同，不照搬上游独立 Git/tag 生命周期。
