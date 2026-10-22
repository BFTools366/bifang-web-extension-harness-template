import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { writeNew } from "./files.ts"

/** 真实响应日志回归，防止复用上游实现时记录原始 Token。 */
const GO_LOGGER_TEST = String.raw`package middleware

import (
    "bytes"
    "errors"
    "io"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/sirupsen/logrus"

    "project_id/internal/config"
)

// TestLoggerNeverLeaksResponseCredentials 使用实际配置验证正文与请求头的脱敏。
func TestLoggerNeverLeaksResponseCredentials(t *testing.T) {
    gin.SetMode(gin.TestMode)
    cfg, err := config.Load("../../configs/config.yaml", "dev")
    if err != nil { t.Fatal(err) }
    for _, body := range []bool{false, true} {
        var logs bytes.Buffer
        logger := logrus.New()
        logger.SetOutput(&logs)
        engine := gin.New()
        sensitive := append(cfg.Log.SensitiveKeys, "private_field")
        engine.Use(Logger(LoggerOptions{Logger: logger, LogBody: body, LogHeader: true, SensitiveKeys: sensitive}))
        secret := "fixture-sensitive-credential"
        payload := "{\"access_token\":\"" + secret + "\",\"refresh_token\":\"" + secret + "\",\"password\":\"" + secret + "\",\"old_password\":\"" + secret + "\",\"new_password\":\"" + secret + "\",\"code\":\"" + secret + "\",\"private_field\":\"" + secret + "\"}"
        engine.POST("/credentials", func(c *gin.Context) {
            received, err := io.ReadAll(c.Request.Body)
            if err != nil || string(received) != payload { t.Error("请求体发生变化") }
            c.Data(http.StatusOK, "application/json", []byte(payload))
        })
        request := httptest.NewRequest(http.MethodPost, "/credentials", strings.NewReader(payload))
        request.Header.Set("Content-Type", "application/json")
        for _, key := range []string{"Authorization", "Cookie", "X-AUTH-TOKEN", "X-Http-Request"} { request.Header.Set(key, secret) }
        response := httptest.NewRecorder()
        engine.ServeHTTP(response, request)
        if response.Code != http.StatusOK || response.Body.String() != payload { t.Fatal("真实响应应完整到达调用方") }
        if strings.Contains(logs.String(), secret) { t.Fatalf("正文开关 %v 泄漏秘密", body) }
        if !body && strings.Contains(logs.String(), "response=") { t.Fatal("关闭正文日志时不得记录响应体") }
        if body && !strings.Contains(logs.String(), "response=") { t.Fatal("小型调试响应应经过脱敏后记录") }
    }
}

// TestLoggerPreservesLargeBodies 验证大请求和响应完整透传且捕获有界。
func TestLoggerPreservesLargeBodies(t *testing.T) {
    gin.SetMode(gin.TestMode)
    payload := strings.Repeat("x", (1 << 20) + 1024)
    for _, enabled := range []bool{false, true} {
        logger := logrus.New()
        logger.SetOutput(io.Discard)
        engine := gin.New()
        engine.Use(Logger(LoggerOptions{Logger: logger, LogBody: enabled}))
        engine.POST("/large", func(c *gin.Context) {
            actual, err := io.ReadAll(c.Request.Body)
            if err != nil || string(actual) != payload { t.Errorf("正文开关 %v 截断请求：%d", enabled, len(actual)) }
            _, _ = c.Writer.Write([]byte(payload))
            _, _ = c.Writer.WriteString(payload)
            capture, captured := c.Writer.(*bodyCaptureWriter)
            if !enabled && captured { t.Error("关闭正文日志时仍包装响应缓冲") }
            if captured && capture.body.Len() > maxBufferedBody + 1 { t.Error("响应捕获超过硬上限") }
        })
        response := httptest.NewRecorder()
        engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/large", strings.NewReader(payload)))
        if response.Code != http.StatusOK || response.Body.String() != payload + payload { t.Fatal("日志改变了大响应") }
    }
}

// harnessFailingBody 同时返回部分数据与读取错误以检查透传语义。
type harnessFailingBody struct { read, closed bool }

var harnessReadError = errors.New("fixture read failure")

// Read 在首次读取时产生部分数据和错误，随后结束。
func (b *harnessFailingBody) Read(target []byte) (int, error) {
    if b.read { return 0, io.EOF }
    b.read = true
    return copy(target, "partial"), harnessReadError
}

// Close 记录底层资源已释放。
func (b *harnessFailingBody) Close() error { b.closed = true; return nil }

// TestLoggerPreservesBodyReadErrors 保留读取失败前的数据、原始错误及关闭职责。
func TestLoggerPreservesBodyReadErrors(t *testing.T) {
    gin.SetMode(gin.TestMode)
    logger := logrus.New()
    logger.SetOutput(io.Discard)
    engine := gin.New()
    engine.Use(Logger(LoggerOptions{Logger: logger, LogBody: true}))
    body := &harnessFailingBody{}
    engine.POST("/failure", func(c *gin.Context) {
        actual, err := io.ReadAll(c.Request.Body)
        if string(actual) != "partial" || !errors.Is(err, harnessReadError) { t.Errorf("读取错误被日志吞掉：%q %v", actual, err) }
        _ = c.Request.Body.Close()
    })
    request := httptest.NewRequest(http.MethodPost, "/failure", nil)
    request.Body = body
    engine.ServeHTTP(httptest.NewRecorder(), request)
    if !body.closed { t.Fatal("底层请求体没有关闭") }
}
`

