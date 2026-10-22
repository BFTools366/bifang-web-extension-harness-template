package service

import (
	"context"
	"project_id/internal/apperr"
	"project_id/internal/model"
	"project_id/internal/repository"
	"strings"
	"time"
	"unicode/utf8"
)

// Switch 只保存已确认成员团队；选择同一目标不修改数据库。
func (s *TeamService) Switch(ctx context.Context, account, org model.ID) error {
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, _, err := teamAccess(tx, account, org); err != nil {
			return err
		}
		user, err := tx.Account(account)
		if err != nil {
			return err
		}
		if user.CurrentOrganizationID == org {
			return nil
		}
		return tx.SelectOrg(account, org)
	})
}

// Rename 允许持有管理权限 code 的有效成员修改当前团队名。
func (s *TeamService) Rename(ctx context.Context, account, org model.ID, name string) error {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 60 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		return tx.RenameOrg(org, name)
	})
}

// Invite 创建或续发绑定账号的七天邀请；重复待接受请求返回同一邀请。
func (s *TeamService) Invite(ctx context.Context, account, org model.ID, email string) (*model.OrganizationInvitation, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) > 128 || !strings.Contains(email, "@") {
		return nil, apperr.ErrBadRequest
	}
	var result *model.OrganizationInvitation
	err := s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		owner, err := teamManager(tx, account, org)
		if err != nil {
			return err
		}
		target, err := tx.AccountByEmail(email)
		if err != nil {
			return apperr.ErrBadRequest
		}
		if target.ID == account {
			return apperr.ErrConflict
		}
		if _, err = tx.Member(org, target.ID); err == nil {
			return apperr.ErrConflict
		} else if !repository.IsTeamMissing(err) {
			return err
		}
		memberships, err := tx.Memberships(target.ID)
		if err != nil {
			return err
		}
		if len(memberships) >= 100 {
			return apperr.ErrConflict
		}
		row, err := tx.InvitationFor(org, target.ID)
		now := time.Now().Unix()
		if repository.IsTeamMissing(err) {
			row = &model.OrganizationInvitation{OrganizationID: org, AccountID: target.ID, InviterID: owner.ID, Status: "pending", Version: 1, ExpiresAt: now + 7*86400}
			if err = tx.Create(row); err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else if row.Status != "pending" || row.ExpiresAt <= now {
			row.Status = "pending"
			row.Version++
			row.InviterID = owner.ID
			row.ExpiresAt = now + 7*86400
			if err = tx.SaveInvitation(row); err != nil {
				return err
			}
		}
		result = row
		return nil
	})
	return result, err
}

// ResolveInvitation 接受、拒绝或撤销邀请；版本检查防止迟到请求作用于新邀请。
func (s *TeamService) ResolveInvitation(ctx context.Context, account, id model.ID, version int, action string) error {
	if version < 1 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := tx.Account(account); err != nil {
			return apperr.ErrUnauthorized
		}
		row, err := tx.Invitation(id)
		if err != nil {
			return apperr.ErrForbidden
		}
		next := ""
		switch action {
		case "accept":
			next = "accepted"
		case "reject":
			next = "rejected"
		case "revoke":
			next = "revoked"
		default:
			return apperr.ErrBadRequest
		}
		if action == "revoke" {
			if _, err = teamManager(tx, account, row.OrganizationID); err != nil {
				return err
			}
		} else if row.AccountID != account {
			return apperr.ErrForbidden
		}
		if row.Version != version {
			return apperr.ErrConflict
		}
		if row.Status == next {
			return nil
		}
		if row.Status != "pending" || row.ExpiresAt <= time.Now().Unix() {
			return apperr.ErrConflict
		}
		if action == "accept" {
			team, err := tx.Org(row.OrganizationID)
			if err != nil {
				return apperr.ErrForbidden
			}
			if _, _, err = teamAccess(tx, team.OwnerID, team.ID); err != nil {
				return err
			}
			memberships, err := tx.Memberships(account)
			if err != nil {
				return err
			}
			if len(memberships) >= 100 {
				return apperr.ErrConflict
			}
			if err = tx.ActivateMember(row.OrganizationID, account); err != nil {
				return err
			}
		}
		row.Status = next
		return tx.SaveInvitation(row)
	})
}

// Remove 撤销成员关系；拥有者不可退出或被移除，自有团队和其他成员关系保持有效。
func (s *TeamService) Remove(ctx context.Context, account, org, target model.ID, version int) error {
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		_, actor, err := teamAccess(tx, account, org)
		if err != nil {
			return err
		}
		if target != actor.ID {
			if _, err := teamManager(tx, account, org); err != nil {
				return err
			}
		} else if err := RequireTeamResource(tx, account, org, org, 0, "team.leave"); err != nil {
			return err
		}
		member, err := tx.MemberByID(org, target)
		if err != nil {
			return apperr.ErrForbidden
		}
		if member.Role == "owner" {
			return apperr.ErrForbidden
		}
		if version != member.Version {
			return apperr.ErrConflict
		}
		return tx.RemoveMember(member)
	})
}

// AssignRoles 只分配当前团队的自定义角色，保留基础成员角色，不允许改写 owner 绑定。
func (s *TeamService) AssignRoles(ctx context.Context, account, org, target model.ID, version int, roles []model.ID) error {
	if len(roles) > 100 {
		return apperr.ErrBadRequest
	}
	return s.store.Write(ctx, account, func(tx *repository.TeamTx) error {
		if _, err := teamManager(tx, account, org); err != nil {
			return err
		}
		member, err := tx.MemberByID(org, target)
		if err != nil || member.Role == "owner" {
			return apperr.ErrForbidden
		}
		if member.Version != version {
			return apperr.ErrConflict
		}
		base, err := tx.BaseMemberRole(org)
		if err != nil {
			return err
		}
		ids := []model.ID{base.ID}
		seen := map[model.ID]bool{}
		for _, id := range roles {
			role, err := tx.Role(org, id)
			if err != nil || role.Protected || seen[id] {
				return apperr.ErrForbidden
			}
			codes, err := tx.RoleCodes(role.ID)
			if err != nil {
				return err
			}
			if _, err = rolePermissionIDs(tx, account, org, codes); err != nil {
				return err
			}
			seen[id] = true
			ids = append(ids, id)
		}
		if err = tx.ReplaceRoles(org, member.ID, ids); err != nil {
			return err
		}
		return tx.AdvanceMemberVersion(member.ID)
	})
}
