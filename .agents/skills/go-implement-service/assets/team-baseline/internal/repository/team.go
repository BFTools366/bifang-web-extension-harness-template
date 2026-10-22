package repository

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"project_id/internal/model"
)

// TeamStore 封装数据库会话，业务事务使用同一连接并串行取得写锁。
type TeamStore struct{ db *gorm.DB }

// NewTeamStore 创建团队仓储。
func NewTeamStore(db *gorm.DB) *TeamStore { return &TeamStore{db: db} }

// IsTeamMissing 隔离存储层的未找到语义，service 无需依赖 ORM。
func IsTeamMissing(err error) bool { return errors.Is(err, gorm.ErrRecordNotFound) }

// RegisterPermissions 由服务启动装配声明权限目录，浏览器无写目录入口。
func (s *TeamStore) RegisterPermissions(ctx context.Context, codes []string) error {
	err := s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		for _, code := range codes {
			row := model.Permission{Code: code, Name: code}
			if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "code"}}, DoNothing: true}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return s.SyncOwnerPermissions(ctx)
}

// Read 在一致性快照内执行授权和读取。
func (s *TeamStore) Read(ctx context.Context, fn func(*TeamTx) error) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error { return fn(&TeamTx{db: db}) })
}

// Write 在读取授权前取得 SQLite 写锁，避免授权与撤权交错后仍提交。
func (s *TeamStore) Write(ctx context.Context, account model.ID, fn func(*TeamTx) error) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Model(&model.Account{}).Where("id = ?", account).UpdateColumn("token_version", gorm.Expr("token_version")).Error; err != nil {
			return err
		}
		return fn(&TeamTx{db: db})
	})
}

// TeamTx 只在所属事务回调内有效。
type TeamTx struct{ db *gorm.DB }

// Shared 供领域仓储在当前授权事务内按团队限定共享实体及其 total。
func (t *TeamTx) Shared(org model.ID) *gorm.DB { return t.db.Where("organization_id = ?", org) }

// Private 供领域仓储同时约束团队和成员私有实体；仍须先执行对象与动作授权。
func (t *TeamTx) Private(org, member model.ID) *gorm.DB {
	return t.Shared(org).Where("organization_user_id = ?", member)
}

// Account 读取启用账号。
func (t *TeamTx) Account(id model.ID) (*model.Account, error) {
	var row model.Account
	err := t.db.Where("id = ? AND status = ?", id, model.AccountStatusEnabled).First(&row).Error
	return &row, err
}

// AccountByEmail 供领域服务校验管理权限后定向邀请已注册账号。
func (t *TeamTx) AccountByEmail(email string) (*model.Account, error) {
	var row model.Account
	err := t.db.Where("email = ? AND status = ?", email, model.AccountStatusEnabled).First(&row).Error
	return &row, err
}

// Org 读取团队。
func (t *TeamTx) Org(id model.ID) (*model.Org, error) {
	var row model.Org
	err := t.db.First(&row, "id = ?", id).Error
	return &row, err
}

// Member 校验账号在团队中的有效成员行。
func (t *TeamTx) Member(org, account model.ID) (*model.OrganizationUser, error) {
	var row model.OrganizationUser
	err := t.db.Where("organization_id = ? AND account_id = ? AND status = ?", org, account, "active").First(&row).Error
	return &row, err
}

// MemberByID 在团队边界内查找目标成员，不能用分页第一批充当全体成员。
func (t *TeamTx) MemberByID(org, id model.ID) (*model.OrganizationUser, error) {
	var row model.OrganizationUser
	err := t.db.Where("organization_id = ? AND id = ? AND status = ?", org, id, "active").First(&row).Error
	return &row, err
}

// Memberships 读取全部有效团队，用于上下文恢复；上限由开户和邀请约束保证。
func (t *TeamTx) Memberships(account model.ID) ([]model.OrganizationUser, error) {
	rows := []model.OrganizationUser{}
	err := t.db.Where("account_id = ? AND status = ?", account, "active").Order("id").Limit(101).Find(&rows).Error
	return rows, err
}

// Members 读取团队有效成员的有界页。
func (t *TeamTx) Members(org model.ID, page, size int) ([]model.OrganizationUser, int, error) {
	var total int64
	query := t.db.Model(&model.OrganizationUser{}).Where("organization_id = ? AND status = ?", org, "active")
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []model.OrganizationUser{}
	err := query.Order("id").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, int(total), err
}

// Permissions 返回应用显式注册的团队权限目录。
func (t *TeamTx) Permissions() ([]model.Permission, error) {
	rows := []model.Permission{}
	err := t.db.Order("code").Find(&rows).Error
	return rows, err
}

