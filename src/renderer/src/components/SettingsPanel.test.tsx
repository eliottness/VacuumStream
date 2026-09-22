// @vitest-environment jsdom

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsStore } from "../../../main/settings-store"
import type {
  AuthSnapshot,
  DeviceChallenge,
  SettingsSnapshot,
  VacuumStreamApi,
} from "../../../shared/contracts"
import { App } from "../App"
import { SettingsPanel } from "./SettingsPanel"

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
const settings: SettingsSnapshot = {
  clientId: "abcdefghijklmnopqrstuvwxyz1234",
  secureStorage: false,
}

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

describe("settings account panel", () => {
  it("keeps the Twitch activation link and adds a scannable QR code", () => {
    // Given an active Twitch device authorization challenge
    const verificationUri = "https://www.twitch.tv/activate"

    // When the account panel renders the challenge
    const markup = renderToStaticMarkup(
      <SettingsPanel
        auth={{
          challenge: {
            expiresAt: "2026-09-17T21:00:00.000Z",
            flowId: "123e4567-e89b-12d3-a456-426614174000",
            intervalSeconds: 5,
            userCode: "ABCD-1234",
            verificationUri,
          },
          kind: "authorizing",
        }}
        onAccountRequest={() => () => true}
        onAuthChange={() => undefined}
        onSettingsChange={() => undefined}
        settings={{ clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false }}
      />,
    )

    // Then another device can scan the QR while the original address remains visible
    expect(markup).toContain('aria-label="Scan Twitch activation QR code"')
    expect(markup).toContain(verificationUri)
    expect(markup).not.toContain("secure Linux keyring")
  })
})

