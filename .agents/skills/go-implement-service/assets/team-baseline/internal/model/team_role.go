package model

import (
	"gorm.io/gorm"
	"gorm.io/plugin/soft_delete"
)

// OrganizationRole 是团队内的 RBAC 角色，复合唯一键供成员角色绑定校验归属。
type OrganizationRole struct {
	ID             ID                    `gorm:"primaryKey;autoIncrement:false;uniqueIndex:organization_role_identity" json:"id"`
	CreatedTime    Timestamp             `gorm:"autoCreateTime" json:"created_time"`
	UpdatedTime    Timestamp             `gorm:"autoUpdateTime" json:"updated_time"`
	DeletedTime    soft_delete.DeletedAt `gorm:"softDelete:unix" json:"-"`
	OrganizationID ID                    `gorm:"not null;uniqueIndex:organization_role_code;uniqueIndex:organization_role_identity" json:"organizationId"`
	Code           string                `gorm:"size:64;not null;uniqueIndex:organization_role_code" json:"code"`
	Name           string                `gorm:"size:64;not null" json:"name"`
	Protected      bool                  `gorm:"not null;default:false" json:"protected"`
	Version        int                   `gorm:"not null;default:1" json:"version"`
	Organization   *Org                  `gorm:"foreignKey:OrganizationID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// BeforeCreate 沿用统一雪花 ID，保持角色复合索引可供外键引用。
func (r *OrganizationRole) BeforeCreate(tx *gorm.DB) error {
	base := Base{ID: r.ID}
	if err := base.BeforeCreate(tx); err != nil {
		return err
	}
	r.ID = base.ID
	return nil
}

// GetID 实现统一实体合同。
func (r OrganizationRole) GetID() ID { return r.ID }

// TableName 固定团队角色表名。
func (OrganizationRole) TableName() string { return "organization_roles" }

// RolePermission 将权限授予角色，成员不能绕过角色直接获得权限。
type RolePermission struct {
	Base
	RoleID       ID                `gorm:"not null;uniqueIndex:role_permission" json:"roleId"`
	PermissionID ID                `gorm:"not null;uniqueIndex:role_permission" json:"permissionId"`
	Role         *OrganizationRole `gorm:"foreignKey:RoleID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
	Permission   *Permission       `gorm:"foreignKey:PermissionID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// TableName 固定角色权限表名。
func (RolePermission) TableName() string { return "role_permissions" }

// OrganizationUserRole 用两个复合外键保证角色与成员必须归同一团队。
type OrganizationUserRole struct {
	Base
	OrganizationID     ID                `gorm:"not null" json:"organizationId"`
	OrganizationUserID ID                `gorm:"not null;uniqueIndex:member_role" json:"organizationUserId"`
	RoleID             ID                `gorm:"not null;uniqueIndex:member_role" json:"roleId"`
	Member             *OrganizationUser `gorm:"foreignKey:OrganizationID,OrganizationUserID;references:OrganizationID,ID;constraint:OnDelete:RESTRICT" json:"-"`
	Role               *OrganizationRole `gorm:"foreignKey:OrganizationID,RoleID;references:OrganizationID,ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// TableName 固定成员角色表名。
func (OrganizationUserRole) TableName() string { return "organization_user_roles" }
