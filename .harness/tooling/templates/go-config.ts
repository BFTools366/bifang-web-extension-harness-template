/** 在锁定上游快照之外校准配置加载；业务参数来自 YAML，代码只保留保守退级。 */
export function adaptGoConfiguration(source: string): string {
  const loadStart = source.indexOf("func Load(path string, env string)")
  const resolveStart = source.indexOf("// ResolveEnv", loadStart)
  const defaultsStart = source.indexOf("// setDefaults")
  if (loadStart < 0 || resolveStart < 0 || defaultsStart < 0)
    throw new Error("Go 配置模板锚点发生变化")
  source =
    source.slice(0, loadStart) +
    GO_CONFIG_LOAD +
    source.slice(resolveStart, defaultsStart) +
    GO_SAFE_DEFAULTS
  return source
    .replace('DefaultPath = "configs/config.yaml"', 'DefaultPath = ""')
    .replace("RateLimit RateLimit", 'RateLimit RateLimit `mapstructure:"rate_limit"`')
    .replace(
      "// DefaultPath 是基线配置文件的默认相对路径。",
      "// DefaultPath 为空时优先读取当前目录 config.yaml，再兼容 configs/config.yaml。"
    )
    .replace(
      "return errors.As(err, &pathErr)",
      "return errors.As(err, &pathErr) && errors.Is(err, fs.ErrNotExist)"
    )
    .replace(
      "// ResolveEnv 按显式参数、APP_ENV、配置文件与默认值的顺序确定环境名。",
      "// ResolveEnv 解析显式参数与 APP_ENV，空值由 Load 从配置文件决定。"
    )
    .replace("return DefaultEnv\n}", 'return ""\n}')
    .replace(
      "if c.Server.Port <= 0",
      'if c.App.Env != "dev" && c.App.Env != "test" && c.App.Env != "prod" {\n return errors.New("config: app.env 必须为 dev、test 或 prod")\n}\nif c.Server.ReadTimeout <= 0 || c.Server.WriteTimeout <= 0 || c.Server.IdleTimeout <= 0 || c.Server.ShutdownTimeout <= 0 {\n return errors.New("config: HTTP 超时必须大于 0")\n}\nif c.App.IsProd() && c.JWT.Secret == "change-me-in-production-please" {\n return errors.New("config: 生产环境必须配置独立 jwt.secret")\n}\nif c.Server.Port <= 0'
    )
}

/** 先读配置环境，再合并可选 profile；同目录发布配置优先于开发目录。 */
const GO_CONFIG_LOAD = `func Load(path string, env string) (*Config, error) {
    if strings.TrimSpace(path) == "" {
        path = "config.yaml"
        if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
            path = "configs/config.yaml"
        }
    }
    instance := viper.New()
    instance.SetEnvPrefix(EnvPrefix)
    instance.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
    instance.AutomaticEnv()
    if err := bindEnvironment(instance); err != nil { return nil, err }
    if err := instance.BindEnv("app.env", EnvKey); err != nil { return nil, err }
    if err := instance.BindEnv("app.node_id", "APP_NODE_ID"); err != nil { return nil, err }
    setDefaults(instance)
    // 基线配置缺失或不可读时拒绝启动，避免静默连接到另一份数据库。
    if _, err := os.Stat(path); err != nil { return nil, fmt.Errorf("config: 无法读取基线配置: %w", err) }
    if err := readInto(instance, path); err != nil { return nil, err }
    loaded := []string{path}
    resolvedEnv := ResolveEnv(env)
    if resolvedEnv == "" { resolvedEnv = instance.GetString("app.env") }
    if resolvedEnv == "" { resolvedEnv = DefaultEnv }
    if resolvedEnv != "dev" && resolvedEnv != "test" && resolvedEnv != "prod" {
        return nil, errors.New("config: 环境必须为 dev、test 或 prod")
    }
    profile := ProfilePath(path, resolvedEnv)
    if err := readInto(instance, profile); err != nil { return nil, err }
    if _, err := os.Stat(profile); err == nil { loaded = append(loaded, profile) }
    instance.Set("app.env", resolvedEnv)
    cfg := &Config{}
    if err := instance.Unmarshal(cfg); err != nil { return nil, fmt.Errorf("config: 无法解析配置: %w", err) }
    cfg.LoadedFiles = loaded
    if err := cfg.Validate(); err != nil { return nil, err }
    return cfg, nil
}

`

