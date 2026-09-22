import type { VacuumStreamApi } from "../../../src/shared/contracts"
import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-19 account-first settings", () => {
  flowTest("F-cycle-19-1", async ({ controller, window }) => {
    expect(await window.evaluate(() => [globalThis.innerWidth, globalThis.innerHeight])).toEqual([
      1920, 1080,
    ])

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toBe("home-sign-in")
    await controller.press("Enter")

    const visited = await controller.trace([
      "ArrowRight",
      "ArrowDown",
      "ArrowDown",
      "ArrowUp",
      "ArrowUp",
      "ArrowLeft",
    ])
    await controller.shot("F-cycle-19-1-settings-graph")

    expect(visited).toEqual([
      "settings-sign-in",
      "settings-client-id",
      "settings-save",
      "settings-client-id",
      "settings-sign-in",
      "nav-settings",
    ])
  })
})

test.describe("cycle-19 compact account entry", () => {
  test.use({ windowSize: { height: 800, width: 700 } })

  flowTest("F-cycle-19-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")

    const visited = await controller.trace(["ArrowRight", "ArrowRight", "ArrowRight"])
    expect(visited).toEqual(["nav-following", "nav-search", "nav-settings"])

    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await expect(window.locator(".settings-panel h1")).toHaveText("Settings")
    expect(await window.locator(".settings-card h2").allTextContents()).toEqual([
      "Twitch account",
      "Twitch application",
    ])

    await controller.press("ArrowDown")
    expect(await controller.focusId()).toBe("settings-sign-in")
  })
})

test.describe("cycle-19 challenge arrival preserves the account control", () => {
  flowTest("F-cycle-19-3", async ({ app, controller, window }) => {
    // Main-process network calls (ky, used by TwitchAuth) never appear on the renderer's
    // Page network events, so the only way to count the outgoing device-authorization
    // request is to intercept globalThis.fetch inside the Electron main process itself.
    await app.evaluate(() => {
      const main = globalThis as unknown as {
        __deviceAuthRequests: string[]
        fetch: typeof fetch
      }
      const originalFetch = main.fetch
      main.__deviceAuthRequests = []
      main.fetch = ((...args: Parameters<typeof fetch>) => {
        const [input] = args
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes("oauth2/device")) main.__deviceAuthRequests.push(url)
        return originalFetch(...args)
      }) as typeof fetch
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")

    // Mark the exact DOM node before the transition: React reusing this node (rather than
    // unmounting and remounting a new element) is the only way this attribute survives.
    const marker = "F-cycle-19-3"
    await window
      .locator('[data-focus-id="settings-sign-in"]')
      .evaluate((element, value) => element.setAttribute("data-e2e-marker", value), marker)

    // Press Enter three times back to back: the first begins the request, and the pending
    // guard in SettingsPanel must make the next two no-ops while it is in flight.
    await controller.press("Enter")
    await controller.press("Enter")
    await controller.press("Enter")

    await controller.waitForFocus("settings-open-activation", 20_000)
    await expect(window.locator("[role=alert]")).toHaveCount(0)

    const deviceAuthRequests = await app.evaluate(
      () => (globalThis as unknown as { __deviceAuthRequests: string[] }).__deviceAuthRequests,
    )
    expect(deviceAuthRequests).toHaveLength(1)

    const activation = window.locator('[data-focus-id="settings-open-activation"]')
    expect(await activation.getAttribute("data-e2e-marker")).toBe(marker)
    expect(await controller.focusId()).toBe("settings-open-activation")
  })
})

test.describe("cycle-19 save keeps controller focus", () => {
  flowTest("F-cycle-19-4", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("settings-client-id")
    await controller.press("ArrowDown")
    await controller.waitForFocus("settings-save")

    // Install the focusout/MutationObserver probe before the Enter that activates Save, so
    // the pending window and completion are both covered, not just the states we happen to
    // sample afterwards.
    await window.evaluate(() => {
      const save = document.querySelector('[data-focus-id="settings-save"]')
      if (save === null) throw new Error("Missing settings-save")
      const state = { busyHistory: [save.hasAttribute("disabled")], leftSave: false }
      ;(window as unknown as { __saveFocusProbe: typeof state }).__saveFocusProbe = state
      document.addEventListener("focusout", (event) => {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          target.getAttribute("data-focus-id") === "settings-save"
        ) {
          state.leftSave = true
        }
      })
      new MutationObserver(() => {
        state.busyHistory.push(save.hasAttribute("disabled"))
      }).observe(save, { attributeFilter: ["disabled"], attributes: true })
    })

    await controller.press("Enter")
    await window.waitForFunction(
      () =>
        document.querySelector('[data-focus-id="settings-save"]')?.hasAttribute("disabled") ===
        false,
    )

    const probe = await window.evaluate(
      () =>
        (window as unknown as { __saveFocusProbe: { busyHistory: boolean[]; leftSave: boolean } })
          .__saveFocusProbe,
    )
    expect(probe.leftSave).toBe(false)
    expect(probe.busyHistory).toContain(true)
    expect(await controller.focusId()).toBe("settings-save")
  })
})

