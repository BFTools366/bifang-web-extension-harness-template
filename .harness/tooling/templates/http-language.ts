import type { ProjectConfig } from "../types.ts"

// 执行 languageSource 函数的处理逻辑。
export function languageSource(): string {
  return `import { BRAND } from "../brand"
import { getWebStorage } from "../data/storage/webStorage"

/** 说明 SUPPORTED_LANGUAGES 的稳定结构与职责边界。 */
export const SUPPORTED_LANGUAGES = ["en", "zh"] as const
/** 说明 SupportedLanguage 的稳定结构与职责边界。 */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** 说明 LANGUAGE_STORAGE_KEY 的稳定结构与职责边界。 */
export const LANGUAGE_STORAGE_KEY = BRAND.id + ":language:v1"

/** 说明 LanguageRuntime 的稳定结构与职责边界。 */
export interface LanguageRuntime {
  readonly language?: string
  readonly resolvedLanguage?: string
  /** 说明当前方法的稳定职责与行为边界。 */
  changeLanguage(language: SupportedLanguage): Promise<unknown>
  /** 说明当前方法的稳定职责与行为边界。 */
  on(event: "languageChanged", listener: (language: string) => void): unknown
  /** 说明当前方法的稳定职责与行为边界。 */
  off(event: "languageChanged", listener: (language: string) => void): unknown
}

/** 说明 LanguageStorage 的稳定结构与职责边界。 */
export interface LanguageStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 说明 LanguageDocumentElement 的稳定结构与职责边界。 */
export interface LanguageDocumentElement {
  lang: string
}

/** 说明 LanguageControllerOptions 的稳定结构与职责边界。 */
export interface LanguageControllerOptions {
  runtime: LanguageRuntime
  storage?: LanguageStorage
  storageKey?: string
  navigatorLanguage?: string
  documentElement?: LanguageDocumentElement
}

/** 说明 LanguageController 的稳定结构与职责边界。 */
export interface LanguageController {
  ready(): Promise<void>
  getRequestLanguage(): SupportedLanguage
  /** 说明当前方法的稳定职责与行为边界。 */
  changeLanguage(language: string): Promise<void>
  /** 说明当前方法的稳定职责与行为边界。 */
  dispose(): void
}

/** 说明 recognizedLanguage 的稳定结构与职责边界。 */
function recognizedLanguage(value: unknown): SupportedLanguage | undefined {
  if (typeof value !== "string") return undefined
  const primary = value.trim().toLowerCase().split(/[-_]/, 1)[0]
  return primary === "en" || primary === "zh" ? primary : undefined
}

/** 说明 normalizeLanguage 的稳定结构与职责边界。 */
export function normalizeLanguage(value: unknown): SupportedLanguage {
  return recognizedLanguage(value) ?? "en"
}

/** 说明 browserDocumentElement 的稳定职责与浏览器降级边界。 */
function browserDocumentElement(): LanguageDocumentElement | undefined {
  return typeof document === "undefined" ? undefined : document.documentElement
}

/** 同步根文档语言，使屏幕阅读器与当前应用语言保持一致。 */
function syncDocumentLanguage(
  documentElement: LanguageDocumentElement | undefined,
  language: SupportedLanguage
): void {
  if (documentElement !== undefined) documentElement.lang = language
}

/** 说明 readStoredLanguage 的稳定结构与职责边界。 */
function readStoredLanguage(storage: LanguageStorage | undefined, key: string): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

/** 说明 storeLanguage 的稳定结构与职责边界。 */
function storeLanguage(
  storage: LanguageStorage | undefined,
  key: string,
  language: SupportedLanguage
): void {
  try {
    storage?.setItem(key, language)
  } catch {
    // Language persistence is optional and must not block application startup.
  }
}

/** 说明 createLanguageController 的稳定结构与职责边界。 */
export function createLanguageController(options: LanguageControllerOptions): LanguageController {
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY
  const documentElement = options.documentElement ?? browserDocumentElement()
  const storedLanguage = readStoredLanguage(options.storage, storageKey)
  let currentLanguage =
    recognizedLanguage(storedLanguage) ??
    normalizeLanguage(
      options.navigatorLanguage ?? options.runtime.resolvedLanguage ?? options.runtime.language
    )
  syncDocumentLanguage(documentElement, currentLanguage)

  const handleLanguageChanged = (language: string) => {
    currentLanguage = normalizeLanguage(language)
    storeLanguage(options.storage, storageKey, currentLanguage)
    syncDocumentLanguage(documentElement, currentLanguage)
  }
  options.runtime.on("languageChanged", handleLanguageChanged)

  const ready = options.runtime
    .changeLanguage(currentLanguage)
    .then(() => {
      storeLanguage(options.storage, storageKey, currentLanguage)
      syncDocumentLanguage(documentElement, currentLanguage)
    })
    .catch(() => {
      currentLanguage = normalizeLanguage(
        options.runtime.resolvedLanguage ?? options.runtime.language ?? options.navigatorLanguage
      )
      syncDocumentLanguage(documentElement, currentLanguage)
    })

  return {
    ready: () => ready,
    getRequestLanguage: () => currentLanguage,
    /** 说明当前方法的稳定职责与行为边界。 */
    async changeLanguage(language: string): Promise<void> {
      const normalized = normalizeLanguage(language)
      await options.runtime.changeLanguage(normalized)
      currentLanguage = normalized
      storeLanguage(options.storage, storageKey, normalized)
      syncDocumentLanguage(documentElement, normalized)
    },
    /** 说明当前方法的稳定职责与行为边界。 */
    dispose(): void {
      options.runtime.off("languageChanged", handleLanguageChanged)
    }
  }
}

let defaultController: LanguageController | undefined

/** 说明 InitialLanguageOptions 的稳定结构与职责边界。 */
export interface InitialLanguageOptions {
  storage?: LanguageStorage
  storageKey?: string
  navigatorLanguage?: string
}

/** 说明 initialApplicationLanguage 的稳定结构与职责边界。 */
export function initialApplicationLanguage(options: InitialLanguageOptions = {}): SupportedLanguage {
  const storage = options.storage ?? getWebStorage("local")
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY
  const navigatorLanguage =
    options.navigatorLanguage ?? (typeof navigator === "undefined" ? "en" : navigator.language)
  return recognizedLanguage(readStoredLanguage(storage, storageKey)) ?? normalizeLanguage(navigatorLanguage)
}

/** 说明 initializeLanguage 的稳定结构与职责边界。 */
export function initializeLanguage(runtime: LanguageRuntime): void {
  if (defaultController !== undefined) return
  defaultController = createLanguageController({
    runtime,
    storage: getWebStorage("local"),
    navigatorLanguage: initialApplicationLanguage()
  })
  void defaultController.ready()
}

/** 说明 getRequestLanguage 的稳定结构与职责边界。 */
export function getRequestLanguage(): SupportedLanguage {
  return defaultController?.getRequestLanguage() ?? initialApplicationLanguage()
}

/** 说明 changeApplicationLanguage 的稳定结构与职责边界。 */
export async function changeApplicationLanguage(language: string): Promise<void> {
  if (defaultController === undefined) {
    throw new Error("Language runtime is not initialized")
  }
  await defaultController.changeLanguage(language)
}
`
}

