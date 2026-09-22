import type { BrowserWindow, IpcMainInvokeEvent } from "electron"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CHANNELS } from "../shared/channels"
import { registerIpc } from "./ipc"
import type { TwitchService } from "./twitch-service"

type Handler = (event: IpcMainInvokeEvent, ...input: unknown[]) => unknown

const handlers = vi.hoisted(() => new Map<string, Handler>())

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  },
  shell: { openExternal: vi.fn() },
}))

const mainFrame = { url: "https://localhost:1234/" }
const webContents = { id: 1, mainFrame }
const event = { sender: webContents, senderFrame: mainFrame } as IpcMainInvokeEvent

const invoke = (channel: string, ...input: unknown[]): Promise<unknown> => {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`Missing handler for ${channel}`)
  return Promise.resolve(handler(event, ...input))
}

const credentialBearingError = (credential: string): Error =>
  Object.assign(new Error(`Ky request failed with ${credential}`), {
    cause: { credential },
    options: {
      body: JSON.stringify({ refresh_token: credential }),
      headers: { authorization: `Bearer ${credential}` },
    },
    request: { headers: { authorization: `Bearer ${credential}` } },
  })

describe("IPC credential redaction defects", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.fails("D-xc-security-1 rejects catalog and auth transport failures with a fresh allowlisted error", async () => {
    const bearerToken = "bearer-token-that-must-never-reach-electron-logs"
    const refreshToken = "refresh-token-that-must-never-reach-electron-logs"
    const catalogFailure = credentialBearingError(bearerToken)
    const authFailure = credentialBearingError(refreshToken)
    const twitch = {
      live: vi.fn().mockRejectedValue(catalogFailure),
      logout: vi.fn().mockRejectedValue(authFailure),
    } as unknown as TwitchService
    const rawErrorLog = vi.spyOn(console, "error")

    registerIpc({
      chatInput: { begin: vi.fn(), end: vi.fn(), press: vi.fn() },
      favourites: { add: vi.fn(), list: vi.fn(), remove: vi.fn() },
      mainWindow: { webContents } as BrowserWindow,
      playbackProgress: {
        get: vi.fn(),
        list: vi.fn(),
        remove: vi.fn(),
        save: vi.fn(),
      },
      rendererOrigin: "https://localhost:1234",
      runningInSteamGameMode: false,
      twitch,
    })

    for (const [channel, input, rawFailure, credential] of [
      [CHANNELS.catalogLive, { first: 20 }, catalogFailure, bearerToken],
      [CHANNELS.authLogout, undefined, authFailure, refreshToken],
    ] as const) {
      const rejection = await invoke(channel, ...(input === undefined ? [] : [input])).catch(
        (error: unknown) => error,
      )
      expect(rejection).toBeInstanceOf(Error)
      expect(rejection).not.toBe(rawFailure)
      expect(rejection).not.toHaveProperty("request")
      expect(rejection).not.toHaveProperty("options")
      expect(rejection).not.toHaveProperty("body")
      expect(rejection).not.toHaveProperty("cause")
      expect(String(rejection)).not.toContain(credential)
    }
    expect(rawErrorLog.mock.calls.flat()).not.toContain(catalogFailure)
    expect(rawErrorLog.mock.calls.flat()).not.toContain(authFailure)
  })
})
