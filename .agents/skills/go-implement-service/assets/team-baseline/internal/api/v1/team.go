package v1

import (
	"context"
	"github.com/gin-gonic/gin"
	"project_id/internal/model"
	"project_id/internal/pkg/contextx"
	"project_id/internal/pkg/request"
	"project_id/internal/pkg/response"
	"project_id/internal/repository"
	"project_id/internal/service"
)

// newTeamService 注册本框架实际使用的团队权限，产品动作由领域模块显式追加。
func newTeamService(deps Dependencies) *service.TeamService {
	store := repository.NewTeamStore(deps.DB)
	if err := store.RegisterPermissions(context.Background(), []string{"team.manage", "team.leave"}); err != nil {
		panic(err)
	}
	return service.NewTeamService(store)
}

// teamCommand 是受认证账号发起的写操作，不接受操作者账号参数。
type teamCommand struct {
	OrganizationID string   `json:"organizationId"`
	MemberID       string   `json:"memberId"`
	InvitationID   string   `json:"invitationId"`
	Name           string   `json:"name"`
	Email          string   `json:"email"`
	Version        int      `json:"version"`
	Codes          []string `json:"codes"`
	RoleID         string   `json:"roleId"`
	RoleIDs        []string `json:"roleIds"`
	Code           string   `json:"code"`
}

// registerTeams 挂载成员、邀请和权限写接口；集合查询统一由 GraphQL 提供。
func (m *accountModule) registerTeams(group *gin.RouterGroup) {
	teams := group.Group("/teams")
	teams.POST("/switch", m.teamSwitch)
	teams.PUT("/name", m.teamRename)
	teams.POST("/invitations", m.teamInvite)
	teams.POST("/invitations/:action", m.teamInvitation)
	teams.POST("/members/remove", m.teamRemove)
	teams.PUT("/members/roles", m.teamAssignRoles)
	teams.POST("/roles", m.teamCreateRole)
	teams.PUT("/roles", m.teamUpdateRole)
	teams.POST("/roles/remove", m.teamDeleteRole)
}

// teamActor 仅从已认证上下文取账号 ID。
func teamActor(c *gin.Context) model.ID { return model.ID(contextx.AccountID(c.Request.Context())) }

// teamValue 严格解析写操作中的资源标识。
func teamValue(value string) model.ID {
	id, err := service.TeamID(value)
	if err != nil {
		panic(err)
	}
	return id
}

// teamResult 将领域错误交给统一响应恢复边界。
func teamResult(c *gin.Context, err error) {
	if err != nil {
		panic(err)
	}
	response.NoContent(c)
}

// teamSwitch 验证有效成员后切换当前团队。
func (m *accountModule) teamSwitch(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.Switch(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID)))
}

// teamRename 持有管理权限 code 的有效成员修改团队名称。
func (m *accountModule) teamRename(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.Rename(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), req.Name))
}

// teamInvite 返回可查询的邀请 ID 和版本；超时后通过邀请集合核对。
func (m *accountModule) teamInvite(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	row, err := m.teams.Invite(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), req.Email)
	if err != nil {
		panic(err)
	}
	response.OK(c, "team.invitation", row)
}

// teamInvitation 执行绑定受邀账号的接受、拒绝或授权管理成员撤销。
func (m *accountModule) teamInvitation(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.ResolveInvitation(c.Request.Context(), teamActor(c), teamValue(req.InvitationID), req.Version, c.Param("action")))
}

// teamRemove 成员本人退出或授权管理成员移除，不删除团队业务内容。
func (m *accountModule) teamRemove(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.Remove(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), teamValue(req.MemberID), req.Version))
}

// teamAssignRoles 管理成员只能分配权限上限内的本团队自定义角色。
func (m *accountModule) teamAssignRoles(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	ids := []model.ID{}
	for _, value := range req.RoleIDs {
		ids = append(ids, teamValue(value))
	}
	teamResult(c, m.teams.AssignRoles(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), teamValue(req.MemberID), req.Version, ids))
}

// teamCreateRole 创建团队自定义角色并设置权限码。
func (m *accountModule) teamCreateRole(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.CreateRole(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), req.Code, req.Name, req.Codes))
}

// teamUpdateRole 校验归属、权限和版本后修改角色权限。
func (m *accountModule) teamUpdateRole(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.UpdateRole(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), teamValue(req.RoleID), req.Version, req.Name, req.Codes))
}

// teamDeleteRole 撤销角色并清理相关成员绑定。
func (m *accountModule) teamDeleteRole(c *gin.Context) {
	var req teamCommand
	request.Bind(c, &req)
	teamResult(c, m.teams.DeleteRole(c.Request.Context(), teamActor(c), teamValue(req.OrganizationID), teamValue(req.RoleID), req.Version))
}
