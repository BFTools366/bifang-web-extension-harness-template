package repository

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"project_id/internal/model"
)

// InitializeManagementPermissions 原子注册目录、迁移旧管理授权并同步拥有者，允许重复启动。
func (s *TeamStore) InitializeManagementPermissions(ctx context.Context, codes, management []string) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		for _, code := range codes {
			row := model.Permission{Code: code, Name: code}
			if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "code"}}, DoUpdates: clause.Assignments(map[string]any{"deleted_time": 0})}).Create(&row).Error; err != nil {
				return err
			}
		}
		var old model.Permission
		err := db.Where("code = ?", "team.manage").First(&old).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil {
			bindings := []model.RolePermission{}
			if err := db.Where("permission_id = ?", old.ID).Find(&bindings).Error; err != nil {
				return err
			}
			for _, code := range management {
				if code == "team.members.nickname.update" {
					continue
				}
				var permission model.Permission
				if err := db.Where("code = ?", code).First(&permission).Error; err != nil {
					return err
				}
				for _, binding := range bindings {
					row := model.RolePermission{RoleID: binding.RoleID, PermissionID: permission.ID}
					if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "role_id"}, {Name: "permission_id"}}, DoUpdates: clause.Assignments(map[string]any{"deleted_time": 0})}).Create(&row).Error; err != nil {
						return err
					}
				}
			}
			if err := db.Unscoped().Where("permission_id = ?", old.ID).Delete(&model.RolePermission{}).Error; err != nil {
				return err
			}
			if err := db.Delete(&old).Error; err != nil {
				return err
			}
		}
		return NewTeamStore(db).SyncOwnerPermissions(ctx)
	})
}