// Grants 返回特定成员显式获得的权限。
func (t *TeamTx) Grants(member model.ID) ([]string, error) {
	rows := []string{}
	err := t.db.Table("permissions AS p").Distinct("p.code").Joins("JOIN role_permissions AS rp ON rp.permission_id = p.id AND rp.deleted_time = 0").Joins("JOIN organization_roles AS r ON r.id = rp.role_id AND r.deleted_time = 0").Joins("JOIN organization_user_roles AS mr ON mr.role_id = r.id AND mr.organization_id = r.organization_id AND mr.deleted_time = 0").Where("mr.organization_user_id = ? AND p.deleted_time = 0", member).Order("p.code").Scan(&rows).Error
	return rows, err
}

// Create 创建事务内实体。
func (t *TeamTx) Create(row any) error { return t.db.Create(row).Error }

// SelectOrg 保存账号级当前团队偏好，权限不存入账号。
func (t *TeamTx) SelectOrg(account, org model.ID) error {
	return t.db.Model(&model.Account{}).Where("id = ?", account).Update("current_organization_id", org).Error
}

// RenameOrg 修改已完成授权校验的团队名称。
func (t *TeamTx) RenameOrg(org model.ID, name string) error {
	return t.db.Model(&model.Org{}).Where("id = ?", org).Update("name", name).Error
}

// Invitation 读取邀请实体。
func (t *TeamTx) Invitation(id model.ID) (*model.OrganizationInvitation, error) {
	var row model.OrganizationInvitation
	err := t.db.First(&row, "id = ?", id).Error
	return &row, err
}

// InvitationFor 查找团队与受邀账号唯一的邀请槽位。
func (t *TeamTx) InvitationFor(org, account model.ID) (*model.OrganizationInvitation, error) {
	var row model.OrganizationInvitation
	err := t.db.Where("organization_id = ? AND account_id = ?", org, account).First(&row).Error
	return &row, err
}

// SaveInvitation 保存事务内受控状态转换。
func (t *TeamTx) SaveInvitation(row *model.OrganizationInvitation) error { return t.db.Save(row).Error }

// Invitations 只读取自己收到或已通过管理权限校验的团队邀请。
func (t *TeamTx) Invitations(account, org model.ID, page, size int) ([]model.OrganizationInvitation, int, error) {
	var total int64
	query := t.db.Model(&model.OrganizationInvitation{})
	if org == 0 {
		query = query.Where("account_id = ?", account)
	} else {
		query = query.Where("organization_id = ?", org)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []model.OrganizationInvitation{}
	err := query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, int(total), err
}

// ActivateMember 新成员创建或恢复退出成员，并清空旧授权以阻止重新加入后继承。
func (t *TeamTx) ActivateMember(org, account model.ID) error {
	var row model.OrganizationUser
	err := t.db.Where("organization_id = ? AND account_id = ?", org, account).First(&row).Error
	if err == gorm.ErrRecordNotFound {
		row = model.OrganizationUser{OrganizationID: org, AccountID: account, Role: "member", Status: "active", Version: 1}
		if err = t.Create(&row); err != nil {
			return err
		}
		return t.AssignBaseMemberRole(org, row.ID)
	}
	if err != nil {
		return err
	}
	if row.Status == "active" {
		return nil
	}
	if err = t.AssignBaseMemberRole(org, row.ID); err != nil {
		return err
	}
	return t.db.Model(&row).Updates(map[string]any{"status": "active", "version": gorm.Expr("version + 1")}).Error
}

// RemoveMember 撤销成员并清除授权；组织内容继续归团队所有。
func (t *TeamTx) RemoveMember(member *model.OrganizationUser) error {
	if err := t.ReplaceRoles(member.OrganizationID, member.ID, nil); err != nil {
		return err
	}
	return t.db.Model(member).Updates(map[string]any{"status": "removed", "version": gorm.Expr("version + 1")}).Error
}

// AdvanceMemberVersion 使并发授权和旧移除请求失去提交权。
func (t *TeamTx) AdvanceMemberVersion(member model.ID) error {
	return t.db.Model(&model.OrganizationUser{}).Where("id = ?", member).UpdateColumn("version", gorm.Expr("version + 1")).Error
}

// RenameMember 推进版本，其他组织及全局账号资料不受影响。
func (t *TeamTx) RenameMember(member *model.OrganizationUser, nickname string) error {
	return t.db.Model(member).Updates(map[string]any{"nickname": nickname, "version": gorm.Expr("version + 1")}).Error
}
