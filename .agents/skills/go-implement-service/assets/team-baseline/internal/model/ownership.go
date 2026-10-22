package model

// TeamOwned 嵌入团队共享实体；创建人只作审计，不能代替 OrganizationID。
type TeamOwned struct {
	OrganizationID ID   `gorm:"not null;index" json:"organization_id"`
	Organization   *Org `gorm:"foreignKey:OrganizationID;references:ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// MemberOwned 嵌入团队内成员私有实体；复合外键防止组织与成员身份错配。
type MemberOwned struct {
	TeamOwned
	OrganizationUserID ID                `gorm:"not null;index" json:"organization_user_id"`
	OrganizationUser   *OrganizationUser `gorm:"foreignKey:OrganizationID,OrganizationUserID;references:OrganizationID,ID;constraint:OnDelete:RESTRICT" json:"-"`
}

// TeamActor 记录审计操作主体；不作为团队共享数据的分区键。
type TeamActor struct {
	CreatedByOrganizationUserID ID `gorm:"not null" json:"created_by_organization_user_id"`
}
