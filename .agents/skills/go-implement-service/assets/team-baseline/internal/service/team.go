package service

import (
	"context"
	"project_id/internal/apperr"
	"project_id/internal/dto"
	"project_id/internal/model"
	"project_id/internal/repository"
	"strconv"
)

// TeamService 拥有团队边界、成员授权和生命周期，不依赖 HTTP 或 ORM。
type TeamService struct{ store *repository.TeamStore }

// NewTeamService 装配团队领域服务。
func NewTeamService(store *repository.TeamStore) *TeamService { return &TeamService{store: store} }

// TeamID 严格解析公开十进制字符串 ID。
func TeamID(value string) (model.ID, error) {
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil || n <= 0 || strconv.FormatInt(n, 10) != value {
		return 0, apperr.ErrBadRequest
	}
	return model.ID(n), nil
}

// teamPage 拒绝无界查询及页偏移溢出。
func teamPage(page, size int) error {
	if page < 1 || page > 100000 || size < 1 || size > 100 {
		return apperr.ErrBadRequest
	}
	return nil
}

// teamAccess 每次重新校验账号、团队和有效成员，不使用令牌中的权限快照。
func teamAccess(tx *repository.TeamTx, account, org model.ID) (*model.Org, *model.OrganizationUser, error) {
	if _, err := tx.Account(account); err != nil {
		return nil, nil, apperr.ErrUnauthorized
	}
	team, err := tx.Org(org)
	if err != nil {
		return nil, nil, apperr.ErrForbidden
	}
	member, err := tx.Member(org, account)
	if err != nil {
		return nil, nil, apperr.ErrForbidden
	}
	if (member.Role == "owner") != (team.OwnerID == account) {
		return nil, nil, apperr.ErrForbidden
	}
	return team, member, nil
}

// teamManager 校验团队管理 code；拥有关系仅用于保护目标，不能替代 RBAC 授权。
func teamManager(tx *repository.TeamTx, account, org model.ID) (*model.OrganizationUser, error) {
	_, member, err := teamAccess(tx, account, org)
	if err != nil {
		return nil, err
	}
	codes, err := tx.Grants(member.ID)
	if err != nil {
		return nil, err
	}
	allowed := false
	for _, code := range codes {
		if code == "team.manage" {
			allowed = true
		}
	}
	if !allowed {
		return nil, apperr.ErrForbidden
	}
	return member, nil
}

// teamCodes 所有成员（含拥有者）的有效权限都通过角色权限关系计算。
func teamCodes(tx *repository.TeamTx, member *model.OrganizationUser) ([]string, error) {
	return tx.Grants(member.ID)
}

// teamMember 投影成员公开显示名和团队授权，绝不返回密码或令牌。
func teamMember(tx *repository.TeamTx, row *model.OrganizationUser) (*dto.TeamMember, error) {
	account, err := tx.Account(row.AccountID)
	if err != nil {
		return nil, err
	}
	codes, err := teamCodes(tx, row)
	if err != nil {
		return nil, err
	}
	name := account.Nickname
	if name == "" {
		name = account.Username
	}
	roles, err := tx.MemberRoles(row.OrganizationID, row.ID)
	if err != nil {
		return nil, err
	}
	roleIDs := []string{}
	for _, role := range roles {
		roleIDs = append(roleIDs, role.ID.String())
	}
	return &dto.TeamMember{ID: row.ID.String(), AccountID: row.AccountID.String(), OrganizationID: row.OrganizationID.String(), DisplayName: name, Role: row.Role, Status: row.Status, Version: row.Version, Permissions: codes, RoleIDs: roleIDs, CanRemove: row.Role != "owner", CanAssignRoles: row.Role != "owner"}, nil
}

// Require 校验实际资源所属团队和成员私有范围；新增领域接口必须在读写事务内复用同等检查。
func (s *TeamService) Require(ctx context.Context, account, org, resourceOrg, privateMember model.ID, code string) error {
	return s.store.Read(ctx, func(tx *repository.TeamTx) error {
		return RequireTeamResource(tx, account, org, resourceOrg, privateMember, code)
	})
}

// RequireTeamResource 在调用方实际业务事务内执行对象级授权，避免检查后再写入的竞态。
func RequireTeamResource(tx *repository.TeamTx, account, org, resourceOrg, privateMember model.ID, code string) error {
	_, member, err := teamAccess(tx, account, org)
	if err != nil {
		return err
	}
	if org != resourceOrg || (privateMember != 0 && privateMember != member.ID) || code == "" {
		return apperr.ErrForbidden
	}
	codes, err := teamCodes(tx, member)
	if err != nil {
		return err
	}
	for _, allowed := range codes {
		if allowed == code {
			return nil
		}
	}
	return apperr.ErrForbidden
}

// Context 恢复账号级当前团队，失去成员资格时回到仍有效的自有团队。
func (s *TeamService) Context(ctx context.Context, account model.ID) (*dto.TeamContext, error) {
	result := &dto.TeamContext{Available: []*dto.TeamMembership{}}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		user, err := tx.Account(account)
		if err != nil {
			return apperr.ErrUnauthorized
		}
		members, err := tx.Memberships(account)
		if err != nil {
			return err
		}
		if len(members) > 100 {
			return apperr.ErrConflict
		}
		own := ""
		for _, member := range members {
			org, _, err := teamAccess(tx, account, member.OrganizationID)
			if err != nil {
				return err
			}
			projection, err := teamMember(tx, &member)
			if err != nil {
				return err
			}
			result.Available = append(result.Available, &dto.TeamMembership{ID: org.ID.String(), Name: org.Name, OwnerAccountID: org.OwnerID.String(), User: projection})
			if org.OwnerID == account {
				if own != "" {
					return apperr.ErrInternal
				}
				own = org.ID.String()
			}
			if org.ID == user.CurrentOrganizationID {
				result.Current = org.ID.String()
			}
		}
		if own == "" {
			return apperr.ErrInternal
		}
		if result.Current == "" {
			result.Current = own
		}
		return nil
	})
	return result, err
}

// Members 要求有效成员持有团队管理权限 code 后读取成员和授权列表。
func (s *TeamService) Members(ctx context.Context, account, org model.ID, page, size int) (*dto.TeamMemberPage, error) {
	if err := teamPage(page, size); err != nil {
		return nil, err
	}
	result := &dto.TeamMemberPage{Items: []*dto.TeamMember{}}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		rows, total, err := tx.Members(org, page, size)
		if err != nil {
			return err
		}
		result.Total = total
		for _, row := range rows {
			item, err := teamMember(tx, &row)
			if err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		return nil
	})
	return result, err
}

// Permissions 读取指定成员的可信权限，subject 必须属于当前请求账号。
func (s *TeamService) Permissions(ctx context.Context, account, org, subject model.ID) ([]string, error) {
	result := []string{}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		_, member, err := teamAccess(tx, account, org)
		if err != nil {
			return err
		}
		if member.ID != subject {
			return apperr.ErrForbidden
		}
		result, err = teamCodes(tx, member)
		return err
	})
	return result, err
}

// PermissionCatalog 返回当前管理成员持有且可授予的权限 code。
func (s *TeamService) PermissionCatalog(ctx context.Context, account, org model.ID) ([]string, error) {
	result := []string{}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		member, err := teamManager(tx, account, org)
		if err != nil {
			return err
		}
		result, err = teamCodes(tx, member)
		return err
	})
	return result, err
}
