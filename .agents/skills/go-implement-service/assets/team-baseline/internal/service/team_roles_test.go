package service

import (
	"context"
	"project_id/internal/model"
	"testing"
)

// TestTeamRBAC 验证权限并集、角色撤权、跨租户角色注入、owner 无旁路和删除清理。
func TestTeamRBAC(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, orgA, ownerMember := teamRegister(t, auth, teams, "rbac-a@example.invalid")
	b, orgB, _ := teamRegister(t, auth, teams, "rbac-b@example.invalid")
	invitation, err := teams.Invite(ctx, a.ID, orgA, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invitation.ID, invitation.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	page, err := teams.Members(ctx, a.ID, orgA, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	var member model.ID
	for _, row := range page.Items {
		if row.AccountID == b.ID.String() {
			member, _ = TeamID(row.ID)
		}
	}
	reader := teamCreateRole(t, teams, a.ID, orgA, "reader", []string{"document.read"})
	writer := teamCreateRole(t, teams, a.ID, orgA, "writer", []string{"document.write"})
	foreign := teamCreateRole(t, teams, b.ID, orgB, "reader", []string{"document.read"})
	if err = teams.AssignRoles(ctx, a.ID, orgA, member, 1, []model.ID{foreign}); err == nil {
		t.Fatal("API 必须拒绝跨团队角色")
	}
	invalid := model.OrganizationUserRole{OrganizationID: orgA, OrganizationUserID: member, RoleID: foreign}
	if err = db.Create(&invalid).Error; err == nil {
		t.Fatal("数据库复合外键必须拒绝跨团队角色")
	}
	if err = teams.AssignRoles(ctx, a.ID, orgA, member, 1, []model.ID{reader, writer}); err != nil {
		t.Fatal(err)
	}
	for _, code := range []string{"document.read", "document.write"} {
		if err = teams.Require(ctx, b.ID, orgA, orgA, 0, code); err != nil {
			t.Fatal("角色权限并集", err)
		}
	}
	if err = teams.UpdateRole(ctx, a.ID, orgA, reader, 1, "read removed", nil); err != nil {
		t.Fatal(err)
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.read"); err == nil {
		t.Fatal("角色撤权即时生效")
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.write"); err != nil {
		t.Fatal("其他角色权限不受影响", err)
	}
	if err = teams.UpdateRole(ctx, a.ID, orgA, reader, 1, "stale", []string{"document.read"}); err == nil {
		t.Fatal("角色版本必须阻止旧请求覆盖")
	}
	if err = teams.DeleteRole(ctx, a.ID, orgA, writer, 1); err != nil {
		t.Fatal(err)
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.write"); err == nil {
		t.Fatal("删除角色立即撤权")
	}
	roles, err := teams.Roles(ctx, a.ID, orgA, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	var ownerRole model.ID
	for _, role := range roles.Items {
		if role.Code == "owner" {
			ownerRole, _ = TeamID(role.ID)
		}
	}
	if err = teams.DeleteRole(ctx, a.ID, orgA, ownerRole, 1); err == nil {
		t.Fatal("owner 角色受保护")
	}
	if err = teams.AssignRoles(ctx, a.ID, orgA, member, 3, []model.ID{ownerRole}); err == nil {
		t.Fatal("不能分配 owner 角色")
	}
	manager := teamCreateRole(t, teams, a.ID, orgA, "manager", []string{"team.settings.read", "team.settings.update"})
	if err = teams.AssignRoles(ctx, a.ID, orgA, member, 3, []model.ID{reader, manager}); err != nil {
		t.Fatal(err)
	}
	if err = teams.Rename(ctx, b.ID, orgA, "Managed by code"); err != nil {
		t.Fatal("普通成员经角色获得管理 code 后可以管理，不按角色名称授权", err)
	}
	if err = teams.CreateRole(ctx, b.ID, orgA, "self-escalate", "Escalate", []string{"document.write"}); err == nil {
		t.Fatal("管理 code 不能使操作者授予自己未拥有的业务权限")
	}
	if err = teams.Remove(ctx, b.ID, orgA, ownerMember, 1); err == nil {
		t.Fatal("有管理 code 也不能移除拥有者")
	}
	if err = db.Unscoped().Where("organization_user_id = ?", ownerMember).Delete(&model.OrganizationUserRole{}).Error; err != nil {
		t.Fatal(err)
	}
	if err = teams.Require(ctx, a.ID, orgA, orgA, 0, "document.read"); err == nil {
		t.Fatal("拥有者同样必须通过 RBAC，没有角色绑定不能旁路授权")
	}
	if err = teams.Rename(ctx, a.ID, orgA, "Bypass"); err == nil {
		t.Fatal("管理操作不能只凭 owner 标记放行")
	}
}
