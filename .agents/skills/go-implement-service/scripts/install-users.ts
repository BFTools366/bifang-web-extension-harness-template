import { execFileSync } from "node:child_process"
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { completeUserProfile } from "./user-profile.ts"

/** 要求唯一中性锚点，已有产品实现不得按模板覆盖。 */
function replaceOnce(source: string, before: string, after: string, file: string): string {
  if (source.split(before).length !== 2) throw new Error(`${file} 已变化，需按现有实现增量接线`)
  return source.replace(before, after)
}

/** 在任何写入前冻结全部代码计划，不创建工程或安装工具。 */
export async function prepareUsers(
  workspaceRoot: string,
  operations: readonly string[] = ["register", "login", "profile", "logout"]
): Promise<{ root: string; files: Map<string, string> }> {
  if (
    !operations.length ||
    operations.some(
      (operation) =>
        !["register", "login", "profile", "logout", "refresh", "password.change"].includes(
          operation
        )
    )
  )
    throw new Error("账号操作不支持；验证码与找回由独立 Skill 接线")
  const workspace = await realpath(workspaceRoot)
  const config = JSON.parse(
    await readFile(path.join(workspace, ".harness/workspace.json"), "utf8")
  ) as {
    kind?: string
    id: string
    members: { type: string; directory: string }[]
    service: { mode: string }
  }
  if (
    config.kind !== "workspace" ||
    config.service?.mode !== "create" ||
    !/^[a-z][a-z0-9-]*$/u.test(config.id)
  )
    throw new Error("只允许装配已确认的自建服务")
  const members = config.members.filter((member) => member.type === "server")
  if (members.length !== 1 || members[0]?.directory !== `${config.id}_server`)
    throw new Error("无效服务成员")
  const root = path.join(workspace, `${config.id}_server`)
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root)
    throw new Error("成员路径无效")
  const moduleName = (await readFile(path.join(root, "go.mod"), "utf8"))
    .split(/\r?\n/u)[0]
    ?.replace(/^module /u, "")
  if (!moduleName || moduleName !== `${config.id}_server`) throw new Error("服务 module 身份不一致")
  const moduleId = moduleName
  const assets = fileURLToPath(new URL("../assets/go-service-user-api/", import.meta.url))
  const files = new Map<string, string>()
  /** 只消费普通资产并在生成前拒绝已有业务文件。 */
  async function collect(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(assets, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name)
      if (entry.isDirectory()) await collect(file)
      else if (!entry.isFile()) throw new Error(`模板不允许链接：${file}`)
      else if (entry.name !== "README.md") {
        try {
          await lstat(path.join(root, file))
          throw new Error(`保留已有产品文件：${file}`)
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            throw error
        }
        files.set(
          file,
          (await readFile(path.join(assets, file), "utf8")).replaceAll("project_id", moduleId)
        )
      }
    }
  }
  await collect("")
  const changes: Record<string, [string, string]> = {
    "internal/model/models.go": [
      "return []any{}",
      "return []any{&Account{}, &Org{}, &OrganizationUser{}}"
    ],
    "internal/api/v1/module.go": [
      "newSystemModule(deps),",
      "newSystemModule(deps),\n\t\tnewAccountModule(deps),"
    ],
    "go.mod": [
      "require (\n\tgithub.com/bwmarrin",
      "require (\n\tgithub.com/golang-jwt/jwt/v5 v5.3.1\n\tgithub.com/bwmarrin"
    ],
    "internal/config/config.go": [
      'if c.JWT.Secret == "" && !c.App.IsDev() {',
      'if (c.JWT.Secret == "" || c.JWT.Secret == "change-me-in-production-please") && !c.App.IsDev() {'
    ]
  }
  for (const [file, [before, after]] of Object.entries(changes)) {
    if (!(await lstat(path.join(root, file))).isFile())
      throw new Error(`修改目标不是普通文件：${file}`)
    files.set(
      file,
      replaceOnce(
        (await readFile(path.join(root, file), "utf8")).replaceAll("\r\n", "\n"),
        before,
        after,
        file
      )
    )
  }
  const registration = "internal/service/auth.go"
  const before =
    "if err := s.orgs.WithDB(tx.DB()).Create(ctx, org); err != nil {\n\t\t\treturn apperr.ErrInternal\n\t\t}"
  const auth = files.get(registration)
  if (!auth) throw new Error("账号模板缺失")
  files.set(
    registration,
    replaceOnce(
      auth,
      before,
      before +
        "\n\t\tif err := s.orgs.CreateOwnerMembership(ctx, tx, org, account); err != nil {\n\t\t\treturn apperr.ErrInternal\n\t\t}",
      registration
    )
  )
  files.set(
    "internal/model/organization_user.go",
    `package model

// OrganizationUser 记录账号在组织内的唯一成员主体，owner 同样必须有成员行。
type OrganizationUser struct {
    Base
    OrganizationID ID \`gorm:"not null;uniqueIndex:organization_account" json:"organization_id"\`
    AccountID ID \`gorm:"not null;uniqueIndex:organization_account" json:"account_id"\`
    Role string \`gorm:"size:32;not null" json:"role"\`
}
`
  )
  files.set(
    "internal/repository/org.go",
    files.get("internal/repository/org.go") +
      `
// CreateOwnerMembership 在注册的同一事务创建 owner 成员，失败使整个注册回滚。
func (r *OrgRepository) CreateOwnerMembership(ctx context.Context, tx *Repository[model.Account], org *model.Org, account *model.Account) error {
    member := &model.OrganizationUser{OrganizationID: org.ID, AccountID: account.ID, Role: "owner"}
    return tx.DB().WithContext(ctx).Create(member).Error
}
`
  )
  completeUserProfile(files)
  const account = files.get("internal/api/v1/account.go")
  if (!account) throw new Error("账号路由模板缺失")
  files.set(
    "internal/api/v1/account.go",
    account
      .replace(
        'auth.POST("/verification-code", m.sendVerificationCode)',
        "// 验证码仅随真实投递能力挂载。"
      )
      .replace(
        'auth.POST("/password/reset", m.resetPassword)',
        "// 匿名找回仅随真实验证码能力挂载。"
      )
  )
  for (const [operation, route] of [
    ["register", 'auth.POST("/register", m.register)'],
    ["login", 'auth.POST("/login", m.login)'],
    ["refresh", 'auth.POST("/refresh", m.refresh)'],
    ["logout", 'authed.POST("/logout", m.logout)'],
    ["profile", 'authed.GET("/profile", m.profile)'],
    ["password.change", 'authed.PUT("/password", m.changePassword)']
  ]) {
    if (operation && route && !operations.includes(operation))
      files.set(
        "internal/api/v1/account.go",
        (files.get("internal/api/v1/account.go") ?? account).replace(
          route,
          "// 本次未选择，不挂载路由。"
        )
      )
  }
  for (const [file, source] of files) {
    try {
      const entry = await lstat(path.join(root, file))
      if (!Object.hasOwn(changes, file) || !entry.isFile() || entry.isSymbolicLink())
        throw new Error("保留已有产品文件：" + file)
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error
    }
    if (file.endsWith(".go"))
      files.set(file, execFileSync("gofmt", [], { input: source, encoding: "utf8" }))
  }
  for (const file of files.keys()) {
    const parts = file.split(path.sep)
    let current = root
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part)
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error(`写入父目录为链接：${file}`)
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
          throw error
      }
    }
  }
  return { root, files }
}

