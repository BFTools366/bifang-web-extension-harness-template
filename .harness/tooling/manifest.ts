import type { ProjectConfig } from "./types.ts"

type PackageJson = Record<string, unknown>

// 保存 runtimeVersions 变量供当前逻辑使用。
const runtimeVersions = {
  react: "19.2.8",
  reactDom: "19.2.8",
  mantine: "9.5.1",
  query: "5.101.4",
  router: "1.170.25",
  jotai: "2.20.2",
  i18next: "26.3.6",
  reactI18next: "17.0.11"
} as const

// 保存 toolingVersions 变量供当前逻辑使用。
const toolingVersions = {
  typesReact: "19.2.18",
  typesReactDom: "19.2.4",
  vite: "8.2.1",
  viteReact: "6.0.5",
  routerCli: "1.167.27",
  routerPlugin: "1.168.29",
  plasmo: "0.90.5",
  typesChrome: "0.2.5"
} as const

// 保存 testingVersions 变量供当前逻辑使用。
const testingVersions = {
  testingLibrary: "16.3.2",
  jestDom: "6.9.1",
  userEvent: "14.6.3",
  jsdom: "30.0.1"
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
    "env:validate": "tsx .harness/tooling/environment.ts validate",
    "release:inspect": "tsx .harness/tooling/release.ts inspect",
    test: "pnpm env:validate --profile test && vitest run",
    typecheck: "pnpm env:validate && tsc --noEmit",
    lint: "eslint . && pnpm comments:check",
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
    ...(config.projectType === "web" ? { "@tanstack/react-router": runtimeVersions.router } : {})
  }
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies = {
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
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = {
    ...commonScripts(),
    ...(config.projectType === "web"
      ? {
          "routes:generate": "tsr generate",
          dev: "pnpm env:validate --profile development && vite --mode development",
          build: "pnpm build:release",
          "build:development":
            "pnpm env:validate --profile development && vite build --mode development && tsc --noEmit",
          "build:test":
            "pnpm env:validate --profile test && vite build --mode test && tsc --noEmit",
          "build:release":
            "pnpm env:validate --profile release && vite build --mode production && tsc --noEmit && pnpm release:inspect",
          preview: "vite preview",
          test: "pnpm env:validate --profile test && pnpm routes:generate && vitest run",
          typecheck: "pnpm env:validate && pnpm routes:generate && tsc --noEmit"
        }
      : {
          dev: "pnpm env:validate --profile development && plasmo dev --env=.env.development",
          build: "pnpm build:release",
          "build:development":
            "pnpm env:validate --profile development && plasmo build --tag=development --env=.env.development",
          "build:test":
            "pnpm env:validate --profile test && plasmo build --tag=test --env=.env.test",
          "build:release":
            "pnpm env:validate --profile release && plasmo build --env=.env.production && pnpm harness validate && pnpm release:inspect",
          package:
            "pnpm env:validate --profile release && plasmo build --zip --env=.env.production && pnpm harness validate && pnpm release:inspect"
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
    engines: { node: ">=22.22.2", pnpm: ">=10.33.3" },
    packageManager: "pnpm@10.33.3",
    pnpm: {
      onlyBuiltDependencies: ["@parcel/watcher", "esbuild", "sharp"]
    },
    scripts,
    dependencies,
    devDependencies
  }

  delete manifest.workspaces
  if (config.projectType === "extension") {
    manifest.targets = {
      default: {
        context: "browser",
        includeNodeModules: true
      }
    }
    manifest.displayName = config.name
    manifest.manifest = {
      manifest_version: 3,
      name: config.name,
      description: config.description
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
        ? (existing.manifest as Record<string, unknown>)
        : {}
    updated.manifest = {
      ...currentManifest,
      manifest_version: 3,
      name: config.name,
      description: config.description
    }
  }
  return updated
}
