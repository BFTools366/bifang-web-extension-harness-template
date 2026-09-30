// 让 Web 的 React 根错误经过统一 logger，替代框架默认的原始异常输出。
export function webReactRootFiles(): Map<string, string> {
  return new Map([
    ["src/observability/reactRoot.ts", REACT_ROOT_SOURCE],
    ["src/observability/reactRoot.test.tsx", REACT_ROOT_TEST]
  ])
}

const REACT_ROOT_SOURCE = `import type { RootOptions } from "react-dom/client"
import { createLogger } from "./logger"

const logger = createLogger("react")

/** 不传递 componentStack；所有 React 根错误都由 logger 按环境归一化。 */
export const reactRootErrorHandlers = {
  /** 将已被 UI 边界处理的异常归一化，替代 React 的原始 console 输出。 */
  onCaughtError(error: unknown) {
    logger.error("react_caught", { surface: "web", component: "react-root", error })
  },
  /** 记录没有边界承接的根渲染错误，不展开框架的组件栈。 */
  onUncaughtError(error: unknown) {
    logger.error("react_uncaught", { surface: "web", component: "react-root", error })
  },
  /** 以 warn 记录 React 自动恢复事件，不把恢复视为未处理失败。 */
  onRecoverableError(error: unknown) {
    logger.warn("react_recovered", { surface: "web", component: "react-root", error })
  }
} satisfies RootOptions
`

const REACT_ROOT_TEST = `// @vitest-environment jsdom
import { Component, type PropsWithChildren } from "react"
import { createRoot } from "react-dom/client"
import { act } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { reactRootErrorHandlers } from "./reactRoot"

/** 用真实 React 边界验证根级已捕获错误的上报路径。 */
class TestBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  /** 标记渲染错误，交给安全的测试回退界面。 */
  static getDerivedStateFromError() { return { failed: true } }
  /** 保留正常子树或显示已捕获错误的回退文案。 */
  render() { return this.state.failed ? <p>Safe fallback</p> : this.props.children }
}

/** 抛出包含诊断内容的渲染错误，验证框架不会直接输出 Error。 */
function BrokenPage(): never {
  throw new Error("Root render failed")
}

// 用真实根渲染验证异常只进入结构化 sink，而非原始 Error console 参数。
test("React catches render errors through the structured root handler", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container, reactRootErrorHandlers)
  try {
    await act(async () => {
      root.render(<TestBoundary><BrokenPage /></TestBoundary>)
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]).toEqual([expect.objectContaining({
      level: "error",
      scope: "react",
      event: "react_caught",
      context: expect.objectContaining({ surface: "web", component: "react-root" })
    })])
    expect(error.mock.calls[0]?.[0]).not.toBeInstanceOf(Error)
    expect(container.textContent).toBe("Safe fallback")
  } finally {
    await act(async () => root.unmount())
    container.remove()
    error.mockRestore()
  }
})
`
