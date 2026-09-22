import { tmpdir } from "node:os"
import type { BrowserWindow, IpcMainInvokeEvent } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { CHANNELS } from "../shared/channels"
import { InvalidIpcSenderError, registerIpc } from "./ipc"
import { SettingsStore } from "./settings-store"
import { TokenVault } from "./token-vault"
import { TwitchService } from "./twitch-service"

type Handler = (event: IpcMainInvokeEvent, input: unknown) => unknown
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
const followedChannels = vi.fn<TwitchService["followedChannels"]>()
const live = vi.fn<TwitchService["live"]>()

const invokeLive = (input: unknown, sender = event): Promise<unknown> => {
  const handler = handlers.get(CHANNELS.catalogLive)
  if (handler === undefined) throw new Error("Live handler was not registered")
  return Promise.resolve(handler(sender, input))
}

const invokeFollowedChannels = (input: unknown, sender = event): Promise<unknown> => {
  const handler = handlers.get(CHANNELS.catalogFollowedChannels)
  if (handler === undefined) throw new Error("Followed channels handler was not registered")
  return Promise.resolve(handler(sender, input))
}

beforeEach(() => {
  vi.useFakeTimers()
  handlers.clear()
  followedChannels.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  live.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  vi.spyOn(TwitchService.prototype, "followedChannels").mockImplementation(followedChannels)
  vi.spyOn(TwitchService.prototype, "live").mockImplementation(live)
  registerIpc({
    mainWindow: { webContents } as BrowserWindow,
    rendererOrigin: "https://localhost:1234",
    runningInSteamGameMode: false,
    twitch: new TwitchService(
      new SettingsStore(tmpdir()),
      new TokenVault(tmpdir(), {
        backend: () => "gnome_libsecret",
        decrypt: (value) => value.toString("utf8"),
        encrypt: (value) => Buffer.from(value),
        isAvailable: () => true,
      }),
    ),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("followed channels catalog IPC validation", () => {
  it("forwards a valid cursor input with the default page size and returns the service page", async () => {
    const page = {
      cursor: "later+/=",
      items: [{ displayName: "Streamer", id: "456", isLive: false, login: "streamer" }],
    }
    followedChannels.mockResolvedValueOnce(page)

    await expect(invokeFollowedChannels({ after: "next+/=" })).resolves.toEqual(page)
    expect(followedChannels).toHaveBeenCalledExactlyOnceWith({ after: "next+/=", first: 20 })
  })

  it("forwards an explicitly bounded directory page size", async () => {
    await invokeFollowedChannels({ first: 100 })
    expect(followedChannels).toHaveBeenCalledExactlyOnceWith({ first: 100 })
  })

  it.each([
    null,
    { after: 123 },
    { after: "x".repeat(513) },
    { first: "20" },
    { first: 0 },
    { first: 101 },
    { first: 1.5 },
  ])("rejects malformed followed channels input %j before calling the service", async (input) => {
    await expect(invokeFollowedChannels(input)).rejects.toBeInstanceOf(z.ZodError)
    expect(followedChannels).not.toHaveBeenCalled()
  })

  it("rejects followed channels requests from a missing sender frame", async () => {
    await expect(
      invokeFollowedChannels({}, { ...event, senderFrame: null }),
    ).rejects.toBeInstanceOf(InvalidIpcSenderError)
    expect(followedChannels).not.toHaveBeenCalled()
  })

  it("rejects followed channels requests from an unauthorized same-origin child frame", async () => {
    const childFrame = { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"]
    await expect(
      invokeFollowedChannels({}, { ...event, senderFrame: childFrame }),
    ).rejects.toBeInstanceOf(InvalidIpcSenderError)
    expect(followedChannels).not.toHaveBeenCalled()
  })
})

describe("live catalog IPC validation", () => {
  it("preserves the category filter and exact pagination cursor", async () => {
    await invokeLive({ after: "next+/=", gameId: "33214" })
    expect(live).toHaveBeenCalledExactlyOnceWith({
      after: "next+/=",
      first: 20,
      gameId: "33214",
    })
  })

  it("keeps unfiltered live input unchanged", async () => {
    await invokeLive({ first: 20 })
    expect(live).toHaveBeenCalledExactlyOnceWith({ first: 20 })
  })

  it.each([
    null,
    { gameId: 33214 },
    { gameId: "" },
    { gameId: "1".repeat(65) },
    { after: "x".repeat(513), gameId: "33214" },
    { first: 0, gameId: "33214" },
    { first: 101, gameId: "33214" },
    { first: 1.5, gameId: "33214" },
  ])("rejects malformed live input %j before calling the service", async (input) => {
    await expect(invokeLive(input)).rejects.toBeInstanceOf(z.ZodError)
    expect(live).not.toHaveBeenCalled()
  })

  it("still rejects category requests from an unauthorized frame", async () => {
    await expect(
      invokeLive({ gameId: "33214" }, { ...event, senderFrame: null }),
    ).rejects.toBeInstanceOf(InvalidIpcSenderError)
    expect(live).not.toHaveBeenCalled()
  })
})
