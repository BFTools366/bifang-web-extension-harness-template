import "@testing-library/jest-dom/vitest"

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    // 执行 当前声明 函数的处理逻辑。
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      // 执行 当前声明 函数的处理逻辑。
      addListener: () => undefined,
      // 执行 当前声明 函数的处理逻辑。
      removeListener: () => undefined,
      // 执行 当前声明 函数的处理逻辑。
      addEventListener: () => undefined,
      // 执行 当前声明 函数的处理逻辑。
      removeEventListener: () => undefined,
      // 执行 当前声明 函数的处理逻辑。
      dispatchEvent: () => false
    })
  })
}

if (typeof window !== "undefined" && typeof globalThis.ResizeObserver !== "function") {
  // 实现 TestResizeObserver 类的职责。
  class TestResizeObserver implements ResizeObserver {
    // 保存 #callback 类字段的状态。
    readonly #callback: ResizeObserverCallback

    // 实现 当前声明 类成员的处理逻辑。
    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
    }

    // 实现 disconnect 类成员的处理逻辑。
    disconnect(): void {}

    // 实现 observe 类成员的处理逻辑。
    observe(target: Element): void {
      this.#callback(
        [
          {
            target,
            contentRect: target.getBoundingClientRect(),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: []
          } as unknown as ResizeObserverEntry
        ],
        this
      )
    }

    // 实现 unobserve 类成员的处理逻辑。
    unobserve(): void {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: TestResizeObserver
  })
}

if (
  typeof window !== "undefined" &&
  typeof window.Element.prototype.scrollIntoView !== "function"
) {
  Object.defineProperty(window.Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    // 执行 当前声明 函数的处理逻辑。
    value: () => undefined
  })
}
