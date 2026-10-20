---
name: go-implement-persistence
description: 为 Workspace Go 服务的实际业务实现 GORM 仓储、SQLite 事务或已确认数据库迁移，处理唯一性、租户隔离、并发与失败恢复。
---

# Web Harness：实施 Go 持久化

从服务成员 go.mod、实际 model/repository、数据生命周期和迁移合同开始，默认复用已有 GORM 与 SQLite；不因未来需求增加 MySQL/PostgreSQL 实例或凭据。schema 变化进入受控迁移；开发空库 AutoMigrate 不能替代生产迁移。

service 拥有事务和领域不变量；repository 接收 context 与真实数据库，不感知 Gin；模型进入 AllModels 才能建表。ID 按字符串传输，时间单位显式，金额用整数最小单位。组织数据按 organizationId 隔离，成员主体单独校验。

唯一约束、并发版本、幂等键与事务回滚必须在数据库验证，不能只在前端预查。覆盖独立临时 SQLite、事务失败、重复/冲突、跨租户拒绝、重启持久化；涉及既有数据时先明确迁移与恢复条件。返回调用方。
