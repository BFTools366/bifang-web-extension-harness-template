/** 在生成的真实 Go 配置层验证单文件部署、环境覆盖、错误与导出语义。 */
export const GO_CONFIGURATION_TEST = String.raw`package config

import (
    "os"
    "path/filepath"
    "strings"
    "testing"
    "github.com/spf13/viper"
)

// testConfig 提供配置文件拥有的真实参数，不依赖程序内数据库和密钥默认值。
const testConfig = "app:\n  env: prod\nserver:\n  port: 8123\ndatabase:\n  driver: sqlite\n  dsn: data/custom.db\njwt:\n  secret: independent-production-test-secret\n  access_ttl: 1h\n  refresh_ttl: 24h\nrate_limit:\n  enabled: true\n  rps: 7\n  burst: 9\n"

// isolateEnvironment 防止调用方的开发或生产变量改变配置单元测试的输入。
func isolateEnvironment(t *testing.T) {
    t.Helper()
    for _, entry := range os.Environ() {
        key, _, _ := strings.Cut(entry, "=")
        if strings.HasPrefix(key, "APP_") { t.Setenv(key, "") }
    }
}

// TestSingleFileEnvironment 防止生产文件被默认开发环境覆盖，并验证环境变量覆盖缺省字段。
func TestSingleFileEnvironment(t *testing.T) {
    isolateEnvironment(t)
    directory := t.TempDir()
    file := filepath.Join(directory, "config.yaml")
    if err := os.WriteFile(file, []byte(testConfig), 0600); err != nil { t.Fatal(err) }
    cfg, err := Load(file, "")
    if err != nil { t.Fatal(err) }
    if !cfg.App.IsProd() || cfg.Database.DSN != "data/custom.db" || cfg.Server.Port != 8123 || len(cfg.LoadedFiles) != 1 || !cfg.RateLimit.Enabled || cfg.RateLimit.RPS != 7 {
        t.Fatalf("single-file configuration ignored: %+v", cfg)
    }
    if cfg.Database.AutoMigrate || cfg.GraphQL.Playground || cfg.Log.LogBody { t.Fatal("unsafe fallback") }
    t.Setenv("APP_ENV", "test")
    cfg, err = Load(file, "dev")
    if err != nil || !cfg.App.IsDev() { t.Fatalf("explicit env lost: %v", err) }
    cfg, err = Load(file, "")
    if err != nil || !cfg.App.IsTest() { t.Fatalf("APP_ENV lost: %v", err) }
    t.Setenv("APP_DATABASE_DSN", "data/environment.db")
    t.Setenv("APP_JWT_SECRET", "secret-from-explicit-environment")
    stripped := strings.ReplaceAll(testConfig, "  dsn: data/custom.db\n", "")
    stripped = strings.ReplaceAll(stripped, "  secret: independent-production-test-secret\n", "")
    if err := os.WriteFile(file, []byte(stripped), 0600); err != nil { t.Fatal(err) }
    cfg, err = Load(file, "prod")
    if err != nil || cfg.Database.DSN != "data/environment.db" || cfg.JWT.Secret != "secret-from-explicit-environment" { t.Fatalf("environment-only fields lost: %v", err) }
}

// TestConfigFailures 拒绝缺失、损坏及非法配置，不静默创建默认数据库。
func TestConfigFailures(t *testing.T) {
    isolateEnvironment(t)
    file := filepath.Join(t.TempDir(), "config.yaml")
    if _, err := Load(file, ""); err == nil { t.Fatal("missing base accepted") }
    for _, contents := range []string{
        "database: [broken",
        strings.ReplaceAll(testConfig, "  dsn: data/custom.db\n", ""),
        strings.ReplaceAll(testConfig, "independent-production-test-secret", "change-me-in-production-please"),
        strings.ReplaceAll(testConfig, "env: prod", "env: invalid"),
    } {
        if err := os.WriteFile(file, []byte(contents), 0600); err != nil { t.Fatal(err) }
        if _, err := Load(file, ""); err == nil { t.Fatal("invalid config accepted") }
    }
    if err := os.WriteFile(file, []byte(testConfig), 0600); err != nil { t.Fatal(err) }
    if err := os.Mkdir(ProfilePath(file, "prod"), 0700); err != nil { t.Fatal(err) }
    if _, err := Load(file, ""); err == nil { t.Fatal("profile directory error swallowed") }
}

// TestReleaseConfiguration 验证导出不混入开发值或环境秘密，并保留业务字段。
func TestReleaseConfiguration(t *testing.T) {
    isolateEnvironment(t)
    // 子测试工作目录与当前进程共用，因此本组不能 Parallel。
    directory := t.TempDir()
    previous, err := os.Getwd()
    if err != nil { t.Fatal(err) }
    if err := os.Chdir(directory); err != nil { t.Fatal(err) }
    t.Cleanup(func() { _ = os.Chdir(previous) })
    if err := os.Mkdir("configs", 0700); err != nil { t.Fatal(err) }
    if err := os.WriteFile("configs/config.yaml", []byte(testConfig + "custom:\n  feature: retained\n"), 0600); err != nil { t.Fatal(err) }
    if err := os.WriteFile("configs/config-prod.yaml", []byte("server:\n  mode: release\n"), 0600); err != nil { t.Fatal(err) }
    if err := os.WriteFile("configs/config-dev.yaml", []byte("log:\n  log_body: true\n"), 0600); err != nil { t.Fatal(err) }
    t.Setenv("APP_JWT_SECRET", "local-secret-must-not-be-exported")
    if err := WriteRelease("config.yaml"); err != nil { t.Fatal(err) }
    bytes, err := os.ReadFile("config.yaml")
    if err != nil { t.Fatal(err) }
    if strings.Contains(string(bytes), "local-secret") { t.Fatal("local environment exported") }
    merged := viper.New()
    merged.SetConfigFile("config.yaml")
    if err := merged.ReadInConfig(); err != nil { t.Fatal(err) }
    if merged.GetString("app.env") != "prod" || merged.GetString("custom.feature") != "retained" || merged.GetString("database.dsn") != "data/custom.db" || merged.GetBool("log.log_body") { t.Fatal("bad merge") }
    cfg, err := Load("", "")
    if err != nil || cfg.Server.Port != 8123 || !cfg.App.IsProd() { t.Fatalf("default single config not loaded: %v", err) }
    if err := WriteRelease("config.yaml"); err == nil { t.Fatal("overwrote existing export") }
}
`
