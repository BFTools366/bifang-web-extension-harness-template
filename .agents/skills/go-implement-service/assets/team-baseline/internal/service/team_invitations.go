package service

import (
	"context"
	"project_id/internal/dto"
	"project_id/internal/model"
	"project_id/internal/repository"
	"time"
)

// Invitations 分页读取本人邀请；指定团队时要求有效成员及管理权限 code。
func (s *TeamService) Invitations(ctx context.Context, account, org model.ID, page, size int) (*dto.TeamInvitationPage, error) {
	if err := teamPage(page, size); err != nil {
		return nil, err
	}
	result := &dto.TeamInvitationPage{Items: []*dto.TeamInvitation{}}
	err := s.store.Read(ctx, func(tx *repository.TeamTx) error {
		if _, err := tx.Account(account); err != nil {
			return err
		}
		if org != 0 {
			if _, err := teamAuthorize(tx, account, org, "team.members.invite"); err != nil {
				return err
			}
		}
		rows, total, err := tx.Invitations(account, org, page, size)
		if err != nil {
			return err
		}
		result.Total = total
		for _, row := range rows {
			team, err := tx.Org(row.OrganizationID)
			if err != nil {
				return err
			}
			status := row.Status
			if status == "pending" && row.ExpiresAt <= time.Now().Unix() {
				status = "expired"
			}
			result.Items = append(result.Items, &dto.TeamInvitation{ID: row.ID.String(), OrganizationID: row.OrganizationID.String(), OrganizationName: team.Name, AccountID: row.AccountID.String(), Status: status, Version: row.Version, ExpiresAt: row.ExpiresAt})
		}
		return nil
	})
	return result, err
}
