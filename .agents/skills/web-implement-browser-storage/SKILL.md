---
name: web-implement-browser-storage
description: 在已初始化 React Web 或 Plasmo Extension 下游中，为真实本地功能实施或修复 Cookie、Web Storage、Memory、IndexedDB 或宿主存储的访问、校验、迁移和失败处理；保持数据与生命周期归属，不预建通用仓库或默认扩大凭据持久化。
---

# Web Harness：实施浏览器存储

围绕真实领域数据实现本地存储；本地能力直接真实实现，不要求 BaseURL。

## 触发与范围

- 仅已初始化下游新增或修改实际存储消费者时应用；初始化已有语言、外观和分页存储不重复生成。源 Harness 只维护通用资产。
- 存储访问归 `src/data/storage/`，feature 拥有交互与状态投影；不建立万能 repository、第二套 services 或透明后端 fallback。
- 凭据默认只留受管 client 内存。Web 身份认证的限定 LocalStorage 例外与列表偏好/Router 恢复合同由各自领域拥有者传入；认证会话转换由调用方委托 `$web-implement-auth-session`；本 Skill 不扩大例外、不持久化密码、验证码、continuation 或权限副本。
- 复用调用方的范围、来源和已有检查，完成后返回；不反向启动认证、列表、产品定义或实施编排。

## 按需读取

必读 `docs/DATA_ACCESS.md` 的“统一数据层结构”“存储机制与选型”及现有相关存储代码。命中 Web 身份认证会话时再读该限定例外；涉及 Query/Router/Jotai 投影再读状态所有权。Extension 再核对实际执行上下文与兼容规则；权限/宿主边界审查由调用方按现有专用流程处理。

## 实施流程

1. 确认数据敏感性、归属与隔离键、容量/事务需求、生命周期和真实消费者；先复用原生与现有适配。已知合适方案给理由与默认建议，只补问阻断当前选择的信息。
2. 保持既有 key、格式、默认值和订阅语义；新记录按实际需要定义版本和校验，外部内容按 `unknown` 读入。损坏值、旧版本与合法空值分开处理，不静默把损坏数据升级为有效业务事实。
3. Cookie 明确 path/domain、期限、Secure/SameSite；HttpOnly 由服务端设置且前端不能读取。Web Storage 复用现有 `getWebStorage`；Memory 明确销毁即丢失；大量结构化事务数据才按既有选型使用 IndexedDB/Dexie，新增依赖遵守项目授权与本地声明规则。
4. 读写拒绝、容量失败与删除失败有真实反馈；非关键偏好可在内存继续使用，但不虚报“已保存”。不得用静默 fallback 隐藏生命周期变化；关键凭据失败严格返回认证拥有者处理。
5. 真实迁移覆盖旧数据校验、升级失败/事务回滚、blocked/versionchange 与多连接关闭；仅在需要时实现跨标签页/上下文通知，消费当前作用域并拒绝旧事件。Query 数据不能在存储中形成第二权威。
6. Extension service worker 无 Window/DOM，不能使用 Web Storage 或 document.cookie；`chrome.storage`/消息 adapter 按已批准最小权限实现，Memory 不跨上下文，不承诺后台常驻。
7. 运行相关非空测试，覆盖本次实际存储的成功读写、损坏/拒绝/容量失败及最高风险迁移或隔离路径。仅为测试使用替身，不把所有本地能力改为 Mock。

## 返回结果

返回真实存储后端、数据/状态拥有者、key 与兼容/迁移影响、失败语义和实际验证。不自动安装依赖、运行全仓检查、构建、浏览器或候选验收。

## 实现参考

[Web认证存储适配与回归](../web-compose-capabilities/templates/compositions/account-workspace/README.md) 演示精确raw、随机revision、锁内代次检查和写后核实。只在已选Web认证持久化范围应用，不能自动复制到Extension或扩张真实凭据持久化。
