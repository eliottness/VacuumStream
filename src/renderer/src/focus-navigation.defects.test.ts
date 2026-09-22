// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  dispatchControllerKey,
  SEARCH_GAMEPAD_EVENT,
  useControllerNavigation,
} from "./focus-navigation"

type GamepadSnapshot = Pick<Gamepad, "axes" | "buttons" | "connected">

const gamepad = (pressed: readonly number[] = []): GamepadSnapshot => ({
  axes: [0, 0],
  buttons: Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    touched: pressed.includes(index),
    value: pressed.includes(index) ? 1 : 0,
  })),
  connected: true,
})

describe("focus-navigation defect regressions", () => {
  let root: Root
  let nextFrame: FrameRequestCallback | undefined
  let snapshot: GamepadSnapshot | undefined
  let target: HTMLButtonElement
  const keys: string[] = []
  const recordKey = (event: KeyboardEvent) => keys.push(event.key)
  const Surface = () => {
    useControllerNavigation()
    return null
  }

  const frame = async (now: number, pressed: readonly number[] = []) => {
    snapshot = gamepad(pressed)
    const callback = nextFrame
    if (callback === undefined) throw new Error("No scheduled gamepad frame")
    nextFrame = undefined
    await act(async () => callback(now))
  }
  const runScheduledFrame = async (callback: FrameRequestCallback | undefined, now: number) => {
    if (callback === undefined) return
    await act(async () => callback(now))
  }

  beforeEach(async () => {
    keys.length = 0
    snapshot = undefined
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal("navigator", { getGamepads: () => [snapshot] })
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const container = document.createElement("div")
    target = document.createElement("button")
    document.body.append(container, target)
    target.focus()
    document.addEventListener("keydown", recordKey)
    root = createRoot(container)
    await act(async () => root.render(createElement(Surface)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.removeEventListener("keydown", recordKey)
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.fails("D-cycle-18-3 invalidates a face edge masked by Escape before it can reopen Search", async () => {
    const input = document.createElement("input")
    const searchActions: string[] = []
    let context: "search" | "home" = "search"
    const changeContext = (event: KeyboardEvent) => {
      if (event.key === "Escape") context = "home"
      if (event.key === "/") context = "search"
    }
    input.addEventListener(SEARCH_GAMEPAD_EVENT, (event) => {
      searchActions.push((event as CustomEvent<string>).detail)
    })
    document.addEventListener("keydown", changeContext)
    document.body.append(input)
    input.focus()

    try {
      // B masks the simultaneous X edge, then closes Search before B is released.
      await frame(1, [1, 2])
      expect(context).toBe("home")

      // Releasing B must not reinterpret the already-held X as a new Search action.
      await frame(2, [2])
      expect(context).toBe("home")
      expect(searchActions).toEqual([])
      expect(keys).toEqual(["Escape"])
    } finally {
      document.removeEventListener("keydown", changeContext)
    }
  })

  it.fails("D-xc-performance-1 pauses hidden controller work and wakes on visibility change", async () => {
    let activations = 0
    target.addEventListener("click", () => {
      activations += 1
    })
    target.focus()
    const originalVisibility = document.visibilityState
    try {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      })
      snapshot = gamepad([0])

      const hiddenFrame = nextFrame
      nextFrame = undefined
      await runScheduledFrame(hiddenFrame, 1)
      expect(activations).toBe(0)

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      })
      document.dispatchEvent(new Event("visibilitychange"))
      const wakeFrame = nextFrame
      nextFrame = undefined
      await runScheduledFrame(wakeFrame, 2)
      expect(activations).toBe(1)
    } finally {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: originalVisibility,
      })
    }
  })

  it.fails("D-xc-performance-2 reuses measured focus geometry until the DOM or viewport changes", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined)

    const current = document.createElement("button")
    const next = document.createElement("button")
    const last = document.createElement("button")
    const elements = [current, next, last]
    for (const [index, element] of elements.entries()) {
      element.setAttribute("data-focusable", "true")
      element.textContent = element.id = ["current", "next", "last"][index] ?? ""
      document.body.append(element)
    }
    current.getBoundingClientRect = () => ({ bottom: 100, left: 0, right: 100, top: 0 }) as DOMRect
    next.getBoundingClientRect = () => ({ bottom: 220, left: 0, right: 100, top: 120 }) as DOMRect
    last.getBoundingClientRect = () => ({ bottom: 340, left: 0, right: 100, top: 240 }) as DOMRect
    current.focus()

    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(next)

    for (const element of elements) {
      element.getBoundingClientRect = () => {
        throw new Error("layout must not be read for an unchanged focus graph")
      }
    }

    await act(async () => dispatchControllerKey("ArrowDown"))
    expect(document.activeElement).toBe(last)
  })
})