/** 在固定上游日志器上校准透传、缓冲与脱敏，不修改受摘要保护的来源资产。 */
function adaptGoLogger(source: string): string {
  const replacements: [string, string][] = [
    [
      '"access_token", "refresh_token", "cookie", "api_key",',
      '"access_token", "refresh_token", "cookie", "api_key", "set-cookie", "X-AUTH-TOKEN", "X-Http-Request", "old_password", "new_password", "code",'
    ],
    [
      "\t\tcapture := &bodyCaptureWriter{ResponseWriter: c.Writer, body: &bytes.Buffer{}}\n\t\tc.Writer = capture",
      "\t\tvar capture *bodyCaptureWriter\n\t\tif options.LogBody {\n\t\t\tcapture = &bodyCaptureWriter{ResponseWriter: c.Writer, body: &bytes.Buffer{}}\n\t\t\tc.Writer = capture\n\t\t}"
    ],
    [
      'if rawBody != "" {',
      "if rawBody != nil && rawBody.body.Len() > 0 && rawBody.body.Len() <= maxBufferedBody {"
    ],
    [
      "maskBody(rawBody, c.ContentType(), sensitive)",
      "maskBody(rawBody.body.String(), c.ContentType(), sensitive)"
    ],
    [
      "if capture.body.Len() > 0 {",
      "if capture != nil && capture.body.Len() > 0 && capture.body.Len() <= maxBufferedBody {"
    ],
    [
      "truncateBody(capture.body.String(), limit)",
      'truncateBody(maskBody(capture.body.String(), c.Writer.Header().Get("Content-Type"), sensitive), limit)'
    ],
    [
      "\tw.body.Write(data)\n\treturn w.ResponseWriter.Write(data)",
      "\tn, err := w.ResponseWriter.Write(data)\n\tif remaining := maxBufferedBody + 1 - w.body.Len(); remaining > 0 {\n\t\tw.body.Write(data[:min(n, remaining)])\n\t}\n\treturn n, err"
    ],
    [
      "\tw.body.WriteString(value)\n\treturn w.ResponseWriter.WriteString(value)",
      "\tn, err := w.ResponseWriter.WriteString(value)\n\tif remaining := maxBufferedBody + 1 - w.body.Len(); remaining > 0 {\n\t\tw.body.WriteString(value[:min(n, remaining)])\n\t}\n\treturn n, err"
    ],
    [
      "\tsource := keys\n\tif len(source) == 0 {\n\t\tsource = defaultSensitiveKeys\n\t}",
      "\tsource := append([]string{}, defaultSensitiveKeys...)\n\tsource = append(source, keys...)"
    ]
  ]
  for (const [before, after] of replacements) {
    if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
      throw new Error("Go 日志适配锚点漂移")
    source = source.replace(before, after)
  }
  const start = source.indexOf("// readRequestBody ")
  const end = source.indexOf("// latencyMillis ", start)
  if (start < 0 || end < 0) throw new Error("Go 请求体捕获适配锚点漂移")
  return (
    source.slice(0, start) +
    String.raw`// readRequestBody 仅透传读取，日志副本不改变请求数据、错误或关闭语义。
func readRequestBody(c *gin.Context, enabled bool) *bodyCaptureReader {
    if !enabled || c.Request.Body == nil { return nil }
    captured := &bodyCaptureReader{ReadCloser: c.Request.Body}
    c.Request.Body = captured
    return captured
}

// bodyCaptureReader 在业务实际读取时保留有界副本，嵌入的 Close 仍归底层请求体。
type bodyCaptureReader struct {
    io.ReadCloser
    body bytes.Buffer
}

// Read 原样转发数据和错误，超过日志上限时只停止捕获。
func (r *bodyCaptureReader) Read(data []byte) (int, error) {
    n, err := r.ReadCloser.Read(data)
    if remaining := maxBufferedBody + 1 - r.body.Len(); remaining > 0 {
        r.body.Write(data[:min(n, remaining)])
    }
    return n, err
}

` +
    source.slice(end)
  )
}

