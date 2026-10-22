package service

import (
	"context"
	"fmt"
	"project_id/internal/model"
	"sync"
	"testing"
	"time"
)

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