describe("settings account focus continuity", () => {
  let container: HTMLDivElement
  let root: Root
  let currentAuth: AuthSnapshot
  const begin = vi.fn<() => Promise<DeviceChallenge>>()
  const logout = vi.fn<() => Promise<void>>()
  const openActivation = vi.fn<(flowId: string) => Promise<void>>()
  const saveClientId = vi.fn<(clientId: string) => Promise<SettingsSnapshot>>()
  const onAccountRequest = vi.fn<() => () => boolean>(() => () => true)
  const onSettingsChange = vi.fn<(next: SettingsSnapshot, resetAuth: boolean) => void>()
  const onAuthChange = vi.fn<(next: AuthSnapshot) => void>((next) => {
    currentAuth = next
    root.render(panel())
  })
  const panel = (configuration = settings) => (
    <SettingsPanel
      auth={currentAuth}
      onAccountRequest={onAccountRequest}
      onAuthChange={onAuthChange}
      onSettingsChange={onSettingsChange}
      settings={configuration}
    />
  )
  beforeEach(() => {
    begin.mockReset()
    logout.mockReset()
    openActivation.mockReset()
    saveClientId.mockReset()
    onAccountRequest.mockReset().mockImplementation(() => () => true)
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal("vacuumStream", {
      auth: { begin, logout, openActivation },
      settings: { saveClientId },
    })
    currentAuth = { kind: "guest" }
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.replaceChildren()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })
  const render = async (auth: AuthSnapshot, configuration = settings) => {
    currentAuth = auth
    await act(async () => root.render(panel(configuration)))
  }
  const action = (id: string): HTMLButtonElement => {
    const button = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
    if (button === null) throw new Error(`Missing account action ${id}`)
    return button
  }
  const expectSurvivor = (outgoing: HTMLButtonElement, id: string) => {
    const surviving = action(id)
    expect(surviving.getAttribute("data-focus-id")).toBe(id)
    expect.soft(document.activeElement?.tagName, `${id}: active element`).toBe("BUTTON")
    expect
      .soft(document.activeElement === surviving, `${id}: surviving action is focused`)
      .toBe(true)
    expect(surviving === outgoing, `${id}: same button node`).toBe(true)
  }

  it("keeps the same focused button through guest -> authorizing -> authenticated", async () => {
    const request = deferred<DeviceChallenge>()
    begin.mockReturnValueOnce(request.promise)
    await render({ kind: "guest" })
    const outgoing = action("settings-sign-in")
    outgoing.focus()
    await act(async () => outgoing.click())
    await act(async () => request.resolve(challenge))
    expect(onAuthChange).toHaveBeenCalledExactlyOnceWith({ challenge, kind: "authorizing" })
    expect(onAuthChange.mock.calls[0]?.[0]).toHaveProperty("challenge", challenge)
    expect(currentAuth.kind === "authorizing" && currentAuth.challenge).toBe(challenge)
    expectSurvivor(outgoing, "settings-open-activation")
    await render(authenticated)
    expectSurvivor(outgoing, "settings-logout")
  })

  it.each([
    { auth: authenticated, id: "settings-logout", name: "authenticated" },
    {
      auth: { kind: "error", message: "The Twitch sign-in code expired" } as const,
      id: "settings-sign-in",
      name: "expired",
    },
    {
      auth: { kind: "error", message: "access_denied" } as const,
      id: "settings-sign-in",
      name: "error",
    },
  ])("keeps the same focused button through authorizing -> $name", async ({ auth, id }) => {
    await render(authorizing)
    const outgoing = action("settings-open-activation")
    outgoing.focus()
    await render(auth)
    expectSurvivor(outgoing, id)
    if (auth.kind === "error") {
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(auth.message)
    }
  })

  it("keeps the same focused button through authenticated -> guest", async () => {
    const request = deferred<void>()
    logout.mockReturnValueOnce(request.promise)
    await render(authenticated)
    const outgoing = action("settings-logout")
    outgoing.focus()
    await act(async () => outgoing.click())
    await act(async () => request.resolve(undefined))
    expect(logout).toHaveBeenCalledTimes(1)
    expectSurvivor(outgoing, "settings-sign-in")
  })

  const pendingRequest = () => {
    const pending = deferred<DeviceChallenge>()
    begin.mockReturnValue(pending.promise)
    logout.mockImplementation(async () => {
      await pending.promise
    })
    openActivation.mockImplementation(async () => {
      await pending.promise
    })
    return pending
  }
  const requests = [
    { auth: { kind: "guest" } as const, id: "settings-sign-in", request: begin },
    { auth: authorizing, id: "settings-open-activation", request: openActivation },
    { auth: authenticated, id: "settings-logout", request: logout },
  ]
  it.each(requests)(
    "guards repeated $id activation synchronously while keeping the pending button focusable",
    async ({ auth, id, request }) => {
      const pending = pendingRequest()
      await render(auth)
      const outgoing = action(id)
      outgoing.focus()
      await act(async () => {
        outgoing.click()
        outgoing.click()
      })
      expect(request).toHaveBeenCalledTimes(1)
      expect(outgoing.disabled).toBe(false)
      expect(outgoing.getAttribute("aria-busy")).toBe("true")
      expect(outgoing.getAttribute("aria-disabled")).toBe("true")
      expect(document.activeElement).toBe(outgoing)
      await act(async () => outgoing.click())
      expect(request).toHaveBeenCalledTimes(1)
      await act(async () => pending.resolve(challenge))
      expect(document.activeElement).toBe(outgoing)
      expect(outgoing.getAttribute("aria-busy")).toBe("false")
      expect(outgoing.getAttribute("aria-disabled")).toBe("false")
      if (auth.kind === "authorizing") {
        expect(openActivation).toHaveBeenCalledExactlyOnceWith(challenge.flowId)
      }
    },
  )

  it.each(requests)(
    "announces a rejected $id request and keeps a reachable retry on the same action",
    async ({ auth, id, request }) => {
      const pending = pendingRequest()
      await render(auth)
      const outgoing = action(id)
      outgoing.focus()
      await act(async () => outgoing.click())
      await act(async () => pending.reject(new Error("Bridge unavailable")))
      const alert = container.querySelector('[role="alert"]')
      expect(alert).not.toBeNull()
      expect(alert?.textContent?.length).toBeGreaterThan(0)
      expectSurvivor(outgoing, id)
      expect(outgoing.getAttribute("aria-disabled")).toBe("false")
      const retry = pendingRequest()
      await act(async () => outgoing.click())
      expect(request).toHaveBeenCalledTimes(2)
      await act(async () => retry.resolve(challenge))
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expect(document.activeElement).toBe(outgoing)
    },
  )

  it.each(requests)(
    "discards an obsolete $id failure without disabling the current action",
    async ({ auth, id }) => {
      let current = true
      onAccountRequest.mockReturnValueOnce(() => current)
      const pending = pendingRequest()
      await render(auth)
      const outgoing = action(id)
      outgoing.focus()
      await act(async () => outgoing.click())
      current = false
      await act(async () => pending.reject(new Error("Obsolete request")))
      expect(onAuthChange).not.toHaveBeenCalled()
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expectSurvivor(outgoing, id)
      expect(outgoing.getAttribute("aria-busy")).toBe("false")
      expect(outgoing.getAttribute("aria-disabled")).toBe("false")
    },
  )

  it("discards an obsolete Client ID save instead of resetting a newer account", async () => {
    let current = true
    onAccountRequest.mockReturnValueOnce(() => current)
    const pending = deferred<SettingsSnapshot>()
    saveClientId.mockReturnValueOnce(pending.promise)
    await render(authenticated)
    await act(async () => action("settings-save").click())
    expect(saveClientId).toHaveBeenCalledTimes(1)
    current = false
    await act(async () => pending.resolve({ ...settings, clientId: "newclientidentifier1234" }))
    expect(onSettingsChange).not.toHaveBeenCalled()
    expect(action("settings-save").disabled).toBe(false)
  })

  it("keeps an unconfigured sign-in reachable but does not start authorization", async () => {
    await render({ kind: "guest" }, { ...settings, clientId: "" })
    const signIn = action("settings-sign-in")
    expect(signIn.disabled).toBe(false)
    expect(signIn.getAttribute("aria-disabled")).toBe("true")
    signIn.focus()
    await act(async () => signIn.click())
    expect(document.activeElement).toBe(signIn)
    expect(begin).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    "preserves Client ID persistence and auth reset semantics (changed: %s)",
    async (changed) => {
      const next = {
        ...settings,
        clientId: changed ? "differentclientidentifier1234" : settings.clientId,
      }
      const pending = deferred<SettingsSnapshot>()
      saveClientId.mockReturnValueOnce(pending.promise)
      await render(authenticated)
      const input = container.querySelector<HTMLInputElement>("#client-id")
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      if (input === null || setter === undefined) throw new Error("Missing Client ID input")
      await act(async () => {
        setter.call(input, next.clientId)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await act(async () => action("settings-save").click())
      expect(saveClientId).toHaveBeenCalledExactlyOnceWith(next.clientId)
      await act(async () => pending.resolve(next))
      expect(onSettingsChange).toHaveBeenCalledExactlyOnceWith(next, changed)
      expect(begin).not.toHaveBeenCalled()
    },
  )
})

type MountedBridge = ReturnType<typeof makeMountedBridge>["bridge"]

const makeMountedBridge = (
  store: SettingsStore,
  getAuth: () => AuthSnapshot,
  setAuth: (auth: AuthSnapshot) => void,
) => {
  const persistClientId = async (clientId: string): Promise<SettingsSnapshot> => {
    const previous = await store.load()
    const saved = await store.saveClientId(clientId)
    if (saved.clientId !== previous.clientId) setAuth({ kind: "guest" })
    return { clientId: saved.clientId, secureStorage: false }
  }
  const bridge = {
    auth: {
      begin: vi.fn<VacuumStreamApi["auth"]["begin"]>(),
      logout: vi.fn<VacuumStreamApi["auth"]["logout"]>().mockResolvedValue(undefined),
      openActivation: vi
        .fn<VacuumStreamApi["auth"]["openActivation"]>()
        .mockResolvedValue(undefined),
      snapshot: vi
        .fn<VacuumStreamApi["auth"]["snapshot"]>()
        .mockImplementation(async () => getAuth()),
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
      begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>().mockResolvedValue(undefined),
      end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
      onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
      press: vi.fn<VacuumStreamApi["chatInput"]["press"]>().mockResolvedValue(undefined),
    },
    favourites: {
      add: vi.fn<VacuumStreamApi["favourites"]["add"]>().mockResolvedValue([]),
      list: vi.fn<VacuumStreamApi["favourites"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["favourites"]["remove"]>().mockResolvedValue([]),
    },
    playbackProgress: {
      get: vi.fn<VacuumStreamApi["playbackProgress"]["get"]>().mockResolvedValue(undefined),
      list: vi.fn<VacuumStreamApi["playbackProgress"]["list"]>().mockResolvedValue([]),
      remove: vi.fn<VacuumStreamApi["playbackProgress"]["remove"]>().mockResolvedValue(undefined),
      save: vi.fn<VacuumStreamApi["playbackProgress"]["save"]>().mockResolvedValue(undefined),
    },
    settings: {
      saveClientId: vi
        .fn<VacuumStreamApi["settings"]["saveClientId"]>()
        .mockImplementation(persistClientId),
      snapshot: vi.fn<VacuumStreamApi["settings"]["snapshot"]>().mockImplementation(async () => {
        const current = await store.load()
        return { clientId: current.clientId, secureStorage: false }
      }),
    },
    system: {
      activateEmbeddedPlayer: vi
        .fn<VacuumStreamApi["system"]["activateEmbeddedPlayer"]>()
        .mockResolvedValue(false),
      isSteamGameMode: vi
        .fn<VacuumStreamApi["system"]["isSteamGameMode"]>()
        .mockResolvedValue(false),
      restoreShellFullscreen: vi
        .fn<VacuumStreamApi["system"]["restoreShellFullscreen"]>()
        .mockResolvedValue(false),
      toggleFullscreen: vi
        .fn<VacuumStreamApi["system"]["toggleFullscreen"]>()
        .mockResolvedValue(false),
    },
  } satisfies VacuumStreamApi
  return { bridge, persistClientId }
}

describe("Settings persistence through the mounted App", () => {
  let container: HTMLDivElement
  let root: Root | undefined
  let directory: string
  let store: SettingsStore
  let authState: AuthSnapshot

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    )
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query !== "(width < 45rem)",
    }))
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-panel-"))
    store = new SettingsStore(directory)
    await store.saveClientId(settings.clientId)
    authState = authenticated
    container = document.createElement("div")
    document.body.append(container)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = undefined
    document.body.replaceChildren()
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    await rm(directory, { force: true, recursive: true })
  })

  const target = <Element extends HTMLElement = HTMLElement>(id: string): Element => {
    const element = container.querySelector<Element>(`[data-focus-id="${id}"]`)
    if (element === null) throw new Error(`Missing mounted App target ${id}`)
    return element
  }
  const mount = async (bridge: MountedBridge) => {
    vi.stubGlobal("vacuumStream", bridge)
    root = createRoot(container)
    await act(async () => root?.render(<App />))
    await act(async () => {
      await bridge.settings.snapshot()
      await bridge.auth.snapshot()
    })
  }
  const openSettings = async () => {
    await act(async () => target<HTMLButtonElement>("nav-settings").click())
  }
  const setClientId = async (value: string) => {
    const input = target<HTMLInputElement>("settings-client-id")
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter === undefined) throw new Error("Missing native input setter")
    await act(async () => {
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    return input
  }

  it.each([false, true])(
    "D-cycle-19-3 saves through mounted App (changed: %s), resets account state, keeps Save focused, and reads the Client ID back from the store",
    async (changed) => {
      const nextClientId = changed ? "differentclientidentifier1234" : settings.clientId
      const { bridge } = makeMountedBridge(
        store,
        () => authState,
        (next) => {
          authState = next
        },
      )
      await mount(bridge)
      await openSettings()
      await setClientId(nextClientId)
      const save = target<HTMLButtonElement>("settings-save")
      save.focus()
      const settled = deferred<void>()
      const persisted = deferred<void>()
      bridge.settings.saveClientId.mockImplementationOnce(async (clientId) => {
        await settled.promise
        const saved = await store.saveClientId(clientId)
        if (saved.clientId !== settings.clientId) authState = { kind: "guest" }
        persisted.resolve(undefined)
        return { clientId: saved.clientId, secureStorage: false }
      })

      await act(async () => save.click())
      expect(document.activeElement).toBe(save)
      expect(save.disabled).toBe(true)
      expect(bridge.settings.saveClientId).toHaveBeenCalledWith(nextClientId)
      await act(async () => {
        settled.resolve(undefined)
        await persisted.promise
      })

      expect(target<HTMLInputElement>("settings-client-id").value).toBe(nextClientId)
      const account = target<HTMLButtonElement>(changed ? "settings-sign-in" : "settings-logout")
      expect(account.textContent).toContain(changed ? "Sign in" : "Sign out")
      expect(document.activeElement).toBe(save)
      expect((await store.load()).clientId).toBe(nextClientId)

      await act(async () => root?.unmount())
      root = undefined
      await mount(bridge)
      await openSettings()
      expect(target<HTMLInputElement>("settings-client-id").value).toBe(nextClientId)
      expect(target(changed ? "settings-sign-in" : "settings-logout")).not.toBeNull()
    },
  )

  it("D-cycle-22-3 ignores an obsolete mounted-App save after a newer auth/settings remount, preserving the account and Client ID", async () => {
    const newerAuth: AuthSnapshot = {
      displayName: "New Fixture Viewer",
      kind: "authenticated",
      login: "new_fixture_viewer",
    }
    const newerClientId = "newerclientidentifier1234"
    const staleClientId = "staleclientidentifier1234"
    const { bridge } = makeMountedBridge(
      store,
      () => authState,
      (next) => {
        authState = next
      },
    )
    await mount(bridge)
    await openSettings()
    await setClientId(staleClientId)
    const pending = deferred<SettingsSnapshot>()
    bridge.settings.saveClientId.mockReturnValueOnce(pending.promise)
    const save = target<HTMLButtonElement>("settings-save")
    save.focus()
    await act(async () => save.click())
    expect(save.disabled).toBe(true)

    await store.saveClientId(newerClientId)
    authState = newerAuth
    await act(async () => root?.unmount())
    root = undefined
    await mount(bridge)
    await openSettings()
    expect(container.querySelector(".account-status")?.textContent).toContain(
      "Signed in as New Fixture Viewer",
    )
    expect(target<HTMLInputElement>("settings-client-id").value).toBe(newerClientId)

    await act(async () => pending.resolve({ clientId: staleClientId, secureStorage: false }))
    expect(container.querySelector(".account-status")?.textContent).toContain(
      "Signed in as New Fixture Viewer",
    )
    expect(target<HTMLInputElement>("settings-client-id").value).toBe(newerClientId)
    expect((await store.load()).clientId).toBe(newerClientId)
  })
})
