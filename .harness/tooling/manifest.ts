import { extensionIdentityManifest } from "./identity.ts"
import type { ProjectConfig } from "./types.ts"

/** 描述需要安全改写的 package.json 松散结构。 */
type PackageJson = Record<string, unknown>

// 保存 runtimeVersions 变量供当前逻辑使用。
const runtimeVersions = {
  react: "19.3.0",
  reactDom: "19.3.0",
  mantine: "9.6.3",
  query: "5.104.0",
  router: "1.170.40",
  jotai: "3.0.1",
  ky: "2.1.0",
  i18next: "26.4.2",
  reactI18next: "17.0.15"
} as const

// 保存 toolingVersions 变量供当前逻辑使用。
const toolingVersions = {
  typesReact: "19.3.0",
  typesReactDom: "19.3.0",
  vite: "8.3.1",
  viteReact: "6.1.1",
  routerCli: "1.167.39",
  routerPlugin: "1.168.41",
  plasmo: "0.90.5",
  typesChrome: "0.3.4"
} as const

// 保存 testingVersions 变量供当前逻辑使用。
const testingVersions = {
  testingLibrary: "16.3.3",
  jestDom: "7.0.1",
  userEvent: "14.6.7",
  jsdom: "30.1.1"
} as const

// 执行 asRecord 函数的处理逻辑。
function asRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      /* 执行 当前声明 函数的处理逻辑。 */ (entry): entry is [string, string] =>
        typeof entry[1] === "string"
    )
  )
}

// 执行 commonDependencies 函数的处理逻辑。
function commonDependencies(): Record<string, string> {
  return {
    "@mantine/core": runtimeVersions.mantine,
    "@mantine/hooks": runtimeVersions.mantine,
    "@tanstack/react-query": runtimeVersions.query,
    i18next: runtimeVersions.i18next,
    jotai: runtimeVersions.jotai,
    ky: runtimeVersions.ky,
    react: runtimeVersions.react,
    "react-dom": runtimeVersions.reactDom,
    "react-i18next": runtimeVersions.reactI18next
  }
}

// 执行 commonScripts 函数的处理逻辑。
function commonScripts(): Record<string, string> {
  return {
    harness: "tsx .harness/tooling/cli.ts",
    "comments:check": "tsx .harness/tooling/comment-policy.ts check",
    "source-size:check": "tsx .harness/tooling/source-size-policy.ts check",
    "env:validate": "tsx .harness/tooling/environment.ts validate",
    "release:inspect": "tsx .harness/tooling/release.ts inspect",
    "prototype:check": "tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts check",
    test: "vitest run",
    "test:related": "vitest related --run",
    typecheck: "tsc --noEmit",
    lint: "eslint . && pnpm comments:check && pnpm source-size:check",
    format: "prettier --write .",
    "format:check": "prettier --check ."
  }
}

// 执行 buildProjectManifest 函数的处理逻辑。
export function buildProjectManifest(existing: PackageJson, config: ProjectConfig): PackageJson {
  // 保存 dependencies 变量供当前逻辑使用。
  const dependencies = {
    ...asRecord(existing.dependencies),
    ...commonDependencies(),
    "@tanstack/react-router": runtimeVersions.router
  }
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies: Record<string, string> = {
    ...asRecord(existing.devDependencies),
    "@testing-library/jest-dom": testingVersions.jestDom,
    "@testing-library/react": testingVersions.testingLibrary,
    "@testing-library/user-event": testingVersions.userEvent,
    "@types/react": toolingVersions.typesReact,
    "@types/react-dom": toolingVersions.typesReactDom,
    jsdom: testingVersions.jsdom,
    ...(config.projectType === "web"
      ? {
          "@tanstack/router-cli": toolingVersions.routerCli,
          "@tanstack/router-plugin": toolingVersions.routerPlugin,
          "@vitejs/plugin-react": toolingVersions.viteReact,
          vite: toolingVersions.vite
        }
      : { "@types/chrome": toolingVersions.typesChrome, plasmo: toolingVersions.plasmo })
  }
  // 源 Harness 的框架依赖用于真实模板回归，终端项目统一只保留运行时声明。
  for (const dependency of Object.keys(dependencies)) delete devDependencies[dependency]
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = {
    ...commonScripts(),
    ...(config.projectType === "web"
      ? {
          "routes:generate": "tsr generate",
          dev: "vite --mode development",
          build: "pnpm build:release",
          "build:release": "tsx .harness/tooling/build.ts build",
          preview: "vite preview",
          // 真实文件路由测试也能从刚创建或刚检出的仓库直接执行。
          test: "pnpm routes:generate && vitest run",
          "test:related": "pnpm routes:generate && vitest related --run",
          typecheck: "pnpm routes:generate && tsc --noEmit"
        }
      : {
          dev: "plasmo dev --target=chrome-mv3 --env=.env.development",
          "dev:firefox": "plasmo dev --target=firefox-mv2 --env=.env.development",
          build: "pnpm build:release",
          "build:release": "tsx .harness/tooling/build.ts build",
          package: "tsx .harness/tooling/build.ts package"
        })
  }

  // 保存 manifest 变量供当前逻辑使用。
  const manifest: PackageJson = {
    ...existing,
    name: config.id,
    version: typeof existing.version === "string" ? existing.version : "0.1.0",
    private: true,
    description: config.description,
    type: "module",
    engines: { node: ">=24.0.0", pnpm: ">=12.8.1" },
    packageManager: "pnpm@12.8.1",
    scripts,
    dependencies,
    devDependencies
  }

  delete manifest.workspaces
  if (config.projectType === "extension") {
    // 强制 Parcel 按浏览器条件解析 TanStack Router 的 isServer 子路径。
    manifest["@parcel/resolver-default"] = { packageExports: true }
    manifest.targets = {
      default: {
        context: "browser",
        includeNodeModules: true
      }
    }
    manifest.displayName = config.name
    manifest.manifest = {
      ...extensionIdentityManifest(config)
    }
  } else {
    delete manifest.targets
    delete manifest.displayName
    delete manifest.manifest
  }
  return manifest
}

// 执行 updateManifestIdentity 函数的处理逻辑。
export function updateManifestIdentity(existing: PackageJson, config: ProjectConfig): PackageJson {
  // 保存 updated 变量供当前逻辑使用。
  const updated: PackageJson = {
    ...existing,
    name: config.id,
    description: config.description
  }
  if (config.projectType === "extension") {
    updated.displayName = config.name
    // 保存 currentManifest 变量供当前逻辑使用。
    const currentManifest =
      existing.manifest !== null && typeof existing.manifest === "object"
        ? { ...(existing.manifest as Record<string, unknown>) }
        : {}
    // 共享 override 不锁 manifest_version，防止覆盖 Firefox MV2 工厂。
    delete currentManifest.manifest_version
    updated.manifest = {
      ...currentManifest,
      ...extensionIdentityManifest(config)
    }
  }
  return updated
}
