import { readFileSync } from "node:fs"

/** 校准资料响应及本人昵称写入，缺失组织或成员关系时明确失败。 */
export function completeUserProfile(files: Map<string, string>, moduleId: string): void {
  /** 唯一锚点变化时停止，避免覆盖产品实现。 */
  function change(file: string, before: string, after: string): void {
    const source = files.get(file)
    if (!source || source.split(before).length !== 2) throw new Error("账号模板锚点已变化：" + file)
    files.set(file, source.replace(before, after))
  }
  for (const [target, asset] of [
    ["internal/api/v1/profile_settings.go", "api.go.txt"],
    ["internal/service/profile_settings.go", "service.go.txt"]
  ] as const) {
    files.set(
      target,
      readFileSync(
        new URL(
          "../../workspace-implement-users/assets/profile-settings/" + asset,
          import.meta.url
        ),
        "utf8"
      ).replaceAll("project_id", moduleId)
    )
  }
  change(
    "internal/api/v1/account.go",
    'authed.GET("/profile", m.profile)',
    'authed.GET("/profile", m.profile)\n\tauthed.PATCH("/profile", m.updateNickname)'
  )
  change(
    "internal/service/account.go",
    "\treturn org, nil",
    "\tif org == nil || org.OwnerID != id { return nil, apperr.ErrInternal }\n\treturn org, nil"
  )
  change(
    "internal/dto/account.go",
    'Org     *Org     `json:"org"`',
    'Org     *Org     `json:"org"`\n\tOrganizationUser *OrganizationUser `json:"organization_user"`'
  )
  change(
    "internal/api/v1/account.go",
    'response.OK(c, "account", dto.AccountDetail{',
    'member, err := m.accounts.OwnerMembership(c.Request.Context(), org, account.ID)\n\tif err != nil { panic(err) }\n\tresponse.OK(c, "account", dto.AccountDetail{'
  )
  change(
    "internal/api/v1/account.go",
    "Org:     dto.NewOrg(org),",
    "Org:     dto.NewOrg(org),\n\t\tOrganizationUser: &dto.OrganizationUser{ID: member.ID, OrganizationID: member.OrganizationID, AccountID: member.AccountID, Role: member.Role},"
  )
  files.set(
    "internal/repository/org.go",
    files.get("internal/repository/org.go") +
      '\n// OwnerMembership 权威读取成员行，调用方验证组织和账号归属。\nfunc (r *OrgRepository) OwnerMembership(ctx context.Context, orgID, accountID model.ID) (*model.OrganizationUser, error) {\n    var member model.OrganizationUser\n    err := r.db.WithContext(ctx).Where("organization_id = ? AND account_id = ?", orgID, accountID).First(&member).Error\n    if err != nil { return nil, err }\n    return &member, nil\n}\n'
  )
  files.set(
    "internal/service/account.go",
    files.get("internal/service/account.go") +
      '\n// OwnerMembership 验证数据库成员关系，不从 owner_id 伪造成员主体。\nfunc (s *AccountService) OwnerMembership(ctx context.Context, org *model.Org, id model.ID) (*model.OrganizationUser, error) {\n    if org == nil || org.OwnerID != id { return nil, apperr.ErrInternal }\n    member, err := s.orgs.OwnerMembership(ctx, org.ID, id)\n    if err != nil || member == nil || member.OrganizationID != org.ID || member.AccountID != id || member.Role != "owner" {\n        return nil, apperr.ErrInternal\n    }\n    return member, nil\n}\n'
  )
  files.set(
    "internal/dto/account.go",
    files.get("internal/dto/account.go") +
      '\n// OrganizationUser 仅返回当前账号已校验的成员主体。\ntype OrganizationUser struct {\n    ID model.ID `json:"id"`\n    OrganizationID model.ID `json:"organization_id"`\n    AccountID model.ID `json:"account_id"`\n    Role string `json:"role"`\n}\n'
  )
}
