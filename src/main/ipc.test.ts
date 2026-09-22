import { tmpdir } from "node:os"
import type { BrowserWindow, IpcMainInvokeEvent } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { CHANNELS } from "../shared/channels"
import { FAVOURITES_LIMIT_ERROR, type VacuumStreamApi } from "../shared/contracts"
import { FavouritesLimitError, type FavouritesStore } from "./favourites-store"
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
  on: vi.fn<
    (channel: string, listener: (event: unknown, input: unknown, failure?: unknown) => void) => void
  >(),
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
const chatInput = { begin: vi.fn(), cancel: vi.fn(), end: vi.fn(), press: vi.fn() }
const favourites = {
  add: vi.fn<FavouritesStore["add"]>(),
  list: vi.fn<FavouritesStore["list"]>(),
  remove: vi.fn<FavouritesStore["remove"]>(),
}
const playbackProgress = {
  get: vi.fn<PlaybackProgressStore["get"]>(),
  list: vi.fn<PlaybackProgressStore["list"]>(),
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
  chatInput.press.mockReset().mockResolvedValue(undefined)
  favourites.add.mockReset().mockResolvedValue([])
  favourites.list.mockReset().mockResolvedValue([])
  favourites.remove.mockReset().mockResolvedValue([])
  followedChannels.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  live.mockReset().mockResolvedValue({ cursor: undefined, items: [] })
  playbackProgress.get.mockReset().mockResolvedValue(undefined)
  playbackProgress.list.mockReset().mockResolvedValue([])
  playbackProgress.remove.mockReset().mockResolvedValue(undefined)
  playbackProgress.save.mockReset().mockResolvedValue(undefined)
  preload.invoke.mockReset()
  vi.spyOn(TwitchService.prototype, "followedChannels").mockImplementation(followedChannels)
  vi.spyOn(TwitchService.prototype, "live").mockImplementation(live)
  registerIpc({
    chatInput,
    favourites,
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

  it("exposes only begin/end/press and a validated removable Escape subscription, never raw input", async () => {
    preload.invoke.mockImplementation((channel, ...input) => invoke(channel, event, ...input))
    await import("../preload/index")
    const api = preload.exposeInMainWorld.mock.calls[0]?.[1]
    if (api === undefined) throw new Error("Preload did not expose its API")
    expect(preload.exposeInMainWorld.mock.calls[0]?.[0]).toBe("vacuumStream")
    expect([...Object.keys(api)].sort()).toEqual([
      "auth",
      "catalog",
      "chatInput",
      "favourites",
      "playbackProgress",
      "settings",
      "system",
    ])
    expect([...Object.keys(api.chatInput)].sort()).toEqual(["begin", "end", "onEscape", "press"])
    expect([...Object.keys(api.system)].sort()).toEqual([
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
    notification(privilegedEvent, session, "transport")
    expect(listener).toHaveBeenLastCalledWith(session, "transport")
    expect(() => notification(privilegedEvent, session, "arbitrary")).toThrow(z.ZodError)
    expect(listener).toHaveBeenCalledTimes(2)
    for (const action of ["next", "previous", "activate"] as const) {
      await api.chatInput.press(session, action)
      expect(chatInput.press).toHaveBeenLastCalledWith(session, action)
    }
    const press: (...input: unknown[]) => unknown = api.chatInput.press as (
      ...input: unknown[]
    ) => unknown
    for (const input of [
      [session, "Enter"],
      ["bad", "next"],
      [session, "next", undefined],
    ]) {
      expect(() => press(...input)).toThrow(z.ZodError)
    }
    expect(chatInput.press).toHaveBeenCalledTimes(3)
    unsubscribe()
    expect(preload.removeListener).toHaveBeenCalledExactlyOnceWith(
      CHANNELS.chatInputEscape,
      notification,
    )
  })
})

describe("bounded chat press IPC", () => {
  const session = "81c9fdf9-2f3c-4e75-a10d-8694e97843da"
  const invoke = async (sender: IpcMainInvokeEvent, ...input: unknown[]) => {
    const handler = handlers.get(CHANNELS.chatInputPress)
    if (handler === undefined) throw new Error("Missing chat press handler")
    return handler(sender, ...input)
  }

  it("accepts exactly the three session-scoped actions and propagates transport rejection", async () => {
    for (const action of ["next", "previous", "activate"]) {
      await invoke(event, session, action)
      expect(chatInput.press).toHaveBeenLastCalledWith(session, action)
    }
    const failure = new Error("Debugger unavailable")
    chatInput.press.mockRejectedValueOnce(failure)
    await expect(invoke(event, session, "next")).rejects.toBe(failure)
  })

  it("rejects invalid UUIDs, actions, missing and extra arguments before the transport", async () => {
    for (const input of [
      [],
      [session],
      [session, undefined],
      [session, null],
      [session, 1],
      [session, false],
      [session, ""],
      [session, "Tab"],
      [session, "Escape"],
      [session, "Input.dispatchKeyEvent"],
      [session, { key: "Enter" }],
      [session, "next", undefined],
      [session, "next", "#button"],
      [session, "activate", "https://www.twitch.tv"],
      ["invalid", "next"],
      [null, "next"],
    ]) {
      await expect(invoke(event, ...input)).rejects.toBeInstanceOf(z.ZodError)
    }
    expect(chatInput.press).not.toHaveBeenCalled()
  })

  it("rejects missing, child, foreign-window, foreign-origin and malformed-origin senders before the transport", async () => {
    for (const sender of [
      { ...event, senderFrame: null },
      { ...event, senderFrame: { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"] },
      { ...event, sender: { ...webContents, id: 2 } as IpcMainInvokeEvent["sender"] },
    ]) {
      await expect(invoke(sender, session, "next")).rejects.toBeInstanceOf(InvalidIpcSenderError)
    }
    const original = mainFrame.url
    try {
      for (const url of ["https://www.twitch.tv/", "https://localhost:9999/", "invalid"]) {
        mainFrame.url = url
        await expect(invoke(event, session, "next")).rejects.toBeInstanceOf(InvalidIpcSenderError)
      }
    } finally {
      mainFrame.url = original
    }
    expect(chatInput.press).not.toHaveBeenCalled()
  })
})

describe("favourites capability", () => {
  const entry = { login: "streamer", userId: "123" }
  const cases = [
    { channel: CHANNELS.favouritesAdd, input: [entry], method: "add" },
    { channel: CHANNELS.favouritesList, input: [], method: "list" },
    { channel: CHANNELS.favouritesRemove, input: [entry.login], method: "remove" },
  ] as const
  const invoke = async (channel: string, sender: IpcMainInvokeEvent, ...input: unknown[]) => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error("Missing favourites handler")
    return handler(sender, ...input)
  }
  const exposedApi = async () => {
    preload.exposeInMainWorld.mockClear()
    vi.resetModules()
    await import("../preload/index")
    const api = preload.exposeInMainWorld.mock.calls[0]?.[1]
    if (api === undefined) throw new Error("Preload did not expose its API")
    return api
  }
  const expectUntouchedStore = () => {
    expect(favourites.add).not.toHaveBeenCalled()
    expect(favourites.list).not.toHaveBeenCalled()
    expect(favourites.remove).not.toHaveBeenCalled()
  }

  it.each(cases)(
    "forwards valid input and the committed store list on $channel",
    async ({ channel, input, method }) => {
      const listing = [{ login: "alpha" }, entry]
      favourites[method].mockResolvedValueOnce(listing)
      await expect(invoke(channel, event, ...input)).resolves.toBe(listing)
      expect(favourites[method]).toHaveBeenCalledExactlyOnceWith(...input)
    },
  )

  it("canonicalizes valid mixed-case add and remove input before reaching the store", async () => {
    await invoke(CHANNELS.favouritesAdd, event, { login: "STREAMER" })
    await invoke(CHANNELS.favouritesRemove, event, "STREAMER")
    expect(favourites.add).toHaveBeenCalledExactlyOnceWith({ login: "streamer" })
    expect(favourites.remove).toHaveBeenCalledExactlyOnceWith("streamer")
  })

  it.each(cases.filter(({ method }) => method !== "list"))(
    "rejects malformed input and extra arguments before touching the store on $channel",
    async ({ channel, input, method }) => {
      const invalid =
        method === "add"
          ? [
              "streamer",
              {},
              { login: "" },
              { login: "x".repeat(26) },
              { login: "with-dash" },
              { login: "two words" },
              { login: 123 },
              { ...entry, userId: "direct-streamer" },
              { ...entry, userId: "" },
              { ...entry, userId: "x".repeat(65) },
              { ...entry, userId: 123 },
              { ...entry, userId: null },
              { ...entry, title: "private" },
            ]
          : ["", "x".repeat(26), "with-dash", "two words", { login: entry.login }]
      for (const value of [undefined, null, false, 123, [], ...invalid]) {
        await expect(invoke(channel, event, value)).rejects.toBeInstanceOf(z.ZodError)
      }
      await expect(invoke(channel, event)).rejects.toBeInstanceOf(z.ZodError)
      await expect(invoke(channel, event, ...input, "path")).rejects.toBeInstanceOf(z.ZodError)
      expectUntouchedStore()
    },
  )

  it("rejects every argument including explicit undefined on favourites:list", async () => {
    for (const value of [undefined, null, false, 0, "", "streamer", [], {}, entry]) {
      await expect(invoke(CHANNELS.favouritesList, event, value)).rejects.toBeInstanceOf(z.ZodError)
    }
    await expect(
      invoke(CHANNELS.favouritesList, event, undefined, undefined),
    ).rejects.toBeInstanceOf(z.ZodError)
    expectUntouchedStore()
  })

  it.each(cases)("rejects a missing sender frame on $channel", async ({ channel, input }) => {
    await expect(invoke(channel, { ...event, senderFrame: null }, ...input)).rejects.toBeInstanceOf(
      InvalidIpcSenderError,
    )
    expectUntouchedStore()
  })

  it.each(cases)(
    "rejects an unauthorized same-origin child frame on $channel",
    async ({ channel, input }) => {
      const senderFrame = { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"]
      await expect(invoke(channel, { ...event, senderFrame }, ...input)).rejects.toBeInstanceOf(
        InvalidIpcSenderError,
      )
      expectUntouchedStore()
    },
  )

  it.each(cases)("rejects a foreign window or origin on $channel", async ({ channel, input }) => {
    const sender = { ...webContents, id: 2 } as IpcMainInvokeEvent["sender"]
    await expect(invoke(channel, { ...event, sender }, ...input)).rejects.toBeInstanceOf(
      InvalidIpcSenderError,
    )
    const originalUrl = mainFrame.url
    try {
      for (const url of ["https://www.twitch.tv/", "not a URL"]) {
        mainFrame.url = url
        await expect(invoke(channel, event, ...input)).rejects.toBeInstanceOf(InvalidIpcSenderError)
      }
    } finally {
      mainFrame.url = originalUrl
    }
    expectUntouchedStore()
  })

  it.each(cases)("surfaces store failures on $channel", async ({ channel, input, method }) => {
    const failure = new Error("Favourites file is unreadable")
    favourites[method].mockRejectedValueOnce(failure)
    await expect(invoke(channel, event, ...input)).rejects.toBe(failure)
  })

  it("exposes only add/list/remove and validates requests through preload and IPC", async () => {
    preload.invoke.mockImplementation((channel, ...input) => invoke(channel, event, ...input))
    const api = await exposedApi()
    expect(Object.keys(api.favourites).sort()).toEqual(["add", "list", "remove"])
    favourites.add.mockResolvedValueOnce([entry])
    favourites.list.mockResolvedValueOnce([entry])
    await expect(api.favourites.add({ ...entry, login: "STREAMER" })).resolves.toEqual([entry])
    await expect(api.favourites.list()).resolves.toEqual([entry])
    await expect(api.favourites.remove("STREAMER")).resolves.toEqual([])
    expect(favourites.add).toHaveBeenCalledExactlyOnceWith(entry)
    expect(favourites.list).toHaveBeenCalledExactlyOnceWith()
    expect(favourites.remove).toHaveBeenCalledExactlyOnceWith(entry.login)
    expect(preload.invoke).toHaveBeenCalledWith(CHANNELS.favouritesList)
    expect(() => api.favourites.add({ login: "invalid-login" })).toThrow(z.ZodError)
    expect(() => api.favourites.add({ ...entry, userId: "direct-streamer" })).toThrow(z.ZodError)
    expect(() => api.favourites.remove("x".repeat(26))).toThrow(z.ZodError)
    expect(preload.invoke).toHaveBeenCalledTimes(3)
  })

  it.each(["add", "list", "remove"] as const)(
    "rejects malformed and oversized %s results at the preload boundary",
    async (method) => {
      const api = await exposedApi()
      const request = () =>
        method === "add"
          ? api.favourites.add(entry)
          : method === "remove"
            ? api.favourites.remove(entry.login)
            : api.favourites.list()
      for (const result of [
        undefined,
        null,
        {},
        { items: [entry] },
        [null],
        [{}],
        [{ login: "invalid-login" }],
        [{ login: "x".repeat(26) }],
        [{ ...entry, userId: "direct-streamer" }],
        [{ ...entry, userId: "x".repeat(65) }],
        [{ ...entry, userId: 123 }],
        [{ ...entry, title: "private" }],
        [entry, { login: "STREAMER" }],
        Array.from({ length: 51 }, (_, index) => ({ login: `channel${index}` })),
      ]) {
        preload.invoke.mockResolvedValueOnce(result)
        await expect(request()).rejects.toBeInstanceOf(z.ZodError)
      }
      for (const result of [
        [],
        [entry],
        Array.from({ length: 50 }, (_, index) => ({ login: `channel${index}` })),
      ]) {
        preload.invoke.mockResolvedValueOnce(result)
        await expect(request()).resolves.toEqual(result)
      }
    },
  )

  it("preserves the catchable limit marker when Electron transports only the error message", async () => {
    const limit = new FavouritesLimitError()
    favourites.add.mockRejectedValueOnce(limit)
    await expect(invoke(CHANNELS.favouritesAdd, event, entry)).rejects.toBe(limit)
    const transported = new Error(`Error invoking remote method 'favourites:add': ${limit.message}`)
    preload.invoke.mockRejectedValueOnce(transported)
    const api = await exposedApi()
    await expect(api.favourites.add(entry)).rejects.toMatchObject({
      message: expect.stringContaining(FAVOURITES_LIMIT_ERROR),
    })
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
    preload.exposeInMainWorld.mockClear()
    vi.resetModules()
    await import("../preload/index")
    const api = preload.exposeInMainWorld.mock.calls[0]?.[1]
    if (api === undefined) throw new Error("Preload did not expose its API")
    return api
  }
  const expectUntouchedStore = () => {
    expect(playbackProgress.get).not.toHaveBeenCalled()
    expect(playbackProgress.list).not.toHaveBeenCalled()
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
              { ...bookmark, details: { title: "T".repeat(301), userId: "123" } },
              { ...bookmark, details: { title: "Recording", userId: "U".repeat(65) } },
              { ...bookmark, details: { title: "Recording" } },
              { ...bookmark, details: { title: "Recording", userId: 123 } },
              { ...bookmark, details: { title: "Recording", url: "private", userId: "123" } },
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

  it("forwards the listing result without passing arguments to the store", async () => {
    const listing = [
      { ...bookmark, details: { title: "Recording", userId: "123" } },
      { ...bookmark, videoId: "legacy" },
    ]
    playbackProgress.list.mockResolvedValueOnce(listing)
    await expect(invoke(CHANNELS.playbackProgressList, event)).resolves.toBe(listing)
    expect(playbackProgress.list).toHaveBeenCalledExactlyOnceWith()
  })

  it("rejects every argument on playback-progress:list before touching the store", async () => {
    for (const input of [undefined, null, false, 0, "", "123", [], {}, bookmark]) {
      await expect(invoke(CHANNELS.playbackProgressList, event, input)).rejects.toBeInstanceOf(
        z.ZodError,
      )
    }
    await expect(
      invoke(CHANNELS.playbackProgressList, event, undefined, undefined),
    ).rejects.toBeInstanceOf(z.ZodError)
    expectUntouchedStore()
  })

  it.each([
    { name: "a missing sender frame", sender: { ...event, senderFrame: null } },
    {
      name: "an unauthorized same-origin child frame",
      sender: {
        ...event,
        senderFrame: { url: mainFrame.url } as IpcMainInvokeEvent["senderFrame"],
      },
    },
  ])("rejects $name on playback-progress:list", async ({ sender }) => {
    await expect(invoke(CHANNELS.playbackProgressList, sender)).rejects.toBeInstanceOf(
      InvalidIpcSenderError,
    )
    expectUntouchedStore()
  })

  it("surfaces store failures on playback-progress:list", async () => {
    const failure = new Error("Playback progress file is unreadable")
    playbackProgress.list.mockRejectedValueOnce(failure)
    await expect(invoke(CHANNELS.playbackProgressList, event)).rejects.toBe(failure)
  })

  it("exposes only get/list/save/remove and validates requests through preload and IPC", async () => {
    preload.invoke.mockImplementation((channel, ...input) => invoke(channel, event, ...input))
    playbackProgress.get.mockResolvedValueOnce(bookmark)
    const labelled = { ...bookmark, details: { title: "Recording", userId: "123" } }
    playbackProgress.list.mockResolvedValueOnce([labelled, { ...bookmark, videoId: "legacy" }])
    const api = await exposedApi()
    expect([...Object.keys(api.playbackProgress)].sort()).toEqual(["get", "list", "remove", "save"])
    await expect(api.playbackProgress.get(bookmark.videoId)).resolves.toEqual(bookmark)
    await expect(api.playbackProgress.get("missing")).resolves.toBeUndefined()
    await expect(api.playbackProgress.list()).resolves.toEqual([
      labelled,
      { ...bookmark, videoId: "legacy" },
    ])
    expect(preload.invoke).toHaveBeenCalledWith(CHANNELS.playbackProgressList)
    expect(playbackProgress.list).toHaveBeenCalledExactlyOnceWith()
    await expect(api.playbackProgress.save(labelled)).resolves.toBeUndefined()
    await expect(api.playbackProgress.remove(bookmark.videoId)).resolves.toBeUndefined()
    expect(playbackProgress.save).toHaveBeenCalledExactlyOnceWith(labelled)
    expect(playbackProgress.remove).toHaveBeenCalledExactlyOnceWith(bookmark.videoId)
    expect(() => api.playbackProgress.get("x".repeat(65))).toThrow(z.ZodError)
    expect(() => api.playbackProgress.remove("")).toThrow(z.ZodError)
    expect(() => api.playbackProgress.save({ ...bookmark, position: 3601 })).toThrow(z.ZodError)
    expect(() =>
      api.playbackProgress.save({
        ...bookmark,
        details: { title: "T".repeat(301), userId: "123" },
      }),
    ).toThrow(z.ZodError)
    expect(preload.invoke).toHaveBeenCalledTimes(5)
  })

  it("rejects malformed and oversized listing results at the preload boundary", async () => {
    const api = await exposedApi()
    for (const result of [
      undefined,
      null,
      {},
      { items: [bookmark] },
      [null],
      [{}],
      [{ ...bookmark, position: 3601 }],
      [{ ...bookmark, details: null }],
      [{ ...bookmark, details: { title: "Recording" } }],
      [{ ...bookmark, details: { title: "Recording", userId: 123 } }],
      [{ ...bookmark, details: { title: "T".repeat(301), userId: "123" } }],
      [{ ...bookmark, details: { title: "Recording", userId: "U".repeat(65) } }],
      [{ ...bookmark, details: { title: "Recording", url: "private", userId: "123" } }],
      Array.from({ length: 101 }, (_, index) => ({ ...bookmark, videoId: String(index) })),
    ]) {
      preload.invoke.mockResolvedValueOnce(result)
      await expect(api.playbackProgress.list()).rejects.toBeInstanceOf(z.ZodError)
    }
    for (const result of [
      [],
      Array.from({ length: 100 }, (_, index) => ({ ...bookmark, videoId: String(index) })),
    ]) {
      preload.invoke.mockResolvedValueOnce(result)
      await expect(api.playbackProgress.list()).resolves.toEqual(result)
    }
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