/** 不在程序中保存数据库地址、身份、生产密钥或业务默认值。 */
const GO_SAFE_DEFAULTS = `// setDefaults 只保护缺省字段的安全行为，实际运行参数由配置文件拥有。
func setDefaults(instance *viper.Viper) {
    instance.SetDefault("app.env", DefaultEnv)
    instance.SetDefault("app.node_id", int64(-1))
    instance.SetDefault("server.host", "127.0.0.1")
    instance.SetDefault("server.port", 8080)
    instance.SetDefault("server.mode", "release")
    instance.SetDefault("server.read_timeout", 15*time.Second)
    instance.SetDefault("server.write_timeout", 15*time.Second)
    instance.SetDefault("server.idle_timeout", 60*time.Second)
    instance.SetDefault("server.shutdown_timeout", 10*time.Second)
    instance.SetDefault("database.auto_migrate", false)
    instance.SetDefault("graphql.enabled", false)
    instance.SetDefault("graphql.playground", false)
    instance.SetDefault("graphql.introspection", false)
    instance.SetDefault("verification.enabled", false)
    instance.SetDefault("verification.mock", false)
    instance.SetDefault("verification.provider", "")
    instance.SetDefault("log.level", "warn")
    instance.SetDefault("log.format", "json")
    instance.SetDefault("log.log_body", false)
    instance.SetDefault("log.log_header", false)
    instance.SetDefault("log.body_limit", 4096)
    instance.SetDefault("rate_limit.enabled", false)
    instance.SetDefault("cors.enabled", false)
    instance.SetDefault("cors.allow_credentials", false)
    instance.SetDefault("cors.use_wildcard", false)
}
`

/** 导出配置只合并真实 YAML，不把本机 APP_* 秘密或开发覆盖混入发布包。 */
export const GO_RELEASE_CONFIG = `package config

import (
    "errors"
    "fmt"
    "io/fs"
    "os"
    "github.com/spf13/viper"
)

// WriteRelease 合并基线与生产配置，生成唯一部署配置；不启动数据库或服务。
func WriteRelease(output string) error {
    instance := viper.New()
    // 两个来源均为发布合同的一部分；缺失时不能把开发配置冒充生产配置。
    for _, file := range []string{"configs/config.yaml", "configs/config-prod.yaml"} {
        if _, err := os.Stat(file); err != nil { return fmt.Errorf("config: 发布配置缺失: %w", err) }
        if err := readInto(instance, file); err != nil { return err }
    }
    instance.Set("app.env", "prod")
    // 部署环境秘密可在解压后编辑 config.yaml 或通过显式 APP_* 覆盖注入。
    if _, err := os.Lstat(output); !errors.Is(err, fs.ErrNotExist) {
        if err != nil { return err }
        return errors.New("config: 导出目标已存在")
    }
    file, err := os.OpenFile(output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
    if err != nil { return err }
    if err := file.Close(); err != nil { return err }
    return instance.WriteConfigAs(output)
}
`

/** 配置导出工具在本机执行，目标平台的 Server 只负责实际运行。 */
export const GO_RELEASE_CONFIG_COMMAND = `package main

import (
    "flag"
    "fmt"
    "os"
    "project_id/internal/config"
)

// main 仅生成单份生产配置，不连接数据库、监听端口或读取环境秘密。
func main() {
    output := flag.String("output", "", "输出配置路径")
    flag.Parse()
    if *output == "" { fmt.Fprintln(os.Stderr, "必须提供 --output"); os.Exit(1) }
    if err := config.WriteRelease(*output); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}
`

/** 显式绑定全部已声明字段，让缺省 YAML 字段也能被 APP_* 覆盖而无需业务默认值。 */
export const GO_CONFIG_ENVIRONMENT = `package config

import (
    "reflect"
    "strings"
    "github.com/spf13/viper"
)

// bindEnvironment 只遍历配置结构，不枚举或输出进程秘密。
func bindEnvironment(instance *viper.Viper) error {
    var bind func(reflect.Type, string) error
    bind = func(value reflect.Type, prefix string) error {
        for index := 0; index < value.NumField(); index++ {
            field := value.Field(index)
            if field.Name == "LoadedFiles" { continue }
            name := field.Tag.Get("mapstructure")
            if name == "" { name = strings.ToLower(field.Name) }
            key := prefix + name
            if field.Type.Kind() == reflect.Struct {
                if err := bind(field.Type, key + "."); err != nil { return err }
            } else if err := instance.BindEnv(key); err != nil { return err }
        }
        return nil
    }
    return bind(reflect.TypeOf(Config{}), "")
}
`

/** 生产差异独立维护，合并时保留用户配置的数据库和业务字段。 */
export const GO_PRODUCTION_CONFIG = `# 发布时与 config.yaml 合并为包内唯一 config.yaml。
app:
  env: prod
server:
  mode: release
jwt:
  # 解压后填写或由 APP_JWT_SECRET 注入，缺失时启动校验拒绝运行。
  secret: ""
log:
  level: warn
  format: json
  log_body: false
  log_header: false
database:
  log_level: warn
graphql:
  playground: false
  introspection: false
verification:
  mock: false
cors:
  enabled: false
`
