package service

import (
	"context"
	"project_id/internal/apperr"
	"project_id/internal/dto"
	"project_id/internal/model"
	"project_id/internal/repository"
	"regexp"
	"strings"
	"unicode/utf8"
)

// teamRoleCode 限定稳定角色标识，显示名称独立处理。
var teamRoleCode = regexp.MustCompile(`^[a-z][a-z0-9._-]{0,63}$`)

// rolePermissionIDs 只允许分配操作者当前已经拥有的有效权限，防止角色管理提升自己。
func rolePermissionIDs(tx *repository.TeamTx, account, org model.ID, codes []string) ([]model.ID, error) {
	if len(codes) > 100 {
		return nil, apperr.ErrBadRequest
	}
	permissions, err := tx.Permissions()
	if err != nil {
		return nil, err
	}
	catalog := map[string]model.ID{}
	for _, p := range permissions {
		catalog[p.Code] = p.ID
	}
	ids := []model.ID{}
	actor, err := tx.Member(org, account)
	if err != nil {
		return nil, apperr.ErrForbidden
	}
	own, err := tx.Grants(actor.ID)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{}
	for _, code := range own {
		allowed[code] = true
	}
	seen := map[string]bool{}
	for _, code := range codes {
		id, ok := catalog[code]
		if !ok || seen[code] || !allowed[code] {
			return nil, apperr.ErrForbidden
		}
		seen[code] = true
		ids = append(ids, id)
	}
	return ids, nil
}

// Roles 持有管理权限 code 的成员按团队读取 RBAC 角色，不枚举其他团队角色。
func (s *TeamService) Roles(ctx context.Context, account, org model.ID, page, size int) (*dto.TeamRolePage, error) {
	if err := teamPage(page, size); err != nil {
		return nil, err
	}
	result := &dto.TeamRolePage{Items: []*dto.TeamRole{}}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		rows, total, err := tx.Roles(org, page, size)
		if err != nil {
			return err
		}
		result.Total = total
		for _, row := range rows {
			codes, err := tx.RoleCodes(row.ID)
			if err != nil {
				return err
			}
			result.Items = append(result.Items, &dto.TeamRole{ID: row.ID.String(), OrganizationID: org.String(), Code: row.Code, Name: row.Name, Protected: row.Protected, Version: row.Version, Permissions: codes})
		}
		return nil
	})
	return result, err
}

// CreateRole 创建团队自定义角色；重名或保留角色不允许覆盖。
func (s *TeamService) CreateRole(ctx context.Context, account, org model.ID, code, name string, codes []string) error {
	code = strings.TrimSpace(code)
	name = strings.TrimSpace(name)
	if !teamRoleCode.MatchString(code) || code == "owner" || code == "member" || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 60 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		if _, err := tx.RoleCode(org, code); err == nil {
			return apperr.ErrConflict
		} else if !repository.IsTeamMissing(err) {
			return err
		}
		_, total, err := tx.Roles(org, 1, 1)
		if err != nil {
			return err
		}
		if total >= 100 {
			return apperr.ErrConflict
		}
		ids, err := rolePermissionIDs(tx, account, org, codes)
		if err != nil {
			return err
		}
		role := model.OrganizationRole{OrganizationID: org, Code: code, Name: name, Version: 1}
		if err = tx.Create(&role); err != nil {
			return err
		}
		return tx.ReplaceRolePermissions(role.ID, ids)
	})
}

// UpdateRole 通过角色版本控制并发修改，保护系统角色，修改立即影响所有绑定成员。
func (s *TeamService) UpdateRole(ctx context.Context, account, org, id model.ID, version int, name string, codes []string) error {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 60 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		role, err := tx.Role(org, id)
		if err != nil || role.Protected {
			return apperr.ErrForbidden
		}
		if role.Version != version {
			return apperr.ErrConflict
		}
		ids, err := rolePermissionIDs(tx, account, org, codes)
		if err != nil {
			return err
		}
		if err = tx.ReplaceRolePermissions(role.ID, ids); err != nil {
			return err
		}
		role.Name = name
		return tx.SaveRole(role)
	})
}

// DeleteRole 原子撤销角色及成员绑定，拥有者和基础角色不可删除。
func (s *TeamService) DeleteRole(ctx context.Context, account, org, id model.ID, version int) error {
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		role, err := tx.Role(org, id)
		if err != nil || role.Protected {
			return apperr.ErrForbidden
		}
		if role.Version != version {
			return apperr.ErrConflict
		}
		return tx.DeleteRole(role)
	})
}
