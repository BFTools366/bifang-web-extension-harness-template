import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** 原始 Go 快照保持不变，本地账号及验证码校准只进入首次装配的冻结 Map。 */
export function completeEmailRegistration(
  files: Map<string, string>,
  moduleId: string,
  verification: boolean
): void {
  const root = fileURLToPath(new URL("../assets/", import.meta.url))
  /** 只从受管普通文本资产读取中性源码，不触碰目标工程。 */
  function overlay(group: string, relative = ""): void {
    for (const entry of readdirSync(path.join(root, group, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) overlay(group, name)
      else if (entry.isFile() && name.endsWith(".txt"))
        files.set(
          name.slice(0, -4).split(path.sep).join("/"),
          readFileSync(path.join(root, group, name), "utf8").replaceAll("project_id", moduleId)
        )
      else throw new Error(`验证码资产不是普通文本：${name}`)
    }
  }
  overlay("registration")
  if (!verification) return
  overlay("verification")
  /** 精确中性锚点不匹配时停止，不覆盖已变化的装配实现。 */
  function change(file: string, before: string, after: string): void {
    const value = files.get(file)
    if (!value || value.split(before).length !== 2) throw new Error(`验证码锚点已变化：${file}`)
    files.set(file, value.replace(before, after))
  }
  change(
    "internal/service/auth.go",
    'if req.CodeType != ""',
    'if !s.verification.Enabled() { return nil, apperr.ErrVerificationDisabled }\n\tif req.CodeType != ""'
  )
  const config = "internal/config/config.go"
  change(config, '"io/fs"', '"io/fs"\n\t"net/mail"')
  change(
    config,
    'Provider string `mapstructure:"provider"`',
    'Provider string `mapstructure:"provider"`\n\tSMTP SMTP `mapstructure:"smtp"`'
  )
  change(
    config,
    "// verificationProviders",
    readFileSync(path.join(root, "config/smtp.go.txt"), "utf8") + "// verificationProviders"
  )
  const value = files.get(config) ?? ""
  const start = value.indexOf("func (c *Config) validateVerification() error {")
  const end = value.indexOf("\n// ", start)
  if (start < 0 || end < 0) throw new Error("验证码配置函数缺失")
  files.set(
    config,
    value.slice(0, start) +
      readFileSync(path.join(root, "config/validate.go.txt"), "utf8") +
      value.slice(end)
  )
  change(
    config,
    'instance.SetDefault("verification.provider", "")',
    'instance.SetDefault("verification.provider", "")\n' +
      readFileSync(path.join(root, "config/defaults.go.txt"), "utf8")
  )
  change(
    "internal/model/models.go",
    "&OrganizationUser{}",
    "&OrganizationUser{}, &VerificationCode{}, &VerificationDeliveryState{}"
  )
  const account = "internal/api/v1/account.go"
  change(
    account,
    '"' + moduleId + '/internal/dto"',
    '"' + moduleId + '/internal/dto"\n\t"' + moduleId + '/internal/apperr"'
  )
  change(
    account,
    "verification := service.NewVerificationService(",
    `sender := notify.New(deps.Config.Verification.Provider)
  if deps.Config.Verification.Provider == "smtp" {
    cfg := deps.Config.Verification.SMTP
    sender = notify.NewSMTP(notify.SMTPOptions{Host: cfg.Host, Port: cfg.Port, From: cfg.From, Username: cfg.Username, Password: cfg.Password, TLSMode: cfg.TLSMode, Timeout: cfg.Timeout})
  }
  verification := service.NewVerificationService(`
  )
  change(account, "notify.New(deps.Config.Verification.Provider),", "sender,")
  const route = files.get(account) ?? ""
  const sendStart = route.indexOf("func (m *accountModule) sendVerificationCode(")
  const sendEnd = route.indexOf("\n// register", sendStart)
  if (sendStart < 0 || sendEnd < 0) throw new Error("验证码路由函数缺失")
  files.set(
    account,
    route.slice(0, sendStart) +
      `func (m *accountModule) sendVerificationCode(c *gin.Context) {
  var req dto.SendVerificationCodeRequest
  request.Bind(c, &req)
  scene, err := service.ResolveScene(req.Scene)
  if err != nil { panic(err) }
  req.Scene = scene.Key
  if req.Scene != model.VerificationSceneRegister {
    panic(apperr.ErrVerificationSceneUnsupported)
  }
  result, err := m.verification.Send(c.Request.Context(), &req, c.ClientIP())
  if err != nil { panic(err) }
  response.OK(c, "verification.code", result)
}
` +
      route.slice(sendEnd)
  )
}