/** 执行已冻结的账号代码计划，依赖安装、文档和联调由调用方完成。 */
export async function installUsers(
  workspace: string,
  check = false,
  operations?: readonly string[]
): Promise<string[]> {
  const plan = await prepareUsers(workspace, operations)
  if (!check) {
    for (const [file, source] of plan.files) {
      await mkdir(path.dirname(path.join(plan.root, file)), { recursive: true })
      await writeFile(path.join(plan.root, file), source)
    }
  }
  return [...plan.files.keys()]
}

const executed =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (executed) {
  const args = process.argv.slice(2)
  const index = args.indexOf("--workspace")
  const workspace = args[index + 1]
  const opIndex = args.indexOf("--operations")
  const operations = opIndex < 0 ? undefined : args[opIndex + 1]?.split(",")
  if (
    index < 0 ||
    !workspace ||
    (opIndex >= 0 && !operations?.length) ||
    args.some(
      (arg, i) =>
        i !== index + 1 &&
        i !== opIndex + 1 &&
        !["--workspace", "--operations", "--check"].includes(arg)
    )
  )
    throw new Error(
      "用法：install-users.ts --workspace <root> [--operations register,login,profile,logout] [--check]"
    )
  installUsers(workspace, args.includes("--check"), operations)
    .then((files) => console.log(JSON.stringify(files, null, 2)))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
