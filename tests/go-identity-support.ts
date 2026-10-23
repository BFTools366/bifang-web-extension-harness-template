import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import { setTimeout } from "node:timers/promises"

/** 为真实进程分配隔离端口，服务与数据库仅归当前测试所有。 */
export async function startGoFixture(
  directory: string,
  binary: string,
  environment: Record<string, string> = {}
) {
  const socket = createServer()
  socket.listen(0, "127.0.0.1")
  await once(socket, "listening")
  const address = socket.address()
  if (!address || typeof address === "string") throw new Error("测试端口分配失败")
  const port = address.port
  socket.close()
  await once(socket, "close")
  const child = spawn(binary, [], {
    cwd: directory,
    env: {
      ...process.env,
      ...environment,
      GOTOOLCHAIN: "local",
      APP_ENV: environment.APP_ENV ?? "dev",
      APP_SERVER_PORT: String(port)
    },
    stdio: "ignore"
  })
  const exited = once(child, "exit")
  let spawnError: Error | undefined
  child.once("error", (error) => {
    spawnError = error
  })
  /** 只终止当前测试创建的进程，超时后强制回收。 */
  async function stop(): Promise<void> {
    if (spawnError || child.exitCode !== null || child.signalCode !== null) return
    child.kill("SIGTERM")
    await Promise.race([exited, setTimeout(5000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await exited
    }
  }
  const url = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError || child.exitCode !== null) {
      await stop()
      throw spawnError ?? new Error("Go 测试服务启动失败")
    }
    try {
      const response = await fetch(url + "/healthz", { signal: AbortSignal.timeout(200) })
      if (response.ok) return { url, stop }
    } catch {
      /* 仅重试当前测试进程的就绪探测。 */
    }
    await setTimeout(100)
  }
  await stop()
  throw new Error("Go 测试服务启动超时")
}
