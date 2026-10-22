package service

import (
	"context"
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
	if err = store.RegisterPermissions(context.Background(), append(append([]string{}, ManagementPermissions...), "team.leave", "document.read", "document.write")); err != nil {
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
