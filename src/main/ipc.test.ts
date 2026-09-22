import { tmpdir } from "node:os"
import type { BrowserWindow, IpcMainInvokeEvent } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { CHANNELS } from "../shared/channels"
import type { VacuumStreamApi } from "../shared/contracts"
import { InvalidIpcSenderError, registerIpc } from "./ipc"
import type { PlaybackProgressStore } from "./playback-progress-store"
import { SettingsStore } from "./settings-store"
import { TokenVault } from "./token-vault"
import { TwitchService } from "./twitch-service"

type Handler = (event: IpcMainInvokeEvent, ...input: unknown[]) => unknown
const handlers = vi.hoisted(() => new Map<string, Handler>())
const preload = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(name: string, api: VacuumStreamApi) => void>(),
  invoke: vi.fn<(channel: string, ...input: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, listener: (event: unknown, input: unknown) => void) => void>(),
  removeListener: vi.fn(),
}))

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: preload.exposeInMainWorld },
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  },
  ipcRenderer: { invoke: preload.invoke, on: preload.on, removeListener: preload.removeListener },
  shell: { openExternal: vi.fn() },
}))

const mainFrame = { url: "https://localhost:1234/" }
const webContents = { id: 1, mainFrame }
const event = { sender: webContents, senderFrame: mainFrame } as IpcMainInvokeEvent
const followedChannels = vi.fn<TwitchService["followedChannels"]>()
const live = vi.fn<TwitchService["live"]>()
const chatInput = { begin: vi.fn(), cancel: vi.fn(), end: vi.fn() }
const playbackProgress = {
  get: vi.fn<PlaybackProgressStore["get"]>(),
  remove: vi.fn<PlaybackProgressStore["remove"]>(),
  save: vi.fn<PlaybackProgressStore["save"]>(),
}

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
  chatInput.begin.mockReset()
  chatInput.end.mockReset()
  followedChannels.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  live.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  playbackProgress.get.mockReset().mockResolvedValue(undefined)
  playbackProgress.remove.mockReset().mockResolvedValue(undefined)
  playbackProgress.save.mockReset().mockResolvedValue(undefined)
  preload.invoke.mockReset()
  vi.spyOn(TwitchService.prototype, "followedChannels").mockImplementation(followedChannels)
  vi.spyOn(TwitchService.prototype, "live").mockImplementation(live)
  registerIpc({
    chatInput,
    mainWindow: { webContents } as BrowserWindow,
    playbackProgress,
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

describe("chat input capability", () => {
  const session = "81c9fdf9-2f3c-4e75-a10d-8694e97843da"
  const invoke = async (channel: string, sender: IpcMainInvokeEvent, ...input: unknown[]) => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error("Missing chat input handler")
    return handler(sender, ...input)
  }

  it.each([CHANNELS.chatInputBegin, CHANNELS.chatInputEnd])(
    "authorizes and bounds %s to one session id",
    async (channel) => {
      await invoke(channel, event, session)
      expect(
        channel === CHANNELS.chatInputBegin ? chatInput.begin : chatInput.end,
      ).toHaveBeenCalledExactlyOnceWith(session)
    },
  )

  it.each([CHANNELS.chatInputBegin, CHANNELS.chatInputEnd])(
    "rejects malformed input and extra arguments on %s",
    async (channel) => {
      for (const input of [
        [],
        [null],
        [false],
        [1],
        [""],
        ["Escape"],
        [{ session }],
        [session, "selector"],
      ]) {
        await expect(invoke(channel, event, ...input)).rejects.toBeInstanceOf(z.ZodError)
      }
      expect(chatInput.begin).not.toHaveBeenCalled()
      expect(chatInput.end).not.toHaveBeenCalled()
    },
  )

  it.each([CHANNELS.chatInputBegin, CHANNELS.chatInputEnd])(
    "rejects missing, child, foreign-window and foreign-origin senders on %s",
    async (channel) => {
      const invalidSenders = [
        { ...event, senderFrame: null },
        { ...event, senderFrame: { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"] },
        { ...event, sender: { ...webContents, id: 2 } as IpcMainInvokeEvent["sender"] },
      ]
      for (const sender of invalidSenders) {
        await expect(invoke(channel, sender, session)).rejects.toBeInstanceOf(InvalidIpcSenderError)
      }
      const originalUrl = mainFrame.url
      try {
        for (const url of ["https://www.twitch.tv/", "not a URL"]) {
          mainFrame.url = url
          await expect(invoke(channel, event, session)).rejects.toBeInstanceOf(
            InvalidIpcSenderError,
          )
        }
      } finally {
        mainFrame.url = originalUrl
      }
      expect(chatInput.begin).not.toHaveBeenCalled()
      expect(chatInput.end).not.toHaveBeenCalled()
    },
  )

  it("exposes only begin/end and a validated removable Escape subscription, never raw input", async () => {
    preload.invoke.mockImplementation((channel, ...input) => invoke(channel, event, ...input))
    await import("../preload/index")
    const api = preload.exposeInMainWorld.mock.calls[0]?.[1]
    if (api === undefined) throw new Error("Preload did not expose its API")
    expect(preload.exposeInMainWorld.mock.calls[0]?.[0]).toBe("vacuumStream")
    expect(Object.keys(api)).toEqual([
      "auth",
      "catalog",
      "chatInput",
      "playbackProgress",
      "settings",
      "system",
    ])
    expect(Object.keys(api.chatInput)).toEqual(["begin", "end", "onEscape"])
    expect(Object.keys(api.system)).toEqual([
      "activateEmbeddedPlayer",
      "isSteamGameMode",
      "restoreShellFullscreen",
      "toggleFullscreen",
    ])
    await api.chatInput.begin(session)
    await api.chatInput.end(session)
    expect(chatInput.begin).toHaveBeenCalledExactlyOnceWith(session)
    expect(chatInput.end).toHaveBeenCalledExactlyOnceWith(session)
    expect(() => api.chatInput.begin("Escape")).toThrow(z.ZodError)
    expect(() => api.chatInput.end("#chat")).toThrow(z.ZodError)
    const listener = vi.fn()
    const unsubscribe = api.chatInput.onEscape(listener)
    const [channel, notification] = preload.on.mock.calls[0] ?? []
    if (notification === undefined) throw new Error("Missing notification subscription")
    expect(channel).toBe(CHANNELS.chatInputEscape)
    const privilegedEvent = { sender: "must not cross the bridge" }
    notification(privilegedEvent, session)
    expect(listener).toHaveBeenCalledExactlyOnceWith(session)
    expect(() => notification(privilegedEvent, { key: "Escape" })).toThrow(z.ZodError)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(preload.removeListener).toHaveBeenCalledExactlyOnceWith(
      CHANNELS.chatInputEscape,
      notification,
    )
  })
})

describe("playback progress capability", () => {
  const bookmark = {
    duration: 3600,
    position: 123.5,
    updatedAt: 1_790_000_000_000,
    videoId: "123456",
  }
  const cases = [
    { channel: CHANNELS.playbackProgressGet, input: bookmark.videoId, method: "get" },
    { channel: CHANNELS.playbackProgressRemove, input: bookmark.videoId, method: "remove" },
    { channel: CHANNELS.playbackProgressSave, input: bookmark, method: "save" },
  ] as const
  const invoke = async (channel: string, sender: IpcMainInvokeEvent, ...input: unknown[]) => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error("Missing playback progress handler")
    return handler(sender, ...input)
  }
  const exposedApi = async () => {
    vi.resetModules()
    await import("../preload/index")
    const api = preload.exposeInMainWorld.mock.calls[0]?.[1]
    if (api === undefined) throw new Error("Preload did not expose its API")
    return api
  }
  const expectUntouchedStore = () => {
    expect(playbackProgress.get).not.toHaveBeenCalled()
    expect(playbackProgress.remove).not.toHaveBeenCalled()
    expect(playbackProgress.save).not.toHaveBeenCalled()
  }

  it.each(cases)(
    "forwards valid input and the store result on $channel",
    async ({ channel, input, method }) => {
      playbackProgress.get.mockResolvedValueOnce(bookmark)
      await expect(invoke(channel, event, input)).resolves.toEqual(
        method === "get" ? bookmark : undefined,
      )
      expect(playbackProgress[method]).toHaveBeenCalledExactlyOnceWith(input)
    },
  )

  it.each(cases)(
    "rejects malformed input before touching the store on $channel",
    async ({ channel, input, method }) => {
      const invalid =
        method === "save"
          ? [
              "123456",
              {},
              { ...bookmark, videoId: "" },
              { ...bookmark, videoId: "x".repeat(65) },
              { ...bookmark, position: -1 },
              { ...bookmark, position: 3601 },
              { ...bookmark, position: Number.NaN },
              { ...bookmark, position: Number.POSITIVE_INFINITY },
              { ...bookmark, duration: 0 },
              { ...bookmark, duration: Number.POSITIVE_INFINITY },
              { ...bookmark, updatedAt: -1 },
              { ...bookmark, updatedAt: Number.NaN },
              { ...bookmark, title: "private" },
            ]
          : ["", "x".repeat(65), { videoId: bookmark.videoId }]
      for (const value of [undefined, null, false, 123456, ...invalid]) {
        await expect(invoke(channel, event, value)).rejects.toBeInstanceOf(z.ZodError)
      }
      await expect(invoke(channel, event)).rejects.toBeInstanceOf(z.ZodError)
      await expect(invoke(channel, event, input, "path")).rejects.toBeInstanceOf(z.ZodError)
      expectUntouchedStore()
    },
  )

  it.each(cases)("rejects a missing sender frame on $channel", async ({ channel, input }) => {
    await expect(invoke(channel, { ...event, senderFrame: null }, input)).rejects.toBeInstanceOf(
      InvalidIpcSenderError,
    )
    expectUntouchedStore()
  })

  it.each(cases)(
    "rejects an unauthorized same-origin child frame on $channel",
    async ({ channel, input }) => {
      const senderFrame = { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"]
      await expect(invoke(channel, { ...event, senderFrame }, input)).rejects.toBeInstanceOf(
        InvalidIpcSenderError,
      )
      expectUntouchedStore()
    },
  )

  it.each(cases)("surfaces store failures on $channel", async ({ channel, input, method }) => {
    const failure = new Error("Playback progress file is unreadable")
    playbackProgress[method].mockRejectedValueOnce(failure)
    await expect(invoke(channel, event, input)).rejects.toBe(failure)
  })

  it("exposes only get/save/remove and validates requests through preload and IPC", async () => {
    preload.invoke.mockImplementation((channel, ...input) => invoke(channel, event, ...input))
    playbackProgress.get.mockResolvedValueOnce(bookmark)
    const api = await exposedApi()
    expect(Object.keys(api.playbackProgress)).toEqual(["get", "remove", "save"])
    await expect(api.playbackProgress.get(bookmark.videoId)).resolves.toEqual(bookmark)
    await expect(api.playbackProgress.get("missing")).resolves.toBeUndefined()
    await expect(api.playbackProgress.save(bookmark)).resolves.toBeUndefined()
    await expect(api.playbackProgress.remove(bookmark.videoId)).resolves.toBeUndefined()
    expect(playbackProgress.save).toHaveBeenCalledExactlyOnceWith(bookmark)
    expect(playbackProgress.remove).toHaveBeenCalledExactlyOnceWith(bookmark.videoId)
    expect(() => api.playbackProgress.get("x".repeat(65))).toThrow(z.ZodError)
    expect(() => api.playbackProgress.remove("")).toThrow(z.ZodError)
    expect(() => api.playbackProgress.save({ ...bookmark, position: 3601 })).toThrow(z.ZodError)
    expect(preload.invoke).toHaveBeenCalledTimes(4)
  })

  it("rejects malformed bookmark and void results at the preload boundary", async () => {
    const api = await exposedApi()
    for (const result of [
      null,
      {},
      { ...bookmark, position: 3601 },
      { ...bookmark, title: "private" },
    ]) {
      preload.invoke.mockResolvedValueOnce(result)
      await expect(api.playbackProgress.get(bookmark.videoId)).rejects.toBeInstanceOf(z.ZodError)
    }
    preload.invoke.mockResolvedValueOnce({ path: "/private" })
    await expect(api.playbackProgress.save(bookmark)).rejects.toBeInstanceOf(z.ZodError)
    preload.invoke.mockResolvedValueOnce(false)
    await expect(api.playbackProgress.remove(bookmark.videoId)).rejects.toBeInstanceOf(z.ZodError)
  })
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
