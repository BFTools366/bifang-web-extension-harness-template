package service

import (
	"context"
	"fmt"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"path/filepath"
	"project_id/internal/config"
	"project_id/internal/dto"
	"project_id/internal/model"
	"project_id/internal/pkg/notify"
	"project_id/internal/pkg/snowflake"
	"project_id/internal/pkg/token"
	"project_id/internal/repository"
	"sync"
	"testing"
	"time"
)

// teamFixture 使用真实 SQLite、注册服务和成员授权，不以 mock 证明归属。
func teamFixture(t *testing.T) (*gorm.DB, *AuthService, *TeamService) {
	t.Helper()
	if err := snowflake.Setup(1); err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "teams.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	pool.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = pool.Close() })
	if err = db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(model.AllModels()...); err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(&model.VerificationCode{}); err != nil {
		t.Fatal(err)
	}
	accounts := repository.NewAccountRepository(db)
	orgs := repository.NewOrgRepository(db)
	verification := NewVerificationService(repository.NewVerificationCodeRepository(db), accounts, config.Verification{Enabled: true, Mock: true, CodeLength: 6, TTL: time.Hour, MaxAttempts: 5, DailyLimit: 100}, notify.New(""))
	auth := NewAuthService(accounts, orgs, verification, token.NewManager("fixture-secret-not-for-production", "fixture", time.Hour, time.Hour))
	store := repository.NewTeamStore(db)
	if err = store.RegisterPermissions(context.Background(), []string{"team.manage", "team.leave", "document.read", "document.write"}); err != nil {
		t.Fatal(err)
	}
	return db, auth, NewTeamService(store)
}

// teamRegister 同时核对开户三对象和当前团队。
func teamRegister(t *testing.T, auth *AuthService, teams *TeamService, email string) (*model.Account, model.ID, model.ID) {
	t.Helper()
	receipt, err := auth.verification.Send(context.Background(), &dto.SendVerificationCodeRequest{Target: email, TargetType: "email", Scene: "register"}, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	account, err := auth.Register(context.Background(), &dto.RegisterRequest{Email: email, Password: "Password123", Code: receipt.Code})
	if err != nil {
		t.Fatal(err)
	}
	context, err := teams.Context(context.Background(), account.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(context.Available) != 1 {
		t.Fatal("开户必须只有自有团队")
	}
	org, _ := TeamID(context.Current)
	member, _ := TeamID(context.Available[0].User.ID)
	return account, org, member
}

// teamCreateRole 为测试创建真实角色并读取服务返回的标识。
func teamCreateRole(t *testing.T, teams *TeamService, account, org model.ID, code string, codes []string) model.ID {
	t.Helper()
	if err := teams.CreateRole(context.Background(), account, org, code, code, codes); err != nil {
		t.Fatal(err)
	}
	page, err := teams.Roles(context.Background(), account, org, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range page.Items {
		if row.Code == code {
			id, _ := TeamID(row.ID)
			return id
		}
	}
	t.Fatal("缺少已创建角色")
	return 0
}

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
	manager := teamCreateRole(t, teams, a.ID, orgA, "manager", []string{"team.manage"})
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

// TestTeamConcurrentAcceptance 验证重复接受不会建立多个成员关系。
func TestTeamConcurrentAcceptance(t *testing.T) {
	db, auth, teams := teamFixture(t)
	a, org, _ := teamRegister(t, auth, teams, "concurrent-a@example.invalid")
	b, _, _ := teamRegister(t, auth, teams, "concurrent-b@example.invalid")
	ctx := context.Background()
	invite, err := teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	failures := make(chan error, 8)
	for range 8 {
		group.Add(1)
		go func() {
			defer group.Done()
			failures <- teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept")
		}()
	}
	group.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int64
	if err = db.Model(&model.OrganizationUser{}).Where("organization_id = ? AND account_id = ?", org, b.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatal(fmt.Sprint(count, err))
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

// TestTeamInvitationLifecycle 验证拒绝、撤销、过期与接受事务失败不会获得成员资格。
func TestTeamInvitationLifecycle(t *testing.T) {
	db, auth, teams := teamFixture(t)
	ctx := context.Background()
	a, org, _ := teamRegister(t, auth, teams, "invitation-a@example.invalid")
	b, _, _ := teamRegister(t, auth, teams, "invitation-b@example.invalid")
	invite, err := teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil || duplicate.ID != invite.ID || duplicate.Version != invite.Version {
		t.Fatal("重复签发不能重建邀请", err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "reject"); err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept"); err == nil {
		t.Fatal("拒绝后不能接受旧邀请")
	}
	invite, err = teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, a.ID, invite.ID, invite.Version, "revoke"); err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept"); err == nil {
		t.Fatal("撤销后不能接受")
	}
	invite, err = teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Model(invite).Update("expires_at", time.Now().Unix()-1).Error; err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept"); err == nil {
		t.Fatal("过期不能接受")
	}
	page, err := teams.Invitations(ctx, b.ID, 0, 1, 20)
	if err != nil || page.Items[0].Status != "expired" {
		t.Fatal("过期状态必须真实投影", err)
	}
	invite, err = teams.Invite(ctx, a.ID, org, b.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Exec("CREATE TRIGGER reject_join BEFORE INSERT ON organization_users BEGIN SELECT RAISE(ABORT, 'fixture'); END").Error; err != nil {
		t.Fatal(err)
	}
	if err = teams.ResolveInvitation(ctx, b.ID, invite.ID, invite.Version, "accept"); err == nil {
		t.Fatal("成员失败必须回滚邀请")
	}
	var row model.OrganizationInvitation
	if err = db.First(&row, "id = ?", invite.ID).Error; err != nil || row.Status != "pending" {
		t.Fatal("接受失败不得消费邀请", row, err)
	}
}
