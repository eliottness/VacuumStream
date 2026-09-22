// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dispatchControllerKey, useControllerNavigation } from "../focus-navigation"
import { Showcase } from "../Showcase"
import { VideoResumePrompt } from "./VideoResumePrompt"

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body)
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollFeedback,
    writable: true,
  })
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})

const mountPrompt = async (mode: "bookmark" | "error" | "loading" = "bookmark") => {
  const actions = { back: vi.fn(), resume: vi.fn(), start: vi.fn() }
  const NavigablePrompt = () => {
    useControllerNavigation()
    return (
      <VideoResumePrompt
        {...(mode === "bookmark" ? { position: 3900.9 } : {})}
        {...(mode === "error" ? { error: "Read rejected" } : {})}
        loading={mode === "loading"}
        onBack={actions.back}
        onResume={actions.resume}
        onStartOver={actions.start}
        title="Recording"
      />
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<NavigablePrompt />))
  for (const button of container.querySelectorAll("button")) button.scrollIntoView = vi.fn()
  return { actions, container, root }
}

const press = async (key: string): Promise<void> => {
  await act(async () => dispatchControllerKey(key))
}

const scrollFeedback = vi.fn()

describe("VideoResumePrompt", () => {
  it("exposes stable focus links and activates all three choices with arrows and Enter", async () => {
    const { actions, container, root } = await mountPrompt()
    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.map((button) => button.getAttribute("data-focus-id"))).toEqual([
      "video-resume-resume",
      "video-resume-start",
      "video-resume-back",
    ])
    expect(buttons[0]?.textContent?.match(/\d+:\d{2}:\d{2}/)?.[0]).toBe("1:05:00")
    expect(document.activeElement).toBe(buttons[0])
    expect(buttons[0]?.getAttribute("data-controller-focused")).toBe("true")
    for (const button of buttons) {
      expect(button.getAttribute("data-focusable")).toBe("true")
      for (const direction of ["down", "left", "right", "up"]) {
        const id = button.getAttribute(`data-focus-${direction}`)
        expect(buttons.some((candidate) => candidate.getAttribute("data-focus-id") === id)).toBe(
          true,
        )
      }
      expect(document.activeElement).toBe(button)
      await press("Enter")
      await press("ArrowRight")
    }
    expect(actions.resume).toHaveBeenCalledTimes(1)
    expect(actions.start).toHaveBeenCalledTimes(1)
    expect(actions.back).toHaveBeenCalledTimes(1)
    await press("ArrowLeft")
    expect(document.activeElement).toBe(buttons[1])
    await press("ArrowUp")
    expect(document.activeElement).toBe(buttons[0])
    await press("ArrowDown")
    expect(document.activeElement).toBe(buttons[1])
    await press("ArrowDown")
    expect(document.activeElement).toBe(buttons[2])
    await act(async () => root.unmount())
  })

  it("keeps Back focused and operable while lookup is pending", async () => {
    const { actions, container, root } = await mountPrompt("loading")
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(document.activeElement?.getAttribute("data-focus-id")).toBe("video-resume-back")
    for (const key of ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]) await press(key)
    await press("Enter")
    expect(actions.back).toHaveBeenCalledTimes(1)
    expect(actions.resume).not.toHaveBeenCalled()
    expect(actions.start).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("offers playback and a reachable Back after a lookup failure without a resume action", async () => {
    const { actions, container, root } = await mountPrompt("error")
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector('[data-focus-id="video-resume-resume"]')).toBeNull()
    expect(document.activeElement?.getAttribute("data-focus-id")).toBe("video-resume-start")
    await press("Enter")
    await press("ArrowDown")
    expect(document.activeElement?.getAttribute("data-focus-id")).toBe("video-resume-back")
    await press("Enter")
    expect(actions.start).toHaveBeenCalledTimes(1)
    expect(actions.back).toHaveBeenCalledTimes(1)
    expect(actions.resume).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it.fails("D-cycle-10-2: allows focus to leave prompt via controller when mounted in Showcase", async () => {
    // Mount Showcase component which includes VideoResumePrompt with other controls
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<Showcase />))

    // Find the first VideoResumePrompt button (with focusPrefix="showcase-resume")
    const firstPromptButton = container.querySelector<HTMLElement>(
      '[data-focus-id="showcase-resume-resume"]',
    )
    expect(firstPromptButton).not.toBeNull()
    const firstPromptSection = firstPromptButton?.closest("section.video-resume")
    expect(firstPromptSection).not.toBeNull()

    // Focus the button to enter the prompt
    await act(async () => {
      firstPromptButton?.focus()
      firstPromptButton?.setAttribute("data-controller-focused", "true")
    })
    expect(document.activeElement).toBe(firstPromptButton)

    // Navigate down from the prompt using controller
    await press("ArrowDown")

    // Verify that focus moved to an element outside the first prompt
    const focusedElement = document.activeElement
    expect(focusedElement).not.toBeNull()
    const focusedParentPrompt = (focusedElement as HTMLElement)?.closest("section.video-resume")
    // The focused element should either not be in any prompt, or be in a different prompt
    if (focusedParentPrompt !== null) {
      // If still in a prompt section, verify it's NOT the first prompt
      expect(focusedParentPrompt).not.toBe(firstPromptSection)
    }

    await act(async () => root.unmount())
  })
})
