import { describe, expect, it } from "vitest"
// @vitest-environment jsdom

import {
  chooseNextFocus,
  dispatchControllerKey,
  shouldPreserveInputArrow,
  shouldRepeatControllerKey,
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

  it("preserves physical input arrows but lets gamepad arrows leave the field", () => {
    // Given focus is inside a text input
    const inputHasFocus = true

    // When physical and synthetic directional events are classified
    const physicalArrowIsPreserved = shouldPreserveInputArrow(inputHasFocus, true, "ArrowRight")
    const gamepadArrowIsPreserved = shouldPreserveInputArrow(inputHasFocus, false, "ArrowRight")

    // Then caret movement stays native while gamepad spatial navigation remains available
    expect(physicalArrowIsPreserved).toBe(true)
    expect(gamepadArrowIsPreserved).toBe(false)
  })

  it("repeats directional holds without repeating action buttons", () => {
    // Given directional and action keys emitted by a held gamepad control
    const keys = ["ArrowRight", "Enter", "Escape", "/", "F10"]

    // When repeat eligibility is classified
    const decisions = keys.map(shouldRepeatControllerKey)

    // Then only spatial navigation repeats
    expect(decisions).toEqual([true, false, false, false, false])
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
