import { spawn } from "node:child_process"

export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      const suffix = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      reject(new Error(`${command} ${args.join(" ")} failed with ${suffix}`))
    })
  })
}
