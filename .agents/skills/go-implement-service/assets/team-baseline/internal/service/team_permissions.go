package service

import (
	"context"
	"project_id/internal/apperr"
	"project_id/internal/model"
	"project_id/internal/repository"
	"strings"
)

// ManagementPermissions 是组织管理的唯一服务端动作目录。
var ManagementPermissions = []string{
	"team.settings.read", "team.settings.update", "team.members.read", "team.members.invite",
	"team.members.remove", "team.members.nickname.update", "team.members.roles.assign",
	"team.roles.read", "team.roles.create", "team.roles.delete", "team.roles.permissions.update",
}

// permissionRead 返回组织动作必须同时具备的页面读取权限。
func permissionRead(code string) string {
	for _, group := range []string{"settings", "members", "roles"} {
		prefix := "team." + group + "."
		if strings.HasPrefix(code, prefix) {
			return prefix + "read"
		}
	}
	return code
}

// teamAuthorize 从当前角色链逐次校验动作及读取依赖。
func teamAuthorize(tx *repository.TeamTx, account, org model.ID, code string) (*model.OrganizationUser, error) {
	_, member, err := teamAccess(tx, account, org)
	if err != nil {
		return nil, err
	}
	codes, err := tx.Grants(member.ID)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{}
	for _, value := range codes {
		allowed[value] = true
	}
	if !allowed[code] || !allowed[permissionRead(code)] {
		return nil, apperr.ErrForbidden
	}
	return member, nil
}

// RenameMember 只更新组织成员昵称，并用成员版本防止覆盖并发分配。
func (s *TeamService) RenameMember(ctx context.Context, account, org, target model.ID, version int, nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if len([]rune(nickname)) < 1 || len([]rune(nickname)) > 64 || version < 1 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamAuthorize(tx, account, org, "team.members.nickname.update"); err != nil {
			return err
		}
		member, err := tx.MemberByID(org, target)
		if err != nil {
			return apperr.ErrForbidden
		}
		if member.Version != version {
			return apperr.ErrConflict
		}
		return tx.RenameMember(member, nickname)
	})
}

// canManageRole 禁止修改系统角色、本人使用的角色及超出当前权限的角色。
func canManageRole(tx *repository.TeamTx, account, org model.ID, role *model.OrganizationRole) error {
	if role.Protected {
		return apperr.ErrForbidden
	}
	team, actor, err := teamAccess(tx, account, org)
	if err != nil {
		return err
	}
	if team.OwnerID != account {
		own, err := tx.MemberRoles(org, actor.ID)
		if err != nil {
			return err
		}
		for _, bound := range own {
			if bound.ID == role.ID {
				return apperr.ErrForbidden
			}
		}
	}
	codes, err := tx.RoleCodes(role.ID)
	if err != nil {
		return err
	}
	_, err = rolePermissionIDs(tx, account, org, codes)
	return err
}
