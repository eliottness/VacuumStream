import { useEffect } from "react"

export const FOCUS_DIRECTIONS = ["down", "left", "right", "up"] as const
export type FocusDirection = (typeof FOCUS_DIRECTIONS)[number]

export type FocusCandidate = {
  readonly bottom: number
  readonly id: string
  readonly left: number
  readonly right: number
  readonly top: number
}

const assertNever = (value: never): never => {
  throw new TypeError(`Unhandled focus direction: ${String(value)}`)
}

const center = (start: number, end: number): number => start + (end - start) / 2

export const chooseNextFocus = (
  current: FocusCandidate | undefined,
  candidates: readonly FocusCandidate[],
  direction: FocusDirection,
): FocusCandidate | undefined => {
  if (current === undefined) {
    return candidates[0]
  }
  const currentX = center(current.left, current.right)
  const currentY = center(current.top, current.bottom)

  return candidates
    .filter((candidate) => {
      if (candidate.id === current.id) {
        return false
      }
      switch (direction) {
        case "down":
          return candidate.top >= current.bottom
        case "left":
          return candidate.right <= current.left
        case "right":
          return candidate.left >= current.right
        case "up":
          return candidate.bottom <= current.top
        default:
          return assertNever(direction)
      }
    })
    .map((candidate) => {
      const candidateX = center(candidate.left, candidate.right)
      const candidateY = center(candidate.top, candidate.bottom)
      const primary =
        direction === "left" || direction === "right"
          ? Math.abs(candidateX - currentX)
          : Math.abs(candidateY - currentY)
      const secondary =
        direction === "left" || direction === "right"
          ? Math.abs(candidateY - currentY)
          : Math.abs(candidateX - currentX)
      return { candidate, score: primary + secondary * 2 }
    })
    .sort((left, right) => left.score - right.score)[0]?.candidate
}

export const focusDirectionalOverride = (
  current: HTMLElement,
  direction: FocusDirection,
): HTMLElement | undefined => {
  const insideNavigation = current.closest(".navigation") !== null
  if (insideNavigation) {
    const horizontalNavigation = matchMedia("(width < 45rem)").matches
    if (
      (horizontalNavigation && (direction === "left" || direction === "right")) ||
      (!horizontalNavigation && (direction === "up" || direction === "down"))
    ) {
      return undefined
    }
  }
  const { focusDown, focusLeft, focusRight, focusUp } = current.dataset
  let targetId: string | undefined
  switch (direction) {
    case "down":
      targetId = focusDown
      break
    case "left":
      targetId = focusLeft
      break
    case "right":
      targetId = focusRight
      break
    case "up":
      targetId = focusUp
      break
    default:
      return assertNever(direction)
  }
  if (targetId === undefined) return undefined
  return [...document.querySelectorAll<HTMLElement>("[data-focus-id]")].find((element) => {
    const { focusId } = element.dataset
    return focusId === targetId
  })
}

export const markControllerFocus = (element: HTMLElement): void => {
  document
    .querySelector<HTMLElement>('[data-controller-focused="true"]')
    ?.removeAttribute("data-controller-focused")
  element.setAttribute("data-controller-focused", "true")
}

const moveFocusTo = (element: HTMLElement): void => {
  markControllerFocus(element)
  element.focus()
  element.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "nearest",
    inline: "nearest",
  })
}

const keyboardForGamepad = (gamepad: Gamepad): string | undefined => {
  if (gamepad.buttons[0]?.pressed === true) return "Enter"
  if (gamepad.buttons[1]?.pressed === true) return "Escape"
  if (gamepad.buttons[2]?.pressed === true || gamepad.buttons[3]?.pressed === true) return "/"
  if (gamepad.buttons[9]?.pressed === true) return "F10"
  if (gamepad.buttons[12]?.pressed === true || (gamepad.axes[1] ?? 0) < -0.55) return "ArrowUp"
  if (gamepad.buttons[13]?.pressed === true || (gamepad.axes[1] ?? 0) > 0.55) return "ArrowDown"
  if (gamepad.buttons[14]?.pressed === true || (gamepad.axes[0] ?? 0) < -0.55) return "ArrowLeft"
  if (gamepad.buttons[15]?.pressed === true || (gamepad.axes[0] ?? 0) > 0.55) return "ArrowRight"
  return undefined
}

