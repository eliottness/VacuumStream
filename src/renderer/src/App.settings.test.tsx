// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthSnapshot, DeviceChallenge, VacuumStreamApi } from "../../shared/contracts"
import { App } from "./App"
import { dispatchControllerKey } from "./focus-navigation"
import * as playerModule from "./twitch-player"
import * as controllerModule from "./useAppController"

const challenge: DeviceChallenge = {
  expiresAt: "2026-09-22T21:00:00.000Z",
  flowId: "123e4567-e89b-12d3-a456-426614174000",
  intervalSeconds: 5,
  userCode: "ABCD-1234",
  verificationUri: "https://www.twitch.tv/activate",
}
const authenticated: AuthSnapshot = {
  displayName: "Fixture Viewer",
  kind: "authenticated",
  login: "fixture_viewer",
}
const authorizing: AuthSnapshot = { challenge, kind: "authorizing" }
const states: readonly { readonly auth: AuthSnapshot; readonly id: string }[] = [
  { auth: { kind: "guest" }, id: "settings-sign-in" },
  { auth: authorizing, id: "settings-open-activation" },
  { auth: authenticated, id: "settings-logout" },
  { auth: { kind: "error", message: "access_denied" }, id: "settings-sign-in" },
]
const deferred = <T,>() => {
  let controls:
    | { readonly reject: (error: Error) => void; readonly resolve: (value: T) => void }
    | undefined
  const promise = new Promise<T>((resolve, reject) => {
    controls = { reject, resolve }
  })
  if (controls === undefined) throw new Error("Promise executor did not run")
  return { ...controls, promise }
}
const makeBridge = (auth: AuthSnapshot) =>
  ({
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi
        .fn<VacuumStreamApi["auth"]["openActivation"]>()
        .mockResolvedValue(undefined),
      snapshot: vi.fn<VacuumStreamApi["auth"]["snapshot"]>().mockResolvedValue(auth),
    },
    catalog: {
      followed: vi
        .fn<VacuumStreamApi["catalog"]["followed"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      followedChannels: vi
        .fn<VacuumStreamApi["catalog"]["followedChannels"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      live: vi
        .fn<VacuumStreamApi["catalog"]["live"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      search: vi
        .fn<VacuumStreamApi["catalog"]["search"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      topCategories: vi
        .fn<VacuumStreamApi["catalog"]["topCategories"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
      videos: vi
        .fn<VacuumStreamApi["catalog"]["videos"]>()
        .mockResolvedValue({ cursor: undefined, items: [] }),
    },
    chatInput: {
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>(),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>(),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>(),
      press: vi.fn<VacuumStreamApi["chatInput"]["press"]>().mockResolvedValue(undefined),
    },
    favourites: {
      add: vi.fn<VacuumStreamApi["favourites"]["add"]>(),
      list: vi.fn<VacuumStreamApi["favourites"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>(),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>(),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>(),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>(),
    },
    settings: {
      saveClientId: vi.fn<VacuumStreamApi["settings"]["saveClientId"]>(),
      snapshot: vi
        .fn<VacuumStreamApi["settings"]["snapshot"]>()
        .mockResolvedValue({ clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false }),
    },
    system: {
      activateEmbeddedPlayer: vi.fn<VacuumStreamApi["system"]["activateEmbeddedPlayer"]>(),
      isSteamGameMode: vi.fn<VacuumStreamApi["system"]["isSteamGameMode"]>(),
      restoreShellFullscreen: vi
        .fn<VacuumStreamApi["system"]["restoreShellFullscreen"]>()
        .mockResolvedValue(false),
      toggleFullscreen: vi.fn<VacuumStreamApi["system"]["toggleFullscreen"]>(),
    },
  }) satisfies VacuumStreamApi

let root: Root | undefined
let container: HTMLDivElement
let observedController: ReturnType<typeof controllerModule.useAppController> | undefined
const realController = controllerModule.useAppController
let compactNavigation = false
beforeEach(() => {
  // Authentication delivery is explicitly controlled, never driven by the poll interval.
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 45rem)" ? compactNavigation : true,
  }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
  vi.spyOn(controllerModule, "useAppController").mockImplementation(() => {
    observedController = realController()
    return observedController
  })
  compactNavigation = false
  container = document.createElement("div")
  document.body.append(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  observedController = undefined
  document.body.replaceChildren()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const controller = () => {
  if (observedController === undefined) throw new Error("App is not mounted")
  return observedController
}
const target = (id: string): HTMLElement => {
  const element = container.querySelector<HTMLElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing focus target ${id}`)
  return element
}
const key = async (value: string) => {
  await act(async () => dispatchControllerKey(value))
}
const activate = async (id: string) => {
  target(id).focus()
  await key("Enter")
}
const mount = async (auth: AuthSnapshot = { kind: "guest" }) => {
  const bridge = makeBridge(auth)
  vi.stubGlobal("vacuumStream", bridge)
  root = createRoot(container)
  await act(async () => root?.render(<App />))
  await activate("nav-settings")
  return bridge
}
const deliverAuth = async (auth: AuthSnapshot) => {
  const snapshot = deferred<AuthSnapshot>()
  // Subscribe the real controller before delivering the upstream authentication result.
  const delivered = snapshot.promise.then((next) => controller().setAuth(next))
  await act(async () => {
    snapshot.resolve(auth)
    await delivered
  })
}
const expectFocus = (id: string) => {
  expect(document.activeElement?.getAttribute("data-focus-id")).toBe(id)
  expect(document.activeElement).toBe(target(id))
}

describe("Settings in the mounted App", () => {
  describe.each([false, true])("compact navigation: %s", (compact) => {
    it.each(states)(
      "enters the current account action from selected Settings: $auth.kind",
      async ({ auth, id }) => {
        compactNavigation = compact
        await mount(auth)
        expectFocus("nav-settings")
        await key(compact ? "ArrowDown" : "ArrowRight")
        expectFocus(id)
        await key("ArrowDown")
        expectFocus("settings-client-id")
        await key("ArrowDown")
        expectFocus("settings-save")
        await key("ArrowUp")
        expectFocus("settings-client-id")
        await key("ArrowUp")
        expectFocus(id)
        await key("ArrowLeft")
        expectFocus("nav-settings")
      },
    )
  })

  it.each(states)(
    "declares account-first boundaries before effects: $auth.kind",
    ({ auth, id }) => {
      vi.mocked(controllerModule.useAppController).mockImplementation(() => ({
        ...realController(),
        auth,
        screen: { kind: "browse", route: "settings" },
      }))
      container.innerHTML = renderToStaticMarkup(<App />)
      expect(target("nav-settings").getAttribute("data-focus-right")).toBe(id)
      expect(target("nav-settings").getAttribute("data-focus-down")).toBe(id)
      expect(target(id).getAttribute("data-focus-down")).toBe("settings-client-id")
      expect(target(id).getAttribute("data-focus-left")).toBe("nav-settings")
      expect(target(id).getAttribute("data-focus-up")).toBe("nav-settings")
      expect(target("settings-client-id").getAttribute("data-focus-up")).toBe(id)
      expect(target("settings-client-id").getAttribute("data-focus-down")).toBe("settings-save")
      expect(target("settings-save").getAttribute("data-focus-up")).toBe("settings-client-id")
      expect(
        [...container.querySelectorAll(".settings-card")].map((card) =>
          card.getAttribute("aria-labelledby"),
        ),
      ).toEqual(["account-heading", "developer-app-heading"])
      expect(
        container.querySelectorAll(
          '#account-heading ~ button, [aria-labelledby="account-heading"] button',
        ),
      ).toHaveLength(1)
    },
  )

  it("preserves the challenge and exact activation flowId without saving settings or constructing a player", async () => {
    const loadPlayer = vi.spyOn(playerModule, "loadTwitchPlayerApi")
    const Player = vi.fn()
    vi.stubGlobal("Twitch", { Player })
    const bridge = await mount()
    const begin = deferred<DeviceChallenge>()
    bridge.auth.begin.mockReturnValueOnce(begin.promise)
    const outgoing = target("settings-sign-in")
    await activate("settings-sign-in")
    await act(async () => begin.resolve(challenge))
    expect(controller().auth.kind === "authorizing" && controller().auth).toEqual(authorizing)
    const auth = controller().auth
    expect(auth.kind === "authorizing" && auth.challenge).toBe(challenge)
    expect(target("settings-open-activation")).toBe(outgoing)
    expectFocus("settings-open-activation")
    await key("Enter")
    expect(bridge.auth.openActivation).toHaveBeenCalledExactlyOnceWith(challenge.flowId)
    await deliverAuth(authenticated)
    expect(target("settings-logout")).toBe(outgoing)
    expectFocus("settings-logout")
    await key("ArrowDown")
    expectFocus("settings-client-id")
    expect(bridge.settings.saveClientId).not.toHaveBeenCalled()
    expect(loadPlayer).not.toHaveBeenCalled()
    expect(Player).not.toHaveBeenCalled()
    expect(container.querySelector(".player-view")).toBeNull()
  })

  it("does not steal Client ID editor focus or unsaved text across authentication changes", async () => {
    const bridge = await mount()
    const begin = deferred<DeviceChallenge>()
    bridge.auth.begin.mockReturnValueOnce(begin.promise)
    await activate("settings-sign-in")
    const input = target("settings-client-id")
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing Client ID editor")
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter === undefined) throw new Error("Missing native input setter")
    input.focus()
    await act(async () => {
      setter.call(input, "unsavedclientidentifier1234")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => begin.resolve(challenge))
    expectFocus("settings-client-id")
    for (const auth of [
      authenticated,
      { kind: "guest" } as const,
      authorizing,
      { kind: "error", message: "expired_token" } as const,
    ]) {
      await deliverAuth(auth)
      expectFocus("settings-client-id")
      expect(input.value).toBe("unsavedclientidentifier1234")
    }
    expect(bridge.settings.saveClientId).not.toHaveBeenCalled()
  })

  it("keeps the newer challenge when begin requests complete newer-then-older across a Settings remount", async () => {
    const bridge = await mount()
    const older = deferred<DeviceChallenge>()
    const newer = deferred<DeviceChallenge>()
    const olderChallenge = { ...challenge, userCode: "CODE0001" }
    const newerChallenge = {
      ...challenge,
      flowId: "123e4567-e89b-12d3-a456-426614174001",
      userCode: "CODE0002",
    }
    bridge.auth.begin.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    await activate("settings-sign-in")
    await activate("nav-search")
    await activate("nav-settings")
    await activate("settings-sign-in")
    expect(bridge.auth.begin).toHaveBeenCalledTimes(2)
    await act(async () => newer.resolve(newerChallenge))
    expect(container.querySelector(".device-code strong")?.textContent).toBe("CODE0002")
    await act(async () => older.resolve(olderChallenge))
    expect(container.querySelector(".device-code strong")?.textContent).toBe("CODE0002")
    expect(controller().auth).toEqual({ challenge: newerChallenge, kind: "authorizing" })
    expectFocus("settings-open-activation")
    await key("Enter")
    expect(bridge.auth.openActivation).toHaveBeenCalledExactlyOnceWith(newerChallenge.flowId)
  })

  it("keeps the remounted request pending and guarded when an older begin settles first", async () => {
    const bridge = await mount()
    const older = deferred<DeviceChallenge>()
    const newer = deferred<DeviceChallenge>()
    bridge.auth.begin.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    await activate("settings-sign-in")
    await activate("nav-search")
    await activate("nav-settings")
    await activate("settings-sign-in")
    await act(async () => older.resolve({ ...challenge, userCode: "CODE0001" }))
    expect(controller().auth).toEqual({ kind: "guest" })
    expect(target("settings-sign-in").getAttribute("aria-busy")).toBe("true")
    await key("Enter")
    expect(bridge.auth.begin).toHaveBeenCalledTimes(2)
    await act(async () => newer.resolve(challenge))
    expect(controller().auth).toEqual(authorizing)
    expectFocus("settings-open-activation")
  })

  it.each(["begin", "logout"] as const)(
    "discards pending %s after an upstream account change without a remount",
    async (operation) => {
      const bridge = await mount(operation === "logout" ? authenticated : { kind: "guest" })
      const pending = deferred<DeviceChallenge>()
      bridge.auth.begin.mockReturnValueOnce(pending.promise)
      bridge.auth.logout.mockImplementationOnce(async () => {
        await pending.promise
      })
      await activate(operation === "logout" ? "settings-logout" : "settings-sign-in")
      const newerAuth: AuthSnapshot = {
        displayName: "New Viewer",
        kind: "authenticated",
        login: "new_viewer",
      }
      await deliverAuth(newerAuth)
      await act(async () => pending.resolve(challenge))
      expect(controller().auth).toEqual(newerAuth)
      expectFocus("settings-logout")
      expect(target("settings-logout").getAttribute("aria-disabled")).toBe("false")
    },
  )

  it("does not let an old logout remove a newer challenge after a Settings remount", async () => {
    const bridge = await mount(authenticated)
    const logout = deferred<void>()
    const begin = deferred<DeviceChallenge>()
    bridge.auth.logout.mockReturnValueOnce(logout.promise)
    bridge.auth.begin.mockReturnValueOnce(begin.promise)
    await activate("settings-logout")
    await activate("nav-search")
    // The upstream session is now guest while the original logout response is still in flight.
    await deliverAuth({ kind: "guest" })
    await activate("nav-settings")
    await activate("settings-sign-in")
    await act(async () => begin.resolve(challenge))
    expect(controller().auth).toEqual(authorizing)
    await act(async () => logout.resolve(undefined))
    expect(controller().auth).toEqual(authorizing)
    expect(container.querySelector(".device-code strong")?.textContent).toBe(challenge.userCode)
    expectFocus("settings-open-activation")
  })

  it.each([
    { destination: "home", outgoing: "home-refresh", survivor: "home-sign-in" },
    { destination: "following", outgoing: "following-refresh", survivor: "following-connect" },
    { destination: "settings", outgoing: "settings-logout", survivor: "settings-sign-in" },
  ])(
    "keeps connected enabled focus when logout completes on $destination",
    async ({ destination, outgoing, survivor }) => {
      const bridge = await mount(authenticated)
      const logout = deferred<void>()
      bridge.auth.logout.mockReturnValueOnce(logout.promise)
      await activate("settings-logout")
      if (destination !== "settings") {
        await activate(`nav-${destination}`)
        await key("ArrowRight")
      }
      expectFocus(outgoing)
      const focused = target(outgoing)
      await act(async () => logout.resolve(undefined))
      expect(controller().auth).toEqual({ kind: "guest" })
      expect(container.querySelector(`[data-focus-id="${outgoing}"]`)).toBeNull()
      expect(document.activeElement).not.toBe(document.body)
      expectFocus(survivor)
      expect(target(survivor).isConnected).toBe(true)
      expect(target(survivor).hasAttribute("disabled")).toBe(false)
      expect(target(survivor).getAttribute("aria-disabled")).not.toBe("true")
      expect(target(`nav-${destination}`).getAttribute("data-focus-right")).toBe(survivor)
      if (destination === "settings") expect(target(survivor)).toBe(focused)
      else expect(focused.isConnected).toBe(false)
    },
  )

  it("does not reclaim Home focus when logout removes a previously focused Refresh", async () => {
    const bridge = await mount(authenticated)
    const logout = deferred<void>()
    bridge.auth.logout.mockReturnValueOnce(logout.promise)
    await activate("settings-logout")
    await activate("nav-home")
    await key("ArrowRight")
    expectFocus("home-refresh")
    await key("ArrowLeft")
    expectFocus("nav-home")
    await act(async () => logout.resolve(undefined))
    expect(container.querySelector('[data-focus-id="home-refresh"]')).toBeNull()
    expectFocus("nav-home")
  })

  it.each(["begin", "logout", "openActivation"] as const)(
    "does not navigate back after leaving Settings during %s",
    async (operation) => {
      const bridge = await mount(
        operation === "logout"
          ? authenticated
          : operation === "openActivation"
            ? authorizing
            : { kind: "guest" },
      )
      const pending = deferred<DeviceChallenge>()
      bridge.auth.begin.mockReturnValue(pending.promise)
      bridge.auth.logout.mockImplementation(async () => {
        await pending.promise
      })
      bridge.auth.openActivation.mockImplementation(async () => {
        await pending.promise
      })
      await activate(
        operation === "logout"
          ? "settings-logout"
          : operation === "openActivation"
            ? "settings-open-activation"
            : "settings-sign-in",
      )
      await activate("nav-search")
      const focused = target("search-input")
      expect(document.activeElement).toBe(focused)
      await act(async () => pending.resolve(challenge))
      await deliverAuth(operation === "logout" ? { kind: "guest" } : authenticated)
      expect(controller().screen).toEqual({ kind: "browse", route: "search" })
      expect(document.activeElement).toBe(focused)
      expect(container.querySelector(".settings-panel")).toBeNull()
    },
  )
})
