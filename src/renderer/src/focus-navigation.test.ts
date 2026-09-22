// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  chooseNextFocus,
  dispatchControllerKey,
  focusDirectionalOverride,
  markControllerFocus,
  SEARCH_GAMEPAD_EVENT,
  shouldPreserveInputArrow,
  shouldRepeatControllerKey,
  useControllerNavigation,
} from "./focus-navigation"

const candidates = [
  { bottom: 100, id: "current", left: 0, right: 100, top: 0 },
  { bottom: 100, id: "right", left: 120, right: 220, top: 0 },
  { bottom: 240, id: "diagonal", left: 105, right: 205, top: 140 },
]

describe("spatial focus navigation", () => {
  it("prefers the nearest candidate aligned with the requested direction", () => {
    // Given focusable targets in the same row and a diagonal row
    const current = candidates[0]

    // When the user presses right on a controller
    const next = chooseNextFocus(current, candidates, "right")

    // Then focus remains in the current shelf
    expect(next?.id).toBe("right")
  })

  it("activates the focused button when controller A emits Enter", () => {
    // Given a focused controller target
    const button = document.createElement("button")
    let activations = 0
    button.addEventListener("click", () => {
      activations += 1
    })
    document.body.append(button)
    button.focus()

    // When controller A emits its semantic Enter action
    dispatchControllerKey("Enter")

    // Then the focused target is activated once
    expect(activations).toBe(1)
    button.remove()
  })

  it("preserves caret arrows unless the input declares a directional escape", () => {
    // Given focus is inside a text input
    const inputHasFocus = true

    // When physical and synthetic directional events are classified
    const physicalArrowIsPreserved = shouldPreserveInputArrow(inputHasFocus, true, "ArrowRight")
    const gamepadArrowIsPreserved = shouldPreserveInputArrow(inputHasFocus, false, "ArrowRight")
    const physicalDownLeavesInput = shouldPreserveInputArrow(inputHasFocus, true, "ArrowDown")
    const linkedArrowLeavesInput = shouldPreserveInputArrow(inputHasFocus, true, "ArrowRight", true)

    // Then caret movement stays native while gamepad spatial navigation remains available
    expect(physicalArrowIsPreserved).toBe(true)
    expect(gamepadArrowIsPreserved).toBe(false)
    expect(physicalDownLeavesInput).toBe(false)
    expect(linkedArrowLeavesInput).toBe(false)
  })

  it("marks controller focus after pointer input changes browser modality", () => {
    // Given a stale controller target and a newly selected destination
    const previous = document.createElement("button")
    const destination = document.createElement("button")
    previous.setAttribute("data-controller-focused", "true")
    document.body.append(previous, destination)

    // When joystick navigation selects the destination
    markControllerFocus(destination)

    // Then the destination owns the explicit controller focus marker
    expect(previous.hasAttribute("data-controller-focused")).toBe(false)
    expect(destination.getAttribute("data-controller-focused")).toBe("true")
    previous.remove()
    destination.remove()
  })

  it("repeats directional holds without repeating action buttons", () => {
    // Given directional and action keys emitted by a held gamepad control
    const keys = ["ArrowRight", "Enter", "Escape", "/", "F10"]

    // When repeat eligibility is classified
    const decisions = keys.map(shouldRepeatControllerKey)

    // Then only spatial navigation repeats
    expect(decisions).toEqual([true, false, false, false, false])
  })

  it("uses an explicit directional link before geometric fallback", () => {
    // Given a focused control linked to a semantic destination
    const current = document.createElement("button")
    const target = document.createElement("button")
    current.setAttribute("data-focus-right", "target-control")
    target.setAttribute("data-focus-id", "target-control")
    document.body.append(current, target)

    // When rightward navigation resolves the explicit link
    const destination = focusDirectionalOverride(current, "right")

    // Then the linked control wins over unrelated geometry
    expect(destination).toBe(target)
    current.remove()
    target.remove()
  })

  it("returns no candidate when nothing exists in the requested direction", () => {
    // Given focus on the right-most target
    const current = candidates[1]

    // When the user presses right again
    const next = chooseNextFocus(current, candidates, "right")

    // Then focus does not wrap unpredictably
    expect(next).toBeUndefined()
  })
})

