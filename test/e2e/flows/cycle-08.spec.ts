import { type Controller, expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const openQuickWatch = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("ArrowDown")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

const focusChat = async (controller: Controller): Promise<void> => {
  expect(await controller.travelTo("player-chat")).toBe(true)
  await controller.waitForFocus("player-chat")
}

test.describe("cycle-08 signed-out physical-keyboard consent", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-08-1", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
    await expect(window.locator('[data-focus-id="player-chat-enter"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    await window.keyboard.press("Tab")
    await window.keyboard.press("Shift+Tab")
    await window.keyboard.press("Enter")
    await expect(window.locator(".player-chat iframe")).toHaveCount(1)
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveAttribute(
      "aria-expanded",
      "true",
    )

    await window.keyboard.down("Escape")
    await window.keyboard.up("Escape")
    await controller.waitForFocus("player-chat")
    await window.keyboard.down("Escape")
    await window.keyboard.up("Escape")
    await controller.waitForFocus("nav-home")
  })
})

test.describe("cycle-08 explicit entry and toolbar graph", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-08-2", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.waitForFocus("player-chat")

    const toolbar = await controller.trace([
      "ArrowDown",
      "ArrowDown",
      "ArrowRight",
      "ArrowLeft",
      "ArrowLeft",
      "ArrowLeft",
    ])
    expect(toolbar).toEqual([
      "player-chat-enter",
      "player-chat-reload",
      "player-fullscreen",
      "player-chat-reload",
      "player-chat-enter",
      "player-chat",
    ])
    expect(await controller.focusId()).toBe("player-chat")

    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 5_000 }).toBe("IFRAME")
    await window.keyboard.press("Escape")
    await controller.waitForFocus("player-chat")
  })
})

test.describe("cycle-08 enter before first chat load", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-08-3", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
    await expect(window.locator('[data-focus-id="player-chat-enter"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })
})

test.describe("cycle-08 native-gamepad chat exit", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-08-4", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.press("ArrowDown")
    await controller.press("Enter")

    await window.keyboard.down("Escape")
    await window.keyboard.up("Escape")
    await controller.waitForFocus("player-chat")
    await window.keyboard.down("Escape")
    await window.keyboard.up("Escape")
    await controller.waitForFocus("nav-home")
  })
})

test.describe("cycle-08 reload and leave cleanup", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-08-5", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.waitForFocus("player-chat")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await expect.poll(() => controller.focusId(), { timeout: 10_000 }).toBe("IFRAME")
    await expect(window.locator('[data-focus-id="player-chat-enter"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(window.locator(".player-chat iframe")).toHaveAttribute("tabindex", "0")
    await window.keyboard.press("Escape")
    await controller.waitForFocus("player-chat")

    const toolbar = await controller.trace(["ArrowDown", "ArrowDown"])
    expect(toolbar).toEqual(["player-chat-enter", "player-chat-reload"])
    await controller.press("Enter")
    await expect(window.locator(".player-chat iframe")).toHaveCount(1)
    await controller.waitForFocus("player-chat-reload")
    expect(await controller.focusId()).not.toBe("IFRAME")

    await window.keyboard.press("Escape")
    await controller.waitForFocus("nav-home")
    await expect(window.locator(".player-view")).toHaveCount(0)
    expect(await controller.focusId()).not.toBe("BODY")
  })
})
