import { expect, test } from "../support/fixtures"
import { defectTest } from "../support/ledger-test"

const desktopWindow = { height: 1080, width: 1920 }
const configuredSettings = { settings: { clientId: "abcdefghijklmnopqrstuvwxyz1234" } }

test.describe("cycle-19 Settings defects", () => {
  test.use({ seed: configuredSettings, windowSize: desktopWindow })

  defectTest("D-cycle-19-1", async ({ app, controller, window }) => {
    await app.evaluate(({ ipcMain }) => {
      let saveCalls = 0
      ipcMain.removeHandler("settings:save-client-id")
      ipcMain.handle("settings:save-client-id", async () => {
        saveCalls += 1
        Reflect.set(globalThis, "cycle19SaveCalls", saveCalls)
        Reflect.set(globalThis, "cycle19SaveStarted", true)
        await new Promise<void>((resolve) => {
          Reflect.set(globalThis, "cycle19ReleaseSave", resolve)
        })
        return { clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false }
      })
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("settings-save")

    try {
      await controller.press("Enter")
      await expect
        .poll(() => app.evaluate(() => Reflect.get(globalThis, "cycle19SaveStarted") === true))
        .toBe(true)
      await controller.press("Enter")
      expect(await app.evaluate(() => Reflect.get(globalThis, "cycle19SaveCalls"))).toBe(1)
      const save = window.locator('[data-focus-id="settings-save"]')

      // The fixed behavior keeps the focused submit control in the controller graph while busy.
      await expect(save).not.toBeDisabled()
      await expect(save).toHaveAttribute("aria-disabled", "true")
      await expect(save).toHaveAttribute("aria-busy", "true")
      expect(await controller.focusId()).toBe("settings-save")
    } finally {
      await app.evaluate(() => {
        const release = Reflect.get(globalThis, "cycle19ReleaseSave")
        if (typeof release === "function") release()
      })
    }
  })

  defectTest("D-cycle-19-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("ArrowDown")
    await controller.waitForFocus("settings-client-id")

    const input = window.locator("#client-id")
    const typeQ = window.getByRole("button", { name: "Type q", exact: true })
    const backspace = window.getByRole("button", { name: "Backspace", exact: true })
    const clear = window.getByRole("button", { name: "Clear", exact: true })
    await expect(typeQ).toHaveCount(1)
    await expect(backspace).toHaveCount(1)
    await expect(clear).toHaveCount(1)

    const typeQId = await typeQ.getAttribute("data-focus-id")
    const backspaceId = await backspace.getAttribute("data-focus-id")
    const clearId = await clear.getAttribute("data-focus-id")
    if (typeQId === null || backspaceId === null || clearId === null) {
      throw new Error("Settings keyboard controls must expose controller focus ids")
    }

    await controller.press("ArrowDown")
    await controller.waitForFocus(typeQId)
    await controller.press("Enter")
    await controller.press("ArrowDown", 3)
    await controller.press("Enter")
    await expect(input).toHaveValue(/q4$/)

    await controller.press("ArrowDown")
    await controller.press("ArrowRight")
    await controller.waitForFocus(backspaceId)
    await controller.press("Enter")
    await expect(input).toHaveValue(/q$/)

    await controller.press("ArrowRight")
    await controller.waitForFocus(clearId)
    await controller.press("Enter")
    await expect(input).toHaveValue("")
  })

  defectTest("D-cycle-19-4", async ({ app, controller, window }) => {
    await app.evaluate(({ ipcMain }) => {
      const challenge = {
        expiresAt: "2099-01-01T00:00:00.000Z",
        flowId: "123e4567-e89b-12d3-a456-426614174000",
        intervalSeconds: 1,
        userCode: "ABCD-1234",
        verificationUri: "https://www.twitch.tv/activate",
      }
      let begun = false
      let approved = false
      ipcMain.removeHandler("auth:begin")
      ipcMain.removeHandler("auth:open-activation")
      ipcMain.removeHandler("auth:snapshot")
      ipcMain.handle("auth:begin", async () => {
        begun = true
        return challenge
      })
      ipcMain.handle("auth:open-activation", async () => {
        throw new Error("Browser unavailable")
      })
      ipcMain.handle("auth:snapshot", async () =>
        approved
          ? { displayName: "Fixture Viewer", kind: "authenticated", login: "fixture_viewer" }
          : begun
            ? { challenge, kind: "authorizing" }
            : { kind: "guest" },
      )
      Reflect.set(globalThis, "cycle19ApproveAuth", () => {
        approved = true
      })
    })

    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("Enter")
    await controller.waitForFocus("nav-settings")
    await controller.press("ArrowRight")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-open-activation")
    await controller.press("Enter")
    await expect(window.locator('[role="alert"]')).toContainText("Could not open a browser")
    await app.evaluate(() => {
      const approve = Reflect.get(globalThis, "cycle19ApproveAuth")
      if (typeof approve === "function") approve()
    })
    await expect(window.locator('[data-focus-id="settings-logout"]')).toHaveCount(1, {
      timeout: 10_000,
    })

    // The fixed behavior drops instructions that belong to the superseded authorizing flow.
    await expect(window.locator('[role="alert"]')).toHaveCount(0)
  })
})