describe("native gamepad press identity", () => {
  let root: Root
  let nextFrame: FrameRequestCallback | undefined
  let snapshot: Pick<Gamepad, "axes" | "buttons" | "connected"> | undefined
  let target: HTMLButtonElement
  const keys: string[] = []
  const recordKey = (event: KeyboardEvent) => keys.push(event.key)
  const Surface = () => {
    useControllerNavigation()
    return null
  }
  const frame = async (now: number, pressed: readonly number[] = [], axes = [0, 0]) => {
    snapshot = {
      axes,
      buttons: Array.from({ length: 16 }, (_, index) => ({
        pressed: pressed.includes(index),
        touched: pressed.includes(index),
        value: pressed.includes(index) ? 1 : 0,
      })),
      connected: true,
    }
    const callback = nextFrame
    if (callback === undefined) throw new Error("No scheduled gamepad frame")
    nextFrame = undefined
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

  it("offers distinct local cancelable actions before falling back to slash once per press", async () => {
    const actions: Event[] = []
    target.addEventListener(SEARCH_GAMEPAD_EVENT, (event) => actions.push(event))
    await frame(1, [2])
    await frame(501, [2])
    await frame(601, [2])
    await frame(1601, [2])
    // A north press is not confused with the preceding west press, despite the same fallback.
    await frame(1602, [3])
    await frame(2102, [3])
    await frame(2202, [3])
    expect(keys).toEqual(["/", "/"])
    expect(actions.map((event) => (event as CustomEvent).detail)).toEqual(["delete", "submit"])
    for (const event of actions) {
      expect(event.target).toBe(target)
      expect(event.bubbles).toBe(true)
      expect(event.cancelable).toBe(true)
      expect(event.composed).toBe(false)
    }
    expect(document.activeElement).toBe(target)
    await frame(2203)
    await frame(2204, [3])
    expect(keys).toEqual(["/", "/", "/"])
  })

  it.each([2, 3])(
    "keeps button %s latched across context and higher-priority button changes until release",
    async (button) => {
      const input = document.createElement("input")
      document.body.append(input)
      const consumed = vi.fn((event: Event) => event.preventDefault())
      input.addEventListener(SEARCH_GAMEPAD_EVENT, consumed)
      await frame(1, [button])
      expect(keys).toEqual(["/"])
      input.focus()
      await frame(501, [button])
      await frame(601, [button])
      await frame(1601, [button])
      await frame(1602, [0, button])
      await frame(1603, [button])
      expect(consumed).not.toHaveBeenCalled()
      await frame(1604)
      await frame(1605, [button])
      expect(consumed).toHaveBeenCalledTimes(1)
      expect(keys).toEqual(["/"])
      expect(document.activeElement).toBe(input)
    },
  )

  it("preserves A, B and Settings actions without hold repeats", async () => {
    const activate = vi.fn()
    target.addEventListener("click", activate)
    await frame(1, [0])
    await frame(501, [0])
    await frame(601, [0])
    expect(activate).toHaveBeenCalledTimes(1)
    await frame(602, [1])
    await frame(1102, [1])
    await frame(1202, [1])
    await frame(1203, [9])
    await frame(1703, [9])
    expect(keys).toEqual(["Escape", "F10"])
  })

  it.each([
    { axes: [0, 0], button: 12, key: "ArrowUp" },
    { axes: [0, 0], button: 13, key: "ArrowDown" },
    { axes: [0, 0], button: 14, key: "ArrowLeft" },
    { axes: [0, 0], button: 15, key: "ArrowRight" },
    { axes: [0, -1], button: undefined, key: "ArrowUp" },
    { axes: [0, 1], button: undefined, key: "ArrowDown" },
    { axes: [-1, 0], button: undefined, key: "ArrowLeft" },
    { axes: [1, 0], button: undefined, key: "ArrowRight" },
  ])(
    "preserves $key repeat thresholds for button $button and axes $axes",
    async ({ axes, button, key }) => {
      const buttons = button === undefined ? [] : [button]
      await frame(100, buttons, axes)
      await frame(599, buttons, axes)
      expect(keys).toEqual([key])
      await frame(600, buttons, axes)
      await frame(699, buttons, axes)
      expect(keys).toEqual([key, key])
      await frame(700, buttons, axes)
      expect(keys).toEqual([key, key, key])
      await frame(701)
      await frame(702, buttons, axes)
      expect(keys).toEqual([key, key, key, key])
    },
  )
})