/** 从受管资产生成中性 Go 服务，按成员 cwd 加载配置，不启用任何业务 Mock。 */
export async function generateGoServer(
  workspaceRoot: string,
  directory: string,
  id: string
): Promise<void> {
  const assets = path.join(workspaceRoot, ".agents/skills/go-implement-service/assets")
  const seed = path.join(assets, "go-service")
  /** 只复制普通模板文件，拒绝链接或特殊文件进入生成结果。 */
  async function copyDirectory(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(seed, relative), { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) await copyDirectory(file)
      else if (entry.isFile()) {
        if (file === "README.md") continue
        let source = (await readFile(path.join(seed, file), "utf8"))
          .replaceAll("<project_id>", id)
          .replaceAll("project_id", id)
        if (file === "configs/config-dev.yaml") {
          source = source
            .replace(/verification:[\s\S]*$/u, "")
            .replace("log_body: true", "log_body: false")
            .replace("log_header: true", "log_header: false")
        }
        if (file === "configs/config.yaml")
          source = source
            .replace("host: 0.0.0.0", "host: 127.0.0.1")
            .replace("header: Accept-Language", "header: X-Lang")
            .replace("alt_header: X-Language", "alt_header: Accept-Language")
            .replace("    - Authorization", "    - Authorization\n    - X-Lang")
        if (file === "internal/api/router.go") {
          source = source.replace("import (", 'import (\n"os"')
          source = source.replace(
            "engine := gin.New()",
            'engine := gin.New()\n// 由工作区编排器核对本次新建服务，避免连接端口上其他进程。\nengine.Use(func(c *gin.Context) {\n  if instance := os.Getenv("APP_HARNESS_INSTANCE"); instance != "" {\n    c.Header("X-Harness-Instance", instance)\n  }\n  c.Next()\n})'
          )
        }
        if (file === "internal/middleware/locale.go") {
          const alternate = source.indexOf('\tif options.AltHeader != "" {')
          const primary = source.indexOf('\tif options.Header != "" {', alternate)
          const query = source.indexOf('\tif options.Query != "" {', primary)
          if (alternate < 0 || primary < 0 || query < 0)
            throw new Error("Go 语言优先级模板发生变化")
          source =
            source.slice(0, alternate) +
            source.slice(primary, query) +
            source.slice(alternate, primary) +
            source.slice(query)
        }
        if (file === "internal/middleware/logger.go") source = adaptGoLogger(source)
        await writeNew(path.join(workspaceRoot, directory, file), source)
      } else throw new Error(`Go 模板不能包含链接或特殊文件：${file}`)
    }
  }
  await copyDirectory("")
  await writeNew(
    path.join(workspaceRoot, directory, "internal/middleware/logger_test.go"),
    GO_LOGGER_TEST.replaceAll("project_id", id)
  )
  await writeNew(
    path.join(workspaceRoot, directory, "README.md"),
    `# ${id} 服务端\n\n从 Workspace 根运行 \`pnpm dev:server\` 或在此运行 \`go run ./cmd/server\`。Go >=1.26；Gin HTTP + GORM SQLite，数据在 data/app.db。中性基线只提供 GET /healthz 与 GET /api/v1/system/health-check；业务按独立领域 Skill 实现。测试：\`go test ./...\`。\n\n开发监听 127.0.0.1:8080；测试/生产地址和部署按真实环境配置。无演示业务数据、默认用户或验证码回显。配置、数据库、日志路径均相对此成员目录。\n`
  )
  await writeNew(
    path.join(workspaceRoot, directory, "AGENTS.md"),
    "# Go 成员\n\n先读 ../AGENTS.md 与 ../docs/GO_SERVICE.md；Git、策略、PRD 和接口文档归 Workspace 根。仅在此实现 Go 服务，业务规则进入 service，handler 仅解码与映射。按请求读取 $go-implement-service 或领域 Skill；不运行独立初始化、创建嵌套 Git、替换根策略或另设发布生命周期。\n"
  )
}
