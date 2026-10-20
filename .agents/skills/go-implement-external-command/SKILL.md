---
name: go-implement-external-command
description: 在 Go 服务有真实外部工具需求时实现可取消的 exec.CommandContext 调用、参数校验、输出限额与进程回收，不使用字符串 Shell 拼接。
---

# Web Harness：实施 Go 子进程

只调用已授权的可执行程序与 argv；用户内容作为单独参数，禁止 sh -c/cmd /c 与命令插值。设置真实工作目录、受控环境、deadline、退出码与有界 stdout/stderr；秘密不进入输出或日志。处理取消、进程树退出与平台差异，不扫描或终止其他进程。测试真实小进程的成功、失败、超时、空输出和不可信参数；不伪造文件或完成结果。返回调用方。