test.describe("cycle-19 device challenge expiry", () => {
  flowTest("F-cycle-19-6", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")

    const marker = "F-cycle-19-6"
    await window
      .locator('[data-focus-id="settings-sign-in"]')
      .evaluate((element, value) => element.setAttribute("data-e2e-marker", value), marker)

    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")
    const firstChallenge = await window.locator(".device-code strong").textContent()

    // The challenge has to expire on Twitch's own clock; wait exactly that long instead of a
    // guessed sleep. This row only runs at all behind E2E_RUN_BLOCKED, because idling for the
    // full device-code lifetime is not viable as part of the default suite.
    const snapshot = await window.evaluate(() =>
      (globalThis as unknown as { vacuumStream: VacuumStreamApi }).vacuumStream.auth.snapshot(),
    )
    if (snapshot.kind !== "authorizing")
      throw new Error(`Expected an authorizing challenge, got ${snapshot.kind}`)
    const remainingMs = Date.parse(snapshot.challenge.expiresAt) - Date.now()
    await controller.waitForFocus("settings-sign-in", Math.max(remainingMs, 0) + 30_000)
    expect(
      await window.locator('[data-focus-id="settings-sign-in"]').getAttribute("data-e2e-marker"),
    ).toBe(marker)

    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")
    const secondChallenge = await window.locator(".device-code strong").textContent()
    expect(secondChallenge).not.toBe(firstChallenge)
    expect(
      await window
        .locator('[data-focus-id="settings-open-activation"]')
        .getAttribute("data-e2e-marker"),
    ).toBe(marker)
    expect(await controller.focusId()).not.toBe("BODY")
  })
})

test.describe("cycle-19 approval and sign-out continuity", () => {
  flowTest("F-cycle-19-7", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")

    const marker = "F-cycle-19-7"
    await window
      .locator('[data-focus-id="settings-sign-in"]')
      .evaluate((element, value) => element.setAttribute("data-e2e-marker", value), marker)

    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")

    // The account owner approves the outstanding challenge on a separate device, out of band.
    await controller.waitForFocus("settings-logout", 5 * 60_000)
    expect(
      await window.locator('[data-focus-id="settings-logout"]').getAttribute("data-e2e-marker"),
    ).toBe(marker)

    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    expect(
      await window.locator('[data-focus-id="settings-sign-in"]').getAttribute("data-e2e-marker"),
    ).toBe(marker)
  })
})

test.describe("cycle-19 approval does not interrupt another screen", () => {
  flowTest("F-cycle-19-8", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("nav-search")
    await controller.press("Enter")
    await controller.waitForFocus("search-input")

    // The account owner approves the outstanding challenge on a separate device, out of band.
    await window.waitForFunction(
      async () =>
        (
          await (
            globalThis as unknown as { vacuumStream: VacuumStreamApi }
          ).vacuumStream.auth.snapshot()
        ).kind === "authenticated",
      undefined,
      { timeout: 5 * 60_000 },
    )

    expect(await window.locator(".search-view").count()).toBeGreaterThan(0)
    expect(await controller.focusId()).toBe("search-input")
  })
})

test.describe("cycle-19 request rejection and retry", () => {
  flowTest("F-cycle-19-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")

    const marker = "F-cycle-19-5"
    await window
      .locator('[data-focus-id="settings-sign-in"]')
      .evaluate((element, value) => element.setAttribute("data-e2e-marker", value), marker)

    // Device-authorization network access is blocked by the QA environment before this Enter.
    await controller.press("Enter")
    const error = window.locator("[role=alert]")
    await error.waitFor()
    expect((await error.textContent())?.trim()).not.toBe("")

    // Network access is restored externally, then the same control is retried.
    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")
    await expect(window.locator("[role=alert]")).toHaveCount(0)
    expect(
      await window
        .locator('[data-focus-id="settings-open-activation"]')
        .getAttribute("data-e2e-marker"),
    ).toBe(marker)
  })
})

test.describe("cycle-19 native controller account path", () => {
  flowTest("F-cycle-19-9", async ({ controller }) => {
    // Desktop CDP keyboard input cannot originate a real Gamepad event; this body exercises
    // the keyboard-equivalent journey that installGamepadBridge maps the D-pad and face
    // buttons onto (Right/A -> ArrowRight/Enter, Down/Up -> ArrowDown/ArrowUp, B -> Escape).
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")

    await controller.press("ArrowDown")
    await controller.waitForFocus("settings-client-id")
    await controller.press("ArrowUp")
    await controller.waitForFocus("settings-open-activation")

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    expect(await controller.focusId()).not.toBe("BODY")
  })
})
