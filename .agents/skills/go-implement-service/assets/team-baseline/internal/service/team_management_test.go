package service

import (
	"context"
	"project_id/internal/model"
	"project_id/internal/repository"
	"testing"
)

// TestGranularManagement 验证组织昵称隔离、细动作、角色候选和权限增减两侧上限。
func TestGranularManagement(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, org, _ := teamRegister(t, auth, teams, "granular-owner@example.invalid")
	b, ownB, _ := teamRegister(t, auth, teams, "granular-manager@example.invalid")
	c, _, _ := teamRegister(t, auth, teams, "granular-target@example.invalid")
	members := map[model.ID]model.ID{}
	for _, account := range []*model.Account{b, c} {
		invitation, err := teams.Invite(ctx, a.ID, org, account.Email)
		if err != nil {
			t.Fatal(err)
		}
		if err := teams.ResolveInvitation(ctx, account.ID, invitation.ID, invitation.Version, "accept"); err != nil {
			t.Fatal(err)
		}
	}
	page, _ := teams.Members(ctx, a.ID, org, 1, 100)
	for _, row := range page.Items {
		account, _ := TeamID(row.AccountID)
		members[account], _ = TeamID(row.ID)
	}
	if err := teams.RenameMember(ctx, b.ID, org, members[c.ID], 1, "Denied"); err == nil {
		t.Fatal("普通成员不能修改昵称")
	}
	manager := teamCreateRole(t, teams, a.ID, org, "member-manager", []string{"team.members.read", "team.members.roles.assign", "team.members.nickname.update"})
	high := teamCreateRole(t, teams, a.ID, org, "settings-manager", []string{"team.settings.read", "team.settings.update"})
	empty := teamCreateRole(t, teams, a.ID, org, "empty-role", nil)
	if err := teams.AssignRoles(ctx, a.ID, org, members[b.ID], 1, []model.ID{manager}); err != nil {
		t.Fatal(err)
	}
	if err := teams.AssignRoles(ctx, a.ID, org, members[c.ID], 1, []model.ID{high}); err != nil {
		t.Fatal(err)
	}
	if _, err := teams.Roles(ctx, b.ID, org, 1, 20); err == nil {
		t.Fatal("成员候选权限不应开放角色页")
	}
	candidates, err := teams.AssignableRoles(ctx, b.ID, org)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range candidates.Items {
		if row.ID == high.String() {
			t.Fatal("不能授予超出自己权限的角色")
		}
	}
	if err := teams.AssignRoles(ctx, b.ID, org, members[c.ID], 2, []model.ID{empty}); err == nil {
		t.Fatal("不能通过漏传撤销高权限角色")
	}
	if err := teams.AssignRoles(ctx, b.ID, org, members[c.ID], 2, []model.ID{high, empty}); err != nil {
		t.Fatal("可以原样保留无权管理的角色", err)
	}
	if err := teams.AssignRoles(ctx, b.ID, org, members[b.ID], 2, nil); err == nil {
		t.Fatal("不允许自己重配")
	}
	if err := teams.RenameMember(ctx, b.ID, org, members[b.ID], 2, "  团队昵称  "); err != nil {
		t.Fatal(err)
	}
	if err := teams.RenameMember(ctx, b.ID, org, members[b.ID], 2, "stale"); err == nil {
		t.Fatal("昵称并发版本失效")
	}
	contextB, err := teams.Context(ctx, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range contextB.Available {
		if row.ID == org.String() && row.User.DisplayName != "团队昵称" {
			t.Fatal("没有组织昵称")
		}
		if row.ID == ownB.String() && row.User.DisplayName == "团队昵称" {
			t.Fatal("昵称泄漏到其他组织")
		}
	}
	var account model.Account
	db.First(&account, "id = ?", b.ID)
	if account.Nickname == "团队昵称" {
		t.Fatal("不应修改全局昵称")
	}
	// 通过真实数据库制造缺 read 的授权，验证执行端仍失败关闭。
	var role model.OrganizationRole
	db.First(&role, "id = ?", manager)
	var perm model.Permission
	db.First(&perm, "code = ?", "team.members.read")
	db.Unscoped().Where("role_id = ? AND permission_id = ?", manager, perm.ID).Delete(&model.RolePermission{})
	if err := teams.RenameMember(ctx, b.ID, org, members[b.ID], 3, "Denied"); err == nil {
		t.Fatal("服务端必须验证 read 依赖")
	}
}

// TestManagementMigration 验证旧粗权限同事务迁移十项、拥有者全目录及重复运行。
func TestManagementMigration(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, org, _ := teamRegister(t, auth, teams, "migration@example.invalid")
	store := repository.NewTeamStore(db)
	if err := store.RegisterPermissions(ctx, []string{"team.manage"}); err != nil {
		t.Fatal(err)
	}
	var old model.Permission
	db.First(&old, "code = ?", "team.manage")
	role := model.OrganizationRole{OrganizationID: org, Code: "legacy", Name: "legacy", Version: 1}
	if err := db.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.RolePermission{RoleID: role.ID, PermissionID: old.ID}).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := store.InitializeManagementPermissions(ctx, append(append([]string{}, ManagementPermissions...), "team.leave"), ManagementPermissions); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Read(ctx, func(tx *repository.TeamTx) error {
		codes, err := tx.RoleCodes(role.ID)
		if err != nil {
			return err
		}
		if len(codes) != 10 {
			t.Fatalf("迁移应为十项，得到 %v", codes)
		}
		for _, code := range codes {
			if code == "team.manage" || code == "team.members.nickname.update" {
				t.Fatal("旧权限不应扩大到新昵称权限")
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := teams.Require(ctx, a.ID, org, org, 0, "team.members.nickname.update"); err != nil {
		t.Fatal("拥有者获得新权限", err)
	}
	if err := teams.Require(ctx, a.ID, org, org, 0, "team.manage"); err == nil {
		t.Fatal("旧码必须停用")
	}
}

// TestRoleMutationBoundaries 防止低权限管理员覆盖高权限角色、删除自己角色或借创建提权。
func TestRoleMutationBoundaries(t *testing.T) {
	_, auth, teams := teamFixture(t)
	ctx := context.Background()
	owner, org, _ := teamRegister(t, auth, teams, "role-owner@example.invalid")
	manager, _, _ := teamRegister(t, auth, teams, "role-admin@example.invalid")
	invite, err := teams.Invite(ctx, owner.ID, org, manager.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err := teams.ResolveInvitation(ctx, manager.ID, invite.ID, invite.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	page, _ := teams.Members(ctx, owner.ID, org, 1, 100)
	var member model.ID
	for _, row := range page.Items {
		if row.AccountID == manager.ID.String() {
			member, _ = TeamID(row.ID)
		}
	}
	admin := teamCreateRole(t, teams, owner.ID, org, "limited-admin", []string{"team.roles.read", "team.roles.create", "team.roles.delete", "team.roles.permissions.update"})
	high := teamCreateRole(t, teams, owner.ID, org, "high-reader", []string{"document.read"})
	if err := teams.AssignRoles(ctx, owner.ID, org, member, 1, []model.ID{admin}); err != nil {
		t.Fatal(err)
	}
	if err := teams.UpdateRole(ctx, manager.ID, org, high, 1, "replace", nil); err == nil {
		t.Fatal("不能通过覆盖给高权限角色撤权")
	}
	if err := teams.DeleteRole(ctx, manager.ID, org, high, 1); err == nil {
		t.Fatal("不能删除高权限角色")
	}
	if err := teams.UpdateRole(ctx, manager.ID, org, admin, 1, "self", nil); err == nil {
		t.Fatal("不能修改正在使用的角色")
	}
	if err := teams.DeleteRole(ctx, manager.ID, org, admin, 1); err == nil {
		t.Fatal("不能删除正在使用的角色")
	}
	createOnly := teamCreateRole(t, teams, owner.ID, org, "create-only", []string{"team.roles.read", "team.roles.create"})
	if err := teams.AssignRoles(ctx, owner.ID, org, member, 2, []model.ID{createOnly}); err != nil {
		t.Fatal(err)
	}
	if err := teams.CreateRole(ctx, manager.ID, org, "new-empty", "empty", nil); err != nil {
		t.Fatal("创建空权限角色应被允许", err)
	}
	if err := teams.CreateRole(ctx, manager.ID, org, "new-grants", "grants", []string{"team.roles.read"}); err == nil {
		t.Fatal("创建权限不授予配置权限")
	}
}
