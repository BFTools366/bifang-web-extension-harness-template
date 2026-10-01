import { readFile } from "node:fs/promises"
import path from "node:path"

// 保存 PNPM_POLICY_PATH 常量，定位单包项目的 pnpm 构建策略。
const PNPM_POLICY_PATH = "pnpm-workspace.yaml"

// 保存 REQUIRED_BUILD_ALLOWLIST 常量，锁定实际需要安装脚本的依赖。
const REQUIRED_BUILD_ALLOWLIST = ["@parcel/watcher", "esbuild", "sharp"] as const

/** 校验配置型 pnpm 文件只管理单包构建策略，不声明多包工作区。 */
export async function validatePnpmBuildPolicy(root: string, errors: string[]): Promise<void> {
  // 保存 policy 变量供本地策略检查使用。
  let policy: string
  try {
    policy = await readFile(path.join(root, PNPM_POLICY_PATH), "utf8")
  } catch {
    errors.push(`Missing required file: ${PNPM_POLICY_PATH}`)
    return
  }
  if (!/^allowBuilds:\s*$/mu.test(policy)) {
    errors.push("pnpm build policy must declare allowBuilds")
  }
  if (/^[ \t]*["']?packages["']?[ \t]*:/mu.test(policy)) {
    errors.push("pnpm build policy must not declare workspace packages")
  }
  // 保存 declarations 变量供受控构建脚本名单检查使用。
  const declarations = policy.split(/\r?\n/u).map((line) => line.trim())
  for (const dependency of REQUIRED_BUILD_ALLOWLIST) {
    if (
      !declarations.includes(`${dependency}: true`) &&
      !declarations.includes(`"${dependency}": true`) &&
      !declarations.includes(`'${dependency}': true`)
    ) {
      errors.push(`pnpm build policy must allow ${dependency}`)
    }
  }
}
