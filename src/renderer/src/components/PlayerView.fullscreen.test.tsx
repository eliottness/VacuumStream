// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dismissOpenSurface, dispatchControllerKey } from "../focus-navigation"
import type { TwitchPlayerInstance, TwitchPlayerOptions } from "../twitch-player"
import { type PlayerSource, PlayerView } from "./PlayerView"

const liveSource = { channel: "twitch", kind: "live", title: "Live", userId: "1" } as const
const roots = new Set<Root>()

const button = (container: HTMLElement, id: string): HTMLButtonElement => {
  const target = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (target === null) throw new Error(`Missing button: ${id}`)
  return target
}

const installHarness = () => {
  const instances: TestPlayer[] = []
  class TestPlayer implements TwitchPlayerInstance {
    static readonly OFFLINE = "offline"
    static readonly ONLINE = "online"
    static readonly PAUSE = "pause"
    static readonly PLAY = "play"
    static readonly PLAYBACK_BLOCKED = "playback-blocked"
    static readonly PLAYING = "playing"
    static readonly READY = "ready"
    static readonly SEEK = "seek"

    readonly listeners = new Map<string, () => void>()
    readonly state = { muted: true, paused: false }

    constructor(elementId: string, _options: TwitchPlayerOptions) {
      instances.push(this)
      document.getElementById(elementId)?.append(document.createElement("iframe"))
    }

    readonly addEventListener = (event: string, listener: () => void): void => {
      this.listeners.set(event, listener)
    }
    readonly disableCaptions = vi.fn()
    readonly enableCaptions = vi.fn()
    readonly getCurrentTime = vi.fn(() => 0)
    readonly getDuration = vi.fn(() => 0)
    readonly getMuted = vi.fn(() => this.state.muted)
    readonly getQualities = vi.fn(() => [])
    readonly getQuality = vi.fn(() => "")
    readonly isPaused = vi.fn(() => this.state.paused)
    readonly pause = vi.fn(() => {
      this.state.paused = true
    })
    readonly play = vi.fn()
    readonly seek = vi.fn()
    readonly setMuted = vi.fn((muted: boolean) => {
      this.state.muted = muted
    })
    readonly setQuality = vi.fn()
  }
  // Autoplay fails, so the shell keeps the state the test sets and no retry timer matters.
  const activateEmbeddedPlayer = vi.fn(async () => false)
  const setPlayerFullscreen = vi.fn(async (fullscreen: boolean) => fullscreen)
  vi.stubGlobal("vacuumStream", {
    playbackProgress: {
      get: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    },
    system: { activateEmbeddedPlayer, setPlayerFullscreen },
  })
  window.Twitch = { Player: TestPlayer }
  const ready = async (): Promise<TestPlayer> => {
    const player = instances[0]
    if (player === undefined) throw new Error("Player was not constructed")
    await act(async () => player.listeners.get("ready")?.())
    return player
  }
  return { ready, setPlayerFullscreen }
}

const mountPlayer = async (
  source: PlayerSource = liveSource,
  startFullscreen = false,
): Promise<{ readonly container: HTMLDivElement; readonly root: Root }> => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  await act(async () =>
    root.render(
      <PlayerView
        onBack={() => undefined}
        onPastBroadcasts={() => undefined}
        source={source}
        startFullscreen={startFullscreen}
      />,
    ),
  )
  return { container, root }
}

const press = async (key: string, init: KeyboardEventInit = {}): Promise<boolean> => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init })
  await act(async () => {
    document.dispatchEvent(event)
  })
  return event.defaultPrevented
}

