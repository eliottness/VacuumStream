import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ElectronApplication, Page } from "@playwright/test"
import { type Controller, expect, test } from "../support/fixtures"

const openQuickWatch = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("ArrowDown")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

const windowFullScreen = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() === true)

const expectStreamFullscreen = async (app: ElectronApplication, window: Page): Promise<void> => {
  await expect(window.locator(".player-view--fullscreen")).toHaveCount(1)
  await expect(window.locator(".player-toolbar")).toBeHidden()
  await expect.poll(() => windowFullScreen(app)).toBe(true)
  // The video, not the shell, fills the window once it has settled at its fullscreen size.
  await expect
    .poll(() =>
      window.locator(".player-frame").evaluate((frame) => {
        const rect = frame.getBoundingClientRect()
        return (
          rect.top === 0 &&
          rect.left === 0 &&
          rect.width === globalThis.innerWidth &&
          rect.height === globalThis.innerHeight
        )
      }),
    )
    .toBe(true)
}

const expectControls = async (
  app: ElectronApplication,
  window: Page,
  controller: Controller,
): Promise<void> => {
  await expect(window.locator(".player-view--fullscreen")).toHaveCount(0)
  await expect(window.locator(".player-toolbar")).toBeVisible()
  await controller.waitForFocus("player-fullscreen")
  await expect.poll(() => windowFullScreen(app)).toBe(false)
}

test.describe("stream fullscreen (issue #5)", () => {
  test.use({ seed: {}, windowSize: { height: 720, width: 1280 } })

  test("hides the player controls from the button and the F, H and T keys", async ({
    app,
    controller,
    window,
  }) => {
    await openQuickWatch(controller)
    await controller.shot("player-controls")
    await controller.press("ArrowLeft")
    await controller.waitForFocus("player-fullscreen")

    await controller.press("Enter")
    await expectStreamFullscreen(app, window)
    await controller.shot("stream-fullscreen")
    await controller.press("Escape")
    await expectControls(app, window, controller)

    await controller.press("ArrowRight")
    await controller.waitForFocus("player-back")
    await controller.press("h")
    await expectStreamFullscreen(app, window)
    await controller.press("f")
    await expectControls(app, window, controller)
    await controller.press("t")
    await expectStreamFullscreen(app, window)
    // Back reveals the controls first; only the next Back leaves the player.
    await controller.press("Escape")
    await expectControls(app, window, controller)
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
  })

  test("starts streams in fullscreen once Settings asks for it", async ({
    app,
    controller,
    profileDirectory,
    window,
  }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("F10")
    await controller.waitForFocus("nav-settings")
    const preference = window.locator('[data-focus-id="settings-start-fullscreen"]')
    await expect(preference).toHaveAttribute("aria-pressed", "false")
    expect(await controller.trace(["ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown"])).toEqual([
      "settings-sign-in",
      "settings-client-id",
      "settings-save",
      "settings-start-fullscreen",
    ])
    await controller.press("Enter")
    await expect(preference).toHaveAttribute("aria-pressed", "true")
    await controller.shot("settings-start-fullscreen")
    const saved = JSON.parse(await readFile(join(profileDirectory, "settings.json"), "utf8"))
    expect(saved).toMatchObject({ startStreamsFullscreen: true })

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await expectStreamFullscreen(app, window)
    await controller.shot("stream-started-fullscreen")
  })
})
