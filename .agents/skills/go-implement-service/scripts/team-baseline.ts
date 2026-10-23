import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

/** 在尚未装配账号的中性服务上合并本地团队 overlay，不修改上游快照。 */
export async function completeTeamBaseline(
  files: Map<string, string>,
  moduleId: string
): Promise<void> {
  /** 锚点变化立即失败，防止把已存在的业务实现当作中性模板覆盖。 */
  function change(file: string, before: string, after: string) {
    const source = files.get(file)
    if (!source || source.split(before).length !== 2) throw new Error("团队模板锚点已变化：" + file)
    files.set(file, source.replace(before, after))
  }
  /** 只读取普通文件，模板路径统一为 POSIX 标识，磁盘路径交给 path.join。 */
  async function collect(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), name + "/")
      else if (!entry.isFile()) throw new Error("团队资产拒绝符号链接：" + name)
      else if (entry.name !== "README.md")
        files.set(
          name,
          (await readFile(path.join(directory, entry.name), "utf8")).replaceAll(
            "project_id",
            moduleId
          )
        )
    }
  }
  // 恢复真实 gqlgen 引导资产，随后按新增 SDL 自动重新生成，绝不把引导快照作为业务完成证据。
  const graphqlRoot = fileURLToPath(new URL("../assets/go-service-graphql/", import.meta.url))
  await collect(path.join(graphqlRoot, "internal/graphql"), "internal/graphql/")
  files.set(
    "internal/api/v1/graphql.go",
    (await readFile(path.join(graphqlRoot, "internal/api/v1/graphql.go"), "utf8")).replaceAll(
      "project_id",
      moduleId
    )
  )
  files.set(
    "internal/graphql/generated.go",
    (
      await readFile(path.join(graphqlRoot, "generated/internal/graphql/generated.go"), "utf8")
    ).replaceAll("project_id", moduleId)
  )
  files.set(
    "gqlgen.yml",
    (await readFile(path.join(graphqlRoot, "gqlgen.yml"), "utf8")).replaceAll(
      "project_id",
      moduleId
    )
  )
  await collect(fileURLToPath(new URL("../assets/team-baseline/", import.meta.url)))
  // 原始 health/me 仅用于 gqlgen 首次引导，公开根及其 resolver 统一归本地列表 SDL。
  const schema = files.get("internal/graphql/schema.graphqls")
  if (!schema || !/type Query \{[\s\S]*?\n\}/u.test(schema))
    throw new Error("GraphQL 引导 Query 锚点已变化")
  files.set(
    "internal/graphql/schema.graphqls",
    "# 来源类型仅用于引导；公开 Query 只保留真实列表，其他请求走 RESTful。\n" +
      schema.slice(schema.indexOf("scalar Timestamp")).replace(/type Query \{[\s\S]*?\n\}/u, "")
  )
  change(
    "internal/graphql/schema.resolvers.go",
    "// Query returns QueryResolver implementation.\nfunc (r *Resolver) Query() QueryResolver { return &queryResolver{r} }\n\ntype queryResolver struct{ *Resolver }",
    "// 根 Query 由本地 team.resolvers.go 提供；旧字段仅保留到首次重新生成。"
  )
  const transport = files.get("internal/api/v1/graphql.go")
  const example = /\/\/ defaultPlaygroundQuery[\s\S]*?\n\}`/u
  if (!transport || !example.test(transport)) throw new Error("GraphQL 示例锚点已变化")
  files.set(
    "internal/api/v1/graphql.go",
    transport.replace(
      example,
      "// defaultPlaygroundQuery 演示真实的团队成员分页列表，org 使用已授权组织 ID。\n" +
        "const defaultPlaygroundQuery = `query Members($org: ID!) {\n" +
        "  teamMembers(organizationId: $org, page: 1, pageSize: 20) {\n" +
        "    total items { id displayName }\n  }\n}`"
    )
  )
  files.delete("internal/model/organization_user.go")
  change(
    "internal/model/account.go",
    "\tBase\n",
    '\tBase\n\t// CurrentOrganizationID 仅保存账号级选择，不代表授权；0 表示恢复自有团队。\n\tCurrentOrganizationID ID `gorm:"not null;default:0" json:"-"`\n'
  )
  change(
    "internal/model/org.go",
    "not null;index;comment:拥有者",
    "not null;uniqueIndex;comment:拥有者"
  )
  change(
    "internal/model/org.go",
    "\tBase\n",
    '\tBase\n\t// Owner 限制团队拥有者必须引用真实账号。\n\tOwner *Account `gorm:"foreignKey:OwnerID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`\n'
  )
  change(
    "internal/service/account.go",
    'member.Role != "owner"',
    'member.Role != "owner" || member.Status != "active"'
  )
  change(
    "internal/model/models.go",
    "&OrganizationUser{}",
    "&OrganizationUser{}, &Permission{}, &OrganizationRole{}, &RolePermission{}, &OrganizationUserRole{}, &OrganizationInvitation{}"
  )
  change(
    "internal/repository/org.go",
    "return tx.DB().WithContext(ctx).Create(member).Error",
    "if err := tx.DB().WithContext(ctx).Create(member).Error; err != nil { return err }; return r.ProvisionOwnerRole(ctx, tx, org, member)"
  )
  change(
    "internal/api/v1/account.go",
    "auth         *service.AuthService",
    "teams *service.TeamService\n\tauth         *service.AuthService"
  )
  change(
    "internal/api/v1/account.go",
    "return &accountModule{",
    "return &accountModule{\n\t\tteams: newTeamService(deps),"
  )
  change(
    "internal/api/v1/account.go",
    'authed := auth.Group("").Use(middleware.Auth(m.auth))',
    'authed := auth.Group("").Use(middleware.Auth(m.auth))\n\tm.registerTeams(authed)'
  )
  change(
    "internal/api/v1/account.go",
    'authed := auth.Group("").Use(middleware.Auth(m.auth))',
    'authed := auth.Group("")\n\tauthed.Use(middleware.Auth(m.auth))'
  )
  change("internal/api/v1/module.go", "return []Module{", "modules := []Module{")
  change(
    "internal/api/v1/module.go",
    "\n\t}\n}",
    "\n\t}\n\tif deps.Config.GraphQL.Enabled { modules = append(modules, newGraphQLModule(deps)) }\n\treturn modules\n}"
  )
  change(
    "go.mod",
    "github.com/golang-jwt/jwt/v5 v5.3.1",
    "github.com/99designs/gqlgen v0.17.95\n\tgithub.com/golang-jwt/jwt/v5 v5.3.1"
  )
  change(
    "internal/graphql/resolver.go",
    "type Resolver struct {",
    "type Resolver struct {\n\tTeams *service.TeamService"
  )
  change(
    "internal/api/v1/graphql.go",
    "resolver := &graphql.Resolver{",
    "resolver := &graphql.Resolver{\n\t\tTeams: newTeamService(deps),"
  )
  change(
    "gqlgen.yml",
    "  - internal/graphql/schema.graphqls",
    "  - internal/graphql/schema.graphqls\n  - internal/graphql/team.graphqls"
  )
  const mappings = [
    "TeamMember",
    "TeamInvitation",
    "TeamMemberPage",
    "TeamInvitationPage",
    "TeamRole",
    "TeamRolePage"
  ]
  files.set(
    "gqlgen.yml",
    files.get("gqlgen.yml") +
      mappings.map((name) => `\n  ${name}:\n    model: ${moduleId}/internal/dto.${name}`).join("") +
      "\n  TeamTimestamp:\n    model: github.com/99designs/gqlgen/graphql.Int64\n"
  )
}
