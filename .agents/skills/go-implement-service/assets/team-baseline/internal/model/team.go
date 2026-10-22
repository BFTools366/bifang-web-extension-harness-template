package model

import (
	"gorm.io/gorm"
	"gorm.io/plugin/soft_delete"
)

// OrganizationUser 是团队内授权主体；退出后保留身份行以维持审计引用。
type OrganizationUser struct {
	ID             ID                    `gorm:"primaryKey;autoIncrement:false;uniqueIndex:organization_member_identity" json:"id"`
	CreatedTime    Timestamp             `gorm:"autoCreateTime" json:"created_time"`
	UpdatedTime    Timestamp             `gorm:"autoUpdateTime" json:"updated_time"`
	DeletedTime    soft_delete.DeletedAt `gorm:"softDelete:unix" json:"-"`
	OrganizationID ID                    `gorm:"not null;uniqueIndex:organization_account;uniqueIndex:organization_member_identity" json:"organizationId"`
	Organization   *Org                  `gorm:"foreignKey:OrganizationID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
	AccountID      ID                    `gorm:"not null;uniqueIndex:organization_account" json:"accountId"`
	Account        *Account              `gorm:"foreignKey:AccountID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
	Role           string                `gorm:"size:16;not null" json:"role"`
	Status         string                `gorm:"size:16;not null;default:active" json:"status"`
	Version        int                   `gorm:"not null;default:1" json:"version"`
}

// BeforeCreate 复用统一雪花 ID 生成规则，同时保留复合唯一索引的实体字段声明。
func (m *OrganizationUser) BeforeCreate(tx *gorm.DB) error {
	base := Base{ID: m.ID}
	if err := base.BeforeCreate(tx); err != nil {
		return err
	}
	m.ID = base.ID
	return nil
}

// GetID 与统一仓储实体合同保持一致。
func (m OrganizationUser) GetID() ID { return m.ID }

// Permission 定义团队动作；平台权限不得写入本目录。
type Permission struct {
	Base
	Code string `gorm:"size:128;not null;uniqueIndex" json:"code"`
	Name string `gorm:"size:128;not null" json:"name"`
}

// OrganizationInvitation 绑定已注册账号；版本防止旧邀请请求消费重新签发的邀请。
type OrganizationInvitation struct {
	Base
	OrganizationID ID                `gorm:"not null;uniqueIndex:organization_invitee" json:"organizationId"`
	AccountID      ID                `gorm:"not null;uniqueIndex:organization_invitee" json:"accountId"`
	InviterID      ID                `gorm:"not null" json:"inviterId"`
	Status         string            `gorm:"size:16;not null" json:"status"`
	Version        int               `gorm:"not null" json:"version"`
	ExpiresAt      int64             `gorm:"not null" json:"expiresAt"`
	Organization   *Org              `gorm:"foreignKey:OrganizationID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
	Account        *Account          `gorm:"foreignKey:AccountID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
	Inviter        *OrganizationUser `gorm:"foreignKey:InviterID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// TableName 固定成员表名。
func (OrganizationUser) TableName() string { return "organization_users" }

// TableName 固定权限表名。
func (Permission) TableName() string { return "permissions" }

// TableName 固定邀请表名。
func (OrganizationInvitation) TableName() string { return "organization_invitations" }
