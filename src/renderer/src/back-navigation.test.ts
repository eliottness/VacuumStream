import { describe, expect, it } from "vitest"
import { shouldNavigateHomeOnBack } from "./useAppController"

describe("controller back navigation", () => {
  it("returns from Search to Home within the browse shell", () => {
    // Given the Search browse route is active
    const screen = { kind: "browse", route: "search" } as const

    // When the controller emits Back
    const navigatesHome = shouldNavigateHomeOnBack(screen)

    // Then the shell returns to Home instead of retaining a stale route
    expect(navigatesHome).toBe(true)
  })
})
