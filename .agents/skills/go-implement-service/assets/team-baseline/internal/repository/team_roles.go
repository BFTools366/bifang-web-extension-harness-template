package repository

import (
	"context"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"project_id/internal/model"
)

// SyncOwnerPermissions 将服务显式声明的团队目录同步到各团队受保护的 owner 角色。
func (s *TeamStore) SyncOwnerPermissions(ctx context.Context) error {
	return s.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		roles := []model.OrganizationRole{}
		if err := db.Where("code = ? AND protected = ?", "owner", true).Find(&roles).Error; err != nil {
			return err
		}
		permissions := []model.Permission{}
		if err := db.Find(&permissions).Error; err != nil {
			return err
		}
		for _, role := range roles {
			for _, permission := range permissions {
				row := model.RolePermission{RoleID: role.ID, PermissionID: permission.ID}
				if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "role_id"}, {Name: "permission_id"}}, DoNothing: true}).Create(&row).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// ProvisionOwnerRole 与开户三对象位于同一事务，owner 权限也必须经 RBAC 链获得。
func (r *OrgRepository) ProvisionOwnerRole(ctx context.Context, tx *Repository[model.Account], org *model.Org, member *model.OrganizationUser) error {
	role := model.OrganizationRole{OrganizationID: org.ID, Code: "owner", Name: "Owner", Protected: true, Version: 1}
	baseRole := model.OrganizationRole{OrganizationID: org.ID, Code: "member", Name: "Member", Protected: true, Version: 1}
	db := tx.DB().WithContext(ctx)
	if err := db.Create(&role).Error; err != nil {
		return err
	}
	if err := db.Create(&baseRole).Error; err != nil {
		return err
	}
	permissions := []model.Permission{}
	if err := db.Find(&permissions).Error; err != nil {
		return err
	}
	for _, permission := range permissions {
		if err := db.Create(&model.RolePermission{RoleID: role.ID, PermissionID: permission.ID}).Error; err != nil {
			return err
		}
		if permission.Code == "team.leave" {
			if err := db.Create(&model.RolePermission{RoleID: baseRole.ID, PermissionID: permission.ID}).Error; err != nil {
				return err
			}
		}
	}
	return db.Create(&model.OrganizationUserRole{OrganizationID: org.ID, OrganizationUserID: member.ID, RoleID: role.ID}).Error
}

// BaseMemberRole 读取团队内固定基础成员角色；客户端不能创建或替换此角色。
func (t *TeamTx) BaseMemberRole(org model.ID) (*model.OrganizationRole, error) {
	var row model.OrganizationRole
	err := t.db.Where("organization_id = ? AND code = ? AND protected = ?", org, "member", true).First(&row).Error
	return &row, err
}

// AssignBaseMemberRole 新加入仅获得基础成员角色，不继承历史业务角色。
func (t *TeamTx) AssignBaseMemberRole(org, member model.ID) error {
	role, err := t.BaseMemberRole(org)
	if err != nil {
		return err
	}
	return t.ReplaceRoles(org, member, []model.ID{role.ID})
}

// Role 在目标团队中读取角色，拒绝跨团队 ID。
func (t *TeamTx) Role(org, id model.ID) (*model.OrganizationRole, error) {
	var row model.OrganizationRole
	err := t.db.Where("organization_id = ? AND id = ?", org, id).First(&row).Error
	return &row, err
}

// RoleCode 包括软删除角色，避免旧标识被重新解释成另一种权限集合。
func (t *TeamTx) RoleCode(org model.ID, code string) (*model.OrganizationRole, error) {
	var row model.OrganizationRole
	err := t.db.Unscoped().Where("organization_id = ? AND code = ?", org, code).First(&row).Error
	return &row, err
}

// Roles 返回团队内有界角色页。
func (t *TeamTx) Roles(org model.ID, page, size int) ([]model.OrganizationRole, int, error) {
	var total int64
	query := t.db.Model(&model.OrganizationRole{}).Where("organization_id = ?", org)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []model.OrganizationRole{}
	err := query.Order("id").Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, int(total), err
}

// RoleCodes 返回角色绑定的有效权限码。
func (t *TeamTx) RoleCodes(role model.ID) ([]string, error) {
	codes := []string{}
	err := t.db.Table("permissions AS p").Select("p.code").Joins("JOIN role_permissions AS rp ON rp.permission_id = p.id AND rp.deleted_time = 0").Where("rp.role_id = ? AND p.deleted_time = 0", role).Order("p.code").Scan(&codes).Error
	return codes, err
}

// MemberRoles 返回成员在所属团队中的有效角色，不信任客户端角色名。
func (t *TeamTx) MemberRoles(org, member model.ID) ([]model.OrganizationRole, error) {
	rows := []model.OrganizationRole{}
	err := t.db.Model(&model.OrganizationRole{}).Joins("JOIN organization_user_roles AS mr ON mr.role_id = organization_roles.id AND mr.organization_id = organization_roles.organization_id AND mr.deleted_time = 0").Where("organization_roles.organization_id = ? AND mr.organization_user_id = ?", org, member).Order("organization_roles.id").Find(&rows).Error
	return rows, err
}

// ReplaceRoles 原子替换成员角色；数据库复合外键额外阻止跨团队绑定。
func (t *TeamTx) ReplaceRoles(org, member model.ID, ids []model.ID) error {
	if err := t.db.Unscoped().Where("organization_id = ? AND organization_user_id = ?", org, member).Delete(&model.OrganizationUserRole{}).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := t.Create(&model.OrganizationUserRole{OrganizationID: org, OrganizationUserID: member, RoleID: id}); err != nil {
			return err
		}
	}
	return nil
}

// ReplaceRolePermissions 原子替换角色权限，事务服务负责目录和保留权限校验。
func (t *TeamTx) ReplaceRolePermissions(role model.ID, ids []model.ID) error {
	if err := t.db.Unscoped().Where("role_id = ?", role).Delete(&model.RolePermission{}).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := t.Create(&model.RolePermission{RoleID: role, PermissionID: id}); err != nil {
			return err
		}
	}
	return nil
}

// SaveRole 更新角色并推进并发版本。
func (t *TeamTx) SaveRole(role *model.OrganizationRole) error {
	role.Version++
	return t.db.Save(role).Error
}

// DeleteRole 撤销角色的全部绑定，并使受影响成员的旧分配请求失效。
func (t *TeamTx) DeleteRole(role *model.OrganizationRole) error {
	members := t.db.Model(&model.OrganizationUserRole{}).Select("organization_user_id").Where("organization_id = ? AND role_id = ?", role.OrganizationID, role.ID)
	if err := t.db.Model(&model.OrganizationUser{}).Where("organization_id = ? AND id IN (?)", role.OrganizationID, members).UpdateColumn("version", gorm.Expr("version + 1")).Error; err != nil {
		return err
	}
	if err := t.db.Unscoped().Where("organization_id = ? AND role_id = ?", role.OrganizationID, role.ID).Delete(&model.OrganizationUserRole{}).Error; err != nil {
		return err
	}
	if err := t.ReplaceRolePermissions(role.ID, nil); err != nil {
		return err
	}
	return t.db.Delete(role).Error
}
