package dto

// TeamMember 是不包含账号秘密的成员投影。
type TeamMember struct {
	ID             string   `json:"id"`
	AccountID      string   `json:"accountId"`
	OrganizationID string   `json:"organizationId"`
	DisplayName    string   `json:"displayName"`
	Role           string   `json:"role"`
	Status         string   `json:"status"`
	Version        int      `json:"version"`
	Permissions    []string `json:"permissions"`
	RoleIDs        []string `json:"roleIds"`
	RoleNames      []string `json:"roleNames"`
	CanRemove      bool     `json:"canRemove"`
	CanAssignRoles bool     `json:"canAssignRoles"`
}

// TeamMembership 组合团队与当前账号的有效成员身份。
type TeamMembership struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	OwnerAccountID string      `json:"ownerAccountId"`
	User           *TeamMember `json:"user"`
}

// TeamContext 返回账号当前选择和全部有效团队；当前选择保存在账号上。
type TeamContext struct {
	Current   string            `json:"current"`
	Available []*TeamMembership `json:"available"`
}

// TeamInvitation 仅向受邀账号或有管理权限的团队成员返回邀请。
type TeamInvitation struct {
	ID               string `json:"id"`
	OrganizationID   string `json:"organizationId"`
	OrganizationName string `json:"organizationName"`
	AccountID        string `json:"accountId"`
	Status           string `json:"status"`
	Version          int    `json:"version"`
	ExpiresAt        int64  `json:"expiresAt"`
}

// TeamMemberPage 是有界成员集合。
type TeamMemberPage struct {
	Items []*TeamMember `json:"items"`
	Total int           `json:"total"`
}

// TeamInvitationPage 是有界邀请集合。
type TeamInvitationPage struct {
	Items []*TeamInvitation `json:"items"`
	Total int               `json:"total"`
}

// TeamRole 只暴露所属团队的 RBAC 定义，不携带其他团队成员或平台角色。
type TeamRole struct {
	CanManage      bool     `json:"canManage"`
	ID             string   `json:"id"`
	OrganizationID string   `json:"organizationId"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Protected      bool     `json:"protected"`
	Version        int      `json:"version"`
	Permissions    []string `json:"permissions"`
}

// TeamRolePage 是团队角色的有界分页。
type TeamRolePage struct {
	Items []*TeamRole `json:"items"`
	Total int         `json:"total"`
}
