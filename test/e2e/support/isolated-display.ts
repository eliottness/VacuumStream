import { spawn } from "node:child_process"

// Every test launches a real Electron window, which steals keyboard focus from whatever the
// developer is typing, so the suite owns a private X display for the whole run. xvfb-run picks a
// free display and writes its cookie, and the shell it starts reports both back before parking so
// the server stays up for the whole run; E2E_HEADED=1 keeps the run on the desktop instead.
const SCREEN = "-screen 0 1920x1080x24 -nolisten tcp"
const REPORT_AND_PARK = 'echo "$DISPLAY $XAUTHORITY"; exec sleep 2147483647'

type Environment = { readonly authority: string; readonly display: string }

const readEnvironment = (server: ReturnType<typeof spawn>): Promise<Environment> =>
  new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    server.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      if (!stdout.includes("\n")) return
      const [display, authority] = stdout.split("\n")[0]?.trim().split(" ") ?? []
      if (display === undefined || authority === undefined) {
        reject(new Error(`xvfb-run reported no display: ${stdout}`))
        return
      }
      resolve({ authority, display })
    })
    server.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    server.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new Error("xvfb-run is not installed; install xvfb or run the suite with E2E_HEADED=1")
          : error,
      )
    })
    server.on("exit", (code) => {
      reject(new Error(`xvfb-run exited with code ${code} before reporting a display: ${stderr}`))
    })
  })

export default async function startIsolatedDisplay(): Promise<() => Promise<void>> {
  const { E2E_HEADED } = process.env
  if (E2E_HEADED !== undefined) return async () => {}

  const server = spawn("xvfb-run", ["-a", "-s", SCREEN, "bash", "-c", REPORT_AND_PARK], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const { authority, display } = await readEnvironment(server)
  server.removeAllListeners("exit")
  Object.assign(process.env, {
    DISPLAY: display,
    ELECTRON_OZONE_PLATFORM_HINT: "x11",
    XAUTHORITY: authority,
  })

  const group = server.pid
  return async () => {
    if (group === undefined || server.exitCode !== null || server.signalCode !== null) return
    const exited = new Promise<void>((resolve) => {
      server.once("exit", () => resolve())
    })
    process.kill(-group, "SIGTERM")
    const insist = setTimeout(() => process.kill(-group, "SIGKILL"), 2_000)
    await exited
    clearTimeout(insist)
  }
}