// 执行 languageTest 函数的处理逻辑。
export function languageTest(config: ProjectConfig): string {
  // 保存 expectedStorageKey 变量供当前逻辑使用。
  const expectedStorageKey = JSON.stringify(`${config.id}:language:v1`)
  return `// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import {
  LANGUAGE_STORAGE_KEY,
  createLanguageController,
  initialApplicationLanguage,
  normalizeLanguage,
  /** 说明 LanguageRuntime 的稳定结构与职责边界。 */
  type LanguageRuntime,
  /** 说明 LanguageStorage 的稳定结构与职责边界。 */
  type LanguageStorage
} from "./language"

/** 说明 controlledRuntime 的稳定结构与职责边界。 */
function controlledRuntime(initialLanguage: string) {
  let language = initialLanguage
  const listeners = new Set<(language: string) => void>()
  const runtime: LanguageRuntime = {
    /** 说明当前方法的稳定职责与行为边界。 */
    get language() {
      return language
    },
    /** 说明当前方法的稳定职责与行为边界。 */
    get resolvedLanguage() {
      return language
    },
    /** 说明当前方法的稳定职责与行为边界。 */
    async changeLanguage(nextLanguage) {
      language = nextLanguage
      for (const listener of listeners) listener(nextLanguage)
    },
    /** 说明当前方法的稳定职责与行为边界。 */
    on(_event, listener) {
      listeners.add(listener)
    },
    /** 说明当前方法的稳定职责与行为边界。 */
    off(_event, listener) {
      listeners.delete(listener)
    }
  }
  return {
    runtime,
    /** 说明当前方法的稳定职责与行为边界。 */
    emit(nextLanguage: string) {
      language = nextLanguage
      for (const listener of listeners) listener(nextLanguage)
    }
  }
}

describe("application language", () => {
  /** 验证当前场景的核心成功或风险边界。 */
  test("normalizes supported language variants and falls back to English", () => {
    expect(LANGUAGE_STORAGE_KEY).toBe(${expectedStorageKey})
    expect(normalizeLanguage("zh-CN")).toBe("zh")
    expect(normalizeLanguage("EN_us")).toBe("en")
    expect(normalizeLanguage("fr-FR")).toBe("en")
    expect(normalizeLanguage(undefined)).toBe("en")
    expect(
      initialApplicationLanguage({
        storage: { getItem: () => "fr-FR", setItem: vi.fn() },
        storageKey: "example:language",
        navigatorLanguage: "zh-CN"
      })
    ).toBe("zh")
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("persists a project-scoped preference and reads language dynamically", async () => {
    const values = new Map<string, string>([["example:language", "zh-CN"]])
    const storage: LanguageStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
    const controlled = controlledRuntime("en")
    const documentElement = { lang: "en" }
    const controller = createLanguageController({
      runtime: controlled.runtime,
      storage,
      storageKey: "example:language",
      navigatorLanguage: "en-US",
      documentElement
    })

    await controller.ready()
    expect(controller.getRequestLanguage()).toBe("zh")
    expect(values.get("example:language")).toBe("zh")
    expect(documentElement.lang).toBe("zh")

    controlled.emit("en-GB")
    expect(controller.getRequestLanguage()).toBe("en")
    expect(values.get("example:language")).toBe("en")
    expect(documentElement.lang).toBe("en")

    await controller.changeLanguage("zh-TW")
    expect(controller.getRequestLanguage()).toBe("zh")
    expect(documentElement.lang).toBe("zh")
    controller.dispose()
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("survives unavailable browser storage", async () => {
    const storage: LanguageStorage = {
      getItem: () => {
        throw new Error("storage denied")
      },
      setItem: vi.fn(() => {
        throw new Error("storage denied")
      })
    }
    const controlled = controlledRuntime("zh-CN")
    expect(
      initialApplicationLanguage({ storage, storageKey: "denied:language", navigatorLanguage: "zh-CN" })
    ).toBe("zh")
    const controller = createLanguageController({
      runtime: controlled.runtime,
      storage,
      navigatorLanguage: "en-US"
    })

    await expect(controller.ready()).resolves.toBeUndefined()
    expect(controller.getRequestLanguage()).toBe("en")
    await expect(controller.changeLanguage("en-US")).resolves.toBeUndefined()
    expect(controller.getRequestLanguage()).toBe("en")
  })
})
`
}
