import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"

const deferred = <Value>() => {
  let resolve: (value: Value) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<Value>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, reject, resolve }
}

const setup = (ownsProfile = true) => {
  vi.resetModules()
  vi.stubEnv("ELECTRON_RENDERER_URL", undefined)
  vi.stubEnv("SteamGamepadUI", "0")
  vi.stubEnv("SteamOS", "0")
  const activated = deferred<void>()
  const calls: string[] = []
  const ready = deferred<void>()
  const serving = deferred<void>()
  const serverStarted = deferred<void>()
  const loaded = deferred<void>()
  const exited = deferred<void>()
  const closing = deferred<void>()
  const closed = deferred<void>()
  const app = Object.assign(new EventEmitter(), {
    exit: vi.fn(() => {
      calls.push("exit")
      exited.resolve()
    }),
    getAppPath: vi.fn(() => "/application"),
    getPath: vi.fn(() => "/profile"),
    isPackaged: false,
    quit: vi.fn(() => calls.push("quit")),
    requestSingleInstanceLock: vi.fn(() => {
      calls.push("lock")
      return ownsProfile
    }),
    whenReady: vi.fn(() => {
      calls.push("ready")
      return ready.promise
    }),
  })
  const on = vi.spyOn(app, "on")
  const loadURL = vi.fn(async (_url: string) => {
    calls.push("load")
    loaded.resolve()
  })
  let window: MockWindow | undefined
  class MockWindow extends EventEmitter {
    public readonly focus = vi.fn(() => {
      calls.push("focus")
      activated.resolve()
    })
    public readonly isMinimized = vi.fn(() => false)
    public readonly loadURL = loadURL
    public readonly restore = vi.fn(() => calls.push("restore"))
    public readonly setFullScreen = vi.fn()
    public readonly show = vi.fn(() => calls.push("show"))
    public readonly webContents = Object.assign(new EventEmitter(), {
      id: 1,
      setWindowOpenHandler: vi.fn(),
    })

    public constructor() {
      super()
      calls.push("window")
      window = this
    }
  }
  const BrowserWindow = vi.fn(MockWindow)
  const server = {
    certificateFingerprint: "fingerprint",
    close: vi.fn(async () => {
      calls.push("close")
      closing.resolve()
      await closed.promise
    }),
    origin: "https://localhost:1234",
  }
  const startStaticHttpsServer = vi.fn(async () => {
    calls.push("server")
    serverStarted.resolve()
    await serving.promise
    return server
  })
  const FavouritesStore = vi.fn(
    class {
      public constructor() {
        calls.push("favourites")
      }
    },
  )
  const PlaybackProgressStore = vi.fn(
    class {
      public constructor() {
        calls.push("progress")
      }
    },
  )
  const SettingsStore = vi.fn(
    class {
      public constructor() {
        calls.push("settings")
      }
    },
  )
  const TokenVault = vi.fn(
    class {
      public readonly isSecure = true

      public constructor() {
        calls.push("vault")
      }
    },
  )
  const TwitchService = vi.fn(
    class {
      public constructor() {
        calls.push("twitch")
      }
    },
  )
  const createChatInput = vi.fn(() => {
    calls.push("chat")
    return { blur: vi.fn(), cancel: vi.fn() }
  })
  const registerIpc = vi.fn(() => calls.push("ipc"))
  const showErrorBox = vi.fn(() => calls.push("error"))
  const defaultSession = {
    setPermissionCheckHandler: vi.fn(() => calls.push("permissions-check")),
    setPermissionRequestHandler: vi.fn(() => calls.push("permissions-request")),
  }
  vi.doMock("electron", () => ({
    app,
    BrowserWindow,
    dialog: { showErrorBox },
    safeStorage: {},
    session: { defaultSession },
  }))
  vi.doMock("./chat-input", () => ({ createChatInput }))
  vi.doMock("./favourites-store", () => ({ FavouritesStore }))
  vi.doMock("./https-server", () => ({ startStaticHttpsServer }))
  vi.doMock("./ipc", () => ({ registerIpc }))
  vi.doMock("./playback-progress-store", () => ({ PlaybackProgressStore }))
  vi.doMock("./settings-store", () => ({ SettingsStore }))
  vi.doMock("./token-vault", () => ({ TokenVault }))
  vi.doMock("./twitch-service", () => ({ TwitchService }))
  return {
    activated,
    app,
    BrowserWindow,
    calls,
    closed,
    closing,
    createChatInput,
    defaultSession,
    exited,
    FavouritesStore,
    loaded,
    loadURL,
    on,
    PlaybackProgressStore,
    ready,
    registerIpc,
    server,
    serverStarted,
    serving,
    SettingsStore,
    showErrorBox,
    startStaticHttpsServer,
    TokenVault,
    TwitchService,
    get window() {
      if (window === undefined) throw new Error("Window has not been constructed")
      return window
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// Vitest's test timeout bounds every controlled signal; no timer drives the behavior.
describe("profile ownership at the real main entry point", () => {
  it("quits a non-owner exactly once without scheduling readiness or constructing resources", async () => {
    const fixture = setup(false)
    fixture.ready.resolve()
    fixture.serving.resolve()
    await import("./index")
    // Also expose the full original bootstrap if the lock gate regresses.
    if (fixture.app.whenReady.mock.calls.length > 0) await fixture.loaded.promise

    expect({
      chatInputs: fixture.createChatInput.mock.calls.length,
      ipcRegistrations: fixture.registerIpc.mock.calls.length,
      persistenceOwners:
        fixture.FavouritesStore.mock.calls.length +
        fixture.PlaybackProgressStore.mock.calls.length +
        fixture.SettingsStore.mock.calls.length +
        fixture.TokenVault.mock.calls.length,
      quitRequests: fixture.app.quit.mock.calls.length,
      readinessCalls: fixture.app.whenReady.mock.calls.length,
      servers: fixture.startStaticHttpsServer.mock.calls.length,
      twitchServices: fixture.TwitchService.mock.calls.length,
      windows: fixture.BrowserWindow.mock.calls.length,
    }).toEqual({
      chatInputs: 0,
      ipcRegistrations: 0,
      persistenceOwners: 0,
      quitRequests: 1,
      readinessCalls: 0,
      servers: 0,
      twitchServices: 0,
      windows: 0,
    })
    expect(fixture.calls).toEqual(["lock", "quit"])
    expect(fixture.app.requestSingleInstanceLock).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.app.getPath).not.toHaveBeenCalled()
    expect(fixture.app.getAppPath).not.toHaveBeenCalled()
    expect(fixture.on).not.toHaveBeenCalled()
    expect(fixture.defaultSession.setPermissionCheckHandler).not.toHaveBeenCalled()
    expect(fixture.defaultSession.setPermissionRequestHandler).not.toHaveBeenCalled()
  }, 5000)

  it("initializes once in lock/readiness/resource order despite launches during and after startup", async () => {
    const fixture = setup()
    await import("./index")
    expect(fixture.calls).toEqual(["lock", "ready"])
    expect(fixture.app.requestSingleInstanceLock).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.on).toHaveBeenNthCalledWith(1, "second-instance", expect.any(Function))
    expect(fixture.app.requestSingleInstanceLock).toHaveBeenCalledBefore(fixture.on)
    expect(fixture.on).toHaveBeenCalledBefore(fixture.app.whenReady)

    for (let launch = 0; launch < 3; launch += 1) {
      fixture.app.emit("second-instance", {}, ["vacuumstream", "https://untrusted.invalid"], "/")
    }
    expect(fixture.calls).toEqual(["lock", "ready"])
    fixture.ready.resolve()
    await fixture.serverStarted.promise
    expect(fixture.calls).toEqual(["lock", "ready", "window", "server"])
    fixture.serving.resolve()
    await fixture.activated.promise
    expect(fixture.calls).toEqual([
      "lock",
      "ready",
      "window",
      "server",
      "vault",
      "chat",
      "favourites",
      "progress",
      "settings",
      "twitch",
      "ipc",
      "permissions-check",
      "permissions-request",
      "load",
      "show",
      "focus",
    ])

    for (let launch = 0; launch < 3; launch += 1) {
      fixture.app.emit("second-instance", {}, ["vacuumstream", "file:///untrusted"], "/")
    }
    expect(fixture.app.whenReady).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(fixture.startStaticHttpsServer).toHaveBeenCalledTimes(1)
    expect(fixture.TokenVault).toHaveBeenCalledExactlyOnceWith("/profile", expect.any(Object))
    expect(fixture.FavouritesStore).toHaveBeenCalledExactlyOnceWith("/profile")
    expect(fixture.PlaybackProgressStore).toHaveBeenCalledExactlyOnceWith("/profile")
    expect(fixture.SettingsStore).toHaveBeenCalledExactlyOnceWith("/profile")
    expect(fixture.TwitchService).toHaveBeenCalledTimes(1)
    expect(fixture.createChatInput).toHaveBeenCalledExactlyOnceWith(fixture.window)
    expect(fixture.registerIpc).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ mainWindow: fixture.window }),
    )
    expect(fixture.window.loadURL).toHaveBeenCalledExactlyOnceWith(fixture.server.origin)
    expect(fixture.window.restore).not.toHaveBeenCalled()
    expect(fixture.window.show).toHaveBeenCalledTimes(4)
    expect(fixture.window.focus).toHaveBeenCalledTimes(4)
    expect(fixture.window.setFullScreen).not.toHaveBeenCalled()
    expect(fixture.app.quit).not.toHaveBeenCalled()
  }, 5000)

  it.each([false, true])(
    "reactivates only the existing window, restoring only when minimized (Steam mode: %s)",
    async (steamMode) => {
      const fixture = setup()
      vi.stubEnv("SteamGamepadUI", steamMode ? "1" : "0")
      vi.stubEnv("SteamOS", steamMode ? "1" : "0")
      await import("./index")
      fixture.ready.resolve()
      await fixture.serverStarted.promise
      // The window already exists, but HTTPS and persistence bootstrap are still deferred.
      const constructing = [...fixture.calls]
      fixture.app.emit("second-instance", {}, ["--url=https://untrusted.invalid"], "/untrusted")
      expect(fixture.calls).toEqual([...constructing, "show", "focus"])
      expect(fixture.window.restore).not.toHaveBeenCalled()
      fixture.serving.resolve()
      await fixture.loaded.promise
      const initialized = [...fixture.calls]
      expect(fixture.BrowserWindow).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ fullscreen: steamMode }),
      )

      fixture.window.isMinimized.mockReturnValue(true)
      fixture.app.emit("second-instance", {}, ["file:///untrusted"], "/untrusted", {
        url: "https://untrusted.invalid",
      })
      expect(fixture.calls).toEqual([...initialized, "restore", "show", "focus"])
      expect(fixture.window.restore).toHaveBeenCalledExactlyOnceWith()
      fixture.window.isMinimized.mockReturnValue(false)
      fixture.app.emit("second-instance", {}, ["https://untrusted.invalid"], "/untrusted")
      expect(fixture.calls).toEqual([...initialized, "restore", "show", "focus", "show", "focus"])
      expect(fixture.window.isMinimized).toHaveBeenCalledTimes(3)
      expect(fixture.window.restore).toHaveBeenCalledTimes(1)
      expect(fixture.window.show).toHaveBeenCalledTimes(3)
      expect(fixture.window.focus).toHaveBeenCalledTimes(3)
      expect(fixture.window.loadURL).toHaveBeenCalledExactlyOnceWith(fixture.server.origin)
      expect(fixture.window.setFullScreen).not.toHaveBeenCalled()
    },
    5000,
  )

  it("reports a startup failure and awaits HTTPS cleanup before exiting", async () => {
    const fixture = setup()
    const failure = new Error("Renderer load failed")
    fixture.loadURL.mockRejectedValueOnce(failure)
    await import("./index")
    fixture.ready.resolve()
    fixture.serving.resolve()
    await fixture.closing.promise
    expect(fixture.showErrorBox).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      failure.message,
    )
    expect(fixture.server.close).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.app.exit).not.toHaveBeenCalled()
    fixture.closed.resolve()
    await fixture.exited.promise
    expect(fixture.app.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(fixture.calls.slice(-3)).toEqual(["error", "close", "exit"])
  }, 5000)

  it("reports HTTPS startup failure without constructing persistence owners", async () => {
    const fixture = setup()
    const failure = new Error("HTTPS startup failed")
    await import("./index")
    fixture.ready.resolve()
    await fixture.serverStarted.promise
    fixture.serving.reject(failure)
    await fixture.exited.promise
    expect(fixture.calls).toEqual(["lock", "ready", "window", "server", "error", "exit"])
    expect(fixture.showErrorBox).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      failure.message,
    )
    expect(fixture.app.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(fixture.server.close).not.toHaveBeenCalled()
  }, 5000)

  it("quits after the window closes and closes HTTPS on shutdown without recreating a window", async () => {
    const fixture = setup()
    await import("./index")
    fixture.ready.resolve()
    fixture.serving.resolve()
    await fixture.loaded.promise
    const initialized = [...fixture.calls]
    fixture.window.emit("closed")
    fixture.app.emit("second-instance", {}, ["vacuumstream"], "/")
    expect(fixture.calls).toEqual(initialized)
    fixture.app.emit("window-all-closed")
    expect(fixture.app.quit).toHaveBeenCalledExactlyOnceWith()
    fixture.app.emit("will-quit")
    await fixture.closing.promise
    expect(fixture.server.close).toHaveBeenCalledExactlyOnceWith()
    fixture.closed.resolve()
    await fixture.server.close.mock.results[0]?.value
    expect(fixture.calls).toEqual([...initialized, "quit", "close"])
  }, 5000)
})
