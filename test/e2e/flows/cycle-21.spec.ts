import { type Controller, expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const openQuickWatch = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("ArrowDown")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

const showChat = async (controller: Controller): Promise<void> => {
  const reached = await controller.travelTo("player-chat", "ArrowRight", 12)
  if (!reached) throw new Error("Could not reach the Show chat control")
  await controller.press("Enter")
}

test.describe("cycle-21 chat layout", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-21-4", async ({ app, controller, window }) => {
    const observeLayout = async (): Promise<{
      readonly chatFrames: number
      readonly playerFrames: number
      readonly playerHeight: number
      readonly playerWidth: number
    }> => {
      await window.waitForSelector("#twitch-player-root iframe")
      await window.waitForSelector(".player-chat iframe")
      return window.evaluate(() => {
        const player = document.querySelector(".player-frame")?.getBoundingClientRect()
        return {
          chatFrames: document.querySelectorAll(".player-chat iframe").length,
          playerFrames: document.querySelectorAll("#twitch-player-root iframe").length,
          playerHeight: player?.height ?? 0,
          playerWidth: player?.width ?? 0,
        }
      })
    }

    await openQuickWatch(controller)
    await showChat(controller)
    const narrow = await observeLayout()

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1920, 1080)
    })
    await window.waitForFunction(
      () => globalThis.innerWidth === 1920 && globalThis.innerHeight === 1080,
    )

    await openQuickWatch(controller)
    await showChat(controller)
    const wide = await observeLayout()

    for (const layout of [narrow, wide]) {
      expect(layout.chatFrames).toBe(1)
      expect(layout.playerFrames).toBe(1)
      expect(layout.playerWidth).toBeGreaterThanOrEqual(400)
      expect(layout.playerHeight).toBeGreaterThanOrEqual(300)
    }
  })
})

test.describe("cycle-21 initial chat entry", () => {
  test.use({ seed: {}, windowSize: { width: 1920, height: 1080 } })

  flowTest("F-cycle-21-1", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await showChat(controller)
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")

    await expect(window.locator("#player-chat-hint")).toBeVisible()
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
  })
})

test.describe("cycle-21 signed-out consent", () => {
  test.use({ seed: {}, windowSize: { width: 1920, height: 1080 } })

  flowTest("F-cycle-21-2", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await showChat(controller)
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
    await controller.press("ArrowDown", 6)
    await controller.press("Enter")

    const chat = window.frameLocator(".player-chat iframe")
    await expect(chat.getByText(/reject|rejeter/i)).toHaveCount(0)
    await expect(chat.locator("textarea, [contenteditable='true']").first()).toBeVisible()
  })
})

test.describe("cycle-21 chat exit", () => {
  test.use({ seed: {}, windowSize: { width: 1920, height: 1080 } })

  flowTest("F-cycle-21-3", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await showChat(controller)
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")

    await controller.press("Escape")
    await controller.waitForFocus("player-chat")
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
  })
})