const isFullscreen = (container: HTMLElement): boolean =>
  container.querySelector(".player-view--fullscreen") !== null

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
})

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.replaceChildren()
  delete window.Twitch
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("stream fullscreen", () => {
  it("hides the shell controls and fills the screen from the toolbar button", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer()
    const fullscreen = button(container, "player-fullscreen")
    fullscreen.focus()

    await act(async () => fullscreen.click())

    expect(isFullscreen(container)).toBe(true)
    expect(harness.setPlayerFullscreen).toHaveBeenLastCalledWith(true)
    // Hidden controls give up focus so controller input can bring them back.
    expect(document.activeElement).toBe(document.body)
    expect(container.querySelector('.player-stage [role="status"]')?.textContent).toContain(
      "show the controls",
    )
  })

  it("lets Back reveal the controls on the fullscreen button before Back can leave", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer()
    await act(async () => button(container, "player-fullscreen").click())

    let dismissed = false
    await act(async () => {
      dismissed = dismissOpenSurface()
    })

    expect(dismissed).toBe(true)
    expect(isFullscreen(container)).toBe(false)
    expect(harness.setPlayerFullscreen).toHaveBeenLastCalledWith(false)
    expect(document.activeElement).toBe(button(container, "player-fullscreen"))
    // With the controls showing, Back is the shell's again.
    expect(dismissOpenSurface()).toBe(false)
  })

  it.each(["Enter", "ArrowUp"])("reveals the controls when %s is pressed", async (key) => {
    installHarness()
    const { container } = await mountPlayer()
    await act(async () => button(container, "player-fullscreen").click())

    // Controller Enter with nothing focused reaches the keyboard handlers instead of clicking.
    await act(async () => dispatchControllerKey(key))

    expect(isFullscreen(container)).toBe(false)
    expect(document.activeElement).toBe(button(container, "player-fullscreen"))
  })

  it("starts in stream fullscreen when the preference asks for it", async () => {
    const harness = installHarness()
    const { container, root } = await mountPlayer(liveSource, true)

    expect(isFullscreen(container)).toBe(true)
    expect(harness.setPlayerFullscreen).toHaveBeenCalledExactlyOnceWith(true)

    await act(async () => root.unmount())
    roots.delete(root)
    expect(harness.setPlayerFullscreen).toHaveBeenLastCalledWith(false)
  })
})

describe("player hotkeys", () => {
  it("toggles stream fullscreen with F, H and T from any shell control", async () => {
    installHarness()
    const { container } = await mountPlayer()
    button(container, "player-back").focus()

    expect(await press("h")).toBe(true)
    expect(isFullscreen(container)).toBe(true)
    await press("F")
    expect(isFullscreen(container)).toBe(false)
    expect(document.activeElement).toBe(button(container, "player-fullscreen"))
    await press("t")
    expect(isFullscreen(container)).toBe(true)
  })

  it("leaves modified keys and text entry alone", async () => {
    installHarness()
    const { container } = await mountPlayer()
    expect(await press("f", { ctrlKey: true })).toBe(false)
    const input = document.createElement("input")
    container.append(input)
    input.focus()
    expect(await press("f")).toBe(false)
    expect(isFullscreen(container)).toBe(false)
  })

  it("mutes with M once the player is ready", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer()
    expect(await press("m")).toBe(false)

    const player = await harness.ready()
    const mute = button(container, "player-muted")
    const before = mute.getAttribute("aria-label")
    await press("m")

    expect(player.setMuted).toHaveBeenCalledExactlyOnceWith(false)
    expect(mute.getAttribute("aria-label")).not.toBe(before)
  })

  it("keeps the mute it requested while Twitch applies it asynchronously", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer()
    const player = await harness.ready()
    // Twitch's embed answers getMuted() with the old value until its frame applies the change.
    player.setMuted.mockImplementation(() => undefined)
    const mute = button(container, "player-muted")
    expect(mute.getAttribute("aria-label")).toBe("Unmute")

    await press("m")

    expect(player.setMuted).toHaveBeenCalledExactlyOnceWith(false)
    expect(mute.getAttribute("aria-label")).toBe("Mute")
  })

  it("plays or pauses with Space only while no shell control is focused", async () => {
    const harness = installHarness()
    const { container } = await mountPlayer()
    const player = await harness.ready()

    // A focused button answers Space itself.
    button(container, "player-back").focus()
    expect(await press(" ")).toBe(false)
    expect(player.pause).not.toHaveBeenCalled()

    await act(async () => button(container, "player-fullscreen").click())
    expect(await press(" ")).toBe(true)
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(isFullscreen(container)).toBe(true)
  })
})