export const dispatchControllerKey = (key: string): void => {
  const activeElement = document.activeElement
  if (key === "Enter" && activeElement instanceof HTMLElement) {
    activeElement.click()
    return
  }
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }))
}

export const shouldPreserveInputArrow = (
  inputHasFocus: boolean,
  eventIsTrusted: boolean,
  key: string,
): boolean => inputHasFocus && eventIsTrusted && (key === "ArrowLeft" || key === "ArrowRight")

export const shouldRepeatControllerKey = (key: string | undefined): boolean =>
  key?.startsWith("Arrow") === true

const installGamepadBridge = (): (() => void) => {
  let animationFrame = 0
  let activeKey: string | undefined
  let pressedAt = 0
  let repeatedAt = 0

  const poll = (now: number): void => {
    const gamepad = navigator.getGamepads().find((candidate) => candidate?.connected === true)
    const key = gamepad === undefined || gamepad === null ? undefined : keyboardForGamepad(gamepad)
    const changed = key !== activeKey
    const repeats =
      shouldRepeatControllerKey(key) &&
      now - pressedAt >= 500 &&
      (repeatedAt === 0 || now - repeatedAt >= 100)

    if (key !== undefined && (changed || repeats)) {
      dispatchControllerKey(key)
      if (changed) {
        pressedAt = now
        repeatedAt = 0
      } else {
        repeatedAt = now
      }
    }
    if (key === undefined) {
      pressedAt = 0
      repeatedAt = 0
    }
    activeKey = key
    animationFrame = requestAnimationFrame(poll)
  }

  animationFrame = requestAnimationFrame(poll)
  return () => cancelAnimationFrame(animationFrame)
}

export const useControllerNavigation = (): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const activeElement = document.activeElement
      if (
        shouldPreserveInputArrow(
          activeElement instanceof HTMLInputElement,
          event.isTrusted,
          event.key,
        )
      ) {
        return
      }
      if ((event.key === "Home" || event.key === "End") && activeElement instanceof HTMLElement) {
        const reel = activeElement.closest<HTMLElement>(".shelf__reel, .category-reel")
        const elements = reel?.querySelectorAll<HTMLElement>('[data-focusable="true"]')
        const destination =
          event.key === "Home" ? elements?.[0] : elements?.item((elements.length ?? 0) - 1)
        if (destination !== undefined && destination !== null) {
          event.preventDefault()
          destination.focus()
        }
        return
      }
      const directionByKey: Readonly<Record<string, FocusDirection | undefined>> = {
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
      }
      const direction = directionByKey[event.key]
      if (direction === undefined) return
      if (activeElement instanceof HTMLElement) {
        const override = focusDirectionalOverride(activeElement, direction)
        if (
          override !== undefined &&
          !override.hasAttribute("disabled") &&
          override.offsetParent !== null
        ) {
          event.preventDefault()
          moveFocusTo(override)
          return
        }
      }

      const elements = [
        ...document.querySelectorAll<HTMLElement>('[data-focusable="true"]'),
      ].filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null)
      const candidates = elements.map((element, index) => {
        const bounds = element.getBoundingClientRect()
        const { focusId } = element.dataset
        return {
          bottom: bounds.bottom,
          id: focusId ?? String(index),
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        }
      })
      const activeIndex =
        activeElement instanceof HTMLElement ? elements.indexOf(activeElement) : -1
      const current = activeIndex < 0 ? undefined : candidates[activeIndex]
      const next = chooseNextFocus(current, candidates, direction)
      const nextIndex =
        next === undefined ? -1 : candidates.findIndex((candidate) => candidate.id === next.id)
      const nextElement = nextIndex < 0 ? undefined : elements[nextIndex]
      if (nextElement !== undefined) {
        event.preventDefault()
        moveFocusTo(nextElement)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    const removeGamepadBridge = installGamepadBridge()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      removeGamepadBridge()
    }
  }, [])
}
