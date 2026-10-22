package service

import (
	"context"
	"project_id/internal/dto"
	"project_id/internal/model"
	"project_id/internal/repository"
	"testing"
)

// TestTeamOwnership 验证互相加入、共享与成员私有归属、越权、撤权和重加入。
func TestTeamOwnership(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, orgA, memberA := teamRegister(t, auth, teams, "a@example.invalid")
	b, orgB, _ := teamRegister(t, auth, teams, "b@example.invalid")
	c, _, _ := teamRegister(t, auth, teams, "c@example.invalid")
	invitation, err := teams.Invite(ctx, a.ID, orgA, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = teams.Switch(ctx, b.ID, orgA); err == nil {
		t.Fatal("待接受邀请不能访问")
	}
	if err = teams.ResolveInvitation(ctx, c.ID, invitation.ID, invitation.Version, "accept"); err == nil {
		t.Fatal("他人不能接受邀请")
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invitation.ID, invitation.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invitation.ID, invitation.Version, "accept"); err != nil {
		t.Fatal("同版接受应幂等", err)
	}
	reverse, err := teams.Invite(ctx, b.ID, orgB, a.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, a.ID, reverse.ID, reverse.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	memberships, err := teams.Context(ctx, b.ID)
	if err != nil || len(memberships.Available) != 2 || memberships.Current != orgB.String() {
		t.Fatal("加入保留自有团队且不自动切换", memberships, err)
	}
	members, err := teams.Members(ctx, a.ID, orgA, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	var other *dto.TeamMember
	for _, m := range members.Items {
		if m.AccountID == b.ID.String() {
			other = m
		}
	}
	if other == nil {
		t.Fatal("缺成员")
	}
	subject, _ := TeamID(other.ID)
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.read"); err == nil {
		t.Fatal("新成员默认拒绝")
	}
	reader := teamCreateRole(t, teams, a.ID, orgA, "reader", []string{"document.read"})
	if err = teams.AssignRoles(ctx, a.ID, orgA, subject, other.Version, []model.ID{reader}); err != nil {
		t.Fatal(err)
	}
	if err = teams.AssignRoles(ctx, a.ID, orgA, subject, other.Version, []model.ID{}); err == nil {
		t.Fatal("旧版授权不能覆盖")
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.read"); err != nil {
		t.Fatal("同团队授权共享", err)
	}
	if err = teams.Require(ctx, b.ID, orgA, orgB, 0, "document.read"); err == nil {
		t.Fatal("拒绝跨团队资源")
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, memberA, "document.read"); err == nil {
		t.Fatal("拥有权限也不能访问其他成员私有内容")
	}
	if err = teams.Require(ctx, a.ID, orgA, orgA, subject, "document.read"); err == nil {
		t.Fatal("owner 不绕过成员私有归属")
	}
	if _, err = teams.Permissions(ctx, b.ID, orgA, memberA); err == nil {
		t.Fatal("不能冒用 owner 成员")
	}
	if err = teams.AssignRoles(ctx, b.ID, orgB, subject, 2, []model.ID{reader}); err == nil {
		t.Fatal("不能跨团队授予权限")
	}
	if err = teams.CreateRole(ctx, a.ID, orgA, "escalation", "Escalation", []string{"platform.admin"}); err == nil {
		t.Fatal("不能授予不存在的团队权限或平台权限")
	}
	if err = teams.Remove(ctx, a.ID, orgA, memberA, 1); err == nil {
		t.Fatal("不能移除 owner")
	}
	if err = teams.Switch(ctx, b.ID, orgA); err != nil {
		t.Fatal(err)
	}
	if err = teams.Remove(ctx, a.ID, orgA, subject, 2); err != nil {
		t.Fatal(err)
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.read"); err == nil {
		t.Fatal("移除后即时拒绝")
	}
	after, err := teams.Context(ctx, b.ID)
	if err != nil || after.Current != orgB.String() || len(after.Available) != 1 {
		t.Fatal("移除恢复自有团队", after, err)
	}
	renewed, err := teams.Invite(ctx, a.ID, orgA, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if renewed.Version <= invitation.Version {
		t.Fatal("重新签发必须更新版本")
	}
	if err = teams.ResolveInvitation(ctx, b.ID, renewed.ID, invitation.Version, "accept"); err == nil {
		t.Fatal("旧接受不能消费新邀请")
	}
	if err = teams.ResolveInvitation(ctx, b.ID, renewed.ID, renewed.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	if err = teams.Require(ctx, b.ID, orgA, orgA, 0, "document.read"); err == nil {
		t.Fatal("重新加入不继承已撤销权限")
	}
	if err = teams.Remove(ctx, a.ID, orgA, subject, 2); err == nil {
		t.Fatal("旧移除请求不能作用于重新加入的成员")
	}
	if _, err = teams.Invitations(ctx, c.ID, orgA, 1, 20); err == nil {
		t.Fatal("他人不能枚举团队邀请")
	}
	if _, err = teams.Members(ctx, a.ID, orgA, 0, 101); err == nil {
		t.Fatal("拒绝无界分页")
	}
	duplicate := model.Org{Name: "Duplicate", OwnerID: a.ID}
	if err = db.Create(&duplicate).Error; err == nil {
		t.Fatal("数据库必须限制每人唯一自有团队")
	}
}

// TestTeamRegistrationRollback 验证开户任一成员或角色阶段失败时全部回滚。
func TestTeamRegistrationRollback(t *testing.T) {
	for _, failureTable := range []string{"organization_users", "organization_roles", "role_permissions", "organization_user_roles"} {
		t.Run(failureTable, func(t *testing.T) {
			db, auth, _ := teamFixture(t)
			if err := db.Exec("CREATE TRIGGER reject_owner BEFORE INSERT ON " + failureTable + " BEGIN SELECT RAISE(ABORT, 'fixture'); END").Error; err != nil {
				t.Fatal(err)
			}
			receipt, err := auth.verification.Send(context.Background(), &dto.SendVerificationCodeRequest{Target: "rollback@example.invalid", TargetType: "email", Scene: "register"}, "127.0.0.1")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := auth.Register(context.Background(), &dto.RegisterRequest{Email: "rollback@example.invalid", Password: "Password123", Code: receipt.Code}); err == nil {
				t.Fatal("必须回滚")
			}
			for _, table := range []string{"accounts", "orgs", "organization_users", "organization_roles", "role_permissions", "organization_user_roles"} {
				var count int64
				if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
					t.Fatalf("%s 留下半成品 %d %v", table, count, err)
				}
			}
		})
	}
}

// teamPrivateDocument 是测试内真实成员私有实体，用于验证复合归属外键。
type teamPrivateDocument struct {
	model.Base
	model.MemberOwned
	Content string
}

// TestTeamDatabaseOwnership 验证数据库层不能建立团队与成员错配的私有资源。
func TestTeamDatabaseOwnership(t *testing.T) {
	db, auth, teams := teamFixture(t)
	_, orgA, memberA := teamRegister(t, auth, teams, "private-a@example.invalid")
	_, orgB, _ := teamRegister(t, auth, teams, "private-b@example.invalid")
	if err := db.AutoMigrate(&teamPrivateDocument{}); err != nil {
		t.Fatal(err)
	}
	good := teamPrivateDocument{MemberOwned: model.MemberOwned{TeamOwned: model.TeamOwned{OrganizationID: orgA}, OrganizationUserID: memberA}, Content: "private"}
	if err := db.Create(&good).Error; err != nil {
		t.Fatal(err)
	}
	bad := teamPrivateDocument{MemberOwned: model.MemberOwned{TeamOwned: model.TeamOwned{OrganizationID: orgB}, OrganizationUserID: memberA}}
	if err := db.Create(&bad).Error; err == nil {
		t.Fatal("数据库不能接受跨团队的成员私有归属")
	}
}

// teamSharedDocument 的创建者只作追溯，共享查询只按团队过滤。
type teamSharedDocument struct {
	model.Base
	model.TeamOwned
	model.TeamActor
	Content string
}

// TestTeamSharedDocuments 验证不同创建者同团队共享、跨团队和成员私有过滤及 total。
func TestTeamSharedDocuments(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, orgA, memberA := teamRegister(t, auth, teams, "shared-a@example.invalid")
	b, orgB, memberB := teamRegister(t, auth, teams, "shared-b@example.invalid")
	invite, err := teams.Invite(ctx, a.ID, orgA, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept"); err != nil {
		t.Fatal(err)
	}
	rows, err := teams.Members(ctx, a.ID, orgA, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	var joined model.ID
	for _, row := range rows.Items {
		if row.AccountID == b.ID.String() {
			joined, _ = TeamID(row.ID)
		}
	}
	reader := teamCreateRole(t, teams, a.ID, orgA, "reader", []string{"document.read"})
	if err = teams.AssignRoles(ctx, a.ID, orgA, joined, 1, []model.ID{reader}); err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(&teamSharedDocument{}, &teamPrivateDocument{}); err != nil {
		t.Fatal(err)
	}
	for _, doc := range []teamSharedDocument{
		{TeamOwned: model.TeamOwned{OrganizationID: orgA}, TeamActor: model.TeamActor{CreatedByOrganizationUserID: memberA}, Content: "A created"},
		{TeamOwned: model.TeamOwned{OrganizationID: orgA}, TeamActor: model.TeamActor{CreatedByOrganizationUserID: joined}, Content: "B created in A"},
		{TeamOwned: model.TeamOwned{OrganizationID: orgB}, TeamActor: model.TeamActor{CreatedByOrganizationUserID: memberB}, Content: "B own team"},
	} {
		if err = db.Create(&doc).Error; err != nil {
			t.Fatal(err)
		}
	}
	private := teamPrivateDocument{MemberOwned: model.MemberOwned{TeamOwned: model.TeamOwned{OrganizationID: orgA}, OrganizationUserID: memberA}, Content: "A private"}
	if err = db.Create(&private).Error; err != nil {
		t.Fatal(err)
	}
	store := repository.NewTeamStore(db)
	for _, account := range []model.ID{a.ID, b.ID} {
		err = store.Read(ctx, func(tx *repository.TeamTx) error {
			if err := RequireTeamResource(tx, account, orgA, orgA, 0, "document.read"); err != nil {
				return err
			}
			var docs []teamSharedDocument
			var total int64
			if err := tx.Shared(orgA).Model(&teamSharedDocument{}).Count(&total).Error; err != nil {
				return err
			}
			if err := tx.Shared(orgA).Order("id").Find(&docs).Error; err != nil {
				return err
			}
			if total != 2 || len(docs) != 2 {
				t.Fatalf("团队共享不应按创建者拆分或泄漏其他团队：%d %+v", total, docs)
			}
			var hidden []teamPrivateDocument
			if err := tx.Private(orgA, joined).Find(&hidden).Error; err != nil {
				return err
			}
			if len(hidden) != 0 {
				t.Fatal("成员私有过滤不能返回其他成员文档")
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = teams.Remove(ctx, a.ID, orgA, joined, 2); err != nil {
		t.Fatal(err)
	}
	var remaining int64
	if err = db.Model(&teamSharedDocument{}).Where("organization_id = ?", orgA).Count(&remaining).Error; err != nil || remaining != 2 {
		t.Fatal("移除成员不能删除或迁移团队资源", remaining, err)
	}
}
