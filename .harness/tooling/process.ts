import { spawn } from "node:child_process"

// 执行 runCommand 函数的处理逻辑。
export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>(
    /* 执行 当前声明 函数的处理逻辑。 */ (resolve, reject) => {
      // 保存 child 变量供当前逻辑使用。
      const child = spawn(command, args, { cwd, stdio: "inherit" })
      child.once("error", reject)
      child.once(
        "exit",
        /* 执行 当前声明 函数的处理逻辑。 */ (code, signal) => {
          if (code === 0) {
            resolve()
            return
          }
          // 保存 suffix 变量供当前逻辑使用。
          const suffix = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
          reject(new Error(`${command} ${args.join(" ")} failed with ${suffix}`))
        }
      )
    }
  )
}
