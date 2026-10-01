/** 生成局部、路由与全局反馈共用的 Mantine/i18next 错误展示。 */
export const HTTP_ERROR_VIEW_SOURCE = `import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core"
import { useAtomValue } from "jotai"
import { useEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { describeHttpError } from "./httpErrors"
import { clearHttpFeedback, httpFeedbackAtom, reportHttpError } from "./httpFeedback"

/** 动作拒绝仍走统一反馈，不产生事件处理器的未处理 Promise。 */
function runErrorAction(action: () => void | Promise<void>): void {
  void Promise.resolve().then(action).catch(reportHttpError)
}

/** 恢复动作由当前消费者提供，只有真实认证入口存在时才提供重新认证按钮。 */
export interface HttpErrorViewProps {
  error: unknown
  onRetry?: () => void | Promise<void>
  retrying?: boolean
  homeLink?: ReactNode
  onAuthenticate?: () => void | Promise<void>
  headingOrder?: 1 | 2
}

/** 用固定文案区分 401、403 与其他错误，不展示原始异常或自动重放写操作。 */
export function HttpErrorView({ error, onRetry, retrying, homeLink, onAuthenticate, headingOrder = 2 }: HttpErrorViewProps) {
  const { t } = useTranslation()
  const presentation = describeHttpError(error)
  useEffect(() => { clearHttpFeedback(error) }, [error])
  return (
    <Stack gap="md">
      <div role={presentation.kind === "cancelled" ? "status" : "alert"}>
        <Title order={headingOrder}>{t(presentation.titleKey)}</Title>
        <Text mt="sm">{t(presentation.descriptionKey)}</Text>
      </div>
      <Group>
        {presentation.canRetry && onRetry !== undefined && <Button onClick={() => runErrorAction(onRetry)} loading={retrying}>{t("routeRetry")}</Button>}
        {presentation.kind === "authentication" && onAuthenticate !== undefined && <Button onClick={() => runErrorAction(onAuthenticate)}>{t("httpAuthenticate")}</Button>}
        {homeLink}
      </Group>
    </Stack>
  )
}

/** 直接请求、后台刷新与 mutation 的持续反馈保留现有内容，关闭只清理提示。 */
export function HttpFeedback() {
  const { t } = useTranslation()
  const presentation = useAtomValue(httpFeedbackAtom)
  if (presentation === null) return null
  return (
    <Alert role="alert" title={t(presentation.titleKey)} withCloseButton closeButtonLabel={t("httpDismiss")} onClose={() => clearHttpFeedback()}>
      {t(presentation.descriptionKey)}
    </Alert>
  )
}
`

/** 生成 Extension 独立入口的路由失败恢复，Web 继续使用自身布局组件。 */
export const EXTENSION_HTTP_ROUTE_SOURCE = `import { Anchor, Container, Paper } from "@mantine/core"
import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useEffect, useRef, useState } from "react"
import { HttpErrorView } from "./HttpErrorView"
import { createLogger } from "../../observability/logger"

const logger = createLogger("router")

/** 当前 Popup/Options Router 各自恢复读取；401/403 没有重试或伪登录动作。 */
export function ExtensionRouteErrorPage({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { reset } = useQueryErrorResetBoundary()
  const [retrying, setRetrying] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; reset(); return () => { mounted.current = false } }, [reset])
  /** 等待当前入口路由读取重新执行，失败继续显示恢复入口。 */
  async function retry(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setRetrying(true)
    try { reset(); await router.invalidate({ sync: true }) }
    catch { logger.error("route_retry_failed", { surface: "extension", reason: "retry_failed" }) }
    finally { inFlight.current = false; if (mounted.current) setRetrying(false) }
  }
  return <Container size="sm" py="md"><Paper p="md" withBorder>
    <HttpErrorView error={error} headingOrder={1} onRetry={retry} retrying={retrying} homeLink={<Anchor component={Link} to="/">{t("backHome")}</Anchor>} />
  </Paper></Container>
}
`
